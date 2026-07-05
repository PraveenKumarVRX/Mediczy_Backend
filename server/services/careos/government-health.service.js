/**
 * HealthOS Stage 4 — Care Government (public health dashboards)
 */
import pool from '../../db/pgPool.js';
import { up as migrate } from '../../migrations/healthos-phases-2-4.migration.js';
import { listNetworkSignals } from './hospital-network-signals.service.js';

let ready = false;
async function ensure() { if (!ready) { await migrate(); ready = true; } }

export async function getGovernmentDashboard(region) {
  await ensure();
  const signals = await listNetworkSignals({ status: 'active', limit: 10 });
  const metrics = await pool.query(
    `SELECT metric_name, SUM(metric_value) AS total, unit FROM healthos_population_metrics
     WHERE ($1::text IS NULL OR dimensions->>'region' = $1 OR dimensions IS NULL)
     GROUP BY metric_name, unit ORDER BY metric_name`,
    [region || null]
  ).catch(() => ({ rows: [] }));

  const emergency = await pool.query(
    `SELECT resource_type, SUM(quantity_available) AS available FROM healthos_emergency_resources
     WHERE status = 'available' GROUP BY resource_type`
  ).catch(() => ({ rows: [] }));

  return {
    region: region || 'national',
    activeSignals: signals.length,
    signals,
    populationMetrics: metrics.rows,
    emergencyCapacity: emergency.rows,
    refreshedAt: new Date().toISOString(),
  };
}

export async function submitGovernmentReport({ reportType, region, title, summary, metrics, submittedBy }) {
  await ensure();
  const { rows } = await pool.query(
    `INSERT INTO healthos_government_reports (report_type, region, title, summary, metrics, submitted_by, status, published_at)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,'published',NOW()) RETURNING *`,
    [reportType, region, title, summary, JSON.stringify(metrics || {}), submittedBy]
  );
  return rows[0];
}

export async function simulatePandemic({ region, infectionRate, hospitalCapacity }) {
  const baseOccupancy = 0.72;
  const projected = Math.min(0.99, baseOccupancy + (infectionRate || 0.1) * (hospitalCapacity ? 1 / hospitalCapacity : 1.5));
  return {
    region: region || 'national',
    scenario: 'pandemic_surge',
    inputs: { infectionRate, hospitalCapacity },
    projections: {
      icuOccupancy: Math.round(projected * 100),
      edWaitHours: Math.round(2 + projected * 8),
      staffingGapPercent: Math.round(Math.max(0, (projected - 0.85) * 100)),
    },
    disclaimer: 'Simulation for planning only — not a clinical prediction',
  };
}

export default { getGovernmentDashboard, submitGovernmentReport, simulatePandemic };
