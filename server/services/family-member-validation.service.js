import { User } from '../models/user.model.intelligent.js';
import FamilyMember from '../models/postgres/family-member.model.postgres.js';
import UserSubscription from '../models/postgres/user-subscription.model.postgres.js';
import SubscriptionMembershipPlan from '../models/postgres/membership-plan.model.postgres.js';
import { UserPlan as AssignedUserPlan, MembershipPlan as AssignedMembershipPlan } from '../models/postgres/membershipPlan.model.postgres.js';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import {
  FAMILY_COVERAGE_TIERS,
  RELATION_GROUPS,
  IN_LAW_RELATIONSHIPS,
  familyCoverageOf,
  familyCoverageLabel,
  relationGroupOf
} from '../utils/familyCoverage.js';

/**
 * Membership Type Limits
 */
const MEMBERSHIP_LIMITS = {
  individual: {
    maxMembers: 0,
    allowedRelations: []
  },
  couple: {
    maxMembers: 1,
    allowedRelations: ['spouse', 'partner']
  },
  family: {
    maxMembers: 4,
    allowedRelations: ['spouse', 'partner', 'son', 'daughter', 'child']
  },
  // Corporate members are covered by their benefit plan's coverage tier
  // (metadata.familyCoverage), never by a count. Without a tier the employee
  // alone is covered; the old flat default of 6 dependents is gone.
  corporate: {
    maxMembers: 0,
    allowedRelations: []
  }
};

/**
 * Relationships the family_members.relationship enum can store
 * (enum_family_members_relationship). Anything else is refused with a 400
 * before it reaches the database, where it used to fail as a 500.
 */
export const STORABLE_RELATIONSHIPS = Object.freeze([
  'spouse', 'father', 'mother', 'son', 'daughter',
  'brother', 'sister', 'grandfather', 'grandmother',
  'grandson', 'granddaughter', 'uncle', 'aunt',
  'nephew', 'niece', 'cousin', 'guardian', 'other'
]);

/**
 * Parents-in-law. Accepted as input, but storable only once migration
 * 20261115000300-family-relationship-in-laws has added them to the enum; until
 * then an add is refused with a clear message (see inLawRelationshipsStorable).
 */
export { IN_LAW_RELATIONSHIPS };
export const KNOWN_RELATIONSHIPS = Object.freeze([...STORABLE_RELATIONSHIPS, ...IN_LAW_RELATIONSHIPS]);

// Gender-neutral words the enum cannot store, resolved when the gender is known.
const GENDERED_RELATIONS = {
  child: { Male: 'son', Female: 'daughter' },
  parent: { Male: 'father', Female: 'mother' },
  sibling: { Male: 'brother', Female: 'sister' },
  grandchild: { Male: 'grandson', Female: 'granddaughter' },
  grandparent: { Male: 'grandfather', Female: 'grandmother' },
  parent_in_law: { Male: 'father_in_law', Female: 'mother_in_law' }
};

const RELATION_ALIASES = {
  // In-laws first, so the fuzzy keyword match below does not read
  // 'fatherinlaw' as 'father'.
  fatherinlaw: 'father_in_law',
  motherinlaw: 'mother_in_law',
  parentinlaw: 'parent_in_law',
  parentsinlaw: 'parent_in_law',
  spouse: 'spouse',
  wife: 'spouse',
  husband: 'spouse',
  // The enum has no 'partner': a partner is stored as spouse (the app does the same).
  partner: 'spouse',
  grandson: 'grandson',
  granddaughter: 'granddaughter',
  grandchild: 'grandchild',
  grandparent: 'grandparent',
  nephew: 'nephew',
  niece: 'niece',
  cousin: 'cousin',
  child: 'child',
  parent: 'parent',
  sibling: 'sibling',
  son: 'son',
  daughter: 'daughter',
  father: 'father',
  mother: 'mother',
  dad: 'father',
  mom: 'mother',
  grandfather: 'grandfather',
  grandmother: 'grandmother',
  grandpa: 'grandfather',
  grandma: 'grandmother',
  brother: 'brother',
  sister: 'sister',
  uncle: 'uncle',
  aunt: 'aunt',
  guardian: 'guardian',
  // Last, so the fuzzy keyword match below tries 'mother'/'brother' first.
  other: 'other'
};

