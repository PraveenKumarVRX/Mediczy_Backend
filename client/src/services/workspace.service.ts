/**
 * Unified workspace API — single import for Living Patient Workspace pages.
 * Wraps careos.service.ts per Hospital OS 2035 §9.9
 */
export {
  getLivingWorkspace,
  getClinicalTimeline,
  getCareTeam,
  autoInviteMDT,
  listCareTasks,
  createCareTask,
  updateCareTask,
  getTreatmentPathway,
  getCoordinatorAlerts,
  runCoordinatorAnalysis,
  startClinicalBoard,
  getMDTConsensus,
  getClinicalPlayback,
  getSimilarCases,
  getClinicalCallToken,
  publishFamilyUpdate,
  listFamilyUpdates,
  recordMDTOpinion,
  joinMDT,
  syncFhirLabs,
  listPatientImaging,
  listLabResults,
  listPharmacyOrders,
  getMonitoringSummary,
} from '@/services/careos.service';

import api from '@/lib/api';

export async function acknowledgeCoordinatorAlert(
  patientId: number,
  alertId: number | string,
  action: 'approve' | 'dismiss' | 'modify',
  note?: string
) {
  const res = await api.post(`/v3/healthos/coordinator/${patientId}/alerts/${alertId}/ack`, {
    action,
    note,
  });
  return res.data;
}
