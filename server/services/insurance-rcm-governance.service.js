import crypto from 'crypto';
import pool from '../db/pgPool.js';
import { withRlsTransaction } from '../middleware/rls-context.middleware.js';
import eraService from './hospital-era.service.js';

const PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);
const WORK_STATUSES = new Set(['open', 'in_review', 'appeal_drafted', 'appealed', 'resolved', 'closed']);

export async function listDenialReasonCodes({ payerName, active = true } = {}) {
  const { rows } = await pool.query(
    `SELECT * FROM insurance_denial_reason_codes
      WHERE ($1::text IS NULL OR payer_name IS NULL OR payer_name = $1)
        AND ($2::boolean IS NULL OR active = $2)
      ORDER BY payer_name NULLS FIRST, code`, [payerName || null, active == null ? null : Boolean(active)]);
  return rows;
}

export async function upsertDenialReasonCode(input) {
  const code = String(input.code || '').trim().toUpperCase();
  const description = String(input.description || '').trim();
  if (!code || code.length > 40 || !description || description.length > 2000) throw new Error('A valid denial code and description are required');
  const payerName = input.payerName ? String(input.payerName).trim().slice(0, 200) : null;
  const category = String(input.category || 'other').trim().slice(0, 80) || 'other';
  const days = input.defaultAppealDays == null ? null : Number(input.defaultAppealDays);
  if (days != null && (!Number.isInteger(days) || days < 1 || days > 365)) throw new Error('defaultAppealDays must be between 1 and 365');
  const { rows } = await pool.query(
    `INSERT INTO insurance_denial_reason_codes (payer_name, code, category, description, default_appeal_days, active)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (COALESCE(payer_name, ''), code) DO UPDATE SET category = EXCLUDED.category, description = EXCLUDED.description, default_appeal_days = EXCLUDED.default_appeal_days, active = EXCLUDED.active, updated_at = now()
     RETURNING *`, [payerName, code, category, description, days, input.active !== false]);
  return rows[0];
}

export async function createDenialWorkItem({ denialId, hospitalId, payerName, denialCode, priority = 'normal' }) {
  const selectedPriority = PRIORITIES.has(priority) ? priority : 'normal';
  const reason = await pool.query(
    `SELECT default_appeal_days FROM insurance_denial_reason_codes
      WHERE code = $1 AND active AND (payer_name = $2 OR payer_name IS NULL)
      ORDER BY payer_name NULLS LAST LIMIT 1`, [denialCode || '', payerName || null]);
  const days = reason.rows[0]?.default_appeal_days || null;
  const { rows } = await pool.query(
    `INSERT INTO claim_denial_work_items (denial_id, hospital_id, priority, appeal_deadline_at)
     VALUES ($1,$2,$3,CASE WHEN $4::int IS NULL THEN NULL ELSE now() + ($4::text || ' days')::interval END)
     ON CONFLICT (denial_id) DO UPDATE SET priority = EXCLUDED.priority, updated_at = now()
     RETURNING *`, [denialId, hospitalId, selectedPriority, days]);
  return rows[0];
}

export async function listDenialWorkQueue(hospitalId, { status, ownerUserId, limit = 100 } = {}) {
  const lim = Math.max(1, Math.min(200, Number(limit) || 100));
  const { rows } = await pool.query(
    `SELECT w.*, d.claim_number, d.denial_code, d.denial_reason, d.denied_amount, d.created_at AS denied_at,
            COALESCE(u."firstName" || ' ' || u."lastName", '') AS owner_name
       FROM claim_denial_work_items w JOIN claim_denials d ON d.id = w.denial_id
       LEFT JOIN users u ON u.id = w.owner_user_id
      WHERE w.hospital_id = $1 AND ($2::text IS NULL OR w.status = $2) AND ($3::int IS NULL OR w.owner_user_id = $3)
      ORDER BY CASE w.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END, w.appeal_deadline_at NULLS LAST, w.created_at
      LIMIT $4`, [hospitalId, status || null, ownerUserId ? Number(ownerUserId) : null, lim]);
  return rows;
}

export async function updateDenialWorkItem(hospitalId, id, patch) {
  const status = patch.status ? String(patch.status) : null;
  const priority = patch.priority ? String(patch.priority) : null;
  if (status && !WORK_STATUSES.has(status)) throw new Error('Invalid work-item status');
  if (priority && !PRIORITIES.has(priority)) throw new Error('Invalid priority');
  const owner = patch.ownerUserId == null ? null : Number(patch.ownerUserId);
  if (patch.ownerUserId != null && (!Number.isInteger(owner) || owner < 1)) throw new Error('Invalid ownerUserId');
  const { rows } = await pool.query(
    `UPDATE claim_denial_work_items SET owner_user_id = COALESCE($1, owner_user_id), status = COALESCE($2, status), priority = COALESCE($3, priority),
       appeal_submitted_at = CASE WHEN $2 = 'appealed' THEN now() ELSE appeal_submitted_at END, last_action_at = now(), updated_at = now()
      WHERE id = $4 AND hospital_id = $5 RETURNING *`, [owner, status, priority, Number(id), hospitalId]);
  if (!rows[0]) throw new Error('Denial work item not found');
  return rows[0];
}

export async function advanceDenialWorkByDenial(denialId, status) {
  await pool.query(
    `UPDATE claim_denial_work_items SET status = $1, appeal_submitted_at = CASE WHEN $1 = 'appealed' THEN now() ELSE appeal_submitted_at END,
       last_action_at = now(), updated_at = now() WHERE denial_id = $2`, [status, denialId]);
}

