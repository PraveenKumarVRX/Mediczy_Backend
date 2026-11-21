/**
 * SmartCRM insurance summary -> the shape the projection writes.
 *
 * CONTRACT: SmartCRM backend/api_v2/partner_mediqzy_views.py
 * mediqzy_insurance_summary, checked against commit db971d1 (2026-11-19).
 *
 *   GET insurance/summary/[?policy_no=]
 *   { success: true, data: {
 *       member:     { id, Name, EmpId, DOB, Gender, ... , uhid, corporate, corporateId },
 *       policy:     { policyNo, productName, policyType, corporate, payer, status, effectiveFrom, effectiveTo } | null,
 *       policies:   [{ ...policy fields, isPrimary, isActive, employeeSumInsured, cardNo }],   // all of the corporate's, active and expired
 *       ecard:      { ecardUrl, cardNo, insuranceCo, validFrom, validTo },
 *       dependents: [{ id, InsuredName, CardNo, DOB, Gender, RELATIONTXT, Suminsured, BalanceSumInsured,
 *                      PolicyNumber, InsuranceCo, ValidFrom, ValidTo, UHID, ... }]               // of `policy` only
 *   } }
 *
 * Dependants come for ONE policy per call (the primary, or the policy_no
 * asked for), so a full read is one call per active policy; the caller passes
 * the per-policy bodies in `byPolicy`. SmartCRM only honours policy_no for
 * active policies, so an expired policy is projected with the employee only.
 *
 * Strict and all-or-nothing: if anything required is missing, nothing is
 * projected. Half a wallet ("where did my top-up go?") is worse than a wallet
 * that says it could not refresh.
 */
export const SUMMARY_CONTRACT_VERSION = 'smartcrm-db971d1';
export const MAX_POLICIES = 12;

// policy_members_relationship_check allows exactly these.
const RELATIONSHIPS = {
  self: 'self', employee: 'self',
  spouse: 'spouse', wife: 'spouse', husband: 'spouse',
  son: 'son', daughter: 'daughter',
  father: 'father', mother: 'mother',
};

/** Compare policy numbers the way SmartCRM does: case and punctuation ignored. */
export const policyKey = (value) => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const text = (value, max = 255) => {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s.slice(0, max) : null;
};
/** SmartCRM keeps sums insured as text: "500000", "5,00,000", "₹ 5,00,000.00". */
export const money = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/[^0-9.]/g, ''));
  return String(value).match(/\d/) && Number.isFinite(n) && n >= 0 ? n : null;
};
const isoDate = (value) => {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime()) ? s : null;
};
const idOf = (value) => {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s && s.length <= 80 && /^[A-Za-z0-9_.:-]+$/.test(s) ? s : null;
};

/**
 * SmartCRM's policy type is free text ("GHI", "GMC", "Rollover-Floater", product
 * names such as "Parents Top Up"). Read it together with the product name.
 */
export function policyTypeOf(policyType, productName) {
  const t = `${policyType || ''} ${productName || ''}`.toUpperCase();
  const parents = /PARENT/.test(t);
  const topUp = /TOP[\s_-]*UP|SUPER[\s_-]*TOP/.test(t);
  if (/\bOPD\b|OUT[\s-]*PATIENT/.test(t)) return 'OPD';
  if (/\bGTL|TERM[\s_-]*LIFE|\bGROUP[\s_-]*TERM/.test(t)) return 'GTLI';
  if (/\bGPA\b|PERSONAL[\s_-]*ACCIDENT/.test(t)) return 'GPA';
  if (parents && topUp) return 'PARENTS_TOPUP';
  if (topUp) return 'GHI_TOPUP';
  if (parents) return 'PARENTS_GHI';
  if (/\bGHI\b|\bGMC\b|MEDICLAIM|HEALTH|FLOATER|HOSPITAL/.test(t)) return 'GHI';
  return null;
}

const dataOf = (body) => (body && typeof body === 'object' && body.data && typeof body.data === 'object' ? body.data : null);

function dependantOf(d, i, where) {
  const id = idOf(d?.id);
  if (!id) return { error: `${where}.dependents[${i}].id missing` };
  const name = text(d.InsuredName);
  if (!name) return { error: `${where}.dependents[${i}].InsuredName missing` };
  const rawRelation = text(d.RELATIONTXT, 60);
  const relationship = RELATIONSHIPS[String(rawRelation || '').toLowerCase().trim()] || 'other';
  if (relationship === 'self') return { skip: true }; // the employee row is built from member/policies
  const sumInsured = money(d.Suminsured);
  const balance = money(d.BalanceSumInsured);
  return {
    member: {
      id: `dep-${id}`,
      relationship,
      sourceRelation: rawRelation,
      name,
      dateOfBirth: isoDate(d.DOB),
      sumInsured,
      sumInsuredRemaining: balance,
      sumInsuredUsed: sumInsured !== null && balance !== null && balance <= sumInsured ? sumInsured - balance : null,
      cardNumber: text(d.CardNo, 80),
      validFrom: isoDate(d.ValidFrom),
      validTo: isoDate(d.ValidTo),
      insurer: text(d.InsuranceCo),
    },
  };
}

