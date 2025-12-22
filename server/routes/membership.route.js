import express from 'express';
import { body, param } from 'express-validator';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { MembershipPlan, UserPlan } from '../models/postgres/membershipPlan.model.postgres.js';

const router = express.Router();

// -------- Admin Endpoints --------
router.post('/admin/plans', authUser, requireRole('admin'), [
  body('name').notEmpty(),
  body('durationDays').isInt({ min:1 }),
  body('priceINR').isFloat({ min:0 }),
], async (req,res) => {
  try {
    const plan = await MembershipPlan.create(req.body);
    res.status(201).json({ plan });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message:'Failed to create plan', error: e.message });
  }
});

router.get('/admin/plans', authUser, requireRole('admin'), async (_req,res) => {
  const plans = await MembershipPlan.findAll({ order:[['createdAt','DESC']] });
  res.json({ plans });
});

router.put('/admin/plans/:id', authUser, requireRole('admin'), [ param('id').isInt() ], async (req,res) => {
  try {
    const plan = await MembershipPlan.findByPk(req.params.id);
    if(!plan) return res.status(404).json({ message:'Plan not found' });
    await plan.update(req.body);
    res.json({ plan });
  } catch(e){
    res.status(500).json({ message:'Failed to update', error:e.message });
  }
});

router.delete('/admin/plans/:id', authUser, requireRole('admin'), [ param('id').isInt() ], async (req,res) => {
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
router.get('/plans', async (_req,res) => {
  const plans = await MembershipPlan.findAll({ where:{ isActive:true }, order:[['priceINR','ASC']] });
  res.json({ plans });
});

router.get('/my/current', authUser, async (req,res) => {
  const userPlan = await UserPlan.findOne({ where:{ userId:req.user.id, status:'active' }, order:[['createdAt','DESC']] });
  res.json({ userPlan });
});

router.post('/subscribe/:planId', authUser, [ param('planId').isInt() ], async (req,res) => {
  try {
    // Prevent multiple active subscriptions
    const alreadyActive = await UserPlan.findOne({ where: { userId: req.user.id, status: 'active' } });
    if (alreadyActive) {
      return res.status(400).json({ message: 'You already have an active plan' });
    }
    const plan = await MembershipPlan.findByPk(req.params.planId);
    if(!plan || !plan.isActive) return res.status(404).json({ message:'Plan not available' });

    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + plan.durationDays*24*60*60*1000);

    const userPlan = await UserPlan.create({
      userId: req.user.id,
      membershipPlanId: plan.id,
      startDate: startDate.toISOString().slice(0,10),
      endDate: endDate.toISOString().slice(0,10),
      appliedLimits: {
        benefitLimits: plan.benefitLimits,
        teleConsultLimits: plan.teleConsultLimits,
        healthCheckPackage: plan.healthCheckPackage,
        priceINR: plan.priceINR
      },
      usage: {}
    });

    res.status(201).json({ userPlan });
  } catch(e){
    console.error(e);
    res.status(500).json({ message:'Subscription failed', error:e.message });
  }
});

// Usage summary (remaining limits)
router.get('/my/usage', authUser, async (req,res) => {
  const active = await UserPlan.findOne({ where:{ userId:req.user.id, status:'active' } });
  if(!active) return res.json({ active:null, remaining:null });
  const limits = active.appliedLimits?.benefitLimits || {};
  const usage = active.usage || {};
  const remaining = Object.keys(limits).reduce((acc,key)=>{
    acc[key] = Math.max(limits[key] - (usage[key]||0),0);
    return acc;
  },{});
  res.json({ active, remaining });
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

    const applied = active.appliedLimits || {};
    const teleLimits = applied.teleConsultLimits || {};
    const usage = active.usage || {};
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

    await active.update({ usage });
    return res.json({ success: true, usage: active.usage });
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

    const usage = active.usage || {};
    usage.benefitINR = usage.benefitINR || { pharmacyINR: 0, homeCareINR: 0, ambulanceINR: 0 };

    const limits = (active.appliedLimits?.benefitLimits) || {};
    const map = {
      pharmacyINR: Number(limits.pharmacyLimitINR || 0),
      homeCareINR: Number(limits.homeCareLimitINR || 0),
      ambulanceINR: Number(limits.ambulanceLimitINR || 0)
    };

    const current = Number(usage.benefitINR[type] || 0);
    const allowed = map[type] || 0;
    if (current + Number(amount) > allowed) { return res.status(400).json({ message: 'Benefit limit exceeded' }); }

    usage.benefitINR[type] = current + Number(amount);
    await active.update({ usage });
    return res.json({ success: true, usage: active.usage });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Failed to increment benefit usage', error: e.message });
  }
});

export default router;
