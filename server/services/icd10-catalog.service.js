import { connectPostgres } from '../db/postgres.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function dbOrConnected(db) {
  return db || connectPostgres();
}

export function normaliseIcd10Code(value) {
  return String(value ?? '').trim().toUpperCase().replace(/[\.\s]+/g, '');
}

/**
 * Search the imported ICD-10 catalog. The catalog is the source of truth;
 * this service deliberately never invents a code from free text.
 */
export async function searchIcd10({ query, limit = DEFAULT_LIMIT, db } = {}) {
  const searchTerm = String(query ?? '').trim();
  if (searchTerm.length < 2) return [];

  const boundedLimit = Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(limit, 10) || DEFAULT_LIMIT));
  const pool = await dbOrConnected(db);
  const result = await pool.query(`
    SELECT code, description, category
    FROM icd10_codes
    WHERE search_vector @@ plainto_tsquery('english', $1)
       OR code ILIKE $2
       OR description ILIKE $3
    ORDER BY
      CASE WHEN code ILIKE $2 THEN 0 ELSE 1 END,
      ts_rank(search_vector, plainto_tsquery('english', $1)) DESC
    LIMIT $4
  `, [searchTerm, `${searchTerm}%`, `%${searchTerm}%`, boundedLimit]);
  return result.rows;
}

/**
 * Validate clinician/AI supplied codes against the imported catalog. Dots and
 * whitespace are ignored for matching, while the canonical catalog value is
 * returned to callers for persistence and display.
 */
export async function validateIcd10Codes(codes, { db } = {}) {
  const entries = [];
  const seen = new Set();
  for (const value of (Array.isArray(codes) ? codes : [])) {
    const raw = String(value ?? '').trim();
    const normalised = normaliseIcd10Code(raw);
    if (!normalised || seen.has(normalised)) continue;
    seen.add(normalised);
    entries.push({ raw, normalised });
    if (entries.length >= MAX_LIMIT) break;
  }
  const requested = entries.map((entry) => entry.normalised);
  if (requested.length === 0) return { valid: [], invalid: [] };

  const pool = await dbOrConnected(db);
  const result = await pool.query(`
    SELECT code, description, category
    FROM icd10_codes
    WHERE UPPER(REPLACE(code, '.', '')) = ANY($1::text[])
  `, [requested.map((code) => code.replace(/\./g, ''))]);

  const byNormalisedCode = new Map(result.rows.map((row) => [normaliseIcd10Code(row.code), row]));
  return {
    valid: requested.filter((code) => byNormalisedCode.has(code)).map((code) => byNormalisedCode.get(code)),
    invalid: entries.filter((entry) => !byNormalisedCode.has(entry.normalised)).map((entry) => entry.raw),
  };
}

export default { searchIcd10, validateIcd10Codes, normaliseIcd10Code };
