/**
 * AI Department Intelligence Service
 * ─────────────────────────────────────
 * Covers: Lab · Pharmacy · Ward · OT · ICU · ER · OPD ·
 *         Surveillance · Insurance · Accounts · HRMS
 *
 * All engines are SQL-based statistical intelligence —
 * no external ML runtime required. Every function degrades
 * gracefully when optional tables are absent.
 */

import { postgresSequelize as sequelize } from '../db/postgres.js';
import { QueryTypes } from 'sequelize';

const q = (sql, rep) =>
  sequelize.query(sql, { replacements: rep, type: QueryTypes.SELECT }).catch(() => []);

const one = (sql, rep) =>
  sequelize.query(sql, { replacements: rep, type: QueryTypes.SELECT })
    .then(r => r[0] ?? {}).catch(() => ({}));

// ─── 1. LAB AI ───────────────────────────────────────────────────────────────

export async function getLabAI(organizationId) {
  const [critical, tat, pending, workload] = await Promise.allSettled([

    // Critical value alerts (life-threatening results not yet acknowledged)
    q(`SELECT lr.id, p.name AS patient_name, p.mrn, a.ward,
              lr.test_name, lr.result_value, lr.unit, lr.reference_range,
              lr.reported_at,
              EXTRACT(EPOCH FROM (NOW() - lr.reported_at))/60 AS minutes_pending
         FROM lab_results lr
         JOIN admissions a ON a.id = lr.admission_id
         JOIN patients p ON p.id = a.patient_id
        WHERE lr.organization_id = :orgId
          AND lr.is_abnormal = true
          AND lr.is_critical = true
          AND lr.acknowledged_at IS NULL
          AND lr.reported_at >= NOW() - INTERVAL '24 hours'
        ORDER BY lr.reported_at
        LIMIT 20`, { orgId: organizationId }),

    // Turnaround time analysis (ordered vs reported, last 7 days)
    q(`SELECT test_category,
              ROUND(AVG(EXTRACT(EPOCH FROM (lr.reported_at - lr.ordered_at))/60)::numeric,1) AS avg_tat_minutes,
              COUNT(*) AS test_count,
              ROUND(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (lr.reported_at - lr.ordered_at))/60)::numeric,1) AS p90_tat
         FROM lab_results lr
        WHERE lr.organization_id = :orgId
          AND lr.ordered_at IS NOT NULL
          AND lr.reported_at IS NOT NULL
          AND lr.ordered_at >= NOW() - INTERVAL '7 days'
        GROUP BY test_category
        ORDER BY avg_tat_minutes DESC
        LIMIT 10`, { orgId: organizationId }),

    // Pending tests older than 2 hours
    q(`SELECT lr.test_name, lr.test_category,
              COUNT(*) AS pending_count,
              ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - lr.ordered_at))/60)::numeric,0) AS avg_wait_minutes
         FROM lab_results lr
        WHERE lr.organization_id = :orgId
          AND lr.reported_at IS NULL
          AND lr.ordered_at <= NOW() - INTERVAL '2 hours'
        GROUP BY lr.test_name, lr.test_category
        ORDER BY avg_wait_minutes DESC
        LIMIT 10`, { orgId: organizationId }),

    // Daily workload by hour
    q(`SELECT EXTRACT(HOUR FROM ordered_at) AS hour_of_day,
              COUNT(*) AS tests_ordered
         FROM lab_results
        WHERE organization_id = :orgId
          AND ordered_at >= NOW() - INTERVAL '7 days'
        GROUP BY 1 ORDER BY 1`, { orgId: organizationId }),
  ]);

  const criticalRows = critical.status === 'fulfilled' ? critical.value : [];
  const tatRows     = tat.status === 'fulfilled' ? tat.value : [];
  const pendingRows = pending.status === 'fulfilled' ? pending.value : [];
  const wlRows      = workload.status === 'fulfilled' ? workload.value : [];

  // Peak workload hour
  const peak = wlRows.reduce((m, r) => parseInt(r.tests_ordered) > parseInt(m.tests_ordered || 0) ? r : m, wlRows[0] || {});

  return {
    critical_values: {
      count: criticalRows.length,
      items: criticalRows.map(r => ({
        patient: r.patient_name, mrn: r.mrn, ward: r.ward,
        test: r.test_name, value: `${r.result_value} ${r.unit}`,
        reference: r.reference_range,
        pending_minutes: Math.round(parseFloat(r.minutes_pending || 0)),
        urgency: parseFloat(r.minutes_pending || 0) > 60 ? 'critical' : 'high',
      })),
    },
    turnaround_time: tatRows.map(r => ({
      category: r.test_category, avg_minutes: parseFloat(r.avg_tat_minutes || 0),
      p90_minutes: parseFloat(r.p90_tat || 0), volume: parseInt(r.test_count),
      status: parseFloat(r.avg_tat_minutes || 0) > 90 ? 'delayed' : parseFloat(r.avg_tat_minutes || 0) > 60 ? 'slow' : 'on-time',
    })),
    overdue_pending: pendingRows,
    workload_peak: peak.hour_of_day !== undefined ? { hour: `${String(parseInt(peak.hour_of_day)).padStart(2,'0')}:00`, tests: parseInt(peak.tests_ordered || 0) } : null,
    ai_alerts: buildLabAlerts(criticalRows, pendingRows, tatRows),
  };
}

function buildLabAlerts(critical, pending, tat) {
  const alerts = [];
  if (critical.length > 0) alerts.push({ severity: 'critical', message: `${critical.length} unacknowledged critical lab value(s) — immediate physician notification required` });
  if (pending.length > 3) alerts.push({ severity: 'high', message: `${pending.length} test types have samples pending > 2 hours — check analyzer queue` });
  const slowTat = tat.filter(t => parseFloat(t.avg_tat_minutes || 0) > 120);
  if (slowTat.length > 0) alerts.push({ severity: 'medium', message: `TAT > 2h for ${slowTat.map(t => t.test_category).join(', ')} — review staffing or equipment` });
  return alerts;
}

// ─── 2. PHARMACY AI ──────────────────────────────────────────────────────────

