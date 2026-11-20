/**
 * Teleconsult entitlement — "my plan includes N online consultations".
 *
 * D-23: a Silver member with 10 free teleconsults was still quoted ₹800 and
 * asked to pay. The entitlement existed in the data
 * (`plan.metadata.coverageDetails.onlineConsult.limit`) and the *join* path
 * already honoured an active plan, but the booking path computed the fee
 * purely from the doctor's rate and never looked at the member's plan. The
 * quote, the charge and the usage counter each read the entitlement
 * differently, so this is the one place that reads it.
 *
 * Deliberately conservative: an entitlement only applies to an ONLINE
 * consultation, on an active in-window plan, with a positive limit and unused
 * balance. Anything else falls through to the normal fee — waiving a charge by
 * accident is a revenue loss, so every condition is explicit.
 */
import { Op } from 'sequelize';
import { UserPlan, MembershipPlan } from '../models/postgres/membershipPlan.model.postgres.js';

/** Total teleconsults used across every specialty on this plan. */
export function usedTeleconsults(metadata) {
  const perSpecialty = metadata?.usage?.teleConsult || {};
  return Object.values(perSpecialty).reduce((sum, value) => sum + (Number(value) || 0), 0);
}

/** The pooled allowance, when the plan grants one across all specialties. */
export function teleconsultAllowance(metadata) {
  const limits = metadata?.appliedLimits?.teleConsultLimits || {};
  const pooled = Number(limits.allSpecialties);
  return Number.isFinite(pooled) && pooled > 0 ? pooled : 0;
}

/** GP vs specialist, from the doctor's specialisation (no specialisation = general practice). */
const GP_SPECIALTY = /general|family|physician|\bgp\b|internal medicine|primary care/i;
export const isGeneralPractice = (specialty) => !specialty || GP_SPECIALTY.test(String(specialty));

const istDate = (now = new Date()) => new Date(now.getTime() + 5.5 * 3600000).toISOString().slice(0, 10);

/**
 * Entitlement on one plan's metadata (pure). New-style plans (2026-11-20 lineup) carry
 * teleConsultLimits.gpFairUse {perDay, perMonth} and/or .specialist (a count for the plan period);
 * older plans keep the single pooled allowance (allSpecialties).
 */
export function entitlementFor(metadata = {}, specialty, now = new Date(), extra = null) {
  const own = metadata?.appliedLimits?.teleConsultLimits || {};
  // Add-ons (Parents, Extra child, Chronic Care) add GP fair use and specialist consults.
  const limits = extra && (own.gpFairUse || own.specialist !== undefined) ? {
    ...own,
    gpFairUse: own.gpFairUse ? {
      perDay: own.gpFairUse.perDay == null ? null : Number(own.gpFairUse.perDay) + (Number(extra.perDay) || 0),
      perMonth: Number(own.gpFairUse.perMonth) + (Number(extra.perMonth) || 0),
    } : own.gpFairUse,
    specialist: (Number(own.specialist) || 0) + (Number(extra.specialist) || 0),
  } : own;
  const usage = metadata?.usage || {};
  const newStyle = limits.gpFairUse || limits.specialist !== undefined;
  if (!newStyle) {
    const limit = teleconsultAllowance(metadata);
    if (!limit) return { kind: 'pooled', limit: 0, used: 0, remaining: 0, covered: false, reason: 'plan_has_no_teleconsult_benefit' };
    const used = usedTeleconsults(metadata);
    const remaining = Math.max(0, limit - used);
    return { kind: 'pooled', limit, used, remaining, covered: remaining > 0, reason: remaining > 0 ? 'covered_by_plan' : 'teleconsult_allowance_exhausted' };
  }
  if (isGeneralPractice(specialty)) {
    const fu = limits.gpFairUse;
    if (!fu || !(Number(fu.perMonth) > 0)) return { kind: 'gp', limit: 0, used: 0, remaining: 0, covered: false, reason: 'plan_has_no_gp_benefit' };
    const today = istDate(now);
    const month = today.slice(0, 7);
    const days = usage.teleConsultDays || {};
    const monthUsed = Object.entries(days).filter(([d]) => d.startsWith(month)).reduce((t, [, n]) => t + (Number(n) || 0), 0);
    const dayUsed = Number(days[today] || 0);
    const perDay = Number(fu.perDay) || 0;
    const dayLeft = perDay ? perDay - dayUsed : Infinity;
    const remaining = Math.max(0, Math.min(Number(fu.perMonth) - monthUsed, dayLeft));
    const reason = remaining > 0 ? 'covered_by_plan' : (perDay && dayUsed >= perDay ? 'daily_fair_use_reached' : 'monthly_fair_use_reached');
    return { kind: 'gp', limit: Number(fu.perMonth), used: monthUsed, remaining, covered: remaining > 0, reason, window: 'month', perDay: perDay || null };
  }
  const limit = Number(limits.specialist) || 0;
  if (!limit) return { kind: 'specialist', limit: 0, used: 0, remaining: 0, covered: false, reason: 'plan_has_no_specialist_benefit' };
  const used = Number(usage.specialistUsed || 0);
  const remaining = Math.max(0, limit - used);
  return { kind: 'specialist', limit, used, remaining, covered: remaining > 0, reason: remaining > 0 ? 'covered_by_plan' : 'specialist_allowance_exhausted', window: 'plan' };
}

