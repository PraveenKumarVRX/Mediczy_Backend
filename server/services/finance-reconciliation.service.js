/**
 * Ledger reconciliation (audit FIN-09).
 *
 * Billing posts to the general ledger best-effort, so a failed post (missing chart of accounts, closed period, an
 * outage) must not be permanent or invisible. This finds billing documents that have no journal entry — counting only
 * documents created after finance was enabled for the tenant, so pre-existing history is not flagged — and re-posts
 * them. Re-posting is safe to repeat: every adapter is idempotent on the source document.
 */
import pool from '../db/pgPool.js';
import { withRlsTransaction } from '../middleware/rls-context.middleware.js';
import glPosting from './finance-gl-posting.service.js';

const scoped = (orgId, work) => withRlsTransaction(pool, { orgId, userId: 0, isPlatformAdmin: false }, work);

// One query per document type. `j.source_id = <id>::text` is exactly how each adapter keys its entry.
const SOURCES = {
  invoice: {
    sql: `SELECT i.* FROM hospital_invoices i
            LEFT JOIN finance_journal_entries j ON j.organization_id = i.hospital_id AND j.source_type = 'invoice' AND j.source_id = i.id::text
           WHERE i.hospital_id = $1 AND i.voided_at IS NULL AND i.total_amount > 0 AND i.created_at >= $2 AND j.id IS NULL
           ORDER BY i.id LIMIT $3`,
    post: (org, row, actor) => glPosting.postInvoice(org, row, actor),
  },
  payment: {
    sql: `SELECT p.* FROM hospital_payments p
            LEFT JOIN finance_journal_entries j ON j.organization_id = p.hospital_id AND j.source_type = 'payment' AND j.source_id = p.id::text
           WHERE p.hospital_id = $1 AND p.voided_at IS NULL AND p.status NOT IN ('voided','credit_pending') AND p.amount > 0
             AND p.created_at >= $2 AND j.id IS NULL
           ORDER BY p.id LIMIT $3`,
    post: (org, row, actor) => glPosting.postPayment(org, row, actor),
  },
  refund: {
    sql: `SELECT r.id AS "refundId", r.payment_id AS "paymentId", r.amount, r.created_at AS "refundedAt", p.payment_method AS "paymentMethod"
            FROM hospital_payment_refunds r JOIN hospital_payments p ON p.id = r.payment_id
            LEFT JOIN finance_journal_entries j ON j.organization_id = r.hospital_id AND j.source_type = 'refund' AND j.source_id = r.id::text
           WHERE r.hospital_id = $1 AND r.status = 'completed' AND r.created_at >= $2 AND j.id IS NULL
           ORDER BY r.id LIMIT $3`,
    post: (org, row, actor) => glPosting.postRefund(org, row, actor),
  },
  adjustment: {
    sql: `SELECT a.id, a.invoice_id AS "invoiceId", a.adjustment_type AS "adjustmentType", a.amount, a.created_at
            FROM hospital_bill_adjustments a
            LEFT JOIN finance_journal_entries j ON j.organization_id = a.hospital_id AND j.source_type = 'adjustment' AND j.source_id = a.id::text
           WHERE a.hospital_id = $1 AND a.created_at >= $2 AND j.id IS NULL
           ORDER BY a.id LIMIT $3`,
    post: (org, row, actor) => glPosting.postAdjustment(org, row, actor),
  },
};

/** When finance was switched on for this tenant, or null if it never was. */
async function financeEnabledSince(orgId) {
  return scoped(orgId, async (client) => {
    const { rows } = await client.query(
      `SELECT MIN(granted_at) AS since FROM tenant_entitlements WHERE organization_id = $1 AND module_id = 'accounts_finance' AND is_active = TRUE`, [orgId]);
    return rows[0]?.since || null;
  });
}

async function collect(orgId, since, limit) {
  const found = {};
  for (const [type, src] of Object.entries(SOURCES)) {
    found[type] = await scoped(orgId, async (client) => (await client.query(src.sql, [orgId, since, limit])).rows);
  }
  return found;
}

export async function reconcile(orgId, { limit = 200 } = {}) {
  const since = await financeEnabledSince(orgId);
  if (!since) return { enabled: false, message: 'Finance is not enabled for this organization' };
  const capped = Math.min(Math.max(Number(limit) || 200, 1), 1000);
  const missing = await collect(orgId, since, capped);
  const counts = Object.fromEntries(Object.entries(missing).map(([k, v]) => [k, v.length]));
  return {
    enabled: true, since,
    unposted: counts,
    totalUnposted: Object.values(counts).reduce((a, b) => a + b, 0),
    truncated: Object.values(counts).some((n) => n >= capped),
    sample: Object.fromEntries(Object.entries(missing).map(([k, v]) => [k, v.slice(0, 20).map((r) => r.id ?? r.refundId)])),
  };
}

/** Re-posts every document found by `reconcile`. Order matters: invoices first, so receivables exist for payments. */
export async function repostMissing(orgId, actorId, { limit = 200 } = {}) {
  const since = await financeEnabledSince(orgId);
  if (!since) return { enabled: false, message: 'Finance is not enabled for this organization' };
  const capped = Math.min(Math.max(Number(limit) || 200, 1), 1000);
  const missing = await collect(orgId, since, capped);
  const summary = {};
  for (const type of ['invoice', 'payment', 'adjustment', 'refund']) {
    summary[type] = { attempted: 0, posted: 0, failed: 0, errors: [] };
    for (const row of missing[type]) {
      summary[type].attempted += 1;
      const res = await SOURCES[type].post(orgId, row, actorId);
      if (res.posted) summary[type].posted += 1;
      else { summary[type].failed += 1; if (summary[type].errors.length < 5) summary[type].errors.push({ id: row.id ?? row.refundId, code: res.code, error: res.error }); }
    }
  }
  return { enabled: true, since, summary };
}

export default { reconcile, repostMissing };
