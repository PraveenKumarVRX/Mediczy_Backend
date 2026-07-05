/**
 * Mediqzy CareOS — Phase 1 API routes
 */
import { Router } from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import careos from '../services/careos/index.js';

const router = Router();
const clinical = [authUser, requireRole(['doctor', 'nurse', 'admin', 'assistant'])];
const doctorOnly = [authUser, requireRole(['doctor', 'admin'])];

function orgId(req) {
  return req.user?.organization_id || req.user?.tenant_id || req.hospitalId || 1;
}

function pid(req) {
  return Number(req.params.patientId);
}

// ── Meta ─────────────────────────────────────────────────────────────────────
router.get('/health', authUser, (req, res) => {
  res.json({ success: true, ...careos.getCareOSCapabilities() });
});

// ── Living Patient Workspace ───────────────────────────────────────────────────
router.get('/workspace/:patientId', ...clinical, async (req, res) => {
  try {
    const data = await careos.getLivingWorkspace(pid(req), orgId(req), {
      admissionId: req.query.admissionId ? Number(req.query.admissionId) : undefined,
    });
    res.json({ success: true, data });
  } catch (e) {
    console.error('[CareOS] workspace error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Clinical Timeline ────────────────────────────────────────────────────────
router.get('/timeline/:patientId', ...clinical, async (req, res) => {
  const rows = await careos.getClinicalTimeline(pid(req), {
    organizationId: orgId(req),
    limit: req.query.limit ? Number(req.query.limit) : 200,
    search: req.query.search,
    eventType: req.query.eventType,
  });
  res.json({ success: true, data: rows });
});

router.post('/timeline/:patientId/events', ...clinical, async (req, res) => {
  try {
    const { eventType, title, body, severity, metadata, eventAt } = req.body;
    if (!eventType || !title) return res.status(400).json({ success: false, error: 'eventType and title required' });
    const row = await careos.appendClinicalEvent({
      organizationId: orgId(req),
      patientId: pid(req),
      admissionId: req.body.admissionId,
      eventType,
      title,
      body,
      actorType: req.body.actorType || 'clinician',
      actorId: req.user.id,
      actorName: req.user.name || req.user.email,
      severity,
      metadata,
      eventAt,
    });
    res.json({ success: true, data: row });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Dynamic Care Team ────────────────────────────────────────────────────────
router.get('/teams/:patientId', ...clinical, async (req, res) => {
  const team = await careos.getOrCreateCareTeam(pid(req), orgId(req), req.query.admissionId ? Number(req.query.admissionId) : undefined);
  res.json({ success: true, data: team });
});

router.post('/teams/:patientId/members', ...clinical, async (req, res) => {
  const team = await careos.getOrCreateCareTeam(pid(req), orgId(req));
  const member = await careos.addTeamMember({
    teamId: team.id,
    userId: req.body.userId,
    role: req.body.role,
    specialty: req.body.specialty,
    displayName: req.body.displayName,
    invitedBy: 'manual',
  });
  res.json({ success: true, data: member });
});

router.post('/teams/:patientId/auto-invite', ...doctorOnly, async (req, res) => {
  const result = await careos.autoInviteSpecialists(pid(req), orgId(req), req.body.diagnosis || req.body.diagnosisText);
  res.json({ success: true, data: result });
});

// ── Tasks ────────────────────────────────────────────────────────────────────
router.get('/tasks/:patientId', ...clinical, async (req, res) => {
  const rows = await careos.listTasks(pid(req), { organizationId: orgId(req), status: req.query.status });
  res.json({ success: true, data: rows });
});

router.post('/tasks/:patientId', ...clinical, async (req, res) => {
  const task = await careos.createTask({
    organizationId: orgId(req),
    patientId: pid(req),
    teamId: req.body.teamId,
    title: req.body.title,
    ownerRole: req.body.ownerRole,
    ownerUserId: req.body.ownerUserId || req.user.id,
    priority: req.body.priority,
    dueAt: req.body.dueAt,
  });
  res.json({ success: true, data: task });
});

router.patch('/tasks/:taskId', ...clinical, async (req, res) => {
  const task = await careos.updateTaskStatus(Number(req.params.taskId), req.body.status, req.user.id);
  res.json({ success: true, data: task });
});

// ── Treatment Pathway ────────────────────────────────────────────────────────
router.get('/pathway/:patientId', ...clinical, async (req, res) => {
  const row = await careos.getPathway(pid(req), orgId(req), req.query.admissionId ? Number(req.query.admissionId) : undefined);
  res.json({ success: true, data: row });
});

router.put('/pathway/:patientId', ...doctorOnly, async (req, res) => {
  const row = await careos.updatePathway(pid(req), {
    organizationId: orgId(req),
    admissionId: req.body.admissionId,
    currentGoal: req.body.currentGoal,
    currentProgress: req.body.currentProgress,
    steps: req.body.steps,
  });
  res.json({ success: true, data: row });
});

// ── AI Clinical Coordinator ────────────────────────────────────────────────────
router.get('/coordinator/:patientId/alerts', ...clinical, async (req, res) => {
  const rows = await careos.listCoordinatorAlerts(pid(req), orgId(req));
  res.json({ success: true, data: rows });
});

router.post('/coordinator/:patientId/analyze', ...clinical, async (req, res) => {
  try {
    const result = await careos.analyzePatient(pid(req), orgId(req));
    res.json({ success: true, data: result });
  } catch (e) {
    console.error('[CareOS] coordinator analyze:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Instant MDT / Clinical Board ─────────────────────────────────────────────
router.post('/mdt/start', ...doctorOnly, async (req, res) => {
  const session = await careos.startClinicalBoard({
    patientId: Number(req.body.patientId),
    organizationId: orgId(req),
    title: req.body.title,
    startedBy: req.user.id,
  });
  res.json({ success: true, data: session });
});

router.post('/mdt/:sessionId/join', ...clinical, async (req, res) => {
  const result = await careos.joinClinicalBoard({
    sessionId: Number(req.params.sessionId),
    userId: req.user.id,
    userName: req.user.name || req.user.email,
    role: req.body.role,
  });
  res.json({ success: true, data: result });
});

router.post('/mdt/:sessionId/opinion', ...clinical, async (req, res) => {
  const row = await careos.recordOpinion({
    sessionId: Number(req.params.sessionId),
    specialistRole: req.body.specialistRole,
    specialistName: req.body.specialistName || req.user.name,
    opinion: req.body.opinion,
    recommendation: req.body.recommendation,
  });
  res.json({ success: true, data: row });
});

router.get('/mdt/:sessionId/consensus', ...clinical, async (req, res) => {
  try {
    const result = await careos.getAIConsensus(Number(req.params.sessionId));
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Clinical Playback ──────────────────────────────────────────────────────────
router.get('/playback/:patientId', ...clinical, async (req, res) => {
  const data = await careos.buildClinicalPlayback(pid(req), orgId(req), req.query.hours ? Number(req.query.hours) : 48);
  res.json({ success: true, data });
});

// ── Hospital Memory ──────────────────────────────────────────────────────────
router.get('/memory/similar/:patientId', ...clinical, async (req, res) => {
  const data = await careos.findSimilarCases(pid(req), orgId(req), req.query.presentation || '');
  res.json({ success: true, data });
});

router.post('/memory/archive', ...doctorOnly, async (req, res) => {
  const row = await careos.archiveCase({
    organizationId: orgId(req),
    patientId: Number(req.body.patientId),
    presentationSummary: req.body.presentationSummary,
    finalDiagnosis: req.body.finalDiagnosis,
    lessonsLearned: req.body.lessonsLearned,
    keywords: req.body.keywords || [],
  });
  res.json({ success: true, data: row });
});

// ── Family Portal ──────────────────────────────────────────────────────────────
router.get('/family/:patientId/updates', authUser, async (req, res) => {
  const familyOnly = req.user.role === 'patient' || req.query.family === 'true';
  const rows = await careos.listFamilyUpdates(pid(req), { familyVisibleOnly: familyOnly });
  res.json({ success: true, data: rows });
});

router.post('/family/:patientId/updates', ...doctorOnly, async (req, res) => {
  const row = await careos.publishFamilyUpdate({
    organizationId: orgId(req),
    patientId: pid(req),
    title: req.body.title,
    body: req.body.body,
    stage: req.body.stage,
    approvedBy: req.user.id,
    visibleToFamily: req.body.visibleToFamily !== false,
  });
  res.json({ success: true, data: row });
});

// ── One-touch Clinical Call ────────────────────────────────────────────────────
router.post('/call/:patientId/token', ...clinical, async (req, res) => {
  const data = await careos.createPatientCallToken({
    patientId: pid(req),
    userId: req.user.id,
    userName: req.user.name || req.user.email,
    role: req.body.role || 'clinician',
  });
  res.json({ success: true, data });
});

export default router;
