/**
 * Emails when a member's plan becomes active (owner rule, 2026-11-22; spec
 * docs/PLAN_PURCHASE_EMAILS_SERVER_SPEC.md in the app repo):
 *   - a payment acknowledgement for every PAID activation, including the first subscription
 *     (only upgrades were acknowledged before);
 *   - a welcome email the first time a member has a plan, from "My SmartHealth"
 *     <hello@mysmarthealth.in>, with what the app does, the plan's details and the support address.
 *
 * Self-service activations only (subscribe, free coupon). Plans the employer assigns are not
 * welcomed here: a roster upload would email thousands at once, and they have their own welcome.
 * Best-effort: never throws, so an email problem can never undo or fail an activation.
 */
import { postgresSequelize } from '../db/postgres-sequelize.js';
import { sendTransactionalEmail } from './welcome-email.service.js';
import purchaseNotification from './purchase-notification.service.js';
import { BRAND_NAME, BRAND_SUPPORT_EMAIL, BRAND_APP_URL } from '../config/email-brand.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const day = (v) => {
  if (!v) return null;
  const d = new Date(`${String(v).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
};
const placeholderEmail = (e) => !e || /@(example\.(com|invalid)|mediczy\.in|noemail\.|.*\.invalid$)|^noemail\./i.test(String(e)) || /^(pending|noemail)[+.]/i.test(String(e));

/** The plan's highlights: its benefits list, else its enabled features. */
export function planHighlights(plan) {
  const benefits = Array.isArray(plan?.benefits) ? plan.benefits : [];
  const lines = benefits.map((b) => (typeof b === 'string' ? b : b?.title || b?.name || b?.description)).filter(Boolean);
  if (lines.length) return lines.slice(0, 8).map(String);
  const f = plan?.features && typeof plan.features === 'object' ? plan.features : {};
  return Object.entries(f).filter(([, v]) => v === true || (typeof v === 'number' && v > 0)).slice(0, 8)
    .map(([k, v]) => `${k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())}${typeof v === 'number' ? `: ${v}` : ''}`);
}

export function buildWelcomeEmail({ user, plan, userPlan }) {
  const first = String(user?.firstName || '').trim() || 'there';
  const from = day(userPlan?.startDate);
  const to = day(userPlan?.endDate);
  const highlights = planHighlights(plan);
  const subject = `Welcome to ${BRAND_NAME}, ${first}`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f7f6;font-family:Segoe UI,Arial,sans-serif;color:#1f2937;">
<div style="max-width:600px;margin:0 auto;padding:24px 16px;">
  <div style="background:#0f766e;border-radius:12px 12px 0 0;padding:24px;">
    <h1 style="margin:0;color:#fff;font-size:22px;">Welcome to ${esc(BRAND_NAME)}</h1>
    <p style="margin:6px 0 0;color:#ccfbf1;font-size:14px;">Your health, looked after in one app.</p>
  </div>
  <div style="background:#fff;border-radius:0 0 12px 12px;padding:24px;">
    <p style="margin:0 0 12px;font-size:15px;">Hi ${esc(first)},</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">Thank you for joining ${esc(BRAND_NAME)}. Your plan is active and you can start using it in the app straight away.</p>
    <div style="border:1px solid #d1fae5;background:#f0fdfa;border-radius:10px;padding:16px;margin:0 0 20px;">
      <p style="margin:0;font-size:13px;color:#0f766e;text-transform:uppercase;letter-spacing:.04em;">Your plan</p>
      <p style="margin:4px 0 0;font-size:18px;font-weight:600;">${esc(plan?.name || 'Membership')}</p>
      ${from && to ? `<p style="margin:4px 0 0;font-size:14px;color:#4b5563;">Active from ${esc(from)} to ${esc(to)}</p>` : ''}
      ${highlights.length ? `<ul style="margin:12px 0 0;padding-left:20px;font-size:14px;line-height:1.6;">${highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
    </div>
    <p style="margin:0 0 8px;font-size:15px;font-weight:600;">What you can do in the app</p>
    <ul style="margin:0 0 20px;padding-left:20px;font-size:14px;line-height:1.7;">
      <li>Talk to a doctor by video, or book a clinic visit</li>
      <li>Book lab tests and your health check-up, with reports in the app</li>
      <li>Order medicines and keep your prescriptions together</li>
      <li>Keep your family's health records in one place</li>
    </ul>
    <p style="margin:0 0 20px;"><a href="${esc(BRAND_APP_URL)}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px;">Open ${esc(BRAND_NAME)}</a></p>
    <p style="margin:0;font-size:14px;color:#4b5563;line-height:1.5;">Questions or help with your plan? Write to <a href="mailto:${esc(BRAND_SUPPORT_EMAIL)}" style="color:#0f766e;">${esc(BRAND_SUPPORT_EMAIL)}</a>.</p>
  </div>
  <p style="text-align:center;font-size:11px;color:#9ca3af;margin:16px 0 0;">${esc(BRAND_NAME)} · You are receiving this because you started a plan.</p>
</div></body></html>`;
  return { subject, html };
}

async function isFirstPlan(userId, currentUserPlanId) {
  const [row] = await postgresSequelize.query(
    'SELECT count(*)::int AS n FROM user_plans WHERE "userId" = :userId AND id <> :id',
    { replacements: { userId, id: currentUserPlanId || 0 }, type: postgresSequelize.QueryTypes.SELECT });
  return Number(row?.n || 0) === 0;
}

/**
 * Call after a self-service plan is active.
 * @param {{ user, plan, userPlan, paymentId?: string|null, amount?: number, kind?: 'subscribe'|'coupon' }} input
 * @returns {Promise<{ receipt: boolean, welcome: boolean }>}
 */
export async function onPlanActivated({ user, plan, userPlan, paymentId = null, amount = 0, kind = 'subscribe' }) {
  const out = { receipt: false, welcome: false };
  try {
    if (!user?.id || !plan || !userPlan) return out;
    if (Number(amount) > 0 && paymentId) {
      await purchaseNotification.notifyMembershipPurchase({
        user, plan, payment: { paymentId, method: 'razorpay' }, previousPlanName: null, amountDue: Number(amount),
        kind: 'subscribe', validFrom: day(userPlan.startDate), validTo: day(userPlan.endDate),
      });
      out.receipt = true;
    }
    if (!placeholderEmail(user.email) && await isFirstPlan(user.id, userPlan.id)) {
      const { subject, html } = buildWelcomeEmail({ user, plan, userPlan });
      await sendTransactionalEmail({ to: user.email, subject, html, fromName: BRAND_NAME, provider: 'ses' });
      out.welcome = true;
    }
  } catch (error) {
    console.error(`[plan-emails] ${kind} emails for user ${user?.id} failed: ${error.message}`);
  }
  return out;
}

export default { onPlanActivated, buildWelcomeEmail, planHighlights };
