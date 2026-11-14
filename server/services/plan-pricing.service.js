/**
 * What a member owes for a plan — computed by the server, never taken from
 * the app (audit M18). Used by POST /membership/payment-order to price the
 * Razorpay order and by POST /membership/upgrade to know what is due, so the
 * two can never disagree.
 */

/**
 * Plan types a member buys for themselves. Corporate plans ('health_checkup')
 * are prepaid by the employer: the price is an HR reference, the employee pays
 * nothing, and the corporate process assigns them.
 */
export const SELF_SERVICE_PLAN_TYPES = new Set(['primary', 'addon']);

/** The plan's selling price in rupees (discounted price when set). */
export function planPrice(plan) {
  const discounted = plan?.discountedPrice;
  const usable = discounted != null && discounted !== '' && Number(discounted) > 0 ? discounted : plan?.price;
  const n = Number(usable);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

/**
 * Upgrade from the member's current plan: the new price less a refund for the
 * days left on what they paid. Same arithmetic the upgrade route always used.
 */
export function upgradeBaseDue(currentUserPlan, newPlan, now = new Date()) {
  const end = new Date(currentUserPlan.endDate);
  const start = new Date(currentUserPlan.startDate);
  const dayMs = 1000 * 60 * 60 * 24;
  const totalDays = Math.ceil((end - start) / dayMs);
  const remainingDays = Math.max(0, Math.ceil((end - now) / dayMs));
  const paid = parseFloat(currentUserPlan.paidAmount || 0);
  const dailyRate = totalDays > 0 ? paid / totalDays : 0;
  const proratedRefund = Math.round(dailyRate * remainingDays * 100) / 100;
  // `discountedPrice || price` on purpose: it is what activation has always
  // charged. A "0.00" discount means free to the member — confirmed
  // 2026-11-14 for corporate-prepaid plans (price is an HR reference).
  const newPlanPrice = parseFloat(newPlan.discountedPrice || newPlan.price || 0);
  return {
    newPlanPrice,
    proratedRefund,
    remainingDays,
    baseAmountDue: Math.max(0, Math.round((newPlanPrice - proratedRefund) * 100) / 100),
  };
}

/**
 * Which purchase this is and its pre-coupon amount.
 * kind 'upgrade' when the member has an active primary plan and the target is
 * a different primary plan; otherwise 'subscribe' at the plan price.
 * @returns {{ ok: true, kind: 'upgrade'|'subscribe', plan, baseAmount: number }} | {{ ok: false, status, code, message }}
 */
export async function quotePlanPurchase({ userId, planId, now = new Date() }, { MembershipPlan, UserPlan }) {
  const plan = await MembershipPlan.findByPk(planId);
  if (!plan || !plan.isActive) return { ok: false, status: 404, code: 'PLAN_NOT_FOUND', message: 'Plan not available' };
  if (!SELF_SERVICE_PLAN_TYPES.has(plan.planType || 'primary')) {
    return { ok: false, status: 403, code: 'PLAN_NOT_SELF_SERVICE', message: 'This plan is provided through your employer.' };
  }

  if (plan.planType !== 'addon') {
    const current = await UserPlan.findOne({
      where: { userId, status: 'active' },
      include: [{ model: MembershipPlan, as: 'plan' }],
    });
    if (current?.plan && current.plan.planType !== 'addon' && Number(current.membershipPlanId) !== Number(plan.id)) {
      const { baseAmountDue } = upgradeBaseDue(current, plan, now);
      return { ok: true, kind: 'upgrade', plan, baseAmount: baseAmountDue };
    }
  }
  // The price /membership/subscribe activates against (discountedPrice || price),
  // so an order is never priced differently from what activation expects.
  return { ok: true, kind: 'subscribe', plan, baseAmount: Math.max(0, parseFloat(plan.discountedPrice || plan.price || 0)) };
}

export default { planPrice, upgradeBaseDue, quotePlanPurchase };
