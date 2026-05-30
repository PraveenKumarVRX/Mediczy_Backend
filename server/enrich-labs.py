#!/usr/bin/env python3
"""
Lab address enrichment script.
Uses OpenStreetMap Nominatim (free, no key) to:
  - Geocode labs that are missing coordinates
  - Produce a clean, customer-friendly formatted address
  - Update the address JSONB in PostgreSQL
"""

import os, json, time, re, psycopg2, urllib.request, urllib.parse

# ── DB ─────────────────────────────────────────────────────────────────────────
DB = dict(host="127.0.0.1", port=5432, dbname="mediczy_ai",
          user="mediczy_helper", password=os.getenv("POSTGRES_PASSWORD") or os.getenv("DB_PASSWORD") or os.getenv("DB_PASS"))

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
HEADERS = {"User-Agent": "Mediczy-LabEnrichment/1.0 (admin@mediczy.com)"}

# ── Labs to enrich (IDs 2403-2416, skip test entries) ─────────────────────────
LAB_IDS = list(range(2403, 2417))


def nominatim_search(query: str, country_codes="in") -> dict | None:
    """Call Nominatim and return the best result dict, or None."""
    params = urllib.parse.urlencode({
        "q": query,
        "format": "jsonv2",
        "addressdetails": 1,
        "limit": 1,
        "countrycodes": country_codes,
    })
    url = f"{NOMINATIM_URL}?{params}"
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read())
            return data[0] if data else None
    except Exception as e:
        print(f"    [nominatim error] {e}")
        return None


def build_clean_address(nom: dict, fallback_parts: dict) -> str:
    """Build a clean, human-readable address string from Nominatim result."""
    a = nom.get("address", {})
    parts = []

    # House number + road
    house = a.get("house_number", "")
    road = a.get("road", "") or a.get("pedestrian", "") or a.get("path", "")
    if house and road:
        parts.append(f"{house}, {road}")
    elif road:
        parts.append(road)
    elif fallback_parts.get("street"):
        # Clean internal lab name prefixes from street
        st = fallback_parts["street"]
        st = re.sub(r"^(RADOLABS LTD\s*[–-]?\s*|RWC\s*-\s*\w[\w\s]*-\s*|Rado Elite(?: Pro)? Centre-[\w\s]+-)", "", st, flags=re.I).strip()
        st = re.sub(r"\s{2,}", " ", st)
        parts.append(st)

    # Suburb / neighbourhood
    suburb = (a.get("suburb") or a.get("neighbourhood") or a.get("quarter") or
               a.get("hamlet") or a.get("village") or fallback_parts.get("area", ""))
    if suburb and suburb not in " ".join(parts):
        parts.append(suburb)

    # City / town
    city = (a.get("city") or a.get("town") or a.get("municipality") or
             fallback_parts.get("city", ""))
    if city and city not in " ".join(parts):
        parts.append(city)

    # State
    state = a.get("state") or fallback_parts.get("state", "")
    if state:
        parts.append(state)

    # Pincode
    postcode = a.get("postcode") or fallback_parts.get("pincode", "")
    if postcode:
        parts.append(postcode)

    return ", ".join(p.strip() for p in parts if p.strip())


def geocode_lab(lab: dict) -> dict | None:
    """
    Try multiple query strategies for a lab. Returns enriched address dict or None.
    The address JSONB keys: street, area, locality, city, state, pincode, coordinates, formatted_address
    """
    addr = lab["address"] if isinstance(lab["address"], dict) else json.loads(lab["address"])
    name = lab["name"]
    phone = lab.get("phoneNumber", "")

    city = addr.get("city", "")
    state = addr.get("state", "")
    pincode = addr.get("pincode", "")
    street = addr.get("street", "")

    # Clean street from internal branding prefixes
    clean_street = re.sub(
        r"^(RADOLABS LTD\s*[–-]?\s*|RWC\s*-\s*[\w\s]+-\s*|"
        r"Rado Elite(?: Pro)? Centre-[\w\s]+-\s*|Srinivasan Medical College and Hospital,?\s*)",
        "", street, flags=re.I
    ).strip()
    clean_street = re.sub(r"\s{2,}", " ", clean_street).strip(", ")

    # Build query strategies from most-specific to least
    queries = []
    if pincode:
        queries.append(f"{clean_street}, {pincode}, India")
    if city:
        queries.append(f"{clean_street}, {city}, {state}, India")
        queries.append(f"{city}, {state}, {pincode}, India" if pincode else f"{city}, {state}, India")
    if name != "Rado labs":   # generic name - skip name-only query
        queries.append(f"{name}, {city}, {state}, India")

    already_has_coords = (
        isinstance(addr.get("coordinates"), dict) and
        addr["coordinates"].get("lat") and
        addr["coordinates"].get("lng")
    )

    nom = None
    used_query = None
    for q in queries:
        print(f"    Trying: {q}")
        nom = nominatim_search(q)
        if nom:
            used_query = q
            print(f"    ✓ Found: {nom.get('display_name','')[:80]}")
            break
        time.sleep(1.2)  # Nominatim rate limit: 1 req/sec

    if not nom and already_has_coords:
        print(f"    → No Nominatim result, keeping existing coords")
        # Only build a better formatted_address from existing data
        enriched = dict(addr)
        if not enriched.get("formatted_address"):
            parts = [p for p in [street, addr.get("area",""), city, state, pincode] if p]
            enriched["formatted_address"] = ", ".join(parts)
        return enriched

    if not nom:
        print(f"    ✗ Could not geocode")
        return None

    lat = float(nom["lat"])
    lng = float(nom["lon"])
    formatted = build_clean_address(nom, addr)

    nom_addr = nom.get("address", {})
    enriched = dict(addr)
    enriched.update({
        "coordinates": {"lat": lat, "lng": lng},
        "formatted_address": formatted,
        # Refine pincode if Nominatim has a better one
        "pincode": nom_addr.get("postcode") or addr.get("pincode", ""),
        # Refine city
        "city": (nom_addr.get("city") or nom_addr.get("town") or addr.get("city", "")),
        "state": nom_addr.get("state") or addr.get("state", ""),
    })
    return enriched


def main():
    conn = psycopg2.connect(**DB)
    cur = conn.cursor()

    placeholders = ",".join(["%s"] * len(LAB_IDS))
    cur.execute(
        f'SELECT id, name, "phoneNumber", address FROM labs WHERE id IN ({placeholders})',
        LAB_IDS
    )
    labs = [
        {"id": r[0], "name": r[1], "phoneNumber": r[2], "address": r[3]}
        for r in cur.fetchall()
    ]

    print(f"Processing {len(labs)} labs...\n")
    updated = 0

    for lab in labs:
        print(f"[{lab['id']}] {lab['name']} ({lab['address'].get('city','')})")
        enriched = geocode_lab(lab)
        if enriched:
            cur.execute(
                'UPDATE labs SET address = %s::jsonb, "updatedAt" = NOW() WHERE id = %s',
                (json.dumps(enriched), lab["id"])
            )
            conn.commit()
            coords = enriched.get("coordinates", {})
            print(f"    → Updated: lat={coords.get('lat')}, lng={coords.get('lng')}")
            print(f"    → Address: {enriched.get('formatted_address','')[:80]}")
            updated += 1
        else:
            print(f"    → Skipped (no result)")
        time.sleep(1.2)
        print()

    cur.close()
    conn.close()
    print(f"\nDone. Updated {updated}/{len(labs)} labs.")


if __name__ == "__main__":
    main()
