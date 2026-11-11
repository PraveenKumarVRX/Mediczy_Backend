/**
 * A corporate employee's policy wallet.
 *
 * An employee can hold up to seven group policies at once, and each has a
 * different claim route: a hospital bill is settled cashless on an e-card, an
 * accident or life claim goes through HR with documents and has no card at
 * all, outpatient cover is a balance to spend. The app was showing them as one
 * generic "Insurance" card and picking the first, so six of the seven were
 * invisible and the one shown was arbitrary.
 *
 * This reads the policies as what they are — typed, grouped by the job they
 * do, with the family they cover and the terms that decide what a member pays.
 *
 * Two rules run through every query here:
 *
 *   A member sees their own family and no one else's. A group policy covers
 *   every employee of the corporate, so "the members of this policy" is every
 *   employee's spouse, children and parents. Each read filters on
 *   policy_members."primaryMemberUserId", the column that says whose family a
 *   row belongs to. Dropping that clause discloses other families' dependants,
 *   their relations and their dates of birth.
 *
 *   Nothing is assumed. A term the employer has not supplied comes back null
 *   and is listed in `missing`, so the app can say "not provided by your
 *   employer" rather than render a default as though it were the policy. A
 *   co-pay or a deductible invented here is a number a member would plan
 *   around at a hospital desk.
 */
import { QueryTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';

const MISSING_SCHEMA = ['42703', '42P01'];
const errorCode = (error) => error?.original?.code || error?.parent?.code || error?.code;

export const SCHEMA_NOT_MIGRATED = 'SCHEMA_NOT_MIGRATED';

const schemaError = () => {
  const error = new Error('Typed group policies are not available in this environment yet: migration 20261111000300 has not been applied.');
  error.statusCode = 503;
  error.code = SCHEMA_NOT_MIGRATED;
  return error;
};

/**
 * What each policy type is, which group it belongs to, and which sections of
 * the detail screen apply. The app renders from this rather than hardcoding a
 * second copy that can drift.
 */
export const POLICY_TYPES = {
  GHI: {
    label: 'Group Health Insurance',
    shortLabel: 'GHI',
    group: 'hospital',
    protects: 'Hospitalisation bills: room, surgery, ICU, pre- and post-hospitalisation',
    keyNumberField: 'sumInsured',
    hasECard: true,
    hasNominee: false,
    sections: ['keyNumber', 'members', 'card', 'keyTerms', 'actions', 'documents'],
    actions: ['network_hospitals', 'file_claim', 'how_cashless_works'],
  },
  GHI_TOPUP: {
    label: 'Health top-up',
    shortLabel: 'Top-up',
    group: 'hospital',
    protects: 'Bills beyond the base health sum insured',
    keyNumberField: 'sumInsured',
    hasECard: true,
    hasNominee: false,
    sections: ['keyNumber', 'members', 'card', 'keyTerms', 'actions', 'documents'],
    actions: ['how_claims_work'],
  },
  PARENTS_GHI: {
    label: 'Parents health insurance',
    shortLabel: 'Parents GHI',
    group: 'parents',
    protects: 'Hospitalisation for parents or parents-in-law',
    keyNumberField: 'sumInsured',
    hasECard: true,
    hasNominee: false,
    sections: ['keyNumber', 'members', 'card', 'keyTerms', 'actions', 'documents'],
    actions: ['network_hospitals', 'file_claim', 'how_cashless_works'],
  },
  PARENTS_TOPUP: {
    label: 'Parents top-up',
    shortLabel: 'Parents top-up',
    group: 'parents',
    protects: "Parents' bills beyond the parents' sum insured",
    keyNumberField: 'sumInsured',
    hasECard: true,
    hasNominee: false,
    sections: ['keyNumber', 'members', 'card', 'keyTerms', 'actions', 'documents'],
    actions: ['how_claims_work'],
  },
  GPA: {
    label: 'Group Personal Accident',
    shortLabel: 'GPA',
    group: 'accident_life',
    protects: 'Accidental death and disability',
    keyNumberField: 'coverAmount',
    // Not a hospital card: the employee or nominee claims through HR with
    // documents. Offering an e-card here would send someone to an admission
    // desk with a card no hospital can use.
    hasECard: false,
    hasNominee: true,
    sections: ['keyNumber', 'members', 'benefitSchedule', 'nominee', 'actions', 'documents'],
    actions: ['how_to_claim_documents'],
  },
  GTLI: {
    label: 'Group Term Life Insurance',
    shortLabel: 'GTLI',
    group: 'accident_life',
    protects: 'Death for any reason during employment',
    keyNumberField: 'coverAmount',
    hasECard: false,
    hasNominee: true,
    sections: ['keyNumber', 'members', 'nominee', 'actions', 'documents'],
    actions: ['how_a_claim_is_made'],
  },
  OPD: {
    label: 'Outpatient cover',
    shortLabel: 'OP',
    group: 'outpatient',
    protects: 'Everyday outpatient costs: consultations, diagnostics, pharmacy',
    keyNumberField: 'sumInsured',
    hasECard: false,
    hasNominee: false,
    sections: ['keyNumber', 'members', 'opLimits', 'actions', 'documents'],
    actions: ['book_consult', 'book_lab_test', 'order_medicines'],
  },
};

export const POLICY_GROUPS = [
  { key: 'hospital', label: 'Hospital', emptyLine: "Your employer hasn't added hospital cover." },
  { key: 'accident_life', label: 'Accident & life', emptyLine: "Your employer hasn't added accident cover." },
  { key: 'outpatient', label: 'Outpatient', emptyLine: "Your employer hasn't added outpatient cover." },
  { key: 'parents', label: 'Parents', emptyLine: "Your employer hasn't added cover for parents." },
];

/**
 * The relationships policy_members actually accepts — its CHECK constraint
 * lists self, spouse, son, daughter, father, mother, other — mapped to the
 * four groups the app asks in. The hospital-emergency journey starts with
 * "who needs care?" and then has to pick the right policy: a parent's bill
 * goes to Parents GHI, everyone else's to GHI. It cannot do that from a
 * literal "son" unless something tells it that son is a child.
 *
 * Exported so the app groups by this rather than hardcoding a second copy of
 * the enum that drifts when the constraint changes.
 */
export const RELATION_GROUPS = {
  self: 'self',
  spouse: 'spouse',
  son: 'child',
  daughter: 'child',
  father: 'parent',
  mother: 'parent',
  other: 'other',
};

const relationGroupOf = (relationship) =>
  RELATION_GROUPS[String(relationship || '').trim().toLowerCase()] || 'other';

const positiveInt = (value) => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

/** null, not 0: a sum insured nobody supplied is unknown, not "no cover". */
const numberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const asArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  return [];
};

