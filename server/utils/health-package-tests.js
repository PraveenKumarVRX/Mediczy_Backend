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

/**
 * Procedures and examinations that appear in Indian AHC packages without a
 * sample type, so the sample-type splitter cannot end an entry on them. These
 * are standard, universally-written names — the vocabulary decides only where
 * one name *ends* inside text that already contains it, and never adds a test
 * that is not literally present in the source string.
 *
 * Longest first: "2D Echo/Doppler Study" must win over "2D Echo".
 */
export const PROCEDURE_VOCABULARY = [
  'Urine Routine and Microscopy',
  'Erythrocyte Sedimentation Rate (ESR)',
  'Glycosylated Hemoglobin (HbA1C)',
  'Complete Blood Count (CBC)',
  'Liver Function Test (LFT)',
  'USG (abdomen and Pelvis)',
  'BP and weight with BMI',
  'Tread Mill Test (TMT)',
  'Treadmill Test (TMT)',
  '2D Echo/Doppler Study',
  'Physician Consultation',
  'Physical Examination',
  'Glucose Fasting (FBS)',
  'Chest X-Ray (PA view)',
  'Pulmonary Function Test',
  'Audiometry',
  'Spirometry',
  'Thyroid Profile',
  'Lipid Profile',
  'Vitamin B12',
  'Uric Acid',
  'Free T4',
  'Free T3',
  '2D Echo',
  'ECG',
  'TMT',
  'USG',
];

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Split a run of concatenated test names using names that already occur in it.
 *
 * The sample-type splitter ends an entry at "…, Serum", so a run of procedures
 * that carry no sample ("2D Echo/Doppler Study Physician Consultation Tread
 * Mill Test (TMT)") stays glued together as one unreadable item. This breaks
 * such a run on vocabulary matches only.
 *
 * It is deliberately lossless: every character of the input ends up in exactly
 * one returned part, so no test can be dropped and none can be conjured. Text
 * between matches is returned as its own part rather than discarded, and parts
 * the vocabulary did not recognise are flagged `inferred: false` so a reviewer
 * can see what was never understood instead of it disappearing.
 */
export function splitKnownTestNames(text, vocabulary = PROCEDURE_VOCABULARY) {
  const source = String(text || '');
  if (!source.trim()) return [];

  const ordered = [...vocabulary].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(ordered.map(escapeRegExp).join('|'), 'gi');

  const parts = [];
  let cursor = 0;
  for (const match of source.matchAll(pattern)) {
    const start = match.index;
    if (start > cursor) {
      const between = source.slice(cursor, start);
      if (between.trim()) parts.push({ text: between, inferred: false });
    }
    parts.push({ text: match[0], inferred: true });
    cursor = start + match[0].length;
  }
  if (cursor < source.length) {
    const tail = source.slice(cursor);
    if (tail.trim()) parts.push({ text: tail, inferred: false });
  }

  // Nothing recognised: hand the text back whole rather than pretend.
  if (!parts.some((p) => p.inferred)) return [{ text: source, inferred: false }];
  return parts;
}

export const parseTestList = (raw) => {
  const out = [];
  const tidy = (s) => String(s || '').replace(/\s+/g, ' ').replace(/^[\s,;]+|[\s,;]+$/g, '').trim();
  const isNoise = (s) => !s || /^(sl\.?\s*no|tests?)$/i.test(s);
  /** A fragment that qualifies the test before it, rather than naming a new one. */
  const isQualifier = (s) => /^[\s]*[(,]/.test(s)
    || new RegExp(`^[\\s,.]*(?:${TEST_SAMPLE_TYPES})[\\s,.]*$`, 'i').test(s);

  const push = (name) => {
    const n = tidy(name);
    if (isNoise(n)) return;

    // The sample-type splitter ends an entry at "…, Serum", so a run of
    // procedures carrying no sample ("2D Echo/Doppler Study Physician
    // Consultation Tread Mill Test (TMT)") survives as one unreadable item.
    // Break it on names the text already contains; losslessly, so nothing is
    // dropped and nothing is conjured.
    if (n.length > 40) {
      const parts = splitKnownTestNames(n);
      if (parts.filter((p) => p.inferred).length > 1) {
        for (const part of parts) {
          const text = tidy(part.text);
          if (isNoise(text)) continue;
          // "(BP, HT, WT, BMI)" or ", Serum" belongs to the test before it.
          if (!part.inferred && out.length && isQualifier(part.text)) {
            // Keep the comma that separated a test from its sample type:
            // "Uric Acid, Serum", not "Uric Acid Serum".
            const joiner = /^\s*,/.test(part.text) ? ', ' : ' ';
            out[out.length - 1].name = tidy(`${out[out.length - 1].name}${joiner}${text}`);
            continue;
          }
          out.push(part.inferred ? { name: text } : { name: text, unrecognised: true });
        }
        return;
      }
    }
    out.push({ name: n });
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
    // A sample type ends an entry — unless it opens a test name that merely
    // starts with one. "Urine Routine and Microscopy" is a test, not a urine
    // sample, and splitting on its first word tore it in half.
    const SAMPLE_TERMINATOR = `\\b(?:${TEST_SAMPLE_TYPES})\\b(?!\\s+(?:Routine|Culture|Analysis|Examination|Microscopy))`;
    const sampleHits = (s.match(new RegExp(SAMPLE_TERMINATOR, 'gi')) || []).length;
    if (s.length > 100 && sampleHits >= 2) {
      const splitter = new RegExp(`(.*?${SAMPLE_TERMINATOR}),?\\s*`, 'i');
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

/**
 * A package name fit to show a customer.
 *
 * Catalog ids double as names, so the app showed employees the raw
 * "DairyDay_AHC_Sales_2026-27 " — underscores, trailing space and all — on
 * Benefits & Plans and the Membership Card. Some packages do carry a written
 * name in their features ("Equitas Bank Managers Health checkup FY-2025-2026");
 * prefer that, then any explicit displayName, and otherwise humanise the raw
 * identifier rather than printing it as stored.
 *
 * @param {string} rawName       the stored package/catalog name
 * @param {object} [details]     package features/details JSON
 * @param {object} [metadata]    package metadata JSON
 */
export function packageDisplayName(rawName, details = {}, metadata = {}) {
  const clean = (value) => String(value ?? '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();

  const explicit = clean(details?.displayName || metadata?.displayName);
  if (explicit) return explicit;

  // features.name is a written title when it reads like one — a space and no
  // underscore separate "Equitas Bank Managers Health checkup FY-2025-2026"
  // from an id echoed back into the field.
  const featureName = String(details?.name ?? '');
  if (featureName.includes(' ') && !featureName.includes('_')) {
    const written = clean(featureName);
    if (written) return written;
  }

  return clean(rawName) || clean(featureName) || 'Health Checkup Package';
}

export default { parseTestList, testNames, getEmployeeAhcTests, packageDisplayName, TEST_SAMPLE_TYPES };
