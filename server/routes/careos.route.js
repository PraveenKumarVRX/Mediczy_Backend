/**
 * Mediqzy HealthOS — API routes
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

// ── Ecosystem: Medical Passport ────────────────────────────────────────────────
router.get('/ecosystem/passport/:patientId', ...clinical, async (req, res) => {
  const data = await careos.getOrSyncPassport(pid(req), orgId(req));
  res.json({ success: true, data });
});

router.put('/ecosystem/passport/:patientId', ...doctorOnly, async (req, res) => {
  const data = await careos.updatePassport(pid(req), { ...req.body, organizationId: orgId(req) });
  res.json({ success: true, data });
});

router.post('/ecosystem/passport/:patientId/share', ...doctorOnly, async (req, res) => {
  const passport = await careos.getOrSyncPassport(pid(req), orgId(req));
  const data = await careos.sharePassport({
    passportId: passport.id,
    sharedWithOrgId: req.body.sharedWithOrgId,
    sharedWithUserId: req.body.sharedWithUserId,
    purpose: req.body.purpose || 'second_opinion',
    scopes: req.body.scopes,
    grantedBy: req.user.id,
    expiresInHours: req.body.expiresInHours,
  });
  res.json({ success: true, data });
});

router.get('/ecosystem/passport/access/:token', authUser, async (req, res) => {
  const data = await careos.getPassportByShareToken(req.params.token);
  if (!data) return res.status(404).json({ success: false, error: 'Invalid or expired share token' });
  res.json({ success: true, data });
});

// ── Ecosystem: Care Identity ───────────────────────────────────────────────────
router.get('/ecosystem/identity/me', ...clinical, async (req, res) => {
  const data = await careos.getOrCreateProfessionalIdentity(req.user.id, {
    displayName: req.user.name || req.user.email,
  });
  res.json({ success: true, data });
});

router.post('/ecosystem/identity/affiliations', ...clinical, async (req, res) => {
  const data = await careos.addAffiliation({
    userId: req.user.id,
    organizationId: req.body.organizationId || orgId(req),
    orgNetworkId: req.body.orgNetworkId,
    role: req.body.role,
    department: req.body.department,
  });
  res.json({ success: true, data });
});

// ── Ecosystem: Care Graph ──────────────────────────────────────────────────────
router.get('/ecosystem/graph/:patientId', ...clinical, async (req, res) => {
  const data = await careos.getPatientSubgraph(pid(req), orgId(req));
  res.json({ success: true, data });
});

router.post('/ecosystem/graph/:patientId/seed', ...clinical, async (req, res) => {
  const data = await careos.seedPatientGraph(pid(req), orgId(req), req.body);
  res.json({ success: true, data });
});

// ── Ecosystem: Federation ──────────────────────────────────────────────────────
router.get('/ecosystem/federation/status', ...clinical, async (req, res) => {
  const data = await careos.getFederationStatus(orgId(req));
  res.json({ success: true, data });
});

router.get('/ecosystem/network/orgs', ...clinical, async (req, res) => {
  const data = await careos.listNetworkOrgs({
    countryCode: req.query.country,
    orgType: req.query.type,
  });
  res.json({ success: true, data });
});

router.post('/ecosystem/network/orgs', ...doctorOnly, async (req, res) => {
  const data = await careos.registerNetworkOrg({
    organizationId: orgId(req),
    displayName: req.body.displayName,
    countryCode: req.body.countryCode,
    orgType: req.body.orgType,
    fhirEndpoint: req.body.fhirEndpoint,
    capabilities: req.body.capabilities,
  });
  res.json({ success: true, data });
});

router.post('/ecosystem/federation/trust', ...doctorOnly, async (req, res) => {
  const data = await careos.proposeTrust({
    orgAId: req.body.orgAId,
    orgBId: req.body.orgBId,
    trustLevel: req.body.trustLevel,
    purposes: req.body.purposes,
    approvedBy: req.user.id,
  });
  res.json({ success: true, data });
});

// ── Ecosystem: Global Clinical Board ───────────────────────────────────────────
router.post('/ecosystem/global-board/start', ...doctorOnly, async (req, res) => {
  const data = await careos.startGlobalClinicalBoard({
    patientId: Number(req.body.patientId),
    organizationId: orgId(req),
    title: req.body.title,
    hostUserId: req.user.id,
    invitedOrgIds: req.body.invitedOrgIds || [],
    languages: req.body.languages || ['en'],
  });
  res.json({ success: true, data });
});

router.post('/ecosystem/global-board/:sessionId/join', ...clinical, async (req, res) => {
  const data = await careos.joinGlobalSession({
    sessionId: Number(req.params.sessionId),
    userId: req.user.id,
    orgNetworkId: req.body.orgNetworkId,
    displayName: req.user.name || req.user.email,
    role: req.body.role,
    languagePreference: req.body.languagePreference,
  });
  res.json({ success: true, data });
});

router.post('/ecosystem/translate', ...clinical, async (req, res) => {
  try {
    const data = await careos.translateClinicalMessage({
      text: req.body.text,
      sourceLang: req.body.sourceLang || 'en',
      targetLang: req.body.targetLang || 'en',
      context: req.body.context,
    });
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Platform status (all phases) ───────────────────────────────────────────────
router.get('/platform/status', ...clinical, async (req, res) => {
  const data = await careos.getPlatformStatus(orgId(req));
  res.json({ success: true, data });
});

// ── STAGE 2: Expand ────────────────────────────────────────────────────────────
router.get('/expand/labs/:patientId', ...clinical, async (req, res) => {
  res.json({ success: true, data: await careos.listLabResults(pid(req), orgId(req)) });
});
router.post('/expand/labs/:patientId', ...clinical, async (req, res) => {
  res.json({ success: true, data: await careos.ingestLabResult({ organizationId: orgId(req), patientId: pid(req), ...req.body }) });
});
router.get('/expand/pharmacy/:patientId', ...clinical, async (req, res) => {
  res.json({ success: true, data: await careos.listPharmacyOrders(pid(req), orgId(req)) });
});
router.post('/expand/pharmacy/:patientId', ...clinical, async (req, res) => {
  res.json({ success: true, data: await careos.createPharmacyOrder({ organizationId: orgId(req), patientId: pid(req), ...req.body }) });
});
router.patch('/expand/pharmacy/orders/:orderId', ...clinical, async (req, res) => {
  res.json({ success: true, data: await careos.updatePharmacyStatus(Number(req.params.orderId), req.body.status, req.body.notes) });
});
router.get('/expand/homecare/:patientId', ...clinical, async (req, res) => {
  res.json({ success: true, data: await careos.listHomecareVisits(pid(req), orgId(req)) });
});
router.post('/expand/homecare/:patientId', ...clinical, async (req, res) => {
  res.json({ success: true, data: await careos.scheduleHomecareVisit({ organizationId: orgId(req), patientId: pid(req), ...req.body }) });
});
router.get('/expand/monitoring/:patientId', ...clinical, async (req, res) => {
  res.json({ success: true, data: await careos.getMonitoringSummary(pid(req), orgId(req)) });
});
router.post('/expand/monitoring/:patientId', ...clinical, async (req, res) => {
  res.json({ success: true, data: await careos.ingestWearableReading({ organizationId: orgId(req), patientId: pid(req), ...req.body }) });
});

// ── STAGE 3: Network ───────────────────────────────────────────────────────────
router.get('/network/referrals', ...clinical, async (req, res) => {
  res.json({ success: true, data: await careos.listReferrals({ orgId: req.query.orgNetworkId ? Number(req.query.orgNetworkId) : undefined, patientId: req.query.patientId ? Number(req.query.patientId) : undefined, status: req.query.status, direction: req.query.direction }) });
});
router.post('/network/referrals', ...doctorOnly, async (req, res) => {
  res.json({ success: true, data: await careos.createReferral({ fromOrgId: req.body.fromOrgId, toOrgId: req.body.toOrgId, patientId: req.body.patientId, reason: req.body.reason, urgency: req.body.urgency, clinicalSummary: req.body.clinicalSummary, referredBy: req.user.id, passportShareId: req.body.passportShareId }) });
});
router.post('/network/referrals/:id/accept', ...doctorOnly, async (req, res) => {
  res.json({ success: true, data: await careos.acceptReferral(Number(req.params.id), req.user.id) });
});
router.get('/network/documents/:patientId', ...clinical, async (req, res) => {
  res.json({ success: true, data: await careos.listDocuments({ patientId: pid(req), referralId: req.query.referralId ? Number(req.query.referralId) : undefined, globalSessionId: req.query.sessionId ? Number(req.query.sessionId) : undefined }) });
});
router.post('/network/documents', ...doctorOnly, async (req, res) => {
  res.json({ success: true, data: await careos.shareDocument({ ...req.body, sharedByOrgId: orgId(req), sharedByUserId: req.user.id }) });
});
router.get('/network/knowledge/search', ...clinical, async (req, res) => {
  res.json({ success: true, data: await careos.searchGlobalCases(req.query.q || '') });
});
router.post('/network/knowledge/publish', ...doctorOnly, async (req, res) => {
  res.json({ success: true, data: await careos.publishGlobalCase({ organizationId: orgId(req), ...req.body }) });
});
router.get('/network/signals', ...clinical, async (req, res) => {
  res.json({ success: true, data: await careos.listNetworkSignals({ status: req.query.status }) });
});
router.post('/network/signals/detect', ...doctorOnly, async (req, res) => {
  res.json({ success: true, data: await careos.detectNetworkSignals(orgId(req)) });
});

// ── STAGE 4: Platform ────────────────────────────────────────────────────────────
router.get('/platform/marketplace', ...clinical, async (req, res) => {
  res.json({ success: true, data: await careos.listMarketplaceApps({ category: req.query.category }) });
});
router.get('/platform/marketplace/installed', ...clinical, async (req, res) => {
  res.json({ success: true, data: await careos.listInstalledApps(orgId(req)) });
});
router.post('/platform/marketplace/install', ...doctorOnly, async (req, res) => {
  res.json({ success: true, data: await careos.installApp({ organizationId: orgId(req), appId: req.body.appId, installedBy: req.user.id, config: req.body.config }) });
});
router.get('/platform/developer/keys', ...doctorOnly, async (req, res) => {
  res.json({ success: true, data: await careos.listApiKeys(orgId(req)) });
});
router.post('/platform/developer/keys', ...doctorOnly, async (req, res) => {
  res.json({ success: true, data: await careos.createApiKey({ organizationId: orgId(req), name: req.body.name, scopes: req.body.scopes, createdBy: req.user.id, expiresInDays: req.body.expiresInDays }) });
});
router.get('/platform/developer/webhooks', ...doctorOnly, async (req, res) => {
  res.json({ success: true, data: await careos.listWebhooks(orgId(req)) });
});
router.post('/platform/developer/webhooks', ...doctorOnly, async (req, res) => {
  res.json({ success: true, data: await careos.registerWebhook({ organizationId: orgId(req), url: req.body.url, events: req.body.events, createdBy: req.user.id }) });
});
router.get('/platform/research/trials', ...clinical, async (req, res) => {
  res.json({ success: true, data: await careos.listTrials({ condition: req.query.condition }) });
});
router.get('/platform/research/match/:patientId', ...clinical, async (req, res) => {
  res.json({ success: true, data: await careos.matchTrialsForPatient(pid(req), orgId(req)) });
});
router.get('/platform/analytics/population', ...clinical, async (req, res) => {
  res.json({ success: true, data: await careos.getPopulationDashboard(orgId(req)) });
});
router.post('/platform/analytics/population/compute', ...doctorOnly, async (req, res) => {
  res.json({ success: true, data: await careos.computePopulationMetrics(orgId(req)) });
});
router.get('/platform/government/dashboard', ...clinical, async (req, res) => {
  res.json({ success: true, data: await careos.getGovernmentDashboard(req.query.region) });
});
router.post('/platform/government/simulate', ...doctorOnly, async (req, res) => {
  res.json({ success: true, data: await careos.simulatePandemic(req.body) });
});
router.get('/platform/emergency/resources', ...clinical, async (req, res) => {
  res.json({ success: true, data: await careos.searchEmergencyResources({ resourceType: req.query.type, geoRegion: req.query.region }) });
});
router.get('/platform/emergency/summary', ...clinical, async (req, res) => {
  res.json({ success: true, data: await careos.getEmergencyNetworkSummary() });
});
router.post('/platform/emergency/resources', ...doctorOnly, async (req, res) => {
  res.json({ success: true, data: await careos.registerEmergencyResource({ organizationId: orgId(req), ...req.body }) });
});

export default router;
