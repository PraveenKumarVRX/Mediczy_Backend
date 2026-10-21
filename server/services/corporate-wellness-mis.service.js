import { postgresSequelize } from '../db/postgres-sequelize.js';
import emailServiceModule from './emailService.js';

const WEEKDAY_SATURDAY = 6;
const WEEKDAY_SUNDAY = 0;

function dateOnly(dateInput) {
  const d = dateInput ? new Date(dateInput) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function toCsv(rows, headers) {
  const escapeCell = (value) => {
    if (value === null || value === undefined) return '';
    const text = String(value);
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };

  return [
    headers.map(escapeCell).join(','),
    ...rows.map((row) => headers.map((key) => escapeCell(row?.[key])).join(',')),
  ].join('\n');
}

export function addWorkingDays(dateInput, workingDays = 2) {
  const dueAt = dateInput ? new Date(dateInput) : new Date();
  if (Number.isNaN(dueAt.getTime())) return new Date();

  let remaining = Number(workingDays) || 0;
  while (remaining > 0) {
    dueAt.setUTCDate(dueAt.getUTCDate() + 1);
    const day = dueAt.getUTCDay();
    if (day !== WEEKDAY_SATURDAY && day !== WEEKDAY_SUNDAY) remaining -= 1;
  }
  dueAt.setUTCHours(23, 59, 59, 999);
  return dueAt;
}

export function computeReportSla(checkupCompletedAt, deliveredAt = null) {
  const basis = checkupCompletedAt ? new Date(checkupCompletedAt) : new Date();
  const dueAt = addWorkingDays(basis, 2);
  const delivered = deliveredAt ? new Date(deliveredAt) : null;

  if (delivered && !Number.isNaN(delivered.getTime())) {
    return {
      dueAt,
      status: delivered.getTime() <= dueAt.getTime() ? 'on_time' : 'breached',
    };
  }

  return {
    dueAt,
    status: new Date().getTime() > dueAt.getTime() ? 'pending_overdue' : 'pending_due',
  };
}

export function getCurrentWeekRange(now = new Date()) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end);
  const day = start.getUTCDay() || 7;
  start.setUTCDate(start.getUTCDate() - day + 1);
  end.setUTCDate(start.getUTCDate() + 6);
  return { start: dateOnly(start), end: dateOnly(end) };
}