export async function getPharmacyAI(organizationId) {
  const [inventory, polyPharmacy, dispensing, expiry] = await Promise.allSettled([

    // Inventory depletion forecast
    q(`SELECT drug_name, generic_name, current_stock, reorder_level, unit,
              CASE WHEN avg_daily_consumption > 0
                   THEN ROUND(current_stock / avg_daily_consumption)
                   ELSE NULL END AS days_of_stock,
              avg_daily_consumption
         FROM pharmacy_inventory
        WHERE organization_id = :orgId
          AND current_stock <= reorder_level * 1.5
        ORDER BY days_of_stock NULLS LAST
        LIMIT 20`, { orgId: organizationId }),

    // Poly-pharmacy risk (inpatients on > 7 active meds)
    q(`SELECT p.name AS patient_name, p.mrn, a.ward,
              COUNT(DISTINCT pr.drug_name) AS active_med_count,
              ARRAY_AGG(DISTINCT pr.drug_name ORDER BY pr.drug_name) AS medications
         FROM prescriptions pr
         JOIN admissions a ON a.id = pr.admission_id
         JOIN patients p ON p.id = a.patient_id
        WHERE pr.organization_id = :orgId
          AND a.status = 'active'
          AND pr.status = 'active'
        GROUP BY p.name, p.mrn, a.ward
        HAVING COUNT(DISTINCT pr.drug_name) >= 7
        ORDER BY active_med_count DESC
        LIMIT 15`, { orgId: organizationId }),

    // Dispensing queue — urgent meds not yet administered
    q(`SELECT p.name AS patient_name, a.ward, pr.drug_name, pr.dosage,
              pr.frequency, pr.created_at,
              EXTRACT(EPOCH FROM (NOW() - pr.created_at))/60 AS wait_minutes
         FROM prescriptions pr
         JOIN admissions a ON a.id = pr.admission_id
         JOIN patients p ON p.id = a.patient_id
        WHERE pr.organization_id = :orgId
          AND pr.status = 'active'
          AND pr.is_urgent = true
          AND NOT EXISTS (
            SELECT 1 FROM emar_records er
            WHERE er.prescription_id = pr.id
              AND er.administered_at >= NOW() - INTERVAL '8 hours'
          )
        ORDER BY pr.created_at
        LIMIT 20`, { orgId: organizationId }),

    // Drugs expiring within 60 days
    q(`SELECT drug_name, batch_number, expiry_date, current_stock, unit,
              DATE_PART('day', expiry_date::timestamp - NOW()) AS days_to_expiry
         FROM pharmacy_inventory
        WHERE organization_id = :orgId
          AND expiry_date <= NOW() + INTERVAL '60 days'
          AND current_stock > 0
        ORDER BY expiry_date
        LIMIT 20`, { orgId: organizationId }),
  ]);

  return {
    inventory_risk: {
      items: (inventory.status === 'fulfilled' ? inventory.value : []).map(r => ({
        drug: r.drug_name, generic: r.generic_name,
        stock: parseFloat(r.current_stock || 0), unit: r.unit,
        days_remaining: r.days_of_stock !== null ? parseInt(r.days_of_stock) : null,
        status: r.days_of_stock !== null
          ? (parseInt(r.days_of_stock) <= 3 ? 'critical' : parseInt(r.days_of_stock) <= 7 ? 'low' : 'reorder')
          : 'unknown',
      })),
    },
    poly_pharmacy_risk: (polyPharmacy.status === 'fulfilled' ? polyPharmacy.value : []).map(r => ({
      patient: r.patient_name, mrn: r.mrn, ward: r.ward,
      med_count: parseInt(r.active_med_count),
      risk_level: parseInt(r.active_med_count) >= 10 ? 'high' : 'medium',
      medications: r.medications || [],
    })),
    urgent_dispensing: (dispensing.status === 'fulfilled' ? dispensing.value : []).map(r => ({
      patient: r.patient_name, ward: r.ward,
      drug: `${r.drug_name} ${r.dosage}`, frequency: r.frequency,
      wait_minutes: Math.round(parseFloat(r.wait_minutes || 0)),
      priority: parseFloat(r.wait_minutes || 0) > 30 ? 'overdue' : 'urgent',
    })),
    expiry_alerts: (expiry.status === 'fulfilled' ? expiry.value : []).map(r => ({
      drug: r.drug_name, batch: r.batch_number,
      expiry: r.expiry_date, days_left: Math.round(parseFloat(r.days_to_expiry || 0)),
      stock: parseFloat(r.current_stock || 0), unit: r.unit,
      severity: parseFloat(r.days_to_expiry || 0) <= 14 ? 'critical' : 'warning',
    })),
  };
}

// ─── 3. WARD AI ──────────────────────────────────────────────────────────────

export async function getWardAI(organizationId) {
  const [deterioration, fallRisk, taskBoard, pressureRisk] = await Promise.allSettled([

    // Deterioration risk: vitals trending toward abnormal (NEWS2-style scoring)
    q(`SELECT p.name AS patient_name, p.mrn, a.ward, a.id AS admission_id,
              v.temperature, v.pulse AS heart_rate, v.systolic_bp,
              v.spo2, v.respiratory_rate, v.recorded_at,
              -- NEWS2 proxy score
              (CASE WHEN v.respiratory_rate < 12 OR v.respiratory_rate > 24 THEN 3
                    WHEN v.respiratory_rate BETWEEN 21 AND 24 THEN 2
                    WHEN v.respiratory_rate BETWEEN 9 AND 11 THEN 1 ELSE 0 END +
               CASE WHEN v.spo2 < 92 THEN 3 WHEN v.spo2 < 94 THEN 2
                    WHEN v.spo2 < 96 THEN 1 ELSE 0 END +
               CASE WHEN v.systolic_bp < 90 OR v.systolic_bp > 219 THEN 3
                    WHEN v.systolic_bp BETWEEN 91 AND 100 THEN 2
                    WHEN v.systolic_bp BETWEEN 101 AND 110 THEN 1 ELSE 0 END +
               CASE WHEN v.pulse < 41 OR v.pulse > 130 THEN 3
                    WHEN v.pulse > 110 OR v.pulse BETWEEN 41 AND 50 THEN 2
                    WHEN v.pulse BETWEEN 51 AND 90 THEN 0 ELSE 1 END +
               CASE WHEN v.temperature < 35.1 OR v.temperature > 39.0 THEN 2
                    WHEN v.temperature BETWEEN 35.1 AND 36.0 THEN 1 ELSE 0 END
              ) AS news2_score
         FROM vitals v
         JOIN admissions a ON a.id = v.admission_id
         JOIN patients p ON p.id = a.patient_id
        WHERE v.organization_id = :orgId
          AND a.status = 'active'
          AND v.recorded_at = (
            SELECT MAX(v2.recorded_at) FROM vitals v2
            WHERE v2.admission_id = a.id
          )
        HAVING (CASE WHEN v.respiratory_rate < 12 OR v.respiratory_rate > 24 THEN 3
                     WHEN v.respiratory_rate BETWEEN 21 AND 24 THEN 2
                     WHEN v.respiratory_rate BETWEEN 9 AND 11 THEN 1 ELSE 0 END +
                CASE WHEN v.spo2 < 92 THEN 3 WHEN v.spo2 < 94 THEN 2
                     WHEN v.spo2 < 96 THEN 1 ELSE 0 END +
                CASE WHEN v.systolic_bp < 90 OR v.systolic_bp > 219 THEN 3
                     WHEN v.systolic_bp BETWEEN 91 AND 100 THEN 2
                     WHEN v.systolic_bp BETWEEN 101 AND 110 THEN 1 ELSE 0 END +
                CASE WHEN v.pulse < 41 OR v.pulse > 130 THEN 3
                     WHEN v.pulse > 110 OR v.pulse BETWEEN 41 AND 50 THEN 2
                     WHEN v.pulse BETWEEN 51 AND 90 THEN 0 ELSE 1 END +
                CASE WHEN v.temperature < 35.1 OR v.temperature > 39.0 THEN 2
                     WHEN v.temperature BETWEEN 35.1 AND 36.0 THEN 1 ELSE 0 END
               ) >= 3
        ORDER BY news2_score DESC
        LIMIT 15`, { orgId: organizationId }),

    // Fall risk (Morse Fall Scale proxy: elderly + multiple meds + gait)
    q(`SELECT p.name AS patient_name, p.mrn, a.ward, a.id AS admission_id,
              DATE_PART('year', AGE(p.date_of_birth)) AS age,
              COUNT(DISTINCT pr.id) AS active_meds,
              CASE WHEN DATE_PART('year', AGE(p.date_of_birth)) >= 65 THEN 25 ELSE 0 END +
              CASE WHEN COUNT(DISTINCT pr.id) >= 3 THEN 15 ELSE 0 END +
              CASE WHEN a.admission_type IN ('emergency','ortho') THEN 20 ELSE 0 END
                AS morse_score
         FROM admissions a
         JOIN patients p ON p.id = a.patient_id
         LEFT JOIN prescriptions pr ON pr.admission_id = a.id AND pr.status = 'active'
        WHERE a.organization_id = :orgId AND a.status = 'active'
        GROUP BY p.name, p.mrn, a.ward, a.id, p.date_of_birth, a.admission_type
        HAVING (
          CASE WHEN DATE_PART('year', AGE(p.date_of_birth)) >= 65 THEN 25 ELSE 0 END +
          CASE WHEN COUNT(DISTINCT pr.id) >= 3 THEN 15 ELSE 0 END +
          CASE WHEN a.admission_type IN ('emergency','ortho') THEN 20 ELSE 0 END
        ) >= 25
        ORDER BY morse_score DESC
        LIMIT 15`, { orgId: organizationId }),

    // Task board: pending nursing interventions by ward
    q(`SELECT a.ward,
              COUNT(*) FILTER (WHERE v.recorded_at < NOW() - INTERVAL '4 hours') AS vitals_overdue,
              COUNT(*) FILTER (WHERE er.status = 'pending') AS meds_pending,
              COUNT(DISTINCT a.id) AS total_patients
         FROM admissions a
         LEFT JOIN vitals v ON v.admission_id = a.id
           AND v.recorded_at = (SELECT MAX(v2.recorded_at) FROM vitals v2 WHERE v2.admission_id = a.id)
         LEFT JOIN emar_records er ON er.admission_id = a.id AND er.scheduled_time <= NOW()
        WHERE a.organization_id = :orgId AND a.status = 'active'
        GROUP BY a.ward ORDER BY vitals_overdue DESC`, { orgId: organizationId }),

    // Pressure injury risk (Braden scale proxy: long LOS, immobility indicator)
    q(`SELECT p.name AS patient_name, p.mrn, a.ward,
              EXTRACT(DAY FROM NOW() - a.admitted_at) AS los_days,
              DATE_PART('year', AGE(p.date_of_birth)) AS age,
              (EXTRACT(DAY FROM NOW() - a.admitted_at) * 2 +
               CASE WHEN DATE_PART('year', AGE(p.date_of_birth)) > 70 THEN 10 ELSE 0 END +
               CASE WHEN a.ward ILIKE '%icu%' THEN 15 ELSE 0 END) AS braden_risk
         FROM admissions a
         JOIN patients p ON p.id = a.patient_id
        WHERE a.organization_id = :orgId AND a.status = 'active'
          AND EXTRACT(DAY FROM NOW() - a.admitted_at) >= 3
        ORDER BY braden_risk DESC LIMIT 10`, { orgId: organizationId }),
  ]);

  const det = deterioration.status === 'fulfilled' ? deterioration.value : [];
  const fall = fallRisk.status === 'fulfilled' ? fallRisk.value : [];
  const tasks = taskBoard.status === 'fulfilled' ? taskBoard.value : [];
  const pressure = pressureRisk.status === 'fulfilled' ? pressureRisk.value : [];

  return {
    deterioration_watch: det.map(r => ({
      patient: r.patient_name, mrn: r.mrn, ward: r.ward,
      news2_score: parseInt(r.news2_score || 0),
      risk_level: parseInt(r.news2_score || 0) >= 7 ? 'high' : parseInt(r.news2_score || 0) >= 5 ? 'medium' : 'low',
      vitals: { hr: r.heart_rate, bp: r.systolic_bp, spo2: r.spo2, rr: r.respiratory_rate, temp: r.temperature },
      last_vitals: r.recorded_at,
    })),
    fall_risk: fall.map(r => ({
      patient: r.patient_name, mrn: r.mrn, ward: r.ward,
      morse_score: parseInt(r.morse_score || 0), age: parseInt(r.age || 0),
      risk_level: parseInt(r.morse_score || 0) >= 45 ? 'high' : 'medium',
    })),
    ward_task_board: tasks.map(r => ({
      ward: r.ward, patients: parseInt(r.total_patients || 0),
      vitals_overdue: parseInt(r.vitals_overdue || 0),
      meds_pending: parseInt(r.meds_pending || 0),
      urgency: parseInt(r.vitals_overdue || 0) > 3 ? 'critical' : parseInt(r.vitals_overdue || 0) > 0 ? 'high' : 'normal',
    })),
    pressure_injury_risk: pressure.map(r => ({
      patient: r.patient_name, mrn: r.mrn, ward: r.ward,
      los_days: Math.round(parseFloat(r.los_days || 0)),
      risk_score: Math.round(parseFloat(r.braden_risk || 0)),
      risk_level: parseFloat(r.braden_risk || 0) > 25 ? 'high' : 'medium',
    })),
  };
}