const RELATION_GENDER_HINTS = {
  father_in_law: 'Male',
  mother_in_law: 'Female',
  father: 'Male',
  dad: 'Male',
  grandfather: 'Male',
  grandpa: 'Male',
  son: 'Male',
  brother: 'Male',
  uncle: 'Male',
  husband: 'Male',
  mother: 'Female',
  mom: 'Female',
  grandmother: 'Female',
  grandma: 'Female',
  daughter: 'Female',
  sister: 'Female',
  aunt: 'Female',
  wife: 'Female'
};

const DEFAULT_RELATIONS_BY_LIMIT = {
  0: [],
  1: ['spouse', 'partner'],
  3: ['spouse', 'partner', 'son', 'daughter', 'child'],
  5: ['spouse', 'partner', 'son', 'daughter', 'child', 'father', 'mother', 'grandfather', 'grandmother'],
  6: ['spouse', 'partner', 'son', 'daughter', 'child', 'father', 'mother', 'grandfather', 'grandmother']
};

const toPositiveInt = (value) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const parseJsonSafe = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

function normalizeRelation(value = '') {
  const cleaned = String(value || '').trim().toLowerCase().replace(/[-_\s]+/g, ' ');
  if (!cleaned) return '';

  // Prefer exact token alias first.
  const exact = RELATION_ALIASES[cleaned.replace(/\s+/g, '')] || RELATION_ALIASES[cleaned];
  if (exact) return exact;

  // Fallback fuzzy keyword match.
  const compact = cleaned.replace(/\s+/g, '');
  // Any other in-law ('sister in law', 'son in law') is not a relationship we
  // store; never let the fuzzy match turn it into 'sister' or 'son'.
  if (compact.includes('inlaw')) {
    return cleaned.replace(/\s+/g, '_');
  }
  for (const [alias, canonical] of Object.entries(RELATION_ALIASES)) {
    if (compact.includes(alias)) {
      return canonical;
    }
  }

  return cleaned.replace(/\s+/g, '_');
}

const GENDER_ALIASES = { male: 'Male', m: 'Male', female: 'Female', f: 'Female', other: 'Other', o: 'Other' };

/**
 * 'Male' | 'Female' | 'Other' for a gender in any case; null when blank;
 * undefined when it is not a gender the enum can store.
 */
export function normalizeGender(value) {
  if (value === undefined || value === null) return null;
  const key = String(value).trim().toLowerCase();
  if (!key) return null;
  return GENDER_ALIASES[key];
}

function inferGenderFromRelationship(relationship = '', providedGender = '') {
  const normalized = String(relationship || '').toLowerCase();
  const gender = normalizeGender(providedGender);
  if (gender) {
    return { gender, inferred: false, confidence: 1 };
  }

  const hinted = RELATION_GENDER_HINTS[normalized];
  if (hinted) {
    return { gender: hinted, inferred: true, confidence: 0.92 };
  }

  return { gender: 'Other', inferred: true, confidence: 0.5 };
}

/**
 * The plan's family-member allowance as a number: a count, Infinity for
 * "unlimited" (Corporate Exclusive stores the string), 0 when missing.
 * Number('unlimited') used to turn that plan into "does not allow family members".
 */
