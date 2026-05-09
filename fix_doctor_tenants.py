#!/usr/bin/env python3
"""
1. Delete the wrongly-inserted doctors (tenant_id=3 / panindiadoctors emails)
2. Create VSH and Manipal Hospitals as tenants (if not exist)
3. Re-insert doctors under correct hospital tenants
"""
import psycopg2
import openpyxl
import hashlib
import re
import json

conn = psycopg2.connect(
    host='127.0.0.1', port=5432, dbname='mediczy_ai',
    user='mediczy_helper', password='Mediczy2024Helper'
)
cur = conn.cursor()

# ── Step 1: Delete wrongly inserted doctors ──────────────────────────────────
cur.execute("DELETE FROM doctors WHERE email LIKE '%panindiadoctors.mediczy.internal%'")
deleted = cur.rowcount
print(f"Deleted {deleted} incorrectly mapped doctors")
conn.commit()

# ── Step 2: Create hospital tenants ──────────────────────────────────────────
HOSPITALS = {
    'VSH': {
        'name': 'Vydehi Super Specialty Hospital',
        'slug': 'vydehi-super-specialty-hospital',
        'subdomain': 'vydehi',
        'email': 'admin@vydehi.mediczy.internal',
        'phone': '18003091001',
        'address': json.dumps({'street': 'Vittal Mallya Road', 'city': 'Bengaluru', 'state': 'Karnataka', 'postal_code': '560001', 'country': 'India'}),
        'type': 'hospital',
    },
    'MANIPAL HOSPITALS': {
        'name': 'Manipal Hospitals',
        'slug': 'manipal-hospitals',
        'subdomain': 'manipal',
        'email': 'admin@manipal.mediczy.internal',
        'phone': '18001024647',
        'address': json.dumps({'street': 'Indira Nagar', 'city': 'Bengaluru', 'state': 'Karnataka', 'postal_code': '560038', 'country': 'India'}),
        'type': 'hospital',
    },
}

DEFAULT_LIMITS = json.dumps({'users': 100, 'doctors': 50, 'storage_gb': 50, 'appointments_per_month': 1000})
DEFAULT_USAGE  = json.dumps({'users': 0, 'doctors': 0, 'storage_gb': 0, 'appointments_this_month': 0})
DEFAULT_SETTINGS     = json.dumps({})
DEFAULT_BRANDING     = json.dumps({})
DEFAULT_FEATURES     = json.dumps({'analytics': True, 'lab_tests': True, 'pharmacy': False, 'insurance': False})
DEFAULT_INTEGRATIONS = json.dumps({})
DEFAULT_METADATA     = json.dumps({})

hospital_tenant_ids = {}
for key, h in HOSPITALS.items():
    # Check if already exists
    cur.execute("SELECT id FROM tenants WHERE slug = %s OR email = %s", (h['slug'], h['email']))
    row = cur.fetchone()
    if row:
        hospital_tenant_ids[key] = row[0]
        print(f"Tenant already exists: {h['name']} (id={row[0]})")
    else:
        cur.execute("""
            INSERT INTO tenants (
                name, slug, subdomain, type, email, phone, address,
                plan, limits, usage, settings, branding, features, integrations,
                status, is_verified, metadata, created_at, updated_at
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s,
                'basic', %s, %s, %s, %s, %s, %s,
                'active', true, %s, NOW(), NOW()
            ) RETURNING id
        """, (
            h['name'], h['slug'], h['subdomain'], h['type'],
            h['email'], h['phone'], h['address'],
            DEFAULT_LIMITS, DEFAULT_USAGE, DEFAULT_SETTINGS,
            DEFAULT_BRANDING, DEFAULT_FEATURES, DEFAULT_INTEGRATIONS,
            DEFAULT_METADATA
        ))
        tid = cur.fetchone()[0]
        hospital_tenant_ids[key] = tid
        print(f"Created tenant: {h['name']} (id={tid})")

# ── Step 3: Load Excel and re-insert doctors ──────────────────────────────────
wb = openpyxl.load_workbook('/home/ubuntu/Mediczy/PAN INDIA DOCTORS & HOSPITALS LIST.xlsx', read_only=True)
ws = wb['KARNATAKA']

