/**
 * Activate a membership plan from a Razorpay order, on the server, with no help from the app.
 *
 * Stuck-payment incident 2026-11-22: a member paid ₹99 for Start by UPI, the app lost the checkout
 * reply and never called /membership/subscribe, and the account stayed locked on "Choose your plan".
 * The webhook that should have caught it updated an in-memory table and logged. Every path that can
 * finish a plan payment now comes here:
 *   - webhook    payment.captured / order.paid  (controller/payment.controller.js)
 *   - reconcile  the membership gate when a locked member opens the app, and
 *                POST /api/membership/reconcile  ("Already have a plan? Check again")
 *   - admin      POST /api/membership/admin/activate-from-payment  (a verified payment id)
 *
 * The app's own /subscribe and /upgrade still activate on the spot; they record their order as
 * activated here too, so a later webhook or reconcile finds it done.
 *
 * Trust comes from Razorpay itself, read with our own key: the order must be one our payment-order
 * made (notes.pricing 'server-v1', notes.kind subscribe|upgrade, notes.userId/planId), the payment
 * captured against that order for at least its amount, and not already on a plan. No checkout
 * signature is needed - that only proves the same thing to a caller who cannot ask Razorpay.
 *
 * Idempotent: user_plans."paymentId" is unique, so concurrent paths create one plan and the others
 * report it as already done. A paid order that would break a plan rule (already on a plan, add-on
 * without a base plan) is marked 'refused' for a person to refund or decide, never retried.
 */
import pool from '../db/pgPool.js';
import { MembershipPlan, UserPlan } from '../models/postgres/membershipPlan.model.postgres.js';
import paymentService from './payment.service.js';
import { selfServiceRefusal } from './plan-pricing.service.js';
import { buildAppliedLimits } from '../utils/plan-limits.js';

export const ACTIVATABLE_KINDS = Object.freeze(['subscribe', 'upgrade']);
const RECONCILE_WINDOW_DAYS = 30;
const RECONCILE_MIN_INTERVAL_SECONDS = 20;
const RECONCILE_MAX_ORDERS = 5;

const ok = (fields) => ({ ok: true, ...fields });
const refuse = (code, message, extra = {}) => ({ ok: false, code, message, ...extra });
const freshUsage = () => ({ benefitINR: { pharmacyINR: 0, homeCareINR: 0, ambulanceINR: 0 }, teleConsult: {} });

export const isPlanOrder = (order) => {
  const n = order?.notes || {};
  return n.pricing === 'server-v1' && ACTIVATABLE_KINDS.includes(n.kind) && Boolean(n.userId) && Boolean(n.planId);
};

/** Record an order /membership/payment-order just made. Never throws: the order itself is what matters. */
export async function recordPlanOrder({ userId, planId, kind, order, couponCode = null }, db = pool) {
  try {
    await db.query(
      `INSERT INTO plan_payment_orders (user_id, plan_id, kind, razorpay_order_id, amount_paise, coupon_code)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (razorpay_order_id) DO NOTHING`,
      [userId, planId, kind, order.id, Number(order.amount) || 0, couponCode]);
  } catch (error) {
    console.error(`[plan-activation] could not record order ${order?.id} for user ${userId}: ${error.message}`);
  }
}

/** Mark an order finished (activated or refused). Upserts, so orders older than the table are covered. */
export async function markPlanOrder(order, fields, db = pool) {
  const n = order?.notes || {};
  try {
    await db.query(
      `INSERT INTO plan_payment_orders (user_id, plan_id, kind, razorpay_order_id, amount_paise, coupon_code,
                                        status, razorpay_payment_id, user_plan_id, activated_via, refusal_code, activated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CASE WHEN $7 = 'activated' THEN now() END)
       ON CONFLICT (razorpay_order_id) DO UPDATE SET
         status = EXCLUDED.status, razorpay_payment_id = EXCLUDED.razorpay_payment_id,
         user_plan_id = COALESCE(EXCLUDED.user_plan_id, plan_payment_orders.user_plan_id),
         activated_via = COALESCE(plan_payment_orders.activated_via, EXCLUDED.activated_via),
         refusal_code = EXCLUDED.refusal_code,
         activated_at = COALESCE(plan_payment_orders.activated_at, EXCLUDED.activated_at),
         updated_at = now()`,
      [Number(n.userId), Number(n.planId), n.kind, order.id, Number(order.amount) || 0, n.couponCode || null,
        fields.status, fields.paymentId || null, fields.userPlanId || null, fields.via || null, fields.refusalCode || null]);
  } catch (error) {
    console.error(`[plan-activation] could not mark order ${order?.id} ${fields.status}: ${error.message}`);
  }
}

