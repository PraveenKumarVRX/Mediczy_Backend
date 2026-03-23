#!/usr/bin/env python3
"""
Clinic Address Cleaning — Two-Phase
=====================================
Phase 1 (fast, no API): 
  - Generate formatted_address for ALL clinics from location JSONB
  - Normalize city names (UPPERCASE → Title Case, aliases → canonical)
  - Fix city==state data error (e.g. city="Punjab", state="Punjab" → city from name)
  - Sync lat/lng columns with any coords stored inside location JSONB
  - Strip junk from address strings (duplicated city/state/pincode appended)

Phase 2 (city-centroid, no API):
  - Apply city-centroid lat/lng to any clinics still missing coordinates
  - Small random jitter (±0.015°) so same-city clinics don't stack on map
  - Marks geocoded_source='city_centroid' for future precise re-geocoding

Usage:
  python3 clean-all-clinics.py            # both phases
  python3 clean-all-clinics.py --phase 1  # format + normalize only
  python3 clean-all-clinics.py --phase 2  # fill missing coords only
  python3 clean-all-clinics.py --dry-run  # preview, no DB writes
"""

import re, json, random, argparse, psycopg2

DB = dict(host="127.0.0.1", port=5432, dbname="mediczy_ai",
          user="mediczy_helper", password="Mediczy2024Helper")

# ── City name normalization ───────────────────────────────────────────────────
# Maps any variant → canonical Title Case name
_CITY_NORM = {
    # All-caps variants of major cities
    "BANGALORE":        "Bangalore",
    "BENGALURU":        "Bangalore",
    "Bengaluru":        "Bangalore",
    "HYDERABAD":        "Hyderabad",
    "CHENNAI":          "Chennai",
    "MUMBAI":           "Mumbai",
    "DELHI":            "Delhi",
    "NEW DELHI":        "Delhi",
    "New Delhi":        "Delhi",
    "NOIDA":            "Noida",
    "GURUGRAM":         "Gurugram",
    "Gurgaon":          "Gurugram",
    "GURGAON":          "Gurugram",
    "PUNE":             "Pune",
    "KOLKATA":          "Kolkata",
    "AHMEDABAD":        "Ahmedabad",
    "SURAT":            "Surat",
    "JAIPUR":           "Jaipur",
    "LUCKNOW":          "Lucknow",
    "CHANDIGARH":       "Chandigarh",
    "BHUBANESWAR":      "Bhubaneswar",
    "INDORE":           "Indore",
    "BHOPAL":           "Bhopal",
    "PATNA":            "Patna",
    "NAGPUR":           "Nagpur",
    "VISAKHAPATNAM":    "Visakhapatnam",
    "COIMBATORE":       "Coimbatore",
    "KOCHI":            "Kochi",
    "AGRA":             "Agra",
    "VARANASI":         "Varanasi",
    "GHAZIABAD":        "Ghaziabad",
    "FARIDABAD":        "Faridabad",
    "MEERUT":           "Meerut",
    "NASHIK":           "Nashik",
    "VADODARA":         "Vadodara",
    "RAJKOT":           "Rajkot",
    "AMRITSAR":         "Amritsar",
    "LUDHIANA":         "Ludhiana",
    "RANCHI":           "Ranchi",
    "MYSORE":           "Mysuru",
    "Mysore":           "Mysuru",
    "MYSURU":           "Mysuru",
    "MANGALORE":        "Mangalore",
    "Mangaluru":        "Mangalore",
    "SRINAGAR":         "Srinagar",
    "THIRUVANANTHAPURAM": "Thiruvananthapuram",
    "THRISSUR":         "Thrissur",
    "MADURAI":          "Madurai",
    "RAIPUR":           "Raipur",
    "DEHRADUN":         "Dehradun",
    "HARIDWAR":         "Haridwar",
    "JODHPUR":          "Jodhpur",
    "UDAIPUR":          "Udaipur",
    "GWALIOR":          "Gwalior",
    "JABALPUR":         "Jabalpur",
    "SALEM":            "Salem",
    "VELLORE":          "Vellore",
    "GUNTUR":           "Guntur",
    "WARANGAL":         "Warangal",
    "AURANGABAD":       "Aurangabad",
    "NAVI MUMBAI":      "Navi Mumbai",
    "THANE":            "Thane",
    "HOWRAH":           "Howrah",
    "ALLAHABAD":        "Prayagraj",
    "Allahabad":        "Prayagraj",
    # State-named cities (city == state bug: city contains only the state name)
    "Punjab":           None,   # Will be resolved from clinic name
    "Uttar Pradesh":    None,
    "Haryana":          None,
    "Maharashtra":      None,
    "Karnataka":        None,
    "Tamil Nadu":       None,
    "Telangana":        None,
    "Rajasthan":        None,
    "Gujarat":          None,
    "West Bengal":      None,
    "Bihar":            None,
    "Madhya Pradesh":   None,
    "Andhra Pradesh":   None,
    "Odisha":           None,
    "Assam":            None,
    "Uttarakhand":      None,
    "Jharkhand":        None,
    "Chhattisgarh":     None,
    "Himachal Pradesh": None,
    "Delhi":            "Delhi",  # Delhi is both city and state — keep it
}

