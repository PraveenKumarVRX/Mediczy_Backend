#!/usr/bin/env python3
"""
Master Data Processor for Mediczy
Processes Excel files from /server/db/Master Data and imports into PostgreSQL
Matches the actual database schema (JSONB for address in labs, etc.)
"""

import pandas as pd
import psycopg2
from psycopg2.extras import Json
import os
import re
from datetime import datetime
import json
import hashlib

# Database connection
DB_CONFIG = {
    'host': os.environ.get('POSTGRES_HOST', '127.0.0.1'),
    'database': os.environ.get('POSTGRES_DATABASE', 'mediczy_ai'),
    'user': os.environ.get('POSTGRES_USER', 'mediczy_helper'),
    'password': os.environ.get('POSTGRES_PASSWORD') or os.environ.get('DB_PASSWORD'),
}
if not DB_CONFIG['password']:
    raise RuntimeError('POSTGRES_PASSWORD or DB_PASSWORD is required')

BASE_PATH = '/home/ubuntu/Mediczy/server/db/Master Data'

def get_connection():
    return psycopg2.connect(**DB_CONFIG)

def normalize_string(s):
    """Normalize string for consistency"""
    if pd.isna(s) or s is None:
        return None
    s = str(s).strip()
    return ' '.join(word.capitalize() for word in s.split())

def normalize_city(city):
    """Normalize city names"""
    if pd.isna(city) or city is None:
        return None
    city = str(city).strip().upper()
    
    CITY_MAP = {
        'BANGALORE': 'Bengaluru', 'BOMBAY': 'Mumbai', 'MADRAS': 'Chennai',
        'CALCUTTA': 'Kolkata', 'POONA': 'Pune', 'TRIVANDRUM': 'Thiruvananthapuram',
        'COCHIN': 'Kochi', 'BARODA': 'Vadodara', 'VIZAG': 'Visakhapatnam',
        'PONDICHERRY': 'Puducherry'
    }
    return CITY_MAP.get(city, city.title())

def normalize_state(state):
    """Normalize state names"""
    if pd.isna(state) or state is None:
        return None
    state = str(state).strip().upper()
    
    STATE_MAP = {
        'TAMILNADU': 'Tamil Nadu', 'TAMIL NADU': 'Tamil Nadu',
        'MAHARASTRA': 'Maharashtra', 'MAHARASHTRA': 'Maharashtra',
        'KARNATAKA': 'Karnataka', 'ANDHRA PRADESH': 'Andhra Pradesh',
        'TELANGANA': 'Telangana', 'KERALA': 'Kerala',
        'DELHI': 'Delhi', 'NEW DELHI': 'Delhi',
        'UTTAR PRADESH': 'Uttar Pradesh', 'RAJASTHAN': 'Rajasthan',
        'GUJARAT': 'Gujarat', 'WEST BENGAL': 'West Bengal',
        'PUNJAB': 'Punjab', 'HARYANA': 'Haryana',
        'MADHYA PRADESH': 'Madhya Pradesh', 'BIHAR': 'Bihar',
        'ODISHA': 'Odisha', 'ORISSA': 'Odisha',
        'JHARKHAND': 'Jharkhand', 'CHHATTISGARH': 'Chhattisgarh',
        'ASSAM': 'Assam', 'GOA': 'Goa',
        'HIMACHAL PRADESH': 'Himachal Pradesh', 'UTTARAKHAND': 'Uttarakhand',
    }
    return STATE_MAP.get(state, state.title())

def clean_phone(phone):
    """Clean phone number"""
    if pd.isna(phone) or phone is None:
        return None
    phone = str(phone).strip()
    phone = re.sub(r'[^\d+]', '', phone)
    if len(phone) >= 10:
        return phone[-10:]
    return None

def clean_email(email):
    """Clean and validate email"""
    if pd.isna(email) or email is None:
        return None
    email = str(email).strip().lower()
    if '@' in email and '.' in email:
        return email
    return None

