#!/usr/bin/env python3
"""
Option 3: Government Database Verification
- NMC (National Medical Commission) for Doctor Registration
- NABH (National Accreditation Board for Hospitals)
- NABL (National Accreditation Board for Labs)
"""

import requests
from bs4 import BeautifulSoup
import json
import time
import re
import psycopg2
from urllib.parse import quote
import random

# Database config
DB_CONFIG = {
    'host': '127.0.0.1',
    'database': 'mediczy_ai',
    'user': 'mediczy_helper',
    'password': 'Mediczy2024Helper'
}

USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
]

def get_headers():
    return {
        'User-Agent': random.choice(USER_AGENTS),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
    }


class NMCVerifier:
    """
    National Medical Commission (NMC) Doctor Verification
    Website: https://www.nmc.org.in/information-desk/indian-medical-register/
    """
    
    BASE_URL = "https://www.nmc.org.in"
    SEARCH_URL = "https://www.nmc.org.in/information-desk/indian-medical-register/"
    
    def __init__(self):
        self.session = requests.Session()
    
    def search_doctor(self, name=None, registration_number=None, state=None):
        """
        Search NMC Indian Medical Register
        
        Returns dict with verification status and data
        """
        result = {
            'verified': False,
            'source': 'NMC Indian Medical Register',
            'source_url': self.SEARCH_URL,
            'search_params': {
                'name': name,
                'registration_number': registration_number,
                'state': state
            },
            'message': '',
            'data': None
        }
        
        # NMC website requires captcha and session handling
        # For production, use Selenium or official API if available
        
        try:
            # Try to access the search page
            response = self.session.get(self.SEARCH_URL, headers=get_headers(), timeout=15)
            
            if response.status_code == 200:
                result['message'] = 'NMC register accessible. Manual verification required due to captcha.'
                result['manual_search_url'] = self.SEARCH_URL
                
                # If registration number provided, generate direct search hint
                if registration_number:
                    result['search_hint'] = f"Search with registration number: {registration_number}"
            else:
                result['message'] = f"NMC website returned status {response.status_code}"
                
        except Exception as e:
            result['message'] = f"Error accessing NMC: {str(e)}"
        
        return result
    
    def get_state_medical_councils(self):
        """Return list of state medical council websites for verification"""
        return {
            'Tamil Nadu': 'https://tnmc.org.in',
            'Karnataka': 'https://kmc.karnataka.gov.in',
            'Maharashtra': 'https://mciregistration.nic.in',
            'Delhi': 'https://dmc.delhi.gov.in',
            'Kerala': 'https://tmc.kerala.gov.in',
            'Gujarat': 'https://gmcgujarat.org',
            'Andhra Pradesh': 'https://apmc.ap.gov.in',
            'Telangana': 'https://tsmc.telangana.gov.in',
            'West Bengal': 'https://wbmc.org',
            'Rajasthan': 'https://rajmc.rajasthan.gov.in',
        }


