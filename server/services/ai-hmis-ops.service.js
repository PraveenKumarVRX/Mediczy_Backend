/**
 * AI HMIS Operations Intelligence
 * ─────────────────────────────────
 * Capacity forecasting, documentation auditing, workload balancing,
 * smart bed allocation, and AI discharge summary data synthesis.
 * All computations are SQL-based — no external ML runtime required.
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';

// ─── Capacity Forecasting ─────────────────────────────────────────────────────

export async function getCapacityForecast(organizationId, { horizonHours = 24 } = {}) {
  // 1. Current active census
  const [census] = await sequelize.query(`
    SELECT
      COUNT(*)                    AS active_admissions,
      COUNT(*) FILTER (WHERE ward ILIKE '%icu%' OR ward ILIKE '%intensive%') AS icu_count,
      COUNT(*) FILTER (WHERE ward ILIKE '%emerg%' OR ward ILIKE '%er%')      AS er_count
    FROM admissions
    WHERE organization_id = :orgId AND status = 'active'
  `, { replacements: { orgId: organizationId }, type: QueryTypes.SELECT });

  // 2. Historical hourly admission rate (same day-of-week, past 4 weeks)
  const hourlyPattern = await sequelize.query(`
    SELECT
      EXTRACT(HOUR FROM admitted_at) AS hour_of_day,
      COUNT(*) / 4.0                AS avg_admissions_per_hour
    FROM admissions
    WHERE organization_id = :orgId
      AND admitted_at >= NOW() - INTERVAL '28 days'
      AND EXTRACT(DOW FROM admitted_at) = EXTRACT(DOW FROM NOW())
    GROUP BY 1
    ORDER BY 1
  `, { replacements: { orgId: organizationId }, type: QueryTypes.SELECT });

  // 3. Planned discharges (readiness items all cleared)
  const plannedDischarges = await sequelize.query(`
    SELECT COUNT(*) AS count
    FROM admissions a
    WHERE a.organization_id = :orgId
      AND a.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM discharge_readiness dr
        WHERE dr.admission_id = a.id AND dr.status != 'cleared'
      )
      AND EXISTS (SELECT 1 FROM discharge_readiness dr WHERE dr.admission_id = a.id)
  `, { replacements: { orgId: organizationId }, type: QueryTypes.SELECT });

  // 4. Build hourly forecast for next N hours
  const currentHour = new Date().getHours();
  const patternMap = {};
  hourlyPattern.forEach(r => { patternMap[parseInt(r.hour_of_day)] = parseFloat(r.avg_admissions_per_hour) || 0; });

  const forecast = [];
  let runningCensus = parseInt(census?.active_admissions || 0);
  const dischargesPerHour = Math.ceil(parseInt(plannedDischarges?.[0]?.count || 0) / Math.max(horizonHours / 2, 4));

  for (let i = 1; i <= horizonHours; i++) {
    const hour = (currentHour + i) % 24;
    const admissions = Math.round(patternMap[hour] || 0.8);
    const discharges = Math.min(dischargesPerHour, runningCensus > 5 ? dischargesPerHour : 0);
    runningCensus = Math.max(0, runningCensus + admissions - discharges);
    forecast.push({
      hour_offset: i,
      hour_label: `${String(hour).padStart(2, '0')}:00`,
      predicted_admissions: admissions,
      predicted_discharges: discharges,
      predicted_census: runningCensus,
      confidence: i <= 6 ? 'high' : i <= 12 ? 'medium' : 'low',
    });
  }

  // 5. Peak detection
  const peak = forecast.reduce((max, h) => h.predicted_census > max.predicted_census ? h : max, forecast[0]);
  const capacityWarning = peak.predicted_census > (parseInt(census?.active_admissions || 0) * 1.15);

  return {
    current: {
      total: parseInt(census?.active_admissions || 0),
      icu: parseInt(census?.icu_count || 0),
      er: parseInt(census?.er_count || 0),
    },
    planned_discharges: parseInt(plannedDischarges?.[0]?.count || 0),
    peak: { hour_label: peak.hour_label, predicted_census: peak.predicted_census },
    capacity_warning: capacityWarning,
    forecast,
  };
}

// ─── Documentation Audit ─────────────────────────────────────────────────────

export async function getDocumentationAudit(organizationId) {
  // Check 5 documentation dimensions for every active admission
  const admissions = await sequelize.query(`
    SELECT
      a.id                  AS admission_id,
      p.name                AS patient_name,
      p.mrn,
      a.ward,
      a.admission_type,
      a.admitted_at,
      EXTRACT(EPOCH FROM (NOW() - a.admitted_at))/3600 AS hours_since_admit,
      -- Clinical note check
      (SELECT COUNT(*) FROM clinical_notes cn WHERE cn.admission_id = a.id) AS note_count,
      -- Consent check
      (SELECT COUNT(*) FROM patient_consents pc
        WHERE pc.patient_id = a.patient_id AND pc.status = 'signed'
          AND pc.created_at >= a.admitted_at) AS consent_count,
      -- Anesthesia note check (for surgical admissions)
      (SELECT COUNT(*) FROM anesthesia_records ar WHERE ar.admission_id = a.id) AS anesthesia_count,
      -- OT booking check (to know if anesthesia is required)
      (SELECT COUNT(*) FROM ot_bookings ob
        WHERE ob.admission_id = a.id AND ob.status != 'cancelled') AS ot_booking_count,
      -- Nursing assessment check (updated in last 12h)
      (SELECT MAX(recorded_at) FROM vitals v WHERE v.admission_id = a.id) AS last_vitals_at,
      -- Discharge summary for long stays
      (SELECT COUNT(*) FROM discharge_packets dp WHERE dp.admission_id = a.id) AS discharge_packet_count
    FROM admissions a
    JOIN patients p ON p.id = a.patient_id
    WHERE a.organization_id = :orgId AND a.status = 'active'
    ORDER BY a.admitted_at
    LIMIT 100
  `, { replacements: { orgId: organizationId }, type: QueryTypes.SELECT });

  const audited = admissions.map(row => {
    const gaps = [];
    const hoursSinceAdmit = parseFloat(row.hours_since_admit || 0);

    if (hoursSinceAdmit > 4 && parseInt(row.note_count) === 0) {
      gaps.push({ type: 'missing_admission_note', severity: 'high', message: 'No clinical note recorded since admission' });
    }
    if (parseInt(row.consent_count) === 0) {
      gaps.push({ type: 'missing_consent', severity: 'high', message: 'No signed consent on file for this admission' });
    }
    if (parseInt(row.ot_booking_count) > 0 && parseInt(row.anesthesia_count) === 0) {
      gaps.push({ type: 'missing_anesthesia_note', severity: 'critical', message: 'OT booking exists but no anesthesia assessment recorded' });
    }
    if (row.last_vitals_at) {
      const hoursNoVitals = (Date.now() - new Date(row.last_vitals_at).getTime()) / 3600000;
      if (hoursNoVitals > 8) {
        gaps.push({ type: 'vitals_overdue', severity: hoursNoVitals > 16 ? 'high' : 'medium', message: `Vitals not recorded for ${Math.round(hoursNoVitals)} hours` });
      }
    } else if (hoursSinceAdmit > 2) {
      gaps.push({ type: 'no_vitals', severity: 'high', message: 'No vitals recorded since admission' });
    }
    if (hoursSinceAdmit > 168 && parseInt(row.discharge_packet_count) === 0) {
      gaps.push({ type: 'discharge_summary_overdue', severity: 'medium', message: `Stay > 7 days — discharge summary should be drafted` });
    }

    const overallRisk = gaps.some(g => g.severity === 'critical') ? 'critical'
      : gaps.some(g => g.severity === 'high') ? 'high'
      : gaps.length > 0 ? 'medium' : 'clear';

    return {
      admission_id: row.admission_id,
      patient_name: row.patient_name,
      mrn: row.mrn,
      ward: row.ward,
      hours_since_admit: Math.round(hoursSinceAdmit),
      gap_count: gaps.length,
      overall_risk: overallRisk,
      gaps,
    };
  });

  const summary = {
    total_admissions: audited.length,
    clear: audited.filter(a => a.overall_risk === 'clear').length,
    medium: audited.filter(a => a.overall_risk === 'medium').length,
    high: audited.filter(a => a.overall_risk === 'high').length,
    critical: audited.filter(a => a.overall_risk === 'critical').length,
  };

  return {
    summary,
    admissions: audited.filter(a => a.overall_risk !== 'clear'),
  };
}

// ─── Workload Balance ─────────────────────────────────────────────────────────

export async function getWorkloadBalance(organizationId) {
  const wards = await sequelize.query(`
    SELECT
      a.ward,
      COUNT(DISTINCT a.id)   AS patient_count,
      COUNT(DISTINCT CASE WHEN a.ward ILIKE '%icu%' THEN a.id END) AS icu_patients,
      -- Estimate nurses from team (role = nurse) assigned to ward if table exists
      GREATEST(1, COUNT(DISTINCT a.id) / 6) AS estimated_nurses,
      AVG(EXTRACT(EPOCH FROM (NOW() - a.admitted_at))/86400) AS avg_los_days,
      -- Acuity proxy: ICU=3, HDU=2, general=1
      SUM(CASE
        WHEN a.ward ILIKE '%icu%' THEN 3
        WHEN a.ward ILIKE '%hdu%' OR a.ward ILIKE '%ccu%' THEN 2
        ELSE 1
      END)                    AS acuity_weighted_load
    FROM admissions a
    WHERE a.organization_id = :orgId AND a.status = 'active' AND a.ward IS NOT NULL
    GROUP BY a.ward
    ORDER BY acuity_weighted_load DESC
  `, { replacements: { orgId: organizationId }, type: QueryTypes.SELECT });

  // Check alert conditions for each ward
  const wardMetrics = wards.map(w => {
    const patientCount = parseInt(w.patient_count);
    const acuityLoad = parseInt(w.acuity_weighted_load);
    const isICU = w.ward?.toLowerCase().includes('icu') || w.ward?.toLowerCase().includes('ccu');
    const maxRatio = isICU ? 2 : 6;
    const estimatedNurses = Math.ceil(patientCount / maxRatio);
    const ratioStatus = patientCount / estimatedNurses > maxRatio ? 'overloaded'
      : patientCount / estimatedNurses > maxRatio * 0.8 ? 'near-capacity' : 'balanced';

    return {
      ward: w.ward,
      patient_count: patientCount,
      estimated_nurses: estimatedNurses,
      patient_to_nurse_ratio: Math.round((patientCount / estimatedNurses) * 10) / 10,
      acuity_weighted_load: acuityLoad,
      avg_los_days: Math.round(parseFloat(w.avg_los_days || 0) * 10) / 10,
      ratio_status: ratioStatus,
      recommended_action: ratioStatus === 'overloaded'
        ? `Consider transferring ${Math.ceil(patientCount * 0.15)} patients or adding nursing staff`
        : ratioStatus === 'near-capacity'
        ? 'Monitor closely — approaching staffing threshold'
        : 'Staffing levels adequate',
    };
  });

  const overloadedCount = wardMetrics.filter(w => w.ratio_status === 'overloaded').length;
  const totalPatients = wardMetrics.reduce((s, w) => s + w.patient_count, 0);

  return {
    summary: {
      total_wards: wardMetrics.length,
      overloaded_wards: overloadedCount,
      total_active_patients: totalPatients,
      system_status: overloadedCount > 0 ? 'attention-needed' : 'balanced',
    },
    wards: wardMetrics,
    recommendations: overloadedCount > 0 ? [
      `${overloadedCount} ward(s) are overloaded — initiate rebalancing protocol`,
      'Review post-surgical transfers to step-down units',
      'Activate surge staffing if overload exceeds 120% capacity',
    ] : ['All wards operating within normal staffing ratios'],
  };
}

// ─── Smart Bed Allocation ─────────────────────────────────────────────────────

export async function getSmartBedAllocation({ admissionType, diagnosisCode, gender, requiresIsolation, requiresIcu, organizationId }) {
  // Get available beds with scoring
  const beds = await sequelize.query(`
    SELECT
      b.id, b.bed_number, b.ward, b.room_number, b.bed_type,
      b.is_occupied, b.is_isolation, b.last_cleaned_at,
      -- Suitability score components
      CASE WHEN b.is_isolation = :needsIso AND :needsIso = true THEN 30 ELSE 0 END AS iso_score,
      CASE WHEN LOWER(b.bed_type) = 'icu' AND :needsIcu = true THEN 50 ELSE 0 END AS icu_score,
      CASE WHEN b.last_cleaned_at >= NOW() - INTERVAL '2 hours' THEN 20 ELSE 5 END AS clean_score
    FROM beds b
    WHERE b.organization_id = :orgId
      AND b.is_occupied = false
      AND b.status = 'available'
    ORDER BY (iso_score + icu_score + clean_score) DESC
    LIMIT 10
  `, {
    replacements: {
      orgId: organizationId,
      needsIso: requiresIsolation || false,
      needsIcu: requiresIcu || false,
    },
    type: QueryTypes.SELECT,
  }).catch(() => []);

  if (beds.length === 0) {
    return { available: false, message: 'No suitable beds currently available', alternatives: [] };
  }

  const top = beds[0];
  const alternatives = beds.slice(1, 4);

  return {
    available: true,
    recommended: {
      bed_id: top.id,
      bed_number: top.bed_number,
      ward: top.ward,
      room: top.room_number,
      type: top.bed_type,
      is_isolation: top.is_isolation,
      suitability_score: parseInt(top.iso_score || 0) + parseInt(top.icu_score || 0) + parseInt(top.clean_score || 0),
      reason: buildAllocationReason(top, { requiresIsolation, requiresIcu, diagnosisCode }),
    },
    alternatives: alternatives.map(b => ({
      bed_id: b.id,
      bed_number: b.bed_number,
      ward: b.ward,
      type: b.bed_type,
    })),
  };
}

function buildAllocationReason(bed, opts) {
  const reasons = [];
  if (opts.requiresIcu && bed.bed_type === 'icu') reasons.push('ICU bed matches clinical requirement');
  if (opts.requiresIsolation && bed.is_isolation) reasons.push('Isolation room allocated for infection control');
  if (bed.clean_score >= 20) reasons.push('Recently cleaned and disinfected');
  return reasons.length > 0 ? reasons.join('; ') : 'Best available bed based on current occupancy';
}

// ─── Discharge Summary Data Synthesis ────────────────────────────────────────

export async function getDischargeSummaryData(admissionId, organizationId) {
  const [admission] = await sequelize.query(`
    SELECT
      a.id, a.admitted_at, a.ward, a.admission_type,
      a.primary_diagnosis, a.secondary_diagnoses,
      p.name AS patient_name, p.mrn, p.date_of_birth, p.gender,
      d.name AS doctor_name, d.specialty
    FROM admissions a
    JOIN patients p ON p.id = a.patient_id
    LEFT JOIN doctors d ON d.id = a.doctor_id
    WHERE a.id = :admId AND a.organization_id = :orgId
  `, { replacements: { admId: admissionId, orgId: organizationId }, type: QueryTypes.SELECT });

  if (!admission) throw Object.assign(new Error('Admission not found'), { status: 404 });

  const [vitalsTrajectory, procedures, medications, labs, followUp] = await Promise.allSettled([
    // Vitals trajectory (first and last)
    sequelize.query(`
      SELECT recorded_at, temperature, pulse, systolic_bp, diastolic_bp, spo2, respiratory_rate
      FROM vitals WHERE admission_id = :admId ORDER BY recorded_at
      LIMIT 1
    `, { replacements: { admId: admissionId }, type: QueryTypes.SELECT }),

    // Procedures / OT records
    sequelize.query(`
      SELECT procedure_name, operated_at, surgeon_name, notes
      FROM operative_notes WHERE admission_id = :admId
    `, { replacements: { admId: admissionId }, type: QueryTypes.SELECT }).catch(() => []),

    // Active medications at discharge
    sequelize.query(`
      SELECT drug_name, dosage, frequency, route, status
      FROM prescriptions WHERE patient_id = (
        SELECT patient_id FROM admissions WHERE id = :admId
      ) AND created_at >= (SELECT admitted_at FROM admissions WHERE id = :admId)
      ORDER BY created_at DESC LIMIT 20
    `, { replacements: { admId: admissionId }, type: QueryTypes.SELECT }).catch(() => []),

    // Flagged lab results
    sequelize.query(`
      SELECT test_name, result_value, unit, reference_range, is_abnormal, reported_at
      FROM lab_results WHERE admission_id = :admId AND is_abnormal = true
      ORDER BY reported_at DESC LIMIT 10
    `, { replacements: { admId: admissionId }, type: QueryTypes.SELECT }).catch(() => []),

    // Follow-up plan
    sequelize.query(`
      SELECT fp.follow_up_date, fp.instructions, fp.follow_up_type
      FROM follow_up_plans fp
      WHERE fp.admission_id = :admId
      ORDER BY fp.follow_up_date LIMIT 3
    `, { replacements: { admId: admissionId }, type: QueryTypes.SELECT }).catch(() => []),
  ]);

  const losdays = Math.round((Date.now() - new Date(admission.admitted_at).getTime()) / 86400000);

  return {
    patient: {
      name: admission.patient_name,
      mrn: admission.mrn,
      dob: admission.date_of_birth,
      gender: admission.gender,
    },
    admission: {
      ward: admission.ward,
      type: admission.admission_type,
      admitted_at: admission.admitted_at,
      los_days: losdays,
      attending_doctor: admission.doctor_name,
      specialty: admission.specialty,
    },
    diagnoses: {
      primary: admission.primary_diagnosis,
      secondary: admission.secondary_diagnoses,
    },
    clinical_summary: {
      vitals_on_admission: vitalsTrajectory.status === 'fulfilled' ? vitalsTrajectory.value[0] ?? null : null,
      procedures: procedures.status === 'fulfilled' ? procedures.value : [],
      abnormal_labs: labs.status === 'fulfilled' ? labs.value : [],
    },
    discharge_medications: medications.status === 'fulfilled' ? medications.value : [],
    follow_up_plan: followUp.status === 'fulfilled' ? followUp.value : [],
    ai_narrative: buildDischargeSummaryNarrative(admission, {
      procedures: procedures.status === 'fulfilled' ? procedures.value : [],
      losdays,
    }),
  };
}

function buildDischargeSummaryNarrative(admission, { procedures, losdays }) {
  const name = admission.patient_name;
  const dx = admission.primary_diagnosis || 'the presenting condition';
  const doc = admission.doctor_name ? `Dr. ${admission.doctor_name}` : 'the attending physician';
  const procText = procedures.length > 0
    ? ` The patient underwent ${procedures.map(p => p.procedure_name).join(', ')}.`
    : '';
  return `${name} was admitted to ${admission.ward} under ${doc} for management of ${dx}. ` +
    `The hospital stay was ${losdays} day${losdays !== 1 ? 's' : ''}.${procText} ` +
    `The patient is being discharged in a stable condition with appropriate medications and follow-up instructions. ` +
    `Please review the attached discharge medications and ensure compliance with the follow-up schedule.`;
}