# ── City centroid coordinates (for Phase 2) ───────────────────────────────────
CITY_COORDS = {
    "Delhi":          (28.6139, 77.2090),
    "Bangalore":      (12.9716, 77.5946),
    "Hyderabad":      (17.3850, 78.4867),
    "Chennai":        (13.0827, 80.2707),
    "Mumbai":         (19.0760, 72.8777),
    "Pune":           (18.5204, 73.8567),
    "Kolkata":        (22.5726, 88.3639),
    "Ahmedabad":      (23.0225, 72.5714),
    "Surat":          (21.1702, 72.8311),
    "Jaipur":         (26.9124, 75.7873),
    "Lucknow":        (26.8467, 80.9462),
    "Noida":          (28.5355, 77.3910),
    "Gurugram":       (28.4595, 77.0266),
    "Ghaziabad":      (28.6692, 77.4538),
    "Faridabad":      (28.4089, 77.3178),
    "Chandigarh":     (30.7333, 76.7794),
    "Bhubaneswar":    (20.2961, 85.8245),
    "Indore":         (22.7196, 75.8577),
    "Bhopal":         (23.2599, 77.4126),
    "Patna":          (25.5941, 85.1376),
    "Nagpur":         (21.1458, 79.0882),
    "Visakhapatnam":  (17.6868, 83.2185),
    "Coimbatore":     (11.0168, 76.9558),
    "Kochi":          (9.9312,  76.2673),
    "Agra":           (27.1767, 78.0081),
    "Varanasi":       (25.3176, 82.9739),
    "Meerut":         (28.9845, 77.7064),
    "Nashik":         (19.9975, 73.7898),
    "Vadodara":       (22.3072, 73.1812),
    "Rajkot":         (22.3039, 70.8022),
    "Amritsar":       (31.6340, 74.8723),
    "Ludhiana":       (30.9010, 75.8573),
    "Ranchi":         (23.3441, 85.3096),
    "Mysuru":         (12.2958, 76.6394),
    "Mangalore":      (12.9141, 74.8560),
    "Srinagar":       (34.0837, 74.7973),
    "Thiruvananthapuram": (8.5241, 76.9366),
    "Thrissur":       (10.5276, 76.2144),
    "Madurai":        (9.9252,  78.1198),
    "Raipur":         (21.2514, 81.6296),
    "Dehradun":       (30.3165, 78.0322),
    "Haridwar":       (29.9457, 78.1642),
    "Jodhpur":        (26.2389, 73.0243),
    "Udaipur":        (24.5854, 73.7125),
    "Gwalior":        (26.2183, 78.1828),
    "Jabalpur":       (23.1815, 79.9864),
    "Salem":          (11.6643, 78.1460),
    "Vellore":        (12.9165, 79.1325),
    "Guntur":         (16.3067, 80.4365),
    "Warangal":       (17.9784, 79.5941),
    "Aurangabad":     (19.8762, 75.3433),
    "Navi Mumbai":    (19.0330, 73.0297),
    "Thane":          (19.2183, 72.9781),
    "Howrah":         (22.5958, 88.2636),
    "Prayagraj":      (25.4358, 81.8463),
    "Secunderabad":   (17.4399, 78.4983),
    "Jalandhar":      (31.3260, 75.5762),
    "Mohali":         (30.7046, 76.7179),
    "Panchkula":      (30.6942, 76.8606),
    "Panipat":        (29.3909, 76.9635),
    "Ambala":         (30.3752, 76.7821),
    "Rohtak":         (28.8955, 76.6066),
    "Bhiwadi":        (28.2070, 76.8540),
    "Kolhapur":       (16.7050, 74.2433),
    "Solapur":        (17.6868, 75.9064),
    "Nanded":         (19.1383, 77.3210),
    "Akola":          (20.7002, 77.0082),
    "Latur":          (18.4088, 76.5604),
    "Dhule":          (20.9042, 74.7749),
    "Sangli":         (16.8524, 74.5815),
    "Satara":         (17.6805, 73.9947),
    "Ahmednagar":     (19.0948, 74.7480),
    "Navi Mumbai":    (19.0330, 73.0297),
    "Kalyan":         (19.2403, 73.1305),
    "Vasai":          (19.4911, 72.8051),
    "Bhiwandi":       (19.2967, 73.0631),
    "Ujjain":         (23.1765, 75.7885),
    "Gwalior":        (26.2183, 78.1828),
    "Jabalpur":       (23.1815, 79.9864),
    "Sagar":          (23.8388, 78.7378),
    "Dewas":          (22.9676, 76.0534),
    "Ratlam":         (23.3315, 75.0367),
    "Singrauli":      (24.1997, 82.6739),
    "Cuttack":        (20.4625, 85.8830),
    "Berhampur":      (19.3150, 84.7941),
    "Sambalpur":      (21.4669, 83.9756),
    "Rourkela":       (22.2604, 84.8536),
    "Guwahati":       (26.1445, 91.7362),
    "Silchar":        (24.8333, 92.7789),
    "Dibrugarh":      (27.4728, 94.9120),
    "Cooch Behar":    (26.3452, 89.4439),
    "Durgapur":       (23.5204, 87.3119),
    "Asansol":        (23.6739, 86.9524),
    "Siliguri":       (26.7271, 88.3953),
    "Malda":          (25.0108, 88.1415),
    "Bardhaman":      (23.2324, 87.8615),
    "Jamshedpur":     (22.8046, 86.2029),
    "Dhanbad":        (23.7957, 86.4304),
    "Bokaro":         (23.6693, 85.9953),
    "Muzaffarpur":    (26.1225, 85.3906),
    "Bhagalpur":      (25.2425, 86.9842),
    "Gaya":           (24.7955, 84.9994),
    "Darbhanga":      (26.1542, 85.8918),
    "Purnia":         (25.7771, 87.4753),
    "Kanpur":         (26.4499, 80.3319),
    "Agra":           (27.1767, 78.0081),
    "Bareilly":       (28.3670, 79.4304),
    "Gorakhpur":      (26.7606, 83.3732),
    "Aligarh":        (27.8974, 78.0880),
    "Moradabad":      (28.8386, 78.7733),
    "Saharanpur":     (29.9680, 77.5510),
    "Muzaffarnagar":  (29.4727, 77.7085),
    "Jodhpur":        (26.2389, 73.0243),
    "Kota":           (25.2138, 75.8648),
    "Bikaner":        (28.0229, 73.3119),
    "Ajmer":          (26.4499, 74.6399),
}


