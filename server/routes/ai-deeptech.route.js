/**
 * Mediqzy DeepTech AI Routes — /api/v3/ai-deeptech
 * ==================================================
 * Exposes the deep technology intelligence layer:
 *
 *   HIS Score         GET  /his/:patientId
 *                     POST /his/:patientId/recompute
 *                     GET  /his/population
 *                     GET  /his/:patientId/history
 *
 *   Clinical NLP      GET  /entities/:patientId
 *                     POST /entities/extract
 *                     GET  /entities/:patientId/fhir
 *
 *   Pre-Authorization POST /preauth
 *                     GET  /preauth/:ref
 *                     POST /preauth/:ref/override
 *                     GET  /preauth/analytics
 *
 *   Agent Context     GET  /context/:patientId
 *                     POST /context/:patientId/session
 *                     PUT  /context/:patientId/session/:sessionId
 *
 *   Federated         GET  /federated/status
 *                     POST /federated/submit
 */

import { Router } from 'express';
import hisScoreService      from '../services/ai-his-score.service.js';
import medicalNlpService    from '../services/ai-medical-nlp.service.js';
import preAuthEngine        from '../services/ai-preauth-engine.service.js';
import agentContextBridge   from '../services/ai-agent-context.service.js';
import federatedLearning    from '../services/ai-federated-learning.service.js';

const router = Router();

