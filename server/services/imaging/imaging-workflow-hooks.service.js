/**
 * Workflow transitions tied to report lifecycle events.
 */
import pool from '../../db/pgPool.js';
import { transitionWorkflow, getWorkflowForStudy } from './imaging-workflow.service.js';
import { approveDraft, getLatestDraft } from './imaging-report-drafter.service.js';
import { indexStudyDocument } from './imaging-search.service.js';
import { recordLongitudinalEvent } from './imaging-longitudinal.service.js';

export async function onReportDraftSaved({ studyId, tenantId, actorId, actorName, reportText }) {
  const wf = await getWorkflowForStudy(studyId);
  if (!wf) return null;

  if (wf.state === 'assigned') {
    await transitionWorkflow(wf.id, 'drafting', { id: actorId, name: actorName }).catch(() => {});
  }

  const draft = await getLatestDraft(studyId, tenantId);
  if (draft?.id && draft.status === 'draft') {
    await approveDraft(draft.id, actorId, reportText).catch(() => {});
  }

  await pool.query(
    `UPDATE ris_studies SET workflow_state = 'drafting' WHERE id = $1`,
    [studyId],
  ).catch(() => {});

  return wf;
}

export async function onReportFinalized({ study, tenantId, actorId, actorName }) {
  const actor = { id: actorId, name: actorName };
  let wf = await getWorkflowForStudy(study.id);

  // A report can reach Final directly (skipping an intermediate Draft save),
  // in which case onReportDraftSaved (the only other caller of approveDraft)
  // never runs — leaving imaging_ai_report_drafts.status stuck at 'draft'
  // even though the report is genuinely signed off. Close that gap here too.
  const draft = await getLatestDraft(study.id, tenantId);
  if (draft?.id && draft.status === 'draft') {
    await approveDraft(draft.id, actorId, study.report_text).catch(() => {});
  }

  if (wf) {
    if (wf.state === 'assigned') {
      await transitionWorkflow(wf.id, 'drafting', actor).catch(() => {});
      wf = await getWorkflowForStudy(study.id);
    }
    if (wf?.state === 'drafting') {
      await transitionWorkflow(wf.id, 'review', actor).catch(() => {});
      wf = await getWorkflowForStudy(study.id);
    }
    if (wf?.state === 'review') {
      await transitionWorkflow(wf.id, 'signed', actor).catch(() => {});
    }
  }

  await pool.query(`UPDATE ris_studies SET workflow_state = 'signed' WHERE id = $1`, [study.id]).catch(() => {});

  await indexStudyDocument({
    tenantId,
    studyInstanceUID: study.study_instance_uid,
    patientName: study.patient_name,
    modality: study.modality,
    studyDate: study.study_date,
    reportText: study.report_text,
    impression: study.report_text,
    findings: study.report_text,
  }).catch(() => {});

  await recordLongitudinalEvent({
    tenantId,
    patientKey: study.patient_name,
    studyInstanceUID: study.study_instance_uid,
    eventType: 'report_finalized',
    summary: `${study.modality} report finalized for ${study.patient_name}`,
    metadata: { studyId: study.id, modality: study.modality },
  }).catch(() => {});

  return wf;
}
