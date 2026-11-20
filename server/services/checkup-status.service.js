/**
 * Health check-up status for a corporate: every eligible employee and where they are in the annual
 * health check-up (AHC) journey, for one financial year (1 April–31 March, the roster's cycle).
 * Used by the Team portal (Health Check-up Status) and the corporate HR portal.
 *
 *   not_eligible  → no active annual check-up benefit this year
 *   not_booked    → has the benefit, no appointment yet
 *   booked        → employee booked, waiting for Team to confirm
 *   confirmed     → appointment confirmed (by Team, or booked by Team)
 *   checkup_done  → check-up done, report awaited
 *   report_ready  → report uploaded or received, not yet sent to the employee
 *   delivered     → report sent to the employee
 *
 * Sources: corporate_employees (roster), user_health_packages + corporate_health_package_catalog
 * (annual benefit), health_checkup_bookings (employee self-booking with Team approval), lab_orders
 * (Team bookings; FORCED RLS, hence the corporate booking context) and the report sources of
 * checkup-completions.service.js.
 */
import { postgresSequelize } from '../db/postgres-sequelize.js';
import { withCorporateBookingContext } from './corporate-health-checkup-booking.service.js';
import { COMPLETIONS_SQL } from './checkup-completions.service.js';

const sel = { type: postgresSequelize.QueryTypes.SELECT };
export const STAGES = ['not_eligible', 'not_booked', 'booked', 'confirmed', 'checkup_done', 'report_ready', 'delivered'];
const MAX_LIMIT = 200;

/** Financial year containing a date: 2026-11-20 → { label: '2026-27', start: '2026-04-01', end: '2027-03-31' }. */
export function financialYear(value = null) {
  let startYear;
  const m = /^(\d{4})-(\d{2})$/.exec(String(value || ''));
  if (m && Number(m[2]) === (Number(m[1]) + 1) % 100) startYear = Number(m[1]);
  else {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const [y, mo] = today.split('-').map(Number);
    startYear = mo >= 4 ? y : y - 1;
  }
  return { label: `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`, start: `${startYear}-04-01`, end: `${startYear + 1}-03-31` };
}

const ANNUAL = `lower(COALESCE(cat.metadata->>'workflowClass', cat.metadata->>'workflow_class', cat.features->>'workflowClass',
  cat.features->>'workflow_class', cat.features->>'type', '')) IN ('annual', 'annual_benefit')`;

