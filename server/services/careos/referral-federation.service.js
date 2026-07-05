/**
 * HealthOS Stage 3 — Federated referrals
 */
import pool from '../../db/pgPool.js';
import { up as migrate } from '../../migrations/healthos-phases-2-4.migration.js';
import { appendClinicalEvent } from './clinical-timeline.service.js';
import { logFederationAudit } from './care-federation.service.js';
import { dispatchWebhooks } from './webhook-delivery.service.js';
import { getPatientWorkspace } from '../clinical-workspace.service.js';
import llmProvider from '../ai-brain/llm-provider.js';

let ready = false;
async function ensure() { if (!ready) { await migrate(); ready = true; } }

/**
 * Draft a referral letter from live patient context — review/edit before
 * calling createReferral() with the (possibly edited) clinicalSummary text.
 * Documentation with mandatory physician review before it's sent, same NOT
 * SaMD classification as the discharge-summary and shift-handover drafters.
 */
export async function generateReferralLetter({ patientId, organizationId, toOrgName, reason, urgency = 'routine' }) {
  const ws = await getPatientWorkspace(patientId, organizationId).catch(() => null);
  const fallback = `Referral for ${ws?.patient?.name || `patient #${patientId}`}.\nReason: ${reason || 'See clinical notes.'}\nUrgency: ${urgency}.\n\nThis is a draft referral letter. Please review and edit before sending.`;

  if (!ws) return { text: fallback, aiGenerated: false, model: null };

  try {
    const llm = await llmProvider.chat({
      messages: [
        {
          role: 'system',
          content: `You are drafting a referral letter from one clinician to another — this is a DRAFT for physician review, not a final document. Write a concise, professional letter covering: reason for referral, relevant clinical history, current medications/allergies, recent vitals/labs of note, and what's being requested of the receiving clinician. Do not invent facts not present in the provided data. End with "This is a draft referral letter. Please review and edit before sending."`,
        },
        {
          role: 'user',
          content: `Referring reason: ${reason || 'Not specified'}\nUrgency: ${urgency}\nReferred to: ${toOrgName || 'receiving organization'}\nPatient context: ${JSON.stringify(ws)}`,
        },
      ],
      temperature: 0.2,
      maxTokens: 700,
      skipCache: true,
    });
    const text = (llm.content || '').trim();
    if (!text) throw new Error('empty LLM response');
    return { text, aiGenerated: true, model: llm.model || llm.provider || 'llm' };
  } catch (err) {
    console.warn('[referral-federation] LLM letter draft failed, falling back to template:', err.message);
    return { text: fallback, aiGenerated: false, model: null };
  }
}

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

export default { createReferral, acceptReferral, listReferrals, generateReferralLetter };
