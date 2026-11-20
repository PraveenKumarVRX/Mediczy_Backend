/**
 * Completed health check-ups for a corporate, with their reports — one list for the Team portal
 * (/api/corporate-bookings/checkup-completions) and the corporate HR portal
 * (/api/corporate/checkup-completions). Owner decision 2026-11-20: HR gets full access to view,
 * download and share reports; every HR access is written to audit_logs (is_phi).
 *
 * Rows come from: reports uploaded by Team (corporate_health_reports), lab reports that arrived by
 * email and were matched to the employee (reports with metadata.emailId, linked to the corporate
 * through user_associations; never a member's own uploads), and completed bookings whose
 * report is still awaited (health_checkup_bookings). lab_orders is FORCED RLS, so queries run in
 * the corporate booking context.
 */
import { postgresSequelize } from '../db/postgres-sequelize.js';
import { withCorporateBookingContext } from './corporate-health-checkup-booking.service.js';
import { readStoredReportFile } from './corporate-report-storage-client.js';

const sel = { type: postgresSequelize.QueryTypes.SELECT };
const MAX_LIMIT = 200;

const COMPLETIONS_SQL = `
  WITH rows AS (
    SELECT 'manual' AS source, chr.id AS report_id, chr.employee_id AS user_id,
           COALESCE(chr.checkup_completed_at, chr.report_date::timestamptz) AS checkup_date,
           COALESCE(chr.checkup_type, chr.report_type) AS checkup_type,
           chr.report_name, chr.mime_type, chr.file_size_bytes, chr.created_at AS uploaded_at,
           chr.notified_email, chr.notified_whatsapp, chr.sla_status, chr.report_delivered_at,
           lo.order_number, l.name AS lab_name,
           (chr.s3_key IS NOT NULL OR chr.report_url IS NOT NULL) AS has_file
      FROM corporate_health_reports chr
      LEFT JOIN lab_orders lo ON lo.id = chr.lab_order_id
      LEFT JOIN labs l ON l.id = lo.lab_id
     WHERE chr.corporate_id = :corporateId AND COALESCE(chr.checkup_type, chr.report_type, '') <> 'pre_employment'
    UNION ALL
    SELECT 'email', r.id, r."userId", r."reportDate"::timestamptz, 'annual_health_checkup',
           r."fileName", r."mimeType", r."fileSize", r."createdAt",
           false, true, 'on_time', r."createdAt", NULL, NULL,
           COALESCE((SELECT CASE WHEN COALESCE(r.metadata->>'attachmentId', '') <> ''
                                 THEN bool_or(trim(both '<>' from a->>'contentId') = trim(both '<>' from r.metadata->>'attachmentId'))
                                 ELSE count(*) = 1 END
                       FROM email_inboxes e, jsonb_array_elements(COALESCE(e.attachments::jsonb, '[]'::jsonb)) a
                      WHERE e.id::text = r.metadata->>'emailId' AND a ? 'contentBase64'), false)
      FROM reports r
      JOIN user_associations ua ON ua."userId" = r."userId" AND ua."entityType" = 'corporate' AND ua."entityId" = :corporateId
     WHERE r."reportType" = 'lab' AND r.metadata ? 'emailId'
    UNION ALL
    SELECT 'booking', b.id, b.user_id, b.appointment_date::timestamptz, 'annual_health_checkup',
           NULL, NULL, NULL, NULL, false, false, 'awaiting_report', NULL, b.booking_reference, b.lab_snapshot->>'name', false
      FROM health_checkup_bookings b
     WHERE b.corporate_id = :corporateId AND b.status = 'completed'
       AND NOT EXISTS (SELECT 1 FROM corporate_health_reports c2 WHERE c2.employee_id = b.user_id AND c2.corporate_id = :corporateId
                        AND COALESCE(c2.checkup_completed_at, c2.report_date::timestamptz) >= b.appointment_date::timestamptz - interval '1 day')
  )
  SELECT rows.*, u."firstName" AS first_name, u."lastName" AS last_name, u.email, u."phoneNumber" AS phone,
         ce."employeeId" AS employee_code, ce.department, ce.designation
    FROM rows
    JOIN users u ON u.id = rows.user_id
    LEFT JOIN LATERAL (SELECT "employeeId", department, designation FROM corporate_employees
                        WHERE corporate_id = :corporateId AND "userId" = rows.user_id ORDER BY "isActive" DESC, id DESC LIMIT 1) ce ON true
   WHERE (:search = '' OR concat_ws(' ', u."firstName", u."lastName", u.email, u."phoneNumber", ce."employeeId", ce.department, rows.report_name) ILIKE '%' || :search || '%')
     AND (:from::date IS NULL OR rows.checkup_date >= :from::date)
     AND (:to::date IS NULL OR rows.checkup_date < :to::date + 1)`;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const rowOut = (r) => ({
  key: `${r.source}-${r.report_id}`,
  source: r.source,
  reportId: Number(r.report_id),
  employee: {
    userId: Number(r.user_id),
    name: [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || null,
    employeeId: r.employee_code || null,
    department: r.department || null,
    designation: r.designation || null,
    email: r.email || null,
    phone: r.phone || null,
  },
  checkupDate: r.checkup_date,
  checkupType: r.checkup_type,
  labName: r.lab_name || null,
  orderNumber: r.order_number || null,
  report: r.source === 'booking' ? null : {
    name: r.report_name, mimeType: r.mime_type, sizeBytes: r.file_size_bytes == null ? null : Number(r.file_size_bytes),
    uploadedAt: r.uploaded_at, hasFile: r.has_file, notifiedEmail: !!r.notified_email, notifiedWhatsapp: !!r.notified_whatsapp,
    slaStatus: r.sla_status, deliveredAt: r.report_delivered_at,
  },
  status: r.source === 'booking' ? 'awaiting_report' : 'report_available',
  canShare: r.source === 'manual',
});

/** The list, a page of it and a summary. */
export async function listCheckupCompletions({ corporateId, actorUserId, search = '', from = null, to = null, page = 1, limit = 50 }) {
  const n = Math.min(Math.max(Number(limit) || 50, 1), MAX_LIMIT);
  const p = Math.max(Number(page) || 1, 1);
  const replacements = {
    corporateId, search: String(search || '').trim().slice(0, 80),
    from: ISO.test(String(from || '')) ? from : null, to: ISO.test(String(to || '')) ? to : null,
  };
  return withCorporateBookingContext({ corporateId, bookedByUserId: actorUserId }, async (transaction) => {
    const rows = await postgresSequelize.query(`${COMPLETIONS_SQL} ORDER BY rows.checkup_date DESC NULLS LAST, rows.report_id DESC LIMIT :limit OFFSET :offset`,
      { ...sel, replacements: { ...replacements, limit: n, offset: (p - 1) * n }, transaction });
    const [summary] = await postgresSequelize.query(
      `SELECT count(*)::int AS total, count(DISTINCT user_id)::int AS employees,
              count(*) FILTER (WHERE source <> 'booking')::int AS reports, count(*) FILTER (WHERE source = 'booking')::int AS awaiting_reports
         FROM (${COMPLETIONS_SQL}) s`, { ...sel, replacements, transaction });
    return {
      rows: rows.map(rowOut),
      page: p, limit: n, total: summary.total,
      summary: { employeesCompleted: summary.employees, reports: summary.reports, awaitingReports: summary.awaiting_reports },
    };
  });
}

/**
 * Locate a report file that belongs to this corporate and read it. Returns { name, mimeType,
 * employeeUserId, buffer }, or null when it is not this corporate's report or has no file.
 */
export async function getCorporateReportFile({ corporateId, actorUserId, source, reportId }) {
  const id = Number(reportId);
  if (!Number.isSafeInteger(id) || id <= 0 || !['manual', 'email'].includes(source)) return null;
  const row = await withCorporateBookingContext({ corporateId, bookedByUserId: actorUserId }, async (transaction) => {
    if (source === 'manual') {
      const [r] = await postgresSequelize.query(
        `SELECT chr.id, chr.employee_id, chr.report_name AS name, chr.mime_type, chr.s3_key AS key, chr.report_url AS url, pr.metadata->>'bucket' AS bucket,
                NULL AS email_id, NULL AS attachment_id
           FROM corporate_health_reports chr
           LEFT JOIN LATERAL (SELECT r.metadata FROM reports r WHERE r."userId" = chr.employee_id AND r.metadata->>'source' = 'team_corporate_health_upload'
                                AND r.metadata->>'corporateHealthReportId' = chr.id::text LIMIT 1) pr ON true
          WHERE chr.id = :id AND chr.corporate_id = :corporateId`, { ...sel, replacements: { id, corporateId }, transaction });
      return r;
    }
    const [r] = await postgresSequelize.query(
      `SELECT r.id, r."userId" AS employee_id, r."fileName" AS name, r."mimeType" AS mime_type,
              r.metadata->>'emailId' AS email_id, r.metadata->>'attachmentId' AS attachment_id
         FROM reports r
         JOIN user_associations ua ON ua."userId" = r."userId" AND ua."entityType" = 'corporate' AND ua."entityId" = :corporateId
        WHERE r.id = :id AND r."reportType" = 'lab' AND r.metadata ? 'emailId'`, { ...sel, replacements: { id, corporateId }, transaction });
    return r;
  });
  if (!row) return null;
  const meta = { name: row.name || 'health-report', mimeType: row.mime_type || 'application/pdf', employeeUserId: row.employee_id };
  if (row.email_id) {
    const buffer = await readEmailAttachment(row.email_id, row.attachment_id);
    return buffer ? { ...meta, buffer } : null;
  }
  if (row.key && (row.bucket || row.url)) {
    try {
      return { ...meta, buffer: await readStoredReportFile({ key: row.key, url: row.url, bucket: row.bucket }) };
    } catch (error) {
      if (!STORAGE_MISSING.has(error.name) && !/bucket does not exist|key does not exist/i.test(error.message)) throw error;
      throw Object.assign(new Error('The report file is missing from storage. Please upload it again.'), { status: 404, code: 'REPORT_FILE_MISSING' });
    }
  }
  return null;
}
const STORAGE_MISSING = new Set(['NoSuchBucket', 'NoSuchKey', 'NotFound']);

/** A lab report that arrived by email is kept as a base64 attachment on the stored email. */
async function readEmailAttachment(emailId, attachmentId) {
  const [email] = await postgresSequelize.query('SELECT attachments FROM email_inboxes WHERE id::text = :emailId', { ...sel, replacements: { emailId } });
  const list = Array.isArray(email?.attachments) ? email.attachments : [];
  const strip = (v) => String(v || '').replace(/^<|>$/g, '');
  const stored = list.filter((a) => a?.contentBase64);
  // Match the attachment by its id; an older row with no id is only safe when the email holds one stored file.
  const att = strip(attachmentId) ? stored.find((a) => strip(a.contentId) === strip(attachmentId)) : (stored.length === 1 ? stored[0] : null);
  return att ? Buffer.from(att.contentBase64, 'base64') : null;
}

/** Stream a report file: inline to view, attachment to download. */
export function sendReportFile(res, file, disposition = 'inline') {
  const safe = String(file.name).replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 120) || 'health-report';
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', `${disposition === 'attachment' ? 'attachment' : 'inline'}; filename="${safe}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  return res.end(file.buffer);
}

/** Every HR access to a report (view, download, share, list export) goes to audit_logs. */
export async function auditReportAccess(req, { action, corporateId, source, reportId, employeeUserId = null }) {
  try {
    await postgresSequelize.query(
      `INSERT INTO audit_logs (id, user_id, user_type, user_email, action, resource_type, resource_id, data_fields, ip_address, user_agent,
                               method, endpoint, status, status_code, is_phi, purpose, timestamp, created_at, updated_at)
       VALUES (gen_random_uuid(), :userId, :userType, :email, :action, 'corporate_health_report', :resourceId, :fields::jsonb, :ip, :ua,
               :method, :endpoint, 'success', 200, true, 'corporate_hr_report_access', now(), now(), now())`,
      { replacements: {
        userId: String(req.user?.id ?? ''), userType: String(req.user?.role || req.userRole || 'corporate'), email: req.user?.email || null,
        action, resourceId: `${source}-${reportId}`, fields: JSON.stringify({ corporateId, source, reportId, employeeUserId }),
        ip: req.ip || null, ua: String(req.headers?.['user-agent'] || '').slice(0, 300), method: req.method, endpoint: req.originalUrl,
      } });
  } catch (error) {
    console.error('[checkup-completions] audit write failed:', error.message);
  }
}
