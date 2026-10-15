import express from 'express';
import pool from '../db/pgPool.js';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { triageMultilingual } from '../services/multilingual-triage.service.js';
import { evaluatePrescriptionSignoff } from '../services/prescription-safety-gate.service.js';
import { createPharmacyForecast } from '../services/pharmacy-forecast.service.js';
import { metricResult, metricUnavailable } from '../services/metric-integrity.service.js';
import {
  buildLabExplainerDraft,
  createAgentHandoff,
  createAdherencePlan,
  materializeAdherenceEvent,
  runDueAdherenceEvents,
  deliverApprovedLabExplanation,
} from '../services/medcore-adoption.service.js';

const router = express.Router();
const actorId = (req) => req.user?.id || req.authToken?.id || null;
// Authenticated clinical records are scoped to the owning organization. The
// fallback is per-user rather than a shared bucket, so an incomplete legacy
// token can never expose another patient's adoption data.
const tenantUid = (req) => String(req.user?.organization_uid || req.user?.tenant_uid || req.user?.tenantUid || req.tenantContext?.tenantUid || (req.tenantId ? `tenant:${req.tenantId}` : `user:${actorId(req) || 'unknown'}`));
const clinicalReviewer = [authUser, requireRole(['doctor', 'admin', 'medical_director', 'nurse'])];

// One opt-in gate covers the adoption surface. Deployments must explicitly set
// MEDCORE_ADOPTION_ENABLED=true after clinical/counsel review is complete.
router.use((req, res, next) => {
  if (process.env.MEDCORE_ADOPTION_ENABLED !== 'true') {
    return res.status(404).json({ success: false, code: 'feature_disabled', message: 'Capability is not enabled' });
  }
  return next();
});

router.post('/triage', authUser, async (req, res) => {
  try {
    if (!String(req.body?.symptoms || '').trim()) return res.status(422).json({ success: false, code: 'validation_failed', message: 'symptoms is required' });
    const result = await triageMultilingual({ ...req.body, patientId: req.body.patientId || actorId(req), skipGovernancePersistence: false });
    let handoff = null;
    if (req.body.requestHuman === true || result.esiLevel <= 2) {
      try {
        handoff = await createAgentHandoff({
          patientId: req.body.patientId || actorId(req),
          transcript: req.body.transcript || req.body.symptoms,
          soap: req.body.soap || {},
          doctorMatches: req.body.doctorMatches || [],
          redFlags: result.redFlagsDetected || result.matchedConcepts || [],
          reason: result.esiLevel <= 2 ? `High-acuity triage (ESI ${result.esiLevel})` : 'Agent requested clinical review',
          actorId: actorId(req),
          tenantUid: tenantUid(req),
        });
      } catch (handoffError) {
        console.error('[MedCore Adoption] high-acuity handoff unavailable:', handoffError.message);
      }
    }
    res.json({ success: true, result, handoff });
  } catch (error) {
    res.status(500).json({ success: false, code: 'triage_failed', message: error.message });
  }
});

router.post('/drug-safety/signoff', authUser, async (req, res) => {
  try {
    if (!Array.isArray(req.body?.medications) || req.body.medications.length === 0) return res.status(422).json({ success: false, code: 'validation_failed', message: 'medications is required' });
    const result = await evaluatePrescriptionSignoff({ ...req.body, actorId: actorId(req), tenantUid: tenantUid(req) });
    res.status(result.allowed ? 200 : 409).json({ success: result.allowed, code: result.allowed ? undefined : 'contraindicated_requires_acknowledgement', result });
  } catch (error) {
    res.status(500).json({ success: false, code: 'drug_safety_failed', message: error.message });
  }
});

