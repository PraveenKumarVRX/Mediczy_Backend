import { Router } from 'express';
import { randomUUID } from 'crypto';
import XLSX from '../utils/excel-compat.js';
import { authTeam, requirePermission } from '../middleware/team.middleware.js';
import pool from '../db/pgPool.js';
import { createHash } from 'crypto';

const router = Router();
const requireProviderNetworkAccess = requirePermission(['Corporate Management', 'Provider Network']);

router.get('/_self-check', authTeam, async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ success: false, error: 'Not found' });
  }

  return res.json({
    success: true,
    auth: {
      userId: req.teamUser?.id || null,
      email: req.teamUser?.email || null,
      role: req.teamUser?.role || null,
      isTeam: req.teamUser?.isTeam === true,
      tenantId: req.teamUser?.tenantId || null,
      permissions: Array.isArray(req.teamUser?.permissions) ? req.teamUser.permissions : []
    },
    endpoint: '/api/team/provider-network-bot/_self-check'
  });
});

router.get('/_ops-ready', authTeam, async (req, res) => {
  if (process.env.NODE_ENV !== 'production') {
    return res.status(404).json({ success: false, error: 'Not found' });
  }

  const role = String(req.teamUser?.role || '').toLowerCase();
  const isAdmin = req.teamUser?.isAdmin === true || role === 'admin' || role === 'super_admin' || role === 'team_admin';
  if (!isAdmin) {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }

  return res.json({
    success: true,
    ready: true,
    service: 'provider-network-bot',
    network: 'SmartHealth Provider Network',
    ts: new Date().toISOString()
  });
});

const ALLOWED_PROVIDER_TYPES = new Set([
  'hospital',
  'clinic',
  'doctor',
  'lab',
  'diagnostic_center',
  'pharmacy',
  'home_healthcare',
  'gym',
  'wellness_center',
  'ambulance_provider',
  'other'
]);

// What a directory entry must have to mean anything: who it is, and where.
// Street address, pincode and a contact line are wanted but routinely absent
// from a real network list — a 101-row lab list carried name, state and town and
// nothing else — so their absence marks an entry incomplete rather than
// rejecting it. Demanding them made the whole upload unpublishable.
const REQUIRED_FIELDS = ['provider_type', 'name', 'city', 'state'];
const RECOMMENDED_FIELDS = ['address', 'pincode'];
const CONTACT_FIELDS = ['phone', 'email'];

const TYPE_ALIASES = {
  hospital: 'hospital',
  hospitals: 'hospital',
  hsopitals: 'hospital',
  clinic: 'clinic',
  clinics: 'clinic',
  doctor: 'doctor',
  doctors: 'doctor',
  lab: 'lab',
  labs: 'lab',
  diagnostic: 'diagnostic_center',
  diagnostics: 'diagnostic_center',
  diagnostic_center: 'diagnostic_center',
  diagnostic_centers: 'diagnostic_center',
  pharmacy: 'pharmacy',
  pharmacies: 'pharmacy',
  homecare: 'home_healthcare',
  home_healthcare: 'home_healthcare',
  home_healthcare_center: 'home_healthcare',
  gym: 'gym',
  gyms: 'gym',
  wellness: 'wellness_center',
  wellness_center: 'wellness_center',
  ambulance: 'ambulance_provider',
  ambulance_provider: 'ambulance_provider'
};

