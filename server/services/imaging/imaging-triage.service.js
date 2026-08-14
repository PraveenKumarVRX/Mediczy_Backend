/**
 * Phase 3: AI triage — calls imaging-triage Python microservice (MONAI-ready).
 * SaMD: triage informs workflow; physician must review before clinical action.
 */
import pool from '../../db/pgPool.js';
import fetch from 'node-fetch';
import { publishEvent, KAFKA_TOPICS } from '../../config/kafka.js';
import { recordMetric } from './imaging-observability.service.js';

const TRIAGE_URL = process.env.IMAGING_TRIAGE_URL || 'http://127.0.0.1:8010';
const TRIAGE_TIMEOUT_MS = parseInt(process.env.IMAGING_TRIAGE_TIMEOUT_MS || '30000', 10);
const TRIAGE_EVENT_TIMEOUT_MS = parseInt(process.env.IMAGING_TRIAGE_EVENT_TIMEOUT_MS || '500', 10);

const TRIAGE_UNAVAILABLE_MAX_CONFIDENCE = 0.05;
const TRIAGE_UNAVAILABLE_FINDING = {
  label: 'Image AI unavailable',
  severity: 'warning',
  note: 'The imaging AI service did not return a result in time. Pixel data was not analyzed. Physician review required.',
};

async function postTriageToInference(payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRIAGE_TIMEOUT_MS);
  try {
    return await fetch(`${TRIAGE_URL}/triage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function publishTriageEvent(topic, payload) {
  let timer;
  try {
    await Promise.race([
      publishEvent(topic, payload),
      new Promise((resolve) => {
        timer = setTimeout(resolve, TRIAGE_EVENT_TIMEOUT_MS);
      }),
    ]);
  } catch {
    // Event delivery is advisory for this request path; don't block the doctor UI.
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function requestTriage({ studyId, studyInstanceUID, tenantId, modality, orthancStudyId }) {
  await pool.query(
    `INSERT INTO imaging_ai_triage (study_id, study_instance_uid, tenant_id, modality, status)
     VALUES ($1,$2,$3,$4,'pending')
     ON CONFLICT (study_instance_uid, tenant_id) DO UPDATE SET status = 'pending', created_at = NOW()`,
    [studyId, studyInstanceUID, tenantId, modality],
  ).catch(() => {});

  const start = Date.now();
  let findings = [];
  let confidence = 0;
  let modelVersion = 'imaging-triage-v1';
  let inferenceBackend = 'heuristic';
  let featureAttributions = [];

  try {
    const res = await postTriageToInference({
      study_instance_uid: studyInstanceUID,
      modality,
      orthanc_study_id: orthancStudyId,
    });
    if (res.ok) {
      const body = await res.json();
      findings = body.findings || [];
      confidence = body.confidence_score ?? body.confidence ?? 0;
      modelVersion = body.model_version || modelVersion;
      inferenceBackend = body.inference_backend || inferenceBackend;
      featureAttributions = body.feature_attributions || [];
      if (body.preprocessing) {
        featureAttributions.push({
          feature: 'dicom_preprocessing',
          direction: 'metadata',
          attribution: 1,
          details: body.preprocessing,
        });
      }
    } else {
      findings = [{ ...TRIAGE_UNAVAILABLE_FINDING, note: `${TRIAGE_UNAVAILABLE_FINDING.note} Inference status: ${res.status}.` }];
      confidence = TRIAGE_UNAVAILABLE_MAX_CONFIDENCE;
      modelVersion = 'imaging-triage-unavailable-v1';
      inferenceBackend = 'unavailable';
    }
  } catch (err) {
    findings = [{ ...TRIAGE_UNAVAILABLE_FINDING, note: `${TRIAGE_UNAVAILABLE_FINDING.note} ${err?.name === 'AbortError' ? 'Inference timed out.' : 'Inference request failed.'}` }];
    confidence = TRIAGE_UNAVAILABLE_MAX_CONFIDENCE;
    modelVersion = 'imaging-triage-unavailable-v1';
    inferenceBackend = 'unavailable';
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
  await publishTriageEvent(KAFKA_TOPICS.IMAGING_AI_TRIAGE_COMPLETE, {
    studyId, studyInstanceUID, findings, confidence, modelVersion, inferenceBackend,
  });

  const { evaluateCriticalFindings } = await import('./imaging-critical-alerts.service.js');
  await evaluateCriticalFindings({
    studyId, studyInstanceUID, tenantId, findings,
  }).catch(() => {});

  return r.rows[0];
}

export async function getTriageModelStatus() {
  try {
    const res = await fetch(`${TRIAGE_URL}/models/status`, { timeout: 10000 });
    if (!res.ok) {
      return {
        available: false,
        status: res.status,
        message: `imaging-triage model status failed (${res.status})`,
      };
    }
    return {
      available: true,
      status: res.status,
      models: await res.json(),
    };
  } catch (err) {
    return {
      available: false,
      status: 0,
      message: err.message || 'imaging-triage service unavailable',
    };
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