const STATUS_SQL = `
  WITH roster AS (
    SELECT DISTINCT ON (ce."userId") ce."userId" AS user_id, ce."employeeId" AS employee_code, ce.department, ce.designation, ce."isActive" AS roster_active
      FROM corporate_employees ce
     WHERE ce.corporate_id = :corporateId AND ce."userId" IS NOT NULL
     ORDER BY ce."userId", ce."isActive" DESC, ce.id DESC),
  ent AS (
    SELECT DISTINCT ON (uhp."userId") uhp."userId" AS user_id, uhp."packageName" AS package_name, uhp."validTo" AS valid_to,
           (uhp.status = 'active' AND uhp."validTo" >= CURRENT_DATE) AS active
      FROM user_health_packages uhp
      JOIN corporate_health_package_catalog cat ON cat.id = uhp."packageId"::text AND cat.corporate_id = uhp.corporate_id
     WHERE uhp.corporate_id = :corporateId AND ${ANNUAL}
       AND uhp."validTo" >= :from::date AND COALESCE(uhp."validFrom", :from::date) <= :to::date
     ORDER BY uhp."userId", (uhp.status = 'active') DESC, uhp."validTo" DESC),
  bk AS (
    SELECT DISTINCT ON (b.user_id) b.user_id, b.id, b.status, b.appointment_date, b.time_slot, b.lab_snapshot->>'name' AS lab,
           b.booking_reference AS ref, b.created_at, b.approved_at, b.completed_at
      FROM health_checkup_bookings b
     WHERE b.corporate_id = :corporateId AND COALESCE(b.beneficiary_relation, 'self') = 'self'
       AND b.appointment_date BETWEEN :from::date AND :to::date
     ORDER BY b.user_id, (b.status <> 'cancelled') DESC, b.appointment_date DESC, b.id DESC),
  lo AS (
    SELECT DISTINCT ON (o.patient_id) o.patient_id AS user_id, o.id, o.status, o.order_number AS ref, o.created_at,
           o.sample_collected_at, l.name AS lab,
           substring(o.notes from 'Date: ([0-9]{4}-[0-9]{2}-[0-9]{2})')::date AS appointment_date,
           NULLIF(trim(substring(o.notes from 'Date: [0-9]{4}-[0-9]{2}-[0-9]{2} ([^|]*)')), '') AS time_slot
      FROM lab_orders o LEFT JOIN labs l ON l.id = o.lab_id
     WHERE o.organization_id = :corporateId AND o.test_category = 'corporate_health_checkup'
       AND COALESCE(substring(o.notes from 'Date: ([0-9]{4}-[0-9]{2}-[0-9]{2})')::date, o.created_at::date) BETWEEN :from::date AND :to::date
     ORDER BY o.patient_id, (o.status <> 'cancelled') DESC, o.created_at DESC),
  rep AS (
    SELECT DISTINCT ON (c.user_id) c.user_id, c.source, c.report_id, c.report_name, c.mime_type, c.file_size_bytes, c.uploaded_at,
           c.checkup_date, c.has_file, c.notified_email, c.notified_whatsapp, c.lab_name,
           count(*) OVER (PARTITION BY c.user_id) AS report_count
      FROM (${COMPLETIONS_SQL.replaceAll(':search', ':reportSearch')}) c
     WHERE c.source <> 'booking'
     ORDER BY c.user_id, c.checkup_date DESC NULLS LAST, c.report_id DESC),
  people AS (
    SELECT user_id FROM roster WHERE roster_active
    UNION SELECT user_id FROM ent WHERE active UNION SELECT user_id FROM bk UNION SELECT user_id FROM lo UNION SELECT user_id FROM rep),
  board AS (
    SELECT p.user_id, u."firstName" AS first_name, u."lastName" AS last_name, u.email, u."phoneNumber" AS phone,
           r.employee_code, r.department, r.designation, COALESCE(r.roster_active, false) AS roster_active,
           ent.package_name, ent.valid_to, COALESCE(ent.active, false) AS benefit_active,
           bk.id AS bk_id, bk.status AS bk_status, bk.appointment_date AS bk_date, bk.time_slot AS bk_slot, bk.lab AS bk_lab, bk.ref AS bk_ref,
           bk.created_at AS bk_created, bk.approved_at, bk.completed_at,
           lo.id AS lo_id, lo.status AS lo_status, lo.appointment_date AS lo_date, lo.time_slot AS lo_slot, lo.lab AS lo_lab, lo.ref AS lo_ref,
           lo.created_at AS lo_created, lo.sample_collected_at,
           rep.source AS rep_source, rep.report_id, rep.report_name, rep.mime_type, rep.file_size_bytes, rep.uploaded_at, rep.checkup_date AS rep_checkup_date,
           rep.has_file, rep.notified_email, rep.notified_whatsapp, rep.lab_name AS rep_lab, rep.report_count,
           CASE
             WHEN rep.user_id IS NOT NULL AND (rep.source = 'email' OR rep.notified_email OR rep.notified_whatsapp) THEN 'delivered'
             WHEN rep.user_id IS NOT NULL OR bk.status = 'reports_available' THEN 'report_ready'
             WHEN bk.status = 'completed' OR lo.status IN ('sample_collected', 'processing', 'in_progress', 'completed', 'resulted', 'finalized') THEN 'checkup_done'
             WHEN bk.status IN ('confirmed', 'scheduled', 'rescheduled') OR lo.status IN ('pending', 'scheduled', 'confirmed', 'booked', 'ordered') THEN 'confirmed'
             WHEN bk.status IN ('booked', 'payment_pending') THEN 'booked'
             WHEN ent.active THEN 'not_booked'
             ELSE 'not_eligible'
           END AS stage
      FROM people p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN roster r ON r.user_id = p.user_id
      LEFT JOIN ent ON ent.user_id = p.user_id
      LEFT JOIN bk ON bk.user_id = p.user_id
      LEFT JOIN lo ON lo.user_id = p.user_id
      LEFT JOIN rep ON rep.user_id = p.user_id)
  SELECT * FROM board
   WHERE (:search = '' OR concat_ws(' ', first_name, last_name, email, phone, employee_code, department, designation, package_name) ILIKE '%' || :search || '%')`;

