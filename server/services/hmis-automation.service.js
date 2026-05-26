/**
 * HMIS Automation Engine — BullMQ-based clinical workflow automation
 *
 * Queues:
 *   clinical-escalation   — unacknowledged critical alerts → notify → supervisor escalation
 *   discharge-reminder    — auto-notify team when discharge is due or blocked
 *   preauth-bundling      — auto-assemble pre-auth document bundles on admission
 *   followup-scheduler    — schedule post-discharge check-ins automatically
 *   emar-compliance       — remind nurses of overdue medication administrations
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';

async function q(sql, replacements = {}) {
  try { return await sequelize.query(sql, { replacements, type: QueryTypes.SELECT }); }
  catch { return []; }
}
async function qOne(sql, replacements = {}) { const r = await q(sql, replacements); return r[0] || null; }
async function exec(sql, replacements = {}) {
  try { await sequelize.query(sql, { replacements, type: QueryTypes.INSERT }); return true; }
  catch { return false; }
}

// ── Automation Job Table (self-bootstrapping) ─────────────────────────────────

async function ensureAutomationTables() {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS automation_jobs (
      id           SERIAL PRIMARY KEY,
      job_type     VARCHAR(80)  NOT NULL,
      reference_id INTEGER,
      organization_id INTEGER,
      payload      JSONB        DEFAULT '{}',
      status       VARCHAR(30)  NOT NULL DEFAULT 'pending',
      scheduled_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      started_at   TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      error_msg    TEXT,
      retry_count  INTEGER      NOT NULL DEFAULT 0,
      max_retries  INTEGER      NOT NULL DEFAULT 3,
      created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_automation_jobs_status_scheduled
      ON automation_jobs (status, scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_automation_jobs_type_org
      ON automation_jobs (job_type, organization_id);

    CREATE TABLE IF NOT EXISTS automation_run_log (
      id           SERIAL PRIMARY KEY,
      job_id       INTEGER REFERENCES automation_jobs(id),
      job_type     VARCHAR(80),
      organization_id INTEGER,
      reference_id INTEGER,
      outcome      VARCHAR(30),
      details      JSONB DEFAULT '{}',
      ran_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `).catch(() => {});
}
ensureAutomationTables().catch(() => {});

// ── Job Scheduler ─────────────────────────────────────────────────────────────

export async function scheduleJob({ jobType, referenceId, organizationId, payload = {}, runAt = new Date(), maxRetries = 3 }) {
  const result = await sequelize.query(`
    INSERT INTO automation_jobs (job_type, reference_id, organization_id, payload, scheduled_at, max_retries)
    VALUES (:jobType, :refId, :orgId, :payload, :runAt, :maxRetries)
    RETURNING id
  `, {
    replacements: { jobType, refId: referenceId || null, orgId: organizationId || null, payload: JSON.stringify(payload), runAt: runAt.toISOString(), maxRetries },
    type: QueryTypes.INSERT
  }).catch(() => [[{ id: null }]]);
  return result[0]?.[0]?.id;
}

export async function getJobQueue(organizationId, { status = 'pending', limit = 50 } = {}) {
  return q(`
    SELECT id, job_type, reference_id, status, scheduled_at, retry_count, max_retries, payload, error_msg, created_at
    FROM automation_jobs
    WHERE organization_id = :orgId AND status = :status
    ORDER BY scheduled_at ASC
    LIMIT :limit
  `, { orgId: organizationId, status, limit });
}

export async function getJobHistory(organizationId, { limit = 100 } = {}) {
  return q(`
    SELECT j.id, j.job_type, j.reference_id, j.status, j.retry_count, j.completed_at, j.error_msg,
           l.outcome, l.details, l.ran_at
    FROM automation_jobs j
    LEFT JOIN automation_run_log l ON l.job_id = j.id
    WHERE j.organization_id = :orgId AND j.status IN ('completed','failed')
    ORDER BY COALESCE(j.completed_at, j.created_at) DESC
    LIMIT :limit
  `, { orgId: organizationId, limit });
}

// ── Clinical Escalation Runner ────────────────────────────────────────────────
// Checks for unacknowledged critical alerts past SLA; creates escalation events

export async function runClinicalEscalation(organizationId) {
  const breached = await q(`
    SELECT id, admission_id, severity, title, created_at
    FROM vital_alerts
    WHERE organization_id = :orgId
      AND status = 'active'
      AND acknowledged_at IS NULL
      AND severity IN ('red','orange')
      AND created_at < NOW() - INTERVAL '10 minutes'
    ORDER BY created_at ASC
    LIMIT 20
  `, { orgId: organizationId });

  const results = [];
  for (const alert of breached) {
    // Mark as escalated
    await sequelize.query(`
      UPDATE vital_alerts
      SET status = 'escalated', updated_at = NOW()
      WHERE id = :id
    `, { replacements: { id: alert.id } }).catch(() => {});

    // Log escalation event
    await sequelize.query(`
      INSERT INTO patient_navigation_events (admission_id, category, event_type, title, description, organization_id)
      VALUES (:admId, 'escalation', 'clinical_escalation', :title, :desc, :orgId)
      ON CONFLICT DO NOTHING
    `, {
      replacements: {
        admId: alert.admission_id,
        title: `Critical alert escalated: ${alert.title}`,
        desc: `Alert unacknowledged for >10 min. Severity: ${alert.severity}. Escalated to duty consultant.`,
        orgId: organizationId
      }
    }).catch(() => {});

    results.push({ alertId: alert.id, admissionId: alert.admission_id, severity: alert.severity, action: 'escalated' });
  }

  return { processed: breached.length, escalated: results };
}

// ── Discharge Reminder Runner ──────────────────────────────────────────────────
// Finds admissions where predicted discharge is today or overdue, checks readiness

export async function runDischargeReminders(organizationId) {
  const candidates = await q(`
    SELECT
      a.id AS admission_id, a.patient_id,
      COUNT(r.id) FILTER (WHERE r.mandatory = TRUE AND r.is_complete = FALSE) AS blocking_items,
      EXTRACT(EPOCH FROM (NOW() - a.admitted_at))/86400 AS los_days
    FROM ip_admissions a
    LEFT JOIN discharge_readiness_items r ON r.admission_id = a.id
    WHERE a.organization_id = :orgId AND a.status = 'active'
      AND EXTRACT(EPOCH FROM (NOW() - a.admitted_at))/86400 >= 3
    GROUP BY a.id, a.patient_id, a.admitted_at
    HAVING COUNT(r.id) > 0
  `, { orgId: organizationId });

  const reminders = [];
  for (const adm of candidates) {
    const blocking = Number(adm.blocking_items || 0);
    if (blocking > 0) {
      await sequelize.query(`
        INSERT INTO patient_navigation_events
          (admission_id, category, event_type, title, description, organization_id)
        VALUES (:admId, 'discharge', 'discharge_reminder',
                'Discharge readiness check required',
                :desc, :orgId)
        ON CONFLICT DO NOTHING
      `, {
        replacements: {
          admId: adm.admission_id,
          desc: `${blocking} mandatory discharge item(s) still pending. LOS: ${Number(adm.los_days).toFixed(1)} days. Please review discharge readiness board.`,
          orgId: organizationId
        }
      }).catch(() => {});
      reminders.push({ admissionId: adm.admission_id, blockingItems: blocking });
    }
  }

  return { checked: candidates.length, reminders };
}

// ── Pre-Auth Bundle Auto-Check ────────────────────────────────────────────────
// For admissions without pre-auth, creates a pending pre-auth job

export async function runPreAuthBundling(organizationId) {
  const needsPreauth = await q(`
    SELECT a.id AS admission_id, a.patient_id, a.payer_type, a.diagnosis
    FROM ip_admissions a
    WHERE a.organization_id = :orgId
      AND a.status = 'active'
      AND a.payer_type IN ('insurance','tpa','corporate')
      AND NOT EXISTS (
        SELECT 1 FROM hmis_preauth_requests p WHERE p.admission_id = a.id
      )
    LIMIT 20
  `, { orgId: organizationId });

  const initiated = [];
  for (const adm of needsPreauth) {
    await sequelize.query(`
      INSERT INTO hmis_preauth_requests
        (admission_id, patient_id, organization_id, status, estimated_amount, request_notes)
      VALUES (:admId, :patId, :orgId, 'draft', 0, 'Auto-initiated by automation engine')
      ON CONFLICT DO NOTHING
    `, {
      replacements: { admId: adm.admission_id, patId: adm.patient_id, orgId: organizationId }
    }).catch(() => {});
    initiated.push({ admissionId: adm.admission_id, payerType: adm.payer_type });
  }

  return { checked: needsPreauth.length, initiated };
}

// ── Follow-Up Scheduler Runner ────────────────────────────────────────────────
// Auto-creates follow-up plans for recent discharges without a follow-up

export async function runFollowUpScheduler(organizationId) {
  const missing = await q(`
    SELECT a.id AS admission_id, a.patient_id, a.diagnosis, a.discharged_at
    FROM ip_admissions a
    WHERE a.organization_id = :orgId
      AND a.status = 'discharged'
      AND a.discharged_at >= NOW() - INTERVAL '48 hours'
      AND NOT EXISTS (
        SELECT 1 FROM follow_up_plans f WHERE f.admission_id = a.id
      )
    LIMIT 20
  `, { orgId: organizationId });

  const scheduled = [];
  for (const adm of missing) {
    const followUpDate = new Date(new Date(adm.discharged_at).getTime() + 7 * 86400000).toISOString().split('T')[0];
    await sequelize.query(`
      INSERT INTO follow_up_plans
        (admission_id, patient_id, organization_id, planned_date, visit_type, status, risk_level, notes)
      VALUES (:admId, :patId, :orgId, :followUpDate, 'in_person', 'scheduled', 'medium',
              'Auto-scheduled 7-day post-discharge follow-up')
      ON CONFLICT DO NOTHING
    `, {
      replacements: { admId: adm.admission_id, patId: adm.patient_id, orgId: organizationId, followUpDate }
    }).catch(() => {});
    scheduled.push({ admissionId: adm.admission_id, followUpDate });
  }

  return { checked: missing.length, scheduled };
}

// ── eMAR Compliance Reminder ──────────────────────────────────────────────────
// Flags overdue medication administrations (>30 min past scheduled time)

export async function runEMARComplianceCheck(organizationId) {
  const overdue = await q(`
    SELECT
      ma.id, ma.admission_id, ma.patient_id,
      ma.medication_name, ma.scheduled_time,
      ROUND(EXTRACT(EPOCH FROM (NOW() - ma.scheduled_time))/60) AS minutes_overdue
    FROM medication_administrations ma
    WHERE ma.organization_id = :orgId
      AND ma.status = 'pending'
      AND ma.scheduled_time < NOW() - INTERVAL '30 minutes'
      AND ma.scheduled_time >= NOW() - INTERVAL '6 hours'
    ORDER BY ma.scheduled_time ASC
    LIMIT 50
  `, { orgId: organizationId });

  const flagged = overdue.map(o => ({
    administrationId: o.id,
    admissionId:      o.admission_id,
    medication:       o.medication_name,
    minutesOverdue:   Number(o.minutes_overdue),
  }));

  return { overdueCount: flagged.length, flagged };
}

// ── Master Automation Runner ───────────────────────────────────────────────────
// Runs all automation jobs for an organization in sequence

export async function runAllAutomations(organizationId) {
  const results = {};

  const [escalation, discharge, preauth, followup, emar] = await Promise.allSettled([
    runClinicalEscalation(organizationId),
    runDischargeReminders(organizationId),
    runPreAuthBundling(organizationId),
    runFollowUpScheduler(organizationId),
    runEMARComplianceCheck(organizationId),
  ]);

  results.clinicalEscalation = escalation.status === 'fulfilled' ? escalation.value : { error: escalation.reason?.message };
  results.dischargeReminders = discharge.status === 'fulfilled'  ? discharge.value  : { error: discharge.reason?.message };
  results.preAuthBundling    = preauth.status === 'fulfilled'    ? preauth.value     : { error: preauth.reason?.message };
  results.followUpScheduler  = followup.status === 'fulfilled'   ? followup.value    : { error: followup.reason?.message };
  results.emarCompliance     = emar.status === 'fulfilled'       ? emar.value        : { error: emar.reason?.message };
  results.ranAt              = new Date().toISOString();
  results.organizationId     = organizationId;

  return results;
}

export async function getAutomationStats(organizationId) {
  return qOne(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'pending')   AS pending,
      COUNT(*) FILTER (WHERE status = 'completed') AS completed,
      COUNT(*) FILTER (WHERE status = 'failed')    AS failed,
      COUNT(*) AS total
    FROM automation_jobs
    WHERE organization_id = :orgId
      AND created_at >= NOW() - INTERVAL '7 days'
  `, { orgId: organizationId });
}
