import { User } from '../models/user.model.intelligent.js';
import FamilyMember from '../models/postgres/family-member.model.postgres.js';
import UserSubscription from '../models/postgres/user-subscription.model.postgres.js';
import SubscriptionMembershipPlan from '../models/postgres/membership-plan.model.postgres.js';
import { UserPlan as AssignedUserPlan, MembershipPlan as AssignedMembershipPlan } from '../models/postgres/membershipPlan.model.postgres.js';
import { postgresSequelize } from '../db/postgres-sequelize.js';

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
  corporate: {
    maxMembers: 6, // Default for corporate, can be overridden by policy
    allowedRelations: ['spouse', 'partner', 'son', 'daughter', 'child', 'father', 'mother']
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

// Gender-neutral words the enum cannot store, resolved when the gender is known.
const GENDERED_RELATIONS = {
  child: { Male: 'son', Female: 'daughter' },
  parent: { Male: 'father', Female: 'mother' },
  sibling: { Male: 'brother', Female: 'sister' },
  grandchild: { Male: 'grandson', Female: 'granddaughter' },
  grandparent: { Male: 'grandfather', Female: 'grandmother' }
};

const RELATION_ALIASES = {
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
  const maxMembers = parseFamilyLimit(plan?.features?.familyMembers);
  const allowedRelations = allowedRelationsFromPlan(plan, maxMembers);
  const planType = plan?.slug || plan?.name || membershipTypeFallback;

  return {
    membershipType: planType,
    maxMembers,
    allowedRelations,
    source,
    planSlug: plan?.slug || null,
    planName: plan?.name || null
  };
}

function normalizeAllowedRelations(relations, fallback = []) {
  if (!Array.isArray(relations)) return fallback;
  const normalized = relations
    .map((item) => normalizeRelation(item))
    .filter(Boolean);
  return normalized.length > 0 ? Array.from(new Set(normalized)) : fallback;
}

function normalizeComponent(component = {}, defaults = {}) {
  const enabled = component.enabled === true || component.isEnabled === true;
  const maxMembers = Number(component.maxMembers ?? component.familyMembers ?? component.dependentLimit);
  return {
    enabled,
    maxMembers: Number.isFinite(maxMembers) ? maxMembers : (defaults.maxMembers ?? 0),
    allowedRelations: normalizeAllowedRelations(
      component.allowedRelations || component.allowed_relationships,
      defaults.allowedRelations || []
    )
  };
}

function resolveCorporateComponentBenefits(userRecord) {
  const metadata = parseJsonSafe(userRecord?.metadata);

  // These root keys are aliases for the same payload shape.
  // Canonical preference is employeeBenefits; others are backward-compatible.
  const benefitRoots = [
    metadata?.employeeBenefits,
    metadata?.hrAssignedBenefits,
    metadata?.corporateBenefits,
    metadata?.benefits
  ];

  const canonicalBenefits = benefitRoots
    .map((item) => parseJsonSafe(item))
    .find((item) => item && typeof item === 'object' && Object.keys(item).length > 0);

  if (!canonicalBenefits || Object.keys(canonicalBenefits).length === 0) {
    return null;
  }

  const merged = canonicalBenefits;

  const insuranceRaw = merged.insurance || merged.insurancePlan || merged.insuranceBenefits || {};
  const opWellnessRaw =
    merged.opWellness ||
    merged.opdWellness ||
    merged.opd ||
    merged.wellness ||
    merged.opdBenefits ||
    merged.wellnessBenefits ||
    {};

  const insurance = normalizeComponent(insuranceRaw, {
    maxMembers: 0,
    allowedRelations: MEMBERSHIP_LIMITS.corporate.allowedRelations
  });
  const opWellness = normalizeComponent(opWellnessRaw, {
    maxMembers: 0,
    allowedRelations: MEMBERSHIP_LIMITS.corporate.allowedRelations
  });

  // Top-level fallbacks: allow HR to send flattened flags.
  const insuranceEnabledTop = merged.insuranceEnabled === true;
  const opWellnessEnabledTop = merged.opWellnessEnabled === true || merged.opdEnabled === true || merged.wellnessEnabled === true;
  if (!insurance.enabled && insuranceEnabledTop) {
    insurance.enabled = true;
    if (insurance.maxMembers <= 0) insurance.maxMembers = MEMBERSHIP_LIMITS.corporate.maxMembers;
  }
  if (!opWellness.enabled && opWellnessEnabledTop) {
    opWellness.enabled = true;
    if (opWellness.maxMembers <= 0) opWellness.maxMembers = MEMBERSHIP_LIMITS.corporate.maxMembers;
  }

  return {
    insurance,
    opWellness,
    source: 'corporate-employee-benefits'
  };
}

function mergeLimitsWithCorporateComponents(baseLimits, corporateComponents) {
  if (!corporateComponents) return baseLimits;

  const insurance = corporateComponents.insurance || {};
  const opWellness = corporateComponents.opWellness || {};

  const activeComponents = [insurance, opWellness].filter((c) => c.enabled);
  if (activeComponents.length === 0) {
    return baseLimits;
  }

  const componentMax = Math.max(...activeComponents.map((c) => Number(c.maxMembers) || 0), 0);
  const componentRelations = Array.from(new Set(
    activeComponents.flatMap((c) => Array.isArray(c.allowedRelations) ? c.allowedRelations : [])
  ));

  return {
    ...baseLimits,
    maxMembers: Math.max(baseLimits.maxMembers || 0, componentMax),
    allowedRelations: componentRelations.length > 0
      ? Array.from(new Set([...(baseLimits.allowedRelations || []), ...componentRelations]))
      : baseLimits.allowedRelations,
    source: `${baseLimits.source}+${corporateComponents.source}`,
    componentBenefits: {
      insurance,
      opWellness
    }
  };
}

async function resolvePlanLimits(userId, membershipTypeFallback = 'individual', userRecord = null, { transaction } = {}) {
  const corporateScoped = isCorporateUser(userRecord, membershipTypeFallback)
    || await hasActiveCorporateRoster(userId, transaction);
  const corporateComponents = corporateScoped ? resolveCorporateComponentBenefits(userRecord) : null;

  // 1) Resolve from user_plans/membership_plans first.
  // This includes team-managed corporate assignments and legacy active plan assignments.
  const activeAssignedPlan = await AssignedUserPlan.findOne({
    where: { userId, status: 'active' },
    include: [{ model: AssignedMembershipPlan, as: 'plan' }],
    order: [['createdAt', 'DESC']],
    transaction
  });

  if (activeAssignedPlan?.plan) {
    const limitsFromPlan = buildLimitsFromPlan(
      activeAssignedPlan.plan,
      membershipTypeFallback,
      corporateScoped ? 'corporate-assigned-plan' : 'active-user-plan'
    );
    return corporateScoped
      ? mergeLimitsWithCorporateComponents(limitsFromPlan, corporateComponents)
      : limitsFromPlan;
  }

  // Corporate users must derive limits from corporate assignment/policy.
  // Do not fallback to personal user_subscriptions for corporate-scoped users.
  if (corporateScoped) {
    if (corporateComponents) {
      return mergeLimitsWithCorporateComponents(
        {
          membershipType: 'corporate',
          maxMembers: 0,
          allowedRelations: [],
          source: 'corporate-without-assigned-plan',
          planSlug: null,
          planName: 'Corporate Policy'
        },
        corporateComponents
      );
    }

    const corporateFallback = MEMBERSHIP_LIMITS.corporate;
    return {
      membershipType: 'corporate',
      maxMembers: corporateFallback.maxMembers,
      allowedRelations: corporateFallback.allowedRelations,
      source: 'corporate-default-policy',
      planSlug: null,
      planName: 'Corporate Policy'
    };
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

/**
 * Validate if user can add family member based on membership type.
 *
 * family_members has FORCED row-level security, so the counts below only see
 * the member's rows when `transaction` carries app.current_user_id (see
 * routes/family-member.route.js). Without it they always read 0.
 */
export const validateFamilyMemberAddition = async (userId, relationship, { transaction } = {}) => {
  // Get user with membership type
  const user = await User.findByPk(userId);
  
  if (!user) {
    throw userNotFound();
  }

  const membershipType = user.membershipType || 'individual';
  const limits = await resolvePlanLimits(userId, membershipType, user, { transaction });

  // Check if membership allows family members
  if (limits.maxMembers === 0) {
    return {
      allowed: false,
      reason: `${limits.membershipType} plan does not allow family members`
    };
  }

  // Check current family member count
  const currentCount = await FamilyMember.count({
    where: { userId, isActive: true },
    transaction
  });

  if (currentCount >= limits.maxMembers) {
    return {
      allowed: false,
      reason: `Maximum family members (${limits.maxMembers}) reached for ${limits.membershipType} plan`
    };
  }

  // Validate relationship type
  const normalizedRelation = normalizeRelation(relationship);
  if (!limits.allowedRelations.includes(normalizedRelation)) {
    return {
      allowed: false,
      reason: `Relationship '${relationship}' not allowed for ${limits.membershipType} plan. Allowed: ${limits.allowedRelations.join(', ')}`
    };
  }

  // Check for duplicate spouse/partner. A partner is stored as 'spouse'; the
  // enum has no 'partner', so querying for it failed with a 500.
  if (normalizedRelation === 'spouse') {
    const existingSpouse = await FamilyMember.findOne({
      where: {
        userId,
        relationship: 'spouse',
        isActive: true
      },
      transaction
    });

    if (existingSpouse) {
      return {
        allowed: false,
        reason: 'You already have a spouse/partner added'
      };
    }
  }

  return {
    allowed: true,
    remaining: Number.isFinite(limits.maxMembers) ? limits.maxMembers - currentCount - 1 : null,
    membershipType: limits.membershipType,
    allowedRelations: limits.allowedRelations,
    planSlug: limits.planSlug,
    planName: limits.planName,
    source: limits.source,
    componentBenefits: limits.componentBenefits || null
  };
};

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

  const currentCount = await FamilyMember.count({
    where: { userId, isActive: true },
    transaction
  });
  const unlimited = !Number.isFinite(limits.maxMembers);

  return {
    membershipType: limits.membershipType,
    source: limits.source,
    planSlug: limits.planSlug,
    planName: limits.planName,
    componentBenefits: limits.componentBenefits || null,
    // Unlimited plans: maxMembers/remaining are null (JSON has no Infinity).
    maxMembers: unlimited ? null : limits.maxMembers,
    unlimited,
    currentCount,
    currentMembers: currentCount,
    remaining: unlimited ? null : Math.max(0, limits.maxMembers - currentCount),
    canAddMore: currentCount < limits.maxMembers,
    allowedRelations: limits.allowedRelations
  };
};

export default {
  STORABLE_RELATIONSHIPS,
  normalizeGender,
  inferFamilyMemberAttributes,
  validateFamilyMemberAddition,
  getFamilyMemberLimits,
  MEMBERSHIP_LIMITS
};
