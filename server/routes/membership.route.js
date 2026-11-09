import express from 'express';
import { body, param } from 'express-validator';
import { Op } from 'sequelize';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { MembershipPlan, UserPlan } from '../models/postgres/membershipPlan.model.postgres.js';
import pool from '../db/pgPool.js';
import { Coupon, CouponUsage } from '../models/index.js';
import paymentService from '../services/payment.service.js';
import whatsappProductionService from '../services/whatsapp-production.service.js';
import purchaseNotification from '../services/purchase-notification.service.js';
import { publicPlanCatalogue } from '../utils/plan-catalogue.js';

const router = express.Router();

const COUPON_SCOPES = {
  COINS_PURCHASE: 'COINS_PURCHASE',
  HEALTH_CHECKUP: 'HEALTH_CHECKUP',
  PHARMACY_PURCHASE: 'PHARMACY_PURCHASE',
  CONSULTATION: 'CONSULTATION',
  GYM_MEMBERSHIP: 'GYM_MEMBERSHIP',
  MEMBERSHIP: 'MEMBERSHIP'
};

const parseAssignedUserIds = (coupon) => {
  const ids = coupon?.metadata?.assignedUserIds;
  if (!ids) return [];

  if (Array.isArray(ids)) {
    return ids
      .map((id) => parseInt(id, 10))
      .filter((id) => Number.isInteger(id) && id > 0);
  }

  if (typeof ids === 'string') {
    return ids
      .split(',')
      .map((id) => parseInt(id.trim(), 10))
      .filter((id) => Number.isInteger(id) && id > 0);
  }

  return [];
};

const isCouponEligibleForUser = (coupon, userId) => {
  const assignedUserIds = parseAssignedUserIds(coupon);
  if (!assignedUserIds.length) return true;
  return assignedUserIds.includes(parseInt(userId, 10));
};

const parseCouponScopes = (coupon) => {
  const rawScopes = coupon?.metadata?.scopes;
  if (!rawScopes) return [COUPON_SCOPES.COINS_PURCHASE];

  const scopes = Array.isArray(rawScopes)
    ? rawScopes
    : String(rawScopes)
        .split(',')
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean);

  const allowed = new Set(Object.values(COUPON_SCOPES));
  const normalized = scopes.filter((scope) => allowed.has(scope));
  return normalized.length ? normalized : [COUPON_SCOPES.COINS_PURCHASE];
};

const isCouponEligibleForScope = (coupon, scope) => parseCouponScopes(coupon).includes(scope);

const isFreeMembershipCoupon = (coupon) => coupon?.metadata?.grantType === 'FREE_MEMBERSHIP';

const getFreeMembershipMonths = (coupon) => {
  const months = Number(coupon?.metadata?.freeMonths ?? coupon?.value ?? 0);
  return Number.isFinite(months) && months > 0 ? Math.floor(months) : 0;
};

const validateCouponEligibility = async ({ coupon, userId }) => {
  if (!isCouponEligibleForUser(coupon, userId)) {
    throw new Error('This coupon is not assigned to your account');
  }

  if (coupon.usageCount >= coupon.maxUsage) {
    throw new Error('Coupon usage limit exceeded');
  }

  const userUsage = await CouponUsage.count({
    where: { couponId: coupon.id, userId }
  });

  if (userUsage >= coupon.maxUsagePerUser) {
    throw new Error('You have already used this coupon the maximum number of times');
  }
};

const findActiveCoupon = async (code) => {
  const coupon = await Coupon.findOne({
    where: {
      code: String(code).trim().toUpperCase(),
      isActive: true,
      validFrom: { [Op.lte]: new Date() },
      validUntil: { [Op.gte]: new Date() }
    }
  });

  if (!coupon) {
    throw new Error('Invalid or expired coupon code');
  }

  return coupon;
};

const validateFreeMembershipCoupon = async ({ code, userId, planId, scope = COUPON_SCOPES.MEMBERSHIP }) => {
  const coupon = await findActiveCoupon(code);
  const selectedScope = String(scope || COUPON_SCOPES.MEMBERSHIP).toUpperCase();

  if (!isFreeMembershipCoupon(coupon)) {
    throw new Error('This coupon is not a free membership coupon');
  }

  if (!isCouponEligibleForScope(coupon, selectedScope)) {
    throw new Error(`This coupon is not valid for ${selectedScope}`);
  }

  await validateCouponEligibility({ coupon, userId });

  const freeMonths = getFreeMembershipMonths(coupon);
  if (!freeMonths) {
    throw new Error('Invalid free membership duration on coupon');
  }

  const boundPlanId = coupon.metadata?.planId ? parseInt(coupon.metadata.planId, 10) : null;
  const requestedPlanId = planId ? parseInt(planId, 10) : null;

  if (boundPlanId && requestedPlanId && boundPlanId !== requestedPlanId) {
    throw new Error('This coupon is not valid for the selected plan');
  }

  return {
    coupon,
    freeMonths,
    boundPlanId,
    scope: selectedScope
  };
};

const validateCouponForOrder = async ({ code, userId, scope, amount }) => {
  if (!code) return null;

  const coupon = await findActiveCoupon(code);

  if (isFreeMembershipCoupon(coupon)) {
    throw new Error('Use the free membership coupon redemption flow for this code');
  }

  if (!isCouponEligibleForUser(coupon, userId)) {
    throw new Error('This coupon is not assigned to your account');
  }

  if (!isCouponEligibleForScope(coupon, scope)) {
    throw new Error(`This coupon is not valid for ${scope}`);
  }

  await validateCouponEligibility({ coupon, userId });

  if (coupon.type !== 'PERCENTAGE') {
    throw new Error('This coupon type is not supported for membership payments');
  }

  const minPurchase = Number(coupon.minPurchase || 0);
  if (amount < minPurchase) {
    throw new Error(`Minimum order of ₹${minPurchase} required for this coupon`);
  }

  const discount = Math.max(0, (Number(amount) * Number(coupon.value || 0)) / 100);

  return {
    coupon,
    discount,
    scope
  };
};

