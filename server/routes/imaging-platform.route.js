/**
 * Imaging platform API — Phases 1–4 + AI reporting A–D
 * Mounted at /api/imaging/platform
 */
import express from 'express';
import multer from 'multer';
import os from 'os';
import fs from 'fs';
import { authImaging, getTenantId } from '../middleware/imaging-auth.middleware.js';
import {
  transitionWorkflow, assignRadiologist, getWorkflowForStudy, listWorkflowQueue,
} from '../services/imaging/imaging-workflow.service.js';
import {
  syncWorklistToHypergrid, createWorklistFromOrder, linkStudyToWorklist,
} from '../services/imaging/imaging-mwl.service.js';
import {
  listTemplates, createTemplate, applyTemplate,
} from '../services/imaging/imaging-report-templates.service.js';
import { searchImaging, indexStudyDocument } from '../services/imaging/imaging-search.service.js';
import {
  requestTriage, getTriageForStudy, reviewTriage,
} from '../services/imaging/imaging-triage.service.js';
import {
  createSession, addAnnotation, listAnnotations, registerCollabSSE, getCollabStats,
} from '../services/imaging/imaging-collaboration.service.js';
import {
  getPrometheusMetrics, getRecentMetrics,
} from '../services/imaging/imaging-observability.service.js';
import {
  listVnaByTenant, transitionToColdArchive, registerVnaObject,
} from '../services/imaging/imaging-vna.service.js';
import { getStudyPlatformSummary } from '../services/imaging/imaging-ingest.service.js';
import { generateReportDraft, getLatestDraft, approveDraft } from '../services/imaging/imaging-report-drafter.service.js';
import { assertStudyAccess } from '../services/imaging/imaging-study-access.service.js';
import { getInterpretationForStudy } from '../services/imaging/imaging-interpretability.service.js';
import { runVnaLifecycleJob } from '../services/imaging/imaging-vna.service.js';
import { compareWithPriorStudies } from '../services/imaging/imaging-prior-comparison.service.js';
import {
  listOpenCriticalAlerts, acknowledgeCriticalAlert,
} from '../services/imaging/imaging-critical-alerts.service.js';
import {
  saveMeasurement, listMeasurements, getLesionTimeline, syncFromCollabAnnotation,
} from '../services/imaging/imaging-measurements.service.js';
import {
  getPatientTimeline, generateLongitudinalSummary, getImagingAnalytics, getLesionAnalytics,
} from '../services/imaging/imaging-longitudinal.service.js';
import llmProvider from '../services/ai-brain/llm-provider.js';
import { publishEvent, KAFKA_TOPICS } from '../config/kafka.js';
import pool from '../db/pgPool.js';

const router = express.Router();
const audioUpload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

registerCollabSSE(router, authImaging);

// ─── Workflow ────────────────────────────────────────────────────────────────
router.get('/workflow/queue', authImaging, async (req, res) => {
  const tenantId = getTenantId(req);
  const state = req.query.state || 'assigned';
  const rows = await listWorkflowQueue(tenantId, state, parseInt(req.query.limit || '50', 10));
  return res.json({ success: true, queue: rows });
});

router.get('/workflow/study/:studyId', authImaging, async (req, res) => {
  const wf = await getWorkflowForStudy(parseInt(req.params.studyId, 10));
  const summary = await getStudyPlatformSummary(parseInt(req.params.studyId, 10));
  return res.json({ success: true, workflow: wf, ...summary });
});

router.post('/workflow/:instanceId/transition', authImaging, async (req, res) => {
  const { toState } = req.body || {};
  if (!toState) return res.status(400).json({ success: false, message: 'toState required' });
  const actor = { id: req.user?.id, name: req.user?.name || req.user?.role };
  const row = await transitionWorkflow(parseInt(req.params.instanceId, 10), toState, actor);
  return res.json({ success: true, workflow: row });
});

router.post('/workflow/:instanceId/assign', authImaging, async (req, res) => {
  const { radiologistId, radiologistName } = req.body || {};
  const row = await assignRadiologist(
    parseInt(req.params.instanceId, 10),
    radiologistId || req.user?.id,
    radiologistName || req.user?.name,
  );
  return res.json({ success: true, workflow: row });
});

// ─── Modality worklist ───────────────────────────────────────────────────────
router.get('/mwl', authImaging, async (req, res) => {
  const rows = await syncWorklistToHypergrid(getTenantId(req));
  return res.json({ success: true, worklist: rows });
});

router.post('/mwl', authImaging, async (req, res) => {
  const row = await createWorklistFromOrder({ tenantId: getTenantId(req), ...req.body });
  return res.status(201).json({ success: true, item: row });
});

