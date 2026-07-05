/**
 * CareOS — Living Patient Workspace (aggregate view)
 */
import { getPatientWorkspace } from '../clinical-workspace.service.js';
import { getClinicalTimeline } from './clinical-timeline.service.js';
import { getOrCreateCareTeam } from './care-team.service.js';
import { getPathway } from './treatment-pathway.service.js';
import { listCoordinatorAlerts } from './clinical-coordinator.service.js';
import { listTasks } from './task-management.service.js';
import { findSimilarCases } from './hospital-memory.service.js';
import { listFamilyUpdates } from './family-portal.service.js';
import { getOrSyncPassport } from './medical-passport.service.js';
import { getPatientSubgraph } from './care-graph.service.js';
import { getFederationStatus } from './care-federation.service.js';

export async function getLivingWorkspace(patientId, organizationId, { admissionId, timelineLimit = 50 } = {}) {
  const clinical = await getPatientWorkspace(patientId, organizationId).catch(() => null);
  const diagnosisHint = clinical?.activeAdmission?.diagnosis || clinical?.admission?.diagnosis || '';

  const [timeline, careTeam, pathway, coordinatorAlerts, tasks, similarCases, familyUpdates, passport, careGraph, federation] = await Promise.all([
    getClinicalTimeline(patientId, { organizationId, limit: timelineLimit }),
    getOrCreateCareTeam(patientId, organizationId, admissionId),
    getPathway(patientId, organizationId, admissionId),
    listCoordinatorAlerts(patientId, organizationId),
    listTasks(patientId, { organizationId }),
    findSimilarCases(patientId, organizationId, diagnosisHint),
    listFamilyUpdates(patientId, { familyVisibleOnly: false }),
    getOrSyncPassport(patientId, organizationId).catch(() => null),
    getPatientSubgraph(patientId, organizationId).catch(() => null),
    getFederationStatus(organizationId).catch(() => null),
  ]);

  const diagnosis = diagnosisHint;

  return {
    product: 'Mediqzy',
    platform: 'Mediqzy CareOS',
    tagline: 'The AI-Native Healthcare Operating System for Hospitals, Health Systems, and Cross-Border Care.',
    positioning: 'Living Patient Workspace',
    patientId,
    organizationId,
    patient: clinical?.patient || null,
    admission: clinical?.activeAdmission || clinical?.admission || null,
    vitals: clinical?.vitals || [],
    medications: clinical?.medications || [],
    alerts: clinical?.alerts || [],
    sections: {
      timeline: { count: timeline.length, events: timeline },
      liveVitals: clinical?.vitalsDisplay || clinical?.vitals || [],
      labs: clinical?.pendingOrders || clinical?.labs || [],
      imaging: clinical?.imaging || [],
      ai: { coordinatorAlerts, similarCases },
      specialists: careTeam.members.filter((m) => /consultant|specialist|cardiologist|neurologist/i.test(m.role)),
      nurses: careTeam.members.filter((m) => /nurse/i.test(m.role)),
      pharmacy: careTeam.members.filter((m) => /pharmacist/i.test(m.role)),
      procedures: clinical?.procedures || [],
      tasks,
      familyUpdates: familyUpdates.filter((u) => u.visible_to_family),
    },
    careTeam,
    pathway,
    diagnosis,
    medicalPassport: passport,
    careGraph,
    federation,
    refreshedAt: new Date().toISOString(),
  };
}

export default { getLivingWorkspace };