function text(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function normalizeWebsite(url) {
  const u = text(url);
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  return `https://${u}`;
}

function cleanValue(v) {
  return text(v).replace(/\s+/g, ' ').trim();
}

function normalizeProviderType(rawType) {
  const normalized = text(rawType).toLowerCase().replace(/\s+/g, '_');
  return TYPE_ALIASES[normalized] || (ALLOWED_PROVIDER_TYPES.has(normalized) ? normalized : 'other');
}

/**
 * Spreadsheet headers are written for people, not for this parser: "Lab Name",
 * "Location", "Pin Code", "Contact No.". Lookups were done against exact
 * snake_case keys, so a real sheet matched nothing and every row was stored with
 * empty fields and failed QC on all of them, with the actual values stranded in
 * metadata. Keys are therefore folded to lowercase with runs of non-alphanumerics
 * collapsed to a single underscore before anything is read.
 */
const foldKey = (key) => String(key || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

const foldRecord = (record) => {
  const folded = {};
  for (const [key, value] of Object.entries(record || {})) {
    const k = foldKey(key);
    // First writer wins, so an exact header is never overwritten by a variant.
    if (k && !(k in folded)) folded[k] = value;
  }
  return folded;
};

/** Returns the first non-empty value among the given folded keys. */
const pick = (folded, ...keys) => {
  for (const key of keys) {
    const v = text(folded[key]);
    if (v) return v;
  }
  return '';
};

function normalizeRecord(input, defaults = {}) {
  const record = input || {};
  const f = foldRecord(record);

  const providerType = normalizeProviderType(
    pick(f, 'provider_type', 'type', 'category', 'partner_type', 'facility_type')
      || defaults.provider_type
  );

  // A sheet usually names the place in a column of its own kind: "Lab Name",
  // "Hospital Name", "Centre Name".
  const name = pick(f, 'name', 'provider_name', 'hospital_name', 'clinic_name',
    'doctor_name', 'lab_name', 'laboratory_name', 'centre_name', 'center_name',
    'diagnostic_centre', 'diagnostic_center', 'partner_name', 'facility_name',
    'pharmacy_name', 'organisation_name', 'organization_name');

  // "Location" in a network list is a town, not a street address, so it fills
  // city rather than being passed off as an address it is not.
  const city = pick(f, 'city', 'town', 'district', 'location', 'place', 'branch', 'area');
  const address = pick(f, 'address', 'full_address', 'address_line', 'address_line_1',
    'street', 'street_address', 'locality', 'landmark');

  return {
    provider_type: providerType,
    name,
    website: normalizeWebsite(pick(f, 'website', 'url', 'source_url', 'web', 'site')),
    phone: pick(f, 'phone', 'contact_number', 'mobile', 'telephone', 'phone_number',
      'contact_no', 'mobile_no', 'mobile_number', 'contact'),
    email: pick(f, 'email', 'contact_email', 'email_id', 'email_address', 'mail'),
    address,
    city,
    state: pick(f, 'state', 'province', 'region'),
    pincode: pick(f, 'pincode', 'pin', 'zip', 'postal_code', 'pin_code', 'zipcode', 'postcode'),
    latitude: pick(f, 'latitude', 'lat'),
    longitude: pick(f, 'longitude', 'lng', 'lon', 'long'),
    contact_person: pick(f, 'contact_person', 'contact_name', 'spoc', 'poc',
      'contact_person_name', 'coordinator'),
    services: Array.isArray(record.services)
      ? record.services.filter(Boolean)
      : pick(f, 'services', 'tests', 'specialities', 'specialties')
        ? pick(f, 'services', 'tests', 'specialities', 'specialties').split(',').map((x) => x.trim()).filter(Boolean)
        : [],
    source_url: normalizeWebsite(pick(f, 'source_url', 'website', 'url')),
    // The original row is kept verbatim, so commercial columns a sheet carries —
    // rates, coordinator names — survive even though they have no column here.
    metadata: typeof record === 'object' ? record : { value: record }
  };
}

/**
 * Three outcomes, not two:
 *   FAIL — cannot be identified or placed; must not reach the directory.
 *   WARN — identified and placed, but thin on address, pincode or a contact.
 *   PASS — complete.
 * Publishing accepts PASS and WARN; FAIL needs the explicit force.
 */
function computeQc(provider) {
  const missingRequired = REQUIRED_FIELDS.filter((field) => !text(provider[field]));

  const missingRecommended = RECOMMENDED_FIELDS.filter((field) => !text(provider[field]));
  if (!CONTACT_FIELDS.some((f) => text(provider[f]))) {
    missingRecommended.push('contact(phone_or_email)');
  }
  if (text(provider.website) && !/^https?:\/\//i.test(text(provider.website))) {
    missingRecommended.push('website(protocol_missing)');
  }

  // Everything still absent is reported, so nothing is hidden by being downgraded.
  const missing = [...missingRequired, ...missingRecommended];
  const checks = REQUIRED_FIELDS.length + RECOMMENDED_FIELDS.length + 1;
  const score = Math.max(0, Math.round(((checks - missing.length) / checks) * 100));

  const status = missingRequired.length ? 'FAIL' : (missingRecommended.length ? 'WARN' : 'PASS');
  return { status, score, missing, missingRequired, missingRecommended };
}

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS provider_network_batches (
      batch_id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ingested',
      total_records INTEGER NOT NULL DEFAULT 0,
      qc_pass INTEGER NOT NULL DEFAULT 0,
      qc_fail INTEGER NOT NULL DEFAULT 0,
      published_count INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS provider_network_entries (
      id BIGSERIAL PRIMARY KEY,
      batch_id TEXT NOT NULL REFERENCES provider_network_batches(batch_id) ON DELETE CASCADE,
      source_type TEXT NOT NULL,
      provider_type TEXT NOT NULL,
      name TEXT,
      website TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      pincode TEXT,
      latitude TEXT,
      longitude TEXT,
      contact_person TEXT,
      services JSONB NOT NULL DEFAULT '[]'::jsonb,
      source_url TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      qc_status TEXT NOT NULL DEFAULT 'PENDING',
      qc_score INTEGER,
      qc_missing_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
      publish_status TEXT NOT NULL DEFAULT 'draft',
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_provider_network_entries_batch ON provider_network_entries(batch_id);
    CREATE INDEX IF NOT EXISTS idx_provider_network_entries_publish ON provider_network_entries(publish_status);
    CREATE INDEX IF NOT EXISTS idx_provider_network_entries_provider_type ON provider_network_entries(provider_type);

    CREATE TABLE IF NOT EXISTS smarthealth_provider_network (
      id BIGSERIAL PRIMARY KEY,
      provider_fingerprint TEXT NOT NULL UNIQUE,
      provider_type TEXT NOT NULL,
      name TEXT,
      website TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      pincode TEXT,
      latitude TEXT,
      longitude TEXT,
      contact_person TEXT,
      services JSONB NOT NULL DEFAULT '[]'::jsonb,
      source_url TEXT,
      latest_batch_id TEXT,
      latest_qc_score INTEGER,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_shpn_provider_type ON smarthealth_provider_network(provider_type);
    CREATE INDEX IF NOT EXISTS idx_shpn_city ON smarthealth_provider_network(city);
    CREATE INDEX IF NOT EXISTS idx_shpn_name ON smarthealth_provider_network(name);
  `);
}

ensureTables().catch((err) => {
  console.warn('[provider-network-bot] table init error:', err.message);
});

async function createBatch({ sourceType, userId, notes }) {
  const batchId = `pnb-${Date.now()}-${randomUUID().slice(0, 8)}`;
  await pool.query(
    `INSERT INTO provider_network_batches (batch_id, source_type, created_by, notes)
     VALUES ($1, $2, $3, $4)`,
    [batchId, sourceType, userId || null, notes || null]
  );
  return batchId;
}

async function persistRecords(batchId, sourceType, records) {
  if (!records.length) return;

  const query = `
    INSERT INTO provider_network_entries (
      batch_id, source_type, provider_type, name, website, phone, email, address, city, state,
      pincode, latitude, longitude, contact_person, services, source_url, metadata
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15::jsonb, $16, $17::jsonb
    )
  `;

  for (const rec of records) {
    await pool.query(query, [
      batchId,
      sourceType,
      rec.provider_type,
      rec.name,
      rec.website,
      rec.phone,
      rec.email,
      rec.address,
      rec.city,
      rec.state,
      rec.pincode,
      rec.latitude,
      rec.longitude,
      rec.contact_person,
      JSON.stringify(rec.services || []),
      rec.source_url,
      JSON.stringify(rec.metadata || {})
    ]);
  }

  await pool.query(
    `UPDATE provider_network_batches
     SET total_records = (
       SELECT COUNT(*) FROM provider_network_entries WHERE batch_id = $1
     ),
     updated_at = NOW()
     WHERE batch_id = $1`,
    [batchId]
  );
}

async function runQc(batchId) {
  const { rows } = await pool.query(
    `SELECT id, provider_type, name, website, phone, email, address, city, state, pincode, latitude, longitude
     FROM provider_network_entries
     WHERE batch_id = $1`,
    [batchId]
  );

  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;

  for (const row of rows) {
    const qc = computeQc(row);
    if (qc.status === 'PASS') passCount += 1;
    else if (qc.status === 'WARN') warnCount += 1;
    else failCount += 1;

    await pool.query(
      `UPDATE provider_network_entries
       SET qc_status = $2,
           qc_score = $3,
           qc_missing_fields = $4::jsonb,
           updated_at = NOW()
       WHERE id = $1`,
      [row.id, qc.status, qc.score, JSON.stringify(qc.missing)]
    );
  }

  await pool.query(
    `UPDATE provider_network_batches
     SET status = 'qc_completed',
         qc_pass = $2,
         qc_fail = $3,
         updated_at = NOW()
     WHERE batch_id = $1`,
    [batchId, passCount, failCount]
  );

  // publishable = complete entries plus the incomplete-but-identifiable ones.
  return { passCount, warnCount, failCount, publishable: passCount + warnCount, total: rows.length };
}

function parseTitle(html) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return cleanValue(m?.[1]);
}

function parseMeta(html, key) {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]+content=["']([^"']+)["']`, 'i');
  const m = html.match(re);
  return cleanValue(m?.[1]);
}

function parseJsonLdCandidates(html) {
  const matches = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const docs = [];
  for (const m of matches) {
    const raw = text(m[1]);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) docs.push(...parsed);
      else docs.push(parsed);
    } catch {
      // Ignore malformed JSON-LD snippets.
    }
  }
  return docs;
}

function getFromAddress(addr, key) {
  if (!addr || typeof addr !== 'object') return '';
  return cleanValue(addr[key]);
}

function extractProviderFromJsonLd(docs, fallbackType) {
  for (const d of docs) {
    const type = Array.isArray(d?.['@type']) ? d['@type'][0] : d?.['@type'];
    const lowerType = text(type).toLowerCase();
    const derivedType = normalizeProviderType(lowerType || fallbackType || 'other');
    const addr = d?.address || {};
    const geo = d?.geo || {};
    const tel = cleanValue(d?.telephone || d?.contactPoint?.telephone);
    const email = cleanValue(d?.email || d?.contactPoint?.email);
    if (!cleanValue(d?.name) && !tel && !email) continue;

    return normalizeRecord({
      provider_type: derivedType,
      name: cleanValue(d?.name),
      website: cleanValue(d?.url),
      phone: tel,
      email,
      address: cleanValue(d?.address?.streetAddress || d?.address?.name),
      city: getFromAddress(addr, 'addressLocality'),
      state: getFromAddress(addr, 'addressRegion'),
      pincode: getFromAddress(addr, 'postalCode'),
      latitude: cleanValue(geo?.latitude),
      longitude: cleanValue(geo?.longitude),
      services: Array.isArray(d?.medicalSpecialty) ? d.medicalSpecialty : (cleanValue(d?.medicalSpecialty) ? [cleanValue(d?.medicalSpecialty)] : []),
      metadata: {
        jsonld_type: lowerType,
        extraction: 'jsonld'
      }
    });
  }
  return null;
}

function extractProviderFromHtml(html, url, fallbackType) {
  const title = parseTitle(html);
  const address = parseMeta(html, 'og:street-address') || '';
  const city = parseMeta(html, 'og:locality') || '';
  const state = parseMeta(html, 'og:region') || '';
  const pincode = parseMeta(html, 'og:postal-code') || '';
  const email = parseMeta(html, 'email') || '';
  const phoneMatch = html.match(/(?:\+?\d[\d\s\-()]{7,}\d)/);
  const phone = cleanValue(phoneMatch?.[0]);
  return normalizeRecord({
    provider_type: fallbackType,
    name: title,
    website: url,
    source_url: url,
    phone,
    email,
    address,
    city,
    state,
    pincode,
    metadata: {
      extraction: 'html_fallback'
    }
  });
}

function providerFingerprint(provider) {
  const key = [
    normalizeProviderType(provider.provider_type),
    text(provider.name).toLowerCase(),
    text(provider.phone).replace(/\D/g, ''),
    text(provider.website).toLowerCase(),
    text(provider.address).toLowerCase(),
    text(provider.city).toLowerCase(),
    text(provider.state).toLowerCase()
  ].join('|');
  return createHash('sha256').update(key).digest('hex');
}

router.post('/ingest/manual', authTeam, requireProviderNetworkAccess, async (req, res) => {
  try {
    const providers = Array.isArray(req.body?.providers) ? req.body.providers : [];
    if (!providers.length) {
      return res.status(400).json({ success: false, error: 'providers[] is required' });
    }

    const batchId = await createBatch({ sourceType: 'manual', userId: req.teamUser?.id, notes: req.body?.notes });
    const defaultType = normalizeProviderType(req.body?.provider_type || 'other');
    const normalized = providers.map((row) => normalizeRecord(row, { provider_type: defaultType }));
    await persistRecords(batchId, 'manual', normalized);

    return res.json({
      success: true,
      batchId,
      sourceType: 'manual',
      ingested: normalized.length,
      next: `/api/provider-network-bot/qc/${batchId}`
    });
  } catch (error) {
    console.error('[provider-network-bot] manual ingest failed:', error);
    return res.status(500).json({ success: false, error: 'Manual ingest failed' });
  }
});

router.post('/ingest/excel', authTeam, requireProviderNetworkAccess, async (req, res) => {
  try {
    const file = req.files?.file;
    if (!file || !file.data) {
      return res.status(400).json({ success: false, error: 'Excel file is required as form-data field `file`' });
    }

    const workbook = await XLSX.read(file.data, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return res.status(400).json({ success: false, error: 'Excel contains no sheets' });
    }

    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], { defval: '' });
    if (!rows.length) {
      return res.status(400).json({ success: false, error: 'Excel has no data rows' });
    }

    // A network list rarely carries a type column — a lab list is simply all labs
    // — so the form states it once. A per-row type still wins where present.
    const defaultType = normalizeProviderType(req.body?.provider_type || 'other');
    const batchId = await createBatch({ sourceType: 'excel', userId: req.teamUser?.id, notes: req.body?.notes });
    const normalized = rows.map((row) => normalizeRecord(row, { provider_type: defaultType }));
    await persistRecords(batchId, 'excel', normalized);

    // Say which columns were understood. A sheet whose headers do not map lands
    // every row empty, and that was previously only visible as a QC failure.
    const recognised = ['name', 'city', 'state', 'address', 'pincode', 'phone', 'email']
      .filter((field) => normalized.some((r) => text(r[field])));
    const unmapped = Object.keys(rows[0] || {}).filter((h) => {
      const k = foldKey(h);
      return !['name', 'provider_name', 'hospital_name', 'clinic_name', 'lab_name', 'laboratory_name',
        'centre_name', 'center_name', 'city', 'town', 'district', 'location', 'state', 'address',
        'pincode', 'pin', 'pin_code', 'phone', 'mobile', 'contact_no', 'email', 'email_id',
        'website', 'url', 'provider_type', 'type'].includes(k);
    });

    return res.json({
      success: true,
      batchId,
      sourceType: 'excel',
      sheet: firstSheetName,
      providerType: defaultType,
      ingested: normalized.length,
      recognisedFields: recognised,
      unmappedColumns: unmapped,
      next: `/api/provider-network-bot/qc/${batchId}`
    });
  } catch (error) {
    console.error('[provider-network-bot] excel ingest failed:', error);
    return res.status(500).json({ success: false, error: 'Excel ingest failed' });
  }
});