function parseFamilyLimit(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'object') {
    return parseFamilyLimit(value.limit ?? value.maxMembers ?? null);
  }
  if (typeof value === 'string' && value.trim().toLowerCase() === 'unlimited') {
    return Infinity;
  }
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function allowedRelationsFromPlan(plan, maxMembers) {
  const slug = String(plan?.slug || '').toLowerCase();
  const explicit = plan?.features?.allowedRelations || plan?.features?.familyMembers?.allowedRelations;
  if (Array.isArray(explicit) && explicit.length > 0) {
    return explicit.map((r) => normalizeRelation(r));
  }

  if (slug.includes('smart-basic') || slug.includes('silver') || slug === 'vitaltrack') {
    return [];
  }
  if (slug.includes('gold')) {
    return ['spouse', 'partner'];
  }
  if (slug.includes('platinum')) {
    return ['spouse', 'partner', 'son', 'daughter', 'child'];
  }
  if (slug.includes('diamond')) {
    return ['spouse', 'partner', 'son', 'daughter', 'child', 'father', 'mother', 'grandfather', 'grandmother'];
  }
  if (slug.includes('corporate')) {
    return ['spouse', 'partner', 'son', 'daughter', 'child', 'father', 'mother'];
  }

  if (maxMembers === Infinity) {
    return DEFAULT_RELATIONS_BY_LIMIT[6];
  }
  return DEFAULT_RELATIONS_BY_LIMIT[maxMembers] || MEMBERSHIP_LIMITS.family.allowedRelations;
}

function isCorporateUser(userRecord, membershipTypeFallback) {
  const membershipType = String(membershipTypeFallback || userRecord?.membershipType || '').toLowerCase();
  const orgType = String(userRecord?.organization_type || userRecord?.organizationType || '').toLowerCase();
  const hasCorporateId = Boolean(toPositiveInt(userRecord?.corporateId || userRecord?.corporate_id));
  return hasCorporateId || membershipType === 'corporate' || orgType === 'corporate';
}

/**
 * True when the user is an active employee on a corporate roster. Most
 * rostered employees (e.g. the corporate QA login, user 7646) carry no
 * users.corporate_id and organization_type 'individual', so without this they
 * were treated as individual-plan members. The roster row is keyed to its
 * corporate by corporate_uid (entity UID rule), never by a bare integer.
 */
async function hasActiveCorporateRoster(userId, transaction) {
  const rows = await postgresSequelize.query(
    `SELECT 1
       FROM corporate_employees ce
      WHERE ce."userId" = :userId
        AND ce."isActive" = true
        AND ce.corporate_uid IS NOT NULL
        AND (ce."exitDate" IS NULL OR ce."exitDate" >= CURRENT_DATE)
      LIMIT 1`,
    { replacements: { userId }, type: 'SELECT', transaction }
  );
  return Array.isArray(rows) && rows.length > 0;
}

function buildLimitsFromPlan(plan, membershipTypeFallback, source) {
  const planType = plan?.slug || plan?.name || membershipTypeFallback;
  const tier = familyCoverageOf(plan);
  if (tier) {
    return buildTierLimits(tier, {
      membershipType: planType,
      source: `${source}-tier`,
      planSlug: plan?.slug || null,
      planName: plan?.name || null
    });
  }

  const maxMembers = parseFamilyLimit(plan?.features?.familyMembers);
  const allowedRelations = allowedRelationsFromPlan(plan, maxMembers);

  return {
    membershipType: planType,
    coverageMode: 'count',
    familyCoverage: null,
    maxMembers,
    allowedRelations,
    source,
    planSlug: plan?.slug || null,
    planName: plan?.name || null
  };
}

/** Limits for a coverage tier (see utils/familyCoverage.js). */
function buildTierLimits(tier, base) {
  const rules = FAMILY_COVERAGE_TIERS[tier];
  const allowedRelations = [
    ...(rules.spouse > 0 ? RELATION_GROUPS.spouse : []),
    ...(rules.children > 0 ? RELATION_GROUPS.children : []),
    ...(rules.parents > 0 ? [...RELATION_GROUPS.parents, ...RELATION_GROUPS.parentsInLaw] : [])
  ];
  return {
    ...base,
    coverageMode: 'tier',
    familyCoverage: tier,
    maxMembers: rules.spouse + rules.children + rules.parents,
    allowedRelations
  };
}

const isCorporatePlan = (plan) => String(plan?.type || '').toLowerCase() === 'corporate'
  || String(plan?.organizationType || '').toLowerCase() === 'corporate';

/**
 * The corporate benefit plans (subscription_plans, type CORPORATE) that can
 * carry the member's coverage tier: the one a membership plan links to through
 * metadata.subscriptionPlanId, then the member's active corporate subscriptions.
 */
