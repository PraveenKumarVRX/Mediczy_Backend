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

export function getCareOSCapabilities() {
  return {
    product: 'Mediqzy CareOS',
    tagline: 'AI-powered collaborative operating system for hospitals',
    phase: 1,
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
};
