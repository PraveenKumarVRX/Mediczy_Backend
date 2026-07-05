/**
 * Hospital OS — AI nurse shift handover (SBAR brief)
 */
import pool from '../../db/pgPool.js';
import { getPatientWorkspace } from '../clinical-workspace.service.js';
import llmProvider from '../ai-brain/llm-provider.js';

export async function generateShiftHandover({ wardId, organizationId, shift = 'day' }) {
  let patients = [];
  try {
    const { rows } = await pool.query(
      `SELECT a.patient_id, a.id AS admission_id, b.ward_name, b.bed_number
       FROM ip_admissions a
       LEFT JOIN beds b ON b.id = a.bed_id
       WHERE a.organization_id = $1 AND a.status = 'active'
         ${wardId ? 'AND b.ward_id = $2' : ''}
       ORDER BY a.admitted_at DESC LIMIT 25`,
      wardId ? [organizationId, wardId] : [organizationId]
    );
    patients = rows;
  } catch {
    patients = [];
  }

  const briefs = [];
  for (const p of patients.slice(0, 12)) {
    try {
      const ws = await getPatientWorkspace(p.patient_id, organizationId);
      briefs.push({
        patientId: p.patient_id,
        bed: `${p.ward_name || 'Ward'}/${p.bed_number || '—'}`,
        name: ws?.patient?.name || `Patient ${p.patient_id}`,
        alerts: (ws?.alerts || []).slice(0, 3),
        vitals: ws?.vitals?.[0] || null,
        medsDue: (ws?.medications || []).length,
        pendingOrders: (ws?.pendingOrders || []).length,
      });
    } catch {
      briefs.push({ patientId: p.patient_id, bed: p.bed_number, error: 'workspace_unavailable' });
    }
  }

  const highRisk = briefs.filter((b) => (b.alerts || []).some((a) => a.severity === 'red' || a.severity === 'orange'));

  const llm = await llmProvider.chat({
    messages: [
      {
        role: 'system',
        content: `Generate a nursing shift handover in SBAR format. Be concise. Highlight deterioration risks and overdue tasks.
Output JSON: { "sbar": { "situation", "background", "assessment", "recommendation" }, "priorityPatients": [], "tasks": [] }`,
      },
      {
        role: 'user',
        content: `Shift: ${shift}\nWard: ${wardId || 'all'}\nPatients:\n${JSON.stringify(briefs, null, 2)}`,
      },
    ],
    temperature: 0.2,
    maxTokens: 1500,
    responseFormat: { type: 'json_object' },
    skipCache: true,
  });

  let structured;
  try {
    structured = JSON.parse(llm.content || '{}');
  } catch {
    structured = { sbar: { situation: llm.content }, priorityPatients: highRisk.map((p) => p.patientId) };
  }

  return {
    shift,
    wardId,
    patientCount: briefs.length,
    highRiskCount: highRisk.length,
    patients: briefs,
    handover: structured,
    generatedAt: new Date().toISOString(),
    provider: llm.provider,
  };
}

export default { generateShiftHandover };