async function corporateSubscriptionPlans(userId, linkedPlanId, transaction) {
  const rows = await postgresSequelize.query(
    `SELECT sp.id, sp.name, sp.slug, sp.type, sp.features, sp.metadata,
            (sp.id = :linkedPlanId) AS linked
       FROM subscription_plans sp
      WHERE sp.type = 'CORPORATE'
        AND (sp.id = :linkedPlanId
             OR sp.id IN (SELECT us.plan_id FROM user_subscriptions us
                           WHERE us.user_id = :userId AND us.status = 'ACTIVE'))
      ORDER BY (sp.id = :linkedPlanId) DESC, sp.id DESC`,
    { replacements: { userId, linkedPlanId: linkedPlanId || 0 }, type: 'SELECT', transaction }
  );
  return Array.isArray(rows) ? rows : [];
}

async function resolvePlanLimits(userId, membershipTypeFallback = 'individual', userRecord = null, { transaction } = {}) {
  const corporateScoped = isCorporateUser(userRecord, membershipTypeFallback)
    || await hasActiveCorporateRoster(userId, transaction);

  // 1) The active user_plans/membership_plans assignment (team-managed corporate
  // assignments and legacy plan assignments).
  const activeAssignedPlan = await AssignedUserPlan.findOne({
    where: { userId, status: 'active' },
    include: [{ model: AssignedMembershipPlan, as: 'plan' }],
    order: [['createdAt', 'DESC']],
    transaction
  });
  const assignedPlan = activeAssignedPlan?.plan || null;

  if (corporateScoped) {
    // Corporate members are covered by their benefit plan's coverage tier, never
    // by a count and never by a personal user_subscriptions plan.
    const assignedCorporatePlan = assignedPlan && isCorporatePlan(assignedPlan) ? assignedPlan : null;
    const linkedPlanId = toPositiveInt(parseJsonSafe(assignedCorporatePlan?.metadata)?.subscriptionPlanId);
    const candidates = [
      ...(assignedCorporatePlan ? [assignedCorporatePlan] : []),
      ...await corporateSubscriptionPlans(userId, linkedPlanId, transaction)
    ];
    const tiered = candidates.find((plan) => familyCoverageOf(plan));
    if (tiered) {
      return buildTierLimits(familyCoverageOf(tiered), {
        membershipType: 'corporate',
        source: 'corporate-plan-tier',
        planSlug: tiered.slug || tiered.code || null,
        planName: tiered.name || null
      });
    }

    // A plan the member holds personally (not a corporate plan) keeps its own rules.
    if (assignedPlan && !assignedCorporatePlan) {
      return buildLimitsFromPlan(assignedPlan, membershipTypeFallback, 'active-user-plan');
    }

    // No tier on any corporate plan: the employee alone is covered.
    const corporatePlan = candidates[0] || null;
    return buildTierLimits('employee', {
      membershipType: 'corporate',
      source: corporatePlan ? 'corporate-plan-without-tier' : 'corporate-without-plan',
      planSlug: corporatePlan?.slug || corporatePlan?.code || null,
      planName: corporatePlan?.name || null
    });
  }

  if (assignedPlan) {
    return buildLimitsFromPlan(assignedPlan, membershipTypeFallback, 'active-user-plan');
  }

  // 2) Fallback to user_subscriptions/subscription_plans.
  const activeSubscription = await UserSubscription.findOne({
    where: { userId, status: 'ACTIVE' },
    order: [['createdAt', 'DESC']],
    transaction
  });

  const plan = activeSubscription?.planId
    ? await SubscriptionMembershipPlan.findByPk(activeSubscription.planId, { transaction })
    : null;
  if (plan) {
    return buildLimitsFromPlan(plan, membershipTypeFallback, 'active-subscription-plan');
  }

  const fallback = MEMBERSHIP_LIMITS[membershipTypeFallback] || MEMBERSHIP_LIMITS.individual;
  return {
    membershipType: membershipTypeFallback,
    coverageMode: 'count',
    familyCoverage: null,
    maxMembers: fallback.maxMembers,
    allowedRelations: fallback.allowedRelations,
    source: 'membership-type',
    planSlug: null,
    planName: null
  };
}

