/**
 * Phase B: Critical findings alerts — STAT queue bump.
 */
import pool from '../../db/pgPool.js';
import { publishEvent, KAFKA_TOPICS } from '../../config/kafka.js';
import { transitionWorkflow, getWorkflowForStudy } from './imaging-workflow.service.js';
import { recordMetric } from './imaging-observability.service.js';
import { CRITICAL_PATTERNS } from './imaging-critical-patterns.js';

export async function evaluateCriticalFindings({ studyId, studyInstanceUID, tenantId, findings = [] }) {
  const alerts = [];
  const textBlob = JSON.stringify(findings);

  for (const item of findings) {
    const label = item.label || item.name || '';
    const note = item.note || item.description || '';
    const combined = `${label} ${note}`;
    const severity = (item.severity || '').toLowerCase();

    if (severity === 'high' || severity === 'critical') {
      alerts.push({ type: 'triage_high', label, severity: 'high', source: 'triage' });
    }

    for (const cp of CRITICAL_PATTERNS) {
      if (cp.pattern.test(combined) || cp.pattern.test(label)) {
        alerts.push({ type: cp.type, label: cp.label, severity: 'critical', source: 'pattern' });
      }
    }
  }

  for (const cp of CRITICAL_PATTERNS) {
    if (cp.pattern.test(textBlob)) {
      if (!alerts.find((a) => a.type === cp.type)) {
        alerts.push({ type: cp.type, label: cp.label, severity: 'critical', source: 'pattern' });
      }
    }
  }

  const created = [];
  for (const alert of alerts) {
    const row = await createCriticalAlert({
      studyId,
      studyInstanceUID,
      tenantId,
      alertType: alert.type,
      severity: alert.severity,
      findingLabel: alert.label,
    });
    created.push(row);
  }

  if (created.length) {
    await bumpStudyToStat(studyId, tenantId);
    await recordMetric('imaging_critical_alert', created.length, { tenantId });
    await publishEvent(KAFKA_TOPICS.IMAGING_AI_TRIAGE_COMPLETE, {
      studyId,
      studyInstanceUID,
      criticalAlerts: created.length,
      action: 'stat_queue_bump',
    }).catch(() => {});
  }

  return created;
}

async function createCriticalAlert({
  studyId, studyInstanceUID, tenantId, alertType, severity, findingLabel,
}) {
  const existing = await pool.query(
    `SELECT id FROM imaging_critical_alerts
     WHERE study_id = $1 AND alert_type = $2 AND status = 'open' LIMIT 1`,
    [studyId, alertType],
  );
  if (existing.rows[0]) return existing.rows[0];

  const wf = await getWorkflowForStudy(studyId);
  const r = await pool.query(
    `INSERT INTO imaging_critical_alerts
       (study_id, study_instance_uid, tenant_id, alert_type, severity, finding_label, workflow_bumped)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [studyId, studyInstanceUID, tenantId, alertType, severity, findingLabel, Boolean(wf)],
  );
  return r.rows[0];
}

async function bumpStudyToStat(studyId, tenantId) {
  await pool.query(
    `UPDATE ris_studies SET priority = 'STAT' WHERE id = $1 AND lab_id = $2 AND priority != 'STAT'`,
    [studyId, tenantId],
  );
  const wf = await getWorkflowForStudy(studyId);
  if (wf?.id) {
    await pool.query(
      `UPDATE imaging_workflow_instances SET priority = 'stat', updated_at = NOW() WHERE id = $1`,
      [wf.id],
    );
  }
}

export async function listOpenCriticalAlerts(tenantId, limit = 50) {
  const r = await pool.query(
    `SELECT a.*, s.patient_name, s.modality, s.study_date
     FROM imaging_critical_alerts a
     LEFT JOIN ris_studies s ON s.id = a.study_id
     WHERE a.tenant_id = $1 AND a.status = 'open'
     ORDER BY a.created_at DESC LIMIT $2`,
    [tenantId, limit],
  );
  return r.rows;
}

export async function acknowledgeCriticalAlert(alertId, userId, tenantId) {
  const r = await pool.query(
    `UPDATE imaging_critical_alerts
     SET status = 'acknowledged', acknowledged_at = NOW(), acknowledged_by = $3
     WHERE id = $1 AND tenant_id = $2 RETURNING *`,
    [alertId, tenantId, userId],
  );
  return r.rows[0];
}
