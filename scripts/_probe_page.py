import urllib.request, json, re

UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36'

urls = [
    'https://www.practo.com/chennai/doctor/dr-k-l-ilavarasi-gynecologist-obstetrician',
    'https://www.lybrate.com/chennai/doctor/dr-ramani-rao-pediatrician',
    'https://www.justdial.com/Chennai/Dr-Sarojini-Vijayasaradhi-Teja-Hospital-Opposite-Rakki-Cinema-Hall-Ambattur/044PXX44-XX44-170113213414-L3W2_BZDET',
]

for url in urls:
    print(f'\n=== {url[:80]} ===')
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    try:
        resp = urllib.request.urlopen(req, timeout=10)
        html = resp.read().decode('utf-8', errors='ignore')
        # JSON-LD
        pat = re.compile(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', re.DOTALL | re.I)
        lds = pat.findall(html)
        print(f'  JSON-LD blocks: {len(lds)}')
        for ld in lds:
            try:
                d = json.loads(ld.strip())
                t = d.get('@type','')
                print(f'  type={t}  keys={list(d.keys())[:10]}')
                print('  ', json.dumps(d)[:400])
            except Exception as e:
                print(f'  parse err: {e}')
        # Meta description
        m = re.search(r'<meta[^>]*name=["\']description["\'][^>]*content=["\']([^"\']+)', html, re.I)
        if m: print(f'  meta desc: {m.group(1)[:120]}')
    except Exception as e:
        print(f'  Error: {e}')
