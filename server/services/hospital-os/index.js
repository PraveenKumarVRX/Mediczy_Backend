import { hospitalCopilotChat, getCapabilities } from './hospital-copilot.service.js';
import { publishEvent, listEvents } from './hospital-events.service.js';
import { createApproval, listApprovals, reviewApproval } from './approval-inbox.service.js';
import { buildPatientSubgraph, queryGraph, searchNodes } from './knowledge-graph.service.js';
import { syncPatientTwin, getPatientTwin } from './patient-twin.service.js';
import { syncHospitalTwin, runHospitalSimulation, listScenarios } from './hospital-twin-simulator.service.js';
import { simulateClinicalScenario } from './what-if-simulator.service.js';
import { generateShiftHandover } from './nurse-handover.service.js';
import { getAIRecommendations } from './command-center-ai.service.js';
import { translateClinical, translateDocument, listLanguages } from './translator.service.js';
import { draftLabOrderFromVoice, draftImagingOrderFromVoice, draftTeamNotification } from './voice-commands.service.js';
import { forecastED } from './ed-forecast.service.js';
import { optimizeJourney, suggestEarlierOTSlot } from './journey-optimizer.service.js';
import { analyzeWorkforce } from './workforce-ai.service.js';
import { matchClinicalTrials, detectEmergingPatterns, generateResearchBriefing } from './research-hub.service.js';
import { routeAmbientDocument, synthesizeAmbientNote, getAmbientPipelineStatus } from './ambient-documentation.service.js';
import { summarizeRadiology, summarizeLabTrends, summarizeBillingAccount } from './department-agents.service.js';

export {
  hospitalCopilotChat,
  getCapabilities,
  publishEvent,
  listEvents,
  createApproval,
  listApprovals,
  reviewApproval,
  buildPatientSubgraph,
  queryGraph,
  searchNodes,
  syncPatientTwin,
  getPatientTwin,
  syncHospitalTwin,
  runHospitalSimulation,
  listScenarios,
  simulateClinicalScenario,
  generateShiftHandover,
  getAIRecommendations,
  translateClinical,
  translateDocument,
  listLanguages,
  draftLabOrderFromVoice,
  draftImagingOrderFromVoice,
  draftTeamNotification,
  forecastED,
  optimizeJourney,
  suggestEarlierOTSlot,
  analyzeWorkforce,
  matchClinicalTrials,
  detectEmergingPatterns,
  generateResearchBriefing,
  routeAmbientDocument,
  synthesizeAmbientNote,
  getAmbientPipelineStatus,
  summarizeRadiology,
  summarizeLabTrends,
  summarizeBillingAccount,
};

export default {
  hospitalCopilotChat,
  getCapabilities,
  publishEvent,
  listEvents,
  createApproval,
  listApprovals,
  reviewApproval,
  buildPatientSubgraph,
  queryGraph,
  searchNodes,
  syncPatientTwin,
  getPatientTwin,
  syncHospitalTwin,
  runHospitalSimulation,
  listScenarios,
  simulateClinicalScenario,
  generateShiftHandover,
  getAIRecommendations,
  translateClinical,
  translateDocument,
  listLanguages,
  draftLabOrderFromVoice,
  draftImagingOrderFromVoice,
  draftTeamNotification,
  forecastED,
  optimizeJourney,
  suggestEarlierOTSlot,
  analyzeWorkforce,
  matchClinicalTrials,
  detectEmergingPatterns,
  generateResearchBriefing,
  routeAmbientDocument,
  synthesizeAmbientNote,
  getAmbientPipelineStatus,
  summarizeRadiology,
  summarizeLabTrends,
  summarizeBillingAccount,
};