const toISODate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

const typeOf = (policyType) => {
  const key = String(policyType || '').trim().toUpperCase();
  return POLICY_TYPES[key] ? key : null;
};

const POLICY_COLUMNS = `
  p.id, p."policyNumber", p."policyName", p."policyType", p.status,
  p."sumInsured", p."coverAmount", p."baseSumInsured", p."deductible",
  p."linkedBasePolicyId", p.floater, p."copayPercent", p."roomRentLimit",
  p."maternityCovered", p."benefitSchedule", p."opLimits", p."waitingPeriods",
  p.exclusions, p."policyStartDate", p."policyEndDate", p.voluntary,
  p."premiumPerYear", p."enrolmentFrom", p."enrolmentTo",
  p."policyDocumentUrl", p."claimFormUrl", p."corporateId", p."tpaId",
  c."companyName" AS "insurer"`;

/**
 * Every policy this member is on, with the member's own usage.
 *
 * The join to policy_members is the authorisation: a policy the member has no
 * row on is not returned at all, so no later filter can forget to exclude it.
 */
const loadPolicies = async (userId) => {
  const rows = await sequelize.query(
    `SELECT ${POLICY_COLUMNS},
            m.id                     AS "myMemberRowId",
            m."individualSumInsured" AS "myIndividualSumInsured",
            m."sumInsuredUsed"       AS "myUsed",
            m."sumInsuredRemaining"  AS "myRemaining",
            m."nomineeName", m."nomineeRelation", m."nomineeUpdatedAt",
            m."memberCardNumber"
       FROM policy_members m
       JOIN insurance_policies p ON p.id = m."policyId"
       LEFT JOIN insurance_companies c ON c.id = p."insuranceCompanyId"
      WHERE m."primaryMemberUserId" = :userId
        AND COALESCE(m."isActive", true) = true
        AND lower(COALESCE(p.status, 'active')) IN ('active', 'in_force')
      ORDER BY p."policyType" ASC, p.id ASC`,
    { replacements: { userId }, type: QueryTypes.SELECT }
  );
  // One row per policy, even where the family has several members on it.
  const byPolicy = new Map();
  for (const row of rows) {
    if (!byPolicy.has(row.id)) byPolicy.set(row.id, row);
  }
  return [...byPolicy.values()];
};

