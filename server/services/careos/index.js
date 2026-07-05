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
import { ingestLabResult, listLabResults } from './lab-connector.service.js';
import { createPharmacyOrder, updatePharmacyStatus, listPharmacyOrders } from './pharmacy-connector.service.js';
import { scheduleHomecareVisit, completeHomecareVisit, listHomecareVisits } from './home-care.service.js';
import { ingestWearableReading, listWearableReadings, getMonitoringSummary } from './wearables-monitoring.service.js';
import { createReferral, acceptReferral, listReferrals } from './referral-federation.service.js';
import { shareDocument, listDocuments, getDocumentBundle } from './document-exchange.service.js';
import { publishGlobalCase, searchGlobalCases } from './global-knowledge.service.js';
import { detectNetworkSignals, listNetworkSignals, resolveSignal } from './hospital-network-signals.service.js';
import { listMarketplaceApps, installApp, listInstalledApps } from './marketplace.service.js';
import { createApiKey, listApiKeys, registerWebhook, listWebhooks, revokeApiKey } from './developer-platform.service.js';
import { syncLabsFromFhir, syncWearablesFromAppleHealth, listPatientImagingStudies, getImagingStudy } from './healthos-integration.service.js';
import { dispatchWebhooks } from './webhook-delivery.service.js';
import { getGatewayStatus, proxyFhirToOrg } from './federation-gateway.service.js';
import { listTrials, matchTrialsForPatient, exportRWE } from './research-platform.service.js';
import { getGovernmentDashboard, submitGovernmentReport, simulatePandemic } from './government-health.service.js';
import { registerEmergencyResource, searchEmergencyResources, getEmergencyNetworkSummary } from './emergency-network.service.js';
import { computePopulationMetrics, getPopulationDashboard } from './population-analytics.service.js';
import { getPlatformStatus, getHealthOSCapabilities } from './platform-status.service.js';

export function getCareOSCapabilities() {
  return getHealthOSCapabilities();
}

export {
  getHealthOSCapabilities,
  getPlatformStatus,
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
  ingestLabResult,
  listLabResults,
  createPharmacyOrder,
  updatePharmacyStatus,
  listPharmacyOrders,
  scheduleHomecareVisit,
  completeHomecareVisit,
  listHomecareVisits,
  ingestWearableReading,
  listWearableReadings,
  getMonitoringSummary,
  createReferral,
  acceptReferral,
  listReferrals,
  shareDocument,
  listDocuments,
  getDocumentBundle,
  publishGlobalCase,
  searchGlobalCases,
  detectNetworkSignals,
  listNetworkSignals,
  resolveSignal,
  listMarketplaceApps,
  installApp,
  listInstalledApps,
  createApiKey,
  listApiKeys,
  registerWebhook,
  listWebhooks,
  listTrials,
  matchTrialsForPatient,
  exportRWE,
  getGovernmentDashboard,
  submitGovernmentReport,
  simulatePandemic,
  registerEmergencyResource,
  searchEmergencyResources,
  getEmergencyNetworkSummary,
  computePopulationMetrics,
  getPopulationDashboard,
  revokeApiKey,
  syncLabsFromFhir,
  syncWearablesFromAppleHealth,
  listPatientImagingStudies,
  getImagingStudy,
  dispatchWebhooks,
  getGatewayStatus,
  proxyFhirToOrg,
};

export default {
  getCareOSCapabilities,
  getHealthOSCapabilities,
  getPlatformStatus,
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
  ingestLabResult,
  listLabResults,
  createPharmacyOrder,
  updatePharmacyStatus,
  listPharmacyOrders,
  scheduleHomecareVisit,
  completeHomecareVisit,
  listHomecareVisits,
  ingestWearableReading,
  listWearableReadings,
  getMonitoringSummary,
  createReferral,
  acceptReferral,
  listReferrals,
  shareDocument,
  listDocuments,
  getDocumentBundle,
  publishGlobalCase,
  searchGlobalCases,
  detectNetworkSignals,
  listNetworkSignals,
  resolveSignal,
  listMarketplaceApps,
  installApp,
  listInstalledApps,
  createApiKey,
  listApiKeys,
  registerWebhook,
  listWebhooks,
  listTrials,
  matchTrialsForPatient,
  exportRWE,
  getGovernmentDashboard,
  submitGovernmentReport,
  simulatePandemic,
  registerEmergencyResource,
  searchEmergencyResources,
  getEmergencyNetworkSummary,
  computePopulationMetrics,
  getPopulationDashboard,
  revokeApiKey,
  syncLabsFromFhir,
  syncWearablesFromAppleHealth,
  listPatientImagingStudies,
  getImagingStudy,
  dispatchWebhooks,
  getGatewayStatus,
  proxyFhirToOrg,
};
