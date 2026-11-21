/**
 * Writes a mapped SmartCRM summary into insurance_policies / policy_members,
 * so the existing policy wallet shows SmartCRM policies without knowing where
 * they came from (ADR-001: reads are projected).
 *
 * Rules the SQL enforces, not the caller:
 *   - Projected rows carry source_system = 'smartcrm' and a source_ref that
 *     namespaces SmartCRM's ids by tenant and corporate, so two brokers'
 *     policy #12 never meet. Rows Mediqzy owns are never touched.
 *   - A member row is only ever updated for the family it already belongs to
 *     (primaryMemberUserId). If SmartCRM's member id is already held under a
 *     different Mediqzy user, the whole refresh is rolled back — that is two
 *     people claiming one membership, and neither should see the other's.
 *   - Members SmartCRM stops returning are deactivated for this family only.
 *     Policies are shared across a corporate's employees, so a policy row is
 *     never deactivated by one member's refresh.
 *   - The SmartCRM policy number goes in metadata, not "policyNumber": that
 *     column is globally unique, and a broker's number colliding with a row
 *     Mediqzy owns must not fail a member's refresh.
 */
import pool from '../../db/pgPool.js';
import { SOURCE_SYSTEM, SmartCrmError } from './config.js';

const prefixOf = (link) => `${link.source_tenant}:${link.source_corporate}:`;
const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function applyProjection(link, mapped, db = pool) {
  const client = await db.connect();
  const prefix = prefixOf(link);
  const seenMemberRefs = [];
  try {
    await client.query('BEGIN');
    for (const policy of mapped.policies) {
      const policyRef = `${prefix}${policy.id}`;
      const status = policy.endDate && policy.endDate < new Date().toISOString().slice(0, 10)
        ? 'expired'
        : (['active', 'in_force'].includes(policy.status) ? 'active' : policy.status);
      const metadata = {
        sourcePolicyNumber: policy.policyNumber,
        insurerName: policy.insurer,
        tpaName: policy.tpa,
        sourceContract: mapped.contract,
        knownPolicyType: policy.knownType,
        sourcePolicyType: policy.sourcePolicyType ?? null,
        isPrimary: policy.isPrimary ?? null,
      };
      const { rows: [row] } = await client.query(
        `INSERT INTO insurance_policies
           ("policyName", "policyType", "corporateId", "sumInsured", status,
            "policyStartDate", "policyEndDate", metadata,
            source_system, source_ref, source_synced_at, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, COALESCE($4, 0), $5, $6, $7, $8::jsonb, $9, $10, NOW(), NOW(), NOW())
         ON CONFLICT (source_system, source_ref) WHERE source_system IS NOT NULL
         DO UPDATE SET "policyName" = EXCLUDED."policyName",
                       "policyType" = EXCLUDED."policyType",
                       "sumInsured" = EXCLUDED."sumInsured",
                       status = EXCLUDED.status,
                       "policyStartDate" = EXCLUDED."policyStartDate",
                       "policyEndDate" = EXCLUDED."policyEndDate",
                       metadata = COALESCE(insurance_policies.metadata, '{}'::jsonb) || EXCLUDED.metadata,
                       source_synced_at = NOW(),
                       "updatedAt" = NOW()
           WHERE insurance_policies."corporateId" = EXCLUDED."corporateId"
         RETURNING id`,
        [policy.policyName, policy.policyType, link.corporate_id, policy.sumInsured, status,
          policy.startDate, policy.endDate, JSON.stringify(metadata), SOURCE_SYSTEM, policyRef]
      );
      if (!row) {
        throw new SmartCrmError('POLICY_CONFLICT', 'A projected policy belongs to a different employer.', 409);
      }

      for (const member of policy.members) {
        const memberRef = `${policyRef}:${member.id}`;
        seenMemberRefs.push(memberRef);
        const isSelf = member.relationship === 'self';
        const { rows: [m] } = await client.query(
          `INSERT INTO policy_members
             ("policyId", "userId", "primaryMemberUserId", relationship, "memberName", "dateOfBirth",
              "individualSumInsured", "memberCardNumber", "coverageStartDate", "coverageEndDate",
              "isActive", source_system, source_ref, source_synced_at, "createdAt", "updatedAt",
              "sumInsuredUsed", "sumInsuredRemaining", metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamp, NOW()), $10, TRUE, $11, $12, NOW(), NOW(), NOW(),
                   $13, $14, $15::jsonb)
           ON CONFLICT (source_system, source_ref) WHERE source_system IS NOT NULL
           DO UPDATE SET relationship = EXCLUDED.relationship,
                         "userId" = EXCLUDED."userId",
                         "memberName" = EXCLUDED."memberName",
                         "dateOfBirth" = EXCLUDED."dateOfBirth",
                         "individualSumInsured" = EXCLUDED."individualSumInsured",
                         "memberCardNumber" = EXCLUDED."memberCardNumber",
                         "coverageStartDate" = EXCLUDED."coverageStartDate",
                         "coverageEndDate" = EXCLUDED."coverageEndDate",
                         "isActive" = TRUE,
                         "sumInsuredUsed" = EXCLUDED."sumInsuredUsed",
                         "sumInsuredRemaining" = EXCLUDED."sumInsuredRemaining",
                         metadata = COALESCE(policy_members.metadata, '{}'::jsonb) || EXCLUDED.metadata,
                         source_synced_at = NOW(),
                         "updatedAt" = NOW()
             WHERE policy_members."primaryMemberUserId" = EXCLUDED."primaryMemberUserId"
               AND policy_members."policyId" = EXCLUDED."policyId"
           RETURNING id`,
          [row.id, isSelf ? link.user_id : null, link.user_id, member.relationship, member.name,
            member.dateOfBirth, member.sumInsured, member.cardNumber, member.validFrom || policy.startDate,
            member.validTo || policy.endDate, SOURCE_SYSTEM, memberRef,
            member.sumInsuredUsed ?? null, member.sumInsuredRemaining ?? null,
            JSON.stringify({ sourceRelation: member.sourceRelation ?? null, sourceContract: mapped.contract })]
        );
        if (!m) {
          throw new SmartCrmError('MEMBER_CONFLICT', 'This insurance membership is already linked to another account.', 409);
        }
      }
    }

    const { rowCount: retired } = await client.query(
      `UPDATE policy_members
          SET "isActive" = FALSE, source_synced_at = NOW(), "updatedAt" = NOW()
        WHERE source_system = $1
          AND "primaryMemberUserId" = $2
          AND source_ref LIKE $3 ESCAPE '\\'
          AND COALESCE("isActive", TRUE) = TRUE
          AND NOT (source_ref = ANY($4::text[]))`,
      [SOURCE_SYSTEM, link.user_id, `${escapeLike(prefix)}%`, seenMemberRefs]
    );

    await client.query(
      `UPDATE insurance_member_links
          SET last_synced_at = NOW(), last_error = NULL,
              source_member_id = COALESCE(source_member_id, $2), updated_at = NOW()
        WHERE id = $1`,
      [link.id, mapped.memberId]
    );
    await client.query('COMMIT');
    return { policies: mapped.policies.length, members: seenMemberRefs.length, retired };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error?.code === '23505' && String(error.constraint || '').includes('source_member')) {
      throw new SmartCrmError('MEMBER_CONFLICT', 'This insurance membership is already linked to another account.', 409);
    }
    throw error;
  } finally {
    client.release();
  }
}

/** Hides every projected row for one family from one SmartCRM source. */
export async function retireProjection(link, db = pool) {
  const { rowCount } = await db.query(
    `UPDATE policy_members
        SET "isActive" = FALSE, source_synced_at = NOW(), "updatedAt" = NOW()
      WHERE source_system = $1
        AND "primaryMemberUserId" = $2
        AND source_ref LIKE $3 ESCAPE '\\'
        AND COALESCE("isActive", TRUE) = TRUE`,
    [SOURCE_SYSTEM, link.user_id, `${escapeLike(prefixOf(link))}%`]
  );
  return rowCount;
}

export default { applyProjection, retireProjection };