export const inferFamilyMemberAttributes = ({ relationship, relationshipHint, gender }) => {
  let inferredRelationship = normalizeRelation(relationship || relationshipHint || '');
  const providedGender = normalizeGender(gender);
  if (GENDERED_RELATIONS[inferredRelationship] && providedGender) {
    inferredRelationship = GENDERED_RELATIONS[inferredRelationship][providedGender] || inferredRelationship;
  }
  const genderResult = inferGenderFromRelationship(inferredRelationship, gender);

  return {
    relationship: inferredRelationship,
    gender: genderResult.gender,
    aiInference: {
      relationshipInferred: !relationship && Boolean(inferredRelationship),
      genderInferred: genderResult.inferred,
      confidence: Number(genderResult.confidence.toFixed(2))
    }
  };
};

function userNotFound() {
  const error = new Error('User not found');
  error.statusCode = 404;
  return error;
}

// Whether the relationship enum can store parents-in-law yet. A positive answer
// is final; a negative one is re-checked every few minutes so applying the
// migration takes effect without a restart.
const IN_LAW_RECHECK_MS = 5 * 60 * 1000;
let inLawEnumState = { storable: false, checkedAt: 0 };

export async function inLawRelationshipsStorable(transaction) {
  if (inLawEnumState.storable) return true;
  if (inLawEnumState.checkedAt && Date.now() - inLawEnumState.checkedAt < IN_LAW_RECHECK_MS) return false;
  let storable = false;
  try {
    const rows = await postgresSequelize.query(
      `SELECT e.enumlabel
         FROM pg_enum e
         JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'enum_family_members_relationship'
          AND e.enumlabel IN ('father_in_law', 'mother_in_law')`,
      { type: 'SELECT', transaction }
    );
    storable = Array.isArray(rows) && rows.length === IN_LAW_RELATIONSHIPS.length;
  } catch {
    storable = false;
  }
  inLawEnumState = { storable, checkedAt: Date.now() };
  return storable;
}

/** Test hook: forget the cached enum answer. */
export function resetInLawRelationshipCache() {
  inLawEnumState = { storable: false, checkedAt: 0 };
}

export const IN_LAW_UNAVAILABLE_MESSAGE =
  'Parents-in-law cannot be added yet. Please try again later or contact support.';

/** The member's active family members as { id, relationship }, read under the RLS context. */
async function activeMembers(userId, transaction, excludeMemberId = null) {
  const rows = await FamilyMember.findAll({
    where: { userId, isActive: true },
    attributes: ['id', 'relationship'],
    transaction
  });
  return (rows || []).filter((row) => !excludeMemberId || Number(row.id) !== Number(excludeMemberId));
}

function countByGroup(members) {
  const counts = { spouse: 0, children: 0, parents: 0, parentsInLaw: 0, other: 0 };
  for (const member of members) {
    const group = relationGroupOf(member.relationship);
    counts[group || 'other'] += 1;
  }
  return counts;
}

const planLabelOf = (limits) => limits.planName
  || (limits.membershipType === 'corporate' ? 'Your corporate' : limits.membershipType);

const refuse = (reason, extra = {}) => ({ allowed: false, reason, ...extra });

