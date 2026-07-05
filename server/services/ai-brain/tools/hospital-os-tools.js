/**
 * Hospital OS — AI Brain tools for unified copilot
 */
import { register } from './index.js';
import {
  getPatientTwin,
  syncHospitalTwin,
  runHospitalSimulation,
  getAIRecommendations,
  generateShiftHandover,
  buildPatientSubgraph,
  queryGraph,
  listApprovals,
  forecastED,
  optimizeJourney,
  matchClinicalTrials,
} from '../../hospital-os/index.js';
import { getPatientWorkspace, toPatientSummary } from '../../clinical-workspace.service.js';

register({
  name: 'get_patient_workspace_summary',
  description: 'Get unified inpatient/clinical workspace summary for a patient',
  category: 'hospital_os',
  parameters: {
    type: 'object',
    properties: {
      patientId: { type: 'integer', description: 'Patient ID' },
      organizationId: { type: 'integer', description: 'Hospital organization ID' },
    },
    required: ['patientId'],
  },
  async execute(params, context) {
    const orgId = params.organizationId || context.organizationId || 1;
    const ws = await getPatientWorkspace(params.patientId, orgId);
    return { success: true, summary: toPatientSummary(ws) };
  },
});

register({
  name: 'get_patient_digital_twin',
  description: 'Get patient digital twin with risk and aggregated clinical state',
  category: 'hospital_os',
  parameters: {
    type: 'object',
    properties: {
      patientId: { type: 'integer' },
      organizationId: { type: 'integer' },
    },
    required: ['patientId'],
  },
  async execute(params, context) {
    const orgId = params.organizationId || context.organizationId || 1;
    const twin = await getPatientTwin(params.patientId, orgId);
    return { success: true, twin };
  },
});

register({
  name: 'get_command_center_ai_recommendations',
  description: 'Get AI operational recommendations for hospital command center',
  category: 'hospital_os',
  parameters: {
    type: 'object',
    properties: { organizationId: { type: 'integer' } },
  },
  async execute(params, context) {
    const orgId = params.organizationId || context.organizationId || 1;
    return await getAIRecommendations(orgId);
  },
});

register({
  name: 'generate_nurse_handover',
  description: 'Generate AI nursing shift handover brief in SBAR format',
  category: 'hospital_os',
  parameters: {
    type: 'object',
    properties: {
      organizationId: { type: 'integer' },
      wardId: { type: 'integer' },
      shift: { type: 'string', enum: ['day', 'evening', 'night'] },
    },
  },
  async execute(params, context) {
    const orgId = params.organizationId || context.organizationId || 1;
    return await generateShiftHandover({ wardId: params.wardId, organizationId: orgId, shift: params.shift || 'day' });
  },
});

register({
  name: 'run_hospital_whatif_simulation',
  description: 'Run hospital operational what-if simulation (ED surge, OT closure, ICU overflow)',
  category: 'hospital_os',
  parameters: {
    type: 'object',
    properties: {
      organizationId: { type: 'integer' },
      scenarioKey: { type: 'string', enum: ['ed_surge_20pct', 'close_ot_room', 'icu_overflow'] },
    },
    required: ['scenarioKey'],
  },
  async execute(params, context) {
    const orgId = params.organizationId || context.organizationId || 1;
    return await runHospitalSimulation({
      organizationId: orgId,
      scenarioKey: params.scenarioKey,
      userId: context.userId,
    });
  },
});

register({
  name: 'build_patient_knowledge_graph',
  description: 'Build semantic knowledge graph subgraph for a patient',
  category: 'hospital_os',
  parameters: {
    type: 'object',
    properties: {
      patientId: { type: 'integer' },
      organizationId: { type: 'integer' },
    },
    required: ['patientId'],
  },
  async execute(params, context) {
    const orgId = params.organizationId || context.organizationId || 1;
    return await buildPatientSubgraph(params.patientId, orgId);
  },
});

register({
  name: 'get_pending_approvals',
  description: 'List pending items in clinician approval inbox',
  category: 'hospital_os',
  parameters: {
    type: 'object',
    properties: {
      patientId: { type: 'integer' },
      limit: { type: 'integer' },
    },
  },
  async execute(params) {
    return await listApprovals({ status: 'pending', patientId: params.patientId, limit: params.limit || 20 });
  },
});

register({
  name: 'forecast_ed_demand',
  description: 'Predict ED patient volume and resource demand for next hours',
  category: 'hospital_os',
  parameters: {
    type: 'object',
    properties: {
      organizationId: { type: 'integer' },
      hoursAhead: { type: 'integer' },
    },
  },
  async execute(params, context) {
    const orgId = params.organizationId || context.organizationId || 1;
    return await forecastED({ organizationId: orgId, hoursAhead: params.hoursAhead || 8 });
  },
});

register({
  name: 'optimize_patient_journey',
  description: 'Generate hyper-personalized patient journey plan',
  category: 'hospital_os',
  parameters: {
    type: 'object',
    properties: {
      patientId: { type: 'integer' },
      organizationId: { type: 'integer' },
      goals: { type: 'array', items: { type: 'string' } },
    },
    required: ['patientId'],
  },
  async execute(params, context) {
    const orgId = params.organizationId || context.organizationId || 1;
    return await optimizeJourney({ patientId: params.patientId, organizationId: orgId, goals: params.goals || [] });
  },
});

register({
  name: 'match_patient_clinical_trials',
  description: 'Find eligible clinical trials for patient (governed research hub)',
  category: 'hospital_os',
  parameters: {
    type: 'object',
    properties: {
      patientId: { type: 'integer' },
      organizationId: { type: 'integer' },
    },
    required: ['patientId'],
  },
  async execute(params, context) {
    const orgId = params.organizationId || context.organizationId || 1;
    return await matchClinicalTrials({ patientId: params.patientId, organizationId: orgId });
  },
});

register({
  name: 'sync_hospital_digital_twin',
  description: 'Sync live hospital operational digital twin snapshot',
  category: 'hospital_os',
  parameters: {
    type: 'object',
    properties: { organizationId: { type: 'integer' } },
  },
  async execute(params, context) {
    const orgId = params.organizationId || context.organizationId || 1;
    return await syncHospitalTwin(orgId);
  },
});

console.log('[ToolRegistry] Hospital OS tools registered');