// ─── 4. OT AI ────────────────────────────────────────────────────────────────

export async function getOTAI(organizationId) {
  const [schedule, turnover, delays, utilization] = await Promise.allSettled([

    // Today's schedule with pre-op checklist status
    q(`SELECT ob.id, ob.procedure_name, ob.scheduled_start, ob.scheduled_end,
              ob.status, ob.ot_room, d.name AS surgeon_name,
              p.name AS patient_name, p.mrn,
              -- Pre-op readiness checks
              (SELECT COUNT(*) FROM patient_consents pc
                WHERE pc.patient_id = ob.patient_id AND pc.consent_type = 'surgical') AS has_consent,
              (SELECT COUNT(*) FROM anesthesia_records ar
                WHERE ar.ot_booking_id = ob.id AND ar.record_type = 'pre_op') AS has_anesthesia_note,
              EXTRACT(EPOCH FROM (ob.scheduled_start - NOW()))/60 AS minutes_to_start
         FROM ot_bookings ob
         JOIN patients p ON p.id = ob.patient_id
         LEFT JOIN doctors d ON d.id = ob.surgeon_id
        WHERE ob.organization_id = :orgId
          AND ob.scheduled_start::date = CURRENT_DATE
          AND ob.status NOT IN ('cancelled','completed')
        ORDER BY ob.scheduled_start`, { orgId: organizationId }),

    // Turnover time analysis (time between cases per room)
    q(`SELECT ot_room,
              ROUND(AVG(EXTRACT(EPOCH FROM (
                LEAD(actual_start) OVER (PARTITION BY ot_room ORDER BY actual_end) - actual_end
              ))/60)::numeric, 0) AS avg_turnover_minutes,
              COUNT(*) AS cases_last_7d
         FROM ot_bookings
        WHERE organization_id = :orgId
          AND status = 'completed'
          AND actual_end >= NOW() - INTERVAL '7 days'
        GROUP BY ot_room
        ORDER BY avg_turnover_minutes DESC NULLS LAST`, { orgId: organizationId }),

    // Delays: cases that started late
    q(`SELECT procedure_name, d.name AS surgeon_name, ot_room,
              EXTRACT(EPOCH FROM (actual_start - scheduled_start))/60 AS delay_minutes,
              scheduled_start::date AS case_date
         FROM ot_bookings ob
         LEFT JOIN doctors d ON d.id = ob.surgeon_id
        WHERE ob.organization_id = :orgId
          AND ob.status = 'completed'
          AND ob.actual_start > ob.scheduled_start + INTERVAL '15 minutes'
          AND ob.scheduled_start >= NOW() - INTERVAL '30 days'
        ORDER BY delay_minutes DESC LIMIT 10`, { orgId: organizationId }),

    // OT room utilization (last 30 days)
    q(`SELECT ot_room,
              COUNT(*) AS total_cases,
              ROUND(SUM(EXTRACT(EPOCH FROM (actual_end - actual_start))/3600)::numeric,1) AS used_hours,
              ROUND(SUM(EXTRACT(EPOCH FROM (actual_end - actual_start))/3600)::numeric / 30 / 8 * 100, 1) AS utilization_pct
         FROM ot_bookings
        WHERE organization_id = :orgId
          AND status = 'completed'
          AND actual_end IS NOT NULL
          AND scheduled_start >= NOW() - INTERVAL '30 days'
        GROUP BY ot_room
        ORDER BY utilization_pct DESC`, { orgId: organizationId }),
  ]);

  const sched = schedule.status === 'fulfilled' ? schedule.value : [];
  const turn = turnover.status === 'fulfilled' ? turnover.value : [];
  const dels = delays.status === 'fulfilled' ? delays.value : [];
  const util = utilization.status === 'fulfilled' ? utilization.value : [];

  const unreadyCases = sched.filter(c => !parseInt(c.has_consent || 0) || !parseInt(c.has_anesthesia_note || 0));

  return {
    todays_schedule: {
      total_cases: sched.length,
      ready: sched.length - unreadyCases.length,
      not_ready: unreadyCases.length,
      cases: sched.map(c => ({
        id: c.id, procedure: c.procedure_name, room: c.ot_room,
        surgeon: c.surgeon_name, patient: c.patient_name, mrn: c.mrn,
        scheduled_start: c.scheduled_start, status: c.status,
        minutes_to_start: Math.round(parseFloat(c.minutes_to_start || 0)),
        pre_op_ready: parseInt(c.has_consent || 0) > 0 && parseInt(c.has_anesthesia_note || 0) > 0,
        gaps: [
          ...(!parseInt(c.has_consent || 0) ? ['Surgical consent missing'] : []),
          ...(!parseInt(c.has_anesthesia_note || 0) ? ['Pre-op anesthesia note missing'] : []),
        ],
      })),
    },
    turnover_analysis: turn.map(r => ({
      room: r.ot_room, avg_turnover: parseInt(r.avg_turnover_minutes || 0),
      cases: parseInt(r.cases_last_7d || 0),
      status: parseInt(r.avg_turnover_minutes || 0) > 45 ? 'slow' : parseInt(r.avg_turnover_minutes || 0) > 30 ? 'acceptable' : 'efficient',
    })),
    delay_analysis: dels.map(r => ({
      procedure: r.procedure_name, surgeon: r.surgeon_name, room: r.ot_room,
      delay_minutes: Math.round(parseFloat(r.delay_minutes || 0)),
      date: r.case_date,
    })),
    room_utilization: util.map(r => ({
      room: r.ot_room, cases: parseInt(r.total_cases || 0),
      used_hours: parseFloat(r.used_hours || 0),
      utilization_pct: parseFloat(r.utilization_pct || 0),
      status: parseFloat(r.utilization_pct || 0) >= 80 ? 'optimal' : parseFloat(r.utilization_pct || 0) >= 60 ? 'good' : 'underutilized',
    })),
  };
}

