/**
 * HealthOS Stage 2 — Wearables / device monitoring → timeline
 */
import pool from '../../db/pgPool.js';
import { up as migrate } from '../../migrations/healthos-phases-2-4.migration.js';
import { appendClinicalEvent } from './clinical-timeline.service.js';

let ready = false;
async function ensure() { if (!ready) { await migrate(); ready = true; } }

const ALERT_THRESHOLDS = {
  heart_rate: { high: 120, low: 45 },
  spo2: { low: 92 },
  steps: { low: 1000 },
};

export async function ingestWearableReading({ organizationId, patientId, source, metricType, value, unit, recordedAt }) {
  await ensure();
  const { rows } = await pool.query(
    `INSERT INTO healthos_wearable_readings (organization_id, patient_id, source, metric_type, value, unit, recorded_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [organizationId, patientId, source || 'apple_health', metricType, value, unit, recordedAt || new Date()]
  );
  const reading = rows[0];

  const thresh = ALERT_THRESHOLDS[metricType];
  let severity = 'info';
  if (thresh) {
    if (thresh.high && value >= thresh.high) severity = 'warning';
    if (thresh.low && value <= thresh.low) severity = 'critical';
  }

  if (severity !== 'info') {
    await appendClinicalEvent({
      organizationId, patientId,
      eventType: 'device_alert',
      title: `${metricType.replace(/_/g, ' ')}: ${value}${unit ? ` ${unit}` : ''}`,
      body: `Source: ${source || 'wearable'}`,
      actorType: 'device', actorName: source || 'Wearable',
      severity,
      metadata: { readingId: reading.id },
    });
    await pool.query(`UPDATE healthos_wearable_readings SET synced_to_timeline = true WHERE id = $1`, [reading.id]);
  }

  return reading;
}

export async function listWearableReadings(patientId, organizationId, hours = 24) {
  await ensure();
  const since = new Date(Date.now() - hours * 3600000);
  const { rows } = await pool.query(
    `SELECT * FROM healthos_wearable_readings
     WHERE patient_id = $1 AND ($2::bigint IS NULL OR organization_id = $2) AND recorded_at >= $3
     ORDER BY recorded_at DESC LIMIT 200`,
    [patientId, organizationId || null, since]
  );
  return rows;
}

export async function getMonitoringSummary(patientId, organizationId) {
  const readings = await listWearableReadings(patientId, organizationId, 48);
  const byType = {};
  for (const r of readings) {
    if (!byType[r.metric_type]) byType[r.metric_type] = [];
    byType[r.metric_type].push(r);
  }
  const summary = Object.entries(byType).map(([type, list]) => ({
    metricType: type,
    latest: list[0],
    count: list.length,
    avg: list.reduce((s, x) => s + Number(x.value), 0) / list.length,
  }));
  return { patientId, summary, readingCount: readings.length };
}

export default { ingestWearableReading, listWearableReadings, getMonitoringSummary };