router.post('/mwl/:id/link', authImaging, async (req, res) => {
  const { studyInstanceUID, studyId } = req.body || {};
  await linkStudyToWorklist(parseInt(req.params.id, 10), studyInstanceUID, studyId);
  return res.json({ success: true });
});

// ─── Report templates ────────────────────────────────────────────────────────
router.get('/templates', authImaging, async (req, res) => {
  const rows = await listTemplates(getTenantId(req), req.query.modality || null);
  return res.json({ success: true, templates: rows });
});

router.post('/templates', authImaging, async (req, res) => {
  const row = await createTemplate(getTenantId(req), {
    ...req.body,
    createdBy: req.user?.id,
  });
  return res.status(201).json({ success: true, template: row });
});

router.post('/templates/apply', authImaging, async (req, res) => {
  const { body, values } = req.body || {};
  if (!body) return res.status(400).json({ success: false, message: 'body required' });
  return res.json({ success: true, report: applyTemplate(body, values || {}) });
});

// ─── Search ──────────────────────────────────────────────────────────────────
router.get('/search', authImaging, async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ success: false, message: 'q required' });
  const results = await searchImaging(getTenantId(req), q, { limit: parseInt(req.query.limit || '20', 10) });
  return res.json({ success: true, results });
});

router.post('/search/reindex/:studyId', authImaging, async (req, res) => {
  const r = await pool.query(
    `SELECT * FROM ris_studies WHERE id = $1 AND lab_id = $2`,
    [parseInt(req.params.studyId, 10), getTenantId(req)],
  );
  const study = r.rows[0];
  if (!study) return res.status(404).json({ success: false, message: 'Study not found' });
  const result = await indexStudyDocument({
    tenantId: getTenantId(req),
    studyInstanceUID: study.study_instance_uid,
    patientName: study.patient_name,
    modality: study.modality,
    studyDate: study.study_date,
    reportText: study.report_text,
    findings: study.report_text,
  });
  return res.json({ success: true, ...result });
});

// ─── AI triage (SaMD — physician review required) ────────────────────────────
router.get('/triage/:studyInstanceUID', authImaging, async (req, res) => {
  const row = await getTriageForStudy(req.params.studyInstanceUID, getTenantId(req));
  return res.json({ success: true, triage: row });
});

router.post('/triage/:studyId/request', authImaging, async (req, res) => {
  const r = await pool.query(
    `SELECT id, study_instance_uid, modality, orthanc_study_id FROM ris_studies WHERE id = $1 AND lab_id = $2`,
    [parseInt(req.params.studyId, 10), getTenantId(req)],
  );
  const study = r.rows[0];
  if (!study) return res.status(404).json({ success: false, message: 'Study not found' });
  const triage = await requestTriage({
    studyId: study.id,
    studyInstanceUID: study.study_instance_uid,
    tenantId: getTenantId(req),
    modality: study.modality,
    orthancStudyId: study.orthanc_study_id,
  });
  return res.json({ success: true, triage, disclaimer: 'AI triage is advisory only — physician review required.' });
});

router.post('/triage/:id/review', authImaging, async (req, res) => {
  const { approved = true } = req.body || {};
  const row = await reviewTriage(parseInt(req.params.id, 10), req.user?.id, approved);
  return res.json({ success: true, triage: row });
});

// ─── Collaboration ─────────────────────────────────────────────────────────────
router.post('/collab/sessions', authImaging, async (req, res) => {
  const { studyInstanceUID } = req.body || {};
  if (!studyInstanceUID) return res.status(400).json({ success: false, message: 'studyInstanceUID required' });
  const session = await createSession({
    studyInstanceUID,
    tenantId: getTenantId(req),
    userId: req.user?.id,
    userName: req.user?.name,
  });
  return res.status(201).json({ success: true, session });
});

router.get('/collab/sessions/:sessionId/annotations', authImaging, async (req, res) => {
  const rows = await listAnnotations(parseInt(req.params.sessionId, 10));
  return res.json({ success: true, annotations: rows });
});

router.post('/collab/sessions/:sessionId/annotations', authImaging, async (req, res) => {
  const annotation = await addAnnotation({
    sessionId: parseInt(req.params.sessionId, 10),
    userId: req.user?.id,
    userName: req.user?.name,
    tool: req.body?.tool,
    data: req.body?.data,
  });
  if (req.body?.studyInstanceUID && req.body?.data?.size_mm) {
    await syncFromCollabAnnotation({
      sessionId: parseInt(req.params.sessionId, 10),
      annotation,
      studyInstanceUID: req.body.studyInstanceUID,
      tenantId: getTenantId(req),
      studyId: req.body.studyId,
      patientName: req.body.patientName,
    }).catch(() => {});
  }
  return res.status(201).json({ success: true, annotation });
});

