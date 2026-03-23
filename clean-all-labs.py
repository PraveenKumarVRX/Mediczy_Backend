#!/usr/bin/env python3
"""
Lab Address Cleaning — Two-Phase
=================================
Phase 1 (fast, no API): Generate formatted_address for ALL labs using existing
                         structured address data + street noise removal.
Phase 2 (slow, Nominatim): Geocode the labs still missing lat/lng coordinates.

Usage:
  python3 clean-all-labs.py            # both phases
  python3 clean-all-labs.py --phase 1  # format only, no geocoding
  python3 clean-all-labs.py --phase 2  # geocode missing only
  python3 clean-all-labs.py --dry-run  # preview, no DB writes
"""

import re, json, time, argparse, psycopg2
try:
    import requests as _req
    def _http_get(url, params, headers):
        r = _req.get(url, params=params, headers=headers, timeout=12)
        r.raise_for_status()
        return r.json()
except ImportError:
    import urllib.request, urllib.parse
    def _http_get(url, params, headers):
        qs = urllib.parse.urlencode(params)
        req = urllib.request.Request(f"{url}?{qs}", headers=headers)
        with urllib.request.urlopen(req, timeout=12) as resp:
            return json.loads(resp.read())

DB = dict(host="127.0.0.1", port=5432, dbname="mediczy_ai",
          user="mediczy_helper", password="Mediczy2024Helper")

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_UA  = "Mediczy-LabCleaning/1.0 (admin@mediqzy.com)"
DELAY         = 2.0   # Nominatim policy: max 1 req/s — use 2s to avoid 429s

# ── Street noise removal ──────────────────────────────────────────────────────
_NOISE = re.compile(
    r"(?:"
    r"Rado Elite Pro Centre[-\s]*|"
    r"Rado Elite Centre[-\s]*|"
    r"RADOLABS LTD[,\s\u2013-]*|"
    r"RWC\s*[-\u2013]\s*\w+\s*[-\u2013]\s*|"
    r"RWC\s*-\s*\w+\s*|"
    r"No\.\s*\d+\s*&\s*\d+\s*,?\s*|"
    r"DDGH\s*,?\s*|"
    r"2nd Floor,?\s*"
    r")",
    re.IGNORECASE,
)

# Common city name normalizations for India
_CITY_NORM = {
    "Chennai Corporation": "Chennai",
    "Chennai City":        "Chennai",
    "Nagpur City":         "Nagpur",
    "Nagpur Municipal Corporation": "Nagpur",
    "Tumakuru":            "Tumkur",
    "Bengaluru":           "Bangalore",
    "Bengaluru Urban":     "Bangalore",
    "Bengaluru Rural":     "Bangalore",
    "Navi Mumbai":         "Navi Mumbai",
    "Mumbai City":         "Mumbai",
    "New Delhi":           "Delhi",
    "Thiruvananthapuram":  "Trivandrum",
}


def clean_street(s) -> str:
    """Strip internal lab branding, collapse whitespace."""
    s = _NOISE.sub("", str(s or "")).strip().strip(",").strip()
    s = re.sub(r",\s*,", ",", s)
    s = re.sub(r"\s{2,}", " ", s)
    return s.strip()


def normalize_city(city: str) -> str:
    return _CITY_NORM.get(city, city)


def build_formatted(addr: dict) -> str:
    """Build clean customer-friendly address from structured JSONB."""
    parts = []
    street   = clean_street(addr.get("street") or "")
    area     = str(addr.get("area") or "")
    locality = str(addr.get("locality") or "")
    city     = normalize_city(str(addr.get("city") or ""))
    state    = str(addr.get("state") or "")
    pincode  = str(addr.get("pincode") or "")

    if street:
        parts.append(street)
    if locality and locality not in " ".join(parts):
        parts.append(locality)
    if area and area not in " ".join(parts):
        parts.append(area)
    if city and city not in " ".join(parts):
        parts.append(city)
    if state:
        parts.append(state)
    if pincode:
        parts.append(pincode)

    return ", ".join(p.strip() for p in parts if p.strip())


# ── Geocoding ──────────────────────────────────────────────────────────────────
def geocode(query: str):
    """Query Nominatim. Returns (lat, lon, display_name, addr_detail) or None."""
    params = {"q": query, "format": "json", "limit": 1,
              "addressdetails": 1, "countrycodes": "in"}
    headers = {"User-Agent": NOMINATIM_UA}
    for attempt in range(3):
        try:
            data = _http_get(NOMINATIM_URL, params, headers)
            if data:
                r = data[0]
                return float(r["lat"]), float(r["lon"]), r.get("display_name", ""), r.get("address", {})
            return None
        except Exception as e:
            msg = str(e)
            if "429" in msg:
                wait = 10 * (attempt + 1)
                print(f"    [429 rate-limit] waiting {wait}s...")
                time.sleep(wait)
            else:
                print(f"    [geocode error] {e}")
                return None
    return None


def geocode_lab(street, city, state, pincode, area="", locality=""):
    """Try strategies from specific to broad. Returns (result, strategy_index) or (None, None)."""
    c_street = clean_street(street)
    strategies = []
    if c_street and pincode:
        strategies.append(f"{c_street}, {city}, {state} {pincode}, India")
    if c_street and city:
        strategies.append(f"{c_street}, {city}, {state}, India")
    if area and pincode:
        strategies.append(f"{area}, {city}, {state} {pincode}, India")
    if locality and city:
        strategies.append(f"{locality}, {city}, {state}, India")
    if pincode:
        strategies.append(f"{pincode}, {state}, India")
    if city:
        strategies.append(f"{city}, {state}, India")

    for i, q in enumerate(strategies):
        print(f"      [{i+1}] {q[:90]}")
        result = geocode(q)
        if result:
            return result, i + 1
        time.sleep(DELAY)
    return None, None


