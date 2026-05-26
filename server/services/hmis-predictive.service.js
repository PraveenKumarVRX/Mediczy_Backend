/**
 * HMIS Predictive Analytics Service
 * Statistical ML proxies for readmission risk, LOS prediction,
 * discharge delay forecasting, KPI anomaly detection, and trend analysis.
 * All computations are SQL-based statistical models — no external ML runtime required.
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';

async function q(sql, replacements = {}) {
  try { return await sequelize.query(sql, { replacements, type: QueryTypes.SELECT }); }
  catch { return []; }
}
async function qOne(sql, replacements = {}) { const r = await q(sql, replacements); return r[0] || null; }

// ── Readmission Risk Scoring ──────────────────────────────────────────────────
// Logistic regression proxy: score 0-100 from clinical risk factors

export async function getReadmissionRiskScores(organizationId, { limit = 50 } = {}) {
  // Score each active/recently discharged patient
  const patients = await q(`
    SELECT
      a.id AS admission_id,
      a.patient_id,
      a.admitted_at,
      a.discharged_at,
      a.diagnosis,
      a.admission_type,
      EXTRACT(YEAR FROM AGE(u.date_of_birth))::int AS age,
      -- Prior admissions in last 12 months
      (SELECT COUNT(*) FROM ip_admissions prev
       WHERE prev.patient_id = a.patient_id
         AND prev.id != a.id
         AND prev.admitted_at >= NOW() - INTERVAL '12 months') AS prior_admissions_12m,
      -- LOS in days
      EXTRACT(EPOCH FROM (COALESCE(a.discharged_at, NOW()) - a.admitted_at))/86400 AS los_days,
      -- Comorbidity proxy: number of ICD codes
      COALESCE(jsonb_array_length(a.icd_codes::jsonb), 0) AS comorbidity_count,
      -- ICU flag
      EXISTS(SELECT 1 FROM icu_admissions ic WHERE ic.admission_id = a.id) AS had_icu,
      -- Emergency admission
      (a.admission_type = 'emergency') AS is_emergency
    FROM ip_admissions a
    LEFT JOIN users u ON u.id = a.patient_id
    WHERE a.organization_id = :orgId
      AND (a.status = 'discharged' AND a.discharged_at >= NOW() - INTERVAL '30 days'
           OR a.status = 'active')
    ORDER BY a.admitted_at DESC
    LIMIT :limit
  `, { orgId: organizationId, limit });

  return patients.map(p => {
    // Weighted risk factors (clinical literature-based weights)
    let score = 0;
    const age = Number(p.age || 0);
    const prior = Number(p.prior_admissions_12m || 0);
    const los   = Number(p.los_days || 0);
    const comorbidities = Number(p.comorbidity_count || 0);

    if (age >= 75)       score += 20;
    else if (age >= 65)  score += 12;
    else if (age >= 50)  score += 5;

    if (prior >= 3)      score += 25;
    else if (prior >= 2) score += 18;
    else if (prior >= 1) score += 10;

    if (los >= 14)       score += 15;
    else if (los >= 7)   score += 8;

    if (comorbidities >= 4) score += 15;
    else if (comorbidities >= 2) score += 8;

    if (p.had_icu)       score += 15;
    if (p.is_emergency)  score += 10;

    score = Math.min(100, score);
    const risk = score >= 60 ? 'high' : score >= 35 ? 'medium' : 'low';

    return {
      admissionId:       p.admission_id,
      patientId:         p.patient_id,
      readmissionScore:  score,
      riskLevel:         risk,
      factors: {
        age,
        priorAdmissions:  prior,
        losDays:          Number(los.toFixed(1)),
        comorbidities,
        hadICU:           Boolean(p.had_icu),
        isEmergency:      Boolean(p.is_emergency),
      }
    };
  });
}

// ── LOS Prediction ────────────────────────────────────────────────────────────
// Predict expected LOS for active admissions based on historical cohort patterns

export async function getPredictedLOS(organizationId) {
  // Get cohort averages by admission type + diagnosis category
  const cohortAvg = await q(`
    SELECT
      admission_type,
      COALESCE(LEFT(diagnosis, 3), 'UNK') AS diag_prefix,
      ROUND(AVG(EXTRACT(EPOCH FROM (discharged_at - admitted_at))/86400), 1) AS avg_los,
      COUNT(*) AS sample_n
    FROM ip_admissions
    WHERE organization_id = :orgId
      AND status = 'discharged'
      AND discharged_at >= NOW() - INTERVAL '90 days'
      AND discharged_at IS NOT NULL
    GROUP BY admission_type, diag_prefix
    HAVING COUNT(*) >= 3
  `, { orgId: organizationId });

  const cohortMap = {};
  for (const c of cohortAvg) {
    cohortMap[`${c.admission_type}:${c.diag_prefix}`] = Number(c.avg_los);
  }

  // Get active admissions
  const active = await q(`
    SELECT
      a.id AS admission_id, a.patient_id, a.admission_type,
      a.admitted_at, a.diagnosis,
      EXTRACT(EPOCH FROM (NOW() - a.admitted_at))/86400 AS current_los_days,
      w.name AS ward_name
    FROM ip_admissions a
    LEFT JOIN wards w ON w.id = a.ward_id
    WHERE a.organization_id = :orgId AND a.status = 'active'
    ORDER BY a.admitted_at
  `, { orgId: organizationId });

  return active.map(a => {
    const diagPrefix = (a.diagnosis || '').slice(0, 3) || 'UNK';
    const key = `${a.admission_type}:${diagPrefix}`;
    const predictedLOS = cohortMap[key] || cohortMap[`${a.admission_type}:UNK`] || 4.0;
    const currentLOS   = Number((a.current_los_days || 0).toFixed(1));
    const remainingDays = Math.max(0, predictedLOS - currentLOS);
    const expectedDischargeDate = new Date(Date.now() + remainingDays * 86400000).toISOString().split('T')[0];

    return {
      admissionId:          a.admission_id,
      patientId:            a.patient_id,
      wardName:             a.ward_name,
      currentLOSDays:       currentLOS,
      predictedLOSDays:     predictedLOS,
      remainingDays:        Number(remainingDays.toFixed(1)),
      expectedDischargeDate,
      status: remainingDays <= 0 ? 'overdue' : remainingDays <= 1 ? 'due_soon' : 'on_track',
    };
  });
}

// ── Discharge Delay Forecasting ───────────────────────────────────────────────
// Identify likely delayed discharges before they happen

export async function getDischargeDelayForecast(organizationId) {
  const forecasts = await q(`
    SELECT
      a.id AS admission_id,
      a.patient_id,
      a.admitted_at,
      w.name AS ward_name,
      -- Readiness completion ratio
      COUNT(r.id) FILTER (WHERE r.is_complete = TRUE)  AS completed_items,
      COUNT(r.id)                                        AS total_items,
      COUNT(r.id) FILTER (WHERE r.mandatory = TRUE AND r.is_complete = FALSE) AS blocking_items,
      -- Billing clearance
      EXISTS(SELECT 1 FROM billing_estimates be
             WHERE be.admission_id = a.id AND be.status = 'approved') AS billing_cleared,
      -- Pre-auth status
      EXISTS(SELECT 1 FROM hmis_preauth_requests pr
             WHERE pr.admission_id = a.id AND pr.status IN ('submitted','pending','draft')) AS preauth_pending
    FROM ip_admissions a
    LEFT JOIN wards w ON w.id = a.ward_id
    LEFT JOIN discharge_readiness_items r ON r.admission_id = a.id
    WHERE a.organization_id = :orgId AND a.status = 'active'
    GROUP BY a.id, a.patient_id, a.admitted_at, w.name
    HAVING COUNT(r.id) > 0
  `, { orgId: organizationId });

  return forecasts.map(f => {
    const readinessPct = f.total_items > 0
      ? Math.round(100 * Number(f.completed_items) / Number(f.total_items)) : 0;
    const blockingItems = Number(f.blocking_items || 0);
    const losDays = (Date.now() - new Date(f.admitted_at).getTime()) / 86400000;

    let delayRisk = 'low';
    const blockers = [];
    if (blockingItems > 0)     { delayRisk = 'high';   blockers.push(`${blockingItems} mandatory readiness items pending`); }
    if (f.preauth_pending)     { delayRisk = delayRisk === 'low' ? 'medium' : delayRisk; blockers.push('Pre-auth not resolved'); }
    if (!f.billing_cleared)    { if (delayRisk === 'low') delayRisk = 'medium'; blockers.push('Billing estimate not approved'); }
    if (readinessPct < 50 && losDays > 5) { if (delayRisk === 'low') delayRisk = 'medium'; }

    return {
      admissionId:    f.admission_id,
      patientId:      f.patient_id,
      wardName:       f.ward_name,
      readinessPct,
      blockingItems,
      billingCleared: Boolean(f.billing_cleared),
      preauthPending: Boolean(f.preauth_pending),
      delayRisk,
      blockers,
      losDays:        Number(losDays.toFixed(1)),
    };
  });
}

// ── KPI Anomaly Detection ─────────────────────────────────────────────────────
// Compare current KPIs to rolling 7-day average; flag deviations > 1.5 std dev

export async function getKPIAnomalies(organizationId) {
  const anomalies = [];

  // Daily bed occupancy for last 14 days
  const occupancyTrend = await q(`
    SELECT
      DATE(e.performed_at) AS day,
      COUNT(DISTINCT e.admission_id) AS admissions
    FROM adt_events e
    WHERE e.organization_id = :orgId
      AND e.event_type = 'admitted'
      AND e.performed_at >= NOW() - INTERVAL '14 days'
    GROUP BY DATE(e.performed_at)
    ORDER BY day
  `, { orgId: organizationId });

  if (occupancyTrend.length >= 7) {
    const values = occupancyTrend.map(r => Number(r.admissions));
    const baseline = values.slice(0, values.length - 1);
    const mean = baseline.reduce((a, b) => a + b, 0) / baseline.length;
    const variance = baseline.reduce((a, b) => a + (b - mean) ** 2, 0) / baseline.length;
    const stdDev = Math.sqrt(variance);
    const latest = values[values.length - 1];
    const zScore = stdDev > 0 ? (latest - mean) / stdDev : 0;
    if (Math.abs(zScore) > 1.5) {
      anomalies.push({
        metric: 'daily_admissions',
        current: latest,
        baseline: Number(mean.toFixed(1)),
        stdDev: Number(stdDev.toFixed(1)),
        zScore: Number(zScore.toFixed(2)),
        direction: zScore > 0 ? 'spike' : 'drop',
        severity: Math.abs(zScore) > 2.5 ? 'critical' : 'warning',
        message: `Daily admissions ${zScore > 0 ? 'surged to' : 'dropped to'} ${latest} (baseline ${mean.toFixed(1)} ± ${stdDev.toFixed(1)})`
      });
    }
  }

  // Alert acknowledgement time anomaly
  const ackTrend = await q(`
    SELECT
      DATE(created_at) AS day,
      ROUND(AVG(EXTRACT(EPOCH FROM (acknowledged_at - created_at))/60), 1) AS avg_ack_min
    FROM vital_alerts
    WHERE organization_id = :orgId
      AND acknowledged_at IS NOT NULL
      AND created_at >= NOW() - INTERVAL '14 days'
    GROUP BY DATE(created_at)
    ORDER BY day
  `, { orgId: organizationId });

  if (ackTrend.length >= 5) {
    const values = ackTrend.map(r => Number(r.avg_ack_min));
    const baseline = values.slice(0, -1);
    const mean = baseline.reduce((a, b) => a + b, 0) / baseline.length;
    const variance = baseline.reduce((a, b) => a + (b - mean) ** 2, 0) / baseline.length;
    const stdDev = Math.sqrt(variance);
    const latest = values[values.length - 1];
    const zScore = stdDev > 0 ? (latest - mean) / stdDev : 0;
    if (zScore > 1.5) {
      anomalies.push({
        metric: 'alert_ack_time_minutes',
        current: latest,
        baseline: Number(mean.toFixed(1)),
        stdDev: Number(stdDev.toFixed(1)),
        zScore: Number(zScore.toFixed(2)),
        direction: 'spike',
        severity: zScore > 2.5 ? 'critical' : 'warning',
        message: `Alert acknowledgement time rose to ${latest} min (baseline ${mean.toFixed(1)} min) — clinical response time degraded`
      });
    }
  }

  return { generatedAt: new Date().toISOString(), anomalyCount: anomalies.length, anomalies };
}

// ── Daily KPI Trend ───────────────────────────────────────────────────────────

export async function getDailyTrend(organizationId, { days = 14, metric = 'admissions' } = {}) {
  const metricQueries = {
    admissions: `
      SELECT DATE(performed_at) AS day, COUNT(DISTINCT admission_id) AS value
      FROM adt_events
      WHERE organization_id = :orgId AND event_type = 'admitted'
        AND performed_at >= NOW() - INTERVAL ':days days'
      GROUP BY DATE(performed_at) ORDER BY day`,
    discharges: `
      SELECT DATE(performed_at) AS day, COUNT(DISTINCT admission_id) AS value
      FROM adt_events
      WHERE organization_id = :orgId AND event_type = 'discharged'
        AND performed_at >= NOW() - INTERVAL ':days days'
      GROUP BY DATE(performed_at) ORDER BY day`,
    ot_cases: `
      SELECT scheduled_start::date AS day, COUNT(*) AS value
      FROM ot_bookings
      WHERE organization_id = :orgId
        AND scheduled_start >= NOW() - INTERVAL ':days days'
      GROUP BY scheduled_start::date ORDER BY day`,
    critical_alerts: `
      SELECT DATE(created_at) AS day, COUNT(*) AS value
      FROM vital_alerts
      WHERE organization_id = :orgId AND severity IN ('red','orange')
        AND created_at >= NOW() - INTERVAL ':days days'
      GROUP BY DATE(created_at) ORDER BY day`,
  };

  const sql = metricQueries[metric] || metricQueries.admissions;
  const rows = await q(sql.replace(':days', days), { orgId: organizationId });
  return { metric, days, trend: rows.map(r => ({ day: r.day, value: Number(r.value) })) };
}

// ── Ward & Doctor Drill-Down ──────────────────────────────────────────────────

export async function getWardDrillDown(organizationId, { wardId, days = 30 } = {}) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const wardFilter = wardId ? 'AND a.ward_id = :wardId' : '';

  const [census, los, complications, emar] = await Promise.all([
    qOne(`
      SELECT
        w.name AS ward_name,
        COUNT(b.id) FILTER (WHERE b.status = 'occupied')  AS occupied_beds,
        COUNT(b.id) FILTER (WHERE b.status = 'available') AS available_beds,
        COUNT(b.id)                                        AS total_beds,
        COUNT(a.id) FILTER (WHERE a.status = 'active')    AS active_admissions
      FROM wards w
      LEFT JOIN beds b ON b.ward_id = w.id
      LEFT JOIN ip_admissions a ON a.ward_id = w.id
      WHERE w.organization_id = :orgId ${wardId ? 'AND w.id = :wardId' : ''}
      GROUP BY w.name
      LIMIT 1
    `, { orgId: organizationId, wardId }),

    qOne(`
      SELECT
        ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(discharged_at, NOW()) - admitted_at))/86400), 1) AS avg_los,
        COUNT(*) AS discharges
      FROM ip_admissions a
      WHERE organization_id = :orgId ${wardFilter}
        AND admitted_at >= :since
    `, { orgId: organizationId, wardId, since }),

    q(`
      SELECT
        DATE_TRUNC('week', a.admitted_at) AS week,
        COUNT(*) AS total_admissions,
        COUNT(*) FILTER (WHERE a.readmission_flag = TRUE) AS readmissions
      FROM ip_admissions a
      WHERE a.organization_id = :orgId ${wardFilter}
        AND a.admitted_at >= :since
      GROUP BY week ORDER BY week
    `, { orgId: organizationId, wardId, since }),

    qOne(`
      SELECT
        COUNT(*) FILTER (WHERE ma.status = 'administered') AS administered,
        COUNT(*) AS total,
        ROUND(100.0 * COUNT(*) FILTER (WHERE ma.status = 'administered') / NULLIF(COUNT(*), 0), 1) AS compliance_pct
      FROM medication_administrations ma
      JOIN ip_admissions a ON a.id = ma.admission_id
      WHERE ma.organization_id = :orgId ${wardFilter}
        AND ma.scheduled_time >= :since
    `, { orgId: organizationId, wardId, since }),
  ]);

  return {
    wardId, periodDays: days,
    census, los, weeklyTrend: complications,
    emarCompliance: emar,
  };
}

export async function getDoctorPerformance(organizationId, { days = 30 } = {}) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  return q(`
    SELECT
      a.admitting_doctor_id AS doctor_id,
      d.first_name || ' ' || d.last_name AS doctor_name,
      COUNT(a.id) AS total_admissions,
      ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(a.discharged_at, NOW()) - a.admitted_at))/86400), 1) AS avg_los,
      COUNT(a.id) FILTER (WHERE a.readmission_flag = TRUE) AS readmissions,
      COUNT(dp.id) FILTER (WHERE dp.ai_assisted = TRUE) AS ai_discharge_drafts,
      COUNT(dp.id) AS total_discharge_packets
    FROM ip_admissions a
    LEFT JOIN doctors d ON d.id = a.admitting_doctor_id
    LEFT JOIN discharge_packets dp ON dp.admission_id = a.id
    WHERE a.organization_id = :orgId
      AND a.admitted_at >= :since
      AND a.admitting_doctor_id IS NOT NULL
    GROUP BY a.admitting_doctor_id, d.first_name, d.last_name
    ORDER BY total_admissions DESC
    LIMIT 20
  `, { orgId: organizationId, since });
}

export async function getBenchmarks(organizationId) {
  // Compare current 7-day performance to 30-day baseline
  const [curr, base] = await Promise.all([
    qOne(`
      SELECT
        ROUND(AVG(EXTRACT(EPOCH FROM (discharged_at - admitted_at))/86400), 1) AS avg_los,
        COUNT(*) AS discharges
      FROM ip_admissions
      WHERE organization_id = :orgId AND status = 'discharged'
        AND discharged_at >= NOW() - INTERVAL '7 days'
    `, { orgId: organizationId }),
    qOne(`
      SELECT
        ROUND(AVG(EXTRACT(EPOCH FROM (discharged_at - admitted_at))/86400), 1) AS avg_los,
        COUNT(*) AS discharges
      FROM ip_admissions
      WHERE organization_id = :orgId AND status = 'discharged'
        AND discharged_at >= NOW() - INTERVAL '30 days'
    `, { orgId: organizationId }),
  ]);

  const losChange = curr?.avg_los && base?.avg_los
    ? Number((Number(curr.avg_los) - Number(base.avg_los)).toFixed(1)) : 0;

  return {
    generatedAt: new Date().toISOString(),
    los: {
      current7d:    Number(curr?.avg_los   || 0),
      baseline30d:  Number(base?.avg_los   || 0),
      change:       losChange,
      trend:        losChange > 0.5 ? 'worsening' : losChange < -0.5 ? 'improving' : 'stable',
    },
    industryBenchmarks: {
      generalWardLOS:   4.5,
      icuLOS:           3.2,
      surgicalLOS:      5.1,
      erDoorToTriage:   5,
      dischargeTAT:     30,
      emarCompliance:   95,
      readmission30d:   8,
    }
  };
}
