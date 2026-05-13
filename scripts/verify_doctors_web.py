"""
Enhanced doctor web verification + profile scraping.
For each doctor:
  1. Search DDG for best profile URL (skip if already found)
  2. Fetch the page and extract structured data via JSON-LD / meta / heuristics
  3. Store in doctors.metadata['web_scraped'] and update empty DB fields

Run:
  python3 scripts/verify_doctors_web.py [--offset N] [--limit N] [--scrape-only] [--dry-run]
"""
import psycopg2
import psycopg2.extras
import json, time, re, logging, argparse, random
import urllib.request, urllib.error
from datetime import datetime, timezone

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('/home/ubuntu/Mediczy/logs/doctor_web_verify.log',
                            mode='a', encoding='utf-8'),
    ],
)
log = logging.getLogger(__name__)

DB = dict(host='127.0.0.1', port=5432, dbname='mediczy_ai',
          user='mediczy_helper', password='Mediczy2024Helper')

UA = ('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36')

HOSPITAL_MAP = {
    'apollo_che':'Apollo Hospitals Chennai','apollo_blr':'Apollo Hospitals Bangalore',
    'apollo_hyd':'Apollo Hospitals Hyderabad','apollo_del':'Apollo Hospitals Delhi',
    'apollo_mum':'Apollo Hospitals Mumbai','nimhans':'NIMHANS Bangalore',
    'motherhood':'Motherhood Hospital','fortis_blr':'Fortis Hospital Bangalore',
    'fortis_del':'Fortis Hospital Delhi','manipal':'Manipal Hospital','aiims':'AIIMS',
    'blrdoctors':'Bangalore','chedoctors':'Chennai','hyddoctors':'Hyderabad',
    'deldoctors':'Delhi','mumdoctors':'Mumbai','koldoctors':'Kolkata',
}

PREFERRED_DOMAINS = [
    'practo.com','lybrate.com','apollo247.com','docdial.com',
    'fortishealthcare.com','manipalhospitals.com','nimhans.ac.in',
    'motherhoodindia.com','aiims.edu','docprime.com','mfine.co',
    'myupchar.com','bajajfinservhealth.in','linkedin.com',
    'lazoi.com','credihealth.com','medifee.com','sehat.com',
    'justdial.com','sulekha.com',
]
SKIP_DOMAINS = [
    'youtube.com','facebook.com','instagram.com','twitter.com','x.com',
    'wikipedia.org','wikimedia.org','reddit.com','quora.com','amazon.com',
]
NOSCRAPE_DOMAINS = ['justdial.com','sulekha.com','indiamart.com','google.com']


def hospital_from_email(email):
    if '.mediczy.internal' not in email:
        return ''
    local = email.split('@')[0]
    for part in reversed(local.split('.')):
        if not part.isdigit():
            for key, val in HOSPITAL_MAP.items():
                if key == part or key in part:
                    return val
    return ''


def city_from_address(addr):
    if not addr: return ''
    if isinstance(addr, dict): return addr.get('city','') or ''
    if isinstance(addr, str):
        try: return json.loads(addr).get('city','') or ''
        except: return ''
    return ''


def build_query(doc):
    name = f"{(doc.get('firstName') or '').strip()} {(doc.get('lastName') or '').strip()}".strip()
    spec = (doc.get('specialization') or '').strip()
    hospital = hospital_from_email(doc.get('email',''))
    city = city_from_address(doc.get('clinicAddress'))
    q = f'"{name}" doctor'
    if spec: q += f' {spec}'
    if hospital: q += f' {hospital}'
    elif city: q += f' {city} India'
    else: q += ' India'
    return q


def score_url(url):
    u = url.lower()
    for d in SKIP_DOMAINS:
        if d in u: return -1
    for i, d in enumerate(PREFERRED_DOMAINS):
        if d in u: return len(PREFERRED_DOMAINS) - i
    return 1


def best_url(results):
    scored = sorted([(score_url(r.get('href','')), r.get('href','')) for r in results],
                    key=lambda x: x[0], reverse=True)
    return scored[0][1] if scored and scored[0][0] >= 0 else None


def ddg_search(query, retries=3):
    from ddgs import DDGS
    for attempt in range(retries):
        try:
            return list(DDGS().text(query, max_results=5))
        except Exception as e:
            wait = (attempt+1)*5 + random.uniform(0,3)
            log.warning(f'DDG error (attempt {attempt+1}): {e} — retry in {wait:.1f}s')
            time.sleep(wait)
    return []


def fetch_html(url, timeout=12):
    for d in NOSCRAPE_DOMAINS:
        if d in url: return None
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': UA,
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9'})
        return urllib.request.urlopen(req, timeout=timeout).read().decode('utf-8', errors='ignore')
    except Exception as e:
        log.debug(f'  Fetch error: {e}')
        return None


