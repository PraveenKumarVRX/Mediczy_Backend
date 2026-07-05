import api from '@/lib/api';

export interface HospitalCopilotMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function hospitalCopilotChat(params: {
  message: string;
  context?: Record<string, unknown>;
  conversationHistory?: HospitalCopilotMessage[];
}) {
  const res = await api.post('/v3/hospital-os/copilot/chat', params);
  return res.data;
}

export async function getHospitalOsHealth() {
  const res = await api.get('/v3/hospital-os/health');
  return res.data;
}

export async function listApprovals(status = 'pending') {
  const res = await api.get('/v3/hospital-os/approvals', { params: { status } });
  return res.data;
}

export async function reviewApproval(id: number, action: 'approve' | 'reject', notes?: string) {
  const res = await api.post(`/v3/hospital-os/approvals/${id}/review`, { action, notes });
  return res.data;
}

export async function getPatientTwin(patientId: number) {
  const res = await api.get(`/v3/hospital-os/twins/patient/${patientId}`);
  return res.data;
}

export async function getCommandCenterAI() {
  const res = await api.get('/v3/hospital-os/command-center/ai');
  return res.data;
}

export async function runHospitalSimulation(scenarioKey: string) {
  const res = await api.post('/v3/hospital-os/simulate/hospital', { scenarioKey });
  return res.data;
}

export async function simulateClinical(params: {
  patientId: number;
  scenario: string;
  proposedChange: string;
}) {
  const res = await api.post('/v3/hospital-os/simulate/clinical', params);
  return res.data;
}

export async function generateNurseHandover(wardId?: number, shift = 'day') {
  const res = await api.post('/v3/hospital-os/nurse/handover', { wardId, shift });
  return res.data;
}

export async function translateClinical(params: {
  text: string;
  sourceLang?: string;
  targetLang: string;
  context?: string;
}) {
  const res = await api.post('/v3/hospital-os/translator', params);
  return res.data;
}

export async function forecastED(hours = 8) {
  const res = await api.get('/v3/hospital-os/ed/forecast', { params: { hours } });
  return res.data;
}

export async function optimizeJourney(patientId: number, goals: string[] = []) {
  const res = await api.post('/v3/hospital-os/journey/optimize', { patientId, goals });
  return res.data;
}

export async function listSimulationScenarios() {
  const res = await api.get('/v3/hospital-os/simulate/scenarios');
  return res.data;
}