/** The app's /subscribe or /upgrade activated this order itself. */
export async function markOrderActivatedByApp({ orderId, paymentId, userPlanId, via }) {
  if (!orderId) return;
  await pool.query(
    `UPDATE plan_payment_orders SET status = 'activated', razorpay_payment_id = $2, user_plan_id = $3,
            activated_via = COALESCE(activated_via, $4), activated_at = COALESCE(activated_at, now()), updated_at = now()
      WHERE razorpay_order_id = $1`, [orderId, paymentId, userPlanId, via]).catch((error) =>
    console.error(`[plan-activation] could not mark order ${orderId} activated: ${error.message}`));
}

const isUniqueViolation = (error) => error?.name === 'SequelizeUniqueConstraintError' || error?.parent?.code === '23505' || error?.code === '23505';

async function existingPlanFor(paymentId) {
  return UserPlan.findOne({ where: { paymentId }, attributes: ['id', 'userId', 'status'] });
}

async function notify({ user, plan, userPlan, paymentId, amount, kind, previousPlanName }) {
  try {
    if (kind === 'subscribe') {
      const { onPlanActivated } = await import('./plan-emails.service.js');
      void onPlanActivated({ user, plan, userPlan, paymentId, amount, kind: 'subscribe' });
    } else {
      const { default: purchaseNotification } = await import('./purchase-notification.service.js');
      purchaseNotification.notifyMembershipPurchase({ user, plan, payment: { paymentId, method: 'razorpay' }, previousPlanName, amountDue: amount })
        .catch((e) => console.error('[plan-activation] upgrade receipt failed:', e.message));
    }
    const phone = String(user.phoneNumber || '').replace(/[^0-9+]/g, '');
    if (phone) {
      const { default: wa } = await import('./whatsapp-production.service.js');
      wa.sendMembershipPlanActivated({
        to: phone.startsWith('+') ? phone : `+91${phone}`, name: user.firstName || 'Member',
        planName: plan.name, startDate: userPlan.startDate, endDate: userPlan.endDate,
      }).catch((e) => console.error('[plan-activation] WhatsApp activation notice failed:', e.message));
    }
  } catch (error) {
    console.error(`[plan-activation] notifications for user ${user?.id} failed: ${error.message}`);
  }
}

/**
 * @param {object} input
 * @param {string} input.orderId           Razorpay order id
 * @param {string} [input.paymentId]       a specific payment on it (else the captured one is found)
 * @param {'webhook'|'reconcile'|'admin'} input.via
 * @param {number} [input.expectUserId]    refuse unless the order is this member's (reconcile)
 * @param {object} [deps]                  { rz } Razorpay client, injected by tests
 * @returns {Promise<{ok:boolean, code?:string, message?:string, userPlanId?:number, alreadyActivated?:boolean, pending?:boolean}>}
 */
