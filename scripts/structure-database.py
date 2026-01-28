#!/usr/bin/env python3
"""
Database Structuring Script for Mediczy
Cleans and normalizes data in doctors, hospitals, and labs tables
"""

import psycopg2
from psycopg2.extras import RealDictCursor
import json

# Database connection
DB_CONFIG = {
    'host': '127.0.0.1',
    'database': 'mediczy_ai',
    'user': 'mediczy_helper',
    'password': 'Mediczy2024Helper'
}

# Standard city name mappings for normalization
CITY_MAPPINGS = {
    # Case normalization
    'CHENNAI': 'Chennai',
    'BANGALORE': 'Bangalore',
    'BENGALURU': 'Bangalore',
    'BENGALRUR': 'Bangalore',
    'MUMBAI': 'Mumbai',
    'DELHI': 'Delhi',
    'HYDERABAD': 'Hyderabad',
    'KOLKATA': 'Kolkata',
    'KOLKATTA': 'Kolkata',
    'PUNE': 'Pune',
    'JAIPUR': 'Jaipur',
    'LUCKNOW': 'Lucknow',
    'PATNA': 'Patna',
    'RANCHI': 'Ranchi',
    'VARANASI': 'Varanasi',
    'GHAZIABAD': 'Ghaziabad',
    'NOIDA': 'Noida',
    'GURGAON': 'Gurgaon',
    'GURUGRAM': 'Gurgaon',
    'MEERUT': 'Meerut',
    'AGRA': 'Agra',
    'KANPUR': 'Kanpur',
    'INDORE': 'Indore',
    'BHOPAL': 'Bhopal',
    'COIMBATORE': 'Coimbatore',
    'MADURAI': 'Madurai',
    'TRICHY': 'Trichy',
    'SALEM': 'Salem',
    'MYSORE': 'Mysore',
    'KOCHI': 'Kochi',
    'COCHIN': 'Kochi',
    'THIRUVANANTHAPURAM': 'Trivandrum',
    'TRIVANDRUM': 'Trivandrum',
    'THANE': 'Thane',
    'SURAT': 'Surat',
    'AHMEDABAD': 'Ahmedabad',
    'AHEMEDABAD': 'Ahmedabad',
    'AHEMDABAD': 'Ahmedabad',
    'AHAMADNAGAR': 'Ahmednagar',
    'AHMEDNAGAR': 'Ahmednagar',
    'VADODARA': 'Vadodara',
    'RAJKOT': 'Rajkot',
    'CHANDIGARH': 'Chandigarh',
    'AMRITSAR': 'Amritsar',
    'LUDHIANA': 'Ludhiana',
    'JALANDHAR': 'Jalandhar',
    'DEHRADUN': 'Dehradun',
    'HARIDWAR': 'Haridwar',
    'RISHIKESH': 'Rishikesh',
    'BHUBANESWAR': 'Bhubaneswar',
    'BHUBANESHWAR': 'Bhubaneswar',
    'CUTTACK': 'Cuttack',
    'GUWAHATI': 'Guwahati',
    'AGARTALA': 'Agartala',
    'JAMMU': 'Jammu',
    'SRINAGAR': 'Srinagar',
    'PUDUCHERRY': 'Puducherry',
    'PONDICHERRY': 'Puducherry',
    # Complex city names
    'DELHI- NCR': 'Delhi NCR',
    'DELHI NCR': 'Delhi NCR',
    'NEW DELHI': 'New Delhi',
    'CENTRAL DELHI': 'Central Delhi',
    'SOUTH DELHI': 'South Delhi',
    'NORTH DELHI': 'North Delhi',
    'WEST DELHI': 'West Delhi',
    'NORTH KOLKATA': 'North Kolkata',
    'SOUTH MUMBAI': 'South Mumbai',
    'EAST MUMBAI': 'East Mumbai',
    'NAVI MUMBAI': 'Navi Mumbai',
    'NEW MUMBAI': 'Navi Mumbai',
    'MULUND WEST MUMBAI': 'Mumbai - Mulund West',
    'VILE PARLE EAST MUMBAI': 'Mumbai - Vile Parle East',
    'GREATER NOIDA': 'Greater Noida',
    'OLD LUDHIANA': 'Ludhiana',
    'NEW LUDHIANA': 'Ludhiana',
    'OLD GURUGRAM': 'Gurgaon',
    'NEW GURUGRAM': 'Gurgaon',
    'SOUTH JAMMU': 'Jammu',
    'NORTH EAST': 'North East India',
    # Others - Title case
    'PERUNGUDI': 'Perungudi',
    'AVADI': 'Avadi',
    'CHENGALPATTU': 'Chengalpattu',
    'KRISHNAGIRI': 'Krishnagiri',
    'TIRUNELVELI': 'Tirunelveli',
    'VELLORE': 'Vellore',
    'ERODE': 'Erode',
    'NAMAKKAL': 'Namakkal',
    'VISHAKHAPATNAM': 'Visakhapatnam',
    'VISHAKAPATNAM': 'Visakhapatnam',
    'VIZAG': 'Visakhapatnam',
    'VIJAYAWADA': 'Vijayawada',
    'KAKINADA': 'Kakinada',
    'ONGOLE': 'Ongole',
    'GUNTUR': 'Guntur',
    'SECUNDERABAD': 'Secunderabad',
    'GOREGOAN': 'Goregaon',
    'JAYANAGAR': 'Jayanagar',
    'ITPL': 'Whitefield ITPL',
    'ROHINI': 'Delhi - Rohini',
}

