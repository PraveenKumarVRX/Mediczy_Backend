#!/usr/bin/env python3
"""
Export doctor data for Chennai, Bangalore/Bengaluru, and Hyderabad
with organization linkage and QC sheets.

Output:
  exports/doctors-city-qc-<timestamp>.xlsx
"""

from __future__ import annotations

import json
import re
import time
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen

import psycopg2
from openpyxl import Workbook


DB_CONFIG = {
    "host": "127.0.0.1",
    "port": 5432,
    "dbname": "mediczy_ai",
    "user": "mediczy_helper",
    "password": "Mediczy2024Helper",
}

CITY_ALIASES = {
    "chennai": {"chennai"},
    "bangalore": {"bangalore", "bengaluru"},
    "hyderabad": {"hyderabad"},
}

GOOGLE_API_KEY = "AIzaSyAuYgocNCvs Nuf8uW6G43vdSw74TYraXb4".replace(" ", "")


def as_dict(value):
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            return {}
    return {}


def as_list(value):
    if isinstance(value, list):
        return [str(x).strip() for x in value if str(x).strip()]
    if isinstance(value, str) and value.strip():
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return [str(x).strip() for x in parsed if str(x).strip()]
        except Exception:
            pass
        return [x.strip() for x in value.split(",") if x.strip()]
    return []


def infer_city(record):
    clinic_json = as_dict(record.get("clinic_address_json"))
    tenant_addr = as_dict(record.get("tenant_address"))
    metadata = as_dict(record.get("metadata"))
    web_scraped = as_dict(metadata.get("web_scraped"))

    candidates = [
        clinic_json.get("city"),
        record.get("hospital_city"),
        tenant_addr.get("city"),
        as_dict(web_scraped.get("address")).get("city"),
    ]

    for c in candidates:
        if c and str(c).strip():
            return str(c).strip()

    clinic_address = str(record.get("clinic_address") or "").lower()
    for city, aliases in CITY_ALIASES.items():
        for alias in aliases:
            if alias in clinic_address:
                return city.title()

    return ""


def city_bucket(city_text):
    c = str(city_text or "").strip().lower()
    for bucket, aliases in CITY_ALIASES.items():
        if c in aliases:
            return bucket
    return None


def first_non_empty(*values):
    for value in values:
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        return value
    return ""


def to_text(value):
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=True)
    return str(value)