def clean_pincode(pincode):
    """Clean pincode"""
    if pd.isna(pincode) or pincode is None:
        return None
    pincode = str(pincode).replace('.0', '').strip()
    if pincode.isdigit() and len(pincode) == 6:
        return pincode
    return None

def generate_password_hash(name):
    """Generate a simple password hash for new accounts"""
    return hashlib.sha256(f"{name}@mediczy2024".encode()).hexdigest()

def process_labs():
    """Process labs from labs list.xlsx - Uses JSONB address format"""
    print("\n" + "="*60)
    print("PROCESSING LABS")
    print("="*60)
    
    filepath = f'{BASE_PATH}/Labs/labs list.xlsx'
    df = pd.read_excel(filepath)
    print(f"Loaded {len(df)} lab records from Excel")
    
    conn = get_connection()
    cur = conn.cursor()
    
    # Check existing labs
    cur.execute("SELECT name, address->>'city' as city FROM labs")
    rows = cur.fetchall()
    existing = set()
    for row in rows:
        name = str(row[0]).lower() if row[0] else ''
        city = str(row[1]).lower() if row[1] else ''
        existing.add((name, city))
    print(f"Existing labs in DB: {len(existing)}")
    
    inserted = 0
    skipped = 0
    errors = 0
    
    # Group by lab name to create parent labs
    lab_groups = df.groupby('entity_name')
    
    for lab_name, group in lab_groups:
        lab_name = normalize_string(lab_name)
        if not lab_name:
            continue
        
        for _, row in group.iterrows():
            city = normalize_city(row.get('city'))
            key = (lab_name.lower(), (city or '').lower())
            
            if key in existing:
                skipped += 1
                continue
            
            state = normalize_state(row.get('state'))
            pincode = clean_pincode(row.get('pincode'))
            street = str(row.get('entity_address', '') or '').strip()
            lat = row.get('Latitude') if not pd.isna(row.get('Latitude')) else None
            lng = row.get('Longitude') if not pd.isna(row.get('Longitude')) else None
            
            # Build JSONB address
            address = {
                'street': street,
                'city': city,
                'state': state,
                'pincode': pincode
            }
            if lat and lng:
                address['coordinates'] = {'lat': float(lat), 'lng': float(lng)}
            
            # Generate unique email for lab
            lab_email = f"{lab_name.lower().replace(' ', '_')}_{city.lower() if city else 'india'}@lab.mediczy.com"
            phone = '9999999999'
            
            try:
                cur.execute("""
                    INSERT INTO labs (name, email, password, "phoneNumber", address, 
                                     services, "testCatalog", status, "isVerified",
                                     "createdAt", "updatedAt")
                    VALUES (%s, %s, %s, %s, %s, %s, %s, 'active', true, NOW(), NOW())
                    ON CONFLICT (email) DO NOTHING
                """, (
                    lab_name,
                    lab_email,
                    generate_password_hash(lab_name),
                    phone,
                    Json(address),
                    Json(['blood-test', 'pathology', 'diagnostic']),
                    Json({'categories': ['general', 'specialty']})
                ))
                if cur.rowcount > 0:
                    inserted += 1
                    existing.add(key)
                else:
                    skipped += 1
                conn.commit()
            except Exception as e:
                conn.rollback()
                errors += 1
                if errors <= 3:
                    print(f"Error inserting lab {lab_name}: {e}")
    
    cur.close()
    conn.close()
    
    print(f"Labs: Inserted {inserted}, Skipped {skipped}, Errors {errors}")
    return inserted