class NABHVerifier:
    """
    National Accreditation Board for Hospitals & Healthcare Providers
    Website: https://www.nabh.co/
    """
    
    SEARCH_URL = "https://www.nabh.co/HospitalSearchPage.aspx"
    ACCREDITED_URL = "https://www.nabh.co/AccreditedHospitals.aspx"
    
    def search_hospital(self, name, city=None, state=None):
        """
        Search NABH accredited hospitals
        """
        result = {
            'verified': False,
            'accredited': False,
            'source': 'NABH',
            'source_url': self.ACCREDITED_URL,
            'search_params': {
                'name': name,
                'city': city,
                'state': state
            },
            'message': '',
            'data': None
        }
        
        try:
            # Get the search page
            response = requests.get(self.ACCREDITED_URL, headers=get_headers(), timeout=15)
            
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'lxml')
                
                # Look for hospital in the list
                hospital_entries = soup.find_all('tr')
                
                name_lower = name.lower()
                matches = []
                
                for entry in hospital_entries:
                    cells = entry.find_all('td')
                    if len(cells) >= 3:
                        entry_name = cells[1].text.strip() if len(cells) > 1 else ''
                        entry_city = cells[2].text.strip() if len(cells) > 2 else ''
                        
                        # Fuzzy match
                        if name_lower in entry_name.lower() or entry_name.lower() in name_lower:
                            matches.append({
                                'name': entry_name,
                                'city': entry_city,
                                'accredited': True
                            })
                
                if matches:
                    result['verified'] = True
                    result['accredited'] = True
                    result['data'] = matches[:3]
                    result['message'] = f"Found {len(matches)} NABH accredited match(es)"
                else:
                    result['message'] = "Hospital not found in NABH accredited list (may still be valid)"
                    result['manual_search_url'] = self.SEARCH_URL
                    
            else:
                result['message'] = f"NABH website returned status {response.status_code}"
                
        except Exception as e:
            result['message'] = f"Error accessing NABH: {str(e)}"
            result['manual_search_url'] = self.SEARCH_URL
        
        return result
    
    def get_accreditation_types(self):
        """NABH accreditation programs"""
        return {
            'NABH': 'Full Accreditation for Hospitals',
            'NABH_Entry': 'Entry Level Certification for Hospitals',
            'NABH_SHCO': 'Small Healthcare Organizations',
            'NABH_AYUSH': 'AYUSH Hospitals',
            'NABH_Eye': 'Eye Care Organizations',
            'NABH_Blood': 'Blood Banks/Blood Storage Centers',
            'NABH_Dental': 'Dental Healthcare Service Providers',
        }


class NABLVerifier:
    """
    National Accreditation Board for Testing and Calibration Laboratories
    Website: https://www.nabl-india.org/
    Verifies: Medical Labs
    """
    
    SEARCH_URL = "https://www.nabl-india.org/nabl/index.php?c=search&m=search_lab"
    
    def search_lab(self, name, city=None):
        """
        Search NABL accredited laboratories
        """
        result = {
            'verified': False,
            'accredited': False,
            'source': 'NABL',
            'source_url': self.SEARCH_URL,
            'search_params': {
                'name': name,
                'city': city
            },
            'message': '',
            'data': None
        }
        
        try:
            # NABL has a search form - need to POST
            search_data = {
                'laboratory_name': name,
                'city': city or '',
                'submit': 'Search'
            }
            
            response = requests.post(
                self.SEARCH_URL, 
                data=search_data, 
                headers=get_headers(), 
                timeout=15
            )
            
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'lxml')
                
                # Look for result table
                results_table = soup.find('table', class_=re.compile('result|list', re.I))
                
                if results_table:
                    rows = results_table.find_all('tr')[1:]  # Skip header
                    matches = []
                    
                    for row in rows[:5]:
                        cells = row.find_all('td')
                        if len(cells) >= 3:
                            matches.append({
                                'lab_name': cells[0].text.strip() if cells else '',
                                'certificate_no': cells[1].text.strip() if len(cells) > 1 else '',
                                'city': cells[2].text.strip() if len(cells) > 2 else '',
                            })
                    
                    if matches:
                        result['verified'] = True
                        result['accredited'] = True
                        result['data'] = matches
                        result['message'] = f"Found {len(matches)} NABL accredited lab(s)"
                    else:
                        result['message'] = "Lab not found in NABL database"
                else:
                    result['message'] = "Could not parse NABL results"
                    result['manual_search_url'] = self.SEARCH_URL
            else:
                result['message'] = f"NABL website returned status {response.status_code}"
                
        except Exception as e:
            result['message'] = f"Error accessing NABL: {str(e)}"
            result['manual_search_url'] = self.SEARCH_URL
        
        return result


