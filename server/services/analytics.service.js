/**
 * Analytics Service — Leadership Command Center + Operational/Clinical/Quality KPIs
 * Section 6.8 (Leadership workspace), Section 12 (KPIs), Section 7 (Analytics module)
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';

async function q(sql, replacements = {}) {
  try {
    return await sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
  } catch {
    return [];
  }
}

async function qOne(sql, replacements = {}) {
  const rows = await q(sql, replacements);
  return rows[0] || null;
}

// ── Live Command Center Snapshot ──────────────────────────────────────────────

export async function getCommandCenter(organizationId) {
  const [beds, admissions, otToday, critAlerts, pendingDischarges, preauths, icuCensus] =
    await Promise.all([
      // Bed census
      qOne(`SELECT
              COUNT(*) FILTER (WHERE status != 'decommissioned')                AS total,
              COUNT(*) FILTER (WHERE status = 'occupied')                        AS occupied,
              COUNT(*) FILTER (WHERE status = 'available')                       AS available,
              COUNT(*) FILTER (WHERE status = 'blocked' OR status = 'housekeeping') AS blocked
            FROM beds
            WHERE organization_id = :orgId`, { orgId: organizationId }),

      // Active admissions
      qOne(`SELECT COUNT(*) AS count
            FROM ip_admissions
            WHERE organization_id = :orgId AND status = 'active'`, { orgId: organizationId }),

      // Today's OT cases
      qOne(`SELECT
              COUNT(*) AS total,
              COUNT(*) FILTER (WHERE status IN ('patient_in','prep','incision','closure')) AS in_progress,
              COUNT(*) FILTER (WHERE status = 'completed')                                AS completed,
              COUNT(*) FILTER (WHERE actual_start > scheduled_start + INTERVAL '15 minutes') AS delayed
            FROM ot_bookings
            WHERE organization_id = :orgId
              AND scheduled_start::date = CURRENT_DATE`, { orgId: organizationId }),

      // Unacknowledged critical alerts (vitals + lab rules)
      qOne(`SELECT
              (SELECT COUNT(*) FROM vital_alerts       WHERE organization_id = :orgId AND status = 'active' AND severity IN ('red','orange'))
            + (SELECT COUNT(*) FROM lab_rule_alerts    WHERE organization_id = :orgId AND status = 'active' AND severity IN ('critical','high'))
            AS count`, { orgId: organizationId }),

      // Admissions ready to discharge but not yet discharged
      qOne(`SELECT COUNT(DISTINCT a.id) AS count
            FROM ip_admissions a
            WHERE a.organization_id = :orgId AND a.status = 'active'
              AND NOT EXISTS (
                SELECT 1 FROM discharge_readiness_items r
                WHERE r.admission_id = a.id AND r.mandatory = TRUE AND r.is_complete = FALSE
              )
              AND EXISTS (
                SELECT 1 FROM discharge_readiness_items r2
                WHERE r2.admission_id = a.id
              )`, { orgId: organizationId }),

      // Pre-auths pending
      qOne(`SELECT COUNT(*) AS count
            FROM pre_authorizations
            WHERE organization_id = :orgId AND status = 'pending'`, { orgId: organizationId }),

      // ICU census
      qOne(`SELECT COUNT(*) FILTER (WHERE status = 'active') AS active
            FROM icu_admissions
            WHERE organization_id = :orgId`, { orgId: organizationId }),
    ]);

  const occupancyPct = beds?.total > 0
    ? Math.round((Number(beds.occupied) / Number(beds.total)) * 100)
    : 0;

  return {
    generatedAt: new Date().toISOString(),
    beds: {
      total:       Number(beds?.total       || 0),
      occupied:    Number(beds?.occupied    || 0),
      available:   Number(beds?.available   || 0),
      blocked:     Number(beds?.blocked     || 0),
      occupancyPct
    },
    activeAdmissions:     Number(admissions?.count     || 0),
    icuActive:            Number(icuCensus?.active     || 0),
    otToday: {
      total:      Number(otToday?.total      || 0),
      inProgress: Number(otToday?.in_progress || 0),
      completed:  Number(otToday?.completed  || 0),
      delayed:    Number(otToday?.delayed    || 0),
    },
    criticalAlerts:      Number(critAlerts?.count      || 0),
    pendingDischarges:   Number(pendingDischarges?.count || 0),
    preauthsPending:     Number(preauths?.count        || 0),
  };
}

// ── Operational KPIs ──────────────────────────────────────────────────────────

export async function getOperationalKPIs(organizationId, { days = 7 } = {}) {
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const [bedAllocTime, otDelays, dischargeDelay, opToIpTime, erTriage] = await Promise.all([

    // Average bed allocation time (admit event timestamp - admission created_at)
    qOne(`SELECT
            ROUND(AVG(EXTRACT(EPOCH FROM (e.performed_at - a.created_at))/60), 1) AS avg_minutes,
            COUNT(*) AS sample_size
          FROM adt_events e
          JOIN ip_admissions a ON a.id = e.admission_id
          WHERE e.organization_id = :orgId
            AND e.event_type = 'admitted'
            AND e.performed_at >= :since
            AND a.bed_id IS NOT NULL`, { orgId: organizationId, since }),

    // OT delays (% cases starting >15 min late)
    qOne(`SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE actual_start > scheduled_start + INTERVAL '15 minutes') AS delayed,
            CASE WHEN COUNT(*) > 0
              THEN ROUND(100.0 * COUNT(*) FILTER (WHERE actual_start > scheduled_start + INTERVAL '15 minutes') / COUNT(*), 1)
              ELSE 0 END AS delay_pct,
            ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(actual_start, scheduled_start) - scheduled_start))/60), 1) AS avg_delay_minutes
          FROM ot_bookings
          WHERE organization_id = :orgId
            AND scheduled_start >= :since
            AND status NOT IN ('cancelled','postponed')`, { orgId: organizationId, since }),

    // Discharge TAT (time from last mandatory readiness completion to discharge event)
    qOne(`SELECT
            ROUND(AVG(
              EXTRACT(EPOCH FROM (e.performed_at -
                (SELECT MAX(r.completed_at)
                 FROM discharge_readiness_items r
                 WHERE r.admission_id = a.id AND r.mandatory = TRUE)
              ))/60
            ), 1) AS avg_minutes,
            COUNT(*) AS sample_size
          FROM adt_events e
          JOIN ip_admissions a ON a.id = e.admission_id
          WHERE e.organization_id = :orgId
            AND e.event_type = 'discharged'
            AND e.performed_at >= :since`, { orgId: organizationId, since }),

    // OP-to-IP conversion time
    qOne(`SELECT
            ROUND(AVG(EXTRACT(EPOCH FROM (performed_at - created_at))/60), 1) AS avg_minutes,
            COUNT(*) AS count
          FROM adt_events
          WHERE organization_id = :orgId
            AND event_type = 'converted_op_to_ip'
            AND performed_at >= :since`, { orgId: organizationId, since }),

    // ER door-to-triage (from er_visits: arrival_time to triage_time)
    qOne(`SELECT
            ROUND(AVG(EXTRACT(EPOCH FROM (triage_time - arrival_time))/60), 1) AS avg_minutes,
            COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (triage_time - arrival_time))/60 <= 5) AS within_target,
            COUNT(*) AS total
          FROM er_visits
          WHERE organization_id = :orgId
            AND arrival_time >= :since
            AND triage_time IS NOT NULL`, { orgId: organizationId, since }),
  ]);

  return {
    periodDays: days,
    since,
    bedAllocation: {
      avgMinutes:    Number(bedAllocTime?.avg_minutes  || 0),
      sampleSize:    Number(bedAllocTime?.sample_size  || 0),
      target:        15,
      onTarget:      Number(bedAllocTime?.avg_minutes  || 0) <= 15,
    },
    otDelay: {
      total:         Number(otDelays?.total             || 0),
      delayed:       Number(otDelays?.delayed           || 0),
      delayPct:      Number(otDelays?.delay_pct         || 0),
      avgDelayMin:   Number(otDelays?.avg_delay_minutes || 0),
      target:        5,
      onTarget:      Number(otDelays?.delay_pct         || 0) <= 5,
    },
    dischargeTAT: {
      avgMinutes:    Number(dischargeDelay?.avg_minutes || 0),
      sampleSize:    Number(dischargeDelay?.sample_size || 0),
      target:        30,
      onTarget:      Number(dischargeDelay?.avg_minutes || 0) <= 30,
    },
    opToIpConversion: {
      avgMinutes:    Number(opToIpTime?.avg_minutes || 0),
      count:         Number(opToIpTime?.count       || 0),
      target:        10,
      onTarget:      Number(opToIpTime?.avg_minutes || 0) <= 10,
    },
    erDoorToTriage: {
      avgMinutes:    Number(erTriage?.avg_minutes   || 0),
      withinTarget:  Number(erTriage?.within_target || 0),
      total:         Number(erTriage?.total         || 0),
      target:        5,
      onTarget:      Number(erTriage?.avg_minutes   || 0) <= 5,
    },
  };
}

// ── Clinical Adoption KPIs ────────────────────────────────────────────────────

export async function getClinicalKPIs(organizationId, { days = 7 } = {}) {
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const [emar, tasks, alertAck, dischargeDraft] = await Promise.all([

    // eMAR compliance (administered vs scheduled orders in window)
    qOne(`SELECT
            COUNT(*) FILTER (WHERE status = 'administered') AS administered,
            COUNT(*) AS total,
            CASE WHEN COUNT(*) > 0
              THEN ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'administered') / COUNT(*), 1)
              ELSE 0 END AS compliance_pct
          FROM medication_administrations
          WHERE organization_id = :orgId
            AND scheduled_time >= :since`, { orgId: organizationId, since }),

    // Nursing task completion rate
    qOne(`SELECT
            COUNT(*) FILTER (WHERE status = 'completed') AS completed,
            COUNT(*) AS total,
            CASE WHEN COUNT(*) > 0
              THEN ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'completed') / COUNT(*), 1)
              ELSE 0 END AS completion_pct
          FROM nursing_tasks
          WHERE organization_id = :orgId
            AND created_at >= :since`, { orgId: organizationId, since }),

    // Critical alert acknowledgement time (minutes)
    qOne(`SELECT
            ROUND(AVG(EXTRACT(EPOCH FROM (acknowledged_at - created_at))/60), 1) AS avg_ack_minutes,
            COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (acknowledged_at - created_at))/60 <= 10) AS within_target,
            COUNT(*) FILTER (WHERE acknowledged_at IS NOT NULL) AS acknowledged,
            COUNT(*) AS total
          FROM (
            SELECT created_at, acknowledged_at FROM vital_alerts
            WHERE organization_id = :orgId AND severity IN ('red','orange') AND created_at >= :since
            UNION ALL
            SELECT created_at, acknowledged_at FROM lab_rule_alerts
            WHERE organization_id = :orgId AND severity IN ('critical','high') AND created_at >= :since
          ) alerts`, { orgId: organizationId, since }),

    // AI-assisted discharge summaries
    qOne(`SELECT
            COUNT(*) FILTER (WHERE ai_assisted = TRUE) AS ai_assisted,
            COUNT(*) AS total,
            CASE WHEN COUNT(*) > 0
              THEN ROUND(100.0 * COUNT(*) FILTER (WHERE ai_assisted = TRUE) / COUNT(*), 1)
              ELSE 0 END AS ai_usage_pct,
            ROUND(AVG(EXTRACT(EPOCH FROM (signed_at - created_at))/60)
              FILTER (WHERE signed_at IS NOT NULL), 1) AS avg_review_minutes
          FROM discharge_packets
          WHERE organization_id = :orgId
            AND created_at >= :since`, { orgId: organizationId, since }),
  ]);

  return {
    periodDays: days,
    emar: {
      administered:    Number(emar?.administered    || 0),
      total:           Number(emar?.total           || 0),
      compliancePct:   Number(emar?.compliance_pct  || 0),
      target:          95,
      onTarget:        Number(emar?.compliance_pct  || 0) >= 95,
    },
    nursingTasks: {
      completed:       Number(tasks?.completed       || 0),
      total:           Number(tasks?.total           || 0),
      completionPct:   Number(tasks?.completion_pct  || 0),
      target:          85,
      onTarget:        Number(tasks?.completion_pct  || 0) >= 85,
    },
    criticalAlertAck: {
      avgMinutes:      Number(alertAck?.avg_ack_minutes || 0),
      withinTarget:    Number(alertAck?.within_target   || 0),
      acknowledged:    Number(alertAck?.acknowledged    || 0),
      total:           Number(alertAck?.total           || 0),
      target:          10,
      onTarget:        Number(alertAck?.avg_ack_minutes || 0) <= 10,
    },
    aiDischargeDraft: {
      aiAssisted:      Number(dischargeDraft?.ai_assisted     || 0),
      total:           Number(dischargeDraft?.total           || 0),
      usagePct:        Number(dischargeDraft?.ai_usage_pct    || 0),
      avgReviewMin:    Number(dischargeDraft?.avg_review_minutes || 0),
      target:          70,
      onTarget:        Number(dischargeDraft?.ai_usage_pct    || 0) >= 70,
    },
  };
}

// ── Quality and Revenue KPIs ──────────────────────────────────────────────────

export async function getQualityKPIs(organizationId, { days = 30 } = {}) {
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const [followUp, discharge, preauth, readmission, consent] = await Promise.all([

    // Follow-up adherence (attended vs scheduled)
    qOne(`SELECT
            COUNT(*) FILTER (WHERE status = 'completed') AS attended,
            COUNT(*) FILTER (WHERE status IN ('scheduled','pending')) AS pending,
            COUNT(*) AS total,
            CASE WHEN COUNT(*) FILTER (WHERE status != 'pending') > 0
              THEN ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'completed')
                / NULLIF(COUNT(*) FILTER (WHERE status != 'pending'), 0), 1)
              ELSE 0 END AS adherence_pct
          FROM follow_up_plans
          WHERE organization_id = :orgId
            AND planned_date < NOW()
            AND created_at >= :since`, { orgId: organizationId, since }),

    // Discharge packet delivery rate
    qOne(`SELECT
            COUNT(*) FILTER (WHERE delivery_status = 'delivered') AS delivered,
            COUNT(*) AS total,
            CASE WHEN COUNT(*) > 0
              THEN ROUND(100.0 * COUNT(*) FILTER (WHERE delivery_status = 'delivered') / COUNT(*), 1)
              ELSE 0 END AS delivery_pct
          FROM discharge_packets
          WHERE organization_id = :orgId
            AND created_at >= :since`, { orgId: organizationId, since }),

    // Pre-auth completeness and approval rate
    qOne(`SELECT
            COUNT(*) FILTER (WHERE status = 'approved') AS approved,
            COUNT(*) FILTER (WHERE status = 'rejected')  AS denied,
            COUNT(*) FILTER (WHERE status IN ('approved','rejected')) AS submitted,
            CASE WHEN COUNT(*) FILTER (WHERE status IN ('approved','rejected')) > 0
              THEN ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'approved')
                / NULLIF(COUNT(*) FILTER (WHERE status IN ('approved','rejected')), 0), 1)
              ELSE 0 END AS approval_pct
          FROM pre_authorizations
          WHERE organization_id = :orgId
            AND created_at >= :since`, { orgId: organizationId, since }),

    // Readmission within 30 days (readmissions / total discharges)
    qOne(`SELECT
            COUNT(*) FILTER (WHERE readmission_flag = TRUE) AS readmissions,
            COUNT(*) AS total_discharges,
            CASE WHEN COUNT(*) > 0
              THEN ROUND(100.0 * COUNT(*) FILTER (WHERE readmission_flag = TRUE) / COUNT(*), 1)
              ELSE 0 END AS readmission_pct
          FROM ip_admissions
          WHERE organization_id = :orgId
            AND status = 'discharged'
            AND discharged_at >= :since`, { orgId: organizationId, since }),

    // Consent enforcement coverage (actions where consent was verified)
    qOne(`SELECT
            COUNT(*) FILTER (WHERE status = 'allowed')   AS allowed,
            COUNT(*) FILTER (WHERE status = 'override')  AS overridden,
            COUNT(*) FILTER (WHERE status = 'blocked')   AS blocked,
            COUNT(*) AS total
          FROM consent_enforcement_log
          WHERE organization_id = :orgId
            AND checked_at >= :since`, { orgId: organizationId, since }),
  ]);

  return {
    periodDays: days,
    followUpAdherence: {
      attended:       Number(followUp?.attended       || 0),
      pending:        Number(followUp?.pending        || 0),
      total:          Number(followUp?.total          || 0),
      adherencePct:   Number(followUp?.adherence_pct  || 0),
      target:         80,
      onTarget:       Number(followUp?.adherence_pct  || 0) >= 80,
    },
    dischargeDelivery: {
      delivered:      Number(discharge?.delivered     || 0),
      total:          Number(discharge?.total         || 0),
      deliveryPct:    Number(discharge?.delivery_pct  || 0),
      target:         100,
      onTarget:       Number(discharge?.delivery_pct  || 0) >= 95,
    },
    preauth: {
      approved:       Number(preauth?.approved        || 0),
      denied:         Number(preauth?.denied          || 0),
      submitted:      Number(preauth?.submitted       || 0),
      approvalPct:    Number(preauth?.approval_pct    || 0),
      // Rejection rate = denied / submitted * 100
      rejectionPct:   preauth?.submitted > 0
        ? Math.round(100 * Number(preauth?.denied || 0) / Number(preauth?.submitted)) : 0,
      target:         3, // <3% rejection
      onTarget:       (preauth?.submitted > 0
        ? Math.round(100 * Number(preauth?.denied || 0) / Number(preauth?.submitted)) : 0) <= 3,
    },
    readmission: {
      readmissions:   Number(readmission?.readmissions     || 0),
      totalDischarges:Number(readmission?.total_discharges || 0),
      readmissionPct: Number(readmission?.readmission_pct  || 0),
    },
    consentEnforcement: {
      allowed:        Number(consent?.allowed    || 0),
      overridden:     Number(consent?.overridden || 0),
      blocked:        Number(consent?.blocked    || 0),
      total:          Number(consent?.total      || 0),
    },
  };
}

// ── Financial / Revenue KPIs ──────────────────────────────────────────────────

export async function getFinancialKPIs(organizationId, { days = 30 } = {}) {
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const [estimates, nonPayable, preauthAmount] = await Promise.all([

    qOne(`SELECT
            COUNT(*) AS total_estimates,
            ROUND(AVG(total_estimate_amount), 2)  AS avg_estimate_amount,
            ROUND(SUM(total_estimate_amount), 2)  AS total_estimated_revenue,
            COUNT(*) FILTER (WHERE payer_type = 'insurance') AS insurance_cases,
            COUNT(*) FILTER (WHERE payer_type = 'corporate') AS corporate_cases,
            COUNT(*) FILTER (WHERE payer_type = 'self_pay')  AS self_pay_cases
          FROM billing_estimates
          WHERE organization_id = :orgId
            AND created_at >= :since`, { orgId: organizationId, since }),

    qOne(`SELECT
            COUNT(*) AS total_items,
            ROUND(SUM(amount), 2) AS total_non_payable_amount
          FROM billing_non_payables
          WHERE organization_id = :orgId
            AND created_at >= :since`, { orgId: organizationId, since }),

    qOne(`SELECT
            ROUND(SUM(approved_amount), 2)   AS total_approved,
            ROUND(SUM(estimated_amount), 2)  AS total_requested,
            COUNT(*) FILTER (WHERE status = 'approved') AS approved_count
          FROM pre_authorizations
          WHERE organization_id = :orgId
            AND status = 'approved'
            AND created_at >= :since`, { orgId: organizationId, since }),
  ]);

  return {
    periodDays: days,
    estimates: {
      total:           Number(estimates?.total_estimates        || 0),
      avgAmount:       Number(estimates?.avg_estimate_amount    || 0),
      totalRevenue:    Number(estimates?.total_estimated_revenue|| 0),
      byPayer: {
        insurance:     Number(estimates?.insurance_cases || 0),
        corporate:     Number(estimates?.corporate_cases || 0),
        selfPay:       Number(estimates?.self_pay_cases  || 0),
      }
    },
    nonPayable: {
      items:           Number(nonPayable?.total_items            || 0),
      totalAmount:     Number(nonPayable?.total_non_payable_amount || 0),
    },
    preauth: {
      totalApproved:   Number(preauthAmount?.total_approved   || 0),
      totalRequested:  Number(preauthAmount?.total_requested  || 0),
      approvedCount:   Number(preauthAmount?.approved_count   || 0),
    },
  };
}

// ── Patient Experience KPIs ───────────────────────────────────────────────────

export async function getPatientExperienceKPIs(organizationId, { days = 30 } = {}) {
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const [feedback, otFamily, dischargeDigital, followUpRisk] = await Promise.all([

    qOne(`SELECT
            ROUND(AVG(satisfaction_score), 1)                                   AS avg_satisfaction,
            COUNT(*) FILTER (WHERE satisfaction_score >= 4)                     AS positive_count,
            COUNT(*)                                                             AS total_feedback,
            COUNT(*) FILTER (WHERE readmission_occurred = TRUE)                 AS readmitted,
            COUNT(*) FILTER (WHERE complications_reported IS NOT NULL)          AS complications
          FROM outcome_records
          WHERE organization_id = :orgId
            AND created_at >= :since`, { orgId: organizationId, since }),

    // Family OT status coverage (family notifications sent vs total OT cases)
    qOne(`SELECT
            COUNT(DISTINCT fn.ot_booking_id) AS cases_with_notification,
            COUNT(DISTINCT ob.id)            AS total_cases
          FROM ot_bookings ob
          LEFT JOIN family_notifications fn ON fn.ot_booking_id = ob.id
          WHERE ob.organization_id = :orgId
            AND ob.scheduled_start >= :since`, { orgId: organizationId, since }),

    // Discharge packet delivery (digital)
    qOne(`SELECT
            COUNT(*) FILTER (WHERE channel IN ('whatsapp','email','app')) AS digital_delivered,
            COUNT(*)                                                       AS total
          FROM discharge_packets
          WHERE organization_id = :orgId
            AND delivery_status = 'delivered'
            AND created_at >= :since`, { orgId: organizationId, since }),

    // High-risk follow-up coverage
    qOne(`SELECT
            COUNT(*) FILTER (WHERE risk_level IN ('high','critical') AND status != 'cancelled') AS high_risk_followed,
            COUNT(*) FILTER (WHERE risk_level IN ('high','critical'))                            AS high_risk_total
          FROM follow_up_plans
          WHERE organization_id = :orgId
            AND created_at >= :since`, { orgId: organizationId, since }),
  ]);

  const familyCovPct = otFamily?.total_cases > 0
    ? Math.round(100 * Number(otFamily.cases_with_notification) / Number(otFamily.total_cases))
    : 0;

  const highRiskCovPct = followUpRisk?.high_risk_total > 0
    ? Math.round(100 * Number(followUpRisk.high_risk_followed) / Number(followUpRisk.high_risk_total))
    : 0;

  return {
    periodDays: days,
    satisfaction: {
      avgScore:        Number(feedback?.avg_satisfaction  || 0),
      positiveCount:   Number(feedback?.positive_count    || 0),
      total:           Number(feedback?.total_feedback    || 0),
      target:          4.0,
      onTarget:        Number(feedback?.avg_satisfaction  || 0) >= 4.0,
    },
    familyOTCoverage: {
      casesWithNotification: Number(otFamily?.cases_with_notification || 0),
      totalCases:            Number(otFamily?.total_cases             || 0),
      coveragePct:           familyCovPct,
      target:                90,
      onTarget:              familyCovPct >= 90,
    },
    digitalDischarge: {
      digitalDelivered: Number(dischargeDigital?.digital_delivered || 0),
      total:            Number(dischargeDigital?.total             || 0),
      target:           100,
      onTarget:         Number(dischargeDigital?.total || 0) === 0 ||
                        Number(dischargeDigital?.digital_delivered || 0) >= Number(dischargeDigital?.total || 1),
    },
    highRiskFollowUp: {
      followed:         Number(followUpRisk?.high_risk_followed || 0),
      total:            Number(followUpRisk?.high_risk_total    || 0),
      coveragePct:      highRiskCovPct,
      target:           90,
      onTarget:         highRiskCovPct >= 90,
    },
  };
}

// ── Ward-level Census ─────────────────────────────────────────────────────────

export async function getWardCensus(organizationId) {
  return q(`SELECT
              w.id AS ward_id,
              w.name AS ward_name,
              w.ward_type,
              COUNT(b.id) FILTER (WHERE b.status != 'decommissioned') AS total_beds,
              COUNT(b.id) FILTER (WHERE b.status = 'occupied')         AS occupied,
              COUNT(b.id) FILTER (WHERE b.status = 'available')        AS available,
              COUNT(b.id) FILTER (WHERE b.status IN ('blocked','housekeeping')) AS blocked
            FROM wards w
            LEFT JOIN beds b ON b.ward_id = w.id
            WHERE w.organization_id = :orgId
            GROUP BY w.id, w.name, w.ward_type
            ORDER BY w.name`, { orgId: organizationId });
}

// ── LOS Trend ─────────────────────────────────────────────────────────────────

export async function getLOSTrend(organizationId, { days = 30 } = {}) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  return qOne(`SELECT
                 ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(discharged_at, NOW()) - admitted_at))/86400), 1) AS avg_los_days,
                 ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
                   ORDER BY EXTRACT(EPOCH FROM (COALESCE(discharged_at, NOW()) - admitted_at))/86400
                 ), 1) AS median_los_days,
                 COUNT(*) AS count
               FROM ip_admissions
               WHERE organization_id = :orgId
                 AND admitted_at >= :since`, { orgId: organizationId, since });
}
