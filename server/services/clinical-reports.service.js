/**
 * Clinical Reports Service
 * Generates structured PDF/JSON clinical and operational reports using pdfkit.
 * Reports: Daily Census, OT Utilization, eMAR Compliance, Readmission Risk,
 *          Pre-Auth Status, Discharge Summary, Executive Daily Digest.
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';

async function q(sql, replacements = {}) {
  try { return await sequelize.query(sql, { replacements, type: QueryTypes.SELECT }); }
  catch { return []; }
}
async function qOne(sql, r = {}) { const rows = await q(sql, r); return rows[0] || null; }

// ── Report Data Collectors ────────────────────────────────────────────────────

export async function getDailyCensusData(organizationId, date) {
  const day = date || new Date().toISOString().split('T')[0];
  const [wards, admissions, discharges, transfers, otSummary] = await Promise.all([
    q(`
      SELECT w.name AS ward_name, w.ward_type,
             COUNT(b.id) FILTER (WHERE b.status = 'occupied')  AS occupied,
             COUNT(b.id) FILTER (WHERE b.status = 'available') AS available,
             COUNT(b.id) FILTER (WHERE b.status IN ('blocked','housekeeping')) AS blocked,
             COUNT(b.id)                                        AS total
      FROM wards w LEFT JOIN beds b ON b.ward_id = w.id
      WHERE w.organization_id = :orgId
      GROUP BY w.id, w.name, w.ward_type ORDER BY w.name
    `, { orgId: organizationId }),
    qOne(`SELECT COUNT(*) AS count FROM adt_events WHERE organization_id = :orgId AND event_type = 'admitted' AND DATE(performed_at) = :day`, { orgId: organizationId, day }),
    qOne(`SELECT COUNT(*) AS count FROM adt_events WHERE organization_id = :orgId AND event_type = 'discharged' AND DATE(performed_at) = :day`, { orgId: organizationId, day }),
    qOne(`SELECT COUNT(*) AS count FROM adt_events WHERE organization_id = :orgId AND event_type = 'transferred' AND DATE(performed_at) = :day`, { orgId: organizationId, day }),
    qOne(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'completed') AS completed, COUNT(*) FILTER (WHERE status IN ('patient_in','incision','closure')) AS in_progress FROM ot_bookings WHERE organization_id = :orgId AND DATE(scheduled_start) = :day`, { orgId: organizationId, day }),
  ]);

  const totalBeds = wards.reduce((s, w) => s + Number(w.total), 0);
  const occupiedBeds = wards.reduce((s, w) => s + Number(w.occupied), 0);

  return {
    reportType: 'daily_census',
    date: day,
    generatedAt: new Date().toISOString(),
    organizationId,
    summary: {
      totalBeds, occupiedBeds,
      occupancyPct: totalBeds > 0 ? Math.round(100 * occupiedBeds / totalBeds) : 0,
      admissions:   Number(admissions?.count || 0),
      discharges:   Number(discharges?.count || 0),
      transfers:    Number(transfers?.count  || 0),
    },
    wardBreakdown: wards,
    otSummary: {
      total:      Number(otSummary?.total      || 0),
      completed:  Number(otSummary?.completed  || 0),
      inProgress: Number(otSummary?.in_progress || 0),
    }
  };
}

export async function getOTUtilizationReport(organizationId, { days = 7 } = {}) {
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const [cases, delays, utilByRoom, surgeonStats] = await Promise.all([
    qOne(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed,
        COUNT(*) FILTER (WHERE status = 'cancelled' OR status = 'postponed') AS cancelled,
        COUNT(*) FILTER (WHERE actual_start > scheduled_start + INTERVAL '15 minutes') AS delayed,
        ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(actual_end,scheduled_end) - COALESCE(actual_start,scheduled_start)))/60), 1) AS avg_case_duration_min,
        ROUND(AVG(EXTRACT(EPOCH FROM (actual_start - scheduled_start))/60) FILTER (WHERE actual_start > scheduled_start), 1) AS avg_delay_min
      FROM ot_bookings
      WHERE organization_id = :orgId AND scheduled_start >= :since
    `, { orgId: organizationId, since }),
    q(`
      SELECT DATE(scheduled_start) AS day,
             COUNT(*) FILTER (WHERE actual_start > scheduled_start + INTERVAL '15 minutes') AS delayed,
             COUNT(*) AS total
      FROM ot_bookings WHERE organization_id = :orgId AND scheduled_start >= :since
      GROUP BY DATE(scheduled_start) ORDER BY day
    `, { orgId: organizationId, since }),
    q(`
      SELECT room_name, COUNT(*) AS cases,
             ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(actual_end,scheduled_end) - COALESCE(actual_start,scheduled_start)))/60), 1) AS avg_duration_min
      FROM ot_bookings WHERE organization_id = :orgId AND scheduled_start >= :since AND status = 'completed'
      GROUP BY room_name ORDER BY cases DESC
    `, { orgId: organizationId, since }),
    q(`
      SELECT surgeon_name, COUNT(*) AS cases,
             COUNT(*) FILTER (WHERE status = 'completed') AS completed,
             ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(actual_end,scheduled_end) - COALESCE(actual_start,scheduled_start)))/60), 1) AS avg_min
      FROM ot_bookings WHERE organization_id = :orgId AND scheduled_start >= :since
      GROUP BY surgeon_name ORDER BY cases DESC LIMIT 15
    `, { orgId: organizationId, since }),
  ]);

  return {
    reportType: 'ot_utilization',
    periodDays: days,
    generatedAt: new Date().toISOString(),
    summary: {
      total:              Number(cases?.total              || 0),
      completed:          Number(cases?.completed          || 0),
      cancelled:          Number(cases?.cancelled          || 0),
      delayed:            Number(cases?.delayed            || 0),
      delayPct:           cases?.total > 0 ? Math.round(100 * Number(cases?.delayed) / Number(cases?.total)) : 0,
      avgCaseDurationMin: Number(cases?.avg_case_duration_min || 0),
      avgDelayMin:        Number(cases?.avg_delay_min      || 0),
    },
    dailyDelayTrend: delays,
    byRoom:          utilByRoom,
    bySurgeon:       surgeonStats,
  };
}

export async function getEMARComplianceReport(organizationId, { days = 7 } = {}) {
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const [overall, byWard, byMedication, overdueHistory] = await Promise.all([
    qOne(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'administered') AS administered,
        COUNT(*) FILTER (WHERE status = 'missed')       AS missed,
        COUNT(*) FILTER (WHERE status = 'held')         AS held,
        COUNT(*) FILTER (WHERE status = 'pending')      AS pending,
        COUNT(*) AS total,
        ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'administered') / NULLIF(COUNT(*), 0), 1) AS compliance_pct,
        COUNT(*) FILTER (WHERE high_alert = TRUE AND status = 'administered') AS high_alert_administered,
        COUNT(*) FILTER (WHERE high_alert = TRUE) AS high_alert_total
      FROM medication_administrations
      WHERE organization_id = :orgId AND scheduled_time >= :since
    `, { orgId: organizationId, since }),
    q(`
      SELECT w.name AS ward_name,
             COUNT(ma.id) FILTER (WHERE ma.status = 'administered') AS administered,
             COUNT(ma.id) AS total,
             ROUND(100.0 * COUNT(ma.id) FILTER (WHERE ma.status = 'administered') / NULLIF(COUNT(ma.id), 0), 1) AS compliance_pct
      FROM medication_administrations ma
      JOIN ip_admissions a ON a.id = ma.admission_id
      JOIN wards w ON w.id = a.ward_id
      WHERE ma.organization_id = :orgId AND ma.scheduled_time >= :since
      GROUP BY w.name ORDER BY compliance_pct ASC
    `, { orgId: organizationId, since }),
    q(`
      SELECT medication_name,
             COUNT(*) FILTER (WHERE status = 'administered') AS administered,
             COUNT(*) FILTER (WHERE status = 'missed') AS missed,
             COUNT(*) AS total,
             ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'missed') / NULLIF(COUNT(*), 0), 1) AS miss_rate_pct
      FROM medication_administrations
      WHERE organization_id = :orgId AND scheduled_time >= :since
      GROUP BY medication_name
      HAVING COUNT(*) >= 5
      ORDER BY miss_rate_pct DESC LIMIT 10
    `, { orgId: organizationId, since }),
    q(`
      SELECT DATE(scheduled_time) AS day,
             COUNT(*) FILTER (WHERE status = 'administered') AS administered,
             COUNT(*) AS total,
             ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'administered') / NULLIF(COUNT(*), 0), 1) AS compliance_pct
      FROM medication_administrations
      WHERE organization_id = :orgId AND scheduled_time >= :since
      GROUP BY DATE(scheduled_time) ORDER BY day
    `, { orgId: organizationId, since }),
  ]);

  return {
    reportType: 'emar_compliance',
    periodDays: days,
    generatedAt: new Date().toISOString(),
    summary: {
      administered:           Number(overall?.administered           || 0),
      missed:                 Number(overall?.missed                 || 0),
      held:                   Number(overall?.held                   || 0),
      pending:                Number(overall?.pending                || 0),
      total:                  Number(overall?.total                  || 0),
      compliancePct:          Number(overall?.compliance_pct         || 0),
      highAlertAdministered:  Number(overall?.high_alert_administered || 0),
      highAlertTotal:         Number(overall?.high_alert_total       || 0),
      highAlertCompliancePct: overall?.high_alert_total > 0
        ? Math.round(100 * Number(overall?.high_alert_administered) / Number(overall?.high_alert_total)) : 0,
    },
    byWard, highMissRateMedications: byMedication, dailyTrend: overdueHistory,
  };
}

export async function getReadmissionRiskReport(organizationId, { days = 30 } = {}) {
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const [readmissions, byDiagnosis, byDoctor, timeline] = await Promise.all([
    qOne(`
      SELECT
        COUNT(*) FILTER (WHERE readmission_flag = TRUE) AS readmitted,
        COUNT(*) AS total_discharges,
        ROUND(100.0 * COUNT(*) FILTER (WHERE readmission_flag = TRUE) / NULLIF(COUNT(*), 0), 1) AS readmission_pct,
        ROUND(AVG(EXTRACT(EPOCH FROM (admitted_at - lag_discharge))/86400) FILTER (WHERE readmission_flag = TRUE), 1) AS avg_days_to_readmit
      FROM (
        SELECT id, readmission_flag, admitted_at,
               LAG(discharged_at) OVER (PARTITION BY patient_id ORDER BY admitted_at) AS lag_discharge
        FROM ip_admissions
        WHERE organization_id = :orgId AND status = 'discharged' AND discharged_at >= :since
      ) t
    `, { orgId: organizationId, since }),
    q(`
      SELECT diagnosis, COUNT(*) AS total,
             COUNT(*) FILTER (WHERE readmission_flag = TRUE) AS readmitted,
             ROUND(100.0 * COUNT(*) FILTER (WHERE readmission_flag = TRUE) / NULLIF(COUNT(*), 0), 1) AS rate_pct
      FROM ip_admissions
      WHERE organization_id = :orgId AND status = 'discharged' AND discharged_at >= :since AND diagnosis IS NOT NULL
      GROUP BY diagnosis HAVING COUNT(*) >= 3
      ORDER BY rate_pct DESC LIMIT 10
    `, { orgId: organizationId, since }),
    q(`
      SELECT d.first_name || ' ' || d.last_name AS doctor_name,
             COUNT(a.id) AS total,
             COUNT(a.id) FILTER (WHERE a.readmission_flag = TRUE) AS readmitted
      FROM ip_admissions a
      LEFT JOIN doctors d ON d.id = a.admitting_doctor_id
      WHERE a.organization_id = :orgId AND a.status = 'discharged' AND a.discharged_at >= :since
        AND a.admitting_doctor_id IS NOT NULL
      GROUP BY d.first_name, d.last_name HAVING COUNT(a.id) >= 5
      ORDER BY COUNT(a.id) FILTER (WHERE a.readmission_flag = TRUE) DESC LIMIT 10
    `, { orgId: organizationId, since }),
    q(`
      SELECT DATE_TRUNC('week', discharged_at) AS week,
             COUNT(*) AS discharges,
             COUNT(*) FILTER (WHERE readmission_flag = TRUE) AS readmissions
      FROM ip_admissions
      WHERE organization_id = :orgId AND status = 'discharged' AND discharged_at >= :since
      GROUP BY week ORDER BY week
    `, { orgId: organizationId, since }),
  ]);

  return {
    reportType: 'readmission_risk',
    periodDays: days,
    generatedAt: new Date().toISOString(),
    summary: {
      totalDischarges:    Number(readmissions?.total_discharges   || 0),
      readmitted:         Number(readmissions?.readmitted         || 0),
      readmissionPct:     Number(readmissions?.readmission_pct    || 0),
      avgDaysToReadmit:   Number(readmissions?.avg_days_to_readmit || 0),
      industryTarget:     8,
      onTarget:           Number(readmissions?.readmission_pct || 0) <= 8,
    },
    highRiskDiagnoses: byDiagnosis, byDoctor, weeklyTrend: timeline,
  };
}

export async function getExecutiveDailyDigest(organizationId) {
  const [census, admissions, discharges, critAlerts, emarCompliance, otToday, pendingPreauth] =
    await Promise.all([
      qOne(`SELECT COUNT(*) FILTER (WHERE status='occupied') AS occupied, COUNT(*) FILTER (WHERE status='available') AS available, COUNT(*) AS total FROM beds WHERE organization_id=:orgId`, { orgId: organizationId }),
      qOne(`SELECT COUNT(*) AS count FROM adt_events WHERE organization_id=:orgId AND event_type='admitted' AND DATE(performed_at)=CURRENT_DATE`, { orgId: organizationId }),
      qOne(`SELECT COUNT(*) AS count FROM adt_events WHERE organization_id=:orgId AND event_type='discharged' AND DATE(performed_at)=CURRENT_DATE`, { orgId: organizationId }),
      qOne(`SELECT COUNT(*) AS count FROM vital_alerts WHERE organization_id=:orgId AND status='active' AND severity IN('red','orange')`, { orgId: organizationId }),
      qOne(`SELECT ROUND(100.0*COUNT(*) FILTER (WHERE status='administered')/NULLIF(COUNT(*),0),1) AS pct FROM medication_administrations WHERE organization_id=:orgId AND DATE(scheduled_time)=CURRENT_DATE`, { orgId: organizationId }),
      qOne(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status='completed') AS done FROM ot_bookings WHERE organization_id=:orgId AND DATE(scheduled_start)=CURRENT_DATE`, { orgId: organizationId }),
      qOne(`SELECT COUNT(*) AS count FROM hmis_preauth_requests WHERE organization_id=:orgId AND status IN('draft','pending','submitted')`, { orgId: organizationId }),
    ]);

  return {
    reportType: 'executive_daily_digest',
    date: new Date().toISOString().split('T')[0],
    generatedAt: new Date().toISOString(),
    headline: {
      occupancyPct: census?.total > 0 ? Math.round(100 * Number(census.occupied) / Number(census.total)) : 0,
      todayAdmissions:   Number(admissions?.count  || 0),
      todayDischarges:   Number(discharges?.count  || 0),
      activeCritAlerts:  Number(critAlerts?.count  || 0),
      emarCompliancePct: Number(emarCompliance?.pct || 0),
      otCasesTotal:      Number(otToday?.total     || 0),
      otCasesDone:       Number(otToday?.done      || 0),
      pendingPreauths:   Number(pendingPreauth?.count || 0),
    },
    alerts: [
      ...(Number(critAlerts?.count) > 5    ? [{ level: 'critical', message: `${critAlerts.count} unacknowledged critical alerts` }] : []),
      ...(Number(emarCompliance?.pct) < 90 ? [{ level: 'warning',  message: `eMAR compliance at ${emarCompliance?.pct}% (target 95%)` }] : []),
      ...(Number(pendingPreauth?.count) > 10 ? [{ level: 'warning', message: `${pendingPreauth.count} pre-auth requests pending action` }] : []),
    ],
  };
}

export async function getPreAuthStatusReport(organizationId, { days = 30 } = {}) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const [summary, byStatus, byInsurer] = await Promise.all([
    qOne(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status='approved') AS approved, COUNT(*) FILTER (WHERE status='denied') AS denied, COUNT(*) FILTER (WHERE status IN('pending','submitted')) AS pending, ROUND(AVG(estimated_amount),2) AS avg_amount, ROUND(SUM(approved_amount) FILTER (WHERE status='approved'),2) AS total_approved_amount FROM hmis_preauth_requests WHERE organization_id=:orgId AND created_at>=:since`, { orgId: organizationId, since }),
    q(`SELECT status, COUNT(*) AS count, ROUND(AVG(estimated_amount),2) AS avg_amount FROM hmis_preauth_requests WHERE organization_id=:orgId AND created_at>=:since GROUP BY status ORDER BY count DESC`, { orgId: organizationId, since }),
    q(`SELECT insurer_name, COUNT(*) AS total, COUNT(*) FILTER (WHERE status='approved') AS approved, COUNT(*) FILTER (WHERE status='denied') AS denied FROM hmis_preauth_requests WHERE organization_id=:orgId AND created_at>=:since AND insurer_name IS NOT NULL GROUP BY insurer_name ORDER BY total DESC LIMIT 10`, { orgId: organizationId, since }),
  ]);

  return {
    reportType: 'preauth_status',
    periodDays: days,
    generatedAt: new Date().toISOString(),
    summary: {
      total:               Number(summary?.total                || 0),
      approved:            Number(summary?.approved             || 0),
      denied:              Number(summary?.denied               || 0),
      pending:             Number(summary?.pending              || 0),
      approvalRate:        summary?.total > 0 ? Math.round(100 * Number(summary.approved) / Number(summary.total)) : 0,
      avgEstimatedAmount:  Number(summary?.avg_amount           || 0),
      totalApprovedAmount: Number(summary?.total_approved_amount || 0),
    },
    byStatus, byInsurer,
  };
}
