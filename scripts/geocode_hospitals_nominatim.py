#!/usr/bin/env python3
"""
Geocode hospitals using Nominatim (OpenStreetMap) - Free geocoding service
"""
import psycopg2
import os
import requests
import time
import urllib.parse

# Nominatim API (free, but requires rate limiting)
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"

def geocode_address(address, attempt=1):
    """Geocode an address using Nominatim API"""
    headers = {
        'User-Agent': 'Mediczy-Hospital-Geocoder/1.0 (contact@mediczy.com)'
    }
    params = {
        'q': address,
        'format': 'json',
        'limit': 1,
        'countrycodes': 'in'  # Restrict to India
    }
    
    try:
        response = requests.get(NOMINATIM_URL, params=params, headers=headers, timeout=10)
        data = response.json()
        
        if data and len(data) > 0:
            return float(data[0]['lat']), float(data[0]['lon'])
        return None, None
    except Exception as e:
        if attempt < 3:
            time.sleep(2)
            return geocode_address(address, attempt + 1)
        print(f"  Error: {e}")
        return None, None

def clean_address(address):
    """Clean address string"""
    if not address:
        return ""
    # Remove common noise
    address = address.replace("None", "").strip()
    return address

def main():
    db_password = os.environ.get('POSTGRES_PASSWORD') or os.environ.get('DB_PASSWORD')
    if not db_password:
        raise RuntimeError('POSTGRES_PASSWORD or DB_PASSWORD is required')

    conn = psycopg2.connect(
        host=os.environ.get('POSTGRES_HOST', '127.0.0.1'),
        database=os.environ.get('POSTGRES_DATABASE', 'mediczy_ai'),
        user=os.environ.get('POSTGRES_USER', 'mediczy_helper'),
        password=db_password
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
    print("Using Nominatim (OpenStreetMap) - Free geocoding")
    print("Rate limit: 1 request per second")
    print("=" * 60)
    
    geocoded = 0
    failed = 0
    
    for i, (h_id, name, address, city, state, pincode) in enumerate(hospitals):
        # Clean values
        name = clean_address(name)
        address = clean_address(address)
        city = clean_address(city)
        state = clean_address(state)
        pincode = clean_address(str(pincode)) if pincode else ""
        
        # Build search queries - try different combinations
        queries = []
        
        # Most specific first
        if name and city and state:
            queries.append(f"{name}, {city}, {state}, India")
        if address and city and state and pincode:
            queries.append(f"{address}, {city}, {state} {pincode}, India")
        if city and state:
            queries.append(f"{city}, {state}, India")
        if pincode:
            queries.append(f"{pincode}, India")
        
        lat, lng = None, None
        
        for query in queries:
            if not query.strip() or query.count(',') < 2:
                continue
            
            lat, lng = geocode_address(query)
            if lat and lng:
                # Verify it's in India (rough bounds)
                if 6 < lat < 38 and 68 < lng < 98:
                    break
                else:
                    lat, lng = None, None
            
            # Nominatim rate limit: 1 request/second
            time.sleep(1.1)
        
        if lat and lng:
            cur.execute(
                "UPDATE hospitals SET latitude = %s, longitude = %s WHERE id = %s",
                (lat, lng, h_id)
            )
            geocoded += 1
            print(f"[{i+1}/{len(hospitals)}] ✓ {name[:35]:<35} | {city[:15]:<15} | ({lat:.4f}, {lng:.4f})")
        else:
            failed += 1
            print(f"[{i+1}/{len(hospitals)}] ✗ {name[:35]:<35} | {city[:15]:<15} | FAILED")
        
        # Commit every 25 records
        if (i + 1) % 25 == 0:
            conn.commit()
            print(f"\n--- Progress: {geocoded} geocoded, {failed} failed ({100*(i+1)//len(hospitals)}%) ---\n")
    
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
