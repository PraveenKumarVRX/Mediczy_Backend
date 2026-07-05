/**
 * CareOS — AI Chief Clinical Coordinator (specific actionable alerts)
 */
import pool from '../../db/pgPool.js';
import { up as migrate } from '../../migrations/careos-phase1.migration.js';
import { getPatientWorkspace } from '../clinical-workspace.service.js';
import { appendClinicalEvent } from './clinical-timeline.service.js';
import llmProvider from '../ai-brain/llm-provider.js';

let ready = false;
async function ensure() { if (!ready) { await migrate(); ready = true; } }

function heuristicAlerts(workspace) {
  const alerts = [];
  const vitals = workspace?.vitals?.[0] || {};
  const labs = workspace?.pendingOrders || [];

  if (vitals.bp_systolic && vitals.bp_systolic < 90) {
    alerts.push({
      alertType: 'hypotension',
      message: `Systolic BP ${vitals.bp_systolic} mmHg. Review volume status, bleeding, and sepsis workup.`,
      severity: 'critical',
      evidence: { bp_systolic: vitals.bp_systolic },
    });
  }
  if (vitals.spo2 && vitals.spo2 < 92) {
    alerts.push({
      alertType: 'hypoxia',
      message: `SpO₂ ${vitals.spo2}% — evaluate supplemental oxygen, ABG, and respiratory cause.`,
      severity: 'critical',
      evidence: { spo2: vitals.spo2 },
    });
  }

  const news = workspace?.alerts?.[0]?.news2_score;
  if (news != null && news >= 7) {
    alerts.push({
      alertType: 'ews_high',
      message: `NEWS2 score ${news} — escalation per early warning protocol recommended.`,
      severity: 'warning',
      evidence: { news2: news },
    });
  }

  return alerts;
}

export async function analyzePatient(patientId, organizationId) {
  await ensure();
  const workspace = await getPatientWorkspace(patientId, organizationId).catch(() => null);

  const alerts = heuristicAlerts(workspace);

  try {
    const llm = await llmProvider.chat({
      messages: [
        {
          role: 'system',
          content: `You are the Chief Clinical Coordinator. Output JSON: { "alerts": [{ "alertType", "message", "severity", "evidence" }] }.
Write SPECIFIC actionable alerts with numbers and trends. Never say only "patient unstable". Max 3 alerts.`,
        },
        {
          role: 'user',
          content: `Patient workspace:\n${JSON.stringify({
            vitals: workspace?.vitals?.slice(0, 3),
            meds: workspace?.medications?.slice(0, 5),
            alerts: workspace?.alerts,
            diagnosis: workspace?.admission?.diagnosis,
          }, null, 2)}`,
        },
      ],
      temperature: 0.2,
      maxTokens: 800,
      responseFormat: { type: 'json_object' },
      skipCache: true,
    });
    const parsed = JSON.parse(llm.content || '{}');
    if (Array.isArray(parsed.alerts)) {
      for (const a of parsed.alerts) {
        if (!alerts.find((x) => x.message === a.message)) alerts.push(a);
      }
    }
  } catch {
    // heuristics only
  }

  const saved = [];
  for (const a of alerts.slice(0, 5)) {
    const { rows } = await pool.query(
      `INSERT INTO careos_coordinator_alerts (organization_id, patient_id, alert_type, message, evidence, severity)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6) RETURNING *`,
      [organizationId, patientId, a.alertType || 'clinical', a.message, JSON.stringify(a.evidence || {}), a.severity || 'warning']
    );
    saved.push(rows[0]);
    await appendClinicalEvent({
      organizationId,
      patientId,
      eventType: 'ai_insight',
      title: 'AI Clinical Coordinator',
      body: a.message,
      actorType: 'ai',
      actorName: 'CareOS Coordinator',
      severity: a.severity === 'critical' ? 'critical' : 'warning',
      metadata: a.evidence,
    });
  }

  return { alerts: saved, analyzedAt: new Date().toISOString() };
}

export async function listCoordinatorAlerts(patientId, organizationId) {
  await ensure();
  const { rows } = await pool.query(
    `SELECT * FROM careos_coordinator_alerts
     WHERE patient_id = $1 AND ($2::bigint IS NULL OR organization_id = $2) AND status = 'active'
     ORDER BY created_at DESC LIMIT 20`,
    [patientId, organizationId || null]
  );
  return rows;
}

export default { analyzePatient, listCoordinatorAlerts };
