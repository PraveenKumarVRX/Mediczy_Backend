#!/usr/bin/env python3
"""
Option 2: Web Scraping for Healthcare Data Verification
Scrapes Practo, JustDial, and Google Maps for verification
"""

import requests
from bs4 import BeautifulSoup
import json
import time
import re
import psycopg2
from urllib.parse import quote, urljoin
import random

# Database config
DB_CONFIG = {
    'host': '127.0.0.1',
    'database': 'mediczy_ai',
    'user': 'mediczy_helper',
    'password': 'Mediczy2024Helper'
}

# User agents to rotate
USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
]

def get_headers():
    return {
        'User-Agent': random.choice(USER_AGENTS),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
    }

class PractoScraper:
    """Scrape doctor/hospital data from Practo"""
    
    BASE_URL = "https://www.practo.com"
    
    def search_doctor(self, name, city):
        """Search for a doctor on Practo"""
        city_slug = city.lower().replace(' ', '-')
        search_name = name.lower().replace('dr.', '').replace('dr', '').strip()
        search_name = re.sub(r'[^a-z\s]', '', search_name).replace(' ', '-')
        
        # Try direct search URL
        search_url = f"{self.BASE_URL}/{city_slug}/doctors"
        
        try:
            params = {'q': name}
            response = requests.get(search_url, headers=get_headers(), params=params, timeout=15)
            
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'lxml')
                
                # Find doctor cards
                doctor_cards = soup.find_all('div', {'data-qa-id': 'doctor_card'})
                
                results = []
                for card in doctor_cards[:5]:  # Top 5 results
                    try:
                        name_elem = card.find('h2', {'data-qa-id': 'doctor_name'})
                        spec_elem = card.find('span', {'data-qa-id': 'doctor_specialisation'})
                        exp_elem = card.find('span', {'data-qa-id': 'doctor_experience'})
                        fee_elem = card.find('span', {'data-qa-id': 'consultation_fee'})
                        rating_elem = card.find('span', {'data-qa-id': 'doctor_rating'})
                        
                        profile_link = card.find('a', href=True)
                        
                        results.append({
                            'name': name_elem.text.strip() if name_elem else None,
                            'specialization': spec_elem.text.strip() if spec_elem else None,
                            'experience': exp_elem.text.strip() if exp_elem else None,
                            'fee': fee_elem.text.strip() if fee_elem else None,
                            'rating': rating_elem.text.strip() if rating_elem else None,
                            'profile_url': urljoin(self.BASE_URL, profile_link['href']) if profile_link else None,
                            'source': 'practo'
                        })
                    except Exception as e:
                        continue
                
                return results
            
        except Exception as e:
            print(f"Practo search error: {e}")
        
        return []
    
    def search_hospital(self, name, city):
        """Search for a hospital on Practo"""
        city_slug = city.lower().replace(' ', '-')
        search_url = f"{self.BASE_URL}/{city_slug}/hospitals"
        
        try:
            params = {'q': name}
            response = requests.get(search_url, headers=get_headers(), params=params, timeout=15)
            
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'lxml')
                
                # Find hospital cards
                hospital_cards = soup.find_all('div', class_=re.compile('hospital.*card', re.I))
                
                results = []
                for card in hospital_cards[:5]:
                    try:
                        name_elem = card.find(['h2', 'h3'], class_=re.compile('name', re.I))
                        addr_elem = card.find('p', class_=re.compile('address', re.I))
                        
                        results.append({
                            'name': name_elem.text.strip() if name_elem else None,
                            'address': addr_elem.text.strip() if addr_elem else None,
                            'source': 'practo'
                        })
                    except:
                        continue
                
                return results
                
        except Exception as e:
            print(f"Practo hospital search error: {e}")
        
        return []


class JustDialScraper:
    """Scrape business data from JustDial"""
    
    BASE_URL = "https://www.justdial.com"
    
    def search_business(self, name, city, category='hospitals'):
        """Search JustDial for a business"""
        city_slug = city.lower().replace(' ', '-')
        search_term = quote(name)
        
        search_url = f"{self.BASE_URL}/{city_slug}/{search_term}"
        
        try:
            response = requests.get(search_url, headers=get_headers(), timeout=15)
            
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'lxml')
                
                # JustDial obfuscates phone numbers - need Selenium for actual scraping
                # This returns basic info only
                
                results = []
                listings = soup.find_all('li', class_=re.compile('cntanr'))
                
                for listing in listings[:5]:
                    try:
                        name_elem = listing.find('span', class_='lng_cont_name')
                        addr_elem = listing.find('span', class_='cont_sw_addr')
                        rating_elem = listing.find('span', class_=re.compile('rating'))
                        
                        results.append({
                            'name': name_elem.text.strip() if name_elem else None,
                            'address': addr_elem.text.strip() if addr_elem else None,
                            'rating': rating_elem.text.strip() if rating_elem else None,
                            'source': 'justdial',
                            'note': 'Phone numbers require Selenium due to obfuscation'
                        })
                    except:
                        continue
                
                return results
                
        except Exception as e:
            print(f"JustDial search error: {e}")
        
        return []


class GoogleMapsScraper:
    """Scrape Google Maps (without API) using search"""
    
    def search_place(self, name, city, state=''):
        """
        Search Google Maps - returns search URL for manual verification
        Note: Actual scraping requires Selenium due to JavaScript rendering
        """
        query = quote(f"{name} {city} {state} India")
        
        return {
            'search_url': f"https://www.google.com/maps/search/{query}",
            'embed_url': f"https://www.google.com/maps/embed/v1/search?q={query}",
            'note': 'Use Selenium for automated extraction'
        }


