/**
 * CareOS — Family collaboration portal (clinician-approved updates only)
 */
import pool from '../../db/pgPool.js';
import { up as migrate } from '../../migrations/careos-phase1.migration.js';
import { appendClinicalEvent } from './clinical-timeline.service.js';
import { getPathway } from './treatment-pathway.service.js';
import { getPatientWorkspace } from '../clinical-workspace.service.js';
import llmProvider from '../ai-brain/llm-provider.js';

let ready = false;
async function ensure() { if (!ready) { await migrate(); ready = true; } }

export async function listFamilyUpdates(patientId, { familyVisibleOnly = true } = {}) {
  await ensure();
  let sql = `SELECT * FROM careos_family_updates WHERE patient_id = $1`;
  if (familyVisibleOnly) sql += ` AND visible_to_family = true AND published_at IS NOT NULL`;
  sql += ` ORDER BY published_at DESC NULLS LAST, created_at DESC LIMIT 50`;
  const { rows } = await pool.query(sql, [patientId]);
  return rows;
}

export async function publishFamilyUpdate({
  organizationId,
  patientId,
  title,
  body,
  stage,
  approvedBy,
  visibleToFamily = true,
}) {
  await ensure();
  const { rows } = await pool.query(
    `INSERT INTO careos_family_updates (organization_id, patient_id, title, body, stage, approved_by, visible_to_family, published_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) RETURNING *`,
    [organizationId, patientId, title, body, stage || null, approvedBy, visibleToFamily]
  );
  if (visibleToFamily) {
    await appendClinicalEvent({
      organizationId,
      patientId,
      eventType: 'family_update',
      title,
      body,
      actorType: 'clinician',
      actorId: approvedBy,
      severity: 'info',
    });
  }
  return rows[0];
}

/**
 * Family Agent: drafts a family update in plain language from the patient's
 * actual current status (workspace + treatment pathway) — the doctor/nurse
 * reviews and calls publishFamilyUpdate() with the (possibly edited) text,
 * instead of writing one from scratch every time. Same "documentation with
 * mandatory review" pattern as the discharge/referral/ICU-note drafters —
 * not SaMD per CLAUDE.md's classification table.
 */
export async function generateFamilyUpdateDraft(patientId, organizationId) {
  const [workspace, pathway] = await Promise.all([
    getPatientWorkspace(patientId, organizationId).catch(() => null),
    getPathway(patientId, organizationId).catch(() => null),
  ]);

  const fallback = {
    title: 'Update on your family member\'s care',
    body: `Currently focused on: ${pathway?.current_goal || 'ongoing treatment'}. The care team will share more details soon.`,
  };
  if (!workspace?.patient) return { ...fallback, aiGenerated: false, model: null };

  const context = {
    currentGoal: pathway?.current_goal,
    progress: pathway?.current_progress,
    diagnosis: workspace.activeAdmission?.admission_diagnosis,
    activeMedications: (workspace.activeMedications || []).map((m) => m.drug_name),
    recentActivity: workspace.recentNotes?.slice(0, 3),
  };

  try {
    const llm = await llmProvider.chat({
      messages: [
        {
          role: 'system',
          content: `You are drafting a family update for a hospital patient portal — plain, simple, non-technical language, no medical jargon, warm but factual tone. Cover today's progress and the current treatment goal. Do NOT invent facts not present in the data, and do not speculate about prognosis. Output JSON: {"title": "", "body": ""}`,
        },
        { role: 'user', content: JSON.stringify(context) },
      ],
      temperature: 0.3,
      maxTokens: 400,
      responseFormat: { type: 'json_object' },
      skipCache: true,
    });
    const parsed = JSON.parse(llm.content || '{}');
    if (!parsed.body) throw new Error('empty LLM response');
    return { title: parsed.title || fallback.title, body: parsed.body, aiGenerated: true, model: llm.model || llm.provider || 'llm' };
  } catch (err) {
    console.warn('[family-portal] update draft LLM failed, falling back to template:', err.message);
    return { ...fallback, aiGenerated: false, model: null };
  }
}

export default { listFamilyUpdates, publishFamilyUpdate, generateFamilyUpdateDraft };
