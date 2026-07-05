import { appendClinicalEvent, getClinicalTimeline } from './clinical-timeline.service.js';
import { getOrCreateCareTeam, addTeamMember, autoInviteSpecialists } from './care-team.service.js';
import { analyzePatient, listCoordinatorAlerts } from './clinical-coordinator.service.js';
import { getPathway, updatePathway } from './treatment-pathway.service.js';
import { startClinicalBoard, joinClinicalBoard, recordOpinion, getAIConsensus } from './mdt-board.service.js';
import { buildClinicalPlayback } from './clinical-playback.service.js';
import { findSimilarCases, archiveCase } from './hospital-memory.service.js';
import { listFamilyUpdates, publishFamilyUpdate } from './family-portal.service.js';
import { createPatientCallToken } from './one-touch-call.service.js';
import { listTasks, createTask, updateTaskStatus } from './task-management.service.js';
import { getLivingWorkspace } from './living-patient-workspace.service.js';
import { getPatientSubgraph, seedPatientGraph } from './care-graph.service.js';
import { getOrCreateProfessionalIdentity, addAffiliation } from './care-identity.service.js';
import { getOrSyncPassport, updatePassport, sharePassport, getPassportByShareToken } from './medical-passport.service.js';
import { registerNetworkOrg, listNetworkOrgs, proposeTrust, getFederationStatus } from './care-federation.service.js';
import { startGlobalClinicalBoard, joinGlobalSession, translateClinicalMessage } from './global-collaboration.service.js';

export function getCareOSCapabilities() {
  return {
    product: 'Mediqzy',
    platform: 'Mediqzy CareOS',
    tagline: 'The AI-Native Healthcare Operating System for Hospitals, Health Systems, and Cross-Border Care.',
    vision: 'system_of_intelligence_and_collaboration',
    stage: 1,
    roadmap: ['land', 'expand', 'network', 'platform'],
    pillars: [
      'care_workspace',
      'care_ai',
      'care_graph',
      'care_identity',
      'care_cloud',
      'care_video',
      'care_monitoring',
      'care_analytics',
      'care_marketplace',
      'care_research',
      'care_education',
      'care_finance',
      'care_command',
      'care_government',
      'care_home',
    ],
    features: [
      'living_patient_workspace',
      'clinical_timeline',
      'dynamic_care_teams',
      'ai_clinical_coordinator',
      'living_treatment_pathway',
      'instant_mdt_board',
      'clinical_playback',
      'hospital_memory',
      'family_portal',
      'one_touch_clinical_call',
      'task_management',
      'medical_passport',
      'care_graph',
      'care_identity',
      'federation_trust',
      'global_clinical_board',
      'clinical_translation',
    ],
  };
}

export {
  appendClinicalEvent,
  getClinicalTimeline,
  getOrCreateCareTeam,
  addTeamMember,
  autoInviteSpecialists,
  analyzePatient,
  listCoordinatorAlerts,
  getPathway,
  updatePathway,
  startClinicalBoard,
  joinClinicalBoard,
  recordOpinion,
  getAIConsensus,
  buildClinicalPlayback,
  findSimilarCases,
  archiveCase,
  listFamilyUpdates,
  publishFamilyUpdate,
  createPatientCallToken,
  listTasks,
  createTask,
  updateTaskStatus,
  getLivingWorkspace,
  getPatientSubgraph,
  seedPatientGraph,
  getOrCreateProfessionalIdentity,
  addAffiliation,
  getOrSyncPassport,
  updatePassport,
  sharePassport,
  getPassportByShareToken,
  registerNetworkOrg,
  listNetworkOrgs,
  proposeTrust,
  getFederationStatus,
  startGlobalClinicalBoard,
  joinGlobalSession,
  translateClinicalMessage,
};

export default {
  getCareOSCapabilities,
  appendClinicalEvent,
  getClinicalTimeline,
  getOrCreateCareTeam,
  addTeamMember,
  autoInviteSpecialists,
  analyzePatient,
  listCoordinatorAlerts,
  getPathway,
  updatePathway,
  startClinicalBoard,
  joinClinicalBoard,
  recordOpinion,
  getAIConsensus,
  buildClinicalPlayback,
  findSimilarCases,
  archiveCase,
  listFamilyUpdates,
  publishFamilyUpdate,
  createPatientCallToken,
  listTasks,
  createTask,
  updateTaskStatus,
  getLivingWorkspace,
  getPatientSubgraph,
  seedPatientGraph,
  getOrCreateProfessionalIdentity,
  addAffiliation,
  getOrSyncPassport,
  updatePassport,
  sharePassport,
  getPassportByShareToken,
  registerNetworkOrg,
  listNetworkOrgs,
  proposeTrust,
  getFederationStatus,
  startGlobalClinicalBoard,
  joinGlobalSession,
  translateClinicalMessage,
};