export async function activatePlanFromRazorpay({ orderId, paymentId, via, expectUserId }, deps = {}) {
  const rz = deps.rz || paymentService.razorpayInstance;
  if (!rz) return refuse('GATEWAY_UNAVAILABLE', 'The payment gateway is not configured.');
  if (!orderId) return refuse('ORDER_REQUIRED', 'No order to check.');

  const order = await rz.orders.fetch(orderId);
  if (!isPlanOrder(order)) return refuse('NOT_A_PLAN_ORDER', 'That order is not a membership plan payment.');
  const notes = order.notes;
  const userId = Number(notes.userId);
  if (expectUserId != null && userId !== Number(expectUserId)) return refuse('NOT_YOUR_ORDER', 'That order belongs to another account.');

  let payment;
  if (paymentId) {
    payment = await rz.payments.fetch(paymentId);
    if (payment?.order_id !== orderId) return refuse('PAYMENT_NOT_FOR_ORDER', 'That payment was not made against this order.');
  } else {
    const list = await rz.orders.fetchPayments(orderId);
    payment = (list?.items || []).find((p) => p.status === 'captured');
  }
  if (!payment || payment.status !== 'captured') return refuse('NOT_PAID', 'This order has not been paid.', { pending: true });
  if (!(Number(payment.amount) >= Number(order.amount))) {
    console.warn(`[plan-activation] order ${orderId}: paid ${payment.amount} paise, order ${order.amount}`);
    await markPlanOrder(order, { status: 'refused', paymentId: payment.id, via, refusalCode: 'PAYMENT_AMOUNT_MISMATCH' });
    return refuse('PAYMENT_AMOUNT_MISMATCH', 'The payment does not cover this order.');
  }

  const done = await existingPlanFor(payment.id);
  if (done) {
    await markPlanOrder(order, { status: 'activated', paymentId: payment.id, userPlanId: done.id, via });
    return ok({ alreadyActivated: true, userPlanId: done.id, userId });
  }

  const finishRefused = async (code, message) => {
    console.warn(`[plan-activation] paid order ${orderId} (user ${userId}, plan ${notes.planId}, ${notes.kind}) refused: ${code} - needs a person (refund or manual activation)`);
    await markPlanOrder(order, { status: 'refused', paymentId: payment.id, via, refusalCode: code });
    return refuse(code, message, { needsReview: true });
  };

  const { rows: [user] } = await pool.query(
    'SELECT id, "firstName", "lastName", email, "phoneNumber", status FROM users WHERE id = $1', [userId]);
  if (!user) return finishRefused('USER_NOT_FOUND', 'The account for this payment no longer exists.');
  // An erased or suspended account is never reopened by a payment arriving.
  if (!['active', 'inactive'].includes(user.status)) return finishRefused('ACCOUNT_NOT_ACTIVE', 'This account is not active.');

  const plan = await MembershipPlan.findByPk(Number(notes.planId));
  if (!plan) return finishRefused('PLAN_NOT_FOUND', 'The plan for this payment no longer exists.');
  const planType = plan.planType || 'primary';
  const amountINR = Number(payment.amount) / 100;
  const currentPrimary = await UserPlan.findOne({
    where: { userId, status: 'active' },
    include: [{ model: MembershipPlan, as: 'plan', where: { planType: 'primary' }, required: true }],
    order: [['createdAt', 'DESC']],
  });

  const start = new Date();
  const end = new Date(start.getTime() + (plan.durationMonths || 1) * 30 * 86400000);
  const baseRow = {
    userId, membershipPlanId: plan.id,
    startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10),
    paidAmount: amountINR, paymentId: payment.id, paymentMethod: 'razorpay',
  };
  const baseMeta = {
    planName: plan.name, planType, tier: plan.tier, features: plan.features, benefits: plan.benefits,
    limitations: plan.limitations, appliedLimits: buildAppliedLimits(plan), usage: freshUsage(),
    activatedVia: via, razorpayOrderId: orderId, ...(notes.couponCode ? { couponCode: notes.couponCode } : {}),
  };

  let userPlan;
  let previousPlanName = null;
  try {
    if (notes.kind === 'subscribe') {
      const refusal = selfServiceRefusal(plan, currentPrimary?.plan);
      if (refusal) return finishRefused(refusal.code, refusal.message);
      if (planType === 'primary' && currentPrimary) return finishRefused('PRIMARY_PLAN_ALREADY_ACTIVE', 'The member already has an active plan.');
      if (planType === 'addon' && await UserPlan.findOne({ where: { userId, membershipPlanId: plan.id, status: 'active' }, attributes: ['id'] })) {
        return finishRefused('ADDON_ALREADY_ACTIVE', 'The member already has this add-on.');
      }
      userPlan = await UserPlan.create({ ...baseRow, metadata: baseMeta });
    } else {
      // Upgrade: same rules as POST /membership/upgrade/:newPlanId.
      const current = currentPrimary;
      if (!current?.plan) return finishRefused('NO_PLAN_TO_UPGRADE', 'The member has no active plan to upgrade.');
      if (planType === 'addon') return finishRefused('UPGRADE_TO_ADDON', 'An add-on cannot be an upgrade.');
      if ((plan.tier || 1) < (current.plan.tier || 1)) return finishRefused('DOWNGRADE', 'That would be a downgrade.');
      if (current.membershipPlanId === plan.id) return finishRefused('ALREADY_ON_PLAN', 'The member is already on this plan.');
      const refusal = selfServiceRefusal(plan, current.plan);
      if (refusal?.code === 'PLAN_NOT_SELF_SERVICE') return finishRefused(refusal.code, refusal.message);
      previousPlanName = current.plan.name;
      userPlan = await UserPlan.sequelize.transaction(async (transaction) => {
        await current.update({
          status: 'upgraded',
          metadata: { ...current.metadata, upgradedTo: plan.id, upgradedAt: new Date().toISOString(), upgradeVia: via },
        }, { transaction });
        return UserPlan.create({
          ...baseRow,
          metadata: { ...baseMeta, upgradedFrom: current.membershipPlanId, previousPlanName },
        }, { transaction });
      });
    }
  } catch (error) {
    if (isUniqueViolation(error)) {
      // Another path (the app's /subscribe, the webhook) activated this payment a moment ago.
      const winner = await existingPlanFor(payment.id);
      if (winner) await markPlanOrder(order, { status: 'activated', paymentId: payment.id, userPlanId: winner.id, via });
      return ok({ alreadyActivated: true, userPlanId: winner?.id ?? null, userId });
    }
    throw error;
  }

  await markPlanOrder(order, { status: 'activated', paymentId: payment.id, userPlanId: userPlan.id, via });
  const { syncUserStatusWithMembership } = await import('../middleware/membership.middleware.js');
  await syncUserStatusWithMembership(userId);
  console.log(`[plan-activation] activated user_plans ${userPlan.id} (user ${userId}, ${plan.name}, ${notes.kind}) from ${orderId}/${payment.id} via ${via}`);
  await notify({ user, plan, userPlan, paymentId: payment.id, amount: amountINR, kind: notes.kind, previousPlanName });
  return ok({ userPlanId: userPlan.id, userId, planName: plan.name, kind: notes.kind });
}

