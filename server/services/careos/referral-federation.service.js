/**
 * HealthOS Stage 3 — Federated referrals
 */
import pool from '../../db/pgPool.js';
import { up as migrate } from '../../migrations/healthos-phases-2-4.migration.js';
import { appendClinicalEvent } from './clinical-timeline.service.js';
import { logFederationAudit } from './care-federation.service.js';
import { dispatchWebhooks } from './webhook-delivery.service.js';

let ready = false;
async function ensure() { if (!ready) { await migrate(); ready = true; } }

export async function createReferral({ fromOrgId, toOrgId, patientId, reason, urgency, clinicalSummary, referredBy, passportShareId }) {
  await ensure();
  const { rows } = await pool.query(
    `INSERT INTO healthos_referrals
      (from_org_id, to_org_id, patient_id, passport_share_id, reason, urgency, clinical_summary, referred_by, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending') RETURNING *`,
    [fromOrgId, toOrgId, patientId, passportShareId || null, reason, urgency || 'routine', clinicalSummary, referredBy]
  );
  const ref = rows[0];
  await appendClinicalEvent({
    organizationId: fromOrgId,
    patientId,
    eventType: 'referral',
    title: `Referral to org #${toOrgId}`,
    body: reason,
    actorType: 'doctor', actorId: referredBy,
    severity: urgency === 'urgent' ? 'warning' : 'info',
    metadata: { referralId: ref.id },
  });
  await logFederationAudit({
    actorUserId: referredBy, actorOrgId: fromOrgId,
    action: 'referral_created', resourceType: 'referral', resourceId: String(ref.id), patientId,
  });
  dispatchWebhooks(fromOrgId, 'referral.created', ref).catch(() => {});
  return ref;
}

export async function acceptReferral(referralId, acceptedBy) {
  await ensure();
  const { rows } = await pool.query(
    `UPDATE healthos_referrals SET status = 'accepted', accepted_by = $2, accepted_at = NOW() WHERE id = $1 RETURNING *`,
    [referralId, acceptedBy]
  );
  return rows[0];
}

export async function listReferrals({ orgId, patientId, status, direction = 'both' }) {
  await ensure();
  const params = [];
  let sql = `SELECT r.*, a.display_name AS from_org_name, b.display_name AS to_org_name
    FROM healthos_referrals r
    LEFT JOIN careos_network_orgs a ON a.id = r.from_org_id
    LEFT JOIN careos_network_orgs b ON b.id = r.to_org_id WHERE 1=1`;
  if (patientId) { params.push(patientId); sql += ` AND r.patient_id = $${params.length}`; }
  if (status) { params.push(status); sql += ` AND r.status = $${params.length}`; }
  if (direction === 'outgoing' && orgId) { params.push(orgId); sql += ` AND r.from_org_id = $${params.length}`; }
  if (direction === 'incoming' && orgId) { params.push(orgId); sql += ` AND r.to_org_id = $${params.length}`; }
  sql += ` ORDER BY r.created_at DESC LIMIT 50`;
  const { rows } = await pool.query(sql, params);
  return rows;
}

export default { createReferral, acceptReferral, listReferrals };
