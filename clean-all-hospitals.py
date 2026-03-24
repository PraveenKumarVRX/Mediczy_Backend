#!/usr/bin/env python3
"""
Hospital Address Cleaning — Two-Phase
========================================
Phase 1 (fast, no API):
  - Generate formatted_address stored in metadata JSONB for ALL hospitals
  - Normalize city names (fix misspellings, aliases → canonical)
  - Clean address strings (strip trailing repeated city/state/pincode)

Phase 2 (city-centroid, no API):
  - Apply city-centroid lat/lng to any hospitals still missing coordinates
  - Fix city name misspellings on the city column while applying coords
  - Small random jitter (±0.015°) so same-city hospitals don't stack on map
  - Marks geocoded_source='city_centroid' in metadata for future re-geocoding

The hospitals table uses FLAT columns (not JSONB location):
  address TEXT, city VARCHAR, state VARCHAR, pincode VARCHAR,
  latitude NUMERIC, longitude NUMERIC, metadata JSONB

Usage:
  python3 clean-all-hospitals.py            # both phases
  python3 clean-all-hospitals.py --phase 1  # format + normalize only
  python3 clean-all-hospitals.py --phase 2  # fill missing coords only
  python3 clean-all-hospitals.py --dry-run  # preview, no DB writes
"""

import re, json, random, argparse, psycopg2

DB = dict(host="127.0.0.1", port=5432, dbname="mediczy_ai",
          user="mediczy_helper", password="Mediczy2024Helper")

# ── City name normalization & misspelling corrections ─────────────────────────
# Maps any variant/misspelling → canonical name
_CITY_NORM = {
    # All-caps variants
    "BANGALORE":            "Bangalore",
    "BENGALURU":            "Bangalore",
    "Bengaluru":            "Bangalore",
    "HYDERABAD":            "Hyderabad",
    "CHENNAI":              "Chennai",
    "MUMBAI":               "Mumbai",
    "DELHI":                "Delhi",
    "NEW DELHI":            "Delhi",
    "New Delhi":            "Delhi",
    "NOIDA":                "Noida",
    "GURUGRAM":             "Gurugram",
    "Gurgaon":              "Gurugram",
    "GURGAON":              "Gurugram",
    "PUNE":                 "Pune",
    "KOLKATA":              "Kolkata",
    "CALCUTTA":             "Kolkata",
    "Calcutta":             "Kolkata",
    "AHMEDABAD":            "Ahmedabad",
    "SURAT":                "Surat",
    "JAIPUR":               "Jaipur",
    "LUCKNOW":              "Lucknow",
    "CHANDIGARH":           "Chandigarh",
    "BHUBANESWAR":          "Bhubaneswar",
    "INDORE":               "Indore",
    "BHOPAL":               "Bhopal",
    "PATNA":                "Patna",
    "NAGPUR":               "Nagpur",
    "VISAKHAPATNAM":        "Visakhapatnam",
    "Vishakhapatnam":       "Visakhapatnam",
    "COIMBATORE":           "Coimbatore",
    "KOCHI":                "Kochi",
    "AGRA":                 "Agra",
    "VARANASI":             "Varanasi",
    "GHAZIABAD":            "Ghaziabad",
    "FARIDABAD":            "Faridabad",
    "MEERUT":               "Meerut",
    "NASHIK":               "Nashik",
    "VADODARA":             "Vadodara",
    "RAJKOT":               "Rajkot",
    "AMRITSAR":             "Amritsar",
    "LUDHIANA":             "Ludhiana",
    "RANCHI":               "Ranchi",
    "MYSORE":               "Mysuru",
    "Mysore":               "Mysuru",
    "MYSURU":               "Mysuru",
    "MANGALORE":            "Mangalore",
    "Mangaluru":            "Mangalore",
    "SRINAGAR":             "Srinagar",
    "ALLAHABAD":            "Prayagraj",
    "Allahabad":            "Prayagraj",
    # Misspellings found in the data
    "Sambalpura":           "Sambalpur",
    "Rudhrapur":            "Rudrapur",
    "Panchkulla":           "Panchkula",
    "Metturpalayam":        "Mettupalayam",
    "Chikmagalore":         "Chikmagalur",
    "Chikmaglur":           "Chikmagalur",
    "Chikkamagalooru":      "Chikmagalur",
    "Bulandshar":           "Bulandshahr",
    "Miryalguda":           "Miryalaguda",
    "Trichirappalli":       "Tiruchirappalli",
    "Thiruchirappalli":     "Tiruchirappalli",
    "Bhiwari":              "Bhiwadi",
    "Chandarpur":           "Chandrapur",
    "Nagarcoil":            "Nagercoil",
    "Bhadravathy":          "Bhadravati",
    "Thiunelveli":          "Tirunelveli",
    "Chengalpatn":          "Chengalpattu",
    "Srikalashati":         "Srikalahasti",
    "Tiruvammamalai":       "Thiruvannamalai",
    "Azamgath":             "Azamgarh",
    "Shrinagar":            "Srinagar",
    "Mushidabad":           "Murshidabad",
    "Bolpore":              "Bolpur",
    "Sabarkanatha":         "Sabarkantha",
    "Thodapuzha":           "Thodupuzha",
    "Changanaserry":        "Changanacherry",
    "Uttaranchal":          None,  # State name in city field — resolve from state
    "Ramgarh Cantt.":       "Ramgarh",
    "Bokaro Steel City":    "Bokaro",
    "Machilipatnam  Mahaboobnaga": "Machilipatnam",  # two cities concatenated
    "Perurkada":            "Thiruvananthapuram",  # suburb of
    "Maarthandam":          "Marthandam",
    "Kavindapadi":          "Gobichettipalayam",  # nearest geocodable town
    "Thammanyakkanpatti":   "Dindigul",            # in Dindigul district
    "24 Paraganas":         "Kolkata",
    "Lakanpur":             "Lucknow",             # likely Lucknow suburb
    "Bargakih":             "Bargarh",
    "Subhash Nagar":        "Jammu",
    "Kufri Kullu":          "Kullu",
    "Mallakapuram":         "Vijayawada",          # in Vijayawada area
    "Patencheru":           "Hyderabad",           # Hyderabad suburb
    "Shapur Nagar":         "Hyderabad",
    "Dadri":                "Hapur",               # Hapur/Dadri area
}