/**
 * Adds one partner — a lab, a hospital — from the Team form, and carries it all
 * the way to the live network in a single action.
 *
 * Bulk upload has always been three steps (ingest, QC, publish), which is right
 * for a hundred rows and absurd for one. Adding a single partner previously meant
 * hand-writing JSON into the manual ingest box and then running QC and publish
 * yourself. This runs the identical pipeline, so a partner added one at a time is
 * validated and recorded exactly like one arriving in a spreadsheet.
 */
router.post('/providers', authTeam, requireProviderNetworkAccess, async (req, res) => {
  try {
    const provider = req.body?.provider && typeof req.body.provider === 'object'
      ? req.body.provider
      : req.body;
    const normalized = normalizeRecord(provider, {
      provider_type: normalizeProviderType(req.body?.provider_type || provider?.provider_type || 'other')
    });

    const qc = computeQc(normalized);
    if (qc.status === 'FAIL' && req.body?.force !== true) {
      return res.status(400).json({
        success: false,
        code: 'PROVIDER_INCOMPLETE',
        message: `A partner needs at least ${qc.missingRequired.join(', ')}.`,
        missing: qc.missing,
        missingRequired: qc.missingRequired
      });
    }

    const batchId = await createBatch({
      sourceType: 'manual',
      userId: req.teamUser?.id,
      notes: req.body?.notes || `Single partner: ${normalized.name || 'unnamed'}`
    });
    await persistRecords(batchId, 'manual', [normalized]);
    const qcResult = await runQc(batchId);
    const { publishedCount } = await publishBatch(batchId, { force: req.body?.force === true });

    return res.status(201).json({
      success: true,
      batchId,
      published: publishedCount > 0,
      qcStatus: qc.status,
      // Named so the caller can tell a complete entry from one that went in thin.
      incompleteFields: qc.missingRecommended,
      provider: {
        provider_type: normalized.provider_type,
        name: normalized.name,
        city: normalized.city,
        state: normalized.state
      },
      qc: qcResult
    });
  } catch (error) {
    console.error('[provider-network-bot] single provider add failed:', error);
    return res.status(500).json({ success: false, error: 'Could not add the partner' });
  }
});

