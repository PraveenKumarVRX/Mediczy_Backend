/**
 * Reports the corporate (HR) portal can generate, built once and saved with the
 * report (HR QA 2026-11-21, items 3-4).
 *
 * Before this, "Generate Report" saved only a title; the rows were recomputed at
 * every download, so a report changed after it was made, its preview showed only
 * metadata, and five of the nine report types on offer silently produced the same
 * employee list. Each type here is a real query; the rows are frozen into
 * corporate_generated_reports.snapshot at generation.
 */
import { postgresSequelize } from '../db/postgres-sequelize.js';
import { listCheckupStatus, financialYear } from './checkup-status.service.js';
import { buildCorporateMisMetrics, misMetricsToRows, getCurrentWeekRange, getPreviousWeekRange } from './corporate-wellness-mis.service.js';

export const MAX_SNAPSHOT_ROWS = 20000;
const sel = { type: postgresSequelize.QueryTypes.SELECT };

const STAGE_LABEL = {
  not_eligible: 'Not eligible', not_booked: 'Not booked', booked: 'Pending confirmation', confirmed: 'Confirmed',
  checkup_done: 'Check-up done', report_ready: 'Report ready', delivered: 'Report sent',
};

const HEALTH_CONSENT = `EXISTS (SELECT 1 FROM corporate_employees ce
    JOIN corporate_employee_consents consent ON consent.corporate_id = ce.corporate_id
     AND consent.employee_id = ce."employeeId" AND consent.consent_type = 'health_data'
     AND consent.granted = true AND consent.revoked_at IS NULL
   WHERE ce.corporate_id = :corporateId AND ce."isActive" = true AND ce."userId" = %USER%)`;

/** The report types offered, in the order shown. */
export const REPORT_TYPES = [
  { key: 'checkup_status', label: 'Health Check-up Status', description: 'Every employee and where they are in this year\'s annual check-up, from not booked to report sent.' },
  { key: 'pre_employment', label: 'Pre-employment check-ups', description: 'Candidates, their check-up appointment and fitness outcome.' },
  { key: 'weekly_mis', label: 'Weekly MIS', description: 'Bookings by status and type, reports and SLA for one week.' },
  { key: 'employees', label: 'Employee list', description: 'The active employee roster.' },
  { key: 'claims', label: 'Insurance claims', description: 'Claims of employees who consented to share health data.' },
  { key: 'health_risk', label: 'Health risk', description: 'Risk scores of employees who consented to share health data.' },
];

const LEGACY_TYPE = (category) => {
  const c = String(category || '').toLowerCase();
  if (c === 'mis' || c.includes('weekly')) return 'weekly_mis';
  if (c.includes('check-up') || c.includes('checkup')) return 'checkup_status';
  if (c.includes('pre-employment') || c.includes('pre_employment')) return 'pre_employment';
  if (c.includes('claim')) return 'claims';
  if (c.includes('risk') || c.includes('health')) return 'health_risk';
  return 'employees';
};

export const reportTypeOf = (typeOrCategory) =>
  REPORT_TYPES.find((t) => t.key === typeOrCategory || t.label === typeOrCategory)?.key || LEGACY_TYPE(typeOrCategory);

const day = (v) => (v ? new Date(v).toISOString().slice(0, 10) : '');

async function checkupStatusRows(corporateId, actorUserId, fy) {
  const rows = [];
  for (let page = 1; page <= Math.ceil(MAX_SNAPSHOT_ROWS / 200); page += 1) {
    const data = await listCheckupStatus({ corporateId, actorUserId, fy, stage: '', page, limit: 200 });
    for (const r of data.rows) {
      rows.push({
        employee_id: r.employee.employeeId || '', name: r.employee.name || '', department: r.employee.department || '',
        email: r.employee.email || '', status: STAGE_LABEL[r.stage] || r.stage, package: r.benefit?.packageName || '',
        appointment_date: day(r.appointment?.date), lab: r.appointment?.lab || '', booked_by: r.appointment ? (r.appointment.source === 'team' ? 'Wellness team' : 'Employee app') : '',
        report_uploaded: day(r.report?.uploadedAt), report_sent: r.report ? (r.report.notifiedEmail || r.report.notifiedWhatsapp ? 'Yes' : 'No') : '',
      });
    }
    if (rows.length >= data.total || !data.rows.length) break;
  }
  return { headers: ['employee_id', 'name', 'department', 'email', 'status', 'package', 'appointment_date', 'lab', 'booked_by', 'report_uploaded', 'report_sent'], rows };
}