export async function importEraBatch(hospitalId, rows, { sourceName = 'api', actor } = {}) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('At least one remittance row is required');
  if (rows.length > 1000) throw new Error('A batch may contain at most 1000 rows');
  const digest = crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  const inserted = await pool.query(
    `INSERT INTO era_import_batches (hospital_id, source_name, source_digest, imported_by_user_id, status, row_count)
     VALUES ($1,$2,$3,$4,'processing',$5) ON CONFLICT (hospital_id, source_digest) DO NOTHING RETURNING *`,
    [hospitalId, String(sourceName).slice(0, 200), digest, actor?.id || null, rows.length]);
  if (!inserted.rows[0]) {
    const existing = await pool.query(`SELECT * FROM era_import_batches WHERE hospital_id = $1 AND source_digest = $2`, [hospitalId, digest]);
    return { duplicate: true, batch: existing.rows[0], results: [] };
  }
  const batch = inserted.rows[0];
  await Promise.all(rows.map((row, index) => pool.query(
    `INSERT INTO era_import_rows (batch_id, row_number, claim_number, raw_row) VALUES ($1,$2,$3,$4::jsonb)`,
    [batch.id, index + 1, row.claimNumber || null, JSON.stringify(row)])));
  const results = [];
  for (let index = 0; index < rows.length; index += 1) {
    try {
      const posted = await eraService.postEraRemittance(hospitalId, rows[index], actor);
      await pool.query(`UPDATE era_import_rows SET status = 'posted', era_remittance_id = $1 WHERE batch_id = $2 AND row_number = $3`, [posted.eraId, batch.id, index + 1]);
      results.push({ rowNumber: index + 1, success: true, ...posted });
    } catch (error) {
      await pool.query(`UPDATE era_import_rows SET status = 'failed', error_message = $1 WHERE batch_id = $2 AND row_number = $3`, [error.message.slice(0, 2000), batch.id, index + 1]);
      results.push({ rowNumber: index + 1, success: false, message: error.message });
    }
  }
  const postedCount = results.filter((r) => r.success).length;
  const failedCount = results.length - postedCount;
  const done = await pool.query(
    `UPDATE era_import_batches SET status = $1, posted_count = $2, failed_count = $3, completed_at = now() WHERE id = $4 RETURNING *`,
    [failedCount === 0 ? 'processed' : postedCount ? 'partial' : 'failed', postedCount, failedCount, batch.id]);
  return { duplicate: false, batch: done.rows[0], results };
}

export async function payerRcmAnalytics(hospitalId, actor, { from, to } = {}) {
  const fromDate = from ? new Date(from) : new Date(Date.now() - 90 * 86400000);
  const toDate = to ? new Date(to) : new Date();
  if (Number.isNaN(fromDate.valueOf()) || Number.isNaN(toDate.valueOf()) || fromDate >= toDate) throw new Error('Invalid reporting period');
  return withRlsTransaction(pool, { orgId: hospitalId, userId: actor?.id || 0, isPlatformAdmin: false }, async (client) => {
    const { rows } = await client.query(
      `WITH claims AS (
        SELECT c.*, COALESCE(NULLIF(c.insurance_provider, ''), NULLIF(c.scheme_name, ''), 'Unassigned') AS payer,
          GREATEST(0, COALESCE(c.claim_amount, 0) - COALESCE(c.settled_amount, 0)) AS outstanding,
          GREATEST(0, CURRENT_DATE - COALESCE(c.submitted_date, c.created_at::date)) AS age_days
        FROM insurance_claims c WHERE c.hospital_id = $1 AND c.created_at >= $2 AND c.created_at < $3
      )
      SELECT payer, COUNT(*)::int AS claim_count, COALESCE(SUM(claim_amount),0) AS claimed_amount, COALESCE(SUM(settled_amount),0) AS collected_amount,
        COALESCE(SUM(outstanding),0) AS outstanding_amount,
        COUNT(*) FILTER (WHERE documents_status = 'complete' AND status NOT IN ('rejected','query'))::int AS clean_claim_count,
        COUNT(*) FILTER (WHERE status = 'rejected')::int AS denied_claim_count,
        COALESCE(SUM(outstanding) FILTER (WHERE age_days <= 30),0) AS ar_0_30,
        COALESCE(SUM(outstanding) FILTER (WHERE age_days BETWEEN 31 AND 60),0) AS ar_31_60,
        COALESCE(SUM(outstanding) FILTER (WHERE age_days BETWEEN 61 AND 90),0) AS ar_61_90,
        COALESCE(SUM(outstanding) FILTER (WHERE age_days > 90),0) AS ar_90_plus
      FROM claims GROUP BY payer ORDER BY outstanding_amount DESC, payer`, [hospitalId, fromDate.toISOString(), toDate.toISOString()]);
    return { period: { from: fromDate.toISOString(), to: toDate.toISOString() }, payers: rows.map((row) => ({
      ...row, cleanClaimRate: row.claim_count ? Number(row.clean_claim_count) / Number(row.claim_count) : 0,
      denialRate: row.claim_count ? Number(row.denied_claim_count) / Number(row.claim_count) : 0,
      collectionRate: Number(row.claimed_amount) ? Number(row.collected_amount) / Number(row.claimed_amount) : 0,
    })) };
  });
}

export default { listDenialReasonCodes, upsertDenialReasonCode, createDenialWorkItem, listDenialWorkQueue, updateDenialWorkItem, advanceDenialWorkByDenial, importEraBatch, payerRcmAnalytics };
