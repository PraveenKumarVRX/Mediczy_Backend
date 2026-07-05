import api from '@/lib/api';

export async function getCareOSHealth() {
  const res = await api.get('/v3/healthos/health');
  return res.data;
}

export async function getLivingWorkspace(patientId: number, admissionId?: number) {
  const res = await api.get(`/v3/healthos/workspace/${patientId}`, {
    params: admissionId ? { admissionId } : undefined,
  });
  return res.data;
}

export async function getClinicalTimeline(patientId: number, params?: { search?: string; eventType?: string; limit?: number }) {
  const res = await api.get(`/v3/healthos/timeline/${patientId}`, { params });
  return res.data;
}

export async function appendTimelineEvent(patientId: number, body: {
  eventType: string;
  title: string;
  body?: string;
  severity?: string;
  metadata?: Record<string, unknown>;
}) {
  const res = await api.post(`/v3/healthos/timeline/${patientId}/events`, body);
  return res.data;
}

export async function getCareTeam(patientId: number) {
  const res = await api.get(`/v3/healthos/teams/${patientId}`);
  return res.data;
}

export async function autoInviteMDT(patientId: number, diagnosis: string) {
  const res = await api.post(`/v3/healthos/teams/${patientId}/auto-invite`, { diagnosis });
  return res.data;
}

export async function listCareTasks(patientId: number, status?: string) {
  const res = await api.get(`/v3/healthos/tasks/${patientId}`, { params: status ? { status } : undefined });
  return res.data;
}

export async function createCareTask(patientId: number, body: { title: string; ownerRole?: string; priority?: string }) {
  const res = await api.post(`/v3/healthos/tasks/${patientId}`, body);
  return res.data;
}

export async function updateCareTask(taskId: number, status: string) {
  const res = await api.patch(`/v3/healthos/tasks/${taskId}`, { status });
  return res.data;
}

export async function getTreatmentPathway(patientId: number) {
  const res = await api.get(`/v3/healthos/pathway/${patientId}`);
  return res.data;
}

export async function getCoordinatorAlerts(patientId: number) {
  const res = await api.get(`/v3/healthos/coordinator/${patientId}/alerts`);
  return res.data;
}

export async function runCoordinatorAnalysis(patientId: number) {
  const res = await api.post(`/v3/healthos/coordinator/${patientId}/analyze`);
  return res.data;
}

export async function startClinicalBoard(patientId: number, title?: string) {
  const res = await api.post('/v3/healthos/mdt/start', { patientId, title });
  return res.data;
}

export async function getMDTConsensus(sessionId: number) {
  const res = await api.get(`/v3/healthos/mdt/${sessionId}/consensus`);
  return res.data;
}

export async function getClinicalPlayback(patientId: number, hours = 48) {
  const res = await api.get(`/v3/healthos/playback/${patientId}`, { params: { hours } });
  return res.data;
}

export async function getSimilarCases(patientId: number, presentation?: string) {
  const res = await api.get(`/v3/healthos/memory/similar/${patientId}`, { params: presentation ? { presentation } : undefined });
  return res.data;
}

export async function getClinicalCallToken(patientId: number) {
  const res = await api.post(`/v3/healthos/call/${patientId}/token`);
  return res.data;
}

// ── Ecosystem APIs ───────────────────────────────────────────────────────────

export async function getMedicalPassport(patientId: number) {
  const res = await api.get(`/v3/healthos/ecosystem/passport/${patientId}`);
  return res.data;
}

export async function shareMedicalPassport(patientId: number, body: {
  sharedWithOrgId?: number;
  purpose?: string;
  expiresInHours?: number;
}) {
  const res = await api.post(`/v3/healthos/ecosystem/passport/${patientId}/share`, body);
  return res.data;
}

export async function getCareIdentity() {
  const res = await api.get('/v3/healthos/ecosystem/identity/me');
  return res.data;
}

export async function getCareGraph(patientId: number) {
  const res = await api.get(`/v3/healthos/ecosystem/graph/${patientId}`);
  return res.data;
}

export async function getFederationStatus() {
  const res = await api.get('/v3/healthos/ecosystem/federation/status');
  return res.data;
}

export async function listNetworkOrgs(params?: { country?: string; type?: string }) {
  const res = await api.get('/v3/healthos/ecosystem/network/orgs', { params });
  return res.data;
}

export async function startGlobalClinicalBoard(body: {
  patientId: number;
  title?: string;
  invitedOrgIds?: number[];
  languages?: string[];
}) {
  const res = await api.post('/v3/healthos/ecosystem/global-board/start', body);
  return res.data;
}

export async function translateClinical(text: string, sourceLang: string, targetLang: string) {
  const res = await api.post('/v3/healthos/ecosystem/translate', { text, sourceLang, targetLang });
  return res.data;
}

// ── Platform (all phases) ──────────────────────────────────────────────────────

export async function getPlatformStatus() {
  const res = await api.get('/v3/healthos/platform/status');
  return res.data;
}

export async function listLabResults(patientId: number) {
  const res = await api.get(`/v3/healthos/expand/labs/${patientId}`);
  return res.data;
}

export async function listPharmacyOrders(patientId: number) {
  const res = await api.get(`/v3/healthos/expand/pharmacy/${patientId}`);
  return res.data;
}

export async function getMonitoringSummary(patientId: number) {
  const res = await api.get(`/v3/healthos/expand/monitoring/${patientId}`);
  return res.data;
}

export async function listReferrals(params?: Record<string, string>) {
  const res = await api.get('/v3/healthos/network/referrals', { params });
  return res.data;
}

