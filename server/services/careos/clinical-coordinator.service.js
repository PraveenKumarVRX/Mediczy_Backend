/**
 * CareOS — AI Chief Clinical Coordinator (specific actionable alerts)
 */
import pool from '../../db/pgPool.js';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';
import { up as migrate } from '../../migrations/careos-phase1.migration.js';
import { getPatientWorkspace } from '../clinical-workspace.service.js';
import { getVitalsTrend } from '../vitals-ews.service.js';
import { appendClinicalEvent } from './clinical-timeline.service.js';
import { autoAdvancePathway } from './treatment-pathway.service.js';
import llmProvider from '../ai-brain/llm-provider.js';

let ready = false;
async function ensure() { if (!ready) { await migrate(); ready = true; } }

function heuristicAlerts(workspace) {
  const alerts = [];
  const vitals = workspace?.latestVitals || {};

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

  const news = workspace?.activeAlerts?.[0]?.news2_score;
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

// ── Monitoring Agent: multi-signal trend correlation ─────────────────────────
// Unlike heuristicAlerts() above (single-reading threshold check), this looks
// at the TREND across the last several readings plus recent labs, so it can
// say "heart rate has risen steadily for 4 hours, combined with rising
// lactate and falling BP" instead of just "HR 128".

function slope(values) {
  // values are oldest→newest; returns per-reading average change.
  const nums = values.filter((v) => v != null && !Number.isNaN(Number(v))).map(Number);
  if (nums.length < 3) return null;
  let total = 0;
  for (let i = 1; i < nums.length; i++) total += nums[i] - nums[i - 1];
  return total / (nums.length - 1);
}

function describeTrend(s, unit, risingIsBad = true) {
  if (s == null) return null;
  const magnitude = Math.abs(s);
  if (magnitude < 0.5) return null; // essentially flat — not worth narrating
  const direction = s > 0 ? 'risen' : 'fallen';
  const concern = (s > 0) === risingIsBad ? 'concerning' : 'reassuring';
  return { direction, magnitude, concern, unit };
}

async function correlatedTrendAlerts(admissionId, organizationId, patientId) {
  if (!admissionId) return [];
  const trend = await getVitalsTrend(admissionId, organizationId, { hours: 6 }).catch(() => []);
  if (trend.length < 3) return [];

  // getVitalsTrend returns newest→oldest; reverse for oldest→newest slope calc.
  const chrono = [...trend].reverse();
  const hrSlope = slope(chrono.map((v) => v.pulse));
  const sbpSlope = slope(chrono.map((v) => v.bp_systolic));
  const spo2Slope = slope(chrono.map((v) => v.spo2));

  // lab_results has no admission_id — it's keyed by userId (== patientId),
  // with camelCase testName/isAbnormal/reportDate columns.
  const recentLabs = await sequelize.query(
    `SELECT "testName" AS test_name, value AS result_value, "isAbnormal" AS is_abnormal, "reportDate" AS reported_at
     FROM lab_results
     WHERE "userId" = :patientId AND "reportDate" > NOW() - INTERVAL '12 hours'
       AND ("testName" ILIKE '%lactate%' OR "testName" ILIKE '%creatinine%' OR "testName" ILIKE '%wbc%' OR "testName" ILIKE '%white%')
     ORDER BY "reportDate" DESC LIMIT 5`,
    { replacements: { patientId }, type: QueryTypes.SELECT }
  ).catch(() => []);

  const hrTrend = describeTrend(hrSlope, 'bpm', true);
  const sbpTrend = describeTrend(sbpSlope, 'mmHg', false); // falling SBP is the bad direction
  const spo2Trend = describeTrend(spo2Slope, '%', false);
  const abnormalLabs = recentLabs.filter((l) => l.is_abnormal);

  // Only surface a correlated alert when at least 2 independent signals move
  // in a clinically concerning direction together — a single trending vital
  // is already covered by the per-reading NEWS2 alert in vitals-ews.service.js.
  const concerningSignals = [
    hrTrend?.concern === 'concerning' ? `heart rate ${hrTrend.direction} ~${hrTrend.magnitude.toFixed(0)} bpm/reading over ${chrono.length} readings` : null,
    sbpTrend?.concern === 'concerning' ? `systolic BP ${sbpTrend.direction} ~${sbpTrend.magnitude.toFixed(0)} mmHg/reading` : null,
    spo2Trend?.concern === 'concerning' ? `SpO2 ${spo2Trend.direction} ~${spo2Trend.magnitude.toFixed(1)}%/reading` : null,
    abnormalLabs.length ? `abnormal ${abnormalLabs.map((l) => l.test_name).join(', ')}` : null,
  ].filter(Boolean);

  if (concerningSignals.length < 2) return [];

  try {
    const llm = await llmProvider.chat({
      messages: [
        {
          role: 'system',
          content: `You are a clinical monitoring assistant. Given a correlated pattern of trending vitals and labs (not a single reading), write ONE specific, actionable alert sentence — the kind a doctor would want instead of a generic "vital abnormal" alarm. Reference the actual trend and timeframe. Do not invent numbers not given. Output JSON: {"message": "", "severity": "warning|critical"}`,
        },
        { role: 'user', content: `Correlated signals over the last ${chrono.length} readings (~6h window): ${concerningSignals.join('; ')}.` },
      ],
      temperature: 0.2,
      maxTokens: 200,
      responseFormat: { type: 'json_object' },
      skipCache: true,
    });
    const parsed = JSON.parse(llm.content || '{}');
    if (!parsed.message) return [];
    return [{
      alertType: 'trend_correlation',
      message: parsed.message,
      severity: parsed.severity === 'critical' ? 'critical' : 'warning',
      evidence: { signals: concerningSignals, hrSlope, sbpSlope, spo2Slope, abnormalLabs },
    }];
  } catch (err) {
    // Fallback: still surface the correlation, just without LLM narration.
    return [{
      alertType: 'trend_correlation',
      message: `Trending pattern over last ${chrono.length} readings: ${concerningSignals.join('; ')}. Reassessment recommended.`,
      severity: concerningSignals.length >= 3 ? 'critical' : 'warning',
      evidence: { signals: concerningSignals },
    }];
  }
}

export async function analyzePatient(patientId, organizationId) {
  await ensure();
  const workspace = await getPatientWorkspace(patientId, organizationId).catch(() => null);

  const alerts = heuristicAlerts(workspace);
  const trendAlerts = await correlatedTrendAlerts(workspace?.activeAdmission?.id, organizationId, patientId).catch(() => []);
  alerts.push(...trendAlerts);

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
            vitals: workspace?.vitalsTrend?.slice(0, 3),
            meds: workspace?.activeMedications?.slice(0, 5),
            alerts: workspace?.activeAlerts,
            diagnosis: workspace?.activeAdmission?.admission_diagnosis,
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

  const hasCriticalAlert = saved.some((a) => a.severity === 'critical');
  autoAdvancePathway(patientId, organizationId, workspace?.activeAdmission?.id || null, { hasCriticalAlert })
    .catch((err) => console.warn('[clinical-coordinator] pathway auto-advance failed:', err.message));

  return { alerts: saved, analyzedAt: new Date().toISOString() };
}

// ── Clinical Agent: automatic admission briefing ─────────────────────────────
// Fires on admission (see adt.service.js) — reads history/allergies/meds/
// diagnoses/recent notes and produces a briefing for the care team without
// anyone having to ask for it, matching the "AI reads the chart before
// anyone else logs in" pattern.

export async function generateAdmissionBriefing(patientId, organizationId, admissionId) {
  const workspace = await getPatientWorkspace(patientId, organizationId).catch(() => null);
  if (!workspace?.patient) return null;

  const priorAdmissions = await sequelize.query(
    `SELECT admission_datetime, discharge_datetime, admission_diagnosis
     FROM ip_admissions
     WHERE patient_id = :patientId AND organization_id = :orgId AND id != :admId AND status = 'discharged'
     ORDER BY admission_datetime DESC LIMIT 5`,
    { replacements: { patientId, orgId: organizationId, admId: admissionId || 0 }, type: QueryTypes.SELECT }
  ).catch(() => []);

  const context = {
    diagnosis: workspace.activeAdmission?.admission_diagnosis,
    allergies: workspace.allergies,
    activeMedications: workspace.activeMedications,
    recentNotes: workspace.recentNotes,
    priorAdmissions,
  };

  let briefing;
  try {
    const llm = await llmProvider.chat({
      messages: [
        {
          role: 'system',
          content: `You are a clinical briefing assistant. A patient has just been admitted. Write a concise briefing (3-5 sentences) for the care team covering: relevant history, allergies, current medications, and anything from prior admissions worth flagging. Do not invent facts not present in the data. This is advisory only — clinicians retain full decision authority.`,
        },
        { role: 'user', content: JSON.stringify(context) },
      ],
      temperature: 0.2,
      maxTokens: 500,
      skipCache: true,
    });
    briefing = (llm.content || '').trim();
  } catch (err) {
    console.warn('[clinical-coordinator] admission briefing LLM failed:', err.message);
    briefing = `Admitted with: ${context.diagnosis || 'diagnosis pending'}. Allergies: ${(context.allergies || []).map((a) => a.allergen).join(', ') || 'none recorded'}. Active meds: ${(context.activeMedications || []).length}. Prior admissions on file: ${priorAdmissions.length}.`;
  }

  await appendClinicalEvent({
    organizationId,
    patientId,
    admissionId,
    eventType: 'ai_briefing',
    title: 'Clinical Agent — Admission Briefing',
    body: briefing,
    actorType: 'ai',
    actorName: 'Clinical Agent',
    severity: 'info',
    metadata: { priorAdmissionCount: priorAdmissions.length },
  }).catch((err) => console.warn('[clinical-coordinator] briefing timeline event failed:', err.message));

  return { briefing, context };
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

export async function acknowledgeCoordinatorAlert(patientId, organizationId, alertId, { action, userId, note } = {}) {
  await ensure();
  const status = action === 'approve' ? 'approved' : action === 'dismiss' ? 'dismissed' : 'acknowledged';
  const { rows } = await pool.query(
    `UPDATE careos_coordinator_alerts
     SET status = $1, acknowledged_at = NOW(), acknowledged_by = $2,
         evidence = evidence || $3::jsonb
     WHERE id = $4 AND patient_id = $5 AND ($6::bigint IS NULL OR organization_id = $6)
     RETURNING *`,
    [
      status,
      userId || null,
      JSON.stringify({ ack_action: action, ack_note: note || null }),
      Number(alertId),
      patientId,
      organizationId || null,
    ]
  );
  if (!rows[0]) return null;

  await appendClinicalEvent({
    organizationId,
    patientId,
    eventType: 'ai_insight_ack',
    title: `AI alert ${status}`,
    body: rows[0].message,
    actorType: 'user',
    actorId: userId,
    severity: 'info',
    metadata: { alertId, action },
  });

  return rows[0];
}

export default { analyzePatient, listCoordinatorAlerts, generateAdmissionBriefing, acknowledgeCoordinatorAlert };