# ── City centroid coordinates ─────────────────────────────────────────────────
CITY_COORDS = {
    "Delhi":                (28.6139, 77.2090),
    "Bangalore":            (12.9716, 77.5946),
    "Hyderabad":            (17.3850, 78.4867),
    "Chennai":              (13.0827, 80.2707),
    "Mumbai":               (19.0760, 72.8777),
    "Pune":                 (18.5204, 73.8567),
    "Kolkata":              (22.5726, 88.3639),
    "Ahmedabad":            (23.0225, 72.5714),
    "Surat":                (21.1702, 72.8311),
    "Jaipur":               (26.9124, 75.7873),
    "Lucknow":              (26.8467, 80.9462),
    "Noida":                (28.5355, 77.3910),
    "Gurugram":             (28.4595, 77.0266),
    "Ghaziabad":            (28.6692, 77.4538),
    "Faridabad":            (28.4089, 77.3178),
    "Chandigarh":           (30.7333, 76.7794),
    "Bhubaneswar":          (20.2961, 85.8245),
    "Indore":               (22.7196, 75.8577),
    "Bhopal":               (23.2599, 77.4126),
    "Patna":                (25.5941, 85.1376),
    "Nagpur":               (21.1458, 79.0882),
    "Visakhapatnam":        (17.6868, 83.2185),
    "Coimbatore":           (11.0168, 76.9558),
    "Kochi":                (9.9312,  76.2673),
    "Agra":                 (27.1767, 78.0081),
    "Varanasi":             (25.3176, 82.9739),
    "Meerut":               (28.9845, 77.7064),
    "Nashik":               (19.9975, 73.7898),
    "Vadodara":             (22.3072, 73.1812),
    "Rajkot":               (22.3039, 70.8022),
    "Amritsar":             (31.6340, 74.8723),
    "Ludhiana":             (30.9010, 75.8573),
    "Ranchi":               (23.3441, 85.3096),
    "Mysuru":               (12.2958, 76.6394),
    "Mangalore":            (12.9141, 74.8560),
    "Srinagar":             (34.0837, 74.7973),
    "Thiruvananthapuram":   (8.5241,  76.9366),
    "Thrissur":             (10.5276, 76.2144),
    "Madurai":              (9.9252,  78.1198),
    "Raipur":               (21.2514, 81.6296),
    "Dehradun":             (30.3165, 78.0322),
    "Haridwar":             (29.9457, 78.1642),
    "Jodhpur":              (26.2389, 73.0243),
    "Udaipur":              (24.5854, 73.7125),
    "Gwalior":              (26.2183, 78.1828),
    "Jabalpur":             (23.1815, 79.9864),
    "Salem":                (11.6643, 78.1460),
    "Vellore":              (12.9165, 79.1325),
    "Guntur":               (16.3067, 80.4365),
    "Vijayawada":           (16.5062, 80.6480),
    "Warangal":             (17.9784, 79.5941),
    "Aurangabad":           (19.8762, 75.3433),
    "Navi Mumbai":          (19.0330, 73.0297),
    "Thane":                (19.2183, 72.9781),
    "Howrah":               (22.5958, 88.2636),
    "Prayagraj":            (25.4358, 81.8463),
    "Secunderabad":         (17.4399, 78.4983),
    "Jalandhar":            (31.3260, 75.5762),
    "Mohali":               (30.7046, 76.7179),
    "Panchkula":            (30.6942, 76.8606),
    "Panipat":              (29.3909, 76.9635),
    "Ambala":               (30.3752, 76.7821),
    "Rohtak":               (28.8955, 76.6066),
    "Bhiwadi":              (28.2070, 76.8540),
    "Kolhapur":             (16.7050, 74.2433),
    "Solapur":              (17.6868, 75.9064),
    "Nanded":               (19.1383, 77.3210),
    "Akola":                (20.7002, 77.0082),
    "Sangli":               (16.8524, 74.5815),
    "Satara":               (17.6805, 73.9947),
    "Ahmednagar":           (19.0948, 74.7480),
    "Kalyan":               (19.2403, 73.1305),
    "Ujjain":               (23.1765, 75.7885),
    "Sagar":                (23.8388, 78.7378),
    "Cuttack":              (20.4625, 85.8830),
    "Berhampur":            (19.3150, 84.7941),
    "Sambalpur":            (21.4669, 83.9756),
    "Rourkela":             (22.2604, 84.8536),
    "Guwahati":             (26.1445, 91.7362),
    "Durgapur":             (23.5204, 87.3119),
    "Asansol":              (23.6739, 86.9524),
    "Siliguri":             (26.7271, 88.3953),
    "Jamshedpur":           (22.8046, 86.2029),
    "Dhanbad":              (23.7957, 86.4304),
    "Bokaro":               (23.6693, 85.9953),
    "Muzaffarpur":          (26.1225, 85.3906),
    "Bhagalpur":            (25.2425, 86.9842),
    "Gaya":                 (24.7955, 84.9994),
    "Darbhanga":            (26.1542, 85.8918),
    "Purnia":               (25.7771, 87.4753),
    "Kanpur":               (26.4499, 80.3319),
    "Bareilly":             (28.3670, 79.4304),
    "Gorakhpur":            (26.7606, 83.3732),
    "Aligarh":              (27.8974, 78.0880),
    "Moradabad":            (28.8386, 78.7733),
    "Saharanpur":           (29.9680, 77.5510),
    "Muzaffarnagar":        (29.4727, 77.7085),
    "Kota":                 (25.2138, 75.8648),
    "Bikaner":              (28.0229, 73.3119),
    "Ajmer":                (26.4499, 74.6399),
    "Bolpur":               (23.6722, 87.7167),
    "Murshidabad":          (24.1837, 88.2717),
    "Bargarh":              (21.3370, 83.6187),
    "Ramgarh":              (23.6279, 85.5238),
    "Nagercoil":            (8.1833,  77.4119),
    "Tiruchirappalli":      (10.7905, 78.7047),
    "Tirunelveli":          (8.7139,  77.7567),
    "Chengalpattu":         (12.6926, 79.9759),
    "Srikalahasti":         (13.6481, 79.7013),
    "Thiruvannamalai":      (12.2253, 79.0747),
    "Azamgarh":             (26.0670, 83.1836),
    "Marthandam":           (8.3081,  77.2258),
    "Chikmagalur":          (13.3153, 75.7754),
    "Bulandshahr":          (28.4069, 77.8498),
    "Miryalaguda":          (16.8724, 79.5683),
    "Mettupalayam":         (11.2994, 76.9358),
    "Bhadravati":           (13.8490, 75.7057),
    "Rudrapur":             (28.9726, 79.3992),
    "Chandrapur":           (19.9615, 79.2961),
    "Changanacherry":       (9.4402,  76.5378),
    "Thodupuzha":           (9.8970,  76.7168),
    "Sabarkantha":          (23.8024, 72.9635),
    "Kullu":                (31.9592, 77.1089),
    "Sangareddy":           (17.6248, 78.0862),
    "Nalgonda":             (17.0575, 79.2671),
    "Mancherial":           (18.8701, 79.4605),
    "Adilabad":             (19.6647, 78.5319),
    "Sircilla":             (18.3864, 78.8189),
    "Siddipet":             (18.1012, 78.8521),
    "Jagityal":             (18.8016, 78.9160),
    "Jammikunta":           (18.1278, 79.5070),
    "Machilipatnam":        (16.1875, 81.1320),
    "Palakole":             (16.5170, 81.7338),
    "Kodad":                (16.9980, 79.9700),
    "Honavar":              (14.2793, 74.4470),
    "Rabkhavi":             (16.4860, 75.1190),
    "Udumalaipet":          (10.5764, 77.2489),
    "Hapur":                (28.7294, 77.7760),
    "Charki Dadri":         (28.5923, 76.2714),
    "Sahibganj":            (25.2484, 87.6347),
    "Jammu":                (32.7266, 74.8570),
    "Patiala":              (30.3398, 76.3869),
    "Bathinda":             (30.2110, 74.9455),
    "Hoshiarpur":           (31.5143, 75.9116),
    "Firozpur":             (30.9254, 74.6099),
    "Shimla":               (31.1048, 77.1734),
    "Mandi":                (31.7085, 76.9320),
    "Hamirpur":             (31.6862, 76.5213),
    "Bilaspur":             (31.3401, 76.7602),
    "Gobichettipalayam":    (11.4569, 77.4347),
    "Dindigul":             (10.3624, 77.9695),
    "Karad":                (17.2885, 74.1820),
    "Gandhinglaj":          (16.2154, 74.3567),
    "Mirzapur":             (25.1451, 82.5694),
    "Goa":                  (15.2993, 74.1240),
}


