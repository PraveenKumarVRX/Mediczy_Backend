/**
 * Hospital OS 2035 — unified API routes
 */
import { Router } from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import hospitalOs from '../services/hospital-os/index.js';

const router = Router();
const clinical = [authUser, requireRole(['doctor', 'nurse', 'admin', 'assistant'])];
const leadership = [authUser, requireRole(['admin', 'doctor', 'nurse', 'cfo', 'coo', 'ms'])];
const doctorOnly = [authUser, requireRole(['doctor', 'admin'])];

function orgId(req) {
  return req.user?.organization_id || req.user?.tenant_id || req.hospitalId || 1;
}

// ── Meta ─────────────────────────────────────────────────────────────────────
router.get('/health', authUser, (req, res) => {
  res.json({ success: true, ...hospitalOs.getCapabilities(), ambient: hospitalOs.getAmbientPipelineStatus() });
});

// ── Pillar 1: Unified Hospital Copilot ───────────────────────────────────────
router.post('/copilot/chat', ...clinical, async (req, res) => {
  try {
    const { message, context, conversationHistory } = req.body;
    if (!message?.trim()) return res.status(400).json({ success: false, error: 'message required' });
    const result = await hospitalOs.hospitalCopilotChat({
      message,
      context: { ...context, organizationId: orgId(req) },
      conversationHistory: conversationHistory || [],
      req,
    });
    res.json({ success: true, data: result });
  } catch (e) {
    console.error('[HospitalOS] copilot error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Approval inbox ─────────────────────────────────────────────────────────────
router.get('/approvals', ...clinical, async (req, res) => {
  const rows = await hospitalOs.listApprovals({
    status: req.query.status || 'pending',
    patientId: req.query.patientId ? Number(req.query.patientId) : undefined,
  });
  res.json({ success: true, data: rows });
});

router.post('/approvals/:id/review', ...doctorOnly, async (req, res) => {
  const result = await hospitalOs.reviewApproval({
    approvalId: Number(req.params.id),
    reviewerId: req.user.id,
    action: req.body.action,
    notes: req.body.notes,
  });
  res.json({ success: true, data: result });
});

// ── Digital twins ────────────────────────────────────────────────────────────
router.get('/twins/patient/:patientId', ...clinical, async (req, res) => {
  const twin = await hospitalOs.getPatientTwin(Number(req.params.patientId), orgId(req));
  res.json({ success: true, data: twin });
});

router.post('/twins/patient/:patientId/sync', ...clinical, async (req, res) => {
  const twin = await hospitalOs.syncPatientTwin(Number(req.params.patientId), orgId(req));
  res.json({ success: true, data: twin });
});

router.get('/twins/hospital', ...leadership, async (req, res) => {
  const twin = await hospitalOs.syncHospitalTwin(orgId(req));
  res.json({ success: true, data: twin });
});

// ── Simulations ──────────────────────────────────────────────────────────────
router.get('/simulate/scenarios', authUser, (req, res) => {
  res.json({ success: true, data: hospitalOs.listScenarios() });
});

router.post('/simulate/hospital', ...leadership, async (req, res) => {
  const result = await hospitalOs.runHospitalSimulation({
    organizationId: orgId(req),
    scenarioKey: req.body.scenarioKey,
    params: req.body.params || {},
    userId: req.user.id,
  });
  res.json({ success: true, data: result });
});

router.post('/simulate/clinical', ...doctorOnly, async (req, res) => {
  const result = await hospitalOs.simulateClinicalScenario({
    patientId: Number(req.body.patientId),
    organizationId: orgId(req),
    scenario: req.body.scenario,
    proposedChange: req.body.proposedChange,
    userId: req.user.id,
  });
  res.json({ success: true, data: result });
});

// ── Knowledge graph ─────────────────────────────────────────────────────────
router.post('/knowledge-graph/patient/:patientId/build', ...clinical, async (req, res) => {
  const graph = await hospitalOs.buildPatientSubgraph(Number(req.params.patientId), orgId(req));
  res.json({ success: true, data: graph });
});

router.get('/knowledge-graph/query', ...clinical, async (req, res) => {
  const result = await hospitalOs.queryGraph({
    nodeType: req.query.nodeType,
    externalId: req.query.externalId,
  });
  res.json({ success: true, data: result });
});

// ── Nurse handover ────────────────────────────────────────────────────────────
router.post('/nurse/handover', ...clinical, async (req, res) => {
  const brief = await hospitalOs.generateShiftHandover({
    wardId: req.body.wardId,
    organizationId: orgId(req),
    shift: req.body.shift || 'day',
  });
  res.json({ success: true, data: brief });
});

// ── Command center AI ─────────────────────────────────────────────────────────
router.get('/command-center/ai', ...leadership, async (req, res) => {
  const data = await hospitalOs.getAIRecommendations(orgId(req));
  res.json({ success: true, data });
});

// ── Translator ────────────────────────────────────────────────────────────────
router.get('/translator/languages', authUser, (req, res) => {
  res.json({ success: true, data: hospitalOs.listLanguages() });
});

router.post('/translator', ...clinical, async (req, res) => {
  const result = await hospitalOs.translateClinical(req.body);
  res.json({ success: true, data: result });
});

// ── Voice drafts ─────────────────────────────────────────────────────────────
router.post('/voice/draft-lab-order', ...doctorOnly, async (req, res) => {
  const result = await hospitalOs.draftLabOrderFromVoice({
    ...req.body,
    doctorId: req.user.id,
    hospitalId: orgId(req),
  });
  res.json({ success: true, data: result });
});

router.post('/voice/draft-imaging-order', ...doctorOnly, async (req, res) => {
  const result = await hospitalOs.draftImagingOrderFromVoice({
    ...req.body,
    doctorId: req.user.id,
    hospitalId: orgId(req),
  });
  res.json({ success: true, data: result });
});

// ── ED forecast ───────────────────────────────────────────────────────────────
router.get('/ed/forecast', ...leadership, async (req, res) => {
  const data = await hospitalOs.forecastED({
    organizationId: orgId(req),
    hoursAhead: Number(req.query.hours) || 8,
  });
  res.json({ success: true, data });
});

// ── Journey optimizer ─────────────────────────────────────────────────────────
router.post('/journey/optimize', ...clinical, async (req, res) => {
  const plan = await hospitalOs.optimizeJourney({
    patientId: Number(req.body.patientId),
    organizationId: orgId(req),
    goals: req.body.goals || [],
  });
  res.json({ success: true, data: plan });
});

router.post('/journey/earlier-ot-slot', ...clinical, async (req, res) => {
  const data = await hospitalOs.suggestEarlierOTSlot({
    organizationId: orgId(req),
    otRoomId: Number(req.body.otRoomId),
    beforeScheduledStart: req.body.beforeScheduledStart,
    durationMinutes: req.body.durationMinutes,
  });
  res.json({ success: true, data });
});

// ── Workforce AI ──────────────────────────────────────────────────────────────
router.get('/workforce/analysis', ...leadership, async (req, res) => {
  const data = await hospitalOs.analyzeWorkforce({
    organizationId: orgId(req),
    department: req.query.department || 'nursing',
  });
  res.json({ success: true, data });
});

// ── Research hub ──────────────────────────────────────────────────────────────
router.get('/research/trials/:patientId', ...doctorOnly, async (req, res) => {
  const data = await hospitalOs.matchClinicalTrials({
    patientId: Number(req.params.patientId),
    organizationId: orgId(req),
  });
  res.json({ success: true, data });
});

router.get('/research/briefing/:patientId', ...doctorOnly, async (req, res) => {
  const data = await hospitalOs.generateResearchBriefing({
    patientId: Number(req.params.patientId),
    organizationId: orgId(req),
    diagnosisHint: req.query.diagnosis,
  });
  res.json({ success: true, data });
});

router.get('/radiology/:patientId/summary', ...doctorOnly, async (req, res) => {
  const data = await hospitalOs.summarizeRadiology({ patientId: Number(req.params.patientId), tenantId: req.tenantId || 'default' });
  res.json({ success: true, data });
});

router.get('/lab/:patientId/summary', ...doctorOnly, async (req, res) => {
  const data = await hospitalOs.summarizeLabTrends({ patientId: Number(req.params.patientId), organizationId: orgId(req) });
  res.json({ success: true, data });
});

router.get('/billing/:patientId/summary', ...clinical, async (req, res) => {
  const data = await hospitalOs.summarizeBillingAccount({
    patientId: Number(req.params.patientId),
    hospitalId: orgId(req),
    admissionId: req.query.admissionId ? Number(req.query.admissionId) : undefined,
  });
  res.json({ success: true, data });
});

router.get('/research/patterns', ...leadership, async (req, res) => {
  const data = await hospitalOs.detectEmergingPatterns({
    organizationId: orgId(req),
    days: Number(req.query.days) || 30,
  });
  res.json({ success: true, data });
});

// ── Ambient documentation ─────────────────────────────────────────────────────
router.get('/ambient/status', authUser, (req, res) => {
  res.json({ success: true, data: hospitalOs.getAmbientPipelineStatus() });
});

router.post('/ambient/route', ...clinical, async (req, res) => {
  const result = await hospitalOs.routeAmbientDocument({
    ...req.body,
    requestedBy: req.user.id,
  });
  res.json({ success: true, data: result });
});

// ── Events ────────────────────────────────────────────────────────────────────
router.get('/events', ...leadership, async (req, res) => {
  const events = await hospitalOs.listEvents({
    eventType: req.query.type,
    entityType: req.query.entityType,
    entityId: req.query.entityId,
    limit: Number(req.query.limit) || 50,
  });
  res.json({ success: true, data: events });
});

export default router;
