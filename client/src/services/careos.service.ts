import api from '@/lib/api';

export async function getCareOSHealth() {
  const res = await api.get('/v3/careos/health');
  return res.data;
}

export async function getLivingWorkspace(patientId: number, admissionId?: number) {
  const res = await api.get(`/v3/careos/workspace/${patientId}`, {
    params: admissionId ? { admissionId } : undefined,
  });
  return res.data;
}

export async function getClinicalTimeline(patientId: number, params?: { search?: string; eventType?: string; limit?: number }) {
  const res = await api.get(`/v3/careos/timeline/${patientId}`, { params });
  return res.data;
}

export async function appendTimelineEvent(patientId: number, body: {
  eventType: string;
  title: string;
  body?: string;
  severity?: string;
  metadata?: Record<string, unknown>;
}) {
  const res = await api.post(`/v3/careos/timeline/${patientId}/events`, body);
  return res.data;
}

export async function getCareTeam(patientId: number) {
  const res = await api.get(`/v3/careos/teams/${patientId}`);
  return res.data;
}

export async function autoInviteMDT(patientId: number, diagnosis: string) {
  const res = await api.post(`/v3/careos/teams/${patientId}/auto-invite`, { diagnosis });
  return res.data;
}

export async function listCareTasks(patientId: number, status?: string) {
  const res = await api.get(`/v3/careos/tasks/${patientId}`, { params: status ? { status } : undefined });
  return res.data;
}

export async function createCareTask(patientId: number, body: { title: string; ownerRole?: string; priority?: string }) {
  const res = await api.post(`/v3/careos/tasks/${patientId}`, body);
  return res.data;
}

export async function updateCareTask(taskId: number, status: string) {
  const res = await api.patch(`/v3/careos/tasks/${taskId}`, { status });
  return res.data;
}

export async function getTreatmentPathway(patientId: number) {
  const res = await api.get(`/v3/careos/pathway/${patientId}`);
  return res.data;
}

export async function getCoordinatorAlerts(patientId: number) {
  const res = await api.get(`/v3/careos/coordinator/${patientId}/alerts`);
  return res.data;
}

export async function runCoordinatorAnalysis(patientId: number) {
  const res = await api.post(`/v3/careos/coordinator/${patientId}/analyze`);
  return res.data;
}

export async function startClinicalBoard(patientId: number, title?: string) {
  const res = await api.post('/v3/careos/mdt/start', { patientId, title });
  return res.data;
}

export async function getMDTConsensus(sessionId: number) {
  const res = await api.get(`/v3/careos/mdt/${sessionId}/consensus`);
  return res.data;
}

export async function getClinicalPlayback(patientId: number, hours = 48) {
  const res = await api.get(`/v3/careos/playback/${patientId}`, { params: { hours } });
  return res.data;
}

export async function getSimilarCases(patientId: number, presentation?: string) {
  const res = await api.get(`/v3/careos/memory/similar/${patientId}`, { params: presentation ? { presentation } : undefined });
  return res.data;
}

export async function getClinicalCallToken(patientId: number) {
  const res = await api.post(`/v3/careos/call/${patientId}/token`);
  return res.data;
}
