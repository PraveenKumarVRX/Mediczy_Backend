/**
 * report-delivery.service.js  (WP3 Stage F — durable CRM delivery of verified observations)
 * =========================================================================================
 * Builds the frozen observation contract for a report from its VERIFIED observations, records it in
 * the durable outbox with a stable event_id, and delivers it to an external CRM webhook with an
 * at-least-once, HMAC-signed, retried POST. Corrections (re-verify/reject) enqueue a new revision.
 *
 * Inert until CRM_WEBHOOK_URL is set: enqueue still records the outbox row, so when the CRM is
 * configured later the backlog delivers. The receiver dedupes on event_id.
 */

import { createHmac } from 'node:crypto';
import pool from '../db/pgPool.js';

const MAX_ATTEMPTS = 8;
const webhookUrl = () => (process.env.CRM_WEBHOOK_URL || '').trim();
const webhookSecret = () => process.env.CRM_WEBHOOK_SECRET || '';
const sha256 = (s) => createHmac('sha256', 'report-event').update(s).digest('hex');
const backoffMs = (attempts) => Math.min(2 ** attempts * 60000, 6 * 3600000); // 1min → 6h

/** Build the frozen contract payload from a report's VERIFIED observations. */
export async function buildDocumentPayload(reportId, revision, db = pool) {
  const { rows } = await db.query(
    `SELECT subject_uid, subject_kind, organization_uid, patient_uid, "reportDate",
            "testName", canonical_name, loinc_code, "value", "numericValue", unit, "referenceRange",
            flag, "isAbnormal", confidence, page, source_text
       FROM lab_results
      WHERE "reportId" = $1 AND verification_status = 'verified'
      ORDER BY id`, [reportId]);
  if (!rows.length) return null;
  const first = rows[0];
  return {
    event_id: sha256(`${reportId}:${revision}`),
    revision,
    document_id: reportId,
    subject_uid: first.subject_uid,
    subject_kind: first.subject_kind,
    organization_uid: first.organization_uid,
    report_date: first.reportDate ? new Date(first.reportDate).toISOString().slice(0, 10) : null,
    processing_status: 'verified',
    observations: rows.map((r) => ({
      raw_name: r.testName, canonical_name: r.canonical_name, loinc_code: r.loinc_code,
      raw_value: r.value, typed_value: r.numericValue != null ? Number(r.numericValue) : null,
      unit: r.unit, reference_range_source: r.referenceRange, flag_source: r.flag, abnormal: r.isAbnormal,
      confidence: r.confidence != null ? Number(r.confidence) : null, page: r.page, source_text: r.source_text,
    })),
  };
}

/** Record a delivery event for a report (new revision each call → corrections are explicit events). */
export async function enqueueDocumentDelivery(reportId, db = pool) {
  const { rows } = await db.query(`SELECT COALESCE(MAX(revision),0)::int AS r FROM report_delivery_outbox WHERE report_id=$1`, [reportId]);
  const revision = rows[0].r + 1;
  const payload = await buildDocumentPayload(reportId, revision, db);
  if (!payload) return null; // nothing verified yet
  await db.query(
    `INSERT INTO report_delivery_outbox (event_id, report_id, subject_uid, organization_uid, revision, payload)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT (event_id) DO NOTHING`,
    [payload.event_id, reportId, payload.subject_uid, payload.organization_uid, revision, JSON.stringify(payload)]);
  return payload.event_id;
}

/** Deliver due pending events. Safe to call repeatedly (cron). No-op when no webhook configured. */
export async function deliverPending(limit = 25, db = pool) {
  const url = webhookUrl();
  const { rows } = await db.query(
    `SELECT id, event_id, payload, attempts FROM report_delivery_outbox
      WHERE status='pending' AND next_attempt_at <= NOW() ORDER BY next_attempt_at LIMIT $1`, [limit]);
  if (!rows.length) return { attempted: 0, delivered: 0, skipped: 0 };
  if (!url) return { attempted: 0, delivered: 0, skipped: rows.length, reason: 'CRM_WEBHOOK_URL unset' };

  let delivered = 0;
  for (const row of rows) {
    const body = JSON.stringify(row.payload);
    const sig = webhookSecret() ? createHmac('sha256', webhookSecret()).update(body).digest('hex') : '';
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Mediqzy-Event': row.event_id, ...(sig ? { 'X-Mediqzy-Signature': `sha256=${sig}` } : {}) },
        body, signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        await db.query(`UPDATE report_delivery_outbox SET status='delivered', delivered_at=NOW(), updated_at=NOW() WHERE id=$1`, [row.id]);
        delivered++;
      } else { throw new Error(`HTTP ${res.status}`); }
    } catch (e) {
      const attempts = row.attempts + 1;
      const failed = attempts >= MAX_ATTEMPTS;
      await db.query(
        `UPDATE report_delivery_outbox SET attempts=$2, last_error=$3, status=$4,
            next_attempt_at = NOW() + ($5 || ' milliseconds')::interval, updated_at=NOW() WHERE id=$1`,
        [row.id, attempts, String(e.message).slice(0, 300), failed ? 'failed' : 'pending', backoffMs(attempts)]);
    }
  }
  return { attempted: rows.length, delivered, skipped: 0 };
}

export default { buildDocumentPayload, enqueueDocumentDelivery, deliverPending };