rows = []
for i, row in enumerate(ws.iter_rows(values_only=True)):
    if i == 0:
        continue
    sl, hospital, doctor_name, qualification, seniority, specialization, contact, address, consultation_fee = row
    if not doctor_name or not str(doctor_name).strip():
        continue
    rows.append({
        'sl': sl,
        'hospital_key': str(hospital).strip().upper() if hospital else '',
        'doctor_name': str(doctor_name).strip().strip(','),
        'qualification': str(qualification).strip().strip('\xa0') if qualification else '',
        'seniority': str(seniority).strip() if seniority else 'Consultant',
        'specialization': str(specialization).strip().strip('\xa0') if specialization else 'General Medicine',
        'contact': str(contact).strip() if contact else '',
        'address': str(address).strip() if address else '',
        'consultation_fee': consultation_fee if consultation_fee else 0,
    })

print(f"\nRe-inserting {len(rows)} doctors under correct hospital tenants...")

has_degree = lambda s: any(x in s for x in ['MBBS', 'M.B.B.S', 'MD ', 'M.D', 'DNB', 'MS ', 'M.S', 'DM ', 'FRACP', 'FRCPCH', 'MRCPCH'])

inserted = 0
skipped = 0

for r in rows:
    # Resolve tenant
    tenant_id = hospital_tenant_ids.get(r['hospital_key'])
    if not tenant_id:
        # Fallback: try partial match
        for k, tid in hospital_tenant_ids.items():
            if k in r['hospital_key'] or r['hospital_key'] in k:
                tenant_id = tid
                break
    if not tenant_id:
        print(f"  ✗ No tenant found for hospital: '{r['hospital_key']}' — skipping {r['doctor_name']}")
        skipped += 1
        continue

    # Parse name
    name_clean = re.sub(r'^Dr\.?\s*', '', r['doctor_name']).strip()
    name_parts = name_clean.split(' ', 1)
    first_name = name_parts[0] if name_parts else name_clean
    last_name  = name_parts[1] if len(name_parts) > 1 else 'N/A'

    # Clean specialization
    spec = r['specialization']
    qual = r['qualification']

    if has_degree(spec):
        # specialization col has degree text — extract from qualification col or parentheses
        m = re.search(r'\(([^)]+)\)', spec)
        if m and not has_degree(m.group(1)):
            spec = m.group(1)
        elif qual and not has_degree(qual):
            spec = qual.split(',')[0].strip()
        else:
            # Last resort: take last pipe segment
            spec = spec.split('|')[-1].strip()

    if '|' in spec:
        spec = spec.split('|')[-1].strip()

    spec = spec.strip().strip('\xa0') or 'General Medicine'
    if not qual:
        qual = r['qualification'] or ''

    # Phone
    phone_digits = re.sub(r'\D', '', r['contact'])
    phone = phone_digits[-10:] if len(phone_digits) >= 10 else (phone_digits or '0000000000').ljust(10, '0')

    # Email
    email_safe = re.sub(r'[^a-z0-9]', '.', (first_name + '.' + last_name).lower())
    email = f"{email_safe}.{r['sl']}@panindiadoctors.mediczy.internal"

    # Placeholder password (not usable for login)
    password = hashlib.sha256(b'PanIndiaDoctor@2026!').hexdigest()

    try:
        cur.execute("""
            INSERT INTO doctors (
                tenant_id, prefix, "firstName", "lastName", email, password,
                "phoneNumber", specialization, qualification,
                "clinicAddress", "consultationFees", "isVerified", status
            ) VALUES (
                %s, 'Dr', %s, %s, %s, %s,
                %s, %s, %s,
                %s, %s, false, 'active'
            )
            ON CONFLICT (email) DO NOTHING
        """, (
            tenant_id,
            first_name, last_name, email, password,
            phone, spec, qual,
            r['address'], r['consultation_fee'] or 0
        ))
        if cur.rowcount > 0:
            inserted += 1
            hospital_name = HOSPITALS.get(r['hospital_key'], {}).get('name', r['hospital_key'])
            print(f"  ✓ {r['doctor_name']} → {spec} @ {hospital_name} (tenant {tenant_id})")
        else:
            skipped += 1
            print(f"  ~ Duplicate skipped: {email}")
    except Exception as e:
        skipped += 1
        print(f"  ✗ Error for {r['doctor_name']}: {e}")
        conn.rollback()
        conn = psycopg2.connect(host='127.0.0.1', port=5432, dbname='mediczy_ai',
                                user='mediczy_helper', password='Mediczy2024Helper')
        cur = conn.cursor()
        continue

conn.commit()
conn.close()
print(f"\n✓ Done. Inserted: {inserted}, Skipped: {skipped}")