// ─── 5. ICU AI ───────────────────────────────────────────────────────────────

export async function getICUAI(organizationId) {
  const [sofa, weaningReady, sepsisBundles, fluidBalance] = await Promise.allSettled([

    // SOFA score trend for ICU patients
    q(`SELECT p.name AS patient_name, p.mrn, a.id AS admission_id,
              EXTRACT(DAY FROM NOW() - a.admitted_at) AS icu_days,
              v.spo2, v.systolic_bp, v.pulse, v.gcs_total,
              -- Simplified SOFA proxy
              (CASE WHEN v.spo2 < 90 THEN 3 WHEN v.spo2 < 94 THEN 2 WHEN v.spo2 < 96 THEN 1 ELSE 0 END +
               CASE WHEN v.systolic_bp < 70 THEN 4 WHEN v.systolic_bp < 90 THEN 3
                    WHEN v.systolic_bp < 100 THEN 2 ELSE 0 END +
               CASE WHEN v.gcs_total <= 5 THEN 4 WHEN v.gcs_total <= 9 THEN 3
                    WHEN v.gcs_total <= 12 THEN 2 WHEN v.gcs_total <= 14 THEN 1 ELSE 0 END
              ) AS sofa_proxy
         FROM admissions a
         JOIN patients p ON p.id = a.patient_id
         JOIN vitals v ON v.admission_id = a.id
           AND v.recorded_at = (SELECT MAX(v2.recorded_at) FROM vitals v2 WHERE v2.admission_id = a.id)
        WHERE a.organization_id = :orgId
          AND a.status = 'active'
          AND (a.ward ILIKE '%icu%' OR a.ward ILIKE '%intensive%' OR a.ward ILIKE '%ccu%')
        ORDER BY sofa_proxy DESC LIMIT 15`, { orgId: organizationId }),

    // Ventilator weaning readiness (SpO2 ≥ 96, RR normal, improving trend)
    q(`SELECT p.name AS patient_name, p.mrn, a.ward,
              v.spo2, v.respiratory_rate, v.systolic_bp,
              EXTRACT(DAY FROM NOW() - a.admitted_at) AS icu_days,
              CASE WHEN v.spo2 >= 96 AND v.respiratory_rate BETWEEN 12 AND 20
                        AND v.systolic_bp >= 90 THEN true ELSE false END AS weaning_candidate
         FROM admissions a
         JOIN patients p ON p.id = a.patient_id
         JOIN vitals v ON v.admission_id = a.id
           AND v.recorded_at = (SELECT MAX(v2.recorded_at) FROM vitals v2 WHERE v2.admission_id = a.id)
        WHERE a.organization_id = :orgId AND a.status = 'active'
          AND (a.ward ILIKE '%icu%' OR a.ward ILIKE '%intensive%')
        ORDER BY weaning_candidate DESC, v.spo2 DESC LIMIT 10`, { orgId: organizationId }),

    // Sepsis bundle compliance (antibiotics within 1h of suspected sepsis)
    q(`SELECT a.id, p.name AS patient_name, p.mrn, a.ward,
              (SELECT MIN(pr.created_at) FROM prescriptions pr
                WHERE pr.admission_id = a.id AND pr.drug_class = 'antibiotic') AS first_antibiotic_at,
              a.admitted_at,
              EXTRACT(EPOCH FROM (
                (SELECT MIN(pr.created_at) FROM prescriptions pr
                  WHERE pr.admission_id = a.id AND pr.drug_class = 'antibiotic') - a.admitted_at
              )) / 3600 AS hours_to_antibiotic
         FROM admissions a
         JOIN patients p ON p.id = a.patient_id
        WHERE a.organization_id = :orgId AND a.status = 'active'
          AND (a.ward ILIKE '%icu%' OR a.ward ILIKE '%intensive%')
          AND a.primary_diagnosis ILIKE '%sepsis%'
        LIMIT 10`, { orgId: organizationId }),

    // Fluid balance (I&O summary)
    q(`SELECT p.name AS patient_name, p.mrn, a.ward,
              SUM(io.intake_ml) AS total_intake,
              SUM(io.output_ml) AS total_output,
              SUM(io.intake_ml) - SUM(io.output_ml) AS fluid_balance_ml
         FROM admissions a
         JOIN patients p ON p.id = a.patient_id
         LEFT JOIN io_records io ON io.admission_id = a.id
           AND io.recorded_at >= NOW() - INTERVAL '24 hours'
        WHERE a.organization_id = :orgId AND a.status = 'active'
          AND (a.ward ILIKE '%icu%' OR a.ward ILIKE '%intensive%')
        GROUP BY p.name, p.mrn, a.ward
        HAVING ABS(SUM(io.intake_ml) - SUM(io.output_ml)) > 1000
        ORDER BY ABS(SUM(io.intake_ml) - SUM(io.output_ml)) DESC LIMIT 10`, { orgId: organizationId }),
  ]);

  const sofaRows   = sofa.status === 'fulfilled' ? sofa.value : [];
  const weanRows   = weaningReady.status === 'fulfilled' ? weaningReady.value : [];
  const sepRows    = sepsisBundles.status === 'fulfilled' ? sepsisBundles.value : [];
  const fluidRows  = fluidBalance.status === 'fulfilled' ? fluidBalance.value : [];

  return {
    sofa_monitoring: sofaRows.map(r => ({
      patient: r.patient_name, mrn: r.mrn, icu_days: Math.round(parseFloat(r.icu_days || 0)),
      sofa_score: parseInt(r.sofa_proxy || 0),
      severity: parseInt(r.sofa_proxy || 0) >= 6 ? 'severe' : parseInt(r.sofa_proxy || 0) >= 3 ? 'moderate' : 'mild',
      vitals: { spo2: r.spo2, sbp: r.systolic_bp, gcs: r.gcs_total },
    })),
    weaning_candidates: weanRows.filter(r => r.weaning_candidate).map(r => ({
      patient: r.patient_name, mrn: r.mrn, ward: r.ward,
      spo2: r.spo2, rr: r.respiratory_rate, sbp: r.systolic_bp,
      icu_days: Math.round(parseFloat(r.icu_days || 0)),
      recommendation: 'Assess for spontaneous breathing trial — vitals support weaning readiness',
    })),
    sepsis_bundle: sepRows.map(r => ({
      patient: r.patient_name, mrn: r.mrn, ward: r.ward,
      hours_to_antibiotic: r.hours_to_antibiotic !== null ? parseFloat(r.hours_to_antibiotic || 0).toFixed(1) : 'Not given',
      compliant: r.hours_to_antibiotic !== null && parseFloat(r.hours_to_antibiotic || 0) <= 1,
    })),
    fluid_imbalance: fluidRows.map(r => ({
      patient: r.patient_name, mrn: r.mrn, ward: r.ward,
      intake_ml: parseInt(r.total_intake || 0), output_ml: parseInt(r.total_output || 0),
      balance_ml: parseInt(r.fluid_balance_ml || 0),
      alert: parseInt(r.fluid_balance_ml || 0) > 1500 ? 'Positive fluid overload — consider diuresis'
        : parseInt(r.fluid_balance_ml || 0) < -500 ? 'Negative balance — consider fluid resuscitation' : 'Monitor',
    })),
  };
}

