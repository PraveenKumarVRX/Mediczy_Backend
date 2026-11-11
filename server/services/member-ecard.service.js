/**
 * Answers "where is my insurance card" for one member, from whichever source
 * actually holds their cover.
 *
 * The member-facing e-card first read only tpa_members. That was correct but
 * narrow, and after the fabricated TPA data was removed on 2026-11-11 there
 * were no memberships left at all, so every member got the same bare 404 —
 * indistinguishable from a bug, and silent about what would fix it.
 *
 * Two things were wrong with that. A member whose cover is recorded as a
 * policy member rather than a TPA membership has a card and was not being
 * shown it. And a member whose employer has submitted an enrolment that the
 * TPA desk has not yet approved is in a waiting state, not an error state, and
 * saying so is the difference between "something is broken" and "your
 * insurer is still processing this".
 *
 * Sources are tried in order of authority: the TPA membership is the
 * administrator's own record, so it wins over the policy roster.
 */
import { QueryTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import tpaClaimsLifecycleService from './tpa-claims-lifecycle.service.js';

export const ECARD_REASON = {
  PENDING_APPROVAL: 'ECARD_PENDING_APPROVAL',
  NOT_LINKED: 'ECARD_NOT_LINKED',
  NO_INSURANCE: 'ECARD_NO_INSURANCE',
};

const MISSING_SCHEMA = ['42703', '42P01'];
const errorCode = (error) => error?.original?.code || error?.parent?.code || error?.code;

/** A missing table means no cover of that kind on record, not an error page. */
const tolerateMissingSchema = async (run, fallback) => {
  try {
    return await run();
  } catch (error) {
    if (MISSING_SCHEMA.includes(errorCode(error))) return fallback;
    throw error;
  }
};

const positiveInt = (value) => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

const money = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Cover recorded against the policy roster rather than a TPA membership.
 *
 * Resolved strictly by userId — the column policy_members was built with — and
 * never by name. Only active membership of an active policy counts: a lapsed
 * policy must not render as a usable card at an admission desk.
 */
const cardFromPolicyRoster = async (userId) =>
  tolerateMissingSchema(async () => {
    const rows = await sequelize.query(
      `SELECT m.id                      AS "memberRowId",
              m."relationship"          AS "relationship",
              m."individualSumInsured"  AS "sumInsured",
              m."sumInsuredUsed"        AS "used",
              m."sumInsuredRemaining"   AS "remaining",
              m."coverageStartDate"     AS "validFrom",
              m."coverageEndDate"       AS "validTill",
              p."policyNumber"          AS "policyNumber",
              p."policyName"            AS "planName",
              p."policyType"            AS "policyType",
              p."sumInsured"            AS "policySumInsured",
              c."companyName"           AS "insurer"
         FROM policy_members m
         JOIN insurance_policies p ON p.id = m."policyId"
         LEFT JOIN insurance_companies c ON c.id = p."insuranceCompanyId"
        WHERE m."userId" = :userId
          AND m."isActive" = true
          AND lower(COALESCE(p.status, 'active')) IN ('active', 'in_force')
          AND (m."coverageEndDate" IS NULL OR m."coverageEndDate" >= CURRENT_DATE)
        ORDER BY m."coverageEndDate" DESC NULLS FIRST, m.id DESC
        LIMIT 1`,
      { replacements: { userId }, type: QueryTypes.SELECT }
    );
    if (!rows.length) return null;

    const row = rows[0];
    const sumInsured = money(row.sumInsured) || money(row.policySumInsured);
    const used = money(row.used);
    return {
      source: 'policy_roster',
      ecard: {
        cardNumber: `POL-${row.policyNumber}-${row.memberRowId}`,
        memberId: String(row.memberRowId),
        policyNumber: row.policyNumber,
        planName: row.planName || row.policyType || 'Health policy',
        insurer: row.insurer || null,
        relation: row.relationship || 'self',
        validFrom: row.validFrom,
        validTill: row.validTill,
        coverageAmount: sumInsured,
        availableBalance: row.remaining === null || row.remaining === undefined
          ? Math.max(sumInsured - used, 0)
          : money(row.remaining),
        dependents: [],
        // No QR. The TPA card's QR resolves through /api/tpa/ecard/verify,
        // which reads tpa_members; a code pointing at a row that does not
        // exist there would fail verification at the hospital desk, which is
        // worse than showing no code at all.
        qrPayload: null,
        verifyUrl: null,
      },
    };
  }, null);

/**
 * An enrolment the employer has submitted and the TPA desk has not decided.
 * This is a waiting state, and the member is told so rather than shown an
 * error they can do nothing about.
 */
const pendingEnrolment = async (userId) =>
  tolerateMissingSchema(async () => {
    const rows = await sequelize.query(
      `SELECT enrollment_number AS "enrollmentNumber",
              corporate_name    AS "corporate",
              policy_number     AS "policyNumber",
              status,
              submitted_at      AS "submittedAt"
         FROM tpa_member_enrollments
        WHERE user_id = :userId
          AND status IN ('submitted', 'query_raised')
        ORDER BY submitted_at DESC NULLS LAST, id DESC
        LIMIT 1`,
      { replacements: { userId }, type: QueryTypes.SELECT }
    );
    return rows.length ? rows[0] : null;
  }, null);

/**
 * The member's card, or why there isn't one.
 *
 * Returns { ecard, source, ... } when a card exists, otherwise
 * { reason, message, ... } naming the state and what resolves it.
 */
export async function resolveMemberCard(userId) {
  const id = positiveInt(userId);
  if (!id) {
    return { reason: ECARD_REASON.NO_INSURANCE, message: 'No insurance is recorded against your account.' };
  }

  const tpaCard = await tpaClaimsLifecycleService.getECardForUser(id);
  if (tpaCard?.ecard) return { ...tpaCard, source: 'tpa_membership' };

  const policyCard = await cardFromPolicyRoster(id);
  if (policyCard) return { success: true, ...policyCard };

  const pending = await pendingEnrolment(id);
  if (pending) {
    return {
      reason: ECARD_REASON.PENDING_APPROVAL,
      message: pending.status === 'query_raised'
        ? 'Your insurer has raised a query on your enrolment. Your HR team can see what is needed.'
        : 'Your employer has submitted your insurance enrolment and your insurer has not confirmed it yet. Your card appears here once they do.',
      enrolment: pending,
    };
  }

  return {
    reason: ECARD_REASON.NOT_LINKED,
    message: 'No insurance membership is linked to your account yet. If your employer provides cover, ask your HR team to add you to the insurance roster.',
  };
}

export default { resolveMemberCard, ECARD_REASON };
