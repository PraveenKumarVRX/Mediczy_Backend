/**
 * HyperGrid Semantic Terminology Service
 *
 * Resolves heterogeneous medical codes into canonical concepts.
 * Supports: ICD-10, ICD-11, SNOMED CT, LOINC, RxNorm, CPT, NDC, local codes.
 *
 * Resolution pipeline:
 *   1. Exact lookup in hg_code_map table
 *   2. Fuzzy text search against hg_terminology catalogue
 *   3. Cache result in Redis
 */

import { createClient } from 'redis';
import { connectPostgres } from '../db/postgres.js';

const REDIS_URL    = process.env.REDIS_URL || 'redis://localhost:6379';
const CACHE_TTL    = parseInt(process.env.TERMINOLOGY_CACHE_TTL || '3600', 10);

let redisClient = null;

export async function initTerminologyService() {
  redisClient = createClient({ url: REDIS_URL });
  redisClient.on('error', e => console.error('[Terminology] Redis error:', e.message));
  await redisClient.connect().catch(() => {
    console.warn('[Terminology] Redis unavailable — cache disabled');
    redisClient = null;
  });
  console.log('[Terminology] Service ready');
}

// ─── Core resolution ──────────────────────────────────────────────────────────

/**
 * Resolve a code from any system into a canonical concept.
 *
 * @param {string} code         - The raw code or text ("E11", "DM2", "madhumeh")
 * @param {string} [system]     - Optional hint: icd10 | icd11 | snomed | loinc | rxnorm | cpt | local
 * @returns {object|null}       - { snomedCode, snomedDisplay, icd10, icd11, loinc, rxnorm, display, confidence }
 */
export async function resolveConcept(code, system = null) {
  if (!code) return null;
  const cacheKey = `hg:term:${system || 'any'}:${code.toLowerCase().trim()}`;

  // 1. Redis cache
  if (redisClient?.isReady) {
    const cached = await redisClient.get(cacheKey).catch(() => null);
    if (cached) return JSON.parse(cached);
  }

  const pool = await connectPostgres();

  // 2. Exact lookup
  let result = await exactLookup(pool, code, system);

  // 3. Fuzzy fallback
  if (!result) result = await fuzzyLookup(pool, code);

  if (result && redisClient?.isReady) {
    await redisClient.setEx(cacheKey, CACHE_TTL, JSON.stringify(result)).catch(() => {});
  }
  return result;
}

async function exactLookup(pool, code, system) {
  const q = system
    ? `SELECT * FROM hg_code_map WHERE source_code = $1 AND source_system = $2 LIMIT 1`
    : `SELECT * FROM hg_code_map WHERE source_code = $1 LIMIT 1`;
  const params = system ? [code, system] : [code];
  const r = await pool.query(q, params).catch(() => ({ rows: [] }));
  return r.rows[0] ? mapRow(r.rows[0]) : null;
}

async function fuzzyLookup(pool, text) {
  // pg_trgm similarity search on display labels
  const r = await pool.query(
    `SELECT *, similarity(display, $1) AS sim
     FROM hg_terminology
     WHERE display ILIKE $2 OR display % $1
     ORDER BY sim DESC
     LIMIT 1`,
    [text, `%${text}%`]
  ).catch(() => ({ rows: [] }));
  if (!r.rows[0]) return null;
  return {
    snomedCode:    r.rows[0].snomed_code,
    snomedDisplay: r.rows[0].snomed_display,
    icd10:         r.rows[0].icd10,
    icd11:         r.rows[0].icd11,
    loinc:         r.rows[0].loinc,
    rxnorm:        r.rows[0].rxnorm,
    display:       r.rows[0].display,
    confidence:    Math.round((r.rows[0].sim || 0) * 100),
    source:        'fuzzy',
  };
}

function mapRow(row) {
  return {
    snomedCode:    row.snomed_code,
    snomedDisplay: row.snomed_display,
    icd10:         row.icd10,
    icd11:         row.icd11,
    loinc:         row.loinc,
    rxnorm:        row.rxnorm,
    display:       row.display,
    confidence:    100,
    source:        'exact',
  };
}

/**
 * Batch-resolve an array of codes.
 * Returns Map: code → concept (or null if unresolvable).
 */
export async function batchResolve(codes, system = null) {
  const results = new Map();
  await Promise.all(codes.map(async code => {
    results.set(code, await resolveConcept(code, system));
  }));
  return results;
}

/**
 * Register a custom local code → canonical concept mapping.
 */
export async function registerLocalCode({ sourceCode, sourceSystem, display,
  snomedCode, snomedDisplay, icd10, icd11, loinc, rxnorm, tenantId }) {
  const pool = await connectPostgres();
  await pool.query(
    `INSERT INTO hg_code_map
       (source_code, source_system, display, snomed_code, snomed_display,
        icd10, icd11, loinc, rxnorm, tenant_id, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
     ON CONFLICT (source_code, source_system, tenant_id)
     DO UPDATE SET
       display = EXCLUDED.display,
       snomed_code = EXCLUDED.snomed_code,
       snomed_display = EXCLUDED.snomed_display,
       icd10 = EXCLUDED.icd10,
       icd11 = EXCLUDED.icd11,
       loinc = EXCLUDED.loinc,
       rxnorm = EXCLUDED.rxnorm`,
    [sourceCode, sourceSystem, display, snomedCode, snomedDisplay,
     icd10, icd11, loinc, rxnorm, tenantId]
  );
  // Bust cache
  if (redisClient?.isReady) {
    await redisClient.del(`hg:term:${sourceSystem}:${sourceCode.toLowerCase()}`).catch(() => {});
  }
}

/**
 * Seed built-in terminology catalogue from JSON file.
 * Called once during DB migration.
 */
export async function seedTerminology(rows) {
  const pool = await connectPostgres();
  for (const row of rows) {
    await pool.query(
      `INSERT INTO hg_terminology
         (snomed_code, snomed_display, icd10, icd11, loinc, rxnorm, display, tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (snomed_code) DO NOTHING`,
      [row.snomedCode, row.snomedDisplay, row.icd10 || null, row.icd11 || null,
       row.loinc || null, row.rxnorm || null, row.display, JSON.stringify(row.tags || [])]
    ).catch(() => {});
  }
}