# ── Address string cleaner ────────────────────────────────────────────────────
# Apollo / Clove Dental / etc. addresses often repeat city+state+pincode in the
# address string: "Sector 67, Gurugram, Haryana 122101 Haryana Gurugram 122101"
def clean_address_string(address: str, city: str, state: str, pincode: str) -> str:
    """Remove repeated city/state/pincode appended at end of address string."""
    s = str(address or "").strip()
    # Iteratively strip trailing repetitions of pincode, state, city
    for _ in range(3):
        for token in [pincode, state, city]:
            if token:
                # Remove trailing occurrence (with optional surrounding spaces/commas)
                s = re.sub(r'[\s,]+' + re.escape(token) + r'\s*$', '', s, flags=re.IGNORECASE).strip()
    return s.strip().strip(",").strip()


def normalize_city(city: str) -> str:
    """Return canonical city name or original if not in map.
    Returns None if city is actually a state name (city==state bug)."""
    if not city:
        return city
    normalized = _CITY_NORM.get(city.strip())
    if normalized is None and city.strip() in _CITY_NORM:
        # Explicitly mapped to None → city is a state name, not a real city
        return None
    # Try upper-case variant
    up = city.upper().strip()
    if up in _CITY_NORM:
        return _CITY_NORM[up]
    return _CITY_NORM.get(city.strip(), city.strip())