// ─── Auth guard ──────────────────────────────────────────────
function requireUser(req, res, next) {
  if (!req.user?.id || req.user.id === 'twilio-webhook') {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

function requireAdmin(req, res, next) {
  const role = req.user?.role || req.user?.userType || '';
  if (!['admin', 'super_admin', 'doctor'].includes(role)) {
    return res.status(403).json({ error: 'Admin or Doctor role required' });
  }
  next();
}

// ════════════════════════════════════════════════════════════
//  HEALTH INTELLIGENCE SCORE (HIS)
// ════════════════════════════════════════════════════════════

/** GET /his/population — population stats (admin) */
router.get('/his/population', requireUser, requireAdmin, async (req, res) => {
  try {
    const { tenant_id } = req.query;
    const stats = await hisScoreService.getPopulationStats(tenant_id || req.user.tenantId);
    return res.json({ success: true, data: stats });
  } catch (err) {
    console.error('[DeepTech] /his/population error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/** GET /his/:patientId — get current HIS score */
router.get('/his/:patientId', requireUser, async (req, res) => {
  try {
    const { patientId } = req.params;
    const score = await hisScoreService.getScore(parseInt(patientId), false);
    if (!score) return res.status(404).json({ error: 'No HIS score found for this patient' });
    return res.json({ success: true, data: score });
  } catch (err) {
    console.error('[DeepTech] /his/:patientId error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/** POST /his/:patientId/recompute — on-demand recompute */
router.post('/his/:patientId/recompute', requireUser, requireAdmin, async (req, res) => {
  try {
    const { patientId } = req.params;
    const score = await hisScoreService.getScore(parseInt(patientId), true);
    return res.json({ success: true, data: score, message: 'HIS score recomputed' });
  } catch (err) {
    console.error('[DeepTech] /his/recompute error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/** GET /his/:patientId/history — HIS score history */
router.get('/his/:patientId/history', requireUser, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { limit = 30 } = req.query;
    const history = await hisScoreService.getHistory(parseInt(patientId), parseInt(limit));
    return res.json({ success: true, data: history, count: history.length });
  } catch (err) {
    console.error('[DeepTech] /his/history error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
//  CLINICAL NLP ENTITIES
// ════════════════════════════════════════════════════════════

/** GET /entities/:patientId — get structured entities */
router.get('/entities/:patientId', requireUser, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { days = 90 } = req.query;
    const entities = await medicalNlpService.getPatientEntities(parseInt(patientId), parseInt(days));
    return res.json({ success: true, data: entities });
  } catch (err) {
    console.error('[DeepTech] /entities error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/** POST /entities/extract — manually trigger extraction from text */
router.post('/entities/extract', requireUser, async (req, res) => {
  try {
    const { text, patient_id, source = 'manual', source_id } = req.body;
    if (!text || !patient_id) return res.status(400).json({ error: 'text and patient_id required' });

    const entities = await medicalNlpService.extract(
      text, parseInt(patient_id), source, source_id || null, req.user.tenantId || null
    );
    return res.json({ success: true, data: entities, count: entities.length });
  } catch (err) {
    console.error('[DeepTech] /entities/extract error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/** GET /entities/:patientId/fhir — FHIR R4 Bundle export */
router.get('/entities/:patientId/fhir', requireUser, async (req, res) => {
  try {
    const { patientId } = req.params;
    const bundle = await medicalNlpService.getFHIRBundle(parseInt(patientId));
    res.setHeader('Content-Type', 'application/fhir+json');
    return res.json(bundle);
  } catch (err) {
    console.error('[DeepTech] /entities/fhir error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
//  CLAIMS PRE-AUTHORIZATION
// ════════════════════════════════════════════════════════════

/** GET /preauth/analytics — approval analytics */
router.get('/preauth/analytics', requireUser, requireAdmin, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const analytics = await preAuthEngine.getAnalytics(req.user.tenantId, parseInt(days));
    return res.json({ success: true, data: analytics });
  } catch (err) {
    console.error('[DeepTech] /preauth/analytics error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/** POST /preauth — submit pre-auth request */
router.post('/preauth', requireUser, async (req, res) => {
  try {
    const {
      patient_id, policy_id, tpa_id, admission_type,
      diagnosis_codes, procedure_codes, requested_amount, hospital_id, treating_doctor_id,
    } = req.body;

    if (!patient_id || !diagnosis_codes || !requested_amount) {
      return res.status(400).json({ error: 'patient_id, diagnosis_codes, and requested_amount are required' });
    }

    const decision = await preAuthEngine.request({
      patientId: parseInt(patient_id),
      tenantId: req.user.tenantId || null,
      policyId: policy_id || null,
      tpaId: tpa_id || null,
      admissionType: admission_type || 'planned',
      diagnosisCodes: diagnosis_codes,
      procedureCodes: procedure_codes || [],
      requestedAmount: parseFloat(requested_amount),
      hospitalId: hospital_id || null,
      treatingDoctorId: treating_doctor_id || null,
    });

    return res.status(201).json({ success: true, data: decision });
  } catch (err) {
    console.error('[DeepTech] /preauth POST error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/** GET /preauth/:ref — get decision status */
router.get('/preauth/:ref', requireUser, async (req, res) => {
  try {
    const decision = await preAuthEngine.getDecision(req.params.ref);
    if (!decision) return res.status(404).json({ error: 'Pre-auth reference not found' });
    return res.json({ success: true, data: decision });
  } catch (err) {
    console.error('[DeepTech] /preauth/:ref GET error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/** POST /preauth/:ref/override — human reviewer override */
router.post('/preauth/:ref/override', requireUser, requireAdmin, async (req, res) => {
  try {
    const { decision, reason } = req.body;
    if (!decision || !reason) return res.status(400).json({ error: 'decision and reason required' });
    const updated = await preAuthEngine.humanOverride(req.params.ref, req.user.id, decision, reason);
    if (!updated) return res.status(404).json({ error: 'Pre-auth reference not found' });
    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[DeepTech] /preauth/override error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
//  MULTI-AGENT CONTEXT BRIDGE
// ════════════════════════════════════════════════════════════

/** GET /context/:patientId — latest active session context */
router.get('/context/:patientId', requireUser, async (req, res) => {
  try {
    const ctx = await agentContextBridge.getLatestSession(parseInt(req.params.patientId));
    if (!ctx) return res.status(404).json({ error: 'No active context session for this patient' });
    return res.json({ success: true, data: ctx });
  } catch (err) {
    console.error('[DeepTech] /context GET error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/** POST /context/:patientId/session — create new encounter session */
router.post('/context/:patientId/session', requireUser, async (req, res) => {
  try {
    const { session_id } = req.body;
    const ctx = await agentContextBridge.getOrCreate(
      parseInt(req.params.patientId), session_id || null, req.user.tenantId || null
    );
    return res.status(201).json({ success: true, data: ctx });
  } catch (err) {
    console.error('[DeepTech] /context/session error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/** PUT /context/:patientId/session/:sessionId — update a context slot */
router.put('/context/:patientId/session/:sessionId', requireUser, async (req, res) => {
  try {
    const { patientId, sessionId } = req.params;
    const { slot, data } = req.body;
    if (!slot || !data) return res.status(400).json({ error: 'slot and data required' });
    await agentContextBridge.update(parseInt(patientId), sessionId, slot, data);
    const summary = await agentContextBridge.buildContextSummary(parseInt(patientId), sessionId);
    return res.json({ success: true, summary });
  } catch (err) {
    console.error('[DeepTech] /context/session PUT error:', err.message);
    return res.status(err.message.includes('Invalid') ? 400 : 500).json({ error: err.message });
  }
});

/** DELETE /context/:patientId/session/:sessionId — close session */
router.delete('/context/:patientId/session/:sessionId', requireUser, async (req, res) => {
  try {
    await agentContextBridge.closeSession(parseInt(req.params.patientId), req.params.sessionId);
    return res.json({ success: true, message: 'Session closed' });
  } catch (err) {
    console.error('[DeepTech] /context/session DELETE error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
//  FEDERATED LEARNING
// ════════════════════════════════════════════════════════════

/** GET /federated/status — model and update status */
router.get('/federated/status', requireUser, requireAdmin, async (req, res) => {
  try {
    const status = await federatedLearning.getStatus();
    return res.json({ success: true, data: status });
  } catch (err) {
    console.error('[DeepTech] /federated/status error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/** POST /federated/submit — submit a local model update */
router.post('/federated/submit', requireUser, requireAdmin, async (req, res) => {
  try {
    const { model_name, sample_count, feature_stats, gradient_delta, dp_config } = req.body;
    if (!model_name || !sample_count || !gradient_delta) {
      return res.status(400).json({ error: 'model_name, sample_count, gradient_delta required' });
    }
    const result = await federatedLearning.submitUpdate(
      req.user.tenantId, model_name, parseInt(sample_count),
      feature_stats || {}, gradient_delta, dp_config || {}
    );
    return res.status(201).json({ success: true, data: result });
  } catch (err) {
    console.error('[DeepTech] /federated/submit error:', err.message);
    return res.status(err.message.includes('BLOCKED') ? 422 : 500).json({ error: err.message });
  }
});

/** GET /federated/model/:modelName — get global model weights */
router.get('/federated/model/:modelName', requireUser, requireAdmin, async (req, res) => {
  try {
    const model = await federatedLearning.getGlobalModel(req.params.modelName);
    return res.json({ success: true, data: model });
  } catch (err) {
    console.error('[DeepTech] /federated/model error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