/**
 * The member's own family on those policies. Filtered by
 * primaryMemberUserId — see the rule at the top of this file.
 */
const loadMembers = async (userId, policyIds) => {
  if (!policyIds.length) return new Map();
  const rows = await sequelize.query(
    `SELECT m.id                      AS "memberId",
            m."policyId",
            m."userId",
            m.relationship,
            COALESCE(NULLIF(btrim(m."memberName"), ''),
                     NULLIF(btrim(CONCAT_WS(' ', u."firstName", u."lastName")), '')) AS "name",
            COALESCE(m."dateOfBirth", u."dateOfBirth"::date) AS "dob",
            m."individualSumInsured" AS "sumInsured",
            m."sumInsuredUsed"       AS "used",
            m."sumInsuredRemaining"  AS "remaining",
            m."memberCardNumber"
       FROM policy_members m
       LEFT JOIN users u ON u.id = m."userId"
      WHERE m."primaryMemberUserId" = :userId
        AND m."policyId" = ANY(ARRAY[:policyIds]::int[])
        AND COALESCE(m."isActive", true) = true
      ORDER BY CASE lower(m.relationship)
                 WHEN 'self' THEN 0
                 WHEN 'spouse' THEN 1
                 WHEN 'son' THEN 2 WHEN 'daughter' THEN 2
                 WHEN 'father' THEN 3 WHEN 'mother' THEN 3
                 ELSE 4 END,
               m.id ASC`,
    { replacements: { userId, policyIds }, type: QueryTypes.SELECT }
  );
  const byPolicy = new Map();
  for (const row of rows) {
    if (!byPolicy.has(row.policyId)) byPolicy.set(row.policyId, []);
    byPolicy.get(row.policyId).push({
      memberId: String(row.memberId),
      name: row.name || null,
      relation: String(row.relationship || '').toLowerCase() || null,
      relationGroup: relationGroupOf(row.relationship),
      dob: toISODate(row.dob),
      sumInsured: numberOrNull(row.sumInsured),
      used: numberOrNull(row.used),
      remaining: numberOrNull(row.remaining),
      isSelf: Number(row.userId) === Number(userId),
      cardNumber: row.memberCardNumber || null,
    });
  }
  return byPolicy;
};

/** The administering TPA's contact details, where the policy names one. */
const loadTpas = async (tpaIds) => {
  if (!tpaIds.length) return new Map();
  const rows = await sequelize.query(
    `SELECT id, tpa_name AS "name", phone_number AS "helpline", email AS "claimEmail"
       FROM tpas WHERE id = ANY(ARRAY[:tpaIds]::int[])`,
    { replacements: { tpaIds }, type: QueryTypes.SELECT }
  );
  return new Map(rows.map((r) => [Number(r.id), { name: r.name, helpline: r.helpline, claimEmail: r.claimEmail }]));
};

