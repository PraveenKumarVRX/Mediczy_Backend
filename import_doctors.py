#!/usr/bin/env python3
"""
Import doctors from PAN INDIA DOCTORS & HOSPITALS LIST.xlsx into mediczy_ai DB
"""
import psycopg2
import openpyxl
import hashlib
import re
import sys

# ── DB connection ────────────────────────────────────────────────────────────
conn = psycopg2.connect(
    host='127.0.0.1', port=5432, dbname='mediczy_ai',
    user='mediczy_helper', password='Mediczy2024Helper'
)
cur = conn.cursor()

# ── Check tenants ────────────────────────────────────────────────────────────
cur.execute("SELECT id, name FROM tenants LIMIT 10")
tenants = cur.fetchall()
print("Tenants:", tenants)

cur.execute("SELECT enum_range(NULL::enum_doctors_prefix)")
prefixes = cur.fetchone()[0]
print("Prefixes:", prefixes)

cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='doctors' AND is_nullable='NO'")
required = [r[0] for r in cur.fetchall()]
print("Required cols:", required)

# ── Load Excel ───────────────────────────────────────────────────────────────
wb = openpyxl.load_workbook('/home/ubuntu/Mediczy/PAN INDIA DOCTORS & HOSPITALS LIST.xlsx', read_only=True)
ws = wb['KARNATAKA']

rows = []
for i, row in enumerate(ws.iter_rows(values_only=True)):
    if i == 0:
        continue  # skip header
    sl, hospital, doctor_name, qualification, seniority, specialization, contact, address, consultation_fee = row
    if not doctor_name or not str(doctor_name).strip():
        continue
    rows.append({
        'sl': sl,
        'hospital': hospital,
        'doctor_name': str(doctor_name).strip().strip(','),
        'qualification': str(qualification).strip() if qualification else '',
        'seniority': str(seniority).strip() if seniority else 'Consultant',
        'specialization': str(specialization).strip() if specialization else 'General Medicine',
        'contact': str(contact).strip() if contact else '',
        'address': str(address).strip() if address else '',
        'consultation_fee': consultation_fee if consultation_fee else 0,
    })

print(f"\nFound {len(rows)} valid doctor rows")
for r in rows:
    print(f"  - {r['doctor_name']} | {r['specialization']} | {r['hospital']}")

# ── Use "My SmartHealth" tenant (id=7) for pan-India doctors ─────────────────
tenant_id = next((t[0] for t in tenants if 'SmartHealth' in t[1]), tenants[0][0])
print(f"\nUsing tenant_id: {tenant_id} ({next((t[1] for t in tenants if t[0]==tenant_id), '?')})")

conn.close()
print("\nDry-run complete. Run with --insert to actually insert.")
if '--insert' not in sys.argv:
    sys.exit(0)

# ── Insert ────────────────────────────────────────────────────────────────────
conn = psycopg2.connect(
    host='127.0.0.1', port=5432, dbname='mediczy_ai',
    user='mediczy_helper', password='Mediczy2024Helper'
)
cur = conn.cursor()

inserted = 0
skipped = 0

for r in rows:
    # Parse first/last name
    name_parts = re.sub(r'^Dr\.?\s*', '', r['doctor_name']).strip().split(' ', 1)
    first_name = name_parts[0] if name_parts else r['doctor_name']
    last_name = name_parts[1] if len(name_parts) > 1 else 'N/A'

    # Clean specialization - handle swapped/mixed columns in Excel
    spec = r['specialization'].strip().strip('\xa0')
    qual = r['qualification'].strip().strip('\xa0')

    # If spec col has degree-like content, try to extract from the other col
    has_degree = lambda s: any(x in s for x in ['MBBS', 'M.B.B.S', 'MD ', 'M.D', 'DNB', 'MS ', 'M.S', 'DM '])
    if has_degree(spec):
        # Try qualification col — if it's a specialty description use it
        if qual and not has_degree(qual):
            spec = qual.split(',')[0].strip()
        else:
            # Extract specialty from parentheses e.g. "MD (Internal Medicine)" → "Internal Medicine"
            m = re.search(r'\(([^)]+)\)', spec)
            spec = m.group(1) if m else spec.split('|')[-1].strip()

    # Remove pipe-joined degree strings
    if '|' in spec:
        # Take last segment which tends to be the specialty
        spec = spec.split('|')[-1].strip()

    spec = spec.strip().strip('\xa0') or 'General Medicine'

    # Also clean qualification col
    if has_degree(qual):
        qualification = qual
    elif has_degree(spec) and qual:
        qualification = spec
        spec = qual.split(',')[0].strip()
    else:
        qualification = r['qualification']

    # Phone: extract digits only, take last 10
    phone_digits = re.sub(r'\D', '', r['contact'])
    phone = phone_digits[-10:] if len(phone_digits) >= 10 else phone_digits.ljust(10, '0')

    # Generate dummy email (not for login — just to satisfy NOT NULL)
    email_safe = re.sub(r'[^a-z0-9]', '.', first_name.lower() + '.' + last_name.lower())
    email = f"{email_safe}.{r['sl']}@panindiadoctors.mediczy.internal"

    # Hashed placeholder password (not usable for login)
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
            phone, spec, qualification,
            r['address'], r['consultation_fee'] or 0
        ))
        if cur.rowcount > 0:
            inserted += 1
            print(f"  ✓ Inserted: Dr. {first_name} {last_name} — {spec}")
        else:
            skipped += 1
            print(f"  ~ Skipped (duplicate): {email}")
    except Exception as e:
        skipped += 1
        print(f"  ✗ Error for {r['doctor_name']}: {e}")
        conn.rollback()
        conn = psycopg2.connect(
            host='127.0.0.1', port=5432, dbname='mediczy_ai',
            user='mediczy_helper', password='Mediczy2024Helper'
        )
        cur = conn.cursor()
        continue

conn.commit()
conn.close()
print(f"\nDone. Inserted: {inserted}, Skipped: {skipped}")