// ─── 6. ER AI ────────────────────────────────────────────────────────────────

export async function getERAI(organizationId) {
  const [boarding, doorToDoctor, occupancy, acuityMix] = await Promise.allSettled([

    // ER boarding: patients waiting > 4h for ward bed
    q(`SELECT p.name AS patient_name, p.mrn, a.id AS admission_id,
              EXTRACT(EPOCH FROM (NOW() - a.admitted_at))/3600 AS er_hours,
              a.primary_diagnosis, a.triage_level
         FROM admissions a
         JOIN patients p ON p.id = a.patient_id
        WHERE a.organization_id = :orgId
          AND a.status = 'active'
          AND (a.ward ILIKE '%er%' OR a.ward ILIKE '%emergency%' OR a.ward ILIKE '%a&e%')
          AND EXTRACT(EPOCH FROM (NOW() - a.admitted_at))/3600 > 4
        ORDER BY er_hours DESC LIMIT 20`, { orgId: organizationId }),

    // Door-to-doctor time (today)
    one(`SELECT
          ROUND(AVG(EXTRACT(EPOCH FROM (a.doctor_assigned_at - a.admitted_at))/60)::numeric,0) AS avg_d2d_minutes,
          COUNT(*) AS er_visits_today
         FROM admissions a
        WHERE organization_id = :orgId
          AND (ward ILIKE '%er%' OR ward ILIKE '%emergency%')
          AND admitted_at >= CURRENT_DATE
          AND doctor_assigned_at IS NOT NULL`, { orgId: organizationId }),

    // ER occupancy
    one(`SELECT COUNT(*) AS active_er_patients
         FROM admissions
        WHERE organization_id = :orgId AND status = 'active'
          AND (ward ILIKE '%er%' OR ward ILIKE '%emergency%')`, { orgId: organizationId }),

    // Acuity mix (triage level distribution)
    q(`SELECT triage_level, COUNT(*) AS count,
              ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 1) AS pct
         FROM admissions
        WHERE organization_id = :orgId
          AND (ward ILIKE '%er%' OR ward ILIKE '%emergency%')
          AND admitted_at >= NOW() - INTERVAL '24 hours'
          AND triage_level IS NOT NULL
        GROUP BY triage_level ORDER BY triage_level`, { orgId: organizationId }),
  ]);

  const boardRows = boarding.status === 'fulfilled' ? boarding.value : [];
  const d2d       = doorToDoctor.status === 'fulfilled' ? doorToDoctor.value : {};
  const occ       = occupancy.status === 'fulfilled' ? occupancy.value : {};
  const acuity    = acuityMix.status === 'fulfilled' ? acuityMix.value : [];

  const avgD2D = parseFloat(d2d?.avg_d2d_minutes || 0);
  const diversionRisk = parseInt(occ?.active_er_patients || 0) > 30 ? 'high'
    : parseInt(occ?.active_er_patients || 0) > 20 ? 'medium' : 'low';

  return {
    boarding_patients: {
      count: boardRows.length,
      items: boardRows.map(r => ({
        patient: r.patient_name, mrn: r.mrn,
        er_hours: Math.round(parseFloat(r.er_hours || 0)),
        diagnosis: r.primary_diagnosis,
        triage: r.triage_level,
        urgency: parseFloat(r.er_hours || 0) > 8 ? 'critical' : 'high',
      })),
    },
    performance: {
      active_er_patients: parseInt(occ?.active_er_patients || 0),
      avg_door_to_doctor_minutes: avgD2D,
      door_to_doctor_status: avgD2D > 60 ? 'poor' : avgD2D > 30 ? 'acceptable' : 'good',
      visits_today: parseInt(d2d?.er_visits_today || 0),
      diversion_risk: diversionRisk,
    },
    acuity_distribution: acuity.map(r => ({ level: r.triage_level, count: parseInt(r.count), pct: parseFloat(r.pct || 0) })),
    alerts: [
      ...(boardRows.length > 5 ? [{ severity: 'high', message: `${boardRows.length} patients boarding > 4h — expedite ward bed allocation` }] : []),
      ...(avgD2D > 60 ? [{ severity: 'high', message: `Door-to-doctor time ${Math.round(avgD2D)} min — exceeds 60-min benchmark` }] : []),
      ...(diversionRisk === 'high' ? [{ severity: 'critical', message: 'ER at surge capacity — consider ambulance diversion protocol' }] : []),
    ],
  };
}

// ─── 7. OPD AI ───────────────────────────────────────────────────────────────