def verify_doctors_nmc(limit=10):
    """Verify doctors using NMC database"""
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()
    
    # Get doctors that need verification
    cur.execute("""
        SELECT id, "firstName", "lastName", "registrationNumber", license, "clinicAddress"
        FROM doctors 
        WHERE (metadata IS NULL OR metadata->>'nmc_verified' IS NULL)
        LIMIT %s
    """, (limit,))
    
    doctors = cur.fetchall()
    print(f"\n{'='*60}")
    print(f"NMC VERIFICATION: Checking {len(doctors)} doctors")
    print('='*60)
    
    nmc = NMCVerifier()
    state_councils = nmc.get_state_medical_councils()
    
    verified_count = 0
    
    for d_id, first, last, reg_num, license_num, address in doctors:
        full_name = f"Dr. {first} {last}".strip()
        
        print(f"\nDoctor: {full_name}")
        print(f"  Registration: {reg_num or license_num or 'Not provided'}")
        
        verification_data = {
            'nmc_verified': False,
            'nmc_check_date': time.strftime('%Y-%m-%d'),
            'nmc_data': None
        }
        
        # Check NMC
        result = nmc.search_doctor(
            name=full_name,
            registration_number=reg_num or license_num
        )
        
        verification_data['nmc_data'] = result
        
        if result.get('verified'):
            verification_data['nmc_verified'] = True
            verified_count += 1
            print(f"  ✅ NMC: {result['message']}")
        else:
            print(f"  ⚠️ NMC: {result['message']}")
            print(f"     Manual verification: {result.get('manual_search_url', 'N/A')}")
        
        # Add state medical council info
        if address:
            for state, url in state_councils.items():
                if state.lower() in address.lower():
                    verification_data['state_council'] = {
                        'state': state,
                        'verification_url': url
                    }
                    print(f"     State Council: {state} - {url}")
                    break
        
        # Update database
        cur.execute("""
            UPDATE doctors 
            SET metadata = COALESCE(metadata, '{}'::jsonb) || %s::jsonb
            WHERE id = %s
        """, (json.dumps(verification_data), d_id))
        conn.commit()
        
        time.sleep(1)  # Rate limiting
    
    cur.close()
    conn.close()
    
    print(f"\n{'='*60}")
    print(f"NMC SUMMARY: {verified_count}/{len(doctors)} verified")
    return verified_count


def verify_hospitals_nabh(limit=10):
    """Verify hospitals using NABH accreditation database"""
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()
    
    cur.execute("""
        SELECT id, hospital_name, city, state
        FROM hospitals 
        WHERE (metadata IS NULL OR metadata->>'nabh_checked' IS NULL)
        LIMIT %s
    """, (limit,))
    
    hospitals = cur.fetchall()
    print(f"\n{'='*60}")
    print(f"NABH VERIFICATION: Checking {len(hospitals)} hospitals")
    print('='*60)
    
    nabh = NABHVerifier()
    accredited_count = 0
    
    for h_id, name, city, state in hospitals:
        print(f"\nHospital: {name}")
        print(f"  Location: {city}, {state}")
        
        verification_data = {
            'nabh_checked': True,
            'nabh_check_date': time.strftime('%Y-%m-%d'),
            'nabh_accredited': False,
            'nabh_data': None
        }
        
        result = nabh.search_hospital(name, city, state)
        verification_data['nabh_data'] = result
        
        if result.get('accredited'):
            verification_data['nabh_accredited'] = True
            accredited_count += 1
            print(f"  ✅ NABH Accredited: {result['message']}")
        else:
            print(f"  ℹ️ Not in NABH list: {result['message']}")
        
        # Update database
        cur.execute("""
            UPDATE hospitals 
            SET metadata = COALESCE(metadata, '{}'::jsonb) || %s::jsonb
            WHERE id = %s
        """, (json.dumps(verification_data), h_id))
        conn.commit()
        
        time.sleep(1)
    
    cur.close()
    conn.close()
    
    print(f"\n{'='*60}")
    print(f"NABH SUMMARY: {accredited_count}/{len(hospitals)} NABH accredited")
    return accredited_count


