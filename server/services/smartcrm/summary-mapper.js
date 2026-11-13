/**
 * SmartCRM insurance summary -> the shape the projection writes.
 *
 * PROVISIONAL CONTRACT. SmartCRM's code is not on this machine, so the field
 * names below are what ADR-001 asked SmartCRM's summary endpoint to return,
 * not names read from backend/api_v2/partner_mediqzy_views.py. Before any
 * binding is given read_enabled = true, check this file against that view and
 * its tests and correct the names here — this file is the only place they
 * appear.
 *
 * The mapper is strict on purpose and all-or-nothing: if any required field
 * is missing, nothing is projected. Half a wallet ("where did my top-up go?")
 * is worse than a wallet that says it could not refresh.
 *
 *   {
 *     member:   { id },
 *     policies: [{
 *       id, policy_type, policy_name?, policy_number?, insurer?, tpa?,
 *       sum_insured?, start_date?, end_date?, status?,
 *       members: [{ id, relationship, name?, date_of_birth?, sum_insured?, card_number? }]
 *     }]
 *   }
 */
export const SUMMARY_CONTRACT_VERSION = 'adr001-provisional-1';

const POLICY_TYPE_KEYS = new Set(['GHI', 'GHI_TOPUP', 'PARENTS_GHI', 'PARENTS_TOPUP', 'GPA', 'GTLI', 'OPD']);
const RELATIONSHIPS = {
  self: 'self', employee: 'self',
  spouse: 'spouse', wife: 'spouse', husband: 'spouse',
  son: 'son', daughter: 'daughter',
  father: 'father', mother: 'mother',
};

const idOf = (value) => {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s && s.length <= 80 && /^[A-Za-z0-9_.:-]+$/.test(s) ? s : null;
};
const text = (value, max = 255) => {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s.slice(0, max) : null;
};
const money = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const isoDate = (value) => {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime()) ? s : null;
};

export function mapSummary(body) {
  const fail = (reason) => ({ ok: false, reason, contract: SUMMARY_CONTRACT_VERSION });
  if (!body || typeof body !== 'object') return fail('body is not an object');
  const memberId = idOf(body.member?.id);
  if (!memberId) return fail('member.id missing');
  if (!Array.isArray(body.policies)) return fail('policies is not an array');
  if (body.policies.length > 50) return fail('more than 50 policies');

  const policies = [];
  const seenPolicies = new Set();
  for (const [i, p] of body.policies.entries()) {
    const id = idOf(p?.id);
    if (!id) return fail(`policies[${i}].id missing`);
    if (seenPolicies.has(id)) return fail(`policies[${i}].id duplicated`);
    seenPolicies.add(id);
    const rawType = text(p.policy_type, 40);
    if (!rawType) return fail(`policies[${i}].policy_type missing`);
    const upper = rawType.toUpperCase().replace(/[\s-]+/g, '_');
    if (!Array.isArray(p.members) || p.members.length === 0) return fail(`policies[${i}].members missing`);
    if (p.members.length > 20) return fail(`policies[${i}] has more than 20 members`);

    const members = [];
    const seenMembers = new Set();
    for (const [j, m] of p.members.entries()) {
      const mid = idOf(m?.id);
      if (!mid) return fail(`policies[${i}].members[${j}].id missing`);
      if (seenMembers.has(mid)) return fail(`policies[${i}].members[${j}].id duplicated`);
      seenMembers.add(mid);
      const rel = text(m.relationship, 40);
      if (!rel) return fail(`policies[${i}].members[${j}].relationship missing`);
      const relationship = RELATIONSHIPS[rel.toLowerCase()] || 'other';
      const name = text(m.name);
      // policy_members_identifies_someone: a dependant needs a name, since
      // only 'self' is tied to the Mediqzy user.
      if (relationship !== 'self' && !name) return fail(`policies[${i}].members[${j}].name missing`);
      members.push({
        id: mid,
        relationship,
        name,
        dateOfBirth: isoDate(m.date_of_birth),
        sumInsured: money(m.sum_insured),
        cardNumber: text(m.card_number, 80),
      });
    }
    if (!members.some((m) => m.relationship === 'self')) {
      return fail(`policies[${i}] has no self member`);
    }

    policies.push({
      id,
      policyType: POLICY_TYPE_KEYS.has(upper) ? upper : upper.slice(0, 40),
      knownType: POLICY_TYPE_KEYS.has(upper),
      policyName: text(p.policy_name) || rawType,
      policyNumber: text(p.policy_number, 100),
      insurer: text(p.insurer),
      tpa: text(p.tpa),
      sumInsured: money(p.sum_insured),
      startDate: isoDate(p.start_date),
      endDate: isoDate(p.end_date),
      status: text(p.status, 30)?.toLowerCase() || 'active',
      members,
    });
  }
  return { ok: true, memberId, policies, contract: SUMMARY_CONTRACT_VERSION };
}

export default { mapSummary, SUMMARY_CONTRACT_VERSION };