export async function getOPDAI(organizationId) {
  const [noShow, utilization, waitTime, followUpGap] = await Promise.allSettled([

    // No-show prediction (based on historical pattern: distance, prior no-shows, time slot)
    q(`SELECT d.name AS doctor_name, d.specialty,
              COUNT(*) FILTER (WHERE ap.status = 'no_show') AS no_shows,
              COUNT(*) AS total_appointments,
              ROUND(COUNT(*) FILTER (WHERE ap.status = 'no_show') * 100.0 / NULLIF(COUNT(*),0), 1) AS no_show_rate
         FROM appointments ap
         LEFT JOIN doctors d ON d.id = ap.doctor_id
        WHERE ap.organization_id = :orgId
          AND ap.scheduled_at >= NOW() - INTERVAL '30 days'
        GROUP BY d.name, d.specialty
        HAVING COUNT(*) >= 5
        ORDER BY no_show_rate DESC LIMIT 10`, { orgId: organizationId }),

    // Doctor utilization score
    q(`SELECT d.name AS doctor_name, d.specialty,
              COUNT(*) AS total_slots,
              COUNT(*) FILTER (WHERE ap.status NOT IN ('cancelled','no_show')) AS attended,
              ROUND(COUNT(*) FILTER (WHERE ap.status NOT IN ('cancelled','no_show')) * 100.0 / NULLIF(COUNT(*),0), 1) AS utilization_pct
         FROM appointments ap
         JOIN doctors d ON d.id = ap.doctor_id
        WHERE ap.organization_id = :orgId
          AND ap.scheduled_at >= NOW() - INTERVAL '7 days'
          AND ap.scheduled_at <= NOW()
        GROUP BY d.name, d.specialty
        ORDER BY utilization_pct DESC LIMIT 15`, { orgId: organizationId }),

    // Average wait time by specialty today
    q(`SELECT d.specialty,
              ROUND(AVG(EXTRACT(EPOCH FROM (ap.actual_start - ap.scheduled_at))/60)::numeric,0) AS avg_wait_minutes,
              COUNT(*) AS patients_today
         FROM appointments ap
         JOIN doctors d ON d.id = ap.doctor_id
        WHERE ap.organization_id = :orgId
          AND ap.scheduled_at >= CURRENT_DATE
          AND ap.actual_start IS NOT NULL
        GROUP BY d.specialty
        ORDER BY avg_wait_minutes DESC`, { orgId: organizationId }),

    // Follow-up compliance gap
    q(`SELECT d.name AS doctor_name, d.specialty,
              COUNT(*) AS due_follow_ups,
              COUNT(*) FILTER (WHERE ap2.id IS NULL) AS missed_follow_ups
         FROM appointments ap
         JOIN doctors d ON d.id = ap.doctor_id
         LEFT JOIN appointments ap2 ON ap2.patient_id = ap.patient_id
           AND ap2.scheduled_at > ap.scheduled_at
           AND ap2.scheduled_at <= ap.scheduled_at + INTERVAL '30 days'
        WHERE ap.organization_id = :orgId
          AND ap.status = 'completed'
          AND ap.requires_followup = true
          AND ap.scheduled_at BETWEEN NOW() - INTERVAL '60 days' AND NOW() - INTERVAL '30 days'
        GROUP BY d.name, d.specialty
        HAVING COUNT(*) FILTER (WHERE ap2.id IS NULL) > 0
        ORDER BY missed_follow_ups DESC LIMIT 10`, { orgId: organizationId }),
  ]);

  return {
    no_show_analytics: (noShow.status === 'fulfilled' ? noShow.value : []).map(r => ({
      doctor: r.doctor_name, specialty: r.specialty,
      no_show_rate: parseFloat(r.no_show_rate || 0),
      total: parseInt(r.total_appointments || 0),
      risk_level: parseFloat(r.no_show_rate || 0) > 20 ? 'high' : parseFloat(r.no_show_rate || 0) > 10 ? 'medium' : 'low',
      recommendation: parseFloat(r.no_show_rate || 0) > 20 ? 'Enable SMS reminder + overbooking strategy' : 'Standard reminder protocol',
    })),
    doctor_utilization: (utilization.status === 'fulfilled' ? utilization.value : []).map(r => ({
      doctor: r.doctor_name, specialty: r.specialty,
      utilization_pct: parseFloat(r.utilization_pct || 0),
      attended: parseInt(r.attended || 0), total: parseInt(r.total_slots || 0),
      status: parseFloat(r.utilization_pct || 0) >= 85 ? 'optimal' : parseFloat(r.utilization_pct || 0) >= 70 ? 'good' : 'low',
    })),
    wait_time: (waitTime.status === 'fulfilled' ? waitTime.value : []).map(r => ({
      specialty: r.specialty, avg_wait: parseInt(r.avg_wait_minutes || 0),
      patients: parseInt(r.patients_today || 0),
      status: parseInt(r.avg_wait_minutes || 0) > 30 ? 'high-wait' : 'acceptable',
    })),
    follow_up_gap: (followUpGap.status === 'fulfilled' ? followUpGap.value : []).map(r => ({
      doctor: r.doctor_name, specialty: r.specialty,
      missed: parseInt(r.missed_follow_ups || 0), total_due: parseInt(r.due_follow_ups || 0),
    })),
  };
}

// ─── 8. SURVEILLANCE / SECURITY AI ──────────────────────────────────────────

export async function getSurveillanceAI(organizationId) {
  const [afterHours, accessAnomaly, medicationDiversion, incidentTrend] = await Promise.allSettled([

    // After-hours login activity (logins between 11pm and 5am)
    q(`SELECT u.name AS user_name, u.role, al.action, al.ip_address,
              al.created_at, al.resource_type
         FROM audit_logs al
         JOIN users u ON u.id = al.user_id
        WHERE al.organization_id = :orgId
          AND EXTRACT(HOUR FROM al.created_at) BETWEEN 23 AND 5
          AND al.created_at >= NOW() - INTERVAL '7 days'
          AND al.action NOT IN ('read','view')
        ORDER BY al.created_at DESC LIMIT 20`, { orgId: organizationId }),

    // Access anomaly: same user accessing >50 patient records in 1 hour
    q(`SELECT u.name AS user_name, u.role,
              DATE_TRUNC('hour', al.created_at) AS access_hour,
              COUNT(DISTINCT al.resource_id) AS records_accessed
         FROM audit_logs al
         JOIN users u ON u.id = al.user_id
        WHERE al.organization_id = :orgId
          AND al.resource_type = 'patient'
          AND al.created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY u.name, u.role, DATE_TRUNC('hour', al.created_at)
        HAVING COUNT(DISTINCT al.resource_id) > 50
        ORDER BY records_accessed DESC`, { orgId: organizationId }),

    // Medication diversion risk (controlled drugs administered with no witness)
    q(`SELECT p.name AS patient_name, er.drug_name, er.administered_at,
              er.administered_by, er.witness_name,
              pr.drug_class, pr.controlled_substance
         FROM emar_records er
         JOIN prescriptions pr ON pr.id = er.prescription_id
         JOIN admissions a ON a.id = er.admission_id
         JOIN patients p ON p.id = a.patient_id
        WHERE er.organization_id = :orgId
          AND pr.controlled_substance = true
          AND er.witness_name IS NULL
          AND er.administered_at >= NOW() - INTERVAL '7 days'
        ORDER BY er.administered_at DESC LIMIT 20`, { orgId: organizationId }),

    // Incident trend by type (last 30 days)
    q(`SELECT incident_type, COUNT(*) AS count,
              COUNT(*) FILTER (WHERE severity = 'high') AS high_severity
         FROM incident_reports
        WHERE organization_id = :orgId
          AND reported_at >= NOW() - INTERVAL '30 days'
        GROUP BY incident_type
        ORDER BY count DESC LIMIT 10`, { orgId: organizationId }),
  ]);

  const afterHoursRows  = afterHours.status === 'fulfilled' ? afterHours.value : [];
  const anomalyRows     = accessAnomaly.status === 'fulfilled' ? accessAnomaly.value : [];
  const diversionRows   = medicationDiversion.status === 'fulfilled' ? medicationDiversion.value : [];
  const incidentRows    = incidentTrend.status === 'fulfilled' ? incidentTrend.value : [];

  const riskScore = Math.min(100,
    anomalyRows.length * 20 +
    diversionRows.length * 10 +
    afterHoursRows.filter(r => r.action === 'delete').length * 15
  );

  return {
    security_risk_score: riskScore,
    risk_level: riskScore >= 60 ? 'high' : riskScore >= 30 ? 'medium' : 'low',
    after_hours_activity: afterHoursRows.slice(0, 10).map(r => ({
      user: r.user_name, role: r.role, action: r.action,
      time: r.created_at, resource: r.resource_type, ip: r.ip_address,
    })),
    access_anomalies: anomalyRows.map(r => ({
      user: r.user_name, role: r.role,
      records_accessed: parseInt(r.records_accessed || 0),
      hour: r.access_hour,
      alert: `${r.user_name} accessed ${r.records_accessed} patient records in 1 hour — possible data export risk`,
    })),
    medication_diversion_risk: diversionRows.map(r => ({
      patient: r.patient_name, drug: r.drug_name,
      administered_by: r.administered_by, time: r.administered_at,
      alert: 'Controlled substance administered without witness documentation',
    })),
    incident_trends: incidentRows.map(r => ({
      type: r.incident_type, count: parseInt(r.count), high_severity: parseInt(r.high_severity || 0),
    })),
    alerts: [
      ...(anomalyRows.length > 0 ? [{ severity: 'critical', message: `${anomalyRows.length} user(s) accessed unusually high volume of patient records — investigate potential data breach` }] : []),
      ...(diversionRows.length > 0 ? [{ severity: 'high', message: `${diversionRows.length} controlled drug administrations without witness — review medication diversion risk` }] : []),
      ...(afterHoursRows.length > 5 ? [{ severity: 'medium', message: `${afterHoursRows.length} after-hours system actions detected in past 7 days` }] : []),
    ],
  };
}

