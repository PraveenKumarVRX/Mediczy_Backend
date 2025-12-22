import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import membershipService from '../services/membership.service.js';
import { PLAN_TYPES } from '../config/membership-plans.config.js';

const router = express.Router();

/**
 * GET /api/membership-plans/plans
 * Get all available membership plans
 */
router.get('/plans', async (req, res) => {
  try {
    const { type } = req.query;

    if (type && !Object.values(PLAN_TYPES).includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid plan type'
      });
    }

    const plans = await membershipService.getAllPlans(type || null);

    res.json({
      success: true,
      data: { plans }
    });
  } catch (error) {
    console.error('Get plans error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch plans',
      error: error.message
    });
  }
});

/**
 * GET /api/membership-plans/plans/:slug
 * Get specific plan details
 */
router.get('/plans/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const plan = await membershipService.getPlanBySlug(slug);

    res.json({
      success: true,
      data: { plan }
    });
  } catch (error) {
    console.error('Get plan error:', error);
    res.status(404).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/membership-plans/subscription
 * Get user's current subscription
 */
router.get('/subscription', authUser, async (req, res) => {
  try {
    const subscription = await membershipService.getUserSubscription(req.user.id);

    if (!subscription) {
      return res.json({
        success: true,
        data: { 
          subscription: null,
          hasValidSubscription: false
        }
      });
    }

    res.json({
      success: true,
      data: {
        subscription,
        hasValidSubscription: true
      }
    });
  } catch (error) {
    console.error('Get subscription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription',
      error: error.message
    });
  }
});

/**
 * POST /api/membership-plans/validate-referral
 * Validate a referral code
 */
router.post('/validate-referral', async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Referral code is required'
      });
    }

    const referralCode = await membershipService.validateReferralCode(code);

    res.json({
      success: true,
      data: {
        valid: true,
        discount: referralCode.discount,
        bonusCoins: referralCode.bonusCoins,
        planId: referralCode.planId
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
      data: { valid: false }
    });
  }
});

/**
 * POST /api/membership-plans/enroll
 * Enroll user in a membership plan
 */
router.post('/enroll', authUser, async (req, res) => {
  try {
    const {
      planSlug,
      referralCode,
      billingCycle,
      paymentId,
      paymentMethod
    } = req.body;

    if (!planSlug) {
      return res.status(400).json({
        success: false,
        message: 'Plan slug is required'
      });
    }

    const subscription = await membershipService.enrollUser(req.user.id, planSlug, {
      referralCode,
      billingCycle: billingCycle || 'MONTHLY',
      paymentId,
      paymentMethod
    });

    res.json({
      success: true,
      message: 'Successfully enrolled in plan!',
      data: { subscription }
    });
  } catch (error) {
    console.error('Enroll error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/membership-plans/upgrade
 * Upgrade to a higher plan
 */
router.post('/upgrade', authUser, async (req, res) => {
  try {
    const {
      planSlug,
      billingCycle,
      paymentId,
      paymentMethod
    } = req.body;

    if (!planSlug) {
      return res.status(400).json({
        success: false,
        message: 'Plan slug is required'
      });
    }

    const subscription = await membershipService.upgradeSubscription(req.user.id, planSlug, {
      billingCycle: billingCycle || 'MONTHLY',
      paymentId,
      paymentMethod
    });

    res.json({
      success: true,
      message: 'Successfully upgraded plan!',
      data: { subscription }
    });
  } catch (error) {
    console.error('Upgrade error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/membership-plans/cancel
 * Cancel current subscription
 */
router.post('/cancel', authUser, async (req, res) => {
  try {
    const { reason } = req.body;

    const subscription = await membershipService.cancelSubscription(req.user.id, reason);

    res.json({
      success: true,
      message: 'Subscription cancelled successfully',
      data: { subscription }
    });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/membership-plans/referral
 * Get user's referral code and statistics
 */
router.get('/referral', authUser, async (req, res) => {
  try {
    let stats = await membershipService.getReferralStats(req.user.id);

    // Generate referral code if doesn't exist
    if (!stats) {
      const referralCode = await membershipService.generateReferralCode(req.user.id);
      stats = {
        referralCode: referralCode.code,
        totalReferrals: 0,
        bonusCoinsEarned: 0,
        referrals: []
      };
    }

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Get referral stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch referral statistics',
      error: error.message
    });
  }
});

/**
 * POST /api/membership-plans/generate-referral
 * Generate referral code for user
 */
router.post('/generate-referral', authUser, async (req, res) => {
  try {
    const { planId } = req.body;

    const referralCode = await membershipService.generateReferralCode(req.user.id, planId);

    res.json({
      success: true,
      message: 'Referral code generated successfully',
      data: { referralCode }
    });
  } catch (error) {
    console.error('Generate referral code error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate referral code',
      error: error.message
    });
  }
});

/**
 * POST /api/membership-plans/check-feature
 * Check if user can access a specific feature
 */
router.post('/check-feature', authUser, async (req, res) => {
  try {
    const { feature } = req.body;

    if (!feature) {
      return res.status(400).json({
        success: false,
        message: 'Feature name is required'
      });
    }

    const result = await membershipService.canAccessFeature(req.user.id, feature);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Check feature error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check feature access',
      error: error.message
    });
  }
});

/**
 * POST /api/membership-plans/corporate/enroll-employee
 * Enroll corporate employee (requires admin or corporate auth)
 */
router.post('/corporate/enroll-employee', authUser, async (req, res) => {
  try {
    const { userId, corporateId, planSlug } = req.body;

    if (!userId || !corporateId) {
      return res.status(400).json({
        success: false,
        message: 'User ID and Corporate ID are required'
      });
    }

    // TODO: Add corporate admin authorization check

    const subscription = await membershipService.enrollCorporateEmployee(
      userId,
      corporateId,
      planSlug
    );

    res.json({
      success: true,
      message: 'Employee enrolled successfully',
      data: { subscription }
    });
  } catch (error) {
    console.error('Corporate enroll error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/membership-plans/corporate/sponsorship/:corporateId
 * Get corporate sponsorships
 */
router.get('/corporate/sponsorship/:corporateId', authUser, async (req, res) => {
  try {
    const { corporateId } = req.params;

    const sponsorship = await membershipService.getCorporateSponsorship(
      parseInt(corporateId),
      req.user.id
    );

    res.json({
      success: true,
      data: { sponsorship }
    });
  } catch (error) {
    console.error('Get corporate sponsorship error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch corporate sponsorship',
      error: error.message
    });
  }
});

/**
 * POST /api/membership-plans/corporate/create-sponsorship
 * Create corporate plan sponsorship (requires corporate admin)
 */
router.post('/corporate/create-sponsorship', authUser, async (req, res) => {
  try {
    const {
      corporateId,
      planId,
      employeeId,
      sponsorshipType,
      corporateShare,
      maxEmployees,
      endDate,
      autoAssign,
      approvalRequired,
      department,
      conditions
    } = req.body;

    if (!corporateId || !planId) {
      return res.status(400).json({
        success: false,
        message: 'Corporate ID and Plan ID are required'
      });
    }

    // TODO: Add corporate admin authorization check

    const sponsorship = await membershipService.createCorporateSponsorship(corporateId, {
      planId,
      employeeId,
      sponsorshipType,
      corporateShare,
      maxEmployees,
      endDate,
      autoAssign,
      approvalRequired,
      department,
      conditions
    });

    res.json({
      success: true,
      message: 'Corporate sponsorship created successfully',
      data: { sponsorship }
    });
  } catch (error) {
    console.error('Create corporate sponsorship error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

export default router;
