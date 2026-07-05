/**
 * Hospital OS — hospital digital twin + operational what-if simulation
 */
import { getCommandCenter } from '../analytics.service.js';
import { upsertTwin, pushObservation } from '../hypergrid-twins.service.js';
import { up as migrate } from '../../migrations/hospital-os-2035.migration.js';
import pool from '../../db/pgPool.js';

const SCENARIOS = {
  ed_surge_20pct: {
    label: 'ED surge +20% for 4 hours',
    apply: (state) => ({
      ...state,
      edWaitMinutes: Math.round((state.edWaitMinutes || 30) * 1.35),
      bedPressure: Math.min(100, (state.bedOccupancyPct || 70) + 8),
      staffingGap: (state.staffingGap || 0) + 2,
    }),
  },
  close_ot_room: {
    label: 'One OT room offline',
    apply: (state) => ({
      ...state,
      otDelayedCases: (state.otDelayedCases || 0) + 3,
      otUtilizationPct: Math.max(0, (state.otUtilizationPct || 80) - 15),
    }),
  },
  icu_overflow: {
    label: 'ICU at 95% capacity',
    apply: (state) => ({
      ...state,
      icuOccupancyPct: 95,
      transferBacklog: (state.transferBacklog || 0) + 4,
      criticalAlerts: (state.criticalAlerts || 0) + 2,
    }),
  },
};

async function captureLiveState(organizationId) {
  const cc = await getCommandCenter(organizationId);
  const beds = cc?.beds || {};
  const total = Number(beds.total) || 1;
  const occupied = Number(beds.occupied) || 0;

  return {
    bedOccupancyPct: Math.round((occupied / total) * 100),
    bedsAvailable: Number(beds.available) || 0,
    activeAdmissions: Number(cc?.admissions?.count) || 0,
    icuActive: Number(cc?.icuCensus?.active) || 0,
    otInProgress: Number(cc?.otToday?.in_progress) || 0,
    otDelayedCases: Number(cc?.otToday?.delayed) || 0,
    criticalAlerts: Number(cc?.criticalAlerts?.count) || 0,
    pendingDischarges: Number(cc?.pendingDischarges?.count) || 0,
    edWaitMinutes: 28,
    otUtilizationPct: 78,
    staffingGap: 0,
    transferBacklog: 0,
    capturedAt: new Date().toISOString(),
  };
}

export async function syncHospitalTwin(organizationId, tenantId = 'default') {
  const state = await captureLiveState(organizationId);
  const twin = await upsertTwin({
    twinType: 'hospital',
    externalId: String(organizationId),
    tenantId,
    attributes: state,
    location: 'campus',
  });
  await pushObservation({
    twinType: 'hospital',
    externalId: String(organizationId),
    tenantId,
    metric: 'ops_snapshot',
    value: state,
  });
  return { twin, state };
}

export async function runHospitalSimulation({ organizationId, scenarioKey, params = {}, userId, tenantId = 'default' }) {
  await migrate();
  const scenario = SCENARIOS[scenarioKey];
  if (!scenario) throw new Error(`Unknown scenario: ${scenarioKey}. Available: ${Object.keys(SCENARIOS).join(', ')}`);

  const baseline = await captureLiveState(organizationId);
  const projected = scenario.apply({ ...baseline, ...params });

  const recommendations = [];
  if (projected.bedPressure > 85 || projected.bedOccupancyPct > 90) {
    recommendations.push({ action: 'Open overflow ward beds', priority: 'high', tier: 'T0' });
  }
  if (projected.edWaitMinutes > 45) {
    recommendations.push({ action: 'Deploy fast-track physician to ED', priority: 'high', tier: 'T1' });
  }
  if (projected.icuOccupancyPct >= 90) {
    recommendations.push({ action: 'Pause elective admissions; escalate step-down transfers', priority: 'critical', tier: 'T1' });
  }
  if (projected.otDelayedCases > 2) {
    recommendations.push({ action: 'Reschedule non-urgent OT cases', priority: 'medium', tier: 'T1' });
  }

  const results = { baseline, projected, recommendations, scenario: scenario.label };

  const { rows } = await pool.query(
    `INSERT INTO hospital_os_simulations (tenant_id, simulation_type, scenario_key, input_params, results, created_by)
     VALUES ($1, 'hospital_ops', $2, $3::jsonb, $4::jsonb, $5) RETURNING id`,
    [tenantId, scenarioKey, JSON.stringify(params), JSON.stringify(results), userId || null]
  );

  return { simulationId: rows[0].id, ...results };
}

export function listScenarios() {
  return Object.entries(SCENARIOS).map(([key, s]) => ({ key, label: s.label }));
}

export default { syncHospitalTwin, runHospitalSimulation, listScenarios };