router.get('/collab/stats', authImaging, (_req, res) => {
  return res.json({ success: true, ...getCollabStats() });
});

// ─── Observability ───────────────────────────────────────────────────────────
router.get('/metrics', authImaging, async (req, res) => {
  const rows = await getRecentMetrics(parseInt(req.query.limit || '100', 10));
  return res.json({ success: true, metrics: rows });
});

router.get('/metrics/prometheus', authImaging, (_req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  return res.send(getPrometheusMetrics());
});

// ─── VNA lifecycle ───────────────────────────────────────────────────────────
router.get('/vna', authImaging, async (req, res) => {
  const rows = await listVnaByTenant(getTenantId(req), req.query.tier || null);
  return res.json({ success: true, objects: rows });
});

router.post('/vna/register', authImaging, async (req, res) => {
  const row = await registerVnaObject({ tenantId: getTenantId(req), ...req.body });
  return res.status(201).json({ success: true, object: row });
});

router.post('/vna/:studyInstanceUID/archive', authImaging, async (req, res) => {
  const row = await transitionToColdArchive(req.params.studyInstanceUID, getTenantId(req));
  await publishEvent(KAFKA_TOPICS.IMAGING_REPORT_FINALIZED, {
    studyInstanceUID: req.params.studyInstanceUID,
    action: 'vna_cold_archive',
    tenantId: getTenantId(req),
  }).catch(() => {});
  return res.json({ success: true, object: row });
});

// ─── Phase A: AI report drafting + Whisper dictation ─────────────────────────
router.post('/reports/draft', authImaging, async (req, res) => {
  try {
    const { studyId, structuredFindings, includePriorComparison = true } = req.body || {};
    if (!studyId) return res.status(400).json({ success: false, message: 'studyId required' });
    const result = await generateReportDraft({
      studyId: parseInt(studyId, 10),
      actorId: req.user?.id,
      actorName: req.user?.name || req.user?.role || 'radiologist',
      structuredFindings,
      includePriorComparison,
      req,
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ success: false, message: err.message });
  }
});