export function getPreviousWeekRange(now = new Date()) {
  const current = getCurrentWeekRange(now);
  const end = new Date(`${current.start}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  return { start: dateOnly(start), end: dateOnly(end) };
}

export function resolveCorporateIdFromUser(user = {}) {
  return user.corporateId || user.corporate_id || user.organization_id || user.organizationId || user.id || null;
}

export async function buildCorporateMisMetrics(corporateId, periodStart, periodEnd) {
  const replacements = { corporateId: Number(corporateId), periodStart, periodEnd };

  const [employeeRow] = await postgresSequelize.query(
    `SELECT
       COUNT(DISTINCT ce.id) FILTER (WHERE ce."isActive" = true) AS enrolled_employees,
       COUNT(DISTINCT ua."userId") FILTER (WHERE ua.status = 'active') AS activated_employees
     FROM corporates c
     LEFT JOIN corporate_employees ce ON ce.corporate_id = c.id
     LEFT JOIN user_associations ua ON ua."entityId" = c.id
       AND ua."entityType" = 'corporate'
       AND ua.role = 'employee'
     WHERE c.id = :corporateId`,
    { replacements, type: postgresSequelize.QueryTypes.SELECT }
  );

  const [checkupRow] = await postgresSequelize.query(
    `SELECT
       COUNT(*) AS booked_checkups,
       COUNT(*) FILTER (WHERE status IN ('completed', 'reported')) AS completed_checkups
     FROM lab_orders
     WHERE test_category = 'corporate_health_checkup'
       AND organization_id = :corporateId
       AND created_at::date BETWEEN :periodStart AND :periodEnd`,
    { replacements, type: postgresSequelize.QueryTypes.SELECT }
  ).catch(() => [{ booked_checkups: 0, completed_checkups: 0 }]);

  const [reportRow] = await postgresSequelize.query(
    `SELECT
       COUNT(*) AS reports_uploaded,
       COUNT(*) FILTER (WHERE checkup_type = 'pre_employment') AS pre_employment_reports,
       COUNT(*) FILTER (WHERE checkup_type = 'annual_health_checkup') AS annual_reports,
       COUNT(*) FILTER (WHERE sla_status = 'on_time') AS sla_on_time,
       COUNT(*) FILTER (WHERE sla_status = 'breached') AS sla_breached,
       COUNT(*) FILTER (WHERE sla_status IN ('pending_due', 'pending_overdue')) AS sla_pending,
       COUNT(*) FILTER (WHERE sla_status = 'pending_overdue') AS sla_overdue
     FROM corporate_health_reports
     WHERE corporate_id = :corporateId
       AND report_date BETWEEN :periodStart AND :periodEnd`,
    { replacements, type: postgresSequelize.QueryTypes.SELECT }
  ).catch(() => [{
    reports_uploaded: 0,
    pre_employment_reports: 0,
    annual_reports: 0,
    sla_on_time: 0,
    sla_breached: 0,
    sla_pending: 0,
    sla_overdue: 0,
  }]);

  // Doctor appointments/teleconsultations - previously entirely absent from
  // this report, which only ever looked at lab_orders. Covers both
  // HR-booked (corporate_scheduled_appointments) and employee self-booked
  // (appointments, via corporate_tenant_id) in the same period.
  const [apptRow] = await postgresSequelize.query(
    `SELECT
       (SELECT COUNT(*) FROM corporate_scheduled_appointments
         WHERE corporate_id = :corporateId AND date BETWEEN :periodStart AND :periodEnd) AS hr_booked_appointments,
       (SELECT COUNT(*) FROM corporate_scheduled_appointments
         WHERE corporate_id = :corporateId AND status = 'completed' AND date BETWEEN :periodStart AND :periodEnd) AS hr_booked_completed,
       (SELECT COUNT(*) FROM appointments
         WHERE corporate_tenant_id = :corporateId AND "appointmentDate" BETWEEN :periodStart AND :periodEnd) AS employee_booked_appointments,
       (SELECT COUNT(*) FROM appointments
         WHERE corporate_tenant_id = :corporateId AND status = 'completed' AND "appointmentDate" BETWEEN :periodStart AND :periodEnd) AS employee_booked_completed`,
    { replacements, type: postgresSequelize.QueryTypes.SELECT }
  ).catch(() => [{ hr_booked_appointments: 0, hr_booked_completed: 0, employee_booked_appointments: 0, employee_booked_completed: 0 }]);

  const reportsUploaded = Number(reportRow?.reports_uploaded || 0);
  const onTime = Number(reportRow?.sla_on_time || 0);
  const breached = Number(reportRow?.sla_breached || 0);
  const measured = onTime + breached;

  return {
    periodStart,
    periodEnd,
    enrolledEmployees: Number(employeeRow?.enrolled_employees || 0),
    activatedEmployees: Number(employeeRow?.activated_employees || 0),
    bookedCheckups: Number(checkupRow?.booked_checkups || 0),
    completedCheckups: Number(checkupRow?.completed_checkups || 0),
    bookedAppointments: Number(apptRow?.hr_booked_appointments || 0) + Number(apptRow?.employee_booked_appointments || 0),
    completedAppointments: Number(apptRow?.hr_booked_completed || 0) + Number(apptRow?.employee_booked_completed || 0),
    reportsUploaded,
    preEmploymentReports: Number(reportRow?.pre_employment_reports || 0),
    annualReports: Number(reportRow?.annual_reports || 0),
    slaOnTime: onTime,
    slaBreached: breached,
    slaPending: Number(reportRow?.sla_pending || 0),
    slaOverdue: Number(reportRow?.sla_overdue || 0),
    slaCompliancePercent: measured > 0 ? Math.round((onTime / measured) * 100) : null,
  };
}

export function misMetricsToRows(metrics) {
  return [
    { metric: 'Enrolled employees', value: metrics.enrolledEmployees },
    { metric: 'Activated employees', value: metrics.activatedEmployees },
    { metric: 'Booked check-ups', value: metrics.bookedCheckups },
    { metric: 'Completed check-ups', value: metrics.completedCheckups },
    { metric: 'Booked doctor appointments', value: metrics.bookedAppointments },
    { metric: 'Completed doctor appointments', value: metrics.completedAppointments },
    { metric: 'Reports uploaded', value: metrics.reportsUploaded },
    { metric: 'Pre-employment reports', value: metrics.preEmploymentReports },
    { metric: 'Annual health check-up reports', value: metrics.annualReports },
    { metric: 'Reports delivered on time', value: metrics.slaOnTime },
    { metric: 'Reports breached SLA', value: metrics.slaBreached },
    { metric: 'Reports pending', value: metrics.slaPending },
    { metric: 'Reports overdue', value: metrics.slaOverdue },
    { metric: 'SLA compliance %', value: metrics.slaCompliancePercent ?? 'N/A' },
  ];
}

export async function generateCorporateMisReport(corporateId, options = {}) {
  const range = options.periodStart && options.periodEnd
    ? { start: dateOnly(options.periodStart), end: dateOnly(options.periodEnd) }
    : (options.period === 'week' || options.period === 'current_week')
      ? getCurrentWeekRange()
      : getPreviousWeekRange();

  const metrics = await buildCorporateMisMetrics(corporateId, range.start, range.end);
  const reportKey = `weekly-mis-${range.start}-${range.end}`;
  const title = `Weekly MIS Report (${range.start} to ${range.end})`;

  const rows = await postgresSequelize.query(
    `INSERT INTO corporate_generated_reports
       (corporate_id, report_key, title, category, period, period_start, period_end,
        format, status, generated_by, scheduled_frequency, delivery_status, metrics, created_at)
     VALUES
       (:corporateId, :reportKey, :title, 'MIS', :periodLabel, :periodStart, :periodEnd,
        'CSV', 'ready', :generatedBy, 'weekly', :deliveryStatus, CAST(:metrics AS JSONB), NOW())
     ON CONFLICT (corporate_id, report_key) WHERE report_key IS NOT NULL
     DO UPDATE SET
       title = EXCLUDED.title,
       period = EXCLUDED.period,
       period_start = EXCLUDED.period_start,
       period_end = EXCLUDED.period_end,
       status = 'ready',
       metrics = EXCLUDED.metrics,
       delivery_status = EXCLUDED.delivery_status,
       created_at = NOW()
     RETURNING id, title, category, period, format, status, created_at,
               report_key, period_start, period_end, scheduled_frequency, delivery_status, delivered_at, metrics`,
    {
      replacements: {
        corporateId: Number(corporateId),
        reportKey,
        title,
        periodLabel: `Weekly: ${range.start} to ${range.end}`,
        periodStart: range.start,
        periodEnd: range.end,
        generatedBy: options.generatedBy || null,
        deliveryStatus: options.deliveryStatus || 'not_sent',
        metrics: JSON.stringify(metrics),
      },
      type: postgresSequelize.QueryTypes.SELECT,
    }
  );

  return rows[0];
}

export async function getCorporateMisCsv(corporateId, report) {
  const metrics = report?.metrics && Object.keys(report.metrics).length
    ? report.metrics
    : await buildCorporateMisMetrics(corporateId, dateOnly(report.period_start), dateOnly(report.period_end));

  const rows = misMetricsToRows(metrics).map((row) => ({
    period_start: metrics.periodStart || dateOnly(report.period_start),
    period_end: metrics.periodEnd || dateOnly(report.period_end),
    metric: row.metric,
    value: row.value,
  }));

  return toCsv(rows, ['period_start', 'period_end', 'metric', 'value']);
}

async function maybeSendMisEmail(corporate, report) {
  if (!corporate?.email) return 'skipped';
  const appUrl = process.env.APP_URL || process.env.FRONTEND_URL || 'https://app.mediqzy.com';
  try {
    await emailServiceModule.sendOutboundEmail(1, {
      to: corporate.email,
      subject: report.title,
      htmlContent: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
          <h2 style="margin:0 0 12px">Corporate Weekly MIS is ready</h2>
          <p>Your weekly corporate wellness MIS for ${report.period} has been generated.</p>
          <p><a href="${appUrl}/corporate/reports" style="color:#2563eb">Open HR reports dashboard</a></p>
        </div>
      `,
      textContent: `Your ${report.title} is ready. Open ${appUrl}/corporate/reports to download it.`,
    });
    await postgresSequelize.query(
      `UPDATE corporate_generated_reports
          SET delivery_status = 'sent', delivered_at = NOW()
        WHERE id = :id`,
      { replacements: { id: report.id } }
    );
    return 'sent';
  } catch (error) {
    await postgresSequelize.query(
      `UPDATE corporate_generated_reports
          SET delivery_status = 'failed'
        WHERE id = :id`,
      { replacements: { id: report.id } }
    ).catch(() => {});
    console.warn('[corporate-mis] weekly MIS email failed:', error.message);
    return 'failed';
  }
}