# Proper doctor names to replace test data
DOCTOR_NAMES = [
    ("Arjun", "Sharma", "General Practitioner"),
    ("Priya", "Patel", "Cardiologist"),
    ("Vikram", "Singh", "Dermatologist"),
    ("Sneha", "Reddy", "Pediatrician"),
    ("Rahul", "Verma", "Orthopedist"),
    ("Anjali", "Gupta", "Neurologist"),
    ("Sanjay", "Kumar", "Psychiatrist"),
    ("Kavitha", "Nair", "Psychologist"),
    ("Deepak", "Joshi", "Gynecologist"),
    ("Sunita", "Menon", "ENT Specialist"),
    ("Rakesh", "Agarwal", "Ophthalmologist"),
    ("Meera", "Rao", "Rheumatologist"),
    ("Anil", "Kapoor", "Pulmonologist"),
    ("Pooja", "Iyer", "Physiotherapist"),
    ("Suresh", "Bhat", "Occupational Therapist"),
    ("Lakshmi", "Pillai", "Nutritionist"),
    ("Ravi", "Shetty", "Dietician"),
    ("Uma", "Shankar", "Nephrologist"),
    ("Prakash", "Murthy", "Urologist"),
    ("Geeta", "Krishnan", "Diabetologist"),
    ("Mohan", "Das", "Intensivist"),
    ("Revathi", "Subramaniam", "Cardio Thoracic Surgeon"),
    ("Karthik", "Narayanan", "Vascular Surgeon"),
    ("Divya", "Hegde", "Neuro Surgeon"),
    ("Ashok", "Sundaram", "Cardio Vascular Surgeon"),
    ("Nalini", "Rajan", "Gastroenterologist"),
    ("Venkat", "Iyengar", "Gastro Surgeon"),
    ("Shobha", "Raghavan", "General Surgeon"),
    ("Manoj", "Tiwari", "Proctologist"),
    ("Radha", "Venkatesh", "Podiatrician"),
    ("Ganesh", "Kulkarni", "Dentist"),
    ("Sarita", "Desai", "Endocrinologist"),
    ("Ajay", "Mehta", "Oncologist"),
]


def connect_db():
    """Create database connection"""
    return psycopg2.connect(**DB_CONFIG)


def normalize_city_name(city):
    """Normalize city name to standard format"""
    if not city:
        return 'Unknown'
    
    city_upper = city.upper().strip()
    
    # Check for exact match in mappings
    if city_upper in CITY_MAPPINGS:
        return CITY_MAPPINGS[city_upper]
    
    # Handle complex patterns
    # Remove leading numbers/postal codes
    import re
    city_clean = re.sub(r'^\d+\s*', '', city).strip()
    city_upper = city_clean.upper()
    
    if city_upper in CITY_MAPPINGS:
        return CITY_MAPPINGS[city_upper]
    
    # Title case for unknown cities
    return city.strip().title()


