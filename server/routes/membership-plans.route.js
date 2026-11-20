import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import membershipService from '../services/membership.service.js';
import paymentGateway from '../services/payment-gateway.service.js';
import { PLAN_TYPES } from '../config/membership-plans.config.js';
import pool from '../db/pgPool.js';
import puppeteer from 'puppeteer';
import QRCode from 'qrcode';
import userModel from '../models/user.model.intelligent.js';
import { UserPlan } from '../models/membershipPlan.model.intelligent.js';
import { entityParam } from '../utils/entity-ref.js';

const router = express.Router();
// Entity references may be the corporate's UID or its numeric id (utils/entity-ref.js).
router.param('corporateId', entityParam('corporates'));

/**
 * GET /api/membership-plans
 * Root — returns all available plans (same as /plans)
 */
router.get('/', async (req, res) => {
  try {
    const { type } = req.query;
    const plans = await membershipService.getAllPlans(type || null);
    res.json({ success: true, data: { plans } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch plans', error: error.message });
  }
});

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
    const userId = req.user.id;
    const currentDate = new Date().toISOString().split('T')[0];
    const userPlan = await UserPlan.findOne({
      where: { userId, status: 'active' },
      order: [['endDate', 'DESC']],
    });

    if (!userPlan) {
      return res.json({
        success: true,
        data: { 
          subscription: null,
          hasValidSubscription: false
        }
      });
    }

    let planInfo = null;
    if (userPlan.membershipPlanId) {
      const { rows } = await pool.query(
        'SELECT id, name, type, price, features FROM membership_plans WHERE id = $1 LIMIT 1',
        [userPlan.membershipPlanId]
      );
      if (rows?.length) planInfo = rows[0];
    }

    res.json({
      success: true,
      data: {
        subscription: {
          id: userPlan.id,
          userId: userPlan.userId,
          membershipPlanId: userPlan.membershipPlanId,
          status: userPlan.status,
          startDate: userPlan.startDate,
          endDate: userPlan.endDate,
          autoRenew: userPlan.autoRenew,
          plan: planInfo,
        },
        hasValidSubscription: true,
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
 * W-PLAN-2 helpers — resolve what a plan actually costs for a billing cycle.
 * The model may expose either camelCase or the raw snake_case column.
 */
const planAmountFor = (plan, billingCycle) => {
  const pick = (...keys) => {
    for (const k of keys) {
      const v = plan?.[k] ?? (typeof plan?.get === 'function' ? plan.get(k) : undefined);
      if (v !== null && v !== undefined && v !== '') return Number(v);
    }
    return 0;
  };
  const monthly = pick('price', 'monthlyPrice', 'monthly_price') || 0;
  const annual = pick('annualPrice', 'annual_price') || 0;
  return String(billingCycle).toUpperCase() === 'ANNUAL' ? (annual || monthly * 12) : monthly;
};

const planCurrency = (plan) => plan?.currency || (typeof plan?.get === 'function' ? plan.get('currency') : null) || 'INR';

/**
 * POST /api/membership-plans/plans/:slug/create-order
 * W-PLAN-2: open a Razorpay order for a paid plan so the client can actually pay.
 * Previously there was no way to buy a paid plan — /enroll just demanded a
 * paymentId that nothing issued (and nothing verified).
 */
router.post('/plans/:slug/create-order', authUser, async (req, res) => {
  try {
    const { slug } = req.params;
    const billingCycle = String(req.body?.billingCycle || 'MONTHLY').toUpperCase();

    let plan;
    try {
      plan = await membershipService.getPlanBySlug(slug);
    } catch {
      return res.status(404).json({ success: false, message: 'Plan not available', code: 'PLAN_NOT_FOUND' });
    }

    const amount = planAmountFor(plan, billingCycle);
    if (!(amount > 0)) {
      return res.status(400).json({
        success: false,
        message: 'This plan is free — no payment is needed.',
        code: 'PLAN_IS_FREE'
      });
    }

    const order = await paymentGateway.createRazorpayOrder({
      amount,
      currency: planCurrency(plan),
      receipt: paymentGateway.generateOrderReceipt('PLAN'),
      notes: {
        purpose: 'membership_plan',
        planSlug: slug,
        billingCycle,
        userId: req.user.id
      }
    });

    return res.json({
      success: true,
      data: {
        orderId: order.orderId,
        amount: order.amount,
        currency: order.currency,
        keyId: process.env.RAZORPAY_KEY_ID || null,
        planSlug: slug,
        planName: plan.name,
        billingCycle
      }
    });
  } catch (error) {
    console.error('[membership-plans] create-order failed:', error?.message);
    return res.status(502).json({
      success: false,
      message: 'Could not start the payment. Please try again in a moment.',
      code: 'PAYMENT_INIT_FAILED'
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
      paymentMethod,
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature
    } = req.body;

    if (!planSlug) {
      return res.status(400).json({
        success: false,
        message: 'Plan slug is required'
      });
    }

    const cycle = String(billingCycle || 'MONTHLY').toUpperCase();

    // W-PLAN-2 / security: a paid plan may only be activated against a Razorpay
    // payment whose signature we verify and whose captured amount covers the plan
    // price. Previously `paymentId` was accepted verbatim and never checked, so any
    // string would activate a paid plan for free.
    let verifiedPaymentId = null;
    let plan;
    try {
      plan = await membershipService.getPlanBySlug(planSlug);
    } catch {
      return res.status(404).json({ success: false, message: 'Plan not available', code: 'PLAN_NOT_FOUND' });
    }

    const expectedAmount = planAmountFor(plan, cycle);

    if (expectedAmount > 0) {
      const payId = razorpayPaymentId || paymentId;
      if (!razorpayOrderId || !payId || !razorpaySignature) {
        return res.status(400).json({
          success: false,
          message: 'Please complete payment to activate this plan.',
          code: 'PAYMENT_REQUIRED',
          action: 'Start the payment for this plan, then retry'
        });
      }

      if (!paymentGateway.verifyRazorpaySignature(razorpayOrderId, payId, razorpaySignature)) {
        console.warn(`[membership-plans] signature mismatch for user ${req.user.id}, order ${razorpayOrderId}`);
        return res.status(400).json({
          success: false,
          message: 'We could not verify that payment. Please try again.',
          code: 'PAYMENT_VERIFICATION_FAILED'
        });
      }

      const fetched = await paymentGateway.fetchRazorpayPayment(payId).catch(() => null);
      const payment = fetched?.payment;
      if (!payment || !['captured', 'authorized'].includes(String(payment.status))) {
        return res.status(400).json({
          success: false,
          message: 'That payment has not completed yet. Please try again.',
          code: 'PAYMENT_NOT_COMPLETED'
        });
      }

      // Compare in paise to avoid float drift.
      if (Math.round(Number(payment.amount) * 100) < Math.round(expectedAmount * 100)) {
        console.warn(`[membership-plans] amount mismatch user ${req.user.id}: paid ${payment.amount}, expected ${expectedAmount}`);
        return res.status(400).json({
          success: false,
          message: 'The payment amount does not match this plan.',
          code: 'PAYMENT_AMOUNT_MISMATCH'
        });
      }

      verifiedPaymentId = payment.id;
    }

    const subscription = await membershipService.enrollUser(req.user.id, planSlug, {
      referralCode,
      billingCycle: cycle,
      paymentId: verifiedPaymentId,
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
 * POST /api/membership-plans/corporate/self-enroll
 * Self-service: logged-in user claims their corporate plan by supplying
 * corporateName, employeeId, and officialEmail.
 * The server looks up the corporate, validates the employee record exists,
 * then maps the corporate's active plan to the user.
 */
router.post('/corporate/self-enroll', authUser, async (req, res) => {
  try {
    const { corporateName, employeeId, officialEmail } = req.body;

    if (!corporateName || !employeeId || !officialEmail) {
      return res.status(400).json({
        success: false,
        message: 'Corporate name, employee ID, and official email are all required'
      });
    }

    // 1. Find the corporate by name (case-insensitive)
    const corpResult = await pool.query(
      `SELECT id, "companyName" AS name FROM corporates WHERE LOWER("companyName") = LOWER($1) AND status = 'active' LIMIT 1`,
      [corporateName.trim()]
    );

    if (!corpResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Corporate organisation not found. Check the name and try again.'
      });
    }

    const corporate = corpResult.rows[0];

    // 2. Verify the employee record at that corporate
    const empResult = await pool.query(
      `SELECT id FROM user_associations
       WHERE LOWER(metadata->>'employeeId') = LOWER($1)
         AND LOWER(metadata->>'officialEmail') = LOWER($2)
         AND "entityType" = 'corporate'
         AND "entityId" = $3
       LIMIT 1`,
      [employeeId.trim(), officialEmail.trim().toLowerCase(), corporate.id]
    );

    if (!empResult.rows.length) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID or official email does not match our records for this corporate.'
      });
    }

    // 3. Find the corporate's active plan slug
    const planResult = await pool.query(
      `SELECT mp.slug
       FROM user_plans up
       JOIN membership_plans mp ON mp.id = up."membershipPlanId"
       WHERE up."userId" = $1
         AND up.status = 'active'
         AND up."corporateId" IS NOT NULL
       ORDER BY up."startDate" DESC
       LIMIT 1`,
      [empResult.rows[0].id]
    );

    // Fallback: use the corporate's default plan slug if the employee doesn't
    // have one assigned yet — admin will have configured it on the corporate.
    let slug = planResult.rows[0]?.slug;

    if (!slug) {
      const corpPlanResult = await pool.query(
        `SELECT mp.slug
         FROM corporate_plans cp
         JOIN membership_plans mp ON mp.id = cp."membershipPlanId"
         WHERE cp."corporateId" = $1 AND cp.status = 'active'
         ORDER BY cp."createdAt" DESC
         LIMIT 1`,
        [corporate.id]
      );
      slug = corpPlanResult.rows[0]?.slug;
    }

    if (!slug) {
      return res.status(400).json({
        success: false,
        message: 'No active corporate health plan found. Please contact your HR or admin.'
      });
    }

    // 4. Enroll (or map) the plan to the requesting user
    const subscription = await membershipService.enrollUser(req.user.id, slug, {
      billingCycle: 'MONTHLY',
      paymentMethod: 'corporate',
      metadata: { corporateId: corporate.id, employeeId, officialEmail }
    });

    return res.json({
      success: true,
      message: `Corporate plan mapped successfully. Welcome to ${corporate.name} health benefits!`,
      data: { subscription }
    });
  } catch (error) {
    console.error('[self-enroll] error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to link corporate plan. Please try again or contact support.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
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

// ─── Tier config (mirrors frontend) ────────────────────────────────────────
const TIER_GRADIENT = {
  free:       'linear-gradient(135deg, #94a3b8 0%, #475569 100%)',
  basic:      'linear-gradient(135deg, #60a5fa 0%, #2563eb 100%)',
  premium:    'linear-gradient(135deg, #c084fc 0%, #ec4899 50%, #f43f5e 100%)',
  enterprise: 'linear-gradient(135deg, #fbbf24 0%, #f97316 50%, #ef4444 100%)',
  corporate:  'linear-gradient(135deg, #34d399 0%, #14b8a6 50%, #06b6d4 100%)',
};

/**
 * GET /api/membership-plans/card-image
 * Returns the user's membership card as a PNG image.
 * Mobile apps can display or cache this directly.
 * Optional query param: ?format=png|jpeg  (default: png)
 *                       ?scale=1|2|3       (default: 2)
 */
router.get('/card-image', authUser, async (req, res) => {
  let browser;
  try {
    const userId = req.user.id;
    const scale  = Math.min(3, Math.max(1, parseInt(req.query.scale) || 2));
    const format = req.query.format === 'jpeg' ? 'jpeg' : 'png';

    // 1. Load user
    const user = await userModel.findByPk(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // 2. Load active plan via UserPlan (same model as auth middleware)
    const currentDate = new Date().toISOString().split('T')[0];
    const userPlan = await UserPlan.findOne({
      where: { userId, status: 'active' },
      order: [['endDate', 'DESC']],
    });
    let planName = 'Basic';
    let tier = 'basic';
    if (userPlan?.membershipPlanId) {
      const { rows } = await pool.query(
        'SELECT name, type FROM membership_plans WHERE id = $1 LIMIT 1',
        [userPlan.membershipPlanId]
      );
      if (rows?.length) {
        planName = rows[0].name || planName;
        tier = (rows[0].type || tier).toLowerCase();
      }
    }
    const gradient  = TIER_GRADIENT[tier] || TIER_GRADIENT.basic;
    const memberId  = `MED-${String(userId).padStart(6, '0')}`;
    const memberSince = user.createdAt
      ? new Date(user.createdAt).getFullYear()
      : new Date().getFullYear();

    // 3. QR code (data URL)
    const qrDataUrl = await QRCode.toDataURL(JSON.stringify({
      memberId,
      name:  `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      email: user.email,
      tier,
      ts:    Date.now(),
    }), { width: 180, margin: 1 });

    // 4. Render HTML card → screenshot
    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:480px; height:280px; font-family:'Segoe UI',system-ui,sans-serif; }
  .card {
    width:480px; height:280px;
    background: ${gradient};
    border-radius:20px;
    position:relative;
    overflow:hidden;
    display:flex;
    flex-direction:column;
    justify-content:space-between;
    padding:28px;
    color:#fff;
  }
  /* shine */
  .card::before {
    content:'';
    position:absolute; inset:0;
    background:linear-gradient(135deg,rgba(255,255,255,0) 30%,rgba(255,255,255,0.25) 60%,rgba(255,255,255,0) 80%);
    pointer-events:none;
  }
  /* circles bg */
  .card::after {
    content:'';
    position:absolute; right:-60px; bottom:-60px;
    width:220px; height:220px;
    border-radius:50%;
    background:rgba(255,255,255,0.08);
    pointer-events:none;
  }
  .header { display:flex; justify-content:space-between; align-items:flex-start; }
  .brand { font-size:16px; font-weight:700; letter-spacing:2px; opacity:.95; }
  .sub   { font-size:11px; opacity:.7; margin-top:2px; }
  .badge {
    background:rgba(255,255,255,0.2);
    border:1px solid rgba(255,255,255,0.35);
    border-radius:999px; padding:4px 12px;
    font-size:11px; font-weight:700; letter-spacing:1px;
  }
  .mid { display:flex; justify-content:space-between; align-items:flex-end; }
  .info {}
  .mid-id  { font-size:11px; opacity:.65; letter-spacing:.5px; margin-bottom:6px; }
  .mid-num { font-size:20px; font-family:monospace; font-weight:700; letter-spacing:4px; }
  .name-lbl{ font-size:11px; opacity:.65; margin-top:10px; }
  .name    { font-size:22px; font-weight:700; letter-spacing:.5px; margin-top:2px; }
  .since   { font-size:11px; opacity:.6; margin-top:6px; }
  .qr-wrap { background:#fff; border-radius:12px; padding:8px; }
  .qr-wrap img { width:80px; height:80px; display:block; }
  .footer  { display:flex; justify-content:space-between; align-items:center; }
  .plan    { font-size:12px; opacity:.7; }
  .plan b  { opacity:1; font-size:13px; }
  .dots    { display:flex; gap:6px; }
  .dot     { width:8px; height:8px; border-radius:50%; background:rgba(255,255,255,0.35); }
  .dot:first-child { background:rgba(255,255,255,0.8); }
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <div>
      <div class="brand">MEDIQZY</div>
      <div class="sub">Healthcare Membership</div>
    </div>
    <div class="badge">${tier.toUpperCase()}</div>
  </div>

  <div class="mid">
    <div class="info">
      <div class="mid-id">MEMBER ID</div>
      <div class="mid-num">${memberId}</div>
      <div class="name-lbl">Member Name</div>
      <div class="name">${user.firstName || ''} ${user.lastName || ''}</div>
      <div class="since">Member since ${memberSince}</div>
    </div>
    <div class="qr-wrap">
      <img src="${qrDataUrl}" alt="QR"/>
    </div>
  </div>

  <div class="footer">
    <div class="plan">Plan: <b>${planName}</b></div>
    <div class="dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
  </div>
</div>
</body>
</html>`;

    browser = await puppeteer.launch({
      executablePath: '/usr/bin/chromium-browser',
      args: ['--no-sandbox','--disable-setuid-sandbox','--disable-gpu','--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 480, height: 280, deviceScaleFactor: scale });
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const screenshot = Buffer.from(await page.screenshot({ type: format, omitBackground: false }));
    await browser.close();
    browser = null;

    res.set({
      'Content-Type': `image/${format}`,
      'Cache-Control': 'private, max-age=300',
      'Content-Disposition': `inline; filename="mediqzy-card-${memberId}.${format}"`,
    });
    return res.send(screenshot);

  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    console.error('Card image generation error:', err);
    return res.status(500).json({ success: false, message: 'Failed to generate card image', error: err.message });
  }
});

export default router;