/**
 * @param {object} primary   body of GET insurance/summary/ (no policy_no)
 * @param {object} byPolicy  { [policyKey]: body of GET insurance/summary/?policy_no= }
 */
export function mapSummary(primary, byPolicy = {}) {
  const fail = (reason) => ({ ok: false, reason, contract: SUMMARY_CONTRACT_VERSION });
  if (!primary || typeof primary !== 'object') return fail('body is not an object');
  if (primary.success !== true) return fail('success is not true');
  const data = dataOf(primary);
  if (!data) return fail('data missing');
  const member = data.member;
  const memberId = idOf(member?.id);
  if (!memberId) return fail('member.id missing');
  const memberName = text(member.Name);
  if (!Array.isArray(data.policies)) return fail('policies is not an array');
  if (data.policies.length > MAX_POLICIES) return fail(`more than ${MAX_POLICIES} policies`);

  // Dependants per policy: the primary call's, plus each per-policy call's.
  const dependantsFor = new Map();
  const addDependants = (body, where) => {
    const d = body === primary ? data : dataOf(body);
    if (!d) return `${where}: data missing`;
    if (body !== primary && body.success !== true) return `${where}: success is not true`;
    const key = policyKey(d.policy?.policyNo);
    if (!key) return null; // no policy → no dependants to attribute
    if (!Array.isArray(d.dependents)) return `${where}.dependents is not an array`;
    if (d.dependents.length > 20) return `${where} has more than 20 dependants`;
    const list = [];
    for (const [i, raw] of d.dependents.entries()) {
      if (policyKey(raw?.PolicyNumber) && policyKey(raw.PolicyNumber) !== key) return `${where}.dependents[${i}] belongs to another policy`;
      const r = dependantOf(raw, i, where);
      if (r.error) return r.error;
      if (!r.skip) list.push(r.member);
    }
    dependantsFor.set(key, { list, insurer: text(d.ecard?.insuranceCo) });
    return null;
  };
  const primaryError = addDependants(primary, 'primary');
  if (primaryError) return fail(primaryError);
  for (const [k, body] of Object.entries(byPolicy || {})) {
    const err = addDependants(body, `policy ${k}`);
    if (err) return fail(err);
  }

  const policies = [];
  const seen = new Set();
  for (const [i, p] of data.policies.entries()) {
    const policyNumber = text(p?.policyNo, 100);
    const key = policyKey(policyNumber);
    if (!key) return fail(`policies[${i}].policyNo missing`);
    if (seen.has(key)) continue; // SmartCRM can list a renewed number twice; keep the first
    seen.add(key);
    const type = policyTypeOf(p.policyType, p.productName);
    const active = p.isActive === true;
    const fetched = dependantsFor.get(key);
    if (active && !fetched) return fail(`policies[${i}] is active but its dependants were not read`);
    const insurer = fetched?.insurer || fetched?.list.find((m) => m.insurer)?.insurer || text(p.payer);
    const payer = text(p.payer);
    policies.push({
      id: key,
      policyNumber,
      policyType: type || 'GHI',
      knownType: Boolean(type),
      sourcePolicyType: text(p.policyType, 100),
      policyName: text(p.productName) || text(p.policyType) || policyNumber,
      insurer,
      tpa: payer && payer !== insurer ? payer : null,
      sumInsured: money(p.employeeSumInsured),
      startDate: isoDate(p.effectiveFrom),
      endDate: isoDate(p.effectiveTo),
      status: active ? 'active' : 'expired',
      isPrimary: p.isPrimary === true,
      members: [
        {
          id: 'self',
          relationship: 'self',
          sourceRelation: 'Self',
          name: memberName,
          dateOfBirth: isoDate(member.DOB),
          sumInsured: money(p.employeeSumInsured),
          sumInsuredRemaining: null,
          sumInsuredUsed: null,
          cardNumber: text(p.cardNo, 80),
        },
        ...(fetched?.list || []),
      ],
    });
  }
  return { ok: true, memberId, uhid: text(member.uhid, 40), policies, contract: SUMMARY_CONTRACT_VERSION };
}

/** The active policy numbers whose dependants need their own summary call. */
export function policiesNeedingDetail(primary) {
  const data = dataOf(primary);
  if (!data || !Array.isArray(data.policies)) return [];
  const primaryKey = policyKey(data.policy?.policyNo);
  const out = [];
  const seen = new Set([primaryKey]);
  for (const p of data.policies.slice(0, MAX_POLICIES)) {
    const key = policyKey(p?.policyNo);
    if (!key || seen.has(key) || p.isActive !== true) continue;
    seen.add(key);
    out.push({ key, policyNo: String(p.policyNo).trim() });
  }
  return out;
}

export default { mapSummary, policiesNeedingDetail, policyTypeOf, policyKey, money, SUMMARY_CONTRACT_VERSION };