# ── Address string cleaner ────────────────────────────────────────────────────
def clean_address_string(address: str, city: str, state: str, pincode: str) -> str:
    """Remove repeated city/state/pincode appended at end of address string."""
    s = str(address or "").strip()
    for _ in range(3):
        for token in [pincode, state, city]:
            if token:
                s = re.sub(r'[\s,]+' + re.escape(str(token)) + r'\s*$', '', s,
                           flags=re.IGNORECASE).strip()
    return s.strip().strip(",").strip()


def normalize_city(city: str) -> str:
    """Return canonical city name. Returns original if not in map."""
    if not city:
        return city
    c = city.strip()
    mapped = _CITY_NORM.get(c)
    if mapped is None and c in _CITY_NORM:
        return c  # explicitly mapped to None means keep as-is (union territory)
    return mapped if mapped else c


def build_formatted(address, city, state, pincode):
    """Assemble formatted_address from flat columns."""
    parts = []
    addr_clean = clean_address_string(address, city, state, pincode)
    if addr_clean:
        parts.append(addr_clean[:120])
    if city:
        parts.append(city)
    if state:
        parts.append(state)
    if pincode:
        parts.append(str(pincode))
    return ", ".join(p for p in parts if p)


# ── Phase 1: Build formatted_address for all hospitals ───────────────────────
def phase1_format_all(cur, dry_run=False):
    print("=" * 60)
    print("PHASE 1: Build formatted_address + normalize cities")
    print("=" * 60)

    cur.execute("""
        SELECT id, hospital_name, address, city, state, pincode, metadata
        FROM hospitals
        ORDER BY id
    """)
    rows = cur.fetchall()
    print(f"Total hospitals: {len(rows)}")

    updated = already_clean = skipped = 0

    for hospital_id, name, address, city, state, pincode, metadata in rows:
        meta = metadata or {}

        # Normalize city
        new_city = normalize_city(city) if city else city
        city_changed = new_city != city and new_city is not None

        # Build formatted address (using normalized city for quality)
        display_city = new_city if new_city else city
        formatted = build_formatted(address, display_city, state, pincode)

        existing_formatted = meta.get("formatted_address")

        # Check if any change needed
        needs_update = (
            not existing_formatted or
            existing_formatted != formatted or
            city_changed
        )

        if not needs_update:
            already_clean += 1
            continue

        if dry_run:
            if city_changed:
                print(f"  [{hospital_id}] {name}")
                print(f"    city: {city!r} → {new_city!r}")
            updated += 1
            continue

        # Update metadata JSONB with formatted_address
        new_meta = {**meta, "formatted_address": formatted}

        if city_changed and new_city:
            cur.execute(
                """UPDATE hospitals
                   SET metadata   = %s::jsonb,
                       city       = %s,
                       updated_at = NOW()
                   WHERE id = %s""",
                (json.dumps(new_meta), new_city, hospital_id)
            )
        else:
            cur.execute(
                """UPDATE hospitals
                   SET metadata   = %s::jsonb,
                       updated_at = NOW()
                   WHERE id = %s""",
                (json.dumps(new_meta), hospital_id)
            )
        updated += 1

    print(f"\nPhase 1 done — updated: {updated}, already clean: {already_clean}, skipped: {skipped}")


