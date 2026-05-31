import { User } from '../models/user.model.intelligent.js';
import FamilyMember from '../models/postgres/family-member.model.postgres.js';
import UserSubscription from '../models/postgres/user-subscription.model.postgres.js';
import SubscriptionMembershipPlan from '../models/postgres/membership-plan.model.postgres.js';
import { UserPlan as AssignedUserPlan, MembershipPlan as AssignedMembershipPlan } from '../models/postgres/membershipPlan.model.postgres.js';

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

const RELATION_ALIASES = {
  wife: 'spouse',
  husband: 'spouse',
  partner: 'partner',
  child: 'child',
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
  guardian: 'guardian'
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

function inferGenderFromRelationship(relationship = '', providedGender = '') {
  const normalized = String(relationship || '').toLowerCase();
  if (providedGender && ['Male', 'Female', 'Other'].includes(providedGender)) {
    return { gender: providedGender, inferred: false, confidence: 1 };
  }

  const hinted = RELATION_GENDER_HINTS[normalized];
  if (hinted) {
    return { gender: hinted, inferred: true, confidence: 0.92 };
  }

  return { gender: providedGender || 'Other', inferred: !providedGender, confidence: 0.5 };
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

  return DEFAULT_RELATIONS_BY_LIMIT[maxMembers] || MEMBERSHIP_LIMITS.family.allowedRelations;
}

function isCorporateUser(userRecord, membershipTypeFallback) {
  const membershipType = String(membershipTypeFallback || userRecord?.membershipType || '').toLowerCase();
  const orgType = String(userRecord?.organization_type || userRecord?.organizationType || '').toLowerCase();
  const hasCorporateId = Boolean(toPositiveInt(userRecord?.corporateId || userRecord?.corporate_id));
  return hasCorporateId || membershipType === 'corporate' || orgType === 'corporate';
}

function buildLimitsFromPlan(plan, membershipTypeFallback, source) {
  const familyFeature = plan?.features?.familyMembers;
  const maxMembers = Number(
    typeof familyFeature === 'number'
      ? familyFeature
      : (familyFeature?.limit ?? familyFeature?.maxMembers ?? 0)
  ) || 0;
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

async function resolvePlanLimits(userId, membershipTypeFallback = 'individual', userRecord = null) {
  const corporateScoped = isCorporateUser(userRecord, membershipTypeFallback);
  const corporateComponents = corporateScoped ? resolveCorporateComponentBenefits(userRecord) : null;

  // 1) Resolve from user_plans/membership_plans first.
  // This includes team-managed corporate assignments and legacy active plan assignments.
  const activeAssignedPlan = await AssignedUserPlan.findOne({
    where: { userId, status: 'active' },
    include: [{ model: AssignedMembershipPlan, as: 'plan' }],
    order: [['createdAt', 'DESC']]
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
    order: [['createdAt', 'DESC']]
  });

  const plan = activeSubscription?.planId
    ? await SubscriptionMembershipPlan.findByPk(activeSubscription.planId)
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
  const inferredRelationship = normalizeRelation(relationship || relationshipHint || '');
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

/**
 * Validate if user can add family member based on membership type
 */
export const validateFamilyMemberAddition = async (userId, relationship) => {
  // Get user with membership type
  const user = await User.findByPk(userId);
  
  if (!user) {
    throw new Error('User not found');
  }

  const membershipType = user.membershipType || 'individual';
  const limits = await resolvePlanLimits(userId, membershipType, user);

  // Check if membership allows family members
  if (limits.maxMembers === 0) {
    return {
      allowed: false,
      reason: `${limits.membershipType} plan does not allow family members`
    };
  }

  // Check current family member count
  const currentCount = await FamilyMember.count({
    where: { userId, isActive: true }
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

  // Check for duplicate spouse/partner
  if (['spouse', 'partner'].includes(normalizedRelation)) {
    const existingSpouse = await FamilyMember.findOne({
      where: {
        userId,
        relationship: ['spouse', 'partner'],
        isActive: true
      }
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
    remaining: limits.maxMembers - currentCount - 1,
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
export const getFamilyMemberLimits = async (userId) => {
  const user = await User.findByPk(userId);
  
  if (!user) {
    throw new Error('User not found');
  }

  const membershipType = user.membershipType || 'individual';
  const limits = await resolvePlanLimits(userId, membershipType, user);

  const currentCount = await FamilyMember.count({
    where: { userId, isActive: true }
  });

  return {
    membershipType: limits.membershipType,
    source: limits.source,
    planSlug: limits.planSlug,
    planName: limits.planName,
    componentBenefits: limits.componentBenefits || null,
    maxMembers: limits.maxMembers,
    currentCount,
    currentMembers: currentCount,
    remaining: Math.max(0, limits.maxMembers - currentCount),
    canAddMore: currentCount < limits.maxMembers,
    allowedRelations: limits.allowedRelations
  };
};

export default {
  inferFamilyMemberAttributes,
  validateFamilyMemberAddition,
  getFamilyMemberLimits,
  MEMBERSHIP_LIMITS
};
