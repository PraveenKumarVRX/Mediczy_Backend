/**
 * Phase D: Longitudinal timeline + analytics events.
 */
import pool from '../../db/pgPool.js';
import llmProvider from '../ai-brain/llm-provider.js';
import { getLongitudinalTimeline } from './imaging-prior-comparison.service.js';
import { getLesionTimeline } from './imaging-measurements.service.js';

export async function recordLongitudinalEvent({
  tenantId, patientKey, studyInstanceUID, eventType, summary, metadata = {},
}) {
  const r = await pool.query(
    `INSERT INTO imaging_longitudinal_events
       (tenant_id, patient_key, study_instance_uid, event_type, summary, metadata)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING *`,
    [tenantId, patientKey, studyInstanceUID, eventType, summary, JSON.stringify(metadata)],
  );
  return r.rows[0];
}

export async function getPatientTimeline(patientName, tenantId) {
  const studies = await getLongitudinalTimeline(patientName, tenantId, 30);
  const eventsRes = await pool.query(
    `SELECT * FROM imaging_longitudinal_events
     WHERE tenant_id = $1 AND patient_key ILIKE $2
     ORDER BY created_at DESC LIMIT 50`,
    [tenantId, patientName?.trim() || '%'],
  );
  return { studies, events: eventsRes.rows };
}

export async function generateLongitudinalSummary(patientName, tenantId) {
  const { studies, events } = await getPatientTimeline(patientName, tenantId);
  if (!studies.length) return { summary: 'No prior studies found.', studies: [], events: [] };

  const resp = await llmProvider.chat({
    messages: [
      {
        role: 'system',
        content: 'Summarize imaging history for a radiologist. Note progression patterns. Advisory only.',
      },
      {
        role: 'user',
        content: `Patient imaging timeline:\n${studies.map((s) =>
          `${s.study_date} ${s.modality} ${s.body_part || ''}: ${(s.report_text || s.study_description || 'no report').slice(0, 200)}`,
        ).join('\n')}\n\nEvents:\n${events.map((e) => e.summary).join('\n')}`,
      },
    ],
    maxTokens: 600,
    temperature: 0.1,
  });

  const summary = (resp.content || '').trim();
  await recordLongitudinalEvent({
    tenantId,
    patientKey: patientName,
    eventType: 'ai_summary',
    summary,
    metadata: { studyCount: studies.length },
  });

  return { summary, studies, events };
}

export async function getImagingAnalytics(tenantId, { days = 30 } = {}) {
  const r = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE true) AS total_studies,
       COUNT(*) FILTER (WHERE report_status = 'Final') AS finalized_reports,
       COUNT(*) FILTER (WHERE priority = 'STAT') AS stat_studies,
       COUNT(*) FILTER (WHERE ai_triage_status = 'complete') AS triaged_studies
     FROM ris_studies
     WHERE lab_id = $1 AND created_at >= NOW() - ($2::text || ' days')::interval`,
    [tenantId, String(days)],
  );

  const drafts = await pool.query(
    `SELECT COUNT(*)::int AS draft_count FROM imaging_ai_report_drafts WHERE tenant_id = $1 AND created_at >= NOW() - ($2::text || ' days')::interval`,
    [tenantId, String(days)],
  );

  const alerts = await pool.query(
    `SELECT COUNT(*)::int AS open_alerts FROM imaging_critical_alerts WHERE tenant_id = $1 AND status = 'open'`,
    [tenantId],
  );

  const lesions = await pool.query(
    `SELECT COUNT(DISTINCT lesion_id)::int AS tracked_lesions FROM imaging_lesion_tracking WHERE tenant_id = $1`,
    [tenantId],
  );

  return {
    periodDays: days,
    ...r.rows[0],
    aiDrafts: drafts.rows[0]?.draft_count || 0,
    openCriticalAlerts: alerts.rows[0]?.open_alerts || 0,
    trackedLesions: lesions.rows[0]?.tracked_lesions || 0,
  };
}

export async function getLesionAnalytics(tenantId, patientKey) {
  const lesions = await getLesionTimeline(tenantId, patientKey);
  const grouped = {};
  for (const row of lesions) {
    if (!grouped[row.lesion_id]) grouped[row.lesion_id] = [];
    grouped[row.lesion_id].push(row);
  }
  return Object.entries(grouped).map(([lesionId, points]) => ({
    lesionId,
    points,
    latestSize: points[points.length - 1]?.size_mm,
    growth: points.length >= 2
      ? Number(points[points.length - 1].size_mm) - Number(points[0].size_mm)
      : null,
  }));
}