router.post('/pharmacy/forecast', authUser, async (req, res) => {
  try {
    if (!req.body?.itemId || !Array.isArray(req.body?.history)) return res.status(422).json({ success: false, code: 'validation_failed', message: 'itemId and history are required' });
    const result = await createPharmacyForecast({ ...req.body, actorId: actorId(req), tenantUid: tenantUid(req) });
    res.json({ success: true, forecast: result });
  } catch (error) {
    res.status(500).json({ success: false, code: 'forecast_failed', message: error.message });
  }
});

router.get('/metrics/:metricKey', authUser, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT value, available, reason, source, unit FROM metric_integrity_results WHERE metric_key = $1 ORDER BY created_at DESC LIMIT 1`, [req.params.metricKey]);
    const metric = rows[0] ? metricResult(rows[0].value, rows[0]) : metricUnavailable('No computed value has been recorded', 'metric_integrity_results');
    res.json({ success: true, metricKey: req.params.metricKey, metric });
  } catch (error) {
    // Even during a migration/DB outage, the response preserves the semantic
    // distinction between unavailable and zero.
    res.json({ success: true, metricKey: req.params.metricKey, metric: metricUnavailable('Metric source is unavailable') });
  }
});

router.post('/agent-handoffs', authUser, async (req, res) => {
  try {
    const handoff = await createAgentHandoff({ ...req.body, actorId: actorId(req), tenantUid: tenantUid(req) });
    res.status(201).json({ success: true, handoff });
  } catch (error) {
    res.status(500).json({ success: false, code: 'handoff_failed', message: error.message });
  }
});

router.get('/agent-handoffs', ...clinicalReviewer, async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const { rows } = await pool.query(`SELECT * FROM agent_handoffs WHERE tenant_uid = $1 AND status = $2 ORDER BY created_at DESC LIMIT 100`, [tenantUid(req), status]);
    res.json({ success: true, handoffs: rows });
  } catch (error) {
    res.status(500).json({ success: false, code: 'handoff_list_failed', message: error.message });
  }
});

router.patch('/agent-handoffs/:id', ...clinicalReviewer, async (req, res) => {
  try {
    const status = ['claimed', 'completed', 'cancelled'].includes(req.body?.status) ? req.body.status : null;
    if (!status) return res.status(422).json({ success: false, code: 'validation_failed', message: 'status must be claimed, completed or cancelled' });
    const { rows } = await pool.query(`UPDATE agent_handoffs SET status = $1, claimed_by = COALESCE($2, claimed_by), updated_at = NOW() WHERE id = $3 AND tenant_uid = $4 RETURNING *`, [status, actorId(req), req.params.id, tenantUid(req)]);
    if (!rows[0]) return res.status(404).json({ success: false, code: 'not_found', message: 'Handoff not found' });
    res.json({ success: true, handoff: rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, code: 'handoff_update_failed', message: error.message });
  }
});

router.post('/lab-explainer/drafts', authUser, async (req, res) => {
  try {
    if (!req.body?.report || typeof req.body.report !== 'object') return res.status(422).json({ success: false, code: 'validation_failed', message: 'report is required' });
    const draft = buildLabExplainerDraft(req.body.report);
    const { rows } = await pool.query(`INSERT INTO lab_explainer_drafts (tenant_uid, patient_id, report_id, draft, source) VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING *`, [tenantUid(req), req.body.patientId || null, req.body.reportId || null, draft, JSON.stringify(req.body.report)]);
    res.status(201).json({ success: true, draft: rows[0], requiresDoctorApproval: true });
  } catch (error) {
    res.status(500).json({ success: false, code: 'lab_explainer_failed', message: error.message });
  }
});

router.get('/lab-explainer/queue', ...clinicalReviewer, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM lab_explainer_drafts WHERE tenant_uid = $1 AND status = 'pending' ORDER BY created_at ASC LIMIT 100`, [tenantUid(req)]);
    res.json({ success: true, drafts: rows });
  } catch (error) {
    res.status(500).json({ success: false, code: 'lab_explainer_queue_failed', message: error.message });
  }
});

