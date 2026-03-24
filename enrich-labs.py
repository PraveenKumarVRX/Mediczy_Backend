#!/usr/bin/env python3
"""
Lab Address Enrichment Script
=============================
Uses OpenStreetMap Nominatim (free, no API key) to:
1. Geocode each lab's address → get lat/lng
2. Update the labs table with coordinates

Usage:
  python3 enrich-labs.py              # enrich labs with id >= 2403 (recently uploaded)
  python3 enrich-labs.py --all        # enrich ALL labs missing coordinates
  python3 enrich-labs.py --id 2403    # enrich a specific lab
  python3 enrich-labs.py --dry-run    # preview results without writing to DB
"""

import re
import time
import json
import argparse
import psycopg2
import requests

# ── Config ────────────────────────────────────────────────────────────────────
DB_CONFIG = {
    "host": "127.0.0.1",
    "port": 5432,
    "dbname": "mediczy_ai",
    "user": "mediczy_helper",
    "password": "Mediczy2024Helper",
}

NOMINATIM_UA = "Mediczy-Lab-Enrichment/1.0 (admin@mediqzy.com)"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
DELAY_SECONDS = 1.2  # Nominatim policy: max 1 req/sec

# ── Address cleaning ──────────────────────────────────────────────────────────
# Fragments from internal naming that confuse geocoders
_NOISE = re.compile(
    r"(Rado Elite Pro Centre[-\s]*|Rado Elite Centre[-\s]*|RADOLABS LTD[,\s–-]*"
    r"|RWC\s*[-–]\s*\w+\s*[-–]\s*|RWC\s*-\s*\w+\s*|"
    r"No\.\s*\d+\s*&\s*\d+\s*,?\s*|DDGH\s*,?\s*|2nd Floor,?\s*)",
    re.IGNORECASE
)

def clean_street(raw: str) -> str:
    """Strip internal lab-name prefixes, leaving the actual street address."""
    cleaned = _NOISE.sub("", raw).strip().strip(",").strip()
    # Also collapse multiple spaces/commas
    cleaned = re.sub(r",\s*,", ",", cleaned)
    cleaned = re.sub(r"\s{2,}", " ", cleaned)
    return cleaned.strip()

def all_numbers_in(s: str):
    """Extract all runs of digits (for road/house numbers)."""
    return re.findall(r"\d+", s)

# ── Nominatim Geocode ─────────────────────────────────────────────────────────
def geocode(query: str):
    """Search Nominatim. Returns (lat, lon, display_name, addr_detail) or None."""
    params = {"q": query, "format": "json", "limit": 1, "addressdetails": 1, "countrycodes": "in"}
    headers = {"User-Agent": NOMINATIM_UA}
    try:
        resp = requests.get(NOMINATIM_URL, params=params, headers=headers, timeout=12)
        resp.raise_for_status()
        data = resp.json()
        if data:
            r = data[0]
            return float(r["lat"]), float(r["lon"]), r.get("display_name", ""), r.get("address", {})
    except Exception as e:
        print(f"    ⚠ geocode error: {e}")
    return None

def geocode_lab(name, street, city, state, pincode, area="", locality=""):
    """Try multiple query strategies, from specific to broad."""
    c_street = clean_street(street) if street else ""

    strategies = []

    # 1. Clean street + pincode (often the most precise)
    if c_street and pincode:
        strategies.append(f"{c_street}, {city}, {state} {pincode}, India")
    # 2. Clean street + city
    if c_street:
        strategies.append(f"{c_street}, {city}, {state}, India")
    # 3. Landmark/area + city + pincode
    if area and pincode:
        strategies.append(f"{area}, {city}, {state} {pincode}, India")
    # 4. Pincode only (centroid of the postal zone)
    if pincode:
        strategies.append(f"{pincode}, {state}, India")
    # 5. City centre fallback
    strategies.append(f"{city}, {state}, India")

    for i, query in enumerate(strategies):
        print(f"    [{i+1}] {query[:90]}")
        result = geocode(query)
        if result:
            return result, i + 1
        time.sleep(DELAY_SECONDS)

    return None, None

