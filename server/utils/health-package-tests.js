/**
 * Shared health-package test-list parsing + per-employee AHC test resolution.
 *
 * `parseTestList` is the single source of truth for normalising a catalog test list
 * (clean array, tab/number-delimited occupational list, or a long lab-export string)
 * into individual { name } items. Extracted from health-checkup.route.js so the HR
 * referral-letter feature prefills the exact same tests the employee sees.
 */
import { postgresSequelize } from '../db/postgres-sequelize.js';

const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const obj = (v) => {
  if (!v) return {};
  if (typeof v === 'object' && !Array.isArray(v)) return v;
  try { const x = JSON.parse(v); return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; } catch { return {}; }
};

export const TEST_SAMPLE_TYPES =
  'sodium fluoride plasma|sodium citrate whole blood|edta whole blood|whole blood|serum|plasma|edta|urine|stool';

export const parseTestList = (raw) => {
  const out = [];
  const push = (name) => {
    const n = String(name || '').replace(/\s+/g, ' ').trim();
    if (n && !/^(sl\.?\s*no|tests?)$/i.test(n)) out.push({ name: n });
  };
  for (const item of arr(raw)) {
    if (item && typeof item === 'object') { out.push(item); continue; }
    const s = String(item || '').trim();
    if (!s) continue;
    if (/[\n\r\t;|••]/.test(s)) {
      s.split(/[\n\r;|••]+|\t+/).forEach((part) =>
        push(part.replace(/\s*\d{1,3}\s*$/, '').replace(/^\s*\d{1,3}[.)]?\s*/, '')));
      continue;
    }
    const sampleHits = (s.match(new RegExp(`\\b(?:${TEST_SAMPLE_TYPES})\\b`, 'gi')) || []).length;
    if (s.length > 100 && sampleHits >= 2) {
      const splitter = new RegExp(`(.*?\\b(?:${TEST_SAMPLE_TYPES})\\b),?\\s*`, 'i');
      let rest = s, guard = 0;
      while (rest.trim() && guard++ < 80) {
        const m = rest.match(splitter);
        if (!m || !m[1]) { push(rest); break; }
        push(m[1]); rest = rest.slice(m[0].length);
      }
      continue;
    }
    push(s);
  }
  return out;
};

/** Convenience: the list of plain test-name strings. */
export const testNames = (raw) => parseTestList(raw).map((t) => String(t?.name ?? t).trim()).filter(Boolean);

/**
 * Resolve an employee's currently-entitled Annual Health Checkup package and its tests
 * (for the referral-letter prefill). Returns null when the employee holds no active,
 * in-window, unused corporate AHC package for this corporate.
 */
export async function getEmployeeAhcTests(employeeUserId, corporateId) {
  const empId = Number(employeeUserId);
  const corpId = Number(corporateId);
  if (!Number.isInteger(empId) || empId < 1 || !Number.isInteger(corpId) || corpId < 1) return null;

  const [row] = await postgresSequelize.query(
    `SELECT uhp."packageId", uhp."packageName", uhp."packageDetails", uhp."validFrom", uhp."validTo",
            p.name AS catalog_name, p.features AS catalog_features, p.metadata AS catalog_metadata
       FROM user_health_packages uhp
       JOIN corporate_health_package_catalog p
         ON p.id = uhp."packageId" AND p.corporate_id = :corpId AND p.is_active = TRUE
      WHERE uhp."userId" = :empId
        AND uhp.corporate_id = :corpId
        AND LOWER(COALESCE(uhp.status,'active')) = 'active'
        AND uhp."usedAt" IS NULL
        AND (uhp."validFrom" IS NULL OR uhp."validFrom"::date <= CURRENT_DATE)
        AND (uhp."validTo"   IS NULL OR uhp."validTo"::date   >= CURRENT_DATE)
      ORDER BY uhp."createdAt" DESC
      LIMIT 1`,
    { replacements: { empId, corpId }, type: postgresSequelize.QueryTypes.SELECT }
  );
  if (!row) return null;

  const features = obj(row.catalog_features || row.packageDetails);
  const tests = testNames(features.tests || features.includedTests || features.features);
  return {
    packageId: String(row.packageId),
    packageName: row.catalog_name || row.packageName || 'Annual Health Checkup',
    validFrom: row.validFrom || null,
    validTo: row.validTo || null,
    tests,
  };
}

export default { parseTestList, testNames, getEmployeeAhcTests, TEST_SAMPLE_TYPES };
