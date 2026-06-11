#!/usr/bin/env python3
"""
Healthcare Data Verification & Enrichment Script
Verifies and enriches hospital/doctor data using multiple sources
"""

import requests
import json
import time
import psycopg2
import os
from urllib.parse import quote
import re

# Configuration
DB_CONFIG = {
    'host': os.environ.get('POSTGRES_HOST', '127.0.0.1'),
    'database': os.environ.get('POSTGRES_DATABASE', 'mediczy_ai'),
    'user': os.environ.get('POSTGRES_USER', 'mediczy_helper'),
    'password': os.environ.get('POSTGRES_PASSWORD') or os.environ.get('DB_PASSWORD'),
}
if not DB_CONFIG['password']:
    raise RuntimeError('POSTGRES_PASSWORD or DB_PASSWORD is required')

# Google Custom Search API (you need to set up)
# Get API key: https://console.cloud.google.com/apis/credentials
# Get Search Engine ID: https://programmablesearchengine.google.com/
GOOGLE_API_KEY = None  # Set your API key
GOOGLE_CX = None  # Set your Custom Search Engine ID

class HealthcareVerifier:
    def __init__(self):
        self.conn = psycopg2.connect(**DB_CONFIG)
        self.cur = self.conn.cursor()
        
    def verify_via_google_search(self, query):
        """Search Google for verification"""
        if not GOOGLE_API_KEY or not GOOGLE_CX:
            return None
            
        url = f"https://www.googleapis.com/customsearch/v1"
        params = {
            'key': GOOGLE_API_KEY,
            'cx': GOOGLE_CX,
            'q': query,
            'num': 5
        }
        
        try:
            response = requests.get(url, params=params, timeout=10)
            if response.status_code == 200:
                return response.json()
        except Exception as e:
            print(f"Google search error: {e}")
        return None
    
    def verify_via_nmc(self, doctor_name, registration_number=None):
        """
        Verify doctor via NMC Indian Medical Register
        Note: NMC doesn't have a public API, but you can scrape or use their search
        """
        # NMC search URL pattern
        search_url = f"https://www.nmc.org.in/information-desk/indian-medical-register/"
        
        # For actual implementation, you'd need to:
        # 1. Use Selenium/Playwright to interact with the search form
        # 2. Or use requests with proper session handling
        
        return {
            'source': 'NMC',
            'url': search_url,
            'note': 'Manual verification required or use Selenium'
        }
    
    def verify_via_nabh(self, hospital_name, city):
        """Check if hospital is NABH accredited"""
        # NABH accreditation check
        search_url = f"https://www.nabh.co/frmViewAccreditedHosp.aspx"
        
        return {
            'source': 'NABH',
            'url': search_url,
            'note': 'Check accreditation status'
        }
    
    def enrich_from_google_places(self, name, address, api_key):
        """Get enriched data from Google Places API"""
        if not api_key:
            return None
            
        # Text search
        url = "https://maps.googleapis.com/maps/api/place/textsearch/json"
        params = {
            'query': f"{name} {address} India",
            'key': api_key
        }
        
        try:
            response = requests.get(url, params=params, timeout=10)
            if response.status_code == 200:
                data = response.json()
                if data.get('results'):
                    place = data['results'][0]
                    return {
                        'name': place.get('name'),
                        'address': place.get('formatted_address'),
                        'latitude': place['geometry']['location']['lat'],
                        'longitude': place['geometry']['location']['lng'],
                        'rating': place.get('rating'),
                        'total_ratings': place.get('user_ratings_total'),
                        'place_id': place.get('place_id'),
                        'types': place.get('types', []),
                        'verified': True
                    }
        except Exception as e:
            print(f"Google Places error: {e}")
        return None
    
    def scrape_practo_doctor(self, doctor_name, city):
        """
        Scrape doctor info from Practo
        Note: Requires proper handling of their anti-scraping measures
        """
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        
        # Practo search URL
        search_name = doctor_name.lower().replace(' ', '-').replace('dr.', '').replace('dr', '').strip()
        city_lower = city.lower()
        
        # Example: https://www.practo.com/chennai/doctor/dr-name
        search_url = f"https://www.practo.com/{city_lower}/doctors"
        
        return {
            'source': 'Practo',
            'search_url': search_url,
            'note': 'Use Selenium for actual scraping'
        }
    
    def scrape_justdial(self, business_name, city):
        """
        Scrape from JustDial for phone verification
        """
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        
        search_url = f"https://www.justdial.com/{city}/{quote(business_name)}"
        
        return {
            'source': 'JustDial',
            'search_url': search_url,
            'note': 'Use Selenium - JustDial has anti-scraping'
        }
    
    def verify_hospital_batch(self, limit=10):
        """Verify a batch of hospitals"""
        self.cur.execute("""
            SELECT id, hospital_name, address, city, state, phone_number 
            FROM hospitals 
            WHERE metadata->>'verified' IS NULL OR metadata->>'verified' = 'false'
            LIMIT %s
        """, (limit,))
        
        hospitals = self.cur.fetchall()
        results = []
        
        for h in hospitals:
            h_id, name, address, city, state, phone = h
            
            # Try Google Places verification
            verification = {
                'hospital_id': h_id,
                'name': name,
                'sources_checked': []
            }
            
            # Add verification sources
            verification['sources_checked'].append(
                self.verify_via_nabh(name, city)
            )
            
            if city:
                verification['sources_checked'].append(
                    self.scrape_justdial(name, city)
                )
            
            results.append(verification)
            time.sleep(0.5)  # Rate limiting
        
        return results
    
    def verify_doctor_batch(self, limit=10):
        """Verify a batch of doctors"""
        self.cur.execute("""
            SELECT id, "firstName", "lastName", "registrationNumber", "phoneNumber"
            FROM doctors 
            WHERE metadata->>'verified' IS NULL OR metadata->>'verified' = 'false'
            LIMIT %s
        """, (limit,))
        
        doctors = self.cur.fetchall()
        results = []
        
        for d in doctors:
            d_id, first, last, reg_num, phone = d
            full_name = f"Dr. {first} {last}".strip()
            
            verification = {
                'doctor_id': d_id,
                'name': full_name,
                'sources_checked': []
            }
            
            # NMC verification
            verification['sources_checked'].append(
                self.verify_via_nmc(full_name, reg_num)
            )
            
            results.append(verification)
            time.sleep(0.5)
        
        return results
    
    def update_verification_status(self, table, record_id, verified, source_data):
        """Update verification status in database"""
        metadata = json.dumps({
            'verified': verified,
            'verification_source': source_data.get('source'),
            'verification_date': time.strftime('%Y-%m-%d'),
            'verification_data': source_data
        })
        
        if table == 'hospitals':
            self.cur.execute("""
                UPDATE hospitals 
                SET metadata = COALESCE(metadata, '{}'::jsonb) || %s::jsonb
                WHERE id = %s
            """, (metadata, record_id))
        elif table == 'doctors':
            self.cur.execute("""
                UPDATE doctors 
                SET metadata = COALESCE(metadata, '{}'::jsonb) || %s::jsonb
                WHERE id = %s
            """, (metadata, record_id))
        
        self.conn.commit()
    
    def close(self):
        self.cur.close()
        self.conn.close()