def pick(*keys):
    """Pick first non-empty value from a dict."""
    def _inner(d):
        for k in keys:
            v = d.get(k, "")
            if v:
                return v
        return ""
    return _inner


# ── Phase 1 ──────────────────────────────────────────────────────────────────
def phase1_format_all(cur, dry_run: bool):
    """Generate formatted_address for every lab using existing structured data."""
    print("\n" + "="*60)
    print("PHASE 1: Generate formatted_address for all labs")
    print("="*60)

    cur.execute("""
        SELECT id, name, address
        FROM labs
        ORDER BY id
    """)
    labs = cur.fetchall()
    print(f"Total labs: {len(labs)}\n")

    updated = skipped = already = 0
    for lab_id, name, addr in labs:
        if not isinstance(addr, dict):
            try:
                addr = json.loads(addr)
            except Exception:
                addr = {}

        formatted = build_formatted(addr)
        existing = addr.get("formatted_address", "")

        # Also normalize city in the stored address
        raw_city = addr.get("city", "")
        norm_city = normalize_city(raw_city)

        if not formatted:
            print(f"  [{lab_id}] {name[:40]} — SKIP (no address data)")
            skipped += 1
            continue

        city_changed = norm_city and norm_city != raw_city
        fmt_changed  = formatted != existing

        if not fmt_changed and not city_changed:
            already += 1
            continue

        new_addr = dict(addr)
        new_addr["formatted_address"] = formatted
        if city_changed:
            new_addr["city"] = norm_city

        print(f"  [{lab_id}] {name[:40]}")
        if fmt_changed:
            print(f"    formatted: {formatted[:90]}")
        if city_changed:
            print(f"    city:      {raw_city!r} → {norm_city!r}")

        if not dry_run:
            cur.execute(
                'UPDATE labs SET address = %s::jsonb, "updatedAt" = NOW() WHERE id = %s',
                (json.dumps(new_addr), lab_id)
            )
        updated += 1

    if not dry_run and updated:
        cur.connection.commit()

    print(f"\nPhase 1 done — updated: {updated}, already clean: {already}, skipped: {skipped}")


# ── Phase 2 ──────────────────────────────────────────────────────────────────
def phase2_geocode_missing(cur, dry_run: bool):
    """Geocode labs still missing lat/lng coordinates."""
    print("\n" + "="*60)
    print("PHASE 2: Geocode labs missing coordinates")
    print("="*60)

    cur.execute("""
        SELECT id, name, address
        FROM labs
        WHERE (
          address->'coordinates' IS NULL
          OR address->'coordinates'->>'lat' IS NULL
          OR address->>'coordinates' = 'null'
          OR (address->'coordinates')::text = 'null'
        )
        ORDER BY id
    """)
    labs = cur.fetchall()
    print(f"Labs needing geocoding: {len(labs)}\n")

    success = failed = 0
    for lab_id, name, addr in labs:
        if not isinstance(addr, dict):
            try:
                addr = json.loads(addr)
            except Exception:
                addr = {}

        city     = normalize_city(addr.get("city", ""))
        state    = addr.get("state", "")
        pincode  = addr.get("pincode", "")
        street   = addr.get("street", "")
        area     = addr.get("area", "")
        locality = addr.get("locality", "")

        print(f"\n[{lab_id}] {name}")
        print(f"   {city}, {state} {pincode}")

        geo, strategy_num = geocode_lab(street, city, state, pincode, area, locality)

        if not geo:
            print(f"  ❌ Could not geocode")
            failed += 1
            time.sleep(DELAY)
            continue

        lat, lon, display_name, osm_addr = geo
        get = pick("road","pedestrian","footway","path")
        osm_city = pick("city","town","municipality","village")(osm_addr)

        print(f"  ✓ Strategy {strategy_num}: lat={lat:.6f}, lon={lon:.6f}")
        print(f"    {display_name[:100]}")

        new_addr = dict(addr)
        new_addr["coordinates"] = {"lat": round(lat, 7), "lng": round(lon, 7)}
        new_addr["geocoded_display"] = display_name[:250]
        new_addr["city"] = normalize_city(city or osm_city)

        # Backfill missing fields from OSM
        if not new_addr.get("pincode") and osm_addr.get("postcode"):
            new_addr["pincode"] = osm_addr["postcode"]
        if not new_addr.get("area"):
            nb = pick("neighbourhood","suburb","quarter","hamlet")(osm_addr)
            if nb:
                new_addr["area"] = nb

        # Re-generate formatted_address with new data
        new_addr["formatted_address"] = build_formatted(new_addr)

        if not dry_run:
            cur.execute(
                'UPDATE labs SET address = %s::jsonb, "updatedAt" = NOW() WHERE id = %s',
                (json.dumps(new_addr), lab_id)
            )
            cur.connection.commit()
            print(f"  ✓ DB updated")

        success += 1
        time.sleep(DELAY)

    print(f"\nPhase 2 done — geocoded: {success}, failed: {failed}")


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Clean and geocode all lab addresses")
    parser.add_argument("--phase", type=int, choices=[1, 2], help="Run only phase 1 or 2")
    parser.add_argument("--dry-run", action="store_true", help="Preview without DB writes")
    args = parser.parse_args()

    if args.dry_run:
        print("⚠️  DRY RUN — no database changes will be made\n")

    conn = psycopg2.connect(**DB)
    cur  = conn.cursor()

    try:
        if args.phase != 2:
            phase1_format_all(cur, args.dry_run)
        if args.phase != 1:
            phase2_geocode_missing(cur, args.dry_run)
    finally:
        cur.close()
        conn.close()

    print("\n✅ All done!")


if __name__ == "__main__":
    main()
