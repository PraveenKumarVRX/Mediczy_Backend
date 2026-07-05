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
