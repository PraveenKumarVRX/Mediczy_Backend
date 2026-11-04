/**
 * lab-terminology.service.js
 * ==========================
 * HyperGrid-backed lab name → LOINC resolver (the terminology authority for report extraction).
 * Reads `hg_code_map` (local_system='lab-name'), which is seeded from `lab_parameter_catalog`
 * (lab-terminology-seed.migration.js). The catalog is the human-editable source; hg_code_map is
 * the runtime authority — exactly the CTO review's model.
 *
 * Resolution is threshold-gated and NEVER guesses a LOINC: below the confidence floor it returns
 * null, so the value is routed to review rather than mis-coded.
 */

import pool from '../db/pgPool.js';

const DEFAULT_MIN_CONFIDENCE = 0.6;
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').replace(/[.:]+$/g, '').trim();

/**
 * @returns {Promise<{loinc:string|null, canonical:string, confidence:number, source:string}|null>}
 */
export async function resolveLabConcept(rawName, { tenantId = null, minConfidence = DEFAULT_MIN_CONFIDENCE } = {}, db = pool) {
  const n = norm(rawName);
  if (!n) return null;

  // 1. Exact local_code match (tenant-specific wins over platform-wide).
  const exact = await db.query(
    `SELECT loinc_code, display FROM hg_code_map
      WHERE local_system='lab-name' AND active AND lower(local_code)=$1 AND (tenant_id=$2 OR tenant_id IS NULL)
      ORDER BY (tenant_id IS NOT NULL) DESC LIMIT 1`,
    [n, tenantId]
  );
  if (exact.rows[0]) return { loinc: exact.rows[0].loinc_code || null, canonical: exact.rows[0].display, confidence: 1, source: 'exact' };

  // 2. Containment: the raw name contains a known alias (e.g. "glycated haemoglobin (hba1c)" ⊇ "hba1c").
  //    Prefer the longest (most specific) alias; confidence = alias coverage of the raw name.
  const contain = await db.query(
    `SELECT local_code, loinc_code, display, length(local_code) AS len
       FROM hg_code_map
      WHERE local_system='lab-name' AND active AND (tenant_id=$2 OR tenant_id IS NULL)
        AND length(local_code) >= 3 AND $1 LIKE '%' || lower(local_code) || '%'
      ORDER BY len DESC LIMIT 1`,
    [n, tenantId]
  );
  if (contain.rows[0]) {
    const conf = Math.min(0.95, Number(contain.rows[0].len) / Math.max(n.length, 1) + 0.3);
    if (conf >= minConfidence) return { loinc: contain.rows[0].loinc_code || null, canonical: contain.rows[0].display, confidence: Number(conf.toFixed(2)), source: 'contains' };
  }

  // 3. Trigram similarity (handles minor spelling/format differences).
  const fuzzy = await db.query(
    `SELECT loinc_code, display, similarity(lower(local_code), $1) AS sim
       FROM hg_code_map
      WHERE local_system='lab-name' AND active AND (tenant_id=$2 OR tenant_id IS NULL) AND lower(local_code) % $1
      ORDER BY sim DESC LIMIT 1`,
    [n, tenantId]
  ).catch(() => ({ rows: [] }));
  if (fuzzy.rows[0] && Number(fuzzy.rows[0].sim) >= minConfidence) {
    return { loinc: fuzzy.rows[0].loinc_code || null, canonical: fuzzy.rows[0].display, confidence: Number(Number(fuzzy.rows[0].sim).toFixed(2)), source: 'fuzzy' };
  }

  return null; // unconfident → null → review (never a guessed code)
}

/** Resolve many names; returns Map<rawName, concept|null>. */
export async function resolveLabConcepts(rawNames, opts = {}, db = pool) {
  const out = new Map();
  const uniq = [...new Set((rawNames || []).filter(Boolean))];
  await Promise.all(uniq.map(async (nm) => out.set(nm, await resolveLabConcept(nm, opts, db))));
  return out;
}

export default { resolveLabConcept, resolveLabConcepts };