// ── Build appliedLimits from a plan's coverageDetails ─────────────────────────
function buildAppliedLimits(plan) {
  const coverage = plan.metadata?.coverageDetails || {};
  return {
    benefitLimits: {
      pharmacyLimitINR: coverage.pharmacy?.limitINR ?? 0,
      homeCareLimitINR: coverage.homeCare?.limitINR ?? 0,
      ambulanceLimitINR: coverage.ambulance?.limitINR ?? 0,
    },
    teleConsultLimits: {
      allSpecialties: coverage.onlineConsult?.limit ?? 0,
    },
    healthCheckPackage: coverage.healthCheck?.package ?? null,
    priceINR: Number(plan.discountedPrice != null && plan.discountedPrice !== '0.00' && plan.discountedPrice !== 0 ? plan.discountedPrice : plan.price) || 0,
    // The itemised picture. The three INR fields above were all this exposed,
    // and they are 0 on most plans, so Benefits & Plans had nothing to render
    // and showed dashes for Total Coverage and Utilized. coverageDetails
    // actually carries discounts, insurance sums, a health-check count and the
    // teleconsult unit — none of which reached the client.
    coverage: summariseCoverage(coverage),
  };
}

/**
 * Normalise a plan's coverageDetails into something a client can render.
 *
 * Returns itemised benefits plus a total. `totalCoverageINR` sums the monetary
 * limits only — a discount percentage and a visit count are real benefits but
 * are not rupees and must not be added into a money total. A plan whose limits
 * are all zero reports 0, not null: "no monetary cover" is an answer, a dash
 * is not.
 */
function summariseCoverage(coverage = {}) {
  const num = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };
  const MONETARY = ['pharmacy', 'homeCare', 'ambulance', 'dental', 'labTests', 'optical', 'physiotherapy'];

  const benefits = [];
  for (const key of MONETARY) {
    const item = coverage[key];
    if (!item || typeof item !== 'object') continue;
    benefits.push({
      key,
      limitINR: num(item.limitINR),
      discountPct: item.discountPct === undefined ? null : num(item.discountPct),
    });
  }

  const insurance = coverage.insurance && typeof coverage.insurance === 'object'
    ? {
      lifeINR: num(coverage.insurance.life),
      healthINR: num(coverage.insurance.health),
      accidentINR: num(coverage.insurance.accident),
    }
    : null;

  const insuranceTotal = insurance ? insurance.lifeINR + insurance.healthINR + insurance.accidentINR : 0;

  return {
    totalCoverageINR: benefits.reduce((sum, b) => sum + b.limitINR, 0) + insuranceTotal,
    benefits,
    insurance,
    healthCheck: coverage.healthCheck
      ? { count: num(coverage.healthCheck.count), package: coverage.healthCheck.package ?? null }
      : null,
    teleconsult: coverage.onlineConsult
      ? { limit: num(coverage.onlineConsult.limit), unit: coverage.onlineConsult.unit ?? null }
      : null,
  };
}

/**
 * What the member has actually consumed, so the client can show "Utilized" as
 * a number rather than a dash. Monetary spend is reported as 0 rather than
 * guessed: no claims pipeline feeds it yet. Teleconsults are counted because
 * they genuinely are tracked (usage.teleConsult).
 */
function summariseUtilisation(appliedLimits = {}, usage = {}) {
  const teleconsultsUsed = Object.values(usage?.teleConsult || {})
    .reduce((sum, value) => sum + (Number(value) || 0), 0);
  const teleconsultLimit = Number(appliedLimits?.teleConsultLimits?.allSpecialties) || 0;
  return {
    utilisedINR: 0,
    utilisedKnown: false,
    teleconsultsUsed,
    teleconsultsRemaining: Math.max(0, teleconsultLimit - teleconsultsUsed),
  };
}

// -------- Super Admin / Team Endpoints (Master Plans) --------
router.post('/admin/plans', authUser, requireRole(['admin', 'team']), [
  body('name').notEmpty(),
  body('durationDays').optional().isInt({ min:1 }),
  body('priceINR').optional().isFloat({ min:0 }),
  body('isMaster').optional().isBoolean()
], async (req,res) => {
  try {
    // Mark as master plan if created by super admin
    const planData = {
      ...req.body,
      isMaster: req.body.isMaster !== undefined ? req.body.isMaster : true,
      organizationId: null, // Master plans have no organization
      organizationType: null,
      customizedBy: null
    };
    
    const plan = await MembershipPlan.create(planData);
    res.status(201).json({ 
      plan,
      message: planData.isMaster ? 'Master plan created successfully' : 'Plan created successfully'
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message:'Failed to create plan', error: e.message });
  }
});

