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
import { UserPlan } from '../models/postgres/membershipPlan.model.postgres.js';

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

/**
 * @returns {Promise<{
 *   hasPlan: boolean, planId: number|null, limit: number, used: number,
 *   remaining: number, covered: boolean, reason: string
 * }>}
 */
export async function getTeleconsultEntitlement(userId, { consultationType = 'online' } = {}) {
  const none = (reason) => ({
    hasPlan: false, planId: null, limit: 0, used: 0, remaining: 0, covered: false, reason,
  });

  if (!userId) return none('no_user');
  if (String(consultationType).toLowerCase() !== 'online') return none('not_an_online_consultation');

  const now = new Date();
  let plan;
  try {
    plan = await UserPlan.findOne({
      where: {
        userId,
        status: 'active',
        [Op.and]: [
          { [Op.or]: [{ startDate: { [Op.lte]: now } }, { startDate: null }] },
          { [Op.or]: [{ endDate: { [Op.gte]: now } }, { endDate: null }] },
        ],
      },
      order: [['createdAt', 'DESC']],
    });
  } catch (error) {
    // Never block a booking because the entitlement lookup failed; the member
    // simply pays as they do today.
    console.error('[teleconsult-entitlement] lookup failed:', error.message);
    return none('lookup_failed');
  }

  if (!plan) return none('no_active_plan');

  const metadata = plan.metadata || {};
  const limit = teleconsultAllowance(metadata);
  if (!limit) {
    return { hasPlan: true, planId: plan.id, limit: 0, used: 0, remaining: 0, covered: false, reason: 'plan_has_no_teleconsult_benefit' };
  }

  const used = usedTeleconsults(metadata);
  const remaining = Math.max(0, limit - used);
  return {
    hasPlan: true,
    planId: plan.id,
    limit,
    used,
    remaining,
    covered: remaining > 0,
    reason: remaining > 0 ? 'covered_by_plan' : 'teleconsult_allowance_exhausted',
  };
}

/**
 * Consume one teleconsult against the member's plan. Returns false when the
 * allowance was already spent — the caller must then charge normally.
 *
 * Mirrors POST /api/membership/usage/teleconsult so a consultation booked in
 * the app and one recorded by that endpoint count against the same balance.
 */
export async function consumeTeleconsult(userId, specialty = 'general', count = 1, { transaction } = {}) {
  const plan = await UserPlan.findOne({
    where: { userId, status: 'active' },
    order: [['createdAt', 'DESC']],
    ...(transaction ? { transaction, lock: transaction.LOCK?.UPDATE } : {}),
  });
  if (!plan) return false;

  const metadata = { ...(plan.metadata || {}) };
  const limit = teleconsultAllowance(metadata);
  const used = usedTeleconsults(metadata);
  if (!limit || used + count > limit) return false;

  const key = String(specialty || 'general');
  metadata.usage = { ...(metadata.usage || {}) };
  metadata.usage.teleConsult = { ...(metadata.usage.teleConsult || {}) };
  metadata.usage.teleConsult[key] = Number(metadata.usage.teleConsult[key] || 0) + Number(count);

  await plan.update({ metadata }, transaction ? { transaction } : {});
  return true;
}

export default { getTeleconsultEntitlement, consumeTeleconsult, usedTeleconsults, teleconsultAllowance };
