/**
 * Hospital OS — AI Brain tools for unified copilot
 *
 * Security fix (2026-09-18): organizationId must come ONLY from the
 * authenticated request context, never from an LLM-suppliable tool-call
 * argument. Previously every tool resolved
 * `orgId = params.organizationId || context.organizationId || 1`, which
 * let organizationId be steered by the LLM (prompt-injectable) or silently
 * default to org 1 — a cross-tenant PHI exposure. Tools now read
 * `context.organizationId` exclusively and fail closed if it's missing.
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

const NO_ORG_CONTEXT = { success: false, error: 'Organization context missing from the authenticated session — cannot execute this tool.' };

register({
  name: 'get_patient_workspace_summary',
  description: 'Get unified inpatient/clinical workspace summary for a patient',
  category: 'hospital_os',
  parameters: {
    type: 'object',
    properties: {
      patientId: { type: 'integer', description: 'Patient ID' },
    },
    required: ['patientId'],
  },
  async execute(params, context) {
    if (!context.organizationId) return NO_ORG_CONTEXT;
    const ws = await getPatientWorkspace(params.patientId, context.organizationId);
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
    },
    required: ['patientId'],
  },
  async execute(params, context) {
    if (!context.organizationId) return NO_ORG_CONTEXT;
    const twin = await getPatientTwin(params.patientId, context.organizationId);
    return { success: true, twin };
  },
});

register({
  name: 'get_command_center_ai_recommendations',
  description: 'Get AI operational recommendations for hospital command center',
  category: 'hospital_os',
  parameters: { type: 'object', properties: {} },
  async execute(params, context) {
    if (!context.organizationId) return NO_ORG_CONTEXT;
    return await getAIRecommendations(context.organizationId);
  },
});

register({
  name: 'generate_nurse_handover',
  description: 'Generate AI nursing shift handover brief in SBAR format',
  category: 'hospital_os',
  parameters: {
    type: 'object',
    properties: {
      wardId: { type: 'integer' },
      shift: { type: 'string', enum: ['day', 'evening', 'night'] },
    },
  },
  async execute(params, context) {
    if (!context.organizationId) return NO_ORG_CONTEXT;
    return await generateShiftHandover({ wardId: params.wardId, organizationId: context.organizationId, shift: params.shift || 'day' });
  },
});

register({
  name: 'run_hospital_whatif_simulation',
  description: 'Run hospital operational what-if simulation (ED surge, OT closure, ICU overflow)',
  category: 'hospital_os',
  parameters: {
    type: 'object',
    properties: {
      scenarioKey: { type: 'string', enum: ['ed_surge_20pct', 'close_ot_room', 'icu_overflow'] },
    },
    required: ['scenarioKey'],
  },
  async execute(params, context) {
    if (!context.organizationId) return NO_ORG_CONTEXT;
    return await runHospitalSimulation({
      organizationId: context.organizationId,
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
    },
    required: ['patientId'],
  },
  async execute(params, context) {
    if (!context.organizationId) return NO_ORG_CONTEXT;
    return await buildPatientSubgraph(params.patientId, context.organizationId);
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
      hoursAhead: { type: 'integer' },
    },
  },
  async execute(params, context) {
    if (!context.organizationId) return NO_ORG_CONTEXT;
    return await forecastED({ organizationId: context.organizationId, hoursAhead: params.hoursAhead || 8 });
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
      goals: { type: 'array', items: { type: 'string' } },
    },
    required: ['patientId'],
  },
  async execute(params, context) {
    if (!context.organizationId) return NO_ORG_CONTEXT;
    return await optimizeJourney({ patientId: params.patientId, organizationId: context.organizationId, goals: params.goals || [] });
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
    },
    required: ['patientId'],
  },
  async execute(params, context) {
    if (!context.organizationId) return NO_ORG_CONTEXT;
    return await matchClinicalTrials({ patientId: params.patientId, organizationId: context.organizationId });
  },
});

register({
  name: 'sync_hospital_digital_twin',
  description: 'Sync live hospital operational digital twin snapshot',
  category: 'hospital_os',
  parameters: { type: 'object', properties: {} },
  async execute(params, context) {
    if (!context.organizationId) return NO_ORG_CONTEXT;
    return await syncHospitalTwin(context.organizationId);
  },
});

console.log('[ToolRegistry] Hospital OS tools registered');
