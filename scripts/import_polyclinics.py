import psycopg2
import pandas as pd
import random

CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

def generate_unique_id(prefix='C'):
    random_part = ''.join(random.choices(CHARSET, k=5))
    return f"{prefix}{random_part}"

conn = psycopg2.connect(host='127.0.0.1', database='mediczy_ai', 
                        user='mediczy_helper', password='Mediczy2024Helper')
cur = conn.cursor()

# Get table columns
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'provider_clinics'")
columns = [r[0] for r in cur.fetchall()]
print(f"Columns: {columns}")

# Get existing IDs
existing_ids = set()
for table in ['doctors', 'hospitals', 'labs', 'provider_clinics']:
    cur.execute(f'SELECT unique_id FROM {table} WHERE unique_id IS NOT NULL')
    for row in cur.fetchall():
        if row[0]:
            existing_ids.add(row[0])

print(f"Existing unique IDs: {len(existing_ids)}")

# Read Excel
excel_df = pd.read_excel('/home/ubuntu/Mediczy/server/db/Master Data/Clinics/Poly Clinics/clinics list.xlsx')
print(f"Excel rows: {len(excel_df)}")

# Import Apollo Clinics
# Columns: id, name, type, specialty, location (JSON), services, phone, email, status, created_at, updated_at, unique_id
import json
imported = 0
for _, row in excel_df.iterrows():
    name = f"{row['entity_name']}, {row['city']}" if pd.notna(row.get('city')) else row['entity_name']
    full_address = row.get('Full Address', row.get('entity_address', ''))
    specialty = str(row.get('discipline', 'General'))[:100]  # Truncate to 100 chars
    city = row.get('city', '')
    state = row.get('state', '')
    pincode = str(row.get('pincode', '')) if pd.notna(row.get('pincode')) else ''
    lat = row.get('Latitude') if pd.notna(row.get('Latitude')) else None
    lng = row.get('Longitude') if pd.notna(row.get('Longitude')) else None
    
    # Build location JSON
    location = json.dumps({
        'address': full_address,
        'city': city,
        'state': state,
        'pincode': pincode,
        'latitude': lat,
        'longitude': lng
    })
    
    # Generate unique ID
    for _ in range(100):
        uid = generate_unique_id('C')
        if uid not in existing_ids:
            break
    existing_ids.add(uid)
    
    # Use correct column names: name, type, specialty, location, services, phone, email, status, unique_id
    cur.execute("""
        INSERT INTO provider_clinics (name, type, specialty, location, status, unique_id)
        VALUES (%s, 'polyclinic', %s, %s, 'active', %s)
    """, (name, specialty, location, uid))
    imported += 1

conn.commit()
print(f"\nImported {imported} Apollo Clinics")

# Final summary
cur.execute("SELECT type, COUNT(*) FROM provider_clinics GROUP BY type")
print("\n=== FINAL CLINIC COUNTS ===")
for row in cur.fetchall():
    print(f"  {row[0]}: {row[1]}")

cur.execute("SELECT COUNT(*) FROM provider_clinics")
print(f"\nTotal clinics: {cur.fetchone()[0]}")

cur.close()
conn.close()