/** Coverage-tier rules: spouse <= 1; children <= 2; parents <= 2 from one side only. */
function checkTierAllowance(limits, members, relation, relationship, inLawsAvailable) {
  const rules = FAMILY_COVERAGE_TIERS[limits.familyCoverage];
  const planLabel = planLabelOf(limits);
  if (limits.maxMembers === 0) {
    return refuse(`${planLabel} plan covers the employee only and does not allow family members`);
  }

  const group = relationGroupOf(relation);
  const groupMax = group === 'parentsInLaw' ? rules.parents : (group ? rules[group] : 0);
  if (!group || groupMax === 0) {
    const allowed = limits.allowedRelations.filter((r) => inLawsAvailable || !IN_LAW_RELATIONSHIPS.includes(r));
    return refuse(`Relationship '${relationship}' not allowed for ${planLabel} plan. Allowed: ${allowed.join(', ')}`);
  }

  const counts = countByGroup(members);
  if (group === 'spouse' && counts.spouse >= rules.spouse) {
    return refuse('You already have a spouse/partner added');
  }
  if (group === 'children' && counts.children >= rules.children) {
    return refuse(`Maximum children (${rules.children}) reached for ${planLabel} plan`);
  }
  if (group === 'parents' && counts.parentsInLaw > 0) {
    return refuse(`${planLabel} plan covers either your parents or your parents-in-law, not both. You have already added a parent-in-law`);
  }
  if (group === 'parentsInLaw' && counts.parents > 0) {
    return refuse(`${planLabel} plan covers either your parents or your parents-in-law, not both. You have already added a parent`);
  }
  if ((group === 'parents' || group === 'parentsInLaw') && counts[group] >= rules.parents) {
    return refuse(`Maximum parents (${rules.parents}) reached for ${planLabel} plan`);
  }
  return null;
}

/** Count-based rules (individual plans without a tier). */
function checkCountAllowance(limits, members, relation, relationship) {
  if (limits.maxMembers === 0) {
    return refuse(`${limits.membershipType} plan does not allow family members`);
  }
  if (members.length >= limits.maxMembers) {
    return refuse(`Maximum family members (${limits.maxMembers}) reached for ${limits.membershipType} plan`);
  }
  if (!limits.allowedRelations.includes(relation)) {
    return refuse(`Relationship '${relationship}' not allowed for ${limits.membershipType} plan. Allowed: ${limits.allowedRelations.join(', ')}`);
  }
  // A partner is stored as 'spouse' (the enum has no 'partner').
  if (relation === 'spouse' && members.some((m) => m.relationship === 'spouse')) {
    return refuse('You already have a spouse/partner added');
  }
  return null;
}

function remainingFor(limits, members) {
  if (!Number.isFinite(limits.maxMembers)) return null;
  if (limits.coverageMode === 'tier') {
    const groups = relationLimitsFor(limits, members, true);
    return groups.spouse.remaining + groups.children.remaining + groups.parents.remaining;
  }
  return Math.max(0, limits.maxMembers - members.length);
}

/**
 * Validate whether the member may add a family member with `relationship`, or
 * change an existing one (`excludeMemberId`) to it.
 *
 * family_members has FORCED row-level security, so the reads below only see
 * the member's rows when `transaction` carries app.current_user_id (see
 * routes/family-member.route.js). Without it they always read 0.
 */
export const validateFamilyMemberAddition = async (userId, relationship, { transaction, excludeMemberId = null } = {}) => {
  const user = await User.findByPk(userId);
  if (!user) {
    throw userNotFound();
  }

  const membershipType = user.membershipType || 'individual';
  const limits = await resolvePlanLimits(userId, membershipType, user, { transaction });
  const members = await activeMembers(userId, transaction, excludeMemberId);
  const relation = normalizeRelation(relationship);
  const inLawsAvailable = await inLawRelationshipsStorable(transaction);

  const refusal = limits.coverageMode === 'tier'
    ? checkTierAllowance(limits, members, relation, relationship, inLawsAvailable)
    : checkCountAllowance(limits, members, relation, relationship);
  if (refusal) return refusal;

  if (IN_LAW_RELATIONSHIPS.includes(relation) && !inLawsAvailable) {
    return refuse(IN_LAW_UNAVAILABLE_MESSAGE, { status: 400 });
  }

  const remaining = remainingFor(limits, members);
  return {
    allowed: true,
    remaining: remaining === null ? null : Math.max(0, remaining - 1),
    membershipType: limits.membershipType,
    allowedRelations: limits.allowedRelations,
    familyCoverage: limits.familyCoverage,
    planSlug: limits.planSlug,
    planName: limits.planName,
    source: limits.source,
    componentBenefits: null
  };
};