/**
 * @returns {{ type, title, period, periodStart, periodEnd, headers: string[], rows: object[], metrics?: object }}
 */
export async function buildReport(corporateId, typeOrCategory, { actorUserId, fy = null, week = 'previous_week' } = {}) {
  const type = reportTypeOf(typeOrCategory);
  const label = REPORT_TYPES.find((t) => t.key === type).label;
  const replacements = { corporateId: Number(corporateId) };
  const today = day(new Date());

  if (type === 'checkup_status') {
    const year = financialYear(fy);
    const data = await checkupStatusRows(corporateId, actorUserId, year.label);
    return { type, title: `${label} · FY ${year.label}`, period: `FY ${year.label}`, periodStart: year.start, periodEnd: year.end, ...data };
  }
  if (type === 'weekly_mis') {
    const range = week === 'current_week' || week === 'week' ? getCurrentWeekRange() : getPreviousWeekRange();
    const metrics = await buildCorporateMisMetrics(corporateId, range.start, range.end);
    return {
      type, title: `${label} (${range.start} to ${range.end})`, period: `Weekly: ${range.start} to ${range.end}`, periodStart: range.start, periodEnd: range.end,
      headers: ['metric', 'value'], rows: misMetricsToRows(metrics), metrics,
    };
  }
  let headers;
  let rows;
  if (type === 'pre_employment') {
    rows = await postgresSequelize.query(
      `SELECT c.full_name AS candidate, c.email, c.phone, pc.position_title AS position, pc.status,
              to_char(pc.appointment_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') AS appointment,
              COALESCE(pc.venue->>'name', '') AS venue, COALESCE(pc.fitness_status, '') AS fitness,
              to_char(pc.fitness_issued_at, 'YYYY-MM-DD') AS fitness_issued, to_char(pc.created_at, 'YYYY-MM-DD') AS created
         FROM pre_employment_cases pc JOIN pre_employment_candidates c ON c.id = pc.candidate_id
        WHERE pc.corporate_id = :corporateId ORDER BY pc.created_at DESC LIMIT ${MAX_SNAPSHOT_ROWS}`,
      { ...sel, replacements });
    headers = ['candidate', 'email', 'phone', 'position', 'status', 'appointment', 'venue', 'fitness', 'fitness_issued', 'created'];
  } else if (type === 'claims') {
    rows = await postgresSequelize.query(
      `SELECT ic.claim_number, ic.claim_type, ic.claim_amount, ic.status, ic.submitted_date
         FROM insurance_claims ic JOIN user_associations ua ON ua."userId" = ic.patient_id
        WHERE ua."entityId" = :corporateId AND ua."entityType" = 'corporate' AND ${HEALTH_CONSENT.replace('%USER%', 'ic.patient_id')}
        ORDER BY ic.submitted_date DESC LIMIT ${MAX_SNAPSHOT_ROWS}`,
      { ...sel, replacements });
    headers = ['claim_number', 'claim_type', 'claim_amount', 'status', 'submitted_date'];
  } else if (type === 'health_risk') {
    rows = await postgresSequelize.query(
      `SELECT u."firstName", u."lastName", r.risk_level, r.overall_score, r.created_at
         FROM ai_health_risk_scores r JOIN user_associations ua ON ua."userId" = r.patient_id JOIN users u ON u.id = r.patient_id
        WHERE ua."entityId" = :corporateId AND ua."entityType" = 'corporate' AND ${HEALTH_CONSENT.replace('%USER%', 'r.patient_id')}
        ORDER BY r.created_at DESC LIMIT ${MAX_SNAPSHOT_ROWS}`,
      { ...sel, replacements });
    headers = ['firstName', 'lastName', 'risk_level', 'overall_score', 'created_at'];
  } else {
    rows = await postgresSequelize.query(
      `SELECT ce."employeeId", ce.department, ce.designation, u."firstName", u."lastName", COALESCE(u.email, ce.email) AS email
         FROM corporate_employees ce LEFT JOIN users u ON u.id = ce."userId"
        WHERE ce.corporate_id = :corporateId AND ce."isActive" = true ORDER BY ce."employeeId" LIMIT ${MAX_SNAPSHOT_ROWS}`,
      { ...sel, replacements });
    headers = ['employeeId', 'department', 'designation', 'firstName', 'lastName', 'email'];
  }
  return { type, title: `${label} · ${today}`, period: `As of ${today}`, periodStart: today, periodEnd: today, headers, rows };
}

export default { REPORT_TYPES, buildReport, reportTypeOf, MAX_SNAPSHOT_ROWS };