def process_hospitals():
    """Process hospitals from Hospital list.xlsx and SmartHealth"""
    print("\n" + "="*60)
    print("PROCESSING HOSPITALS")
    print("="*60)
    
    conn = get_connection()
    cur = conn.cursor()
    
    # Check existing - hospital uses hospital_name column
    cur.execute("SELECT hospital_name FROM hospitals")
    existing_hospitals = set(str(row[0]).lower() for row in cur.fetchall() if row[0])
    print(f"Existing hospitals: {len(existing_hospitals)}")
    
    hospitals_inserted = 0
    errors = 0
    
    # Process main hospital list
    filepath = f'{BASE_PATH}/Hospitals Data/Hospital list.xlsx'
    df = pd.read_excel(filepath)
    print(f"Loaded {len(df)} records from Hospital list.xlsx")
    
    # Process each row directly instead of grouping
    for _, row in df.iterrows():
        hospital_name = normalize_string(row.get('Entity Name'))
        if not hospital_name or hospital_name.lower() in existing_hospitals:
            continue
        
        city = normalize_city(row.get('City/Location'))
        state = normalize_state(row.get('State'))
        address = str(row.get('Address', '') or '').strip()[:500]
        phone = clean_phone(row.get('Telephone') or row.get('Mobile'))
        email = clean_email(str(row.get('Email', '')).split(';')[0] if row.get('Email') else None)
        
        # Generate email if missing
        if not email:
            email = f"{hospital_name.lower().replace(' ', '_').replace('.', '')}@hospital.mediczy.com"
        
        try:
            cur.execute("""
                INSERT INTO hospitals (hospital_name, address, city, state, pincode, 
                                      phone_number, email, password, status, is_verified,
                                      created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'active', true, NOW(), NOW())
            """, (
                hospital_name, address, city, state,
                clean_pincode(row.get('Pincode')),
                phone, email, generate_password_hash(hospital_name)
            ))
            hospitals_inserted += 1
            existing_hospitals.add(hospital_name.lower())
            conn.commit()
        except Exception as e:
            conn.rollback()
            errors += 1
            if errors <= 5:
                print(f"Error: {str(e)[:100]}")
    
    # Process SmartHealth hospitals
    filepath = f'{BASE_PATH}/Hospitals Data/SmartHealth Hospital master list.xlsx'
    df = pd.read_excel(filepath)
    print(f"Loaded {len(df)} records from SmartHealth")
    
    for _, row in df.iterrows():
        name = normalize_string(row.get('Name'))
        if not name or name.lower() in existing_hospitals:
            continue
        
        city = normalize_city(row.get('City'))
        email = f"{name.lower().replace(' ', '_').replace('.', '')}@hospital.mediczy.com"
        
        try:
            cur.execute("""
                INSERT INTO hospitals (hospital_name, address, city, state, pincode, 
                                      phone_number, email, password, status, is_verified,
                                      created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'active', true, NOW(), NOW())
            """, (
                name,
                str(row.get('Address', '') or '').strip()[:500],
                city,
                normalize_state(row.get('State')),
                clean_pincode(row.get('Pincode')),
                clean_phone(row.get('Phone')),
                email,
                generate_password_hash(name)
            ))
            hospitals_inserted += 1
            existing_hospitals.add(name.lower())
            conn.commit()
        except Exception as e:
            conn.rollback()
            errors += 1
    
    cur.close()
    conn.close()
    
    print(f"Hospitals: Inserted {hospitals_inserted}, Errors {errors}")
    return hospitals_inserted