def fix_doctors(conn):
    """Fix doctor data - update status and names"""
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    print("\n=== FIXING DOCTORS ===")
    
    # Get all test doctors (IDs 37-73 with "Test" in name)
    cur.execute("""
        SELECT id, "firstName", "lastName", specialization 
        FROM doctors 
        WHERE "lastName" = 'Test' OR "firstName" LIKE '%Test%'
        ORDER BY id
    """)
    test_doctors = cur.fetchall()
    
    print(f"Found {len(test_doctors)} test doctors to rename")
    
    # Update test doctors with proper names
    for i, doc in enumerate(test_doctors):
        if i < len(DOCTOR_NAMES):
            new_first, new_last, _ = DOCTOR_NAMES[i]
            cur.execute("""
                UPDATE doctors 
                SET "firstName" = %s, "lastName" = %s, status = 'active'
                WHERE id = %s
            """, (new_first, new_last, doc['id']))
            print(f"  Updated ID {doc['id']}: {doc['firstName']} {doc['lastName']} -> Dr. {new_first} {new_last}")
    
    # Set all verified doctors to active status
    cur.execute("""
        UPDATE doctors 
        SET status = 'active' 
        WHERE "isVerified" = true AND status = 'pending'
    """)
    print(f"  Set {cur.rowcount} verified doctors to active status")
    
    # Fix incomplete early doctors (IDs 1-7) - mark as inactive
    cur.execute("""
        UPDATE doctors 
        SET status = 'inactive' 
        WHERE id <= 7 AND "clinicAddress" IS NULL
    """)
    print(f"  Set {cur.rowcount} incomplete doctors to inactive")
    
    conn.commit()
    print("✅ Doctors fixed")


def fix_labs(conn):
    """Normalize lab city names"""
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    print("\n=== FIXING LABS ===")
    
    # Get all labs with their addresses
    cur.execute('SELECT id, name, address FROM labs ORDER BY id')
    labs = cur.fetchall()
    
    updated = 0
    for lab in labs:
        if lab['address'] and isinstance(lab['address'], dict):
            city = lab['address'].get('city', '')
            normalized = normalize_city_name(city)
            
            if city != normalized:
                new_address = dict(lab['address'])
                new_address['city'] = normalized
                
                cur.execute("""
                    UPDATE labs 
                    SET address = %s 
                    WHERE id = %s
                """, (json.dumps(new_address), lab['id']))
                updated += 1
    
    conn.commit()
    print(f"✅ Normalized {updated} lab city names")


def fix_hospitals(conn):
    """Normalize hospital city names"""
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    print("\n=== FIXING HOSPITALS ===")
    
    cur.execute('SELECT id, hospital_name, city FROM hospitals')
    hospitals = cur.fetchall()
    
    updated = 0
    for hospital in hospitals:
        city = hospital['city']
        normalized = normalize_city_name(city)
        
        if city != normalized:
            cur.execute("""
                UPDATE hospitals 
                SET city = %s 
                WHERE id = %s
            """, (normalized, hospital['id']))
            updated += 1
            print(f"  {hospital['hospital_name']}: {city} -> {normalized}")
    
    conn.commit()
    print(f"✅ Normalized {updated} hospital city names")


