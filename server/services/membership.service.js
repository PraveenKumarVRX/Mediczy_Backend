import MembershipPlan from '../models/postgres/membership-plan.model.postgres.js';
import UserSubscription from '../models/postgres/user-subscription.model.postgres.js';
import ReferralCode from '../models/postgres/referral-code.model.postgres.js';
import CorporatePlanSponsorship from '../models/postgres/corporate-plan-sponsorship.model.postgres.js';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { MEMBERSHIP_PLANS, canUpgrade } from '../config/membership-plans.config.js';
import healthCoinsService from './health-coins.service.js';

class MembershipService {
  /**
   * Get all active membership plans
   */
  async getAllPlans(type = null) {
    const where = { isActive: true };
    if (type) {
      where.type = type;
    }

    const plans = await MembershipPlan.findAll({
      where,
      order: [['tier', 'ASC'], ['price', 'ASC']]
    });

    return plans;
  }

  /**
   * Get plan by slug
   */
  async getPlanBySlug(slug) {
    const plan = await MembershipPlan.findOne({
      where: { slug, isActive: true }
    });

    if (!plan) {
      throw new Error('Plan not found');
    }

    return plan;
  }

  /**
   * Get user's current active subscription
   */
  async getUserSubscription(userId) {
    const subscription = await UserSubscription.findOne({
      where: {
        userId,
        status: 'ACTIVE'
      },
      include: [
        {
          model: MembershipPlan,
          as: 'plan'
        },
        {
          model: ReferralCode,
          as: 'referralCode'
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    return subscription;
  }

  /**
   * Check if user has valid subscription
   */
  async hasValidSubscription(userId) {
    const subscription = await this.getUserSubscription(userId);
    
    if (!subscription) {
      return false;
    }

    // Check if expired
    if (subscription.endDate && new Date(subscription.endDate) < new Date()) {
      await subscription.update({ status: 'EXPIRED' });
      return false;
    }

    return true;
  }

  /**
   * Validate referral code
   */
  async validateReferralCode(code) {
    const referralCode = await ReferralCode.findOne({
      where: {
        code,
        isActive: true
      },
      include: [
        {
          model: MembershipPlan,
          as: 'plan'
        }
      ]
    });

    if (!referralCode) {
      throw new Error('Invalid referral code');
    }

    // Check expiry
    if (referralCode.validUntil && new Date(referralCode.validUntil) < new Date()) {
      throw new Error('Referral code has expired');
    }

    // Check usage limit
    if (referralCode.maxUses && referralCode.usedCount >= referralCode.maxUses) {
      throw new Error('Referral code usage limit reached');
    }

    // Check valid from
    if (new Date(referralCode.validFrom) > new Date()) {
      throw new Error('Referral code is not yet valid');
    }

    return referralCode;
  }

  /**
   * Enroll user in a plan
   */
  async enrollUser(userId, planSlug, options = {}) {
    const {
      referralCode = null,
      paymentId = null,
      paymentMethod = null,
      billingCycle = 'MONTHLY',
      corporateSponsorshipId = null
    } = options;

    const transaction = await sequelize.transaction();

    try {
      // Check if user already has active subscription
      const existingSubscription = await this.getUserSubscription(userId);
      if (existingSubscription) {
        throw new Error('User already has an active subscription. Use upgrade instead.');
      }

      // Get plan
      const plan = await this.getPlanBySlug(planSlug);

      // Validate referral code if plan requires it
      let validatedReferralCode = null;
      if (plan.requiresReferral) {
        if (!referralCode) {
          throw new Error('This plan requires a referral code');
        }
        validatedReferralCode = await this.validateReferralCode(referralCode);

        // Check if referral code is for this specific plan
        if (validatedReferralCode.planId && validatedReferralCode.planId !== plan.id) {
          throw new Error('Referral code is not valid for this plan');
        }
      } else if (referralCode) {
        // Optional referral code provided
        validatedReferralCode = await this.validateReferralCode(referralCode);
      }

      // Calculate price (with referral discount if applicable)
      let finalPrice = billingCycle === 'ANNUAL' ? plan.annualPrice : plan.price;
      if (validatedReferralCode && validatedReferralCode.discount > 0) {
        finalPrice = finalPrice * (1 - validatedReferralCode.discount / 100);
      }

      // Calculate end date
      let endDate = null;
      if (billingCycle === 'MONTHLY') {
        endDate = new Date();
        endDate.setMonth(endDate.getMonth() + 1);
      } else if (billingCycle === 'ANNUAL') {
        endDate = new Date();
        endDate.setFullYear(endDate.getFullYear() + 1);
      }
      // LIFETIME = null endDate

      // Create subscription
      const subscription = await UserSubscription.create({
        userId,
        planId: plan.id,
        status: finalPrice === 0 ? 'ACTIVE' : 'PENDING',
        startDate: new Date(),
        endDate,
        autoRenew: true,
        billingCycle,
        price: finalPrice,
        currency: plan.currency,
        referralCodeId: validatedReferralCode?.id || null,
        corporateSponsorshipId,
        paymentId,
        paymentMethod: paymentMethod || (finalPrice === 0 ? 'referral' : null),
        paymentStatus: finalPrice === 0 ? 'SUCCESS' : 'PENDING',
        isUpgrade: false,
        metadata: {
          enrolledAt: new Date(),
          originalPrice: billingCycle === 'ANNUAL' ? plan.annualPrice : plan.price,
          discountApplied: validatedReferralCode ? validatedReferralCode.discount : 0
        }
      }, { transaction });

      // Update referral code usage
      if (validatedReferralCode) {
        await validatedReferralCode.increment('usedCount', { transaction });

        // Award bonus coins to referrer
        if (validatedReferralCode.ownerId && validatedReferralCode.bonusCoins > 0) {
          await healthCoinsService.addCoins(
            validatedReferralCode.ownerId,
            validatedReferralCode.bonusCoins,
            'BONUS',
            'REFERRAL',
            `Referral bonus for code: ${validatedReferralCode.code}`
          );
        }

        // Award bonus coins to new user
        if (validatedReferralCode.bonusCoins > 0) {
          await healthCoinsService.addCoins(
            userId,
            validatedReferralCode.bonusCoins,
            'BONUS',
            'REFERRAL',
            `Signup bonus from referral code: ${validatedReferralCode.code}`
          );
        }
      }

      await transaction.commit();

      // Fetch complete subscription
      const completeSubscription = await UserSubscription.findByPk(subscription.id, {
        include: [
          { model: MembershipPlan, as: 'plan' },
          { model: ReferralCode, as: 'referralCode' }
        ]
      });

      return completeSubscription;

    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * Upgrade user to higher plan
   */
  async upgradeSubscription(userId, newPlanSlug, options = {}) {
    const {
      paymentId = null,
      paymentMethod = null,
      billingCycle = 'MONTHLY'
    } = options;

    const transaction = await sequelize.transaction();

    try {
      // Get current subscription
      const currentSubscription = await this.getUserSubscription(userId);
      if (!currentSubscription) {
        throw new Error('No active subscription found. Please enroll first.');
      }

      // Get current and new plans
      const currentPlan = await MembershipPlan.findByPk(currentSubscription.planId);
      const newPlan = await this.getPlanBySlug(newPlanSlug);

      // Validate upgrade
      if (!canUpgrade(currentPlan.tier, newPlan.tier)) {
        throw new Error('Cannot upgrade to a lower or same tier plan');
      }

      if (!newPlan.allowsUpgrade) {
        throw new Error('This plan does not support upgrades');
      }

      // Calculate prorated credit from current subscription
      let proratedCredit = 0;
      if (currentSubscription.endDate) {
        const now = new Date();
        const daysRemaining = Math.ceil((new Date(currentSubscription.endDate) - now) / (1000 * 60 * 60 * 24));
        const totalDays = currentSubscription.billingCycle === 'MONTHLY' ? 30 : 365;
        const daysUsed = totalDays - daysRemaining;
        const percentUsed = daysUsed / totalDays;
        proratedCredit = currentSubscription.price * (1 - percentUsed);
      }

      // Calculate new price
      let newPrice = billingCycle === 'ANNUAL' ? newPlan.annualPrice : newPlan.price;
      newPrice = Math.max(0, newPrice - proratedCredit);

      // Calculate new end date
      let endDate = null;
      if (billingCycle === 'MONTHLY') {
        endDate = new Date();
        endDate.setMonth(endDate.getMonth() + 1);
      } else if (billingCycle === 'ANNUAL') {
        endDate = new Date();
        endDate.setFullYear(endDate.getFullYear() + 1);
      }

      // Cancel current subscription
      await currentSubscription.update({
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: 'Upgraded to higher plan'
      }, { transaction });

      // Create new subscription
      const newSubscription = await UserSubscription.create({
        userId,
        planId: newPlan.id,
        status: newPrice === 0 ? 'ACTIVE' : 'PENDING',
        startDate: new Date(),
        endDate,
        autoRenew: true,
        billingCycle,
        price: newPrice,
        currency: newPlan.currency,
        paymentId,
        paymentMethod,
        paymentStatus: newPrice === 0 ? 'SUCCESS' : 'PENDING',
        isUpgrade: true,
        previousSubscriptionId: currentSubscription.id,
        metadata: {
          upgradedAt: new Date(),
          previousPlanId: currentPlan.id,
          previousPlanName: currentPlan.name,
          proratedCredit,
          originalPrice: billingCycle === 'ANNUAL' ? newPlan.annualPrice : newPlan.price
        }
      }, { transaction });

      // Award upgrade bonus coins
      const upgradeBonus = Math.floor((newPlan.tier - currentPlan.tier) * 20); // 20 coins per tier upgrade
      if (upgradeBonus > 0) {
        await healthCoinsService.addCoins(
          userId,
          upgradeBonus,
          'BONUS',
          'PROFILE_COMPLETION',
          `Upgrade bonus: ${currentPlan.name} → ${newPlan.name}`
        );
      }

      await transaction.commit();

      // Fetch complete subscription
      const completeSubscription = await UserSubscription.findByPk(newSubscription.id, {
        include: [
          { model: MembershipPlan, as: 'plan' }
        ]
      });

      return completeSubscription;

    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(userId, reason = null) {
    const subscription = await this.getUserSubscription(userId);
    
    if (!subscription) {
      throw new Error('No active subscription found');
    }

    await subscription.update({
      status: 'CANCELLED',
      autoRenew: false,
      cancelledAt: new Date(),
      cancelReason: reason
    });

    return subscription;
  }

  /**
   * Get corporate sponsorship for employee
   */
  async getCorporateSponsorship(corporateId, employeeId = null) {
    const where = {
      corporateId,
      isActive: true,
      startDate: { [sequelize.Op.lte]: new Date() }
    };

    // Either specific employee or available for all
    if (employeeId) {
      where[sequelize.Op.or] = [
        { employeeId },
        { employeeId: null, autoAssign: true }
      ];
    }

    const sponsorship = await CorporatePlanSponsorship.findOne({
      where,
      include: [
        { model: MembershipPlan, as: 'plan' }
      ],
      order: [['corporate_share', 'DESC']] // Prioritize higher corporate share
    });

    // Check if sponsorship has expired
    if (sponsorship && sponsorship.endDate && new Date(sponsorship.endDate) < new Date()) {
      await sponsorship.update({ isActive: false });
      return null;
    }

    // Check max employees limit
    if (sponsorship && sponsorship.maxEmployees && sponsorship.usedCount >= sponsorship.maxEmployees) {
      return null;
    }

    return sponsorship;
  }

  /**
   * Enroll corporate employee with sponsorship
   */
  async enrollCorporateEmployee(userId, corporateId, planSlug = null) {
    const transaction = await sequelize.transaction();

    try {
      // Check if employee already has subscription
      const existingSubscription = await this.getUserSubscription(userId);
      if (existingSubscription) {
        throw new Error('Employee already has an active subscription');
      }

      // Get sponsorship (either for specific plan or default corporate basic)
      let sponsorship = null;
      let plan = null;

      if (planSlug) {
        plan = await this.getPlanBySlug(planSlug);
        sponsorship = await CorporatePlanSponsorship.findOne({
          where: {
            corporateId,
            planId: plan.id,
            isActive: true
          }
        });
      }

      if (!sponsorship) {
        // Default to corporate basic plan
        plan = await MembershipPlan.findOne({
          where: { slug: 'corporate-basic', isActive: true }
        });

        if (!plan) {
          throw new Error('Corporate basic plan not found');
        }

        sponsorship = await this.getCorporateSponsorship(corporateId, userId);
      }

      // Calculate employee's share
      const employeePrice = sponsorship
        ? (plan.price * (sponsorship.employeeShare / 100))
        : 0;

      // Create subscription
      const subscription = await UserSubscription.create({
        userId,
        planId: plan.id,
        status: 'ACTIVE',
        startDate: new Date(),
        endDate: sponsorship?.endDate || null,
        autoRenew: true,
        billingCycle: 'MONTHLY',
        price: employeePrice,
        currency: plan.currency,
        corporateSponsorshipId: sponsorship?.id || null,
        paymentMethod: 'corporate',
        paymentStatus: 'SUCCESS',
        isUpgrade: false,
        metadata: {
          corporateId,
          enrolledAt: new Date(),
          corporateShare: sponsorship?.corporateShare || 100,
          employeeShare: sponsorship?.employeeShare || 0,
          originalPrice: plan.price
        }
      }, { transaction });

      // Increment sponsorship usage
      if (sponsorship) {
        await sponsorship.increment('usedCount', { transaction });
      }

      await transaction.commit();

      // Fetch complete subscription
      const completeSubscription = await UserSubscription.findByPk(subscription.id, {
        include: [
          { model: MembershipPlan, as: 'plan' },
          { model: CorporatePlanSponsorship, as: 'sponsorship' }
        ]
      });

      return completeSubscription;

    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * Create corporate sponsorship
   */
  async createCorporateSponsorship(corporateId, sponsorshipData) {
    const {
      planId,
      employeeId = null,
      sponsorshipType = 'FULL',
      corporateShare = 100,
      maxEmployees = null,
      endDate = null,
      autoAssign = true,
      approvalRequired = false,
      department = null,
      conditions = null
    } = sponsorshipData;

    const sponsorship = await CorporatePlanSponsorship.create({
      corporateId,
      planId,
      employeeId,
      sponsorshipType,
      corporateShare,
      employeeShare: 100 - corporateShare,
      maxEmployees,
      startDate: new Date(),
      endDate,
      isActive: true,
      approvalRequired,
      autoAssign,
      department,
      conditions,
      usedCount: 0
    });

    return sponsorship;
  }

  /**
   * Generate unique referral code for user
   */
  async generateReferralCode(userId, planId = null) {
    // Generate unique code
    const generateCode = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let code = '';
      for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return code;
    };

    let code = generateCode();
    let exists = await ReferralCode.findOne({ where: { code } });

    // Regenerate if exists
    while (exists) {
      code = generateCode();
      exists = await ReferralCode.findOne({ where: { code } });
    }

    const referralCode = await ReferralCode.create({
      code,
      type: 'USER',
      ownerId: userId,
      planId,
      discount: 100, // 100% discount for free basic plan
      bonusCoins: 50, // Both referrer and referee get 50 coins
      isActive: true
    });

    return referralCode;
  }

  /**
   * Get user's referral statistics
   */
  async getReferralStats(userId) {
    const referralCode = await ReferralCode.findOne({
      where: { ownerId: userId, type: 'USER' }
    });

    if (!referralCode) {
      return null;
    }

    const referrals = await UserSubscription.findAll({
      where: { referralCodeId: referralCode.id },
      include: [
        { model: MembershipPlan, as: 'plan' }
      ]
    });

    return {
      referralCode: referralCode.code,
      totalReferrals: referralCode.usedCount,
      bonusCoinsEarned: referralCode.usedCount * referralCode.bonusCoins,
      referrals
    };
  }

  /**
   * Check if user can access feature based on plan
   */
  async canAccessFeature(userId, featureName) {
    const subscription = await this.getUserSubscription(userId);
    
    if (!subscription) {
      return { allowed: false, reason: 'No active subscription' };
    }

    const plan = await MembershipPlan.findByPk(subscription.planId);
    const feature = plan.features[featureName];

    if (!feature) {
      return { allowed: false, reason: 'Feature not found in plan' };
    }

    if (!feature.enabled) {
      return { allowed: false, reason: 'Feature not enabled in current plan' };
    }

    // Check limits if applicable
    if (feature.limit && feature.limit !== 'unlimited') {
      // This would require tracking feature usage - implement as needed
      return { allowed: true, limit: feature.limit, period: feature.period };
    }

    return { allowed: true, unlimited: feature.limit === 'unlimited' };
  }
}

export default new MembershipService();
