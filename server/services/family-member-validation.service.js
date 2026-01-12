import { User } from '../models/user.model.intelligent.js';
import FamilyMember from '../models/postgres/family-member.model.postgres.js';

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
 * Validate if user can add family member based on membership type
 */
export const validateFamilyMemberAddition = async (userId, relationship) => {
  // Get user with membership type
  const user = await User.findByPk(userId);
  
  if (!user) {
    throw new Error('User not found');
  }

  const membershipType = user.membershipType || 'individual';
  const limits = MEMBERSHIP_LIMITS[membershipType];

  if (!limits) {
    throw new Error(`Invalid membership type: ${membershipType}`);
  }

  // Check if membership allows family members
  if (limits.maxMembers === 0) {
    return {
      allowed: false,
      reason: `${membershipType} membership does not allow family members`
    };
  }

  // Check current family member count
  const currentCount = await FamilyMember.count({
    where: { userId, isActive: true }
  });

  if (currentCount >= limits.maxMembers) {
    return {
      allowed: false,
      reason: `Maximum family members (${limits.maxMembers}) reached for ${membershipType} membership`
    };
  }

  // Validate relationship type
  const normalizedRelation = relationship.toLowerCase();
  if (!limits.allowedRelations.includes(normalizedRelation)) {
    return {
      allowed: false,
      reason: `Relationship '${relationship}' not allowed for ${membershipType} membership. Allowed: ${limits.allowedRelations.join(', ')}`
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
    remaining: limits.maxMembers - currentCount - 1
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
  const limits = MEMBERSHIP_LIMITS[membershipType];

  const currentCount = await FamilyMember.count({
    where: { userId, isActive: true }
  });

  return {
    membershipType,
    maxMembers: limits.maxMembers,
    currentMembers: currentCount,
    remaining: Math.max(0, limits.maxMembers - currentCount),
    allowedRelations: limits.allowedRelations
  };
};

export default {
  validateFamilyMemberAddition,
  getFamilyMemberLimits,
  MEMBERSHIP_LIMITS
};
