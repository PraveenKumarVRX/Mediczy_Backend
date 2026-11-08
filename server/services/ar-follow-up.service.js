/**
 * AR follow-up / collections work-queue (RCM Phase 2).
 *
 * A worklist for AR executives, distinct from the denial work-queue. Items arise
 * from short-paid ERA remittances, from the aging-escalation cron, and manually.
 *
 * ar_follow_up_items carries no RLS, so list/update run on the plain pool scoped
 * by hospital_id (mirrors listDenialWorkQueue). The aging sweep reads the
 * RLS-protected insurance_claims via withRlsTransaction, per hospital.
 */
import pool from './../db/pgPool.js';
import { withRlsTransaction } from '../middleware/rls-context.middleware.js';
import { tick, tickError, beginJob } from '../utils/cronRegistry.js';

const PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);
const STATUSES = new Set(['open', 'in_progress', 'snoozed', 'resolved', 'closed']);
const CATEGORIES = new Set(['ar_followup', 'short_pay', 'aging']);

// Default SLA (hours) and priority by work-item kind / aging bucket.
const SLA_HOURS = { short_pay: 72, '61-90': 168, '91-180': 72, '180+': 24, ar_followup: 120 };
const BUCKET_PRIORITY = { '61-90': 'normal', '91-180': 'high', '180+': 'urgent' };

function agingBucket(ageDays) {
  if (ageDays <= 30) return '0-30';
  if (ageDays <= 60) return '31-60';
  if (ageDays <= 90) return '61-90';
  if (ageDays <= 180) return '91-180';
  return '180+';
}

function historyEntry(action, detail, actor) {
  return { at: new Date().toISOString(), action, detail: detail || null, by: actor?.name || actor?.id || 'system' };
}

/**
 * Create (or upsert) an AR follow-up item. Short-pay items dedupe on the source
 * remittance; aging items dedupe on (claim_id, category) while still open.
 */
export async function createArFollowUpItem(input) {
  const {
    hospitalId, claimId = null, eraRemittanceId = null, payerName = null,
    category = 'ar_followup', agingBucket: bucket = null, outstandingAmount = 0,
    priority, slaHours, nextActionAt = null, createdByUserId = null, note = null, actor,
  } = input || {};
  if (!hospitalId) throw new Error('hospitalId is required');
  const cat = CATEGORIES.has(category) ? category : 'ar_followup';
  const pri = PRIORITIES.has(priority) ? priority : (BUCKET_PRIORITY[bucket] || (cat === 'short_pay' ? 'high' : 'normal'));
  const sla = Number.isFinite(Number(slaHours)) ? Number(slaHours) : (SLA_HOURS[cat === 'aging' ? bucket : cat] || SLA_HOURS.ar_followup);
  const history = JSON.stringify([historyEntry('created', note || `${cat} item`, actor)]);

  // ON CONFLICT targets the two partial unique indexes; DO NOTHING keeps the
  // original item (idempotent re-import / re-run). Returns null when deduped.
  const conflictClause = eraRemittanceId
    ? 'ON CONFLICT (era_remittance_id) WHERE era_remittance_id IS NOT NULL DO NOTHING'
    : (claimId ? 'ON CONFLICT (claim_id, category) WHERE claim_id IS NOT NULL AND status IN (\'open\',\'in_progress\',\'snoozed\') DO NOTHING' : '');

  const { rows } = await pool.query(
    `INSERT INTO ar_follow_up_items
       (hospital_id, claim_id, era_remittance_id, payer_name, category, aging_bucket,
        outstanding_amount, priority, status, sla_due_at, next_action_at, history, created_by_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'open', now() + ($9::text || ' hours')::interval, $10, $11::jsonb, $12)
     ${conflictClause}
     RETURNING *`,
    [hospitalId, claimId, eraRemittanceId, payerName, cat, bucket,
     Math.round(Number(outstandingAmount || 0) * 100) / 100, pri, String(sla), nextActionAt, history, createdByUserId]);
  return rows[0] || null;
}

// Convenience hook for ERA posting: one work-item per short-paid remittance.
export async function createFromShortPay({ hospitalId, eraRemittanceId, claimId, payerName, shortfall }) {
  if (!hospitalId || !eraRemittanceId) return null;
  return createArFollowUpItem({
    hospitalId, eraRemittanceId, claimId: claimId || null, payerName,
    category: 'short_pay', outstandingAmount: shortfall, priority: 'high',
    note: `Underpayment of ${Number(shortfall || 0).toFixed(2)} detected at ERA posting`,
  });
}

export async function listArWorkQueue(hospitalId, { status, ownerUserId, category, bucket, payerName, limit = 100 } = {}) {
  const lim = Math.max(1, Math.min(500, Number(limit) || 100));
  const { rows } = await pool.query(
    `SELECT a.*, c.claim_number, c.claim_amount, c.settled_amount, c.status AS claim_status, c.patient_id,
            COALESCE(u."firstName" || ' ' || u."lastName", '') AS owner_name
       FROM ar_follow_up_items a
       LEFT JOIN insurance_claims c ON c.id = a.claim_id
       LEFT JOIN users u ON u.id = a.owner_user_id
      WHERE a.hospital_id = $1
        AND ($2::text IS NULL OR a.status = $2)
        AND ($3::int  IS NULL OR a.owner_user_id = $3)
        AND ($4::text IS NULL OR a.category = $4)
        AND ($5::text IS NULL OR a.aging_bucket = $5)
        AND ($6::text IS NULL OR a.payer_name = $6)
      ORDER BY CASE a.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
               a.sla_due_at NULLS LAST, a.outstanding_amount DESC
      LIMIT $7`,
    [hospitalId, status || null, ownerUserId ? Number(ownerUserId) : null, category || null, bucket || null, payerName || null, lim]);
  const openCount = rows.filter((r) => ['open', 'in_progress', 'snoozed'].includes(r.status)).length;
  const totalOutstanding = rows.reduce((s, r) => s + Number(r.outstanding_amount || 0), 0);
  return { count: rows.length, openCount, totalOutstanding: Math.round(totalOutstanding * 100) / 100, items: rows };
}