router.post('/lab-explainer/:id/approve', ...clinicalReviewer, async (req, res) => {
  try {
    const { rows } = await pool.query(`UPDATE lab_explainer_drafts SET status = 'approved', reviewer_id = $1, reviewed_at = NOW() WHERE id = $2 AND tenant_uid = $3 AND status = 'pending' RETURNING *`, [actorId(req), req.params.id, tenantUid(req)]);
    if (!rows[0]) return res.status(409).json({ success: false, code: 'approval_required_or_already_reviewed', message: 'Draft is not pending or was not found' });
    res.json({ success: true, draft: rows[0], patientDeliveryAllowed: true });
  } catch (error) {
    res.status(500).json({ success: false, code: 'lab_explainer_approval_failed', message: error.message });
  }
});

router.post('/lab-explainer/:id/reject', ...clinicalReviewer, async (req, res) => {
  try {
    const { rows } = await pool.query(`UPDATE lab_explainer_drafts SET status = 'rejected', reviewer_id = $1, review_reason = $2, reviewed_at = NOW() WHERE id = $3 AND tenant_uid = $4 AND status = 'pending' RETURNING *`, [actorId(req), req.body?.reason || 'Rejected by clinician', req.params.id, tenantUid(req)]);
    if (!rows[0]) return res.status(409).json({ success: false, code: 'approval_required_or_already_reviewed', message: 'Draft is not pending or was not found' });
    res.json({ success: true, draft: rows[0], patientDeliveryAllowed: false });
  } catch (error) {
    res.status(500).json({ success: false, code: 'lab_explainer_rejection_failed', message: error.message });
  }
});

router.post('/lab-explainer/:id/deliver', authUser, async (req, res) => {
  try {
    const role = String(req.user?.role || req.user?.userRole || '').toLowerCase();
    const privileged = ['doctor', 'admin', 'medical_director', 'nurse'].includes(role);
    const result = await deliverApprovedLabExplanation({ draftId: req.params.id, tenantUid: tenantUid(req), actorId: actorId(req), privileged, channel: req.body?.channel || 'whatsapp' });
    res.json({ success: true, ...result, patientDeliveryAllowed: true });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, code: error.statusCode === 409 ? 'approval_required_or_already_delivered' : 'lab_explainer_delivery_failed', message: error.message, delivery: error.delivery });
  }
});

router.post('/adherence/plans', authUser, async (req, res) => {
  try {
    if (!req.body?.patientId || !req.body?.medication) return res.status(422).json({ success: false, code: 'validation_failed', message: 'patientId and medication are required' });
    const plan = await createAdherencePlan({ ...req.body, actorId: actorId(req), tenantUid: tenantUid(req) });
    const event = await materializeAdherenceEvent(plan);
    res.status(201).json({ success: true, plan, firstEvent: event, quietHoursApplied: true });
  } catch (error) {
    res.status(500).json({ success: false, code: 'adherence_plan_failed', message: error.message });
  }
});

router.get('/adherence/plans', authUser, async (req, res) => {
  try {
    const params = req.query.patientId ? [tenantUid(req), req.query.patientId] : [tenantUid(req)];
    const { rows } = await pool.query(`SELECT * FROM adherence_plans WHERE tenant_uid = $1 ${req.query.patientId ? 'AND patient_id = $2' : ''} ORDER BY created_at DESC LIMIT 100`, params);
    res.json({ success: true, plans: rows });
  } catch (error) {
    res.status(500).json({ success: false, code: 'adherence_list_failed', message: error.message });
  }
});

router.post('/adherence/run-due', authUser, async (_req, res) => {
  try {
    const events = await runDueAdherenceEvents({ tenantUid: tenantUid(_req) });
    res.json({ success: true, events, quietHoursHonored: true });
  } catch (error) {
    res.status(500).json({ success: false, code: 'adherence_scheduler_failed', message: error.message });
  }
});

export default router;