router.post('/ingest/web', authTeam, requireProviderNetworkAccess, async (req, res) => {
  try {
    const urls = Array.isArray(req.body?.urls) ? req.body.urls : [];
    const providerType = normalizeProviderType(req.body?.provider_type || 'other');
    if (!urls.length) {
      return res.status(400).json({ success: false, error: 'urls[] is required' });
    }

    const batchId = await createBatch({ sourceType: 'web', userId: req.teamUser?.id, notes: req.body?.notes });
    const providers = [];

    for (const rawUrl of urls) {
      const url = text(rawUrl);
      if (!url) continue;
      const normalizedUrl = normalizeWebsite(url);
      try {
        const response = await fetch(normalizedUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; SmartHealthProviderBot/1.0)'
          }
        });
        const html = await response.text();
        const docs = parseJsonLdCandidates(html);
        const fromJsonLd = extractProviderFromJsonLd(docs, providerType);
        if (fromJsonLd) {
          fromJsonLd.website = fromJsonLd.website || normalizedUrl;
          fromJsonLd.source_url = fromJsonLd.source_url || normalizedUrl;
          providers.push(fromJsonLd);
        } else {
          providers.push(extractProviderFromHtml(html, normalizedUrl, providerType));
        }
      } catch {
        // Keep the URL as source even when scrape fails.
        providers.push(normalizeRecord({
          provider_type: providerType,
          website: normalizedUrl,
          source_url: normalizedUrl,
          metadata: {
            extraction: 'web_seed_only',
            scrape_error: true
          }
        }));
      }
    }

    await persistRecords(batchId, 'web', providers);
    return res.json({
      success: true,
      batchId,
      sourceType: 'web',
      ingested: providers.length,
      next: `/api/provider-network-bot/qc/${batchId}`
    });
  } catch (error) {
    console.error('[provider-network-bot] web ingest failed:', error);
    return res.status(500).json({ success: false, error: 'Web ingest failed' });
  }
});