def get_verification_summary():
    """Get current verification status summary"""
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()
    
    print("=== VERIFICATION STATUS ===\n")
    
    # Hospitals
    cur.execute("SELECT COUNT(*) FROM hospitals")
    total_h = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM hospitals WHERE metadata->>'verified' = 'true'")
    verified_h = cur.fetchone()[0]
    print(f"Hospitals: {verified_h}/{total_h} verified")
    
    # Doctors
    cur.execute("SELECT COUNT(*) FROM doctors")
    total_d = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM doctors WHERE metadata->>'verified' = 'true'")
    verified_d = cur.fetchone()[0]
    print(f"Doctors: {verified_d}/{total_d} verified")
    
    # Labs
    cur.execute("SELECT COUNT(*) FROM labs")
    total_l = cur.fetchone()[0]
    print(f"Labs: 0/{total_l} verified")
    
    # Clinics
    cur.execute("SELECT COUNT(*) FROM provider_clinics")
    total_c = cur.fetchone()[0]
    print(f"Clinics: 0/{total_c} verified")
    
    cur.close()
    conn.close()


if __name__ == "__main__":
    print("""
╔═══════════════════════════════════════════════════════════════╗
║         Healthcare Data Verification & Enrichment             ║
╠═══════════════════════════════════════════════════════════════╣
║  Options:                                                      ║
║  1. Check verification status                                  ║
║  2. Verify hospitals (requires API keys)                       ║
║  3. Verify doctors (requires API keys)                         ║
║  4. Export unverified data for manual verification             ║
╚═══════════════════════════════════════════════════════════════╝
    """)
    
    get_verification_summary()
    
    print("""
╔═══════════════════════════════════════════════════════════════╗
║                   RECOMMENDED APPROACH                         ║
╠═══════════════════════════════════════════════════════════════╣
║                                                                ║
║  1. SET UP GOOGLE PLACES API ($200 free credit/month)         ║
║     - Best for: Coordinates, ratings, phone verification      ║
║     - Cost: ~$17/1000 requests                                 ║
║                                                                ║
║  2. USE SELENIUM FOR WEB SCRAPING                              ║
║     - Practo: Doctor profiles, reviews                         ║
║     - JustDial: Phone verification, business hours             ║
║     - Google Maps: Manual search for coordinates               ║
║                                                                ║
║  3. GOVERNMENT DATABASES (FREE, MOST AUTHORITATIVE)            ║
║     - NMC: Doctor registration verification                    ║
║     - NABH: Hospital accreditation                             ║
║     - NABL: Lab accreditation                                  ║
║                                                                ║
║  4. CROWDSOURCE VERIFICATION                                   ║
║     - Add "Report incorrect info" in your app                  ║
║     - Let users verify their own profiles                      ║
║                                                                ║
╚═══════════════════════════════════════════════════════════════╝
    """)