def process_doctors():
    """Process doctors from Excel files"""
    print("\n" + "="*60)
    print("PROCESSING DOCTORS")
    print("="*60)
    
    conn = get_connection()
    cur = conn.cursor()
    
    # Check existing doctors - correct column names
    cur.execute('SELECT email, "phoneNumber" FROM doctors')
    rows = cur.fetchall()
    existing_emails = set()
    existing_phones = set()
    for row in rows:
        if row[0]: existing_emails.add(str(row[0]).lower())
        if row[1]: existing_phones.add(str(row[1]))
    print(f"Existing doctors: {len(existing_emails)} by email, {len(existing_phones)} by phone")
    
    inserted = 0
    errors = 0
    
    # Process main doctors list
    filepath = f'{BASE_PATH}/Doctors Data/Doctors List 624.xlsx'
    df = pd.read_excel(filepath)
    print(f"Loaded {len(df)} doctors from Doctors List 624.xlsx")
    
    for _, row in df.iterrows():
        name = normalize_string(row.get('Doctor Name'))
        if not name:
            continue
        
        # Split name into first and last
        name_parts = name.split()
        first_name = name_parts[0] if name_parts else name
        last_name = ' '.join(name_parts[1:]) if len(name_parts) > 1 else ''
            
        phone = clean_phone(row.get('Mobile Number'))
        email = clean_email(row.get('Email'))
        
        # Skip duplicates
        if email and email.lower() in existing_emails:
            continue
        if phone and phone in existing_phones:
            continue
        
        gender = str(row.get('Gender', '')).strip().lower()
        if gender not in ['male', 'female']:
            gender = None
            
        specialization = normalize_string(row.get('UIN Speciality') or row.get('Division Speciality'))
        qualification = str(row.get('UIN Qualification', '') or '').strip()
        state = normalize_state(row.get('State'))
        city = normalize_city(row.get('Locality'))
        
        # Generate email if missing
        if not email:
            email = f"{name.lower().replace(' ', '.')}@doctor.mediczy.com"
        
        try:
            cur.execute("""
                INSERT INTO doctors ("firstName", "lastName", email, password, "phoneNumber", 
                                    specialization, qualification, status, "isVerified",
                                    "createdAt", "updatedAt")
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'active', false, NOW(), NOW())
            """, (first_name, last_name, email, generate_password_hash(name), phone, 
                  specialization, qualification))
            inserted += 1
            if email: existing_emails.add(email.lower())
            if phone: existing_phones.add(phone)
            conn.commit()
        except Exception as e:
            conn.rollback()
            errors += 1
            if errors <= 3:
                print(f"Error inserting doctor {name}: {e}")
    
    # Process teleconsultation doctors
    filepath = f'{BASE_PATH}/Doctors Data/teleconsulation doctors list.xlsx'
    df = pd.read_excel(filepath)
    print(f"Loaded {len(df)} teleconsultation doctors")
    
    for _, row in df.iterrows():
        name = normalize_string(row.get('Full Name'))
        if not name:
            continue
        
        name_parts = name.split()
        first_name = name_parts[0] if name_parts else name
        last_name = ' '.join(name_parts[1:]) if len(name_parts) > 1 else ''
            
        phone = clean_phone(row.get('Contact Phone Number'))
        email = clean_email(row.get('Contact Email ID'))
        
        if email and email.lower() in existing_emails:
            continue
        if phone and phone in existing_phones:
            continue
            
        gender = str(row.get('Gender', '')).strip().lower()
        if gender not in ['male', 'female']:
            gender = None
            
        qualification = str(row.get('Qualification', '') or '').strip()
        others = str(row.get('Others please specify', '') or '').strip()
        if others:
            qualification = f"{qualification} ({others})" if qualification else others
        
        if not email:
            email = f"{name.lower().replace(' ', '.')}@teleconsult.mediczy.com"
        
        try:
            cur.execute("""
                INSERT INTO doctors ("firstName", "lastName", email, password, "phoneNumber", 
                                    qualification, status, "isVerified",
                                    "createdAt", "updatedAt")
                VALUES (%s, %s, %s, %s, %s, %s, 'active', false, NOW(), NOW())
            """, (first_name, last_name, email, generate_password_hash(name), phone, qualification))
            inserted += 1
            if email: existing_emails.add(email.lower())
            if phone: existing_phones.add(phone)
            conn.commit()
        except Exception as e:
            conn.rollback()
            errors += 1
    
    cur.close()
    conn.close()
    
    print(f"Doctors: Inserted {inserted}, Errors {errors}")
    return inserted

