/**
 * HealthOS Stage 3 — AI Hospital Network signals (governed public health patterns)
 */
import pool from '../../db/pgPool.js';
import { up as migrate } from '../../migrations/healthos-phases-2-4.migration.js';

let ready = false;
async function ensure() { if (!ready) { await migrate(); ready = true; } }

export async function detectNetworkSignals(organizationId) {
  await ensure();
  const signals = [];

  // Sepsis pattern from coordinator alerts across org
  const sepsisRes = await pool.query(
    `SELECT organization_id, COUNT(*) AS cnt FROM careos_coordinator_alerts
     WHERE alert_type IN ('sepsis', 'ews_high', 'hypotension') AND status = 'active' AND created_at > NOW() - INTERVAL '7 days'
     GROUP BY organization_id HAVING COUNT(*) >= 3`
  ).catch(() => ({ rows: [] }));

  if (sepsisRes.rows.length >= 2) {
    const orgIds = sepsisRes.rows.map((r) => r.organization_id);
    const { rows } = await pool.query(
      `INSERT INTO healthos_network_signals (signal_type, severity, title, description, affected_org_ids, aggregated_data)
       VALUES ('sepsis_cluster', 'warning', 'Elevated sepsis-risk alerts across network',
         'Multiple organizations reporting increased sepsis-related coordinator alerts in the past 7 days.',
         $1, $2::jsonb) RETURNING *`,
      [orgIds, JSON.stringify({ orgCounts: sepsisRes.rows })]
    );
    signals.push(rows[0]);
  }

  // ICU capacity bottleneck heuristic
  const icuRes = await pool.query(
    `SELECT COUNT(*) AS active_critical FROM careos_coordinator_alerts
     WHERE severity = 'critical' AND status = 'active' AND ($1::bigint IS NULL OR organization_id = $1)`,
    [organizationId || null]
  ).catch(() => ({ rows: [{ active_critical: 0 }] }));

  if (Number(icuRes.rows[0]?.active_critical) >= 5) {
    const { rows } = await pool.query(
      `INSERT INTO healthos_network_signals (signal_type, severity, title, description, affected_org_ids, aggregated_data)
       VALUES ('capacity_pressure', 'warning', 'High critical alert volume',
         'Five or more active critical coordinator alerts — review ICU capacity and staffing.',
         $1, $2::jsonb) RETURNING *`,
      [organizationId ? [organizationId] : [], JSON.stringify({ criticalCount: icuRes.rows[0].active_critical })]
    );
    signals.push(rows[0]);
  }

  return { detected: signals.length, signals };
}

export async function listNetworkSignals({ status = 'active', limit = 20 } = {}) {
  await ensure();
  const { rows } = await pool.query(
    `SELECT * FROM healthos_network_signals WHERE ($1::text IS NULL OR status = $1) ORDER BY detected_at DESC LIMIT $2`,
    [status, limit]
  );
  return rows;
}

export async function resolveSignal(signalId) {
  await ensure();
  const { rows } = await pool.query(
    `UPDATE healthos_network_signals SET status = 'resolved', resolved_at = NOW() WHERE id = $1 RETURNING *`,
    [signalId]
  );
  return rows[0];
}

export default { detectNetworkSignals, listNetworkSignals, resolveSignal };