router.get('/admin/plans', authUser, requireRole(['admin', 'team']), async (req,res) => {
  try {
    const { masterOnly, includeCustomized } = req.query;
    
    let whereClause = {};
    
    if (masterOnly === 'true') {
      whereClause.isMaster = true;
    } else if (includeCustomized === 'false') {
      whereClause.isMaster = true;
    }
    
    const plans = await MembershipPlan.findAll({ 
      where: whereClause,
      order:[['isMaster', 'DESC'], ['sortOrder', 'ASC'], ['createdAt','DESC']] 
    });
    
    const masterPlans = plans.filter(p => p.isMaster);
    const customizedPlans = plans.filter(p => !p.isMaster);
    
    res.json({ 
      plans,
      masterPlans,
      customizedPlans,
      stats: {
        total: plans.length,
        masterCount: masterPlans.length,
        customizedCount: customizedPlans.length
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message:'Failed to fetch plans', error: e.message });
  }
});

router.put('/admin/plans/:id', authUser, requireRole(['admin', 'team']), [ param('id').isInt() ], async (req,res) => {
  try {
    const plan = await MembershipPlan.findByPk(req.params.id);
    if(!plan) return res.status(404).json({ message:'Plan not found' });
    await plan.update(req.body);
    res.json({ plan });
  } catch(e){
    res.status(500).json({ message:'Failed to update', error:e.message });
  }
});

router.delete('/admin/plans/:id', authUser, requireRole(['admin', 'team']), [ param('id').isInt() ], async (req,res) => {
  try {
    const plan = await MembershipPlan.findByPk(req.params.id);
    if(!plan) return res.status(404).json({ message:'Plan not found' });
    await plan.destroy();
    res.json({ success:true });
  } catch(e){
    res.status(500).json({ message:'Failed to delete', error:e.message });
  }
});

// -------- User Endpoints --------
router.get('/plans', async (req,res) => {
  try {
    const { type } = req.query;
    const where = { isActive: true, planType: 'primary' };
    if (type) where.type = type;
    const plans = await MembershipPlan.findAll({
      where,
      order:[['tier','ASC'],['price','ASC']]
    });
    // Customer-facing list: drop working fixtures ("Basic Test Plan") and
    // collapse the duplicate ₹0 tiers the app was showing side by side. Nothing
    // is deactivated, so existing subscriptions and direct lookups are
    // unaffected; `?includeAll=true` returns the unfiltered list.
    res.json({ plans: req.query.includeAll === 'true' ? plans : publicPlanCatalogue(plans) });
  } catch(e) {
    console.error(e);
    res.status(500).json({ message:'Failed to get plans', error:e.message });
  }
});

// A user's individual plan (UserPlan/MembershipPlan, above) is tracked
// entirely separately from any corporate benefit they're entitled to via
// user_associations - linking an employee to their corporate never updates
// this table. Load the corporate link additively so a real paid individual
// plan is never overridden/hidden, but the User portal can still show "also
// covered by <company>'s corporate plan" and unlock AHC/corporate-wellness
// visibility, instead of corporate employees looking permanently
// "Individual Plan only" regardless of their actual corporate benefits.
async function loadActiveCorporateLink(userId) {
  try {
    const { rows } = await pool.query(
      `SELECT c.id AS "corporateId", c."companyName", c."packageType", ua.status
         FROM user_associations ua
         JOIN corporates c ON c.id = ua."entityId"
        WHERE ua."userId" = $1 AND ua."entityType" = 'corporate' AND ua.role = 'employee' AND ua.status = 'active'
        LIMIT 1`,
      [userId]
    );
    return rows[0] || null;
  } catch (e) {
    console.error('[membership] loadActiveCorporateLink error:', e.message);
    return null;
  }
}

router.get('/my/current', authUser, async (req,res) => {
  try {
    const userPlan = await UserPlan.findOne({
      where:{ userId:req.user.id, status:'active' },
      include: [{ model: MembershipPlan, as: 'plan' }],
      order:[['createdAt','DESC']]
    });
    const corporate = await loadActiveCorporateLink(req.user.id);

    if (!userPlan) {
      // Same keys as the has-a-plan response. A member without a plan is a
      // normal state, and the client should render "no cover" from real zeros
      // rather than crash on an undefined it never expected.
      return res.json({
        userPlan: null,
        plan: null,
        coverage: summariseCoverage({}),
        utilisation: summariseUtilisation({}, {}),
        corporate,
      });
    }

    const planObj = userPlan.toJSON();
    const associatedPlan = userPlan.plan || userPlan.MembershipPlan;
    // A subscription rarely snapshots appliedLimits into its own metadata, so
    // this almost always derives them from the plan itself.
    const appliedLimits = planObj.metadata?.appliedLimits
      || (associatedPlan ? buildAppliedLimits(associatedPlan) : {});
    const usage = planObj.metadata?.usage || {};
    res.json({
      userPlan: {
        ...planObj,
        appliedLimits,
        usage,
      },
      plan: associatedPlan,
      // Flat, render-ready figures for Benefits & Plans, which showed "—" for
      // Total Coverage and Utilized because only three always-zero INR fields
      // were ever exposed.
      coverage: appliedLimits.coverage || null,
      utilisation: summariseUtilisation(appliedLimits, usage),
      corporate
    });
  } catch(e) {
    console.error(e);
    res.status(500).json({ message:'Failed to get current plan', error:e.message });
  }
});

router.post('/subscribe/:planId', authUser, [ param('planId').isInt() ], async (req,res) => {
  try {
    const plan = await MembershipPlan.findByPk(req.params.planId);
    if(!plan || !plan.isActive) return res.status(404).json({ message:'Plan not available' });

    const planType = plan.planType || 'primary';
    const planPrice = parseFloat(plan.discountedPrice || plan.price || 0);

    // Paid plans require a Razorpay payment ID — prevent free activation of paid plans.
    // W-PLAN-3: keep the API detail in the server log, not in the patient's face.
    if (planPrice > 0 && !req.body.razorpay_payment_id) {
      console.warn(`[membership] subscribe blocked for user ${req.user?.id}: plan ${plan.id} costs ${planPrice} but no razorpay_payment_id was supplied (client must complete payment, then enroll with the verified paymentId)`);
      return res.status(400).json({
        success: false,
        message: 'Please complete payment to activate this plan.',
        code: 'PAYMENT_REQUIRED',
        action: 'Complete the payment for this plan to activate it'
      });
    }
    
    // For primary plans, prevent multiple active subscriptions
    if (planType === 'primary') {
      const alreadyActive = await UserPlan.findOne({ 
        where: { userId: req.user.id, status: 'active' },
        include: [{ model: MembershipPlan, as: 'plan', where: { planType: 'primary' }, required: true }]
      });
      if (alreadyActive) {
        return res.status(400).json({
          success: false,
          message: 'You already have an active plan. Switch or upgrade it from Manage Plan.',
          code: 'PRIMARY_PLAN_ALREADY_ACTIVE',
          action: 'Upgrade or change your existing plan instead of subscribing again'
        });
      }
    }
    
    // For addon plans, check if user already has this specific addon
    if (planType === 'addon') {
      const alreadyHasAddon = await UserPlan.findOne({ 
        where: { userId: req.user.id, membershipPlanId: plan.id, status: 'active' } 
      });
      if (alreadyHasAddon) {
        return res.status(400).json({ message: 'You already have this addon plan active' });
      }
    }

    const startDate = new Date();
    // durationMonths is in months, convert to days (approx 30 days per month)
    const durationDays = (plan.durationMonths || 1) * 30;
    const endDate = new Date(startDate.getTime() + durationDays*24*60*60*1000);

    const userPlan = await UserPlan.create({
      userId: req.user.id,
      membershipPlanId: plan.id,
      startDate: startDate.toISOString().slice(0,10),
      endDate: endDate.toISOString().slice(0,10),
      paidAmount: Number(plan.discountedPrice != null && plan.discountedPrice !== '0.00' && plan.discountedPrice !== 0 ? plan.discountedPrice : plan.price) || 0,
      metadata: {
        planName: plan.name,
        planType: planType,
        tier: plan.tier,
        features: plan.features,
        benefits: plan.benefits,
        limitations: plan.limitations,
        appliedLimits: buildAppliedLimits(plan),
        usage: { benefitINR: { pharmacyINR: 0, homeCareINR: 0, ambulanceINR: 0 }, teleConsult: {} }
      }
    });

    // Send WhatsApp plan activation confirmation
    try {
      const phone = req.user.phoneNumber || req.user.phone;
      if (phone) {
        let formattedPhone = String(phone).replace(/[^0-9+]/g, '');
        if (!formattedPhone.startsWith('+')) formattedPhone = '+91' + formattedPhone;
        whatsappProductionService.sendMembershipPlanActivated({
          to: formattedPhone,
          name: req.user.firstName || 'Member',
          planName: plan.name,
          startDate: userPlan.startDate,
          endDate: userPlan.endDate
        }).catch(e => console.error('WA plan activation notification failed:', e.message));
      }
    } catch (waErr) {
      console.error('WA plan activation notification error:', waErr.message);
    }

    res.status(201).json({ userPlan });
  } catch(e){
    console.error(e);
    res.status(500).json({ message:'Subscription failed', error:e.message });
  }
});

// -------- FREE MEMBERSHIP COUPON --------
router.post('/validate-free-coupon', authUser, async (req, res) => {
  try {
    const { couponCode, planId, scope = COUPON_SCOPES.MEMBERSHIP } = req.body;

    if (!couponCode) {
      return res.status(400).json({ message: 'Coupon code is required' });
    }

    const validation = await validateFreeMembershipCoupon({
      code: couponCode,
      userId: req.user.id,
      planId,
      scope
    });

    return res.json({
      success: true,
      message: 'Coupon is valid for free membership',
      coupon: {
        code: validation.coupon.code,
        freeMonths: validation.freeMonths,
        boundPlanId: validation.boundPlanId,
        scope: validation.scope
      }
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

router.post('/redeem-free-coupon', authUser, async (req, res) => {
  try {
    const { couponCode, planId, scope = COUPON_SCOPES.MEMBERSHIP } = req.body;

    if (!couponCode || !planId) {
      return res.status(400).json({ message: 'Coupon code and plan ID are required' });
    }

    const validation = await validateFreeMembershipCoupon({
      code: couponCode,
      userId: req.user.id,
      planId,
      scope
    });

    const plan = await MembershipPlan.findByPk(planId);
    if (!plan || !plan.isActive) {
      return res.status(404).json({ message: 'Plan not available' });
    }

    if (validation.boundPlanId && validation.boundPlanId !== plan.id) {
      return res.status(400).json({ message: 'This coupon is not valid for the selected plan' });
    }

    const planType = plan.planType || 'primary';
    if (planType === 'primary') {
      const alreadyActive = await UserPlan.findOne({
        where: { userId: req.user.id, status: 'active' },
        include: [{ model: MembershipPlan, as: 'plan', where: { planType: 'primary' }, required: true }]
      });
      if (alreadyActive) {
        return res.status(400).json({
          success: false,
          message: 'You already have an active plan. Switch or upgrade it from Manage Plan.',
          code: 'PRIMARY_PLAN_ALREADY_ACTIVE',
          action: 'Upgrade or change your existing plan instead of subscribing again'
        });
      }
    } else {
      const alreadyHasAddon = await UserPlan.findOne({
        where: { userId: req.user.id, membershipPlanId: plan.id, status: 'active' }
      });
      if (alreadyHasAddon) {
        return res.status(400).json({ message: 'You already have this addon plan active' });
      }
    }

    const startDate = new Date();
    const durationDays = validation.freeMonths * 30;
    const endDate = new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000);
    const planPrice = parseFloat(plan.discountedPrice || plan.price || 0);

    const userPlan = await UserPlan.create({
      userId: req.user.id,
      membershipPlanId: plan.id,
      startDate: startDate.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
      paidAmount: 0,
      paymentId: `FREE_MEMBERSHIP_${Date.now()}`,
      paymentMethod: 'free_membership_coupon',
      metadata: {
        planName: plan.name,
        planType,
        tier: plan.tier,
        features: plan.features,
        benefits: plan.benefits,
        limitations: plan.limitations,
        appliedLimits: buildAppliedLimits(plan),
        couponCode: validation.coupon.code,
        freeMonths: validation.freeMonths,
        grantType: 'FREE_MEMBERSHIP',
        originalPrice: planPrice,
        usage: { benefitINR: { pharmacyINR: 0, homeCareINR: 0, ambulanceINR: 0 }, teleConsult: {} }
      }
    });

    await CouponUsage.create({
      couponId: validation.coupon.id,
      couponCode: validation.coupon.code,
      userId: req.user.id,
      hcPurchased: 0,
      hcBonus: 0,
      discountAmount: planPrice,
      amountPaid: 0,
      paymentId: userPlan.paymentId
    });

    await validation.coupon.update({
      usageCount: Number(validation.coupon.usageCount || 0) + 1
    });

    try {
      const phone = req.user.phoneNumber || req.user.phone;
      if (phone) {
        let formattedPhone = String(phone).replace(/[^0-9+]/g, '');
        if (!formattedPhone.startsWith('+')) formattedPhone = '+91' + formattedPhone;
        whatsappProductionService.sendMembershipPlanActivated({
          to: formattedPhone,
          name: req.user.firstName || 'Member',
          planName: plan.name,
          startDate: userPlan.startDate,
          endDate: userPlan.endDate
        }).catch((e) => console.error('WA plan activation notification failed:', e.message));
      }
    } catch (waErr) {
      console.error('WA plan activation notification error:', waErr.message);
    }

    return res.status(201).json({
      success: true,
      message: `${validation.freeMonths}-month free membership activated`,
      userPlan,
      coupon: {
        code: validation.coupon.code,
        freeMonths: validation.freeMonths
      }
    });
  } catch (error) {
    console.error('Redeem free membership coupon error:', error);
    return res.status(400).json({ message: error.message || 'Failed to redeem membership coupon' });
  }
});

// -------- PLAN PAYMENT ORDER --------
// Create a Razorpay order for a plan upgrade (called before the actual upgrade)
router.post('/payment-order', authUser, [
  body('amount').isFloat({ min: 0.5 }),
  body('planId').isInt(),
  body('planName').notEmpty()
], async (req, res) => {
  try {
    const { amount, planId, planName, couponCode, scope = COUPON_SCOPES.GYM_MEMBERSHIP } = req.body;
    const numericAmount = Number(amount || 0);
    const selectedScope = String(scope || COUPON_SCOPES.GYM_MEMBERSHIP).toUpperCase();

    let couponValidation = null;
    if (couponCode) {
      try {
        const freeValidation = await validateFreeMembershipCoupon({
          code: couponCode,
          userId: req.user.id,
          planId,
          scope: selectedScope
        });

        return res.json({
          success: true,
          order: null,
          requiresRedeem: true,
          redeemEndpoint: '/api/membership/redeem-free-coupon',
          pricing: {
            amount: numericAmount,
            discount: numericAmount,
            finalAmount: 0,
            couponCode: freeValidation.coupon.code,
            freeMonths: freeValidation.freeMonths,
            scope: selectedScope
          }
        });
      } catch (freeCouponError) {
        couponValidation = await validateCouponForOrder({
          code: couponCode,
          userId: req.user.id,
          scope: selectedScope,
          amount: numericAmount
        });
      }
    }

    const discount = couponValidation ? Number(couponValidation.discount || 0) : 0;
    const finalAmount = Math.max(0, numericAmount - discount);

    const receipt = `plan${planId}_u${req.user.id}_${Date.now()}`.slice(0, 40);
    const orderResult = await paymentService.createOrder({
      amount: finalAmount,
      currency: 'INR',
      receipt,
      notes: {
        planId: String(planId),
        userId: String(req.user.id),
        planName,
        scope: selectedScope,
        ...(couponValidation ? { couponCode: couponValidation.coupon.code } : {})
      }
    });
    if (!orderResult.success) {
      return res.status(500).json({ message: 'Failed to create payment order', error: orderResult.error });
    }
    const gatewayConfig = paymentService.getGatewayConfig();
    res.json({
      success: true,
      order: {
        ...orderResult.order,
        amountINR: Math.round(orderResult.order.amount / 100 * 100) / 100,
        amountInPaise: orderResult.order.amount
      },
      gatewayConfig,
      transaction: { description: `Upgrade to ${planName}` },
      pricing: {
        amount: numericAmount,
        discount,
        finalAmount,
        couponCode: couponValidation?.coupon?.code || null,
        scope: selectedScope
      }
    });
  } catch (e) {
    console.error('Payment order error:', e);
    if (e.message && (
      e.message.includes('coupon') ||
      e.message.includes('Coupon') ||
      e.message.includes('Minimum order')
    )) {
      return res.status(400).json({ message: e.message });
    }
    res.status(500).json({ message: 'Payment order creation failed', error: e.message });
  }
});

// -------- PLAN UPGRADE --------
// Upgrade from current plan to a higher tier plan (prorated)
router.post('/upgrade/:newPlanId', authUser, [ param('newPlanId').isInt() ], async (req, res) => {
  try {
    const newPlanId = parseInt(req.params.newPlanId);
    
    // Find current active primary plan
    const currentUserPlan = await UserPlan.findOne({ 
      where: { userId: req.user.id, status: 'active' },
      include: [{ model: MembershipPlan, as: 'plan' }]
    });
    
    if (!currentUserPlan) {
      return res.status(400).json({ message: 'No active plan to upgrade from. Please subscribe first.' });
    }
    
    const currentPlan = currentUserPlan.plan;
    if (!currentPlan) {
      return res.status(400).json({ message: 'Current plan details not found' });
    }
    
    // Only allow upgrading primary plans
    if (currentPlan.planType === 'addon') {
      return res.status(400).json({ message: 'Cannot upgrade addon plans. Please subscribe to a new addon instead.' });
    }
    
    // Get new plan
    const newPlan = await MembershipPlan.findByPk(newPlanId);
    if (!newPlan || !newPlan.isActive) {
      return res.status(404).json({ message: 'Target plan not available' });
    }
    
    // New plan must also be a primary plan
    if (newPlan.planType === 'addon') {
      return res.status(400).json({ message: 'Cannot upgrade to an addon plan. Use subscribe endpoint for addons.' });
    }
    
    // Check tier - must be upgrading to higher or equal tier
    const currentTier = currentPlan.tier || 1;
    const newTier = newPlan.tier || 1;
    
    if (newTier < currentTier) {
      return res.status(400).json({ 
        message: 'Cannot downgrade to a lower tier plan. Contact support for downgrades.',
        currentTier,
        newTier
      });
    }
    
    if (newPlanId === currentUserPlan.membershipPlanId) {
      return res.status(400).json({ message: 'You are already on this plan' });
    }
    
    // Calculate prorated refund for remaining days
    const today = new Date();
    const endDate = new Date(currentUserPlan.endDate);
    const startDate = new Date(currentUserPlan.startDate);
    
    const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    const remainingDays = Math.max(0, Math.ceil((endDate - today) / (1000 * 60 * 60 * 24)));
    
    const paidAmount = parseFloat(currentUserPlan.paidAmount || 0);
    const dailyRate = totalDays > 0 ? paidAmount / totalDays : 0;
    const proratedRefund = Math.round(dailyRate * remainingDays * 100) / 100;
    
    // Calculate new plan price
    const newPlanPrice = parseFloat(newPlan.discountedPrice || newPlan.price || 0);
    const baseAmountDue = Math.max(0, newPlanPrice - proratedRefund);

    const { couponCode, scope = COUPON_SCOPES.GYM_MEMBERSHIP } = req.body;
    const selectedScope = String(scope || COUPON_SCOPES.GYM_MEMBERSHIP).toUpperCase();

    let couponValidation = null;
    let couponDiscount = 0;
    if (couponCode && baseAmountDue > 0) {
      couponValidation = await validateCouponForOrder({
        code: couponCode,
        userId: req.user.id,
        scope: selectedScope,
        amount: baseAmountDue
      });
      couponDiscount = Math.min(baseAmountDue, Number(couponValidation.discount || 0));
    }

    const amountDue = Math.max(0, baseAmountDue - couponDiscount);

    // Verify payment when amount is due
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
    if (amountDue > 0) {
      if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
        return res.status(400).json({
          requiresPayment: true,
          amountDue,
          message: 'Payment verification data required for this upgrade'
        });
      }
      const isValid = paymentService.verifyPaymentSignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature });
      if (!isValid) {
        return res.status(400).json({ message: 'Payment verification failed. Please retry.' });
      }
    }

    // Cancel current plan
    await currentUserPlan.update({ 
      status: 'upgraded',
      metadata: {
        ...currentUserPlan.metadata,
        upgradedTo: newPlanId,
        upgradedAt: new Date().toISOString(),
        proratedRefund
      }
    });
    
    // Create new plan subscription
    const newStartDate = new Date();
    const newDurationDays = (newPlan.durationMonths || 1) * 30;
    const newEndDate = new Date(newStartDate.getTime() + newDurationDays * 24 * 60 * 60 * 1000);
    
    const newUserPlan = await UserPlan.create({
      userId: req.user.id,
      membershipPlanId: newPlan.id,
      startDate: newStartDate.toISOString().slice(0, 10),
      endDate: newEndDate.toISOString().slice(0, 10),
      paidAmount: amountDue,
      paymentId: razorpay_payment_id || null,
      paymentMethod: razorpay_payment_id ? 'razorpay' : null,
      metadata: {
        planName: newPlan.name,
        planType: newPlan.planType || 'primary',
        tier: newPlan.tier,
        features: newPlan.features,
        benefits: newPlan.benefits,
        limitations: newPlan.limitations,
        upgradedFrom: currentUserPlan.membershipPlanId,
        previousPlanName: currentPlan.name,
        proratedRefund,
        originalPrice: newPlanPrice,
        couponCode: couponValidation?.coupon?.code || null,
        couponDiscount,
        appliedLimits: buildAppliedLimits(newPlan),
        usage: { benefitINR: { pharmacyINR: 0, homeCareINR: 0, ambulanceINR: 0 }, teleConsult: {} }
      }
    });

    if (couponValidation?.coupon) {
      await CouponUsage.create({
        couponId: couponValidation.coupon.id,
        couponCode: couponValidation.coupon.code,
        userId: req.user.id,
        hcPurchased: 0,
        hcBonus: 0,
        discountAmount: couponDiscount,
        amountPaid: amountDue,
        paymentId: razorpay_payment_id || `GYM_MEMBERSHIP_${Date.now()}`
      });

      await couponValidation.coupon.update({
        usageCount: Number(couponValidation.coupon.usageCount || 0) + 1
      });
    }

    // Send WhatsApp plan activation confirmation on upgrade
    try {
      const phone = req.user.phoneNumber || req.user.phone;
      if (phone) {
        let formattedPhone = String(phone).replace(/[^0-9+]/g, '');
        if (!formattedPhone.startsWith('+')) formattedPhone = '+91' + formattedPhone;
        whatsappProductionService.sendMembershipPlanActivated({
          to: formattedPhone,
          name: req.user.firstName || 'Member',
          planName: newPlan.name,
          startDate: newUserPlan.startDate,
          endDate: newUserPlan.endDate
        }).catch(e => console.error('WA upgrade activation notification failed:', e.message));
      }
    } catch (waErr) {
      console.error('WA upgrade activation notification error:', waErr.message);
    }

    // Fire-and-forget: customer confirmation email + invoice, and internal team alert.
    purchaseNotification.notifyMembershipPurchase({
      user: req.user,
      plan: newPlan,
      payment: { paymentId: razorpay_payment_id, method: razorpay_payment_id ? 'razorpay' : 'corporate' },
      previousPlanName: currentPlan.name,
      amountDue,
    }).catch(notifyErr => console.error('Membership purchase notification dispatch failed:', notifyErr.message));

    res.json({
      success: true,
      message: 'Plan upgraded successfully',
      previousPlan: {
        id: currentPlan.id,
        name: currentPlan.name,
        tier: currentTier,
        proratedRefund
      },
      newPlan: {
        id: newPlan.id,
        name: newPlan.name,
        tier: newTier,
        originalPrice: newPlanPrice,
        amountDue,
        couponDiscount,
        couponCode: couponValidation?.coupon?.code || null
      },
      userPlan: newUserPlan
    });
    
  } catch (e) {
    console.error('Upgrade error:', e);
    res.status(500).json({ message: 'Plan upgrade failed', error: e.message });
  }
});

// -------- GET UPGRADE OPTIONS --------
// Get available plans user can upgrade to
router.get('/upgrade-options', authUser, async (req, res) => {
  try {
    // Get current active primary plan
    const currentUserPlan = await UserPlan.findOne({ 
      where: { userId: req.user.id, status: 'active' },
      include: [{ model: MembershipPlan, as: 'plan' }]
    });
    
    if (!currentUserPlan || !currentUserPlan.plan) {
      return res.json({ 
        hasActivePlan: false,
        currentPlan: null,
        upgradeOptions: [],
        message: 'No active plan. Subscribe to a plan first.'
      });
    }
    
    const currentPlan = currentUserPlan.plan;
    const currentTier = currentPlan.tier || 1;
    
    // Find all primary plans of the same type with a higher tier
    const upgradeWhere = {
      isActive: true,
      [Op.or]: [{ planType: 'primary' }, { planType: null }],
      id: { [Op.ne]: currentPlan.id }
    };
    if (currentPlan.type) upgradeWhere.type = currentPlan.type;
    const upgradeOptions = await MembershipPlan.findAll({
      where: upgradeWhere,
      order: [['tier', 'ASC'], ['price', 'ASC']]
    });
    
    // Filter to only higher or equal tiers and calculate prorated pricing
    const today = new Date();
    const endDate = new Date(currentUserPlan.endDate);
    const startDate = new Date(currentUserPlan.startDate);
    
    const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    const remainingDays = Math.max(0, Math.ceil((endDate - today) / (1000 * 60 * 60 * 24)));
    
    const paidAmount = parseFloat(currentUserPlan.paidAmount || 0);
    const dailyRate = totalDays > 0 ? paidAmount / totalDays : 0;
    const proratedRefund = Math.round(dailyRate * remainingDays * 100) / 100;
    
    const optionsWithPricing = upgradeOptions
      .filter(p => (p.tier || 1) > currentTier)
      .map(plan => {
        const planPrice = parseFloat(plan.discountedPrice || plan.price || 0);
        const amountDue = Math.max(0, planPrice - proratedRefund);
        const isUpgrade = (plan.tier || 1) > currentTier;
        
        return {
          id: plan.id,
          name: plan.name,
          description: plan.description,
          tier: plan.tier || 1,
          tierName: plan.tierName || (['Basic', 'Silver', 'Silver Plus', 'Silver Elite', 'Gold', 'Platinum', 'Diamond'][plan.tier] || `Tier ${plan.tier}`),
          originalPrice: planPrice,
          proratedRefund,
          amountDue,
          isUpgrade,
          features: plan.features,
          benefits: plan.benefits,
          durationMonths: plan.durationMonths,
          metadata: plan.metadata || {}
        };
      });
    
    res.json({
      hasActivePlan: true,
      currentPlan: {
        id: currentPlan.id,
        name: currentPlan.name,
        tier: currentTier,
        tierName: currentPlan.tierName,
        endDate: currentUserPlan.endDate,
        remainingDays,
        proratedRefund
      },
      upgradeOptions: optionsWithPricing
    });
    
  } catch (e) {
    console.error('Get upgrade options error:', e);
    res.status(500).json({ message: 'Failed to get upgrade options', error: e.message });
  }
});

// -------- GET ADDON PLANS --------
// Get available addon plans
router.get('/addons', authUser, async (req, res) => {
  try {
    const addons = await MembershipPlan.findAll({
      where: {
        isActive: true,
        planType: 'addon'
      },
      order: [['sortOrder', 'ASC'], ['price', 'ASC']]
    });
    
    // Get user's active addons
    const userAddons = await UserPlan.findAll({
      where: { userId: req.user.id, status: 'active' },
      include: [{ model: MembershipPlan, as: 'plan', where: { planType: 'addon' } }]
    });
    
    const activeAddonIds = userAddons.map(ua => ua.membershipPlanId);
    
    const addonsWithStatus = addons.map(addon => ({
      ...addon.toJSON(),
      isSubscribed: activeAddonIds.includes(addon.id)
    }));
    
    res.json({ addons: addonsWithStatus, activeAddons: userAddons });
    
  } catch (e) {
    console.error('Get addons error:', e);
    res.status(500).json({ message: 'Failed to get addon plans', error: e.message });
  }
});

// -------- GET ALL USER PLANS (primary + addons) --------
router.get('/my/all', authUser, async (req, res) => {
  try {
    const userPlans = await UserPlan.findAll({
      where: { userId: req.user.id, status: 'active' },
      include: [{ model: MembershipPlan, as: 'plan' }],
      order: [['createdAt', 'DESC']]
    });
    
    const primaryPlan = userPlans.find(up => !up.plan?.planType || up.plan?.planType === 'primary');
    const addonPlans = userPlans.filter(up => up.plan?.planType === 'addon');
    
    res.json({
      primaryPlan: primaryPlan || null,
      addonPlans,
      totalActive: userPlans.length
    });
    
  } catch (e) {
    console.error('Get all plans error:', e);
    res.status(500).json({ message: 'Failed to get user plans', error: e.message });
  }
});

// Usage summary (remaining limits)
router.get('/my/usage', authUser, async (req,res) => {
  try {
    const active = await UserPlan.findOne({
      where: { userId: req.user.id, status: 'active' },
      include: [{ model: MembershipPlan, as: 'plan' }]
    });
    if(!active) return res.json({ active:null, remaining:null });
    const meta = active.metadata || {};
    // Prefer stored appliedLimits; fall back to deriving from the associated plan definition
    const limits = meta.appliedLimits?.benefitLimits ||
      (active.plan ? buildAppliedLimits(active.plan).benefitLimits : {});
    const usageBenefit = meta.usage?.benefitINR || {};
    const remaining = {
      pharmacyLimitINR: Math.max((limits.pharmacyLimitINR || 0) - (usageBenefit.pharmacyINR || 0), 0),
      homeCareLimitINR: Math.max((limits.homeCareLimitINR || 0) - (usageBenefit.homeCareINR || 0), 0),
      ambulanceLimitINR: Math.max((limits.ambulanceLimitINR || 0) - (usageBenefit.ambulanceINR || 0), 0),
    };
    res.json({ active, remaining });
  } catch(e) {
    console.error(e);
    res.status(500).json({ message:'Failed to get usage', error:e.message });
  }
});

// -------- Usage Increment Endpoints --------
/**
 * GET /api/membership/my/teleconsult-entitlement
 * What the member's plan covers for an online consultation, so the booking
 * screen can show "covered by your plan" instead of quoting a fee they do not
 * owe (D-23). Same source of truth the booking path charges from.
 */
router.get('/my/teleconsult-entitlement', authUser, async (req, res) => {
  try {
    const { getTeleconsultEntitlement } = await import('../services/teleconsult-entitlement.service.js');
    const entitlement = await getTeleconsultEntitlement(req.user.id, { consultationType: 'online' });
    return res.json({ success: true, ...entitlement });
  } catch (e) {
    console.error('[membership] teleconsult entitlement error:', e.message);
    return res.status(500).json({ success: false, message: 'Failed to resolve teleconsult entitlement' });
  }
});

// Increment teleconsult usage by specialty (default +1)
router.post('/usage/teleconsult', authUser, [
  body('specialty').isString().notEmpty(),
  body('count').optional().isInt({ min: 1 })
], async (req, res) => {
  const { specialty, count = 1 } = req.body;
  try {
    const active = await UserPlan.findOne({ where: { userId: req.user.id, status: 'active' } });
    if (!active) { return res.status(400).json({ message: 'No active plan' }); }

    const meta = active.metadata || {};
    const applied = meta.appliedLimits || {};
    const teleLimits = applied.teleConsultLimits || {};
    const usage = meta.usage || {};
    usage.teleConsult = usage.teleConsult || {};

    // Determine allowed for this specialty
    if (typeof teleLimits.allSpecialties === 'number') {
      // All specialties share the same pool
      const totalUsed = Object.values(usage.teleConsult).reduce((sum, v) => sum + Number(v || 0), 0);
      const allowed = Number(teleLimits.allSpecialties) - totalUsed;
      if (count > allowed) { return res.status(400).json({ message: 'Teleconsult limit exceeded' }); }
      usage.teleConsult[specialty] = Number(usage.teleConsult[specialty] || 0) + Number(count);
    } else {
      const specAllowed = Number(teleLimits[specialty] || 0);
      const specUsed = Number(usage.teleConsult[specialty] || 0);
      if (specAllowed <= 0) { return res.status(400).json({ message: 'Specialty not covered in plan' }); }
      if (specUsed + Number(count) > specAllowed) { return res.status(400).json({ message: 'Teleconsult limit exceeded for specialty' }); }
      usage.teleConsult[specialty] = specUsed + Number(count);
    }

    meta.usage = usage;
    await active.update({ metadata: meta });
    return res.json({ success: true, usage: meta.usage });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Failed to increment teleconsult usage', error: e.message });
  }
});

// Increment monetary benefit usage (pharmacy/homeCare/ambulance)
router.post('/usage/benefit', authUser, [
  body('type').isIn(['pharmacyINR','homeCareINR','ambulanceINR']),
  body('amount').isFloat({ min: 0 })
], async (req, res) => {
  const { type, amount } = req.body;
  try {
    const active = await UserPlan.findOne({ where: { userId: req.user.id, status: 'active' } });
    if (!active) { return res.status(400).json({ message: 'No active plan' }); }

    const meta = active.metadata || {};
    const usage = meta.usage || {};
    usage.benefitINR = usage.benefitINR || { pharmacyINR: 0, homeCareINR: 0, ambulanceINR: 0 };

    const limits = (meta.appliedLimits?.benefitLimits) || {};
    const map = {
      pharmacyINR: Number(limits.pharmacyLimitINR || 0),
      homeCareINR: Number(limits.homeCareLimitINR || 0),
      ambulanceINR: Number(limits.ambulanceLimitINR || 0)
    };

    const current = Number(usage.benefitINR[type] || 0);
    const allowed = map[type] || 0;
    if (current + Number(amount) > allowed) { return res.status(400).json({ message: 'Benefit limit exceeded' }); }

    usage.benefitINR[type] = current + Number(amount);
    meta.usage = usage;
    await active.update({ metadata: meta });
    return res.json({ success: true, usage: meta.usage });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Failed to increment benefit usage', error: e.message });
  }
});

/** Exported for tests: the Benefits & Plans coverage figures. */
export { summariseCoverage, summariseUtilisation, buildAppliedLimits };

export default router;
