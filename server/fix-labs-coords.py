#!/usr/bin/env python3
"""
Targeted fix:
1. Re-geocode Rado labs branches via area+pincode (more precise)
2. Also improve geocoded_display -> formatted_address for all labs
"""

import json, time, psycopg2, urllib.request, urllib.parse, re

DB = dict(host="127.0.0.1", port=5432, dbname="mediczy_ai",
          user="mediczy_helper", password="Mediczy2024Helper")

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
HEADERS = {"User-Agent": "Mediczy-LabEnrichment/1.0 (admin@mediczy.com)"}

# Rado branches: id -> (area/landmark, pincode)
# Using specific area + pincode is more accurate than street+city for Nominatim
RADO_FIXES = {
    2403: {"area": "Porur",         "pincode": "600116", "city": "Chennai", "lat": 13.0320131, "lng": 80.158304},
    2404: {"area": "Madipakkam",    "pincode": "600091", "city": "Chennai", "lat": 12.9611348, "lng": 80.2001292},
    2405: {"area": "Poonamallee",   "pincode": "600056", "city": "Chennai", "lat": 13.0403526, "lng": 80.129575},
    2406: {"area": "West Mambalam", "pincode": "600033", "city": "Chennai", "lat": 13.0428296, "lng": 80.2270184},
    2407: {"area": "West Tambaram", "pincode": "600045", "city": "Chennai", "lat": 12.9256549, "lng": 80.10437},
    2408: {"area": "Perungudi",     "pincode": "600041", "city": "Chennai", "lat": 12.9710239, "lng": 80.2418051},
    2409: {"area": "Adyar",         "pincode": "600028", "city": "Chennai", "lat": 13.00645,   "lng": 80.2577791},
}


def nominatim_search(query: str) -> dict | None:
    params = urllib.parse.urlencode({"q": query, "format": "jsonv2", "addressdetails": 1, "limit": 1, "countrycodes": "in"})
    try:
        req = urllib.request.Request(f"{NOMINATIM_URL}?{params}", headers=HEADERS)
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read())
            return data[0] if data else None
    except Exception as e:
        print(f"  [nominatim] {e}")
        return None


def clean_street(street: str) -> str:
    """Remove internal lab branding prefixes from street."""
    s = re.sub(r"^(RADOLABS LTD\s*[–-]?\s*[\w\s]*,?\s*|RWC\s*-\s*[\w\s]+-\s*|Rado Elite(?: Pro)? Centre-[\w\s]+-)", "", street, flags=re.I)
    s = re.sub(r"\s{2,}", " ", s).strip(", ")
    return s


def build_formatted(addr_dict: dict) -> str:
    """Build clean customer-friendly address from structured data."""
    parts = []
    street = clean_street(addr_dict.get("street", ""))
    if street:
        parts.append(street)
    area = addr_dict.get("area", "")
    locality = addr_dict.get("locality", "")
    if locality and locality != area and locality not in street:
        parts.append(locality)
    if area and area not in street and area not in " ".join(parts):
        parts.append(area)
    city = addr_dict.get("city", "")
    if city and city not in " ".join(parts):
        parts.append(city)
    state = addr_dict.get("state", "")
    if state:
        parts.append(state)
    pincode = addr_dict.get("pincode", "")
    if pincode:
        parts.append(pincode)
    return ", ".join(p for p in parts if p)


def main():
    conn = psycopg2.connect(**DB)
    cur = conn.cursor()

    # ── Step 1: Fix Rado labs with area-level coordinates ─────────────────────
    print("=== Step 1: Restore precise Rado labs coordinates ===\n")
    for lab_id, fix in RADO_FIXES.items():
        cur.execute('SELECT address FROM labs WHERE id = %s', (lab_id,))
        row = cur.fetchone()
        if not row:
            continue
        addr = row[0]

        # Try to get area-level coords via area+pincode query
        query = f"{fix['area']}, {fix['pincode']}, Chennai, Tamil Nadu, India"
        print(f"[{lab_id}] Querying: {query}")
        nom = nominatim_search(query)

        lat, lng = fix["lat"], fix["lng"]  # fallback to known good coords
        if nom and abs(float(nom["lat"]) - fix["lat"]) < 0.05:
            lat, lng = float(nom["lat"]), float(nom["lon"])
            print(f"  ✓ Nominatim: lat={lat:.6f}, lng={lng:.6f}  [{nom.get('display_name','')[:60]}]")
        else:
            print(f"  → Using known area coordinates: lat={lat}, lng={lng}")

        addr["coordinates"] = {"lat": lat, "lng": lng}
        addr["formatted_address"] = build_formatted(addr)

        cur.execute(
            'UPDATE labs SET address = %s::jsonb, "updatedAt" = NOW() WHERE id = %s',
            (json.dumps(addr), lab_id)
        )
        conn.commit()
        print(f"  → Address: {addr['formatted_address'][:80]}\n")
        time.sleep(1.2)

    # ── Step 2: Ensure formatted_address on all remaining labs ────────────────
    print("\n=== Step 2: Ensure formatted_address on all 14 labs ===\n")
    cur.execute('SELECT id, name, address FROM labs WHERE id BETWEEN 2403 AND 2416')
    for row in cur.fetchall():
        lab_id, name, addr = row
        if lab_id in RADO_FIXES:
            continue  # already handled above
        if not addr.get("formatted_address"):
            addr["formatted_address"] = build_formatted(addr)
            cur.execute(
                'UPDATE labs SET address = %s::jsonb WHERE id = %s',
                (json.dumps(addr), lab_id)
            )
            conn.commit()
            print(f"[{lab_id}] {name}: {addr['formatted_address'][:80]}")

    # ── Step 3: Delete test entries ───────────────────────────────────────────
    print("\n=== Step 3: Remove test entries (2401, 2402) ===")
    cur.execute("DELETE FROM labs WHERE id IN (2401, 2402)")
    conn.commit()
    print(f"Deleted {cur.rowcount} test row(s).")

    cur.close()
    conn.close()
    print("\nAll done.")


if __name__ == "__main__":
    main()
