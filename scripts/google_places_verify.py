#!/usr/bin/env python3
"""
Google Places API Verification Script
Verifies and enriches hospital data using Google Places API
"""

import requests
import json
import time
import psycopg2
import os

# Required runtime configuration. Do not commit API keys or DB passwords.
GOOGLE_API_KEY = os.environ.get('GOOGLE_MAPS_API_KEY')
if not GOOGLE_API_KEY:
    raise RuntimeError('GOOGLE_MAPS_API_KEY is required')

DB_CONFIG = {
    'host': os.environ.get('POSTGRES_HOST', '127.0.0.1'),
    'database': os.environ.get('POSTGRES_DATABASE', 'mediczy_ai'),
    'user': os.environ.get('POSTGRES_USER', 'mediczy_helper'),
    'password': os.environ.get('POSTGRES_PASSWORD') or os.environ.get('DB_PASSWORD'),
}
if not DB_CONFIG['password']:
    raise RuntimeError('POSTGRES_PASSWORD or DB_PASSWORD is required')

def search_google_places(name, city, state):
    """Search for a place using Google Places Text Search API"""
    url = "https://maps.googleapis.com/maps/api/place/textsearch/json"
    
    query = f"{name} hospital {city} {state} India"
    params = {
        'query': query,
        'key': GOOGLE_API_KEY,
        'type': 'hospital'
    }
    
    try:
        response = requests.get(url, params=params, timeout=10)
        if response.status_code == 200:
            data = response.json()
            if data.get('status') == 'OK' and data.get('results'):
                place = data['results'][0]
                return {
                    'found': True,
                    'google_name': place.get('name'),
                    'google_address': place.get('formatted_address'),
                    'latitude': place['geometry']['location']['lat'],
                    'longitude': place['geometry']['location']['lng'],
                    'rating': place.get('rating'),
                    'total_reviews': place.get('user_ratings_total', 0),
                    'place_id': place.get('place_id'),
                    'business_status': place.get('business_status'),
                    'types': place.get('types', [])
                }
            elif data.get('status') == 'REQUEST_DENIED':
                print(f"API Error: {data.get('error_message')}")
                return {'found': False, 'error': data.get('error_message')}
    except Exception as e:
        print(f"Error: {e}")
    
    return {'found': False}

def get_place_details(place_id):
    """Get detailed info using Place Details API"""
    url = "https://maps.googleapis.com/maps/api/place/details/json"
    
    params = {
        'place_id': place_id,
        'key': GOOGLE_API_KEY,
        'fields': 'name,formatted_address,formatted_phone_number,international_phone_number,website,opening_hours,rating,reviews,url'
    }
    
    try:
        response = requests.get(url, params=params, timeout=10)
        if response.status_code == 200:
            data = response.json()
            if data.get('status') == 'OK':
                result = data.get('result', {})
                return {
                    'phone': result.get('formatted_phone_number'),
                    'international_phone': result.get('international_phone_number'),
                    'website': result.get('website'),
                    'google_maps_url': result.get('url'),
                    'opening_hours': result.get('opening_hours', {}).get('weekday_text', []),
                    'reviews': result.get('reviews', [])[:3]  # Top 3 reviews
                }
    except Exception as e:
        print(f"Details error: {e}")
    
    return {}