/**
 * Finish any of this member's recent plan orders that Razorpay shows as paid. Cheap when there is
 * nothing to do (one indexed query); each order is asked about at most every 20 seconds.
 * @returns {Promise<{ activated: object[], pending: number, refused: object[], checked: number }>}
 */
export async function reconcileUserPlanOrders(userId, { via = 'reconcile' } = {}, deps = {}) {
  const out = { activated: [], pending: 0, refused: [], checked: 0 };
  const { rows } = await pool.query(
    `UPDATE plan_payment_orders SET last_checked_at = now()
      WHERE id IN (SELECT id FROM plan_payment_orders
                    WHERE user_id = $1 AND status = 'created'
                      AND created_at > now() - make_interval(days => $2)
                      AND (last_checked_at IS NULL OR last_checked_at < now() - make_interval(secs => $3))
                    ORDER BY created_at DESC LIMIT $4)
      RETURNING razorpay_order_id`,
    [userId, RECONCILE_WINDOW_DAYS, RECONCILE_MIN_INTERVAL_SECONDS, RECONCILE_MAX_ORDERS]);
  for (const { razorpay_order_id: orderId } of rows) {
    out.checked += 1;
    try {
      const r = await activatePlanFromRazorpay({ orderId, via, expectUserId: userId }, deps);
      if (r.ok) out.activated.push({ orderId, userPlanId: r.userPlanId, alreadyActivated: Boolean(r.alreadyActivated) });
      else if (r.pending) out.pending += 1;
      else out.refused.push({ orderId, code: r.code });
    } catch (error) {
      out.pending += 1;
      console.error(`[plan-activation] reconcile of ${orderId} for user ${userId} failed: ${error.message}`);
    }
  }
  return out;
}

/** Admin tool: activate from a payment id someone has in hand (support email, Razorpay dashboard). */
export async function activateFromPaymentId(paymentId, deps = {}) {
  const rz = deps.rz || paymentService.razorpayInstance;
  if (!/^pay_[A-Za-z0-9]{6,40}$/.test(String(paymentId || ''))) return refuse('BAD_PAYMENT_ID', 'That is not a Razorpay payment id (pay_...).');
  const payment = await rz.payments.fetch(paymentId);
  if (!payment?.order_id) return refuse('NO_ORDER', 'That payment has no order, so it was not made for a plan.');
  return activatePlanFromRazorpay({ orderId: payment.order_id, paymentId, via: 'admin' }, { ...deps, rz });
}

export default { activatePlanFromRazorpay, reconcileUserPlanOrders, activateFromPaymentId, recordPlanOrder, markOrderActivatedByApp, isPlanOrder };