# ── Phase 2: Fill missing lat/lng with city centroids ────────────────────────
def phase2_geocode_missing(cur, dry_run=False):
    print("=" * 60)
    print("PHASE 2: Fill missing coordinates (city-centroid fallback)")
    print("=" * 60)

    cur.execute("""
        SELECT id, hospital_name, city, state, metadata
        FROM hospitals
        WHERE latitude IS NULL OR longitude IS NULL
        ORDER BY id
    """)
    rows = cur.fetchall()
    print(f"Hospitals needing coordinates: {len(rows)}")

    if not rows:
        print("All hospitals already have coordinates!")
        return

    updated = skipped = 0

    for hospital_id, name, city, state, metadata in rows:
        # Apply city normalization first
        canonical_city = normalize_city(city) if city else city

        # Look up coords by canonical city, then original
        coords = CITY_COORDS.get(canonical_city) or CITY_COORDS.get(city or "")

        if not coords:
            # Try partial match
            city_lower = (canonical_city or city or "").lower()
            for k, v in CITY_COORDS.items():
                if k.lower() in city_lower or city_lower in k.lower():
                    coords = v
                    break

        if not coords:
            print(f"  [{hospital_id}] SKIP — no coords for city: {city!r} (→ {canonical_city!r})")
            skipped += 1
            continue

        lat, lng = coords
        lat += random.uniform(-0.015, 0.015)
        lng += random.uniform(-0.015, 0.015)

        if dry_run:
            print(f"  [{hospital_id}] {name} — {city} → lat={lat:.4f}, lng={lng:.4f}")
            updated += 1
            continue

        meta = metadata or {}
        new_meta = {**meta, "geocoded_source": "city_centroid"}

        # Update coords and fix city name if corrected
        if canonical_city and canonical_city != city:
            cur.execute(
                """UPDATE hospitals
                   SET latitude  = %s, longitude = %s,
                       city      = %s,
                       metadata  = %s::jsonb,
                       updated_at = NOW()
                   WHERE id = %s""",
                (round(lat, 6), round(lng, 6), canonical_city, json.dumps(new_meta), hospital_id)
            )
        else:
            cur.execute(
                """UPDATE hospitals
                   SET latitude  = %s, longitude = %s,
                       metadata  = %s::jsonb,
                       updated_at = NOW()
                   WHERE id = %s""",
                (round(lat, 6), round(lng, 6), json.dumps(new_meta), hospital_id)
            )
        updated += 1

    print(f"\nPhase 2 done — coords applied: {updated}, skipped: {skipped}")


