import express from 'express';
import { body, param } from 'express-validator';
import { Op } from 'sequelize';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { MembershipPlan, UserPlan } from '../models/postgres/membershipPlan.model.postgres.js';
import paymentService from '../services/payment.service.js';
import whatsappProductionService from '../services/whatsapp-production.service.js';

const router = express.Router();

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
    res.json({ plans });
  } catch(e) {
    console.error(e);
    res.status(500).json({ message:'Failed to get plans', error:e.message });
  }
});

router.get('/my/current', authUser, async (req,res) => {
  try {
    const userPlan = await UserPlan.findOne({ 
      where:{ userId:req.user.id, status:'active' }, 
      include: [{ model: MembershipPlan, as: 'plan' }],
      order:[['createdAt','DESC']] 
    });
    
    if (!userPlan) {
      return res.json({ userPlan: null, plan: null });
    }

    const planObj = userPlan.toJSON();
    const associatedPlan = userPlan.plan || userPlan.MembershipPlan;
    res.json({ 
      userPlan: {
        ...planObj,
        appliedLimits: planObj.metadata?.appliedLimits ||
          (associatedPlan ? buildAppliedLimits(associatedPlan) : {}),
        usage: planObj.metadata?.usage || {},
      },
      plan: associatedPlan 
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

    // Paid plans require a Razorpay payment ID — prevent free activation of paid plans
    if (planPrice > 0 && !req.body.razorpay_payment_id) {
      return res.status(400).json({
        message: 'Payment required. Use POST /api/membership-plans/enroll with a verified paymentId.',
        code: 'PAYMENT_REQUIRED'
      });
    }
    
    // For primary plans, prevent multiple active subscriptions
    if (planType === 'primary') {
      const alreadyActive = await UserPlan.findOne({ 
        where: { userId: req.user.id, status: 'active' },
        include: [{ model: MembershipPlan, as: 'plan', where: { planType: 'primary' }, required: true }]
      });
      if (alreadyActive) {
        return res.status(400).json({ message: 'You already have an active primary plan. Use upgrade endpoint to switch plans.' });
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

// -------- PLAN PAYMENT ORDER --------
// Create a Razorpay order for a plan upgrade (called before the actual upgrade)
router.post('/payment-order', authUser, [
  body('amount').isFloat({ min: 0.5 }),
  body('planId').isInt(),
  body('planName').notEmpty()
], async (req, res) => {
  try {
    const { amount, planId, planName } = req.body;
    const receipt = `plan${planId}_u${req.user.id}_${Date.now()}`.slice(0, 40);
    const orderResult = await paymentService.createOrder({
      amount,
      currency: 'INR',
      receipt,
      notes: { planId: String(planId), userId: String(req.user.id), planName }
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
      transaction: { description: `Upgrade to ${planName}` }
    });
  } catch (e) {
    console.error('Payment order error:', e);
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
    const amountDue = Math.max(0, newPlanPrice - proratedRefund);

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
        appliedLimits: buildAppliedLimits(newPlan),
        usage: { benefitINR: { pharmacyINR: 0, homeCareINR: 0, ambulanceINR: 0 }, teleConsult: {} }
      }
    });

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
        amountDue
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

export default router;
