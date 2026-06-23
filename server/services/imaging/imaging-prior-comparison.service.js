/**
 * Phase B: Prior study comparison — narrative interval change.
 */
import pool from '../../db/pgPool.js';
import llmProvider from '../ai-brain/llm-provider.js';

export async function findPriorStudies(study, tenantId, limit = 5) {
  const r = await pool.query(
    `SELECT id, study_instance_uid, patient_name, modality, body_part, study_date,
            report_text, study_description, created_at
     FROM ris_studies
     WHERE lab_id = $1
       AND patient_name ILIKE $2
       AND modality = $3
       AND id != $4
       AND study_date <= $5
     ORDER BY study_date DESC NULLS LAST, created_at DESC
     LIMIT $6`,
    [
      tenantId,
      study.patient_name?.trim() || '%',
      study.modality,
      study.id,
      study.study_date || new Date().toISOString().slice(0, 10),
      limit,
    ],
  );
  return r.rows;
}

export async function compareWithPriorStudies({ study, tenantId }) {
  const priors = await findPriorStudies(study, tenantId, 3);
  if (!priors.length) {
    return { priorStudy: null, narrative: '', structuredDiff: { hasPrior: false } };
  }

  const prior = priors[0];
  const narrative = await generateComparisonNarrative(study, prior, priors);

  const structuredDiff = {
    hasPrior: true,
    priorStudyId: prior.id,
    priorStudyInstanceUID: prior.study_instance_uid,
    priorStudyDate: prior.study_date,
    currentStudyDate: study.study_date,
    priorCount: priors.length,
  };

  await pool.query(
    `INSERT INTO imaging_prior_comparisons
       (study_id, prior_study_id, prior_study_instance_uid, tenant_id, comparison_narrative, structured_diff)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
    [study.id, prior.id, prior.study_instance_uid, tenantId, narrative, JSON.stringify(structuredDiff)],
  ).catch(() => {});

  return { priorStudy: prior, priors, narrative, structuredDiff };
}

async function generateComparisonNarrative(current, prior, allPriors) {
  const resp = await llmProvider.chat({
    messages: [
      {
        role: 'system',
        content: 'You compare radiology studies for interval change. Be factual. Only note changes supported by report text. Flag if insufficient data. NOT a diagnosis.',
      },
      {
        role: 'user',
        content: `Current study (${current.study_date}, ${current.modality}):
${current.report_text || current.study_description || 'No report yet'}

Prior study (${prior.study_date}, ${prior.modality}):
${prior.report_text || prior.study_description || 'No prior report'}

${allPriors.length > 1 ? `(${allPriors.length - 1} additional prior studies on file)` : ''}

Summarize interval change in 2-4 bullet points for the radiologist draft report.`,
      },
    ],
    maxTokens: 500,
    temperature: 0.1,
  });
  return (resp.content || '').trim();
}

export async function getLongitudinalTimeline(patientName, tenantId, limit = 20) {
  const r = await pool.query(
    `SELECT id, study_instance_uid, modality, body_part, study_date, report_status,
            report_text, study_description, priority, status, created_at
     FROM ris_studies
     WHERE lab_id = $1 AND patient_name ILIKE $2
     ORDER BY study_date DESC NULLS LAST, created_at DESC
     LIMIT $3`,
    [tenantId, patientName?.trim() || '%', limit],
  );
  return r.rows;
}
