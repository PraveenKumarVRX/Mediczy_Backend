/**
 * Phase A: AI-assisted radiology report drafting (Level 1).
 * Structured findings → LLM prose. Physician review mandatory.
 */
import pool from '../../db/pgPool.js';
import llmProvider from '../ai-brain/llm-provider.js';
import qualityGates from '../ai-quality-gates.service.js';
import { publishEvent, KAFKA_TOPICS } from '../../config/kafka.js';
import { getTriageForStudy } from './imaging-triage.service.js';
import { listTemplates } from './imaging-report-templates.service.js';
import { applyTemplate } from './imaging-template-macros.js';
import { compareWithPriorStudies } from './imaging-prior-comparison.service.js';
import { extractStructuredFindings } from './imaging-findings-extractor.service.js';
import { recordMetric } from './imaging-observability.service.js';
import { computeDraftConfidence } from './imaging-report-confidence.js';
import { transitionWorkflow, getWorkflowForStudy } from './imaging-workflow.service.js';

const MODEL_VERSION = 'imaging-report-drafter-v1';
const DISCLAIMER = 'AI-generated draft — radiologist review and sign-off required before clinical use.';

export async function generateReportDraft({
  studyId,
  tenantId,
  actorId,
  actorName,
  structuredFindings = null,
  includePriorComparison = true,
}) {
  const studyRes = await pool.query(
    `SELECT * FROM ris_studies WHERE id = $1 AND lab_id = $2`,
    [studyId, tenantId],
  );
  const study = studyRes.rows[0];
  if (!study) throw new Error('Study not found');

  const triage = await getTriageForStudy(study.study_instance_uid, tenantId);
  let findings = structuredFindings;
  if (!findings) {
    findings = await extractStructuredFindings({
      studyInstanceUID: study.study_instance_uid,
      modality: study.modality,
      orthancStudyId: study.orthanc_study_id,
      triageFindings: triage?.findings || [],
    });
  }

  let priorComparison = null;
  let priorNarrative = '';
  if (includePriorComparison) {
    priorComparison = await compareWithPriorStudies({ study, tenantId });
    priorNarrative = priorComparison?.narrative || '';
  }

  const templates = await listTemplates(tenantId, normalizeModality(study.modality));
  const template = templates.find((t) => t.is_default) || templates[0];

  const draftBody = await llmDraftReport({
    study,
    findings,
    priorNarrative,
    templateBody: template?.body,
  });

  const confidence = computeDraftConfidence(findings, triage, priorComparison);

  const gateResult = await qualityGates.checkImagingReport({
    studyId,
    modality: study.modality,
    draftText: draftBody,
    structuredFindings: findings,
    confidence,
    triageStatus: triage?.status,
  });
  await qualityGates.logGateResult(gateResult, {
    source: 'imaging_report_drafter',
    studyId,
    studyInstanceUID: study.study_instance_uid,
    tenantId,
  });

  const r = await pool.query(
    `INSERT INTO imaging_ai_report_drafts
       (study_id, study_instance_uid, tenant_id, draft_text, structured_findings,
        prior_comparison, confidence_score, model_version, gate_result, created_by, created_by_name)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9::jsonb,$10,$11)
     RETURNING *`,
    [
      studyId,
      study.study_instance_uid,
      tenantId,
      draftBody,
      JSON.stringify(findings),
      priorNarrative || null,
      confidence,
      MODEL_VERSION,
      JSON.stringify(gateResult),
      actorId,
      actorName,
    ],
  );

  const wf = await getWorkflowForStudy(studyId);
  if (wf?.id && wf.state === 'assigned') {
    await transitionWorkflow(wf.id, 'drafting', { id: actorId, name: actorName }).catch(() => {});
  }

  await pool.query(
    `UPDATE ris_studies SET report_text = $2, report_status = 'Draft', workflow_state = 'drafting' WHERE id = $1`,
    [studyId, draftBody],
  ).catch(() => {});

  await publishEvent(KAFKA_TOPICS.IMAGING_REPORT_DRAFTED, {
    studyId,
    studyInstanceUID: study.study_instance_uid,
    tenantId,
    draftId: r.rows[0].id,
    confidence,
    gatePassed: gateResult.passed,
  }).catch(() => {});

  await recordMetric('imaging_report_draft_generated', 1, { modality: study.modality, tenantId });

  return {
    draft: r.rows[0],
    disclaimer: DISCLAIMER,
    gateResult,
    findings,
    priorComparison,
  };
}

async function llmDraftReport({ study, findings, priorNarrative, templateBody }) {
  const systemPrompt = `You are a radiology report drafting assistant. Generate a structured radiology report with FINDINGS and IMPRESSION sections.
Rules:
- Use only the structured findings provided — do not invent pathology.
- If prior comparison is provided, include relevant interval change in findings.
- Be concise, professional, and use standard radiology language.
- This is a DRAFT for radiologist review — not a final diagnosis.
- Do NOT include patient-identifying information beyond what is given.`;

  const userPrompt = `Modality: ${study.modality}
Body part: ${study.body_part || 'not specified'}
Study description: ${study.study_description || 'not specified'}
Patient: ${study.patient_name}

Structured findings JSON:
${JSON.stringify(findings, null, 2)}

${priorNarrative ? `Prior study comparison:\n${priorNarrative}\n` : ''}
${templateBody ? `Use this template structure as guide:\n${templateBody}` : ''}

Generate the draft report text with FINDINGS and IMPRESSION sections.`;

  const resp = await llmProvider.chat({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    maxTokens: 1200,
    temperature: 0.15,
  });

  return (resp.content || '').trim() || applyTemplate(templateBody || 'FINDINGS:\n{{findings}}\n\nIMPRESSION:\n{{impression}}', {
    technique: `${study.modality} — standard protocol`,
    findings: formatFindingsAsText(findings),
    impression: 'Pending radiologist review.',
  });
}

function formatFindingsAsText(findings) {
  if (!findings) return 'See structured findings.';
  if (Array.isArray(findings.items)) {
    return findings.items.map((f) => `- ${f.label || f.name}: ${f.note || f.description || ''}`).join('\n');
  }
  if (Array.isArray(findings)) {
    return findings.map((f) => `- ${f.label}: ${f.note || ''}`).join('\n');
  }
  return JSON.stringify(findings);
}

function normalizeModality(m) {
  const u = (m || 'OT').toUpperCase();
  if (u === 'X-RAY') return 'XR';
  return u;
}

export async function getLatestDraft(studyId, tenantId) {
  const r = await pool.query(
    `SELECT * FROM imaging_ai_report_drafts WHERE study_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1`,
    [studyId, tenantId],
  );
  return r.rows[0] || null;
}

export async function approveDraft(draftId, reviewerId, editedText = null) {
  const r = await pool.query(
    `UPDATE imaging_ai_report_drafts
     SET status = 'approved', reviewed_by = $2, reviewed_at = NOW(),
         draft_text = COALESCE($3, draft_text)
     WHERE id = $1 RETURNING *`,
    [draftId, reviewerId, editedText],
  );
  return r.rows[0];
}