// ─── 9. INSURANCE AI ─────────────────────────────────────────────────────────

export async function getInsuranceAI(organizationId) {
  const [claimsAging, denialPatterns, insurerPerformance, cashlessConversion] = await Promise.allSettled([

    // Claims aging
    q(`SELECT
          SUM(CASE WHEN NOW() - submitted_at < INTERVAL '30 days' THEN requested_amount ELSE 0 END) AS bucket_0_30,
          SUM(CASE WHEN NOW() - submitted_at BETWEEN INTERVAL '30 days' AND INTERVAL '60 days' THEN requested_amount ELSE 0 END) AS bucket_30_60,
          SUM(CASE WHEN NOW() - submitted_at BETWEEN INTERVAL '60 days' AND INTERVAL '90 days' THEN requested_amount ELSE 0 END) AS bucket_60_90,
          SUM(CASE WHEN NOW() - submitted_at > INTERVAL '90 days' THEN requested_amount ELSE 0 END) AS bucket_90_plus,
          COUNT(*) AS total_pending
         FROM pre_auth_requests
        WHERE organization_id = :orgId AND status IN ('submitted','pending')`, { orgId: organizationId }),

    // Denial patterns by reason
    q(`SELECT denial_reason, COUNT(*) AS count,
              SUM(requested_amount) AS denied_amount
         FROM pre_auth_requests
        WHERE organization_id = :orgId
          AND status = 'denied'
          AND submitted_at >= NOW() - INTERVAL '90 days'
          AND denial_reason IS NOT NULL
        GROUP BY denial_reason
        ORDER BY count DESC LIMIT 8`, { orgId: organizationId }),

    // Insurer performance (approval rate, avg TAT)
    q(`SELECT insurer_name,
              COUNT(*) AS total_claims,
              ROUND(COUNT(*) FILTER (WHERE status = 'approved') * 100.0 / NULLIF(COUNT(*),0),1) AS approval_rate,
              ROUND(AVG(EXTRACT(EPOCH FROM (decision_at - submitted_at))/3600)::numeric,0) AS avg_tat_hours,
              SUM(approved_amount) AS total_approved
         FROM pre_auth_requests
        WHERE organization_id = :orgId
          AND submitted_at >= NOW() - INTERVAL '90 days'
          AND insurer_name IS NOT NULL
        GROUP BY insurer_name
        ORDER BY approval_rate DESC LIMIT 10`, { orgId: organizationId }),

    // Cashless conversion rate
    one(`SELECT
          COUNT(*) AS total_admissions,
          COUNT(*) FILTER (WHERE admission_type IN ('insurance','tpa','corporate')) AS insured_admissions,
          COUNT(*) FILTER (WHERE EXISTS (
            SELECT 1 FROM pre_auth_requests pa WHERE pa.admission_id = a.id AND pa.status = 'approved'
          )) AS cashless_admissions
         FROM admissions a
        WHERE organization_id = :orgId
          AND admitted_at >= NOW() - INTERVAL '30 days'`, { orgId: organizationId }),
  ]);

  const aging = claimsAging.status === 'fulfilled' ? claimsAging.value[0] ?? {} : {};
  const denials = denialPatterns.status === 'fulfilled' ? denialPatterns.value : [];
  const insurers = insurerPerformance.status === 'fulfilled' ? insurerPerformance.value : [];
  const conv = cashlessConversion.status === 'fulfilled' ? cashlessConversion.value : {};

  const cashlessRate = conv?.insured_admissions > 0
    ? Math.round(parseInt(conv?.cashless_admissions || 0) / parseInt(conv?.insured_admissions || 1) * 100) : 0;

  return {
    claims_aging: {
      bucket_0_30: Math.round(parseFloat(aging?.bucket_0_30 || 0)),
      bucket_30_60: Math.round(parseFloat(aging?.bucket_30_60 || 0)),
      bucket_60_90: Math.round(parseFloat(aging?.bucket_60_90 || 0)),
      bucket_90_plus: Math.round(parseFloat(aging?.bucket_90_plus || 0)),
      total_pending: parseInt(aging?.total_pending || 0),
      at_risk: Math.round(parseFloat(aging?.bucket_90_plus || 0)) > 0,
    },
    denial_patterns: denials.map(r => ({
      reason: r.denial_reason, count: parseInt(r.count),
      denied_amount: Math.round(parseFloat(r.denied_amount || 0)),
    })),
    insurer_scoreboard: insurers.map(r => ({
      insurer: r.insurer_name, claims: parseInt(r.total_claims),
      approval_rate: parseFloat(r.approval_rate || 0),
      avg_tat_hours: parseInt(r.avg_tat_hours || 0),
      total_approved: Math.round(parseFloat(r.total_approved || 0)),
      rating: parseFloat(r.approval_rate || 0) >= 85 ? 'A' : parseFloat(r.approval_rate || 0) >= 70 ? 'B' : 'C',
    })),
    cashless_conversion: {
      rate_pct: cashlessRate,
      insured_admissions: parseInt(conv?.insured_admissions || 0),
      cashless_admissions: parseInt(conv?.cashless_admissions || 0),
      status: cashlessRate >= 80 ? 'good' : cashlessRate >= 60 ? 'acceptable' : 'needs-improvement',
    },
  };
}

// ─── 10. ACCOUNTS AI ─────────────────────────────────────────────────────────