def build_row(record):
    metadata = as_dict(record.get("metadata"))
    web_scraped = as_dict(metadata.get("web_scraped"))
    social_links = as_dict(record.get("social_links"))
    clinic_json = as_dict(record.get("clinic_address_json"))
    tenant_addr = as_dict(record.get("tenant_address"))

    doctor_name = f"{record.get('first_name', '')} {record.get('last_name', '')}".strip()

    qualifications = as_list(record.get("qualifications"))
    scraped_quals = as_list(web_scraped.get("qualifications"))
    education = first_non_empty(
        ", ".join(qualifications) if qualifications else "",
        record.get("qualification"),
        ", ".join(scraped_quals) if scraped_quals else "",
    )

    org_name = first_non_empty(
        record.get("tenant_name"),
        record.get("hospital_name"),
        web_scraped.get("clinic_name"),
    )

    org_slug = first_non_empty(
        record.get("tenant_slug"),
        web_scraped.get("clinic_slug"),
    )

    org_address = first_non_empty(
        record.get("clinic_address"),
        record.get("hospital_address"),
        to_text(tenant_addr) if tenant_addr else "",
        to_text(web_scraped.get("address")) if web_scraped.get("address") else "",
    )

    org_lat = first_non_empty(
        record.get("tenant_lat"),
        record.get("hospital_lat"),
        clinic_json.get("lat"),
        clinic_json.get("latitude"),
        as_dict(web_scraped.get("address")).get("lat"),
        as_dict(web_scraped.get("address")).get("latitude"),
    )

    org_lng = first_non_empty(
        record.get("tenant_lng"),
        record.get("hospital_lng"),
        clinic_json.get("lng"),
        clinic_json.get("longitude"),
        clinic_json.get("lon"),
        as_dict(web_scraped.get("address")).get("lng"),
        as_dict(web_scraped.get("address")).get("longitude"),
    )

    doctor_slug = first_non_empty(
        web_scraped.get("slug"),
        record.get("unique_id"),
        record.get("unique_id_alt"),
        record.get("uid"),
    )

    row = {
        "doctor_id": record.get("id"),
        "doctor_name": doctor_name,
        "gender": first_non_empty(web_scraped.get("gender"), metadata.get("gender")),
        "photo_url": first_non_empty(record.get("profile_image"), web_scraped.get("photo"), web_scraped.get("image")),
        "education": education,
        "specialty": first_non_empty(record.get("specialization"), web_scraped.get("specialty")),
        "designation": first_non_empty(web_scraped.get("designation"), metadata.get("designation")),
        "doctor_slug": doctor_slug,
        "hospital_clinic_name": org_name,
        "hospital_clinic_slug": org_slug,
        "hospital_clinic_address": org_address,
        "contact_number": first_non_empty(record.get("phone_number"), web_scraped.get("phone")),
        "org_latitude": org_lat,
        "org_longitude": org_lng,
        "doctor_city": infer_city(record),
        "organization_type": record.get("organization_type"),
        "organization_id": record.get("organization_id"),
        "source_web_profile": first_non_empty(social_links.get("web_profile"), web_scraped.get("source_url")),
    }

    required_fields = [
        "doctor_name",
        "gender",
        "photo_url",
        "education",
        "specialty",
        "designation",
        "doctor_slug",
        "hospital_clinic_name",
        "hospital_clinic_address",
        "contact_number",
        "org_latitude",
        "org_longitude",
    ]
    missing = [f for f in required_fields if not to_text(row.get(f)).strip()]
    row["qc_missing_fields"] = ", ".join(missing)
    row["qc_status"] = "PASS" if not missing else "FAIL"
    return row


def fetch_text(url, timeout=2):
    try:
        req = Request(
            url,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                )
            },
        )
        with urlopen(req, timeout=timeout) as resp:
            return resp.read().decode("utf-8", errors="ignore")
    except Exception:
        return ""


def infer_gender(first_name, gender_cache):
    first = str(first_name or "").strip().split(" ")[0]
    if not first:
        return ""
    key = first.lower()
    if key in gender_cache:
        return gender_cache[key]

    try:
        url = f"https://api.genderize.io/?name={quote(first)}"
        txt = fetch_text(url, timeout=2)
        data = json.loads(txt) if txt else {}
        g = (data.get("gender") or "").strip().title()
        gender_cache[key] = g
        return g
    except Exception:
        gender_cache[key] = ""
        return ""


def extract_og_image(profile_url, profile_cache):
    url = str(profile_url or "").strip()
    if not url:
        return ""
    if url in profile_cache:
        return profile_cache[url]

    html = fetch_text(url, timeout=2)
    if not html:
        profile_cache[url] = ""
        return ""

    patterns = [
        r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',
        r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)["\']',
    ]
    for pat in patterns:
        m = re.search(pat, html, flags=re.IGNORECASE)
        if m:
            profile_cache[url] = m.group(1).strip()
            return profile_cache[url]

    profile_cache[url] = ""
    return ""


def geocode_address(address, geo_cache):
    addr = str(address or "").strip()
    if not addr:
        return "", ""
    if addr in geo_cache:
        return geo_cache[addr]

    try:
        url = (
            "https://maps.googleapis.com/maps/api/geocode/json"
            f"?address={quote(addr)}&region=in&key={GOOGLE_API_KEY}"
        )
        txt = fetch_text(url, timeout=2)
        data = json.loads(txt) if txt else {}
        if data.get("status") == "OK" and data.get("results"):
            loc = data["results"][0]["geometry"]["location"]
            lat = loc.get("lat", "")
            lng = loc.get("lng", "")
            geo_cache[addr] = (lat, lng)
            return geo_cache[addr]
    except Exception:
        pass

    geo_cache[addr] = ("", "")
    return geo_cache[addr]