def scrape_and_verify_hospitals(limit=10):
    """Scrape multiple sources to verify hospitals"""
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()
    
    # Get unverified hospitals
    cur.execute("""
        SELECT id, hospital_name, city, state 
        FROM hospitals 
        WHERE city IS NOT NULL 
        AND (metadata IS NULL OR metadata->>'web_verified' IS NULL)
        LIMIT %s
    """, (limit,))
    
    hospitals = cur.fetchall()
    print(f"Checking {len(hospitals)} hospitals...")
    
    practo = PractoScraper()
    justdial = JustDialScraper()
    gmaps = GoogleMapsScraper()
    
    verified = 0
    
    for h_id, name, city, state in hospitals:
        print(f"\n{'='*50}")
        print(f"Hospital: {name} ({city})")
        
        verification_data = {
            'web_verified': False,
            'verification_date': time.strftime('%Y-%m-%d'),
            'sources': []
        }
        
        # 1. Check Practo
        print("  Checking Practo...")
        practo_results = practo.search_hospital(name, city)
        if practo_results:
            verification_data['sources'].append({
                'source': 'practo',
                'found': True,
                'results': practo_results[:2]
            })
            print(f"    ✅ Found {len(practo_results)} results")
        else:
            print(f"    ❌ Not found")
        
        time.sleep(random.uniform(1, 2))  # Rate limiting
        
        # 2. Check JustDial
        print("  Checking JustDial...")
        jd_results = justdial.search_business(name, city)
        if jd_results:
            verification_data['sources'].append({
                'source': 'justdial',
                'found': True,
                'results': jd_results[:2]
            })
            print(f"    ✅ Found {len(jd_results)} results")
        else:
            print(f"    ❌ Not found")
        
        time.sleep(random.uniform(1, 2))
        
        # 3. Generate Google Maps link
        gmaps_data = gmaps.search_place(name, city, state or '')
        verification_data['sources'].append({
            'source': 'google_maps',
            'search_url': gmaps_data['search_url']
        })
        
        # Mark as web verified if found in at least one source
        if any(s.get('found') for s in verification_data['sources']):
            verification_data['web_verified'] = True
            verified += 1
        
        # Update database
        cur.execute("""
            UPDATE hospitals 
            SET metadata = COALESCE(metadata, '{}'::jsonb) || %s::jsonb
            WHERE id = %s
        """, (json.dumps(verification_data), h_id))
        conn.commit()
    
    cur.close()
    conn.close()
    
    print(f"\n{'='*50}")
    print(f"SUMMARY: {verified}/{len(hospitals)} hospitals verified via web scraping")
    
    return verified


def scrape_and_verify_doctors(limit=10):
    """Scrape to verify doctors"""
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()
    
    # Get unverified doctors with city info
    cur.execute("""
        SELECT id, "firstName", "lastName", specialization, "clinicAddress"
        FROM doctors 
        WHERE (metadata IS NULL OR metadata->>'web_verified' IS NULL)
        LIMIT %s
    """, (limit,))
    
    doctors = cur.fetchall()
    print(f"Checking {len(doctors)} doctors...")
    
    practo = PractoScraper()
    verified = 0
    
    for d_id, first, last, spec, address in doctors:
        full_name = f"Dr. {first} {last}".strip()
        
        # Try to extract city from address
        city = 'Chennai'  # Default - ideally extract from address
        if address:
            # Common city patterns
            cities = ['Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Hyderabad', 'Kolkata', 'Pune']
            for c in cities:
                if c.lower() in address.lower():
                    city = c
                    break
        
        print(f"\n{'='*50}")
        print(f"Doctor: {full_name} ({city})")
        
        verification_data = {
            'web_verified': False,
            'verification_date': time.strftime('%Y-%m-%d'),
            'sources': []
        }
        
        # Check Practo
        print("  Checking Practo...")
        practo_results = practo.search_doctor(full_name, city)
        if practo_results:
            verification_data['sources'].append({
                'source': 'practo',
                'found': True,
                'results': practo_results[:2]
            })
            verification_data['web_verified'] = True
            verified += 1
            print(f"    ✅ Found {len(practo_results)} results")
        else:
            print(f"    ❌ Not found")
        
        time.sleep(random.uniform(2, 3))  # Rate limiting
        
        # Update database
        cur.execute("""
            UPDATE doctors 
            SET metadata = COALESCE(metadata, '{}'::jsonb) || %s::jsonb
            WHERE id = %s
        """, (json.dumps(verification_data), d_id))
        conn.commit()
    
    cur.close()
    conn.close()
    
    print(f"\n{'='*50}")
    print(f"SUMMARY: {verified}/{len(doctors)} doctors verified via web scraping")
    
    return verified


if __name__ == "__main__":
    print("""
╔═══════════════════════════════════════════════════════════════╗
║     OPTION 2: Web Scraping Verification                       ║
║     Sources: Practo, JustDial, Google Maps                    ║
╚═══════════════════════════════════════════════════════════════╝
    """)
    
    print("1. Verify Hospitals")
    print("2. Verify Doctors")
    print("3. Both")
    
    choice = input("\nChoice (1/2/3): ").strip()
    limit = input("How many records to check? (default 10): ").strip()
    limit = int(limit) if limit.isdigit() else 10
    
    if choice == '1':
        scrape_and_verify_hospitals(limit)
    elif choice == '2':
        scrape_and_verify_doctors(limit)
    elif choice == '3':
        scrape_and_verify_hospitals(limit)
        scrape_and_verify_doctors(limit)
    else:
        print("Running hospital verification...")
        scrape_and_verify_hospitals(limit)