const STAGE_RANK = STAGES.map((s, i) => `WHEN '${s}' THEN ${i}`).join(' ');

const rowOut = (r) => {
  // The appointment shown is the employee's own booking when there is one, else Team's booking.
  const own = r.bk_id && (r.bk_status !== 'cancelled' || !r.lo_id || r.lo_status === 'cancelled');
  const appointment = own
    ? { source: 'employee', id: Number(r.bk_id), status: r.bk_status, date: r.bk_date, slot: r.bk_slot, lab: r.bk_lab, reference: r.bk_ref, bookedAt: r.bk_created, confirmedAt: r.approved_at, completedAt: r.completed_at }
    : r.lo_id ? { source: 'team', id: Number(r.lo_id), status: r.lo_status, date: r.lo_date, slot: r.lo_slot, lab: r.lo_lab, reference: r.lo_ref, bookedAt: r.lo_created, confirmedAt: r.lo_created, completedAt: r.sample_collected_at }
      : null;
  return {
    key: `emp-${r.user_id}`,
    stage: r.stage,
    employee: {
      userId: Number(r.user_id),
      name: [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || null,
      employeeId: r.employee_code || null, department: r.department || null, designation: r.designation || null,
      email: r.email || null, phone: r.phone || null, onRoster: !!r.roster_active,
    },
    benefit: r.package_name ? { packageName: String(r.package_name).trim(), validTo: r.valid_to, active: !!r.benefit_active } : null,
    appointment,
    report: r.report_id ? {
      source: r.rep_source, reportId: Number(r.report_id), name: r.report_name, mimeType: r.mime_type,
      sizeBytes: r.file_size_bytes == null ? null : Number(r.file_size_bytes), uploadedAt: r.uploaded_at, checkupDate: r.rep_checkup_date,
      hasFile: !!r.has_file, notifiedEmail: !!r.notified_email, notifiedWhatsapp: !!r.notified_whatsapp, lab: r.rep_lab || null,
      count: Number(r.report_count || 1), canShare: r.rep_source === 'manual',
    } : null,
  };
};

/** The board for one financial year: a page of employees, the count at each stage and the year. */
export async function listCheckupStatus({ corporateId, actorUserId, fy = null, search = '', stage = '', page = 1, limit = 50 }) {
  const n = Math.min(Math.max(Number(limit) || 50, 1), MAX_LIMIT);
  const p = Math.max(Number(page) || 1, 1);
  const year = financialYear(fy);
  const st = STAGES.includes(stage) ? stage : '';
  const replacements = { corporateId, search: String(search || '').trim().slice(0, 80), reportSearch: '', from: year.start, to: year.end };
  return withCorporateBookingContext({ corporateId, bookedByUserId: actorUserId }, async (transaction) => {
    const rows = await postgresSequelize.query(
      `${STATUS_SQL} AND (:stage = '' OR stage = :stage)
        ORDER BY CASE stage ${STAGE_RANK} END, lower(concat_ws(' ', first_name, last_name)), user_id
        LIMIT :limit OFFSET :offset`,
      { ...sel, replacements: { ...replacements, stage: st, limit: n, offset: (p - 1) * n }, transaction });
    const counts = await postgresSequelize.query(`SELECT stage, count(*)::int AS n FROM (${STATUS_SQL}) b GROUP BY stage`,
      { ...sel, replacements, transaction });
    const byStage = Object.fromEntries(STAGES.map((s) => [s, 0]));
    for (const c of counts) byStage[c.stage] = c.n;
    const all = Object.values(byStage).reduce((a, b) => a + b, 0);
    return {
      financialYear: year,
      rows: rows.map(rowOut),
      page: p, limit: n, stage: st || null,
      total: st ? byStage[st] : all,
      summary: { all, eligible: all - byStage.not_eligible, byStage },
    };
  });
}