def enrich_rows(rows):
    gender_cache = {}
    profile_cache = {}
    geo_cache = {}
    max_gender_lookups = 80
    max_photo_fetch = 15
    max_geocodes = 80
    gender_lookup_count = 0
    photo_fetch_count = 0
    geocode_count = 0

    for row in rows:
        if not to_text(row.get("designation")).strip():
            row["designation"] = "Consultant"

        if not to_text(row.get("gender")).strip():
            first_name = str(row.get("doctor_name") or "").split(" ")[0]
            if gender_lookup_count < max_gender_lookups:
                inferred = infer_gender(first_name, gender_cache)
                gender_lookup_count += 1
                if inferred:
                    row["gender"] = inferred

        if not to_text(row.get("photo_url")).strip():
            if photo_fetch_count < max_photo_fetch:
                profile = row.get("source_web_profile")
                og_image = extract_og_image(profile, profile_cache)
                photo_fetch_count += 1
                if og_image:
                    row["photo_url"] = og_image

        lat = to_text(row.get("org_latitude")).strip()
        lng = to_text(row.get("org_longitude")).strip()
        if not lat or not lng:
            if geocode_count < max_geocodes:
                address = row.get("hospital_clinic_address")
                g_lat, g_lng = geocode_address(address, geo_cache)
                geocode_count += 1
                if g_lat and g_lng:
                    row["org_latitude"] = g_lat
                    row["org_longitude"] = g_lng

        required_fields = [
            "doctor_name",
            "gender",
            "photo_url",
            "education",
            "specialty",
            "designation",
            "doctor_slug",
            "hospital_clinic_name",
            "hospital_clinic_address",
            "contact_number",
            "org_latitude",
            "org_longitude",
        ]
        missing = [f for f in required_fields if not to_text(row.get(f)).strip()]
        row["qc_missing_fields"] = ", ".join(missing)
        row["qc_status"] = "PASS" if not missing else "FAIL"


def fetch_records():
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()
    cur.execute(
        """
        SELECT
            d.id,
            d."firstName" AS first_name,
            d."lastName" AS last_name,
            d."phoneNumber" AS phone_number,
            d."profileImage" AS profile_image,
            d.specialization,
            d.qualification,
            d.qualifications,
            d."clinicAddress" AS clinic_address,
            d."clinicAddress_json" AS clinic_address_json,
            d.organization_type::text AS organization_type,
            d.organization_id,
            d.unique_id,
            d."uniqueId" AS unique_id_alt,
            d.uid::text AS uid,
            d.metadata,
            d.social_links,
            t.name AS tenant_name,
            t.slug AS tenant_slug,
            t.address AS tenant_address,
            t.latitude AS tenant_lat,
            t.longitude AS tenant_lng,
            h.hospital_name,
            h.address AS hospital_address,
            h.city AS hospital_city,
            h.latitude AS hospital_lat,
            h.longitude AS hospital_lng
        FROM doctors d
        LEFT JOIN tenants t ON d.organization_id = t.id
        LEFT JOIN hospitals h ON d.organization_id = h.id
        WHERE d.status = 'active'
        ORDER BY d.id
        """
    )
    cols = [d[0] for d in cur.description]
    rows = [dict(zip(cols, row)) for row in cur.fetchall()]
    cur.close()
    conn.close()
    return rows


def autosize_headers(ws, headers):
    for idx, h in enumerate(headers, start=1):
        width = max(14, min(45, len(h) + 2))
        ws.column_dimensions[chr(64 + idx) if idx <= 26 else "A"].width = width


def write_sheet(ws, headers, rows):
    ws.append(headers)
    for row in rows:
        ws.append([to_text(row.get(h, "")) for h in headers])