def verify_labs_nabl(limit=10):
    """Verify labs using NABL accreditation database"""
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()
    
    cur.execute("""
        SELECT id, name, city
        FROM labs 
        WHERE (metadata IS NULL OR metadata->>'nabl_checked' IS NULL)
        LIMIT %s
    """, (limit,))
    
    labs = cur.fetchall()
    print(f"\n{'='*60}")
    print(f"NABL VERIFICATION: Checking {len(labs)} labs")
    print('='*60)
    
    nabl = NABLVerifier()
    accredited_count = 0
    
    for l_id, name, city in labs:
        print(f"\nLab: {name}")
        print(f"  City: {city}")
        
        verification_data = {
            'nabl_checked': True,
            'nabl_check_date': time.strftime('%Y-%m-%d'),
            'nabl_accredited': False,
            'nabl_data': None
        }
        
        result = nabl.search_lab(name, city)
        verification_data['nabl_data'] = result
        
        if result.get('accredited'):
            verification_data['nabl_accredited'] = True
            accredited_count += 1
            print(f"  ✅ NABL Accredited: {result['message']}")
        else:
            print(f"  ℹ️ Not in NABL list: {result['message']}")
        
        # Update database
        cur.execute("""
            UPDATE labs 
            SET metadata = COALESCE(metadata, '{}'::jsonb) || %s::jsonb
            WHERE id = %s
        """, (json.dumps(verification_data), l_id))
        conn.commit()
        
        time.sleep(1)
    
    cur.close()
    conn.close()
    
    print(f"\n{'='*60}")
    print(f"NABL SUMMARY: {accredited_count}/{len(labs)} NABL accredited")
    return accredited_count


def print_verification_urls():
    """Print all government verification URLs for reference"""
    print("""
╔═══════════════════════════════════════════════════════════════════════╗
║                    GOVERNMENT VERIFICATION URLs                        ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                        ║
║  📋 DOCTOR VERIFICATION:                                               ║
║     NMC Indian Medical Register:                                       ║
║     https://www.nmc.org.in/information-desk/indian-medical-register/  ║
║                                                                        ║
║  🏥 HOSPITAL VERIFICATION:                                             ║
║     NABH Accredited Hospitals:                                         ║
║     https://www.nabh.co/AccreditedHospitals.aspx                      ║
║     https://www.nabh.co/HospitalSearchPage.aspx                       ║
║                                                                        ║
║  🔬 LAB VERIFICATION:                                                  ║
║     NABL Accredited Labs:                                              ║
║     https://www.nabl-india.org/nabl/index.php?c=search&m=search_lab   ║
║                                                                        ║
║  🏛️ STATE MEDICAL COUNCILS:                                            ║
║     Tamil Nadu: https://tnmc.org.in                                    ║
║     Karnataka: https://kmc.karnataka.gov.in                           ║
║     Maharashtra: https://mciregistration.nic.in                       ║
║     Delhi: https://dmc.delhi.gov.in                                   ║
║     Kerala: https://tmc.kerala.gov.in                                 ║
║     Gujarat: https://gmcgujarat.org                                   ║
║     Andhra Pradesh: https://apmc.ap.gov.in                            ║
║     Telangana: https://tsmc.telangana.gov.in                          ║
║                                                                        ║
╚═══════════════════════════════════════════════════════════════════════╝
    """)


if __name__ == "__main__":
    print("""
╔═══════════════════════════════════════════════════════════════╗
║     OPTION 3: Government Database Verification                ║
║     Sources: NMC, NABH, NABL                                  ║
╚═══════════════════════════════════════════════════════════════╝
    """)
    
    print("1. Verify Doctors (NMC)")
    print("2. Verify Hospitals (NABH)")
    print("3. Verify Labs (NABL)")
    print("4. All verifications")
    print("5. Show verification URLs only")
    
    choice = input("\nChoice (1-5): ").strip()
    
    if choice == '5':
        print_verification_urls()
    else:
        limit = input("How many records to check? (default 10): ").strip()
        limit = int(limit) if limit.isdigit() else 10
        
        if choice == '1':
            verify_doctors_nmc(limit)
        elif choice == '2':
            verify_hospitals_nabh(limit)
        elif choice == '3':
            verify_labs_nabl(limit)
        elif choice == '4':
            verify_doctors_nmc(limit)
            verify_hospitals_nabh(limit)
            verify_labs_nabl(limit)
        else:
            print_verification_urls()