const shapePolicy = (row, members) => {
  const policyType = typeOf(row.policyType);
  const spec = policyType ? POLICY_TYPES[policyType] : null;

  const sumInsured = numberOrNull(row.sumInsured);
  const used = numberOrNull(row.myUsed);
  const remaining = numberOrNull(row.myRemaining) ?? (
    sumInsured !== null && used !== null ? Math.max(sumInsured - used, 0) : null
  );
  const coverAmount = numberOrNull(row.coverAmount);
  const deductible = numberOrNull(row.deductible);

  const opLimits = asArray(row.opLimits).map((entry) => ({
    category: entry?.category ?? null,
    limit: numberOrNull(entry?.limit),
    used: numberOrNull(entry?.used),
  })).filter((entry) => entry.category);

  const benefitSchedule = asArray(row.benefitSchedule).map((entry) => ({
    event: entry?.event ?? null,
    amount: numberOrNull(entry?.amount),
    percent: numberOrNull(entry?.percent),
  })).filter((entry) => entry.event);

  const nominee = row.nomineeName
    ? { name: row.nomineeName, relation: row.nomineeRelation || null, updatedAt: row.nomineeUpdatedAt || null }
    : null;

  // What the employer has not supplied, named rather than defaulted. The app
  // renders "not provided by your employer" from this list.
  const missing = [];
  if (sumInsured === null && coverAmount === null) missing.push(spec?.keyNumberField || 'sumInsured');
  if (!members.length) missing.push('members');
  if ((policyType === 'GHI_TOPUP' || policyType === 'PARENTS_TOPUP') && deductible === null) missing.push('deductible');
  if ((policyType === 'PARENTS_GHI' || policyType === 'PARENTS_TOPUP') && numberOrNull(row.copayPercent) === null) missing.push('copayPercent');
  if (spec?.hasNominee && !nominee) missing.push('nominee');
  if (policyType === 'OPD' && !opLimits.length) missing.push('opLimits');
  if (policyType === 'GPA' && !benefitSchedule.length) missing.push('benefitSchedule');
  if (!row.policyDocumentUrl) missing.push('policyDocumentUrl');

  return {
    id: String(row.id),
    source: 'insurance_policies',
    policyType,
    // An unrecognised type is reported, not silently grouped: a card whose
    // badge and sections were guessed would show the wrong claim route.
    policyTypeRecognised: Boolean(policyType),
    group: spec?.group || 'other',
    typeLabel: spec?.label || row.policyType || null,
    typeBadge: spec?.shortLabel || row.policyType || null,
    protects: spec?.protects || null,
    name: row.policyName || spec?.label || 'Group policy',
    policyNumber: row.policyNumber || null,
    insurer: row.insurer || null,
    status: row.status || 'active',
    validFrom: toISODate(row.policyStartDate),
    validTo: toISODate(row.policyEndDate),

    keyNumberField: spec?.keyNumberField || null,
    sumInsured,
    utilized: used,
    remaining,
    coverAmount,

    floater: row.floater === null || row.floater === undefined ? null : Boolean(row.floater),
    deductible,
    baseSumInsured: numberOrNull(row.baseSumInsured),
    linkedBasePolicyId: row.linkedBasePolicyId === null || row.linkedBasePolicyId === undefined
      ? null : String(row.linkedBasePolicyId),
    copayPercent: numberOrNull(row.copayPercent),
    roomRentLimit: numberOrNull(row.roomRentLimit),
    maternity: row.maternityCovered === null || row.maternityCovered === undefined
      ? null : Boolean(row.maternityCovered),
    waitingPeriods: row.waitingPeriods ?? null,
    exclusions: asArray(row.exclusions).map(String),

    benefitSchedule,
    opLimits,
    nominee,

    members,
    familyCovered: members.length,

    hasECard: Boolean(spec?.hasECard),
    hasNominee: Boolean(spec?.hasNominee),
    sections: spec?.sections || [],
    actions: spec?.actions || [],

    voluntary: Boolean(row.voluntary),
    premiumPerYear: numberOrNull(row.premiumPerYear),
    enrolment: {
      from: toISODate(row.enrolmentFrom),
      to: toISODate(row.enrolmentTo),
      // Open only while today falls inside a window the employer actually
      // set. An absent window is not an open one.
      open: Boolean(row.enrolmentFrom && row.enrolmentTo
        && toISODate(row.enrolmentFrom) <= toISODate(new Date())
        && toISODate(row.enrolmentTo) >= toISODate(new Date())),
    },
    policyDocumentUrl: row.policyDocumentUrl || null,
    claimFormUrl: row.claimFormUrl || null,
    missing,
  };
};

/**
 * Pairs a top-up with the base policy whose sum insured it sits above, and
 * states in words when it begins to pay.
 *
 * Only when the employer supplied the deductible. Without it the top-up is
 * left as its own card — the design says so explicitly, because a ladder drawn
 * from an assumed deductible tells a member their top-up starts at a figure
 * nobody wrote down.
 */
const buildLadders = (policies) => {
  const byId = new Map(policies.map((p) => [p.id, p]));
  const ladders = [];
  for (const topUp of policies) {
    if (topUp.policyType !== 'GHI_TOPUP' && topUp.policyType !== 'PARENTS_TOPUP') continue;
    if (topUp.deductible === null) continue;
    const base = topUp.linkedBasePolicyId ? byId.get(topUp.linkedBasePolicyId) : null;
    ladders.push({
      unit: topUp.policyType === 'PARENTS_TOPUP' ? 'parents' : 'self_and_family',
      basePolicyId: base?.id || null,
      basePolicyName: base?.name || null,
      baseSumInsured: topUp.baseSumInsured ?? base?.sumInsured ?? null,
      baseUsed: base?.utilized ?? null,
      topUpPolicyId: topUp.id,
      topUpPolicyName: topUp.name,
      topUpSumInsured: topUp.sumInsured,
      deductible: topUp.deductible,
      startsPayingAfter: topUp.deductible,
      copayPercent: topUp.copayPercent ?? base?.copayPercent ?? null,
      roomRentLimit: base?.roomRentLimit ?? topUp.roomRentLimit ?? null,
    });
  }
  return ladders;
};