/** Per-group allowance for a tier: { spouse, children, parents } with max/current/remaining. */
function relationLimitsFor(limits, members, inLawsAvailable) {
  const rules = FAMILY_COVERAGE_TIERS[limits.familyCoverage];
  const counts = countByGroup(members);
  const group = (max, current, relations) => ({
    max,
    current,
    remaining: Math.max(0, max - current),
    relations: max > 0 ? relations : []
  });

  let side = null;
  if (counts.parents > 0) side = 'parents';
  else if (counts.parentsInLaw > 0) side = 'parents_in_law';
  const parentRelations = side === 'parents'
    ? [...RELATION_GROUPS.parents]
    : side === 'parents_in_law'
      ? [...RELATION_GROUPS.parentsInLaw]
      : [...RELATION_GROUPS.parents, ...(inLawsAvailable ? RELATION_GROUPS.parentsInLaw : [])];

  return {
    spouse: group(rules.spouse, counts.spouse, [...RELATION_GROUPS.spouse]),
    children: group(rules.children, counts.children, [...RELATION_GROUPS.children]),
    parents: {
      ...group(rules.parents, counts.parents + counts.parentsInLaw, parentRelations),
      side,
      sides: rules.parents > 0 ? ['parents', ...(inLawsAvailable ? ['parents_in_law'] : [])] : []
    }
  };
}

/**
 * Get family member limits for user
 */
export const getFamilyMemberLimits = async (userId, { transaction } = {}) => {
  const user = await User.findByPk(userId);
  if (!user) {
    throw userNotFound();
  }

  const membershipType = user.membershipType || 'individual';
  const limits = await resolvePlanLimits(userId, membershipType, user, { transaction });
  const members = await activeMembers(userId, transaction);
  const currentCount = members.length;
  const unlimited = !Number.isFinite(limits.maxMembers);
  const inLawsAvailable = await inLawRelationshipsStorable(transaction);
  const storable = (relation) => !IN_LAW_RELATIONSHIPS.includes(relation) || inLawsAvailable;

  let relationLimits = null;
  let remaining;
  let addableRelations;
  if (limits.coverageMode === 'tier') {
    relationLimits = relationLimitsFor(limits, members, inLawsAvailable);
    remaining = relationLimits.spouse.remaining + relationLimits.children.remaining + relationLimits.parents.remaining;
    addableRelations = Object.values(relationLimits)
      .filter((g) => g.remaining > 0)
      .flatMap((g) => g.relations);
  } else {
    remaining = unlimited ? null : Math.max(0, limits.maxMembers - currentCount);
    const hasSpouse = members.some((m) => m.relationship === 'spouse');
    addableRelations = (unlimited || remaining > 0)
      ? limits.allowedRelations.filter((r) => !(hasSpouse && (r === 'spouse' || r === 'partner')))
      : [];
  }
  addableRelations = Array.from(new Set(addableRelations.filter(storable)));

  return {
    membershipType: limits.membershipType,
    source: limits.source,
    planSlug: limits.planSlug,
    planName: limits.planName,
    // Kept for app compatibility; HR per-employee benefit overrides no longer
    // change the allowance (corporate members are covered by plan tier).
    componentBenefits: null,
    // Unlimited plans: maxMembers/remaining are null (JSON has no Infinity).
    maxMembers: unlimited ? null : limits.maxMembers,
    unlimited,
    currentCount,
    currentMembers: currentCount,
    remaining,
    canAddMore: unlimited || remaining > 0,
    allowedRelations: limits.allowedRelations.filter(storable),
    // Coverage tier (null for count-based plans) and what can still be added.
    coverageMode: limits.coverageMode,
    familyCoverage: limits.familyCoverage,
    familyCoverageLabel: familyCoverageLabel(limits.familyCoverage),
    relationLimits,
    addableRelations,
    inLawsAvailable
  };
};

export default {
  STORABLE_RELATIONSHIPS,
  KNOWN_RELATIONSHIPS,
  IN_LAW_RELATIONSHIPS,
  normalizeGender,
  inferFamilyMemberAttributes,
  validateFamilyMemberAddition,
  getFamilyMemberLimits,
  inLawRelationshipsStorable,
  MEMBERSHIP_LIMITS
};