router.post('/qc/:batchId', authTeam, requireProviderNetworkAccess, async (req, res) => {
  try {
    const { batchId } = req.params;
    const summary = await runQc(batchId);
    return res.json({ success: true, batchId, ...summary });
  } catch (error) {
    console.error('[provider-network-bot] qc failed:', error);
    return res.status(500).json({ success: false, error: 'QC failed' });
  }
});

/**
 * Publishes a batch into the live network. Extracted so a single partner added
 * from the Team form takes exactly the same path as a bulk upload, rather than a
 * second copy of this upsert that could drift from it.
 */
async function publishBatch(batchId, { force = false } = {}) {
  // WARN entries are identified and placed, only thin on address or contact,
  // so they publish normally. Only FAIL needs the explicit force.
  const publishFilter = force ? '' : `AND qc_status IN ('PASS', 'WARN')`;

    const { rows: entries } = await pool.query(
      `SELECT *
       FROM provider_network_entries
       WHERE batch_id = $1
         ${publishFilter}`,
      [batchId]
    );

    let publishedCount = 0;
    for (const row of entries) {
      const fingerprint = providerFingerprint(row);
      await pool.query(
        `INSERT INTO smarthealth_provider_network (
          provider_fingerprint, provider_type, name, website, phone, email, address, city, state,
          pincode, latitude, longitude, contact_person, services, source_url, latest_batch_id,
          latest_qc_score, metadata, published_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14::jsonb, $15, $16,
          $17, $18::jsonb, NOW(), NOW()
        )
        ON CONFLICT (provider_fingerprint)
        DO UPDATE SET
          provider_type = EXCLUDED.provider_type,
          name = COALESCE(NULLIF(EXCLUDED.name, ''), smarthealth_provider_network.name),
          website = COALESCE(NULLIF(EXCLUDED.website, ''), smarthealth_provider_network.website),
          phone = COALESCE(NULLIF(EXCLUDED.phone, ''), smarthealth_provider_network.phone),
          email = COALESCE(NULLIF(EXCLUDED.email, ''), smarthealth_provider_network.email),
          address = COALESCE(NULLIF(EXCLUDED.address, ''), smarthealth_provider_network.address),
          city = COALESCE(NULLIF(EXCLUDED.city, ''), smarthealth_provider_network.city),
          state = COALESCE(NULLIF(EXCLUDED.state, ''), smarthealth_provider_network.state),
          pincode = COALESCE(NULLIF(EXCLUDED.pincode, ''), smarthealth_provider_network.pincode),
          latitude = COALESCE(NULLIF(EXCLUDED.latitude, ''), smarthealth_provider_network.latitude),
          longitude = COALESCE(NULLIF(EXCLUDED.longitude, ''), smarthealth_provider_network.longitude),
          contact_person = COALESCE(NULLIF(EXCLUDED.contact_person, ''), smarthealth_provider_network.contact_person),
          services = CASE
            WHEN jsonb_array_length(EXCLUDED.services) > 0 THEN EXCLUDED.services
            ELSE smarthealth_provider_network.services
          END,
          source_url = COALESCE(NULLIF(EXCLUDED.source_url, ''), smarthealth_provider_network.source_url),
          latest_batch_id = EXCLUDED.latest_batch_id,
          latest_qc_score = EXCLUDED.latest_qc_score,
          metadata = smarthealth_provider_network.metadata || EXCLUDED.metadata,
          updated_at = NOW()`,
        [
          fingerprint,
          row.provider_type,
          row.name,
          row.website,
          row.phone,
          row.email,
          row.address,
          row.city,
          row.state,
          row.pincode,
          row.latitude,
          row.longitude,
          row.contact_person,
          JSON.stringify(row.services || []),
          row.source_url,
          batchId,
          row.qc_score,
          JSON.stringify({
            last_source_type: row.source_type,
            last_entry_id: row.id,
            last_updated_from_batch: batchId
          })
        ]
      );

      await pool.query(
        `UPDATE provider_network_entries
         SET publish_status = 'published',
             published_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [row.id]
      );

      publishedCount += 1;
    }

    await pool.query(
      `UPDATE provider_network_batches
       SET status = 'published',
           published_count = (
             SELECT COUNT(*) FROM provider_network_entries
             WHERE batch_id = $1 AND publish_status = 'published'
           ),
           updated_at = NOW()
       WHERE batch_id = $1`,
      [batchId]
    );

  return { publishedCount };
}

router.post('/publish/:batchId', authTeam, requireProviderNetworkAccess, async (req, res) => {
  try {
    const { batchId } = req.params;
    const { publishedCount } = await publishBatch(batchId, { force: req.body?.force === true });
    return res.json({
      success: true,
      batchId,
      publishedCount,
      publishTarget: 'SmartHealth Provider Network'
    });
  } catch (error) {
    console.error('[provider-network-bot] publish failed:', error);
    return res.status(500).json({ success: false, error: 'Publish failed' });
  }
});

router.get('/batches/:batchId', authTeam, requireProviderNetworkAccess, async (req, res) => {
  try {
    const { batchId } = req.params;
    const { rows: batchRows } = await pool.query(
      `SELECT * FROM provider_network_batches WHERE batch_id = $1`,
      [batchId]
    );
    if (!batchRows.length) {
      return res.status(404).json({ success: false, error: 'Batch not found' });
    }

    const { rows: sampleRows } = await pool.query(
      `SELECT id, provider_type, name, city, state, qc_status, qc_score, qc_missing_fields, publish_status
       FROM provider_network_entries
       WHERE batch_id = $1
       ORDER BY id ASC
       LIMIT 50`,
      [batchId]
    );

    return res.json({ success: true, batch: batchRows[0], sample: sampleRows });
  } catch (error) {
    console.error('[provider-network-bot] batch fetch failed:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch batch' });
  }
});

router.get('/directory/published', async (req, res) => {
  try {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit || 100)));
    const offset = Math.max(0, Number(req.query.offset || 0));
    const typeFilter = text(req.query.provider_type).toLowerCase();
    const cityFilter = text(req.query.city).toLowerCase();

    const conditions = ['1=1'];
    const params = [];
    if (typeFilter) {
      params.push(typeFilter);
      conditions.push(`provider_type = $${params.length}`);
    }
    if (cityFilter) {
      params.push(`%${cityFilter}%`);
      conditions.push(`LOWER(city) LIKE $${params.length}`);
    }

    params.push(limit);
    params.push(offset);
    const whereClause = conditions.join(' AND ');
    const { rows } = await pool.query(
      `SELECT id, provider_type, name, website, phone, email, address, city, state, pincode,
              latitude, longitude, contact_person, services, source_url, published_at, updated_at
       FROM smarthealth_provider_network
       WHERE ${whereClause}
       ORDER BY updated_at DESC NULLS LAST, id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({
      success: true,
      network: 'SmartHealth Provider Network',
      count: rows.length,
      data: rows
    });
  } catch (error) {
    console.error('[provider-network-bot] published directory fetch failed:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch published directory' });
  }
});

// Exported for tests: the parsing and QC rules are where a real spreadsheet
// succeeds or fails, so they are checked directly rather than only through HTTP.
export { normalizeRecord, computeQc, foldKey, normalizeProviderType, runQc, publishBatch, REQUIRED_FIELDS, RECOMMENDED_FIELDS };

export default router;