/**
 * Hospital OS — patient digital twin (aggregated state + risk)
 */
import { getPatientWorkspace, toPatientSummary } from '../clinical-workspace.service.js';
import { getPatientTimeline } from '../patient-navigation.service.js';
import { upsertTwin, pushObservation, computeRisk } from '../hypergrid-twins.service.js';
import { buildPatientSubgraph } from './knowledge-graph.service.js';
import pool from '../../db/pgPool.js';

export async function syncPatientTwin(patientId, organizationId, tenantId = 'default') {
  const workspace = await getPatientWorkspace(patientId, organizationId);
  const summary = toPatientSummary(workspace);
  const timeline = await getPatientTimeline(patientId, organizationId, { limit: 30 }).catch(() => ({ events: [] }));
  const subgraph = await buildPatientSubgraph(patientId, organizationId, tenantId).catch(() => null);

  const attributes = {
    summary,
    latestVitals: workspace?.vitals?.[0] || null,
    ewsScore: workspace?.alerts?.[0]?.score || null,
    activeMeds: (workspace?.medications || []).length,
    allergies: (workspace?.allergies || []).length,
    pendingOrders: (workspace?.pendingOrders || []).length,
    timelineEvents: timeline?.events?.length || 0,
    kgEdges: subgraph?.edgeCount || 0,
    lastSyncedAt: new Date().toISOString(),
  };

  const twin = await upsertTwin({
    twinType: 'patient',
    externalId: String(patientId),
    tenantId,
    attributes,
    location: workspace?.admission?.bed ? `${workspace.admission.ward}/${workspace.admission.bed}` : null,
  });

  if (workspace?.vitals?.[0]) {
    const v = workspace.vitals[0];
    await pushObservation({
      twinType: 'patient',
      externalId: String(patientId),
      tenantId,
      metric: 'vitals_snapshot',
      value: v,
      severity: workspace?.alerts?.some((a) => a.severity === 'red') ? 'critical' : 'info',
    });
  }

  const risk = await computeRisk('patient', String(patientId), tenantId);

  return { twin, risk, attributes };
}

export async function getPatientTwin(patientId, organizationId, tenantId = 'default') {
  const synced = await syncPatientTwin(patientId, organizationId, tenantId);

  let wearableCount = 0;
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM health_data_points WHERE user_id = $1 AND recorded_at > NOW() - INTERVAL '7 days'`,
      [patientId]
    );
    wearableCount = rows[0]?.c || 0;
  } catch {
    wearableCount = 0;
  }

  return {
    ...synced,
    wearableDataPoints7d: wearableCount,
    simulatedOutcomes: [],
    disclaimer: 'Twin estimates are assistive. Clinical decisions require licensed provider review.',
  };
}

export default { syncPatientTwin, getPatientTwin };
