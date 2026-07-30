/**
 * Phase 3: AI triage — calls imaging-triage Python microservice (MONAI-ready).
 * SaMD: triage informs workflow; physician must review before clinical action.
 */
import pool from '../../db/pgPool.js';
import fetch from 'node-fetch';
import { publishEvent, KAFKA_TOPICS } from '../../config/kafka.js';
import llmProvider from '../ai-brain/llm-provider.js';
import { recordMetric } from './imaging-observability.service.js';

const TRIAGE_URL = process.env.IMAGING_TRIAGE_URL || 'http://127.0.0.1:8010';

/** Text-only LLM path never saw pixels — must not look like a real CV read. */
const LLM_FALLBACK_MAX_CONFIDENCE = 0.2;
const LLM_FALLBACK_DISCLAIMER = {
  label: 'No image analysis performed',
  severity: 'info',
  note: 'Text-only LLM fallback — pixel data was not analyzed. Physician review required before any clinical action.',
};

function withLlmFallbackDisclaimer(findings) {
  const list = Array.isArray(findings) ? findings.filter(Boolean) : [];
  return [LLM_FALLBACK_DISCLAIMER, ...list];
}

export async function requestTriage({ studyId, studyInstanceUID, tenantId, modality, orthancStudyId }) {
  await pool.query(
    `INSERT INTO imaging_ai_triage (study_id, study_instance_uid, tenant_id, modality, status)
     VALUES ($1,$2,$3,$4,'pending')
     ON CONFLICT (study_instance_uid, tenant_id) DO UPDATE SET status = 'pending', created_at = NOW()`,
    [studyId, studyInstanceUID, tenantId, modality],
  ).catch(() => {});

  await publishEvent(KAFKA_TOPICS.IMAGING_AI_TRIAGE_REQUESTED, {
    studyId, studyInstanceUID, tenantId, modality,
  }).catch(() => {});

  const start = Date.now();
  let findings = [];
  let confidence = 0;
  let modelVersion = 'imaging-triage-v1';
  let inferenceBackend = 'heuristic';
  let featureAttributions = [];

  try {
    const res = await fetch(`${TRIAGE_URL}/triage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ study_instance_uid: studyInstanceUID, modality, orthanc_study_id: orthancStudyId }),
      timeout: 120000,
    });
    if (res.ok) {
      const body = await res.json();
      findings = body.findings || [];
      confidence = body.confidence_score ?? body.confidence ?? 0;
      modelVersion = body.model_version || modelVersion;
      inferenceBackend = body.inference_backend || inferenceBackend;
      featureAttributions = body.feature_attributions || [];
    } else {
      findings = withLlmFallbackDisclaimer(await llmTriageFallback(modality, studyInstanceUID));
      confidence = LLM_FALLBACK_MAX_CONFIDENCE;
      modelVersion = 'llm-fallback-v1';
      inferenceBackend = 'llm-fallback';
    }
  } catch {
    findings = withLlmFallbackDisclaimer(await llmTriageFallback(modality, studyInstanceUID));
    confidence = LLM_FALLBACK_MAX_CONFIDENCE;
    modelVersion = 'llm-fallback-v1';
    inferenceBackend = 'llm-fallback';
  }

  const r = await pool.query(
    `INSERT INTO imaging_ai_triage
       (study_id, study_instance_uid, tenant_id, modality, findings, confidence_score,
        model_version, inference_backend, feature_attributions, status)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9::jsonb,'complete')
     ON CONFLICT (study_instance_uid, tenant_id)
     DO UPDATE SET
       study_id = EXCLUDED.study_id,
       findings = EXCLUDED.findings,
       confidence_score = EXCLUDED.confidence_score,
       model_version = EXCLUDED.model_version,
       inference_backend = EXCLUDED.inference_backend,
       feature_attributions = EXCLUDED.feature_attributions,
       status = 'complete',
       created_at = NOW()
     RETURNING *`,
    [
      studyId, studyInstanceUID, tenantId, modality,
      JSON.stringify(findings), confidence, modelVersion,
      inferenceBackend, JSON.stringify(featureAttributions),
    ],
  );

  await pool.query(`UPDATE ris_studies SET ai_triage_status = 'complete' WHERE id = $1`, [studyId]).catch(() => {});
  await recordMetric('imaging_ai_triage_latency_ms', Date.now() - start, {
    modality,
    inference_backend: inferenceBackend,
  });
  await publishEvent(KAFKA_TOPICS.IMAGING_AI_TRIAGE_COMPLETE, {
    studyId, studyInstanceUID, findings, confidence, modelVersion, inferenceBackend,
  }).catch(() => {});

  const { evaluateCriticalFindings } = await import('./imaging-critical-alerts.service.js');
  await evaluateCriticalFindings({
    studyId, studyInstanceUID, tenantId, findings,
  }).catch(() => {});

  return r.rows[0];
}

async function llmTriageFallback(modality, studyInstanceUID) {
  const resp = await llmProvider.chat({
    messages: [
      {
        role: 'system',
        content: 'You are an imaging triage assistant. Return JSON array of {label, severity, note}. NOT a diagnosis — flag for radiologist review only.',
      },
      { role: 'user', content: `Screening triage for ${modality} study ${studyInstanceUID}. List 0-3 items to review.` },
    ],
    maxTokens: 400,
    temperature: 0.1,
  });
  try {
    const match = (resp.content || '').match(/\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) : [{ label: 'Review required', severity: 'low', note: resp.content?.slice(0, 200) }];
  } catch {
    return [{ label: 'Manual review', severity: 'low', note: 'AI triage unavailable' }];
  }
}

export async function getTriageForStudy(studyInstanceUID, tenantId) {
  const r = await pool.query(
    `SELECT * FROM imaging_ai_triage WHERE study_instance_uid = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1`,
    [studyInstanceUID, tenantId],
  );
  return r.rows[0] || null;
}

export async function reviewTriage(triageId, reviewerId, approved = true) {
  const r = await pool.query(
    `UPDATE imaging_ai_triage SET status = $2, reviewed_by = $3, reviewed_at = NOW() WHERE id = $1 RETURNING *`,
    [triageId, approved ? 'reviewed' : 'rejected', reviewerId],
  );
  return r.rows[0];
}