def add_sample_hospitals(conn):
    """Add more sample hospitals for testing"""
    cur = conn.cursor()
    
    print("\n=== ADDING SAMPLE HOSPITALS ===")
    
    sample_hospitals = [
        ("Apollo Hospital Chennai", "REG-CHN-001", "apollo.chennai@mediczy.com", "+919876543220", "21, Greams Lane", "Chennai", "Tamil Nadu", "600006", 500, 350),
        ("Fortis Hospital Bangalore", "REG-BLR-001", "fortis.bangalore@mediczy.com", "+919876543221", "14, Cunningham Road", "Bangalore", "Karnataka", "560052", 400, 280),
        ("Max Super Speciality Delhi", "REG-DEL-001", "max.delhi@mediczy.com", "+919876543222", "Press Enclave Road, Saket", "New Delhi", "Delhi", "110017", 600, 420),
        ("AIIMS Delhi", "REG-DEL-002", "aiims.delhi@mediczy.com", "+919876543223", "Ansari Nagar East", "New Delhi", "Delhi", "110029", 2500, 1800),
        ("Narayana Health Bangalore", "REG-BLR-002", "narayana.bangalore@mediczy.com", "+919876543224", "258/A, Bommasandra", "Bangalore", "Karnataka", "560099", 800, 600),
        ("CMC Vellore", "REG-VLR-001", "cmc.vellore@mediczy.com", "+919876543225", "Ida Scudder Road", "Vellore", "Tamil Nadu", "632004", 2000, 1500),
        ("Manipal Hospital Bangalore", "REG-BLR-003", "manipal.bangalore@mediczy.com", "+919876543226", "98, HAL Airport Road", "Bangalore", "Karnataka", "560017", 600, 450),
        ("KIMS Hyderabad", "REG-HYD-001", "kims.hyderabad@mediczy.com", "+919876543227", "1-8-31/1, Minister Road", "Hyderabad", "Telangana", "500003", 400, 300),
        ("Ruby Hall Clinic Pune", "REG-PUN-001", "ruby.pune@mediczy.com", "+919876543228", "40, Sasoon Road", "Pune", "Maharashtra", "411001", 350, 250),
        ("Medanta Gurgaon", "REG-GUR-001", "medanta.gurgaon@mediczy.com", "+919876543229", "CH Baktawar Singh Road", "Gurgaon", "Haryana", "122001", 1600, 1200),
    ]
    
    added = 0
    for hospital in sample_hospitals:
        try:
            cur.execute("""
                INSERT INTO hospitals (
                    hospital_name, registration_number, email, phone_number, 
                    address, city, state, pincode, total_beds, available_beds,
                    specializations, facilities, network_type, cashless_enabled,
                    status, is_verified, created_at, updated_at
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                    '[]'::jsonb, '[]'::jsonb, 'premium', true,
                    'active', true, NOW(), NOW()
                ) ON CONFLICT (email) DO NOTHING
            """, hospital)
            if cur.rowcount > 0:
                added += 1
                print(f"  Added: {hospital[0]} ({hospital[5]})")
        except Exception as e:
            print(f"  Skipped {hospital[0]}: {e}")
    
    conn.commit()
    print(f"✅ Added {added} sample hospitals")


def generate_summary(conn):
    """Generate summary of database state"""
    cur = conn.cursor()
    
    print("\n" + "="*60)
    print("DATABASE SUMMARY")
    print("="*60)
    
    # Doctors summary
    cur.execute("SELECT COUNT(*) FROM doctors")
    total_doctors = cur.fetchone()[0]
    
    cur.execute("SELECT COUNT(*) FROM doctors WHERE status = 'active'")
    active_doctors = cur.fetchone()[0]
    
    cur.execute("SELECT COUNT(DISTINCT specialization) FROM doctors")
    specializations = cur.fetchone()[0]
    
    print(f"\n📋 DOCTORS:")
    print(f"   Total: {total_doctors}")
    print(f"   Active: {active_doctors}")
    print(f"   Specializations: {specializations}")
    
    # Hospitals summary
    cur.execute("SELECT COUNT(*) FROM hospitals")
    total_hospitals = cur.fetchone()[0]
    
    cur.execute("SELECT COUNT(DISTINCT city) FROM hospitals")
    hospital_cities = cur.fetchone()[0]
    
    print(f"\n🏥 HOSPITALS:")
    print(f"   Total: {total_hospitals}")
    print(f"   Cities: {hospital_cities}")
    
    # Labs summary
    cur.execute("SELECT COUNT(*) FROM labs")
    total_labs = cur.fetchone()[0]
    
    cur.execute("SELECT COUNT(DISTINCT name) FROM labs")
    lab_chains = cur.fetchone()[0]
    
    cur.execute("""
        SELECT address->>'city' as city, COUNT(*) as count 
        FROM labs 
        GROUP BY address->>'city' 
        ORDER BY count DESC 
        LIMIT 10
    """)
    top_cities = cur.fetchall()
    
    print(f"\n🔬 LABS:")
    print(f"   Total Locations: {total_labs}")
    print(f"   Lab Chains: {lab_chains}")
    print(f"   Top Cities:")
    for city, count in top_cities:
        print(f"      - {city}: {count}")
    
    print("\n" + "="*60)


def main():
    """Main function"""
    print("="*60)
    print("MEDICZY DATABASE STRUCTURING SCRIPT")
    print("="*60)
    
    conn = connect_db()
    
    try:
        fix_doctors(conn)
        fix_labs(conn)
        fix_hospitals(conn)
        add_sample_hospitals(conn)
        generate_summary(conn)
        
        print("\n✅ Database structuring complete!")
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