export async function updateArFollowUpItem(hospitalId, id, patch = {}, actor) {
  const status = patch.status ? String(patch.status) : null;
  const priority = patch.priority ? String(patch.priority) : null;
  if (status && !STATUSES.has(status)) throw new Error('Invalid work-item status');
  if (priority && !PRIORITIES.has(priority)) throw new Error('Invalid priority');
  const owner = patch.ownerUserId == null ? null : Number(patch.ownerUserId);
  if (patch.ownerUserId != null && (!Number.isInteger(owner) || owner < 1)) throw new Error('Invalid ownerUserId');
  const nextActionAt = patch.nextActionAt ? new Date(patch.nextActionAt).toISOString() : null;
  const resolutionNote = patch.resolutionNote ? String(patch.resolutionNote).slice(0, 2000) : null;
  const histNote = patch.note ? String(patch.note).slice(0, 2000) : null;
  const entry = JSON.stringify(historyEntry(status ? `status:${status}` : 'update', histNote || resolutionNote, actor));

  const { rows } = await pool.query(
    `UPDATE ar_follow_up_items
        SET owner_user_id   = COALESCE($1, owner_user_id),
            status          = COALESCE($2, status),
            priority        = COALESCE($3, priority),
            next_action_at  = COALESCE($4::timestamptz, next_action_at),
            resolution_note = COALESCE($5, resolution_note),
            last_contact_at = CASE WHEN $6 THEN now() ELSE last_contact_at END,
            history         = history || $7::jsonb,
            updated_at      = now()
      WHERE id = $8 AND hospital_id = $9
      RETURNING *`,
    [owner, status, priority, nextActionAt, resolutionNote, Boolean(patch.contacted), entry, Number(id), hospitalId]);
  if (!rows[0]) throw new Error('AR work item not found');
  return rows[0];
}

/**
 * Cron: (1) open aging work-items for old, materially-outstanding claims, and
 * (2) escalate overdue SLA items by one priority step. Idempotent via the
 * partial unique indexes.
 */
export async function runArEscalation({ minOutstanding = 1000 } = {}) {
  const JOB = 'ar_follow_up_escalation';
  if (!(await beginJob(JOB))) return { skipped: true };
  try {
    const hospitals = await pool.query(`SELECT id FROM hospitals WHERE is_active IS NOT FALSE LIMIT 500`);
    let created = 0;
    let escalated = 0;
    for (const h of hospitals.rows) {
      const hospitalId = h.id;
      // (1) Aging sweep — needs RLS context to read insurance_claims.
      const aged = await withRlsTransaction(pool, { orgId: hospitalId, userId: 0, isPlatformAdmin: false }, async (client) => {
        const { rows } = await client.query(
          `SELECT c.id AS claim_id,
                  COALESCE(NULLIF(c.insurance_provider,''), NULLIF(c.scheme_name,''), 'Unassigned') AS payer,
                  GREATEST(0, COALESCE(c.claim_amount,0) - COALESCE(c.settled_amount,0)) AS outstanding,
                  GREATEST(0, CURRENT_DATE - COALESCE(c.submitted_date, c.created_at::date)) AS age_days
             FROM insurance_claims c
            WHERE c.hospital_id = $1
              AND c.status NOT IN ('paid','rejected','closed','denied')
              AND GREATEST(0, COALESCE(c.claim_amount,0) - COALESCE(c.settled_amount,0)) >= $2
              AND GREATEST(0, CURRENT_DATE - COALESCE(c.submitted_date, c.created_at::date)) > 60
            ORDER BY outstanding DESC LIMIT 500`, [hospitalId, minOutstanding]);
        return rows;
      });
      for (const row of aged) {
        const bucket = agingBucket(Number(row.age_days));
        const made = await createArFollowUpItem({
          hospitalId, claimId: row.claim_id, payerName: row.payer, category: 'aging',
          agingBucket: bucket, outstandingAmount: row.outstanding,
          note: `Auto-created: claim aged ${row.age_days}d in ${bucket}`,
        });
        if (made) created += 1;
      }
      // (2) SLA escalation — bump priority on overdue, still-open items.
      const esc = await pool.query(
        `UPDATE ar_follow_up_items
            SET priority = CASE priority WHEN 'low' THEN 'normal' WHEN 'normal' THEN 'high' ELSE 'urgent' END,
                history = history || jsonb_build_object('at', now(), 'action', 'sla_escalated', 'by', 'system'),
                updated_at = now()
          WHERE hospital_id = $1 AND status IN ('open','in_progress')
            AND sla_due_at IS NOT NULL AND sla_due_at < now()
            AND priority <> 'urgent'
          RETURNING id`, [hospitalId]);
      escalated += esc.rowCount;
    }
    const result = { hospitals: hospitals.rowCount, created, escalated };
    tick(JOB, result);
    return result;
  } catch (e) {
    tickError(JOB, e);
    throw e;
  }
}

export default { createArFollowUpItem, createFromShortPay, listArWorkQueue, updateArFollowUpItem, runArEscalation };