def verify_hospitals(limit=50, skip_verified=True):
    """Verify hospitals using Google Places API"""
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()
    
    # Get hospitals to verify
    if skip_verified:
        cur.execute("""
            SELECT id, hospital_name, address, city, state 
            FROM hospitals 
            WHERE (metadata IS NULL OR metadata->>'google_verified' IS NULL)
            AND city IS NOT NULL
            LIMIT %s
        """, (limit,))
    else:
        cur.execute("""
            SELECT id, hospital_name, address, city, state 
            FROM hospitals 
            WHERE city IS NOT NULL
            LIMIT %s
        """, (limit,))
    
    hospitals = cur.fetchall()
    print(f"Verifying {len(hospitals)} hospitals...")
    
    verified = 0
    not_found = 0
    errors = 0
    
    for h_id, name, address, city, state in hospitals:
        print(f"\nChecking: {name} ({city})")
        
        # Search Google Places
        result = search_google_places(name, city, state or '')
        
        if result.get('error'):
            print(f"  ❌ API Error - stopping")
            errors += 1
            break
        
        if result.get('found'):
            # Get more details if we have a place_id
            details = {}
            if result.get('place_id'):
                details = get_place_details(result['place_id'])
                time.sleep(0.1)  # Rate limiting
            
            # Update database
            metadata = {
                'google_verified': True,
                'google_place_id': result.get('place_id'),
                'google_name': result.get('google_name'),
                'google_address': result.get('google_address'),
                'google_rating': result.get('rating'),
                'google_reviews_count': result.get('total_reviews'),
                'google_phone': details.get('phone'),
                'google_website': details.get('website'),
                'google_maps_url': details.get('google_maps_url'),
                'verification_date': time.strftime('%Y-%m-%d')
            }
            
            # Update coordinates if better precision
            lat = result.get('latitude')
            lng = result.get('longitude')
            
            cur.execute("""
                UPDATE hospitals 
                SET 
                    metadata = COALESCE(metadata, '{}'::jsonb) || %s::jsonb,
                    latitude = COALESCE(latitude, %s),
                    longitude = COALESCE(longitude, %s)
                WHERE id = %s
            """, (json.dumps(metadata), lat, lng, h_id))
            
            conn.commit()
            
            print(f"  ✅ Found: {result.get('google_name')}")
            print(f"     Rating: {result.get('rating')} ({result.get('total_reviews')} reviews)")
            if details.get('phone'):
                print(f"     Phone: {details.get('phone')}")
            verified += 1
        else:
            # Mark as not found in Google
            cur.execute("""
                UPDATE hospitals 
                SET metadata = COALESCE(metadata, '{}'::jsonb) || %s::jsonb
                WHERE id = %s
            """, (json.dumps({'google_verified': False, 'google_search_date': time.strftime('%Y-%m-%d')}), h_id))
            conn.commit()
            
            print(f"  ⚠️ Not found in Google Places")
            not_found += 1
        
        time.sleep(0.2)  # Rate limiting (5 req/sec max)
    
    cur.close()
    conn.close()
    
    print(f"\n=== SUMMARY ===")
    print(f"Verified: {verified}")
    print(f"Not found: {not_found}")
    print(f"Errors: {errors}")
    
    return verified, not_found, errors

def check_api_status():
    """Check if Google Places API is working"""
    print("Testing Google Places API...")
    
    result = search_google_places("Apollo Hospital", "Chennai", "Tamil Nadu")
    
    if result.get('error'):
        print(f"❌ API Error: {result.get('error')}")
        print("\nTo fix:")
        print("1. Go to: https://console.cloud.google.com/apis/library/places-backend.googleapis.com")
        print("2. Enable 'Places API'")
        print("3. Make sure billing is enabled")
        return False
    elif result.get('found'):
        print(f"✅ API Working!")
        print(f"   Found: {result.get('google_name')}")
        print(f"   Rating: {result.get('rating')}")
        return True
    else:
        print("⚠️ API working but no results for test query")
        return True

if __name__ == "__main__":
    print("""
╔═══════════════════════════════════════════════════════════════╗
║       Google Places API - Hospital Verification               ║
╚═══════════════════════════════════════════════════════════════╝
    """)
    
    # First check API status
    if check_api_status():
        print("\n" + "="*60)
        response = input("\nStart verification? (y/n): ").strip().lower()
        if response == 'y':
            limit = input("How many hospitals to verify? (default 50): ").strip()
            limit = int(limit) if limit.isdigit() else 50
            verify_hospitals(limit=limit)
    else:
        print("\nPlease enable the Places API first.")