/** The member's active primary plan (an add-on bought later must not replace it), and what add-ons add. */
async function activePlans(userId, { transaction, lock } = {}) {
  const now = new Date();
  const plans = await UserPlan.findAll({
    where: {
      userId,
      status: 'active',
      [Op.and]: [
        { [Op.or]: [{ startDate: { [Op.lte]: now } }, { startDate: null }] },
        { [Op.or]: [{ endDate: { [Op.gte]: now } }, { endDate: null }] },
      ],
    },
    order: [['createdAt', 'DESC']],
    include: [{ model: MembershipPlan, as: 'plan', required: false }],
    ...(transaction ? { transaction } : {}),
    ...(lock ? { lock: { level: lock, of: UserPlan } } : {}),
  });
  const isAddon = (p) => (p.metadata?.planType || p.plan?.planType || 'primary') === 'addon';
  const primary = plans.find((p) => !isAddon(p)) || null;
  const extras = plans.filter(isAddon).map((p) => p.plan?.metadata?.teleconsultExtra).filter(Boolean);
  const extra = extras.length ? extras.reduce((t, e) => ({
    perDay: t.perDay + (Number(e.perDay) || 0), perMonth: t.perMonth + (Number(e.perMonth) || 0), specialist: t.specialist + (Number(e.specialist) || 0),
  }), { perDay: 0, perMonth: 0, specialist: 0 }) : null;
  return { primary, extra };
}

/**
 * @returns {Promise<{ hasPlan: boolean, planId: number|null, limit: number, used: number,
 *   remaining: number, covered: boolean, reason: string, kind?: string }>}
 */
export async function getTeleconsultEntitlement(userId, { consultationType = 'online', specialty } = {}) {
  const none = (reason) => ({
    hasPlan: false, planId: null, limit: 0, used: 0, remaining: 0, covered: false, reason,
  });
  if (!userId) return none('no_user');
  if (String(consultationType).toLowerCase() !== 'online') return none('not_an_online_consultation');
  let plan;
  let extra = null;
  try {
    ({ primary: plan, extra } = await activePlans(userId));
  } catch (error) {
    // Never block a booking because the entitlement lookup failed; the member
    // simply pays as they do today.
    console.error('[teleconsult-entitlement] lookup failed:', error.message);
    return none('lookup_failed');
  }
  if (!plan) return none('no_active_plan');
  return { hasPlan: true, planId: plan.id, ...entitlementFor(plan.metadata || {}, specialty, new Date(), extra) };
}

/**
 * Consume one teleconsult against the member's primary plan. Returns false when it is not covered
 * (allowance spent, or the daily/monthly fair use reached) — the caller must then charge normally.
 */
export async function consumeTeleconsult(userId, specialty = 'general', count = 1, { transaction } = {}) {
  const { primary: plan, extra } = await activePlans(userId, { transaction, lock: transaction?.LOCK?.UPDATE });
  if (!plan) return false;
  const metadata = { ...(plan.metadata || {}) };
  const ent = entitlementFor(metadata, specialty, new Date(), extra);
  if (!ent.covered || ent.remaining < count) return false;
  const key = String(specialty || 'general');
  metadata.usage = { ...(metadata.usage || {}) };
  metadata.usage.teleConsult = { ...(metadata.usage.teleConsult || {}) };
  metadata.usage.teleConsult[key] = Number(metadata.usage.teleConsult[key] || 0) + Number(count);
  if (ent.kind === 'gp') {
    const today = istDate();
    const cutoff = istDate(new Date(Date.now() - 62 * 86400000));
    const days = Object.fromEntries(Object.entries(metadata.usage.teleConsultDays || {}).filter(([d]) => d >= cutoff));
    days[today] = Number(days[today] || 0) + Number(count);
    metadata.usage.teleConsultDays = days;
  } else if (ent.kind === 'specialist') {
    metadata.usage.specialistUsed = Number(metadata.usage.specialistUsed || 0) + Number(count);
  }
  await plan.update({ metadata }, transaction ? { transaction } : {});
  return true;
}

export default { getTeleconsultEntitlement, consumeTeleconsult, usedTeleconsults, teleconsultAllowance, entitlementFor, isGeneralPractice };