# ── Main ─────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Clean and geocode all hospital addresses")
    parser.add_argument("--phase", type=int, choices=[1, 2], help="Run only phase 1 or 2")
    parser.add_argument("--dry-run", action="store_true", help="Preview without DB writes")
    args = parser.parse_args()

    conn = psycopg2.connect(**DB)
    cur = conn.cursor()

    run_all = args.phase is None
    dry_run = args.dry_run

    if dry_run:
        print("⚠️  DRY RUN — no changes will be written\n")

    if run_all or args.phase == 1:
        phase1_format_all(cur, dry_run)
        if not dry_run:
            conn.commit()

    if run_all or args.phase == 2:
        print()
        phase2_geocode_missing(cur, dry_run)
        if not dry_run:
            conn.commit()

    # Final summary
    cur.execute("SELECT COUNT(*) FROM hospitals")
    total = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM hospitals WHERE latitude IS NOT NULL AND longitude IS NOT NULL")
    geocoded = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM hospitals WHERE metadata->>'formatted_address' IS NOT NULL")
    formatted = cur.fetchone()[0]

    print()
    print("=" * 60)
    print("FINAL STATE")
    print(f"  Total hospitals:  {total}")
    print(f"  Has coordinates:  {geocoded} / {total} ({100*geocoded//total}%)")
    print(f"  Has formatted:    {formatted} / {total} ({100*formatted//total}%)")
    print("=" * 60)
    print()
    print("✅ All done!")

    conn.close()


if __name__ == "__main__":
    main()
