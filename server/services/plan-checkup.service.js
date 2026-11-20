/**
 * Health check-ups included in an individual plan (2026-11-20 lineup: One = 1, Family = 2 adults).
 *
 * The check-up is offered in the normal /api/health-checkups flow as a ₹0 package whose id is
 * "PLAN-<user_plans.id>". Its tests and eligible relations come from the plan
 * (membership_plans.metadata.coverageDetails.healthCheck). Booking counts against the plan's
 * allowance: active bookings (anything not cancelled) on that package id. Before this there was no
 * way to redeem a plan check-up at all; Team had to book them by hand.
 */
import { postgresSequelize } from '../db/postgres-sequelize.js';

export const PLAN_CHECKUP_PREFIX = 'PLAN-';
export const isPlanCheckupId = (packageId) => String(packageId || '').startsWith(PLAN_CHECKUP_PREFIX);
const sel = { type: postgresSequelize.QueryTypes.SELECT };
const obj = (v) => { if (!v) return {}; if (typeof v === 'string') { try { return JSON.parse(v); } catch { return {}; } } return v; };

const PLAN_ROWS = `
  SELECT up.id AS user_plan_id, to_char(up."startDate", 'YYYY-MM-DD') AS valid_from, to_char(up."endDate", 'YYYY-MM-DD') AS valid_to,
         mp.name AS plan_name, mp.metadata AS plan_metadata,
         (SELECT count(*)::int FROM health_checkup_bookings b
           WHERE b.user_id = up."userId" AND b.package_id = 'PLAN-' || up.id::text AND b.status <> 'cancelled') AS used
    FROM user_plans up JOIN membership_plans mp ON mp.id = up."membershipPlanId"
   WHERE up."userId" = :userId AND up.status = 'active'
     AND (up."startDate" IS NULL OR up."startDate" <= CURRENT_DATE) AND (up."endDate" IS NULL OR up."endDate" >= CURRENT_DATE)
     AND COALESCE((mp.metadata->'coverageDetails'->'healthCheck'->>'count')::int, 0) > 0`;

/** packageView-ready raw rows for the plan check-ups the member still has. */
function toRaw(row) {
  const hc = obj(row.plan_metadata).coverageDetails?.healthCheck || {};
  const count = Number(hc.count) || 0;
  return {
    packageId: `${PLAN_CHECKUP_PREFIX}${row.user_plan_id}`,
    packageName: `Health check-up included in your ${row.plan_name} plan`,
    packageDetails: {
      description: `${hc.package || 'Core health check-up'}. ${count > 1 ? `${count} adults are covered` : 'One check-up a year'}, no charge.`,
      tests: Array.isArray(hc.tests) ? hc.tests : [],
      preparationInstructions: Array.isArray(hc.preparationInstructions) ? hc.preparationInstructions : [],
      price: 0,
    },
    price: 0,
    metadata: { eligibleRelations: Array.isArray(hc.eligibleRelations) && hc.eligibleRelations.length ? hc.eligibleRelations : ['self'] },
    validFrom: row.valid_from,
    validTo: row.valid_to,
    source: 'plan',
    allowance: { count, used: Number(row.used) || 0, remaining: Math.max(0, count - (Number(row.used) || 0)) },
  };
}

export async function planCheckupPackages(userId, { transaction } = {}) {
  const rows = await postgresSequelize.query(PLAN_ROWS, { ...sel, replacements: { userId }, transaction });
  return rows.map(toRaw).filter((r) => r.allowance.remaining > 0);
}

/**
 * Resolve a plan check-up for booking inside the booking transaction. Locks the plan row so two
 * bookings cannot both take the last check-up. One active booking per beneficiary.
 * @returns {{ raw }|{ reason }}
 */
export async function resolvePlanCheckup(userId, packageId, relation, transaction) {
  const userPlanId = Number(String(packageId).slice(PLAN_CHECKUP_PREFIX.length));
  if (!Number.isSafeInteger(userPlanId) || userPlanId <= 0) return { reason: 'package_not_eligible' };
  const [lock] = await postgresSequelize.query(
    `SELECT id FROM user_plans WHERE id = :userPlanId AND "userId" = :userId FOR UPDATE`,
    { ...sel, replacements: { userPlanId, userId }, transaction });
  if (!lock) return { reason: 'package_not_eligible' };
  const [row] = await postgresSequelize.query(`${PLAN_ROWS} AND up.id = :userPlanId`, { ...sel, replacements: { userId, userPlanId }, transaction });
  if (!row) return { reason: 'package_not_eligible' };
  const raw = toRaw(row);
  const [dup] = await postgresSequelize.query(
    `SELECT id FROM health_checkup_bookings WHERE user_id = :userId AND package_id = :packageId
        AND COALESCE(beneficiary_relation, 'self') = :relation AND status NOT IN ('cancelled', 'completed') LIMIT 1`,
    { ...sel, replacements: { userId, packageId: raw.packageId, relation: String(relation || 'self') }, transaction });
  if (dup) return { reason: 'already_booked' };
  if (raw.allowance.remaining <= 0) return { reason: 'already_booked' };
  return { raw };
}
