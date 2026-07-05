/**
 * HealthOS Stage 4 — Population analytics
 */
import pool from '../../db/pgPool.js';
import { up as migrate } from '../../migrations/healthos-phases-2-4.migration.js';

let ready = false;
async function ensure() { if (!ready) { await migrate(); ready = true; } }

export async function computePopulationMetrics(organizationId) {
  await ensure();
  const metrics = [];
  const periodStart = new Date();
  periodStart.setDate(1);
  const periodEnd = new Date();

  const patients = await pool.query(
    `SELECT COUNT(DISTINCT patient_id) AS cnt FROM careos_clinical_events WHERE organization_id = $1 AND event_at > NOW() - INTERVAL '30 days'`,
    [organizationId]
  ).catch(() => ({ rows: [{ cnt: 0 }] }));

  const critical = await pool.query(
    `SELECT COUNT(*) AS cnt FROM careos_coordinator_alerts WHERE organization_id = $1 AND severity = 'critical' AND created_at > NOW() - INTERVAL '7 days'`,
    [organizationId]
  ).catch(() => ({ rows: [{ cnt: 0 }] }));

  const referrals = await pool.query(
    `SELECT COUNT(*) AS cnt FROM healthos_referrals WHERE from_org_id = $1 OR to_org_id = $1`,
    [organizationId]
  ).catch(() => ({ rows: [{ cnt: 0 }] }));

  const defs = [
    { name: 'active_patients_30d', value: patients.rows[0]?.cnt || 0, unit: 'patients' },
    { name: 'critical_alerts_7d', value: critical.rows[0]?.cnt || 0, unit: 'alerts' },
    { name: 'network_referrals', value: referrals.rows[0]?.cnt || 0, unit: 'referrals' },
  ];

  for (const d of defs) {
    const { rows } = await pool.query(
      `INSERT INTO healthos_population_metrics (organization_id, metric_name, metric_value, unit, period_start, period_end)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [organizationId, d.name, d.value, d.unit, periodStart, periodEnd]
    );
    metrics.push(rows[0]);
  }

  return metrics;
}

export async function getPopulationDashboard(organizationId) {
  await ensure();
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (metric_name) * FROM healthos_population_metrics
     WHERE organization_id = $1 ORDER BY metric_name, computed_at DESC`,
    [organizationId]
  );
  if (!rows.length) await computePopulationMetrics(organizationId);
  const refreshed = await pool.query(
    `SELECT DISTINCT ON (metric_name) * FROM healthos_population_metrics
     WHERE organization_id = $1 ORDER BY metric_name, computed_at DESC`,
    [organizationId]
  );
  return { organizationId, metrics: refreshed.rows, refreshedAt: new Date().toISOString() };
}

export default { computePopulationMetrics, getPopulationDashboard };
