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

export async function getResearchBriefing(patientId: number) {
  const res = await api.get(`/v3/hospital-os/research/briefing/${patientId}`);
  return res.data;
}

export async function getRadiologySummary(patientId: number) {
  const res = await api.get(`/v3/hospital-os/radiology/${patientId}/summary`);
  return res.data;
}

export async function getLabSummary(patientId: number) {
  const res = await api.get(`/v3/hospital-os/lab/${patientId}/summary`);
  return res.data;
}

export async function getBillingSummary(patientId: number) {
  const res = await api.get(`/v3/hospital-os/billing/${patientId}/summary`);
  return res.data;
}

export async function syncPatientTwin(patientId: number) {
  const res = await api.post(`/v3/hospital-os/twins/patient/${patientId}/sync`);
  return res.data;
}

export async function getHospitalTwin() {
  const res = await api.get('/v3/hospital-os/twins/hospital');
  return res.data;
}

export async function buildKnowledgeGraph(patientId: number) {
  const res = await api.post(`/v3/hospital-os/knowledge-graph/patient/${patientId}/build`);
  return res.data;
}

export async function queryKnowledgeGraph(params: { nodeType?: string; externalId?: string }) {
  const res = await api.get('/v3/hospital-os/knowledge-graph/query', { params });
  return res.data;
}

export async function listTranslatorLanguages() {
  const res = await api.get('/v3/hospital-os/translator/languages');
  return res.data;
}

export async function analyzeWorkforce(department = 'nursing') {
  const res = await api.get('/v3/hospital-os/workforce/analysis', { params: { department } });
  return res.data;
}

export async function matchHospitalOsTrials(patientId: number) {
  const res = await api.get(`/v3/hospital-os/research/trials/${patientId}`);
  return res.data;
}

export async function detectResearchPatterns(days = 30) {
  const res = await api.get('/v3/hospital-os/research/patterns', { params: { days } });
  return res.data;
}

export async function getAmbientPipelineStatus() {
  const res = await api.get('/v3/hospital-os/ambient/status');
  return res.data;
}

export async function routeAmbientDocument(body: Record<string, unknown>) {
  const res = await api.post('/v3/hospital-os/ambient/route', body);
  return res.data;
}

export async function draftVoiceLabOrder(body: Record<string, unknown>) {
  const res = await api.post('/v3/hospital-os/voice/draft-lab-order', body);
  return res.data;
}

export async function draftVoiceImagingOrder(body: Record<string, unknown>) {
  const res = await api.post('/v3/hospital-os/voice/draft-imaging-order', body);
  return res.data;
}

export async function listHospitalOsEvents(params?: Record<string, string>) {
  const res = await api.get('/v3/hospital-os/events', { params });
  return res.data;
}
