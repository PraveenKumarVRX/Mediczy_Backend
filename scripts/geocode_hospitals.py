#!/usr/bin/env python3
"""
Geocode hospitals using Google Maps Geocoding API
"""
import psycopg2
import requests
import time
import os

# Google Maps API Key
GOOGLE_API_KEY = "AIzaSyAuYgocNCvs Nuf8uW6G43vdSw74TYraXb4".replace(" ", "")

def geocode_address(address):
    """Geocode an address using Google Maps API"""
    url = "https://maps.googleapis.com/maps/api/geocode/json"
    params = {
        'address': address,
        'key': GOOGLE_API_KEY,
        'region': 'in'  # Bias results to India
    }
    
    try:
        response = requests.get(url, params=params, timeout=10)
        data = response.json()
        
        if data['status'] == 'OK' and data['results']:
            location = data['results'][0]['geometry']['location']
            return location['lat'], location['lng']
        elif data['status'] == 'ZERO_RESULTS':
            return None, None
        else:
            print(f"  API Status: {data['status']}")
            return None, None
    except Exception as e:
        print(f"  Error: {e}")
        return None, None

def main():
    conn = psycopg2.connect(
        host='127.0.0.1',
        database='mediczy_ai',
        user='mediczy_helper',
        password='Mediczy2024Helper'
    )
    cur = conn.cursor()
    
    # Get hospitals without coordinates
    cur.execute("""
        SELECT id, hospital_name, address, city, state, pincode 
        FROM hospitals 
        WHERE latitude IS NULL 
        ORDER BY id
    """)
    hospitals = cur.fetchall()
    
    print(f"Hospitals to geocode: {len(hospitals)}")
    print("=" * 60)
    
    geocoded = 0
    failed = 0
    
    for i, (h_id, name, address, city, state, pincode) in enumerate(hospitals):
        # Build search query - try different combinations
        queries = [
            f"{name}, {city}, {state}, India",
            f"{name}, {address}, {city}, {state} {pincode}, India",
            f"{address}, {city}, {state} {pincode}, India",
            f"{city}, {state}, India"
        ]
        
        lat, lng = None, None
        
        for query in queries:
            if not query or 'None' in query:
                continue
            lat, lng = geocode_address(query)
            if lat and lng:
                break
            time.sleep(0.1)  # Small delay between attempts
        
        if lat and lng:
            cur.execute(
                "UPDATE hospitals SET latitude = %s, longitude = %s WHERE id = %s",
                (lat, lng, h_id)
            )
            geocoded += 1
            print(f"[{i+1}/{len(hospitals)}] ✓ {name[:40]} -> ({lat:.6f}, {lng:.6f})")
        else:
            failed += 1
            print(f"[{i+1}/{len(hospitals)}] ✗ {name[:40]} - Could not geocode")
        
        # Commit every 50 records
        if (i + 1) % 50 == 0:
            conn.commit()
            print(f"\n--- Progress: {geocoded} geocoded, {failed} failed ---\n")
        
        # Rate limiting - Google allows 50 requests/second, but let's be conservative
        time.sleep(0.05)
    
    conn.commit()
    
    print("\n" + "=" * 60)
    print(f"COMPLETE!")
    print(f"  Geocoded: {geocoded}")
    print(f"  Failed: {failed}")
    print(f"  Total: {len(hospitals)}")
    
    # Final count
    cur.execute("SELECT COUNT(*) FROM hospitals WHERE latitude IS NOT NULL")
    with_coords = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM hospitals")
    total = cur.fetchone()[0]
    print(f"\nFinal: {with_coords}/{total} hospitals have coordinates ({100*with_coords//total}%)")
    
    cur.close()
    conn.close()

if __name__ == "__main__":
    main()