def process_clinics():
    """Process clinics from Excel files - use provider_clinics table"""
    print("\n" + "="*60)
    print("PROCESSING CLINICS")
    print("="*60)
    
    conn = get_connection()
    cur = conn.cursor()
    
    # Check existing clinics
    cur.execute("SELECT name FROM provider_clinics")
    rows = cur.fetchall()
    existing = set(str(row[0]).lower() for row in rows if row[0])
    print(f"Existing clinics: {len(existing)}")
    
    inserted = 0
    errors = 0
    
    # Process Clove Dental
    filepath = f'{BASE_PATH}/Clinics/Dental Clinics/Clove dental 2.xlsx'
    df = pd.read_excel(filepath)
    print(f"Loaded {len(df)} dental clinics")
    
    for _, row in df.iterrows():
        name = normalize_string(row.get('NEW ENTITY NAME') or row.get('CLINIC NAME'))
        if not name or name.lower() in existing:
            continue
        
        city = normalize_city(row.get('CITY'))
        address = str(row.get('ADDRESS', '') or '').strip()
        
        # Build location JSONB
        location = {
            'address': address,
            'city': city,
            'state': normalize_state(row.get('STATE')),
            'pincode': clean_pincode(row.get('PIN CODE'))
        }
            
        try:
            cur.execute("""
                INSERT INTO provider_clinics (name, type, specialty, location, services, 
                                             phone, email, status, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'active', NOW(), NOW())
            """, (
                name, 'dental', row.get('SPECIALTY'), Json(location), 
                Json(['dental']), clean_phone(row.get('PHONE')), clean_email(row.get('EMAIL'))
            ))
            inserted += 1
            existing.add(name.lower())
            conn.commit()
        except Exception as e:
            conn.rollback()
            errors += 1
            if errors <= 3:
                print(f"Error: {e}")
    
    # Process Poly Clinics
    filepath = f'{BASE_PATH}/Clinics/Poly Clinics/clinics list.xlsx'
    df = pd.read_excel(filepath)
    print(f"Loaded {len(df)} poly clinics")
    
    for _, row in df.iterrows():
        name = normalize_string(row.get('entity_name'))
        if not name or name.lower() in existing:
            continue
        
        city = normalize_city(row.get('city'))
        lat = row.get('Latitude') if not pd.isna(row.get('Latitude')) else None
        lng = row.get('Longitude') if not pd.isna(row.get('Longitude')) else None
        
        location = {
            'address': str(row.get('entity_address', '') or '').strip(),
            'city': city,
            'state': normalize_state(row.get('state')),
            'pincode': clean_pincode(row.get('pincode'))
        }
        if lat and lng:
            location['coordinates'] = {'lat': float(lat), 'lng': float(lng)}
        
        try:
            cur.execute("""
                INSERT INTO provider_clinics (name, type, location, services, status, 
                                             created_at, updated_at)
                VALUES (%s, %s, %s, %s, 'active', NOW(), NOW())
            """, (
                name, 'polyclinic', Json(location), Json(['general', 'consultation'])
            ))
            inserted += 1
            existing.add(name.lower())
            conn.commit()
        except Exception as e:
            conn.rollback()
            errors += 1
    
    cur.close()
    conn.close()
    
    print(f"Clinics: Inserted {inserted}, Errors {errors}")
    return inserted

def generate_summary():
    """Generate final summary"""
    print("\n" + "="*60)
    print("FINAL DATABASE SUMMARY")
    print("="*60)
    
    conn = get_connection()
    cur = conn.cursor()
    
    tables = [
        ('doctors', 'status', 'active'),
        ('hospitals', 'status', 'active'),
        ('labs', 'status', 'active'),
        ('provider_clinics', 'status', 'active')
    ]
    
    for table_info in tables:
        table = table_info[0]
        try:
            cur.execute(f'SELECT COUNT(*) FROM {table}')
            count = cur.fetchone()[0]
            
            try:
                status_col = table_info[1]
                status_val = table_info[2]
                cur.execute(f"SELECT COUNT(*) FROM {table} WHERE {status_col} = '{status_val}'")
                active = cur.fetchone()[0]
                print(f"  {table}: {count} total ({active} active)")
            except Exception as e:
                print(f"  {table}: {count} total")
        except Exception as e:
            print(f"  {table}: Error - {e}")
    
    cur.close()
    conn.close()

def main():
    print("="*60)
    print("MEDICZY MASTER DATA PROCESSOR")
    print(f"Started at: {datetime.now()}")
    print("="*60)
    
    process_labs()
    process_hospitals()
    process_doctors()
    process_clinics()
    
    generate_summary()
    
    print("\n" + "="*60)
    print(f"Completed at: {datetime.now()}")
    print("="*60)

if __name__ == "__main__":
    main()