def extract_city_from_name(clinic_name: str, state: str) -> str:
    """
    For Clove Dental format: "Clove Dental, Area, City, State"
    Extract the city portion (2nd-to-last comma-separated segment before state).
    """
    parts = [p.strip() for p in clinic_name.split(",")]
    # Filter out empty and the state name
    meaningful = [p for p in parts if p and p.lower() != (state or "").lower()]
    # The city is typically the last meaningful segment
    if meaningful:
        return meaningful[-1]
    return ""


def build_formatted(name: str, location: dict) -> str:
    """Build clean customer-friendly formatted address."""
    address  = clean_address_string(
        location.get("address") or "",
        location.get("city") or "",
        location.get("state") or "",
        location.get("pincode") or "",
    )
    city    = normalize_city(str(location.get("city") or "")) or ""
    state   = str(location.get("state") or "").strip()
    pincode = str(location.get("pincode") or "").strip()

    # If city is bad (equals state), try to extract from clinic name
    if not city and state:
        city = extract_city_from_name(name, state)

    parts = []
    if address and address.lower() not in ("none", "null", ""):
        parts.append(address)
    if city and city not in " ".join(parts):
        parts.append(city)
    if state and state.lower() not in [p.lower() for p in parts]:
        parts.append(state)
    if pincode:
        parts.append(pincode)

    return ", ".join(p.strip() for p in parts if p.strip())


# ── Phase 1 ──────────────────────────────────────────────────────────────────
def phase1_clean_all(cur, dry_run: bool):
    print("\n" + "="*60)
    print("PHASE 1: Clean addresses and normalize city names")
    print("="*60)

    cur.execute("SELECT id, unique_id, name, location, latitude, longitude FROM provider_clinics ORDER BY id")
    clinics = cur.fetchall()
    print(f"Total clinics: {len(clinics)}\n")

    updated = already = skipped = 0
    for row in clinics:
        db_id, uid, name, loc, db_lat, db_lng = row
        if not isinstance(loc, dict):
            try:
                loc = json.loads(loc) if loc else {}
            except Exception:
                loc = {}

        raw_city   = str(loc.get("city") or "").strip()
        raw_state  = str(loc.get("state") or "").strip()
        raw_addr   = str(loc.get("address") or "").strip()
        raw_pin    = str(loc.get("pincode") or "").strip()

        # Normalize city
        norm_city = normalize_city(raw_city)
        # If city was a state name (mapped to None), infer from clinic name
        if norm_city is None:
            norm_city = extract_city_from_name(name, raw_state) or ""

        # Proper-case state if ALL CAPS
        norm_state = raw_state.title() if raw_state.isupper() else raw_state

        # Clean address string (strip repeated city/state/pincode at end)
        clean_addr = clean_address_string(raw_addr, raw_city, raw_state, raw_pin)

        # Sync coords: if lat/lng are in location JSONB but not in columns, pull them out
        loc_lat = loc.get("latitude") or loc.get("lat")
        loc_lng = loc.get("longitude") or loc.get("lng")
        sync_lat = float(loc_lat) if loc_lat and not db_lat else (float(db_lat) if db_lat else None)
        sync_lng = float(loc_lng) if loc_lng and not db_lng else (float(db_lng) if db_lng else None)

        # Build formatted address
        new_loc = dict(loc)
        new_loc["city"]    = norm_city or raw_city
        new_loc["state"]   = norm_state
        new_loc["address"] = clean_addr
        # Remove coords from inside JSONB (they belong in the dedicated columns)
        new_loc.pop("latitude", None)
        new_loc.pop("longitude", None)
        new_loc.pop("coordinates", None)

        formatted = build_formatted(name, new_loc)
        new_loc["formatted_address"] = formatted

        city_changed   = norm_city and norm_city != raw_city
        state_changed  = norm_state != raw_state
        addr_changed   = clean_addr != raw_addr
        fmt_added      = bool(formatted)
        coord_sync     = (sync_lat and not db_lat) or (sync_lng and not db_lng)

        needs_update = city_changed or state_changed or addr_changed or fmt_added or coord_sync

        if not needs_update:
            already += 1
            continue

        if not formatted and not coord_sync:
            skipped += 1
            continue

        if city_changed:
            print(f"  [{db_id}] {name[:45]}")
            print(f"    city:    {raw_city!r} → {norm_city!r}")
        if addr_changed and len(raw_addr) != len(clean_addr):
            print(f"  [{db_id}] address cleaned ({len(raw_addr)}→{len(clean_addr)} chars)")

        if not dry_run:
            cur.execute(
                """UPDATE provider_clinics
                   SET location = %s::jsonb,
                       latitude  = COALESCE(latitude,  %s),
                       longitude = COALESCE(longitude, %s),
                       updated_at = NOW()
                   WHERE id = %s""",
                (json.dumps(new_loc), sync_lat, sync_lng, db_id)
            )
        updated += 1

    if not dry_run and updated:
        cur.connection.commit()

    print(f"\nPhase 1 done — updated: {updated}, already clean: {already}, skipped: {skipped}")