const summarise = (policies) => {
  const sumOf = (types, field) => {
    const relevant = policies.filter((p) => types.includes(p.policyType) && p[field] !== null);
    if (!relevant.length) return null;
    return relevant.reduce((total, p) => total + p[field], 0);
  };
  return {
    hospital: { total: sumOf(['GHI', 'GHI_TOPUP'], 'sumInsured'), group: 'hospital' },
    accidentLife: { total: sumOf(['GPA', 'GTLI'], 'coverAmount'), group: 'accident_life' },
    opBalance: { total: sumOf(['OPD'], 'remaining'), group: 'outpatient' },
    parents: { total: sumOf(['PARENTS_GHI', 'PARENTS_TOPUP'], 'sumInsured'), group: 'parents' },
  };
};

/** The wallet: four summary tiles, the groups in order, every typed policy. */
export async function getPolicyWallet(userId) {
  const id = positiveInt(userId);
  if (!id) return { policies: [], groups: [], summary: summarise([]), ladders: [] };

  let rows;
  try {
    rows = await loadPolicies(id);
  } catch (error) {
    if (MISSING_SCHEMA.includes(errorCode(error))) throw schemaError();
    throw error;
  }

  const membersByPolicy = await loadMembers(id, rows.map((r) => r.id));
  const tpas = await loadTpas([...new Set(rows.map((r) => Number(r.tpaId)).filter(Boolean))]);

  const policies = rows.map((row) => {
    const shaped = shapePolicy(row, membersByPolicy.get(row.id) || []);
    shaped.tpa = tpas.get(Number(row.tpaId)) || null;
    if (!shaped.tpa) shaped.missing.push('tpa');
    return shaped;
  });

  const groups = POLICY_GROUPS.map((group) => ({
    ...group,
    policies: policies.filter((p) => p.group === group.key).map((p) => p.id),
  }));
  const other = policies.filter((p) => !POLICY_GROUPS.some((g) => g.key === p.group));
  if (other.length) {
    groups.push({ key: 'other', label: 'Other cover', emptyLine: null, policies: other.map((p) => p.id) });
  }

  return { policies, groups, summary: summarise(policies), ladders: buildLadders(policies) };
}

/** One policy, or null when the member is not on it. */
export async function getPolicyDetail(userId, policyId) {
  const wallet = await getPolicyWallet(userId);
  const policy = wallet.policies.find((p) => p.id === String(policyId));
  if (!policy) return null;
  return {
    policy,
    ladder: wallet.ladders.find((l) => l.topUpPolicyId === policy.id || l.basePolicyId === policy.id) || null,
  };
}

/**
 * Who is covered by what, as one table: a row per person in the member's own
 * family, a column per policy they hold.
 */
export async function getCoverageMatrix(userId) {
  const { policies } = await getPolicyWallet(userId);

  const people = new Map();
  for (const policy of policies) {
    for (const member of policy.members) {
      // One person appears on several policies. Keyed by name and relation
      // because a dependant has no account id to key on.
      const key = `${member.relation || 'other'}::${(member.name || '').toLowerCase()}`;
      if (!people.has(key)) {
        people.set(key, {
          key, name: member.name, relation: member.relation,
          relationGroup: member.relationGroup, dob: member.dob,
          isSelf: member.isSelf, cover: {},
        });
      }
      const person = people.get(key);
      person.isSelf = person.isSelf || member.isSelf;
      person.cover[policy.id] = {
        covered: true,
        // A floater is one shared sum insured, so a per-person figure would
        // be a fiction; the app shows "Shared".
        shared: policy.floater === true,
        sumInsured: policy.floater === true ? null : (member.sumInsured ?? policy.sumInsured),
        memberId: member.memberId,
        hasCard: policy.hasECard,
      };
    }
  }

  return {
    columns: policies.map((p) => ({
      policyId: p.id, policyType: p.policyType, label: p.typeBadge, group: p.group, hasECard: p.hasECard,
    })),
    rows: [...people.values()].sort((a, b) => (b.isSelf ? 1 : 0) - (a.isSelf ? 1 : 0)),
  };
}