# ── Parse Nominatim addressdetails into clean fields ─────────────────────────
def extract_osm_fields(osm_addr: dict):
    def pick(*keys):
        for k in keys:
            v = osm_addr.get(k, "")
            if v:
                return v
        return ""
    return {
        "road": pick("road", "pedestrian", "footway", "path"),
        "house_number": pick("house_number"),
        "neighbourhood": pick("neighbourhood", "suburb", "quarter", "hamlet"),
        "city": pick("city", "town", "village", "municipality"),
        "state": pick("state"),
        "postcode": pick("postcode"),
        "country": pick("country"),
    }

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Enrich lab addresses with geocoordinates")
    parser.add_argument("--all", action="store_true", help="Process all labs missing coordinates")
    parser.add_argument("--id", type=int, help="Process a specific lab ID")
    parser.add_argument("--dry-run", action="store_true", help="Print results without updating DB")
    parser.add_argument("--min-id", type=int, default=2403, help="Minimum lab ID to process (default: 2403)")
    args = parser.parse_args()

    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    if args.id:
        cur.execute("""
            SELECT id, name, "phoneNumber", address
            FROM labs WHERE id = %s
        """, (args.id,))
    elif args.all:
        cur.execute("""
            SELECT id, name, "phoneNumber", address
            FROM labs
            WHERE (address->>'coordinates' IS NULL OR address->>'coordinates' = '{}' OR address->'coordinates'->>'lat' IS NULL)
            ORDER BY id DESC
        """)
    else:
        cur.execute("""
            SELECT id, name, "phoneNumber", address
            FROM labs WHERE id >= %s ORDER BY id
        """, (args.min_id,))

    labs = cur.fetchall()
    print(f"\n{'='*60}")
    print(f"Labs to process: {len(labs)}")
    print(f"Mode: {'DRY RUN — no DB writes' if args.dry_run else 'LIVE UPDATE'}")
    print(f"{'='*60}\n")

    results = {"success": 0, "failed": 0, "skipped": 0, "strategy": {}}

    for row in labs:
        lab_id, name, phone, address_json = row
        addr = address_json if isinstance(address_json, dict) else {}

        street   = addr.get("street", "")
        city     = addr.get("city", "")
        state    = addr.get("state", "")
        pincode  = addr.get("pincode", "")
        area     = addr.get("area", "")
        locality = addr.get("locality", "")
        existing = addr.get("coordinates", {})

        # Skip if already geocoded (unless --all)
        if existing and isinstance(existing, dict) and existing.get("lat"):
            if not args.all:
                print(f"[{lab_id}] {name} — SKIP (lat={existing['lat']:.4f})")
                results["skipped"] += 1
                continue

        print(f"\n[{lab_id}] {name}")
        print(f"   {city}, {state} {pincode}")
        print(f"   Street: {street[:80]}")

        geo, strategy_num = geocode_lab(name, street, city, state, pincode, area, locality)

        if not geo:
            print(f"  ❌ FAILED — no geocode result")
            results["failed"] += 1
            continue

        lat, lon, display_name, osm_addr_detail = geo
        osm = extract_osm_fields(osm_addr_detail)
        print(f"  ✓ Strategy {strategy_num}: lat={lat:.6f}, lon={lon:.6f}")
        print(f"    → {display_name[:120]}")

        # Decide what to keep vs what OSM gives us (trust OSM for postcode/city if better)
        new_addr = dict(addr)
        new_addr["coordinates"] = {"lat": round(lat, 7), "lng": round(lon, 7)}
        new_addr["geocoded_display"] = display_name[:250]

        # Enrich missing fields from OSM
        if not new_addr.get("pincode") and osm.get("postcode"):
            new_addr["pincode"] = osm["postcode"]
            print(f"    [enriched] pincode = {osm['postcode']}")
        if not new_addr.get("city") and osm.get("city"):
            new_addr["city"] = osm["city"]
        if not new_addr.get("area") and osm.get("neighbourhood"):
            new_addr["area"] = osm["neighbourhood"]

        results["strategy"][lab_id] = strategy_num
        results["success"] += 1

        if not args.dry_run:
            cur.execute("""
                UPDATE labs
                SET address = %s::jsonb,
                    "updatedAt" = NOW()
                WHERE id = %s
            """, (json.dumps(new_addr), lab_id))
            conn.commit()
            print(f"  ✓ Updated in DB")

        time.sleep(DELAY_SECONDS)

    cur.close()
    conn.close()

    print(f"\n{'='*60}")
    print(f"RESULTS")
    print(f"  Geocoded:  {results['success']}")
    print(f"  Failed:    {results['failed']}")
    print(f"  Skipped:   {results['skipped']}")
    if results["failed"] == 0:
        print(f"  🎉 All labs have coordinates!")
    print(f"{'='*60}\n")

if __name__ == "__main__":
    main()