# ── Phase 2 ──────────────────────────────────────────────────────────────────
def phase2_fill_coords(cur, dry_run: bool):
    print("\n" + "="*60)
    print("PHASE 2: Fill missing coordinates (city-centroid fallback)")
    print("="*60)

    cur.execute("""
        SELECT id, unique_id, name, location, latitude, longitude
        FROM provider_clinics
        WHERE latitude IS NULL OR longitude IS NULL
        ORDER BY id
    """)
    clinics = cur.fetchall()
    print(f"Clinics needing coordinates: {len(clinics)}\n")

    if not clinics:
        print("All clinics already have coordinates!")
        return

    updated = skipped = 0
    no_match = []

    for row in clinics:
        db_id, uid, name, loc, _, _ = row
        if not isinstance(loc, dict):
            try:
                loc = json.loads(loc) if loc else {}
            except Exception:
                loc = {}

        city  = str(loc.get("city") or "").strip()
        state = str(loc.get("state") or "").strip()

        # Normalise city for lookup
        lookup_city = normalize_city(city) or city

        coords = CITY_COORDS.get(lookup_city)
        if not coords:
            # Try case-insensitive partial match
            for k, v in CITY_COORDS.items():
                if k.lower() == lookup_city.lower():
                    coords = v
                    break

        if not coords:
            print(f"  [{db_id}] SKIP — no coords for city: {city!r} ({name[:40]})")
            no_match.append((db_id, name, city))
            skipped += 1
            continue

        lat, lng = coords
        lat += random.uniform(-0.015, 0.015)
        lng += random.uniform(-0.015, 0.015)
        lat = round(lat, 6)
        lng = round(lng, 6)

        new_loc = dict(loc)
        new_loc["geocoded_source"] = "city_centroid"

        print(f"  [{db_id}] {name[:50]} — {lookup_city} → ({lat}, {lng})")

        if not dry_run:
            cur.execute(
                """UPDATE provider_clinics
                   SET latitude = %s, longitude = %s,
                       location = %s::jsonb,
                       updated_at = NOW()
                   WHERE id = %s""",
                (lat, lng, json.dumps(new_loc), db_id)
            )
        updated += 1

    if not dry_run and updated:
        cur.connection.commit()

    print(f"\nPhase 2 done — coords added: {updated}, skipped: {skipped}")

    if no_match:
        print(f"\nClinics without city match ({len(no_match)}):")
        for db_id, nm, cy in no_match:
            print(f"  [{db_id}] city={cy!r}  {nm[:50]}")


# ── Summary ───────────────────────────────────────────────────────────────────
def print_summary(cur):
    cur.execute("SELECT COUNT(*) FROM provider_clinics")
    total = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM provider_clinics WHERE latitude IS NOT NULL AND longitude IS NOT NULL")
    geocoded = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM provider_clinics WHERE location->>'formatted_address' IS NOT NULL")
    formatted = cur.fetchone()[0]
    print(f"\n{'='*60}")
    print(f"FINAL STATE")
    print(f"  Total clinics:    {total}")
    print(f"  Has coordinates:  {geocoded} / {total} ({100*geocoded//total}%)")
    print(f"  Has formatted:    {formatted} / {total} ({100*formatted//total}%)")
    print(f"{'='*60}")


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Clean and geocode all clinic addresses")
    parser.add_argument("--phase", type=int, choices=[1, 2], help="Run only phase 1 or 2")
    parser.add_argument("--dry-run", action="store_true", help="Preview without DB writes")
    args = parser.parse_args()

    if args.dry_run:
        print("⚠️  DRY RUN — no database changes will be made\n")

    conn = psycopg2.connect(**DB)
    cur  = conn.cursor()

    try:
        if args.phase != 2:
            phase1_clean_all(cur, args.dry_run)
        if args.phase != 1:
            phase2_fill_coords(cur, args.dry_run)
        if not args.dry_run:
            print_summary(cur)
    finally:
        cur.close()
        conn.close()

    print("\n✅ All done!")


if __name__ == "__main__":
    main()
