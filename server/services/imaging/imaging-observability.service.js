/** Phase 1: Imaging observability metrics (Prometheus-compatible export + DB log). */
import pool from '../../db/pgPool.js';

const counters = new Map();

export async function recordMetric(name, value = 1, labels = {}) {
  const key = `${name}:${JSON.stringify(labels)}`;
  counters.set(key, (counters.get(key) || 0) + value);
  try {
    await pool.query(
      `INSERT INTO imaging_metrics_log (metric_name, metric_value, labels) VALUES ($1,$2,$3::jsonb)`,
      [name, value, JSON.stringify(labels)],
    );
  } catch { /* table may not exist yet */ }
}

export function getPrometheusMetrics() {
  const lines = [];
  for (const [key, val] of counters.entries()) {
    const [name] = key.split(':');
    lines.push(`mediczy_imaging_${name.replace(/\./g, '_')} ${val}`);
  }
  return lines.join('\n') + '\n';
}

export async function getRecentMetrics(limit = 100) {
  try {
    const r = await pool.query(
      `SELECT metric_name, metric_value, labels, recorded_at
       FROM imaging_metrics_log ORDER BY recorded_at DESC LIMIT $1`,
      [limit],
    );
    return r.rows;
  } catch {
    return [];
  }
}