/**
 * The hospital card for one person on one policy.
 *
 * Both ids are checked against the member's own family, so a member cannot
 * fetch a card by guessing a member id; and a type with no card is refused
 * rather than given an unusable one.
 */
export async function getMemberECard(userId, policyId, memberId) {
  const detail = await getPolicyDetail(userId, policyId);
  if (!detail) return { error: 'POLICY_NOT_FOUND' };

  const { policy } = detail;
  if (!policy.hasECard) {
    return { error: 'POLICY_HAS_NO_CARD', policyType: policy.policyType, actions: policy.actions };
  }

  const member = policy.members.find((m) => m.memberId === String(memberId));
  if (!member) return { error: 'MEMBER_NOT_FOUND' };

  return {
    success: true,
    ecard: {
      // The card number the insurer issued, where the employer supplied one.
      // Not minted here: a number this service invented would not match the
      // insurer's records at an admission desk.
      cardNumber: member.cardNumber,
      policyId: policy.id,
      policyType: policy.policyType,
      policyNumber: policy.policyNumber,
      planName: policy.name,
      insurer: policy.insurer,
      memberId: member.memberId,
      memberName: member.name,
      relation: member.relation,
      relationGroup: member.relationGroup,
      dob: member.dob,
      validFrom: policy.validFrom,
      validTill: policy.validTo,
      sumInsured: policy.floater === true ? policy.sumInsured : (member.sumInsured ?? policy.sumInsured),
      shared: policy.floater === true,
      copayPercent: policy.copayPercent,
      roomRentLimit: policy.roomRentLimit,
      tpa: policy.tpa,
      missing: policy.missing,
    },
    topUp: detail.ladder
      ? { policyId: detail.ladder.topUpPolicyId, startsPayingAfter: detail.ladder.startsPayingAfter }
      : null,
  };
}

/**
 * This member's claims on one policy.
 *
 * insurance_claims is snake_case and had no policy id at all — only a
 * free-text policy_number — so there was nothing to list a claim under. The
 * Sequelize InsuranceClaim model declares camelCase "policyId"/"patientId"
 * that the live table does not have; querying those names returned 42703, and
 * tolerating that would have reported "no claims" for a member who had some.
 * Migration 20261111000400 adds policy_id; these are the live column names.
 *
 * The policy is checked against the member's own first, so the endpoint cannot
 * be used to read another family's claims.
 */
export async function listPolicyClaims(userId, policyId) {
  const detail = await getPolicyDetail(userId, policyId);
  if (!detail) return null;

  let rows;
  try {
    rows = await sequelize.query(
      `SELECT claim_number     AS "claimNumber",
              claim_type       AS "claimType",
              diagnosis,
              claim_amount     AS "claimedAmount",
              approved_amount  AS "approvedAmount",
              settled_amount   AS "settledAmount",
              deducted_amount  AS "deductedAmount",
              status,
              settlement_status AS "settlementStatus",
              submitted_at     AS "submittedAt",
              approved_at      AS "approvedAt",
              rejected_at      AS "rejectedAt",
              settlement_date  AS "settlementDate",
              hospitalization_details AS "hospitalization"
         FROM insurance_claims
        WHERE policy_id = :policyId AND patient_id = :userId
        ORDER BY COALESCE(submitted_at, created_at) DESC NULLS LAST, id DESC
        LIMIT 100`,
      { replacements: { policyId: Number(policyId), userId }, type: QueryTypes.SELECT }
    );
  } catch (error) {
    // Only the column arriving with 20261111000400 is tolerated, and it is
    // reported rather than passed off as an empty claim history.
    if (MISSING_SCHEMA.includes(errorCode(error))) {
      return { policyId: detail.policy.id, policyType: detail.policy.policyType, claims: [], unavailable: SCHEMA_NOT_MIGRATED };
    }
    throw error;
  }

  return { policyId: detail.policy.id, policyType: detail.policy.policyType, claims: rows };
}

export default {
  POLICY_TYPES, POLICY_GROUPS, RELATION_GROUPS, SCHEMA_NOT_MIGRATED,
  getPolicyWallet, getPolicyDetail, getCoverageMatrix, getMemberECard, listPolicyClaims,
};