router.get('/reports/draft/:studyId', authImaging, async (req, res) => {
  try {
    const { tenantId } = await assertStudyAccess(parseInt(req.params.studyId, 10), req);
    const draft = await getLatestDraft(parseInt(req.params.studyId, 10), tenantId);
    return res.json({ success: true, draft });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

router.get('/interpretation/:studyId', authImaging, async (req, res) => {
  try {
    const { tenantId } = await assertStudyAccess(parseInt(req.params.studyId, 10), req);
    const interpretation = await getInterpretationForStudy(parseInt(req.params.studyId, 10), tenantId);
    return res.json({ success: true, interpretation });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

router.post('/reports/draft/:draftId/approve', authImaging, async (req, res) => {
  const row = await approveDraft(
    parseInt(req.params.draftId, 10),
    req.user?.id,
    req.body?.editedText,
  );
  return res.json({ success: true, draft: row });
});

router.post('/reports/dictate', authImaging, audioUpload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'audio file required' });
  try {
    const result = await llmProvider.transcribe(req.file.path, { language: req.body?.language || 'en' });
    fs.unlink(req.file.path, () => {});
    if (!result.success) {
      return res.status(502).json({ success: false, message: 'Transcription failed' });
    }
    return res.json({
      success: true,
      text: result.text,
      provider: result.provider,
      disclaimer: 'Verify dictated text before including in report.',
    });
  } catch (err) {
    try { fs.unlinkSync(req.file.path); } catch {}
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Phase B: Prior comparison + critical alerts ─────────────────────────────
router.get('/priors/:studyId/compare', authImaging, async (req, res) => {
  const studyRes = await pool.query(
    `SELECT * FROM ris_studies WHERE id = $1 AND lab_id = $2`,
    [parseInt(req.params.studyId, 10), getTenantId(req)],
  );
  const study = studyRes.rows[0];
  if (!study) return res.status(404).json({ success: false, message: 'Study not found' });
  const comparison = await compareWithPriorStudies({ study, tenantId: getTenantId(req) });
  return res.json({ success: true, comparison });
});

router.get('/priors/:studyId/list', authImaging, async (req, res) => {
  const studyRes = await pool.query(`SELECT * FROM ris_studies WHERE id = $1 AND lab_id = $2`, [
    parseInt(req.params.studyId, 10), getTenantId(req),
  ]);
  const study = studyRes.rows[0];
  if (!study) return res.status(404).json({ success: false, message: 'Study not found' });
  const { findPriorStudies } = await import('../services/imaging/imaging-prior-comparison.service.js');
  const priors = await findPriorStudies(study, getTenantId(req));
  return res.json({ success: true, priors });
});

router.get('/alerts/critical', authImaging, async (req, res) => {
  const alerts = await listOpenCriticalAlerts(getTenantId(req));
  return res.json({ success: true, alerts });
});

router.post('/alerts/critical/:id/acknowledge', authImaging, async (req, res) => {
  const alert = await acknowledgeCriticalAlert(
    parseInt(req.params.id, 10), req.user?.id, getTenantId(req),
  );
  return res.json({ success: true, alert });
});

// ─── Phase C: Measurements + OHIF sync ───────────────────────────────────────
router.get('/measurements/:studyInstanceUID', authImaging, async (req, res) => {
  const rows = await listMeasurements(req.params.studyInstanceUID, getTenantId(req));
  return res.json({ success: true, measurements: rows });
});

router.post('/measurements', authImaging, async (req, res) => {
  const row = await saveMeasurement({ tenantId: getTenantId(req), createdBy: req.user?.id, ...req.body });
  return res.status(201).json({ success: true, measurement: row });
});

router.post('/measurements/sync-annotation', authImaging, async (req, res) => {
  const { sessionId, annotation, studyInstanceUID, studyId, patientName } = req.body || {};
  const row = await syncFromCollabAnnotation({
    sessionId, annotation, studyInstanceUID, tenantId: getTenantId(req), studyId, patientName,
  });
  return res.json({ success: true, measurement: row });
});

// ─── Phase D: Longitudinal analytics ─────────────────────────────────────────
router.get('/longitudinal/:patientName', authImaging, async (req, res) => {
  const timeline = await getPatientTimeline(req.params.patientName, getTenantId(req));
  return res.json({ success: true, ...timeline });
});

router.get('/longitudinal/:patientName/summary', authImaging, async (req, res) => {
  const result = await generateLongitudinalSummary(req.params.patientName, getTenantId(req));
  return res.json({ success: true, ...result });
});

router.get('/analytics', authImaging, async (req, res) => {
  const stats = await getImagingAnalytics(getTenantId(req), { days: parseInt(req.query.days || '30', 10) });
  return res.json({ success: true, analytics: stats });
});

router.get('/analytics/lesions/:patientKey', authImaging, async (req, res) => {
  const lesions = await getLesionAnalytics(getTenantId(req), req.params.patientKey);
  return res.json({ success: true, lesions });
});

router.get('/lesions/:patientKey/timeline', authImaging, async (req, res) => {
  const rows = await getLesionTimeline(getTenantId(req), req.params.patientKey, req.query.lesionId || null);
  return res.json({ success: true, timeline: rows });
});

router.post('/vna/lifecycle/run', authImaging, async (req, res) => {
  const result = await runVnaLifecycleJob(getTenantId(req), parseInt(req.body?.olderThanDays || '90', 10));
  return res.json({ success: true, ...result });
});

// ─── Daily S3 → MinIO transfer ───────────────────────────────────────────────
router.get('/storage/daily-transfer', authImaging, async (_req, res) => {
  try {
    const { getTransferStatus } = await import('../services/imaging/imaging-daily-minio-transfer.service.js');
    const status = await getTransferStatus(100);
    return res.json({ success: true, ...status });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/storage/daily-transfer/run', authImaging, async (req, res) => {
  try {
    const { transferImagingDailyToMinio } = await import('../services/imaging/imaging-daily-minio-transfer.service.js');
    const result = await transferImagingDailyToMinio({
      dryRun: Boolean(req.body?.dryRun),
      force: Boolean(req.body?.force),
      tenantId: req.body?.tenantId ?? undefined,
      lookbackHours: req.body?.lookbackHours != null
        ? Number(req.body.lookbackHours)
        : undefined,
    });
    return res.json({ success: true, result });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/measurements/from-viewer', authImaging, async (req, res) => {
  try {
    const { studyId, studyInstanceUID, lesionLabel, location, sizeMm, volumeMm3, patientName, data } = req.body || {};
    const access = studyId
      ? await assertStudyAccess(parseInt(studyId, 10), req)
      : null;
    const tenantId = access?.tenantId || getTenantId(req);
    const row = await saveMeasurement({
      studyId: access?.study?.id || studyId,
      studyInstanceUID: studyInstanceUID || access?.study?.study_instance_uid,
      tenantId,
      lesionLabel,
      location,
      sizeMm: sizeMm != null ? Number(sizeMm) : null,
      volumeMm3: volumeMm3 != null ? Number(volumeMm3) : null,
      tool: 'ohif',
      data: {
        ...(data || {}),
        patientName: patientName || access?.study?.patient_name,
        studyDate: access?.study?.study_date,
      },
      createdBy: req.user?.id,
    });
    return res.status(201).json({ success: true, measurement: row });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

export default router;