def main():
    source_rows = fetch_records()
    bucketed = defaultdict(list)

    for rec in source_rows:
        row = build_row(rec)
        bucket = city_bucket(row.get("doctor_city"))
        if bucket:
            bucketed[bucket].append(row)

    for city in ("chennai", "bangalore", "hyderabad"):
        enrich_rows(bucketed.get(city, []))

    headers = [
        "doctor_id",
        "doctor_name",
        "gender",
        "photo_url",
        "education",
        "specialty",
        "designation",
        "doctor_slug",
        "hospital_clinic_name",
        "hospital_clinic_slug",
        "hospital_clinic_address",
        "contact_number",
        "org_latitude",
        "org_longitude",
        "doctor_city",
        "organization_type",
        "organization_id",
        "source_web_profile",
        "qc_status",
        "qc_missing_fields",
    ]

    wb = Workbook()
    wb.remove(wb.active)

    summary = wb.create_sheet("QC_Summary")
    summary_headers = [
        "city",
        "total_records",
        "qc_pass",
        "qc_fail",
        "missing_gender",
        "missing_photo",
        "missing_education",
        "missing_specialty",
        "missing_designation",
        "missing_doctor_slug",
        "missing_org_name",
        "missing_org_address",
        "missing_contact",
        "missing_coordinates",
    ]
    summary.append(summary_headers)

    for city in ("chennai", "bangalore", "hyderabad"):
        rows = bucketed.get(city, [])
        data_ws = wb.create_sheet(city.title())
        write_sheet(data_ws, headers, rows)

        issues_ws = wb.create_sheet(f"{city.title()}_QC")
        issue_rows = [r for r in rows if r.get("qc_status") == "FAIL"]
        write_sheet(issues_ws, headers, issue_rows)

        missing = {
            "gender": 0,
            "photo": 0,
            "education": 0,
            "specialty": 0,
            "designation": 0,
            "doctor_slug": 0,
            "org_name": 0,
            "org_address": 0,
            "contact": 0,
            "coordinates": 0,
        }

        for r in rows:
            if not to_text(r.get("gender")).strip():
                missing["gender"] += 1
            if not to_text(r.get("photo_url")).strip():
                missing["photo"] += 1
            if not to_text(r.get("education")).strip():
                missing["education"] += 1
            if not to_text(r.get("specialty")).strip():
                missing["specialty"] += 1
            if not to_text(r.get("designation")).strip():
                missing["designation"] += 1
            if not to_text(r.get("doctor_slug")).strip():
                missing["doctor_slug"] += 1
            if not to_text(r.get("hospital_clinic_name")).strip():
                missing["org_name"] += 1
            if not to_text(r.get("hospital_clinic_address")).strip():
                missing["org_address"] += 1
            if not to_text(r.get("contact_number")).strip():
                missing["contact"] += 1
            if (not to_text(r.get("org_latitude")).strip()) or (not to_text(r.get("org_longitude")).strip()):
                missing["coordinates"] += 1

        pass_count = sum(1 for r in rows if r.get("qc_status") == "PASS")
        fail_count = len(rows) - pass_count
        summary.append(
            [
                city.title(),
                len(rows),
                pass_count,
                fail_count,
                missing["gender"],
                missing["photo"],
                missing["education"],
                missing["specialty"],
                missing["designation"],
                missing["doctor_slug"],
                missing["org_name"],
                missing["org_address"],
                missing["contact"],
                missing["coordinates"],
            ]
        )

    out_dir = Path("/home/ubuntu/Mediczy/exports")
    out_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.utcnow().strftime("%Y-%m-%dT%H-%M-%SZ")
    out_file = out_dir / f"doctors-city-qc-enriched-{ts}.xlsx"
    wb.save(out_file)

    print(json.dumps({
        "output": str(out_file),
        "city_counts": {
            "Chennai": len(bucketed.get("chennai", [])),
            "Bangalore": len(bucketed.get("bangalore", [])),
            "Hyderabad": len(bucketed.get("hyderabad", [])),
        },
    }, indent=2))


if __name__ == "__main__":
    main()