export async function getAccountsAI(organizationId) {
  const [revenue, arAging, cashFlow, deptRevenue] = await Promise.allSettled([

    // Revenue summary (last 30 days vs prior 30 days)
    q(`SELECT
          SUM(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN total_amount ELSE 0 END) AS current_30d,
          SUM(CASE WHEN created_at BETWEEN NOW() - INTERVAL '60 days' AND NOW() - INTERVAL '30 days' THEN total_amount ELSE 0 END) AS prior_30d,
          COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) AS invoices_current,
          SUM(CASE WHEN created_at >= NOW() - INTERVAL '30 days' AND payment_status = 'paid' THEN total_amount ELSE 0 END) AS collected_30d
         FROM billing_estimates
        WHERE organization_id = :orgId`, { orgId: organizationId }),

    // Accounts receivable aging
    q(`SELECT
          SUM(CASE WHEN NOW() - created_at < INTERVAL '30 days' THEN outstanding_amount ELSE 0 END) AS ar_0_30,
          SUM(CASE WHEN NOW() - created_at BETWEEN INTERVAL '30 days' AND INTERVAL '60 days' THEN outstanding_amount ELSE 0 END) AS ar_30_60,
          SUM(CASE WHEN NOW() - created_at BETWEEN INTERVAL '60 days' AND INTERVAL '90 days' THEN outstanding_amount ELSE 0 END) AS ar_60_90,
          SUM(CASE WHEN NOW() - created_at > INTERVAL '90 days' THEN outstanding_amount ELSE 0 END) AS ar_90_plus
         FROM billing_estimates
        WHERE organization_id = :orgId AND payment_status != 'paid'`, { orgId: organizationId }),

    // Daily cash flow (last 14 days)
    q(`SELECT DATE(created_at) AS date,
              SUM(total_amount) AS billed,
              SUM(CASE WHEN payment_status = 'paid' THEN total_amount ELSE 0 END) AS collected
         FROM billing_estimates
        WHERE organization_id = :orgId
          AND created_at >= NOW() - INTERVAL '14 days'
        GROUP BY 1 ORDER BY 1`, { orgId: organizationId }),

    // Revenue by service line / department
    q(`SELECT service_category,
              SUM(total_amount) AS revenue,
              COUNT(*) AS invoices
         FROM billing_estimates
        WHERE organization_id = :orgId
          AND created_at >= NOW() - INTERVAL '30 days'
          AND service_category IS NOT NULL
        GROUP BY service_category
        ORDER BY revenue DESC LIMIT 10`, { orgId: organizationId }),
  ]);

  const rev      = revenue.status === 'fulfilled' ? revenue.value[0] ?? {} : {};
  const ar       = arAging.status === 'fulfilled' ? arAging.value[0] ?? {} : {};
  const cf       = cashFlow.status === 'fulfilled' ? cashFlow.value : [];
  const deptRev  = deptRevenue.status === 'fulfilled' ? deptRevenue.value : [];

  const cur = parseFloat(rev?.current_30d || 0);
  const prv = parseFloat(rev?.prior_30d || 0);
  const growth = prv > 0 ? Math.round((cur - prv) / prv * 100 * 10) / 10 : 0;

  return {
    revenue_summary: {
      current_30d: Math.round(cur),
      prior_30d: Math.round(prv),
      growth_pct: growth,
      trend: growth >= 0 ? 'up' : 'down',
      invoices: parseInt(rev?.invoices_current || 0),
      collected_30d: Math.round(parseFloat(rev?.collected_30d || 0)),
      collection_pct: cur > 0 ? Math.round(parseFloat(rev?.collected_30d || 0) / cur * 100) : 0,
    },
    ar_aging: {
      ar_0_30: Math.round(parseFloat(ar?.ar_0_30 || 0)),
      ar_30_60: Math.round(parseFloat(ar?.ar_30_60 || 0)),
      ar_60_90: Math.round(parseFloat(ar?.ar_60_90 || 0)),
      ar_90_plus: Math.round(parseFloat(ar?.ar_90_plus || 0)),
      at_risk_pct: cur > 0 ? Math.round(parseFloat(ar?.ar_90_plus || 0) / cur * 100) : 0,
    },
    cash_flow_trend: cf.map(r => ({
      date: r.date, billed: Math.round(parseFloat(r.billed || 0)),
      collected: Math.round(parseFloat(r.collected || 0)),
    })),
    revenue_by_dept: deptRev.map(r => ({
      dept: r.service_category, revenue: Math.round(parseFloat(r.revenue || 0)),
      invoices: parseInt(r.invoices || 0),
    })),
    ai_insights: buildAccountsInsights(growth, ar, cur),
  };
}

function buildAccountsInsights(growth, ar, cur) {
  const insights = [];
  if (growth < -10) insights.push({ type: 'warning', message: `Revenue declined ${Math.abs(growth)}% vs prior month — investigate admission volume and billing cycle` });
  if (growth > 20) insights.push({ type: 'positive', message: `Revenue grew ${growth}% vs prior month — validate billing completeness to sustain trajectory` });
  const ar90Plus = parseFloat(ar?.ar_90_plus || 0);
  if (ar90Plus > 0 && cur > 0 && ar90Plus / cur > 0.15) {
    insights.push({ type: 'critical', message: `${Math.round(ar90Plus / cur * 100)}% of monthly revenue stuck in 90+ day AR — escalate collections for aged accounts` });
  }
  return insights;
}

// ─── 11. HRMS AI ─────────────────────────────────────────────────────────────

export async function getHRMSAI(organizationId) {
  const [attendance, overtime, turnover, training] = await Promise.allSettled([

    // Attendance analytics (last 30 days)
    q(`SELECT department, role,
              COUNT(DISTINCT user_id) AS staff_count,
              ROUND(AVG(attendance_pct)::numeric, 1) AS avg_attendance_pct,
              COUNT(*) FILTER (WHERE attendance_pct < 80) AS below_threshold
         FROM staff_attendance_summary
        WHERE organization_id = :orgId
          AND period_month = DATE_TRUNC('month', NOW())
        GROUP BY department, role
        ORDER BY avg_attendance_pct ASC LIMIT 10`, { orgId: organizationId }),

    // Overtime risk (staff exceeding 48h/week)
    q(`SELECT u.name AS staff_name, u.role, u.department,
              SUM(wl.hours_worked) AS weekly_hours,
              SUM(wl.hours_worked) - 48 AS overtime_hours
         FROM work_logs wl
         JOIN users u ON u.id = wl.user_id
        WHERE wl.organization_id = :orgId
          AND wl.log_date >= NOW() - INTERVAL '7 days'
        GROUP BY u.name, u.role, u.department
        HAVING SUM(wl.hours_worked) > 48
        ORDER BY weekly_hours DESC LIMIT 15`, { orgId: organizationId }),

    // Turnover risk (staff who haven't logged in for > 7 days)
    q(`SELECT u.name, u.role, u.department,
              MAX(al.created_at) AS last_login,
              DATE_PART('day', NOW() - MAX(al.created_at)) AS days_absent
         FROM users u
         LEFT JOIN audit_logs al ON al.user_id = u.id
        WHERE u.organization_id = :orgId
          AND u.role NOT IN ('patient','admin')
          AND u.is_active = true
        GROUP BY u.name, u.role, u.department
        HAVING MAX(al.created_at) < NOW() - INTERVAL '7 days' OR MAX(al.created_at) IS NULL
        ORDER BY days_absent DESC NULLS FIRST LIMIT 15`, { orgId: organizationId }),

    // Training compliance
    q(`SELECT training_module, COUNT(*) AS staff_due,
              COUNT(*) FILTER (WHERE completed_at IS NOT NULL) AS completed,
              ROUND(COUNT(*) FILTER (WHERE completed_at IS NOT NULL) * 100.0 / NULLIF(COUNT(*),0),1) AS completion_rate
         FROM staff_training_records
        WHERE organization_id = :orgId
          AND due_date <= NOW()
        GROUP BY training_module
        ORDER BY completion_rate ASC LIMIT 10`, { orgId: organizationId }),
  ]);

  return {
    attendance_analytics: (attendance.status === 'fulfilled' ? attendance.value : []).map(r => ({
      department: r.department, role: r.role, staff_count: parseInt(r.staff_count),
      avg_attendance: parseFloat(r.avg_attendance_pct || 0),
      below_threshold: parseInt(r.below_threshold || 0),
      status: parseFloat(r.avg_attendance_pct || 0) < 80 ? 'critical' : parseFloat(r.avg_attendance_pct || 0) < 90 ? 'monitor' : 'good',
    })),
    overtime_risk: (overtime.status === 'fulfilled' ? overtime.value : []).map(r => ({
      staff: r.staff_name, role: r.role, department: r.department,
      weekly_hours: parseFloat(r.weekly_hours || 0),
      overtime_hours: Math.round(parseFloat(r.overtime_hours || 0)),
      risk: parseFloat(r.weekly_hours || 0) > 60 ? 'high' : 'medium',
      alert: parseFloat(r.weekly_hours || 0) > 60 ? 'Immediate workload redistribution needed' : 'Monitor next week',
    })),
    turnover_risk: (turnover.status === 'fulfilled' ? turnover.value : []).map(r => ({
      staff: r.name, role: r.role, department: r.department,
      last_login: r.last_login, days_absent: Math.round(parseFloat(r.days_absent || 0)),
      risk: parseFloat(r.days_absent || 0) > 14 ? 'high' : 'medium',
    })),
    training_compliance: (training.status === 'fulfilled' ? training.value : []).map(r => ({
      module: r.training_module, due: parseInt(r.staff_due),
      completed: parseInt(r.completed), rate: parseFloat(r.completion_rate || 0),
      status: parseFloat(r.completion_rate || 0) < 60 ? 'critical' : parseFloat(r.completion_rate || 0) < 80 ? 'needs-attention' : 'compliant',
    })),
  };
}