export async function runWeeklyMisForAllCorporates(options = {}) {
  const corporates = await postgresSequelize.query(
    `SELECT c.id, c.email, c."companyName", cs.settings
       FROM corporates c
       LEFT JOIN corporate_settings cs ON cs.corporate_id = c.id
      WHERE LOWER(COALESCE(c.status, '')) IN ('active', 'pending')`,
    { type: postgresSequelize.QueryTypes.SELECT }
  );

  const results = [];
  for (const corporate of corporates) {
    const settings = corporate.settings || {};
    if (settings?.notifs?.weeklyReports === false) {
      results.push({ corporateId: corporate.id, status: 'skipped_disabled' });
      continue;
    }

    try {
      const report = await generateCorporateMisReport(corporate.id, {
        ...options,
        deliveryStatus: options.sendEmail === false ? 'not_sent' : 'pending',
      });
      const deliveryStatus = options.sendEmail === false ? 'not_sent' : await maybeSendMisEmail(corporate, report);
      results.push({ corporateId: corporate.id, status: 'ready', reportId: report.id, deliveryStatus });
    } catch (error) {
      console.error('[corporate-mis] generation failed:', { corporateId: corporate.id, error: error.message });
      results.push({ corporateId: corporate.id, status: 'failed', error: error.message });
    }
  }

  return results;
}

export default {
  addWorkingDays,
  computeReportSla,
  generateCorporateMisReport,
  getCorporateMisCsv,
  getCurrentWeekRange,
  getPreviousWeekRange,
  runWeeklyMisForAllCorporates,
};