def parse_schema_address(addr):
    if not addr or not isinstance(addr, dict): return {}
    return {k: v for k, v in {
        'street': addr.get('streetAddress',''),
        'city':   addr.get('addressLocality',''),
        'state':  addr.get('addressRegion',''),
        'country':addr.get('addressCountry',''),
        'pincode':addr.get('postalCode',''),
    }.items() if v}


def extract_json_ld(html):
    pat = re.compile(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', re.DOTALL|re.I)
    out = []
    for raw in pat.findall(html):
        try:
            d = json.loads(raw.strip())
            out.extend(d if isinstance(d, list) else [d])
        except: pass
    return out


def scrape_profile(url, html):
    result = {'source_url': url}
    lds = extract_json_ld(html)

    for ld in lds:
        t = ld.get('@type','')

        if t in ('Physician','MedicalBusiness','MedicalOrganization','Person'):
            if ld.get('name'): result['name'] = ld['name']
            if ld.get('medicalSpecialty'): result['specialty'] = ld['medicalSpecialty']
            if ld.get('description'): result.setdefault('about', str(ld['description'])[:500])
            if ld.get('priceRange'): result['fee'] = str(ld['priceRange'])
            if ld.get('telephone'):
                ph = ld['telephone']
                result['phone'] = ph if isinstance(ph, str) else ', '.join(ph)
            addr = ld.get('address')
            if addr: result['address'] = parse_schema_address(addr)
            for edu_key in ('hasCredential','alumniOf','knowsAbout'):
                edu = ld.get(edu_key)
                if edu and 'qualifications' not in result:
                    if isinstance(edu, list):
                        result['qualifications'] = [e.get('name', str(e)) if isinstance(e,dict) else str(e) for e in edu]
                    elif isinstance(edu, dict):
                        result['qualifications'] = [edu.get('name', str(edu))]
                    elif isinstance(edu, str):
                        result['qualifications'] = [edu]
            langs = ld.get('knowsLanguage')
            if langs and 'languages' not in result:
                result['languages'] = langs if isinstance(langs, list) else [langs]
            awards = ld.get('award') or ld.get('awards')
            if awards:
                result['achievements'] = awards if isinstance(awards, list) else [awards]

        if t in ('MedicalClinic','LocalBusiness'):
            if ld.get('name'): result.setdefault('clinic_name', ld['name'])
            if ld.get('telephone'): result.setdefault('phone', ld['telephone'])
            addr = ld.get('address')
            if addr: result.setdefault('address', parse_schema_address(addr))

        if t == 'FAQPage':
            for item in ld.get('mainEntity',[]):
                q = item.get('name','').lower()
                ans = (item.get('acceptedAnswer') or {}).get('text','')
                if not ans: continue
                if 'practice' in q or 'work' in q: result.setdefault('clinic_name', ans.strip()[:200])
                if 'experience' in q: result.setdefault('experience', ans.strip()[:200])
                if 'qualif' in q or 'education' in q or 'degree' in q:
                    result.setdefault('qualifications', [ans.strip()[:300]])
                if 'special' in q: result.setdefault('specialty', ans.strip()[:100])
                if 'fee' in q or 'charge' in q: result.setdefault('fee', ans.strip()[:100])
                if 'award' in q or 'achiev' in q: result.setdefault('achievements', [ans.strip()[:300]])

    # Meta description
    if 'about' not in result:
        m = re.search(r'<meta[^>]*name=["\']description["\'][^>]*content=["\']([^"\']{30,})', html, re.I)
        if m: result['about'] = m.group(1).strip()[:400]

    # Generic: years of experience
    if 'experience' not in result:
        em = re.search(r'(\d{1,2})\+?\s*[Yy]ears?\s*(of\s*)?[Ee]xperience', html)
        if em: result['experience'] = f'{em.group(1)} years'

    # Generic: qualifications from text (MBBS, MD, etc.)
    if 'qualifications' not in result:
        qm = re.search(r'\b(MBBS[,\s/MDMSDNBFRCS]+(?:[\w\s(),]+)?)', html)
        if qm: result['qualifications'] = [qm.group(1).strip()[:200]]

    # Practo: city from URL
    if 'practo.com' in url:
        pm = re.search(r'practo\.com/([a-z\-]+)/doctor/', url, re.I)
        if pm: result.setdefault('city', pm.group(1).replace('-',' ').title())

    # Lybrate: qualifications in HTML
    if 'lybrate.com' in url and 'qualifications' not in result:
        qm = re.search(r'Qualifications?[:\s]+([A-Z][A-Za-z, ()\-]{5,120})', html)
        if qm: result['qualifications'] = [q.strip() for q in qm.group(1).split(',')]

    return {k: v for k, v in result.items() if v not in ('', [], {}, None)}


def update_doctor(conn, doc_id, web_profile_url, scraped):
    cur = conn.cursor()
    cur.execute(
        'SELECT social_links, metadata, "clinicAddress_json", languages, qualification '
        'FROM doctors WHERE id=%s', (doc_id,)
    )
    row = cur.fetchone()
    if not row: return
    social, meta, addr_json, langs, qual = row
    social = social or {}
    meta   = meta or {}

    social['web_profile']     = web_profile_url
    social['web_verified_at'] = datetime.now(timezone.utc).isoformat()
    if scraped:
        meta['web_scraped'] = scraped

    updates = {'social_links': json.dumps(social), 'metadata': json.dumps(meta)}

    if scraped:
        if not addr_json and scraped.get('address'):
            updates['"clinicAddress_json"'] = json.dumps(scraped['address'])
        if not langs and scraped.get('languages'):
            updates['languages'] = json.dumps(scraped['languages'])
        if not qual and scraped.get('qualifications'):
            q = scraped['qualifications']
            updates['qualification'] = q[0] if isinstance(q, list) else str(q)

    set_clause = ', '.join(f'{k}=%s' for k in updates)
    cur.execute(f'UPDATE doctors SET {set_clause} WHERE id=%s',
                list(updates.values()) + [doc_id])
    conn.commit()


def run(offset=0, limit=None, scrape_only=False, dry_run=False):
    conn = psycopg2.connect(**DB)
    cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    q = ('SELECT id, "firstName", "lastName", email, specialization, '
         '"clinicAddress", social_links, metadata, qualification, languages '
         'FROM doctors ORDER BY id')
    q += f' LIMIT {limit} OFFSET {offset}' if limit else f' OFFSET {offset}'
    cur.execute(q)
    doctors = cur.fetchall()
    total = len(doctors)
    log.info(f'Starting — {total} doctors (offset={offset}, scrape_only={scrape_only})')

    stats = dict(found=0, not_found=0, scraped=0, skipped=0, errors=0)

    for i, doc in enumerate(doctors, 1):
        doc_id = doc['id']
        name   = f"{doc['firstName'] or ''} {doc['lastName'] or ''}".strip()
        social = doc['social_links'] or {}
        meta   = doc['metadata'] or {}
        already_verified = social.get('web_verified_at') is not None
        profile_url = social.get('web_profile')

        # Already fully processed (URL + scraped data)?
        if already_verified and profile_url and meta.get('web_scraped'):
            stats['skipped'] += 1
            if i % 100 == 0:
                log.info(f'[{i}/{total}] Progress: {stats}')
            continue

        # scrape-only mode: skip doctors with no URL
        if scrape_only and not profile_url:
            stats['skipped'] += 1
            continue

        # Search phase (only if not scrape-only and no URL yet)
        if not scrape_only and not profile_url:
            search_q = build_query(dict(doc))
            log.info(f'[{i}/{total}] SEARCH id={doc_id} {name!r}')
            try:
                results = ddg_search(search_q)
            except Exception as e:
                log.error(f'  DDG error: {e}')
                stats['errors'] += 1
                time.sleep(3)
                continue

            profile_url = best_url(results)
            if profile_url:
                stats['found'] += 1
                log.info(f'  ✅ {profile_url[:90]}')
            else:
                stats['not_found'] += 1
                log.info(f'  ❌ Not found')
                if not dry_run:
                    update_doctor(conn, doc_id, None, None)
                time.sleep(random.uniform(2.0, 3.0))
                continue

        # Scrape phase
        scraped = None
        if profile_url:
            log.info(f'[{i}/{total}] SCRAPE id={doc_id} {name!r} → {profile_url[:80]}')
            html = fetch_html(profile_url)
            if html:
                scraped = scrape_profile(profile_url, html)
                stats['scraped'] += 1
                keys = [k for k in scraped if k != 'source_url']
                log.info(f'  📋 Fields: {keys}')
                if scraped.get('clinic_name'): log.info(f'  🏥 {scraped["clinic_name"]}')
                if scraped.get('address'):     log.info(f'  📍 {scraped["address"]}')
                if scraped.get('phone'):       log.info(f'  📞 {scraped["phone"]}')
                if scraped.get('qualifications'): log.info(f'  🎓 {scraped["qualifications"]}')
                if scraped.get('achievements'):   log.info(f'  🏆 {scraped["achievements"]}')
            else:
                log.info(f'  ⚠️  Page blocked/error — URL stored only')

        if not dry_run:
            update_doctor(conn, doc_id, profile_url, scraped)

        time.sleep(random.uniform(2.5, 4.0))

    conn.close()
    log.info(f'Done. {stats} / total={total}')
    return stats


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--offset',      type=int,  default=0)
    parser.add_argument('--limit',       type=int,  default=None)
    parser.add_argument('--scrape-only', action='store_true')
    parser.add_argument('--dry-run',     action='store_true')
    args = parser.parse_args()
    run(offset=args.offset, limit=args.limit,
        scrape_only=args.scrape_only, dry_run=args.dry_run)
