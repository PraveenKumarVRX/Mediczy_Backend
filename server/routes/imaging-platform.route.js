/**
 * Imaging platform API — Phases 1–4
 * Mounted at /api/imaging/platform
 */
import express from 'express';
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
import { publishEvent, KAFKA_TOPICS } from '../config/kafka.js';
import pool from '../db/pgPool.js';

const router = express.Router();

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

export default router;
