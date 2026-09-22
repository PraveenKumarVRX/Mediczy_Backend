/**
 * Drug-class map and name resolution (WP-1.1 / WP-1.2).
 *
 * The class map is clinical content, so it is governed (ADR-06): rows live in the clinical knowledge fabric
 * (domain 'drug_class_map', type 'drug_class') and ONLY medical-director-APPROVED rows are loaded here. A draft or
 * under-review row never changes what a prescription does. Until rows are approved, only exact-substance allergy matching
 * is in force.
 *
 * Brand-to-generic uses the medicine catalogue already held in memory (cims-medicine.service).
 */
import pool from '../db/pgPool.js';
import cimsService from './cims-medicine.service.js';

const CACHE_MS = 60 * 1000;
let cache = { at: 0, classes: null };

/** Normalise a free-text drug string to lower-case words, without strengths, forms and punctuation noise. */
export function normaliseDrugText(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/\b\d+(\.\d+)?\s*(mg|mcg|µg|g|gm|ml|iu|units?|%)\b/g, ' ')
    .replace(/\b(tablets?|tabs?|capsules?|caps?|syrup|suspension|injection|inj|cream|ointment|drops?|sr|xr|er|forte|dt|od|bd|tds|qid|oral|iv|im)\b/g, ' ')
    .replace(/[^a-z0-9+\-/ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const stripTrailingNumber = (s) => s.replace(/\s+\d+(\.\d+)?$/, '');
// 'Paracetamol 500' is how many prescribers write a strength without a unit: keep both spellings.
const splitActives = (s) => normaliseDrugText(s).split(/\s*(?:\+|\/|,|&|\band\b|\bwith\b)\s*/).map((x) => x.trim()).flatMap((x) => [x, stripTrailingNumber(x)]).filter((x) => x.length >= 3);

/**
 * The generic substances a prescribed drug string stands for: the name itself plus, when the catalogue knows it as a
 * brand, that brand's generic name and composition. Returns a de-duplicated array of lower-case names.
 */
export function resolveGenerics(drugText) {
  const out = new Set(splitActives(drugText));
  const whole = normaliseDrugText(drugText);
  if (whole) { out.add(whole); out.add(stripTrailingNumber(whole)); }
  try {
    const meds = cimsService.medicines || [];
    const exact = meds.filter((m) => m._brandLower && (m._brandLower === whole || whole.startsWith(`${m._brandLower} `)));
    for (const m of exact.slice(0, 3)) {
      splitActives(m.genericName || '').forEach((g) => out.add(g));
      splitActives(m.composition || '').forEach((g) => out.add(g));
    }
  } catch { /* catalogue unavailable: fall back to the text alone */ }
  return [...out];
}

/** Catalogue pregnancy category for a drug string ('A'|'B'|'C'|'D'|'X'|null). */
export function pregnancyCategoryOf(drugText) {
  try {
    const whole = normaliseDrugText(drugText);
    const meds = cimsService.medicines || [];
    const m = meds.find((x) => x._brandLower && (x._brandLower === whole || whole.startsWith(`${x._brandLower} `)))
      || meds.find((x) => x._genericLower && x._genericLower === whole);
    const v = String(m?.pregnancy || '').toUpperCase();
    const hit = v.match(/CATEGORY\s*([ABCDX])\b/) || v.match(/^([ABCDX])$/);
    return hit ? hit[1] : null;
  } catch { return null; }
}

/** Approved class definitions: [{ classKey, label, members[], brandAliases[], crossReactsWith[] }]. */
export async function loadApprovedClasses({ force = false } = {}) {
  if (!force && cache.classes && Date.now() - cache.at < CACHE_MS) return cache.classes;
  const { rows } = await pool.query(
    `SELECT payload FROM clinical_knowledge_rules WHERE domain_key = 'drug_class_map' AND rule_type = 'drug_class' AND status = 'approved' AND payload IS NOT NULL`
  );
  const classes = rows.map((r) => r.payload).filter((p) => p?.classKey && Array.isArray(p.members)).map((p) => ({
    classKey: String(p.classKey).toLowerCase(), label: p.label || p.classKey,
    members: p.members.map((m) => normaliseDrugText(m)).filter(Boolean),
    brandAliases: (p.brandAliases || []).map((m) => normaliseDrugText(m)).filter(Boolean),
    crossReactsWith: (p.crossReactsWith || []).map((c) => String(c).toLowerCase()),
  }));
  cache = { at: Date.now(), classes };
  return classes;
}
export function clearDrugClassCache() { cache = { at: 0, classes: null }; }

/** Does free text name a class itself ("Penicillin", "Sulfa", "NSAIDs", "Cephalosporins")? */
export function textNamesClass(text, c) {
  const t = normaliseDrugText(text).replace(/\s+(allergy|class|group|drugs?|antibiotics?)$/, '');
  if (t.length < 4) return false;
  const names = [c.classKey, normaliseDrugText(c.label)].filter(Boolean);
  return names.some((n) => t === n || t === n.replace(/s$/, '') || `${t}s` === n || n.startsWith(t));
}

/** Class keys a drug belongs to, given already-resolved generics and the approved classes (pure). */
export function classesOfGenerics(generics, classes) {
  const found = new Set();
  for (const c of classes) {
    const names = [...c.members, ...c.brandAliases];
    const hit = generics.some((g) => names.some((n) => g === n || g.startsWith(`${n} `) || new RegExp(`(^|[ +/-])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[ +/-])`).test(g)));
    if (hit) found.add(c.classKey);
  }
  return [...found];
}