export async function listNetworkSignals() {
  const res = await api.get('/v3/healthos/network/signals');
  return res.data;
}

export async function listMarketplaceApps(category?: string) {
  const res = await api.get('/v3/healthos/platform/marketplace', { params: category ? { category } : undefined });
  return res.data;
}

export async function getGovernmentDashboard(region?: string) {
  const res = await api.get('/v3/healthos/platform/government/dashboard', { params: region ? { region } : undefined });
  return res.data;
}

export async function getEmergencySummary() {
  const res = await api.get('/v3/healthos/platform/emergency/summary');
  return res.data;
}

export async function getPopulationDashboard() {
  const res = await api.get('/v3/healthos/platform/analytics/population');
  return res.data;
}

export async function matchTrials(patientId: number) {
  const res = await api.get(`/v3/healthos/platform/research/match/${patientId}`);
  return res.data;
}

export async function syncFhirLabs(patientId: number) {
  const res = await api.post(`/v3/healthos/expand/labs/${patientId}/sync-fhir`);
  return res.data;
}

export async function createReferral(body: { fromOrgId: number; toOrgId: number; patientId: number; reason: string; urgency?: string; clinicalSummary?: string }) {
  const res = await api.post('/v3/healthos/network/referrals', body);
  return res.data;
}

export async function acceptReferral(id: number) {
  const res = await api.post(`/v3/healthos/network/referrals/${id}/accept`);
  return res.data;
}

export async function shareDocument(body: Record<string, unknown>) {
  const res = await api.post('/v3/healthos/network/documents', body);
  return res.data;
}

export async function detectNetworkSignals() {
  const res = await api.post('/v3/healthos/network/signals/detect');
  return res.data;
}

export async function resolveSignal(id: number) {
  const res = await api.post(`/v3/healthos/network/signals/${id}/resolve`);
  return res.data;
}

export async function installMarketplaceApp(appId: number) {
  const res = await api.post('/v3/healthos/platform/marketplace/install', { appId });
  return res.data;
}

export async function listInstalledApps() {
  const res = await api.get('/v3/healthos/platform/marketplace/installed');
  return res.data;
}

export async function createApiKey(name: string, scopes?: string[]) {
  const res = await api.post('/v3/healthos/platform/developer/keys', { name, scopes });
  return res.data;
}

export async function listApiKeys() {
  const res = await api.get('/v3/healthos/platform/developer/keys');
  return res.data;
}

export async function registerWebhook(url: string, events: string[]) {
  const res = await api.post('/v3/healthos/platform/developer/webhooks', { url, events });
  return res.data;
}

export async function listWebhooks() {
  const res = await api.get('/v3/healthos/platform/developer/webhooks');
  return res.data;
}

export async function revokeApiKey(keyId: number) {
  const res = await api.delete(`/v3/healthos/platform/developer/keys/${keyId}`);
  return res.data;
}

export async function publishFamilyUpdate(patientId: number, body: { title: string; body: string; stage?: string; visibleToFamily?: boolean }) {
  const res = await api.post(`/v3/healthos/family/${patientId}/updates`, body);
  return res.data;
}

export async function listFamilyUpdates(patientId: number, family = false) {
  const res = await api.get(`/v3/healthos/family/${patientId}/updates`, { params: family ? { family: 'true' } : undefined });
  return res.data;
}

export async function recordMDTOpinion(sessionId: number, body: { specialistRole: string; opinion: string; recommendation?: string }) {
  const res = await api.post(`/v3/healthos/mdt/${sessionId}/opinion`, body);
  return res.data;
}

export async function joinMDT(sessionId: number, role?: string) {
  const res = await api.post(`/v3/healthos/mdt/${sessionId}/join`, { role });
  return res.data;
}

export async function joinGlobalBoard(sessionId: number, body?: { role?: string; languagePreference?: string }) {
  const res = await api.post(`/v3/healthos/ecosystem/global-board/${sessionId}/join`, body || {});
  return res.data;
}

export async function listClinicalTrials(condition?: string) {
  const res = await api.get('/v3/healthos/platform/research/trials', { params: condition ? { condition } : undefined });
  return res.data;
}

export async function getPassportByToken(token: string) {
  const res = await api.get(`/v3/healthos/ecosystem/passport/access/${token}`);
  return res.data;
}

export async function scheduleHomecareVisit(patientId: number, body: Record<string, unknown>) {
  const res = await api.post(`/v3/healthos/expand/homecare/${patientId}`, body);
  return res.data;
}

export async function createPharmacyOrder(patientId: number, body: { drugName: string; dose?: string; pharmacyName?: string }) {
  const res = await api.post(`/v3/healthos/expand/pharmacy/${patientId}`, body);
  return res.data;
}

export async function listPatientImaging(patientId: number) {
  const res = await api.get(`/v3/healthos/expand/imaging/${patientId}`);
  return res.data;
}

export async function getImagingStudy(studyUID: string) {
  const res = await api.get(`/v3/healthos/expand/imaging/study/${studyUID}`);
  return res.data;
}

export async function getFederationGatewayStatus() {
  const res = await api.get('/v3/healthos/ecosystem/federation/gateway/status');
  return res.data;
}

export async function proxyFhirToOrg(body: {
  fromOrgNetworkId: number;
  toOrgNetworkId: number;
  fhirPath: string;
  method?: string;
  body?: unknown;
  patientId?: number;
}) {
  const res = await api.post('/v3/healthos/ecosystem/federation/gateway/proxy', body);
  return res.data;
}
