/**
 * HyperGrid Digital Twins Service
 *
 * Live, queryable models of physical entities.
 * Twins store: state, history, predicted risk, and associated events.
 *
 * Twin types: device | patient | asset | hospital | claim | ambulance
 */

import { connectPostgres } from '../db/postgres.js';
import { publishEvent }    from './hypergrid-event-bus.service.js';

// ─── Core CRUD ────────────────────────────────────────────────────────────────

export async function upsertTwin({ twinType, externalId, tenantId, attributes, location }) {
  const pool = await connectPostgres();
  const r = await pool.query(
    `INSERT INTO hg_digital_twins
       (twin_type, external_id, tenant_id, attributes, location, last_seen, created_at)
     VALUES ($1,$2,$3,$4,$5,NOW(),NOW())
     ON CONFLICT (twin_type, external_id, tenant_id)
     DO UPDATE SET
       attributes = hg_digital_twins.attributes || EXCLUDED.attributes,
       location   = COALESCE(EXCLUDED.location, hg_digital_twins.location),
       last_seen  = NOW(),
       updated_at = NOW()
     RETURNING *`,
    [twinType, externalId, tenantId, JSON.stringify(attributes || {}), location || null]
  );
  return r.rows[0];
}

export async function getTwin(twinType, externalId, tenantId) {
  const pool = await connectPostgres();
  const r = await pool.query(
    `SELECT * FROM hg_digital_twins
     WHERE twin_type = $1 AND external_id = $2 AND tenant_id = $3`,
    [twinType, externalId, tenantId]
  );
  return r.rows[0] || null;
}

export async function listTwins({ twinType, tenantId, limit = 50, offset = 0 }) {
  const pool = await connectPostgres();
  const r = await pool.query(
    `SELECT * FROM hg_digital_twins
     WHERE tenant_id = $1 AND ($2::text IS NULL OR twin_type = $2)
     ORDER BY last_seen DESC
     LIMIT $3 OFFSET $4`,
    [tenantId, twinType || null, limit, offset]
  );
  return r.rows;
}

// ─── Observation / state push ──────────────────────────────────────────────────

/**
 * Push a new observation onto a twin's timeline.
 * Also updates the twin's cached last_observation and computes risk delta.
 */
export async function pushObservation({ twinType, externalId, tenantId,
  observationType, value, unit, metadata }) {
  const pool = await connectPostgres();

  // Record observation
  await pool.query(
    `INSERT INTO hg_twin_observations
       (twin_type, external_id, tenant_id, observation_type, value, unit, metadata, observed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
    [twinType, externalId, tenantId, observationType,
     typeof value === 'object' ? JSON.stringify(value) : String(value),
     unit || null, JSON.stringify(metadata || {})]
  );

  // Update twin attributes with latest observation snapshot
  await pool.query(
    `UPDATE hg_digital_twins
     SET attributes = attributes || jsonb_build_object(
           'lastObservationType', $4,
           'lastObservationValue', $5::text,
           'lastObservationAt', NOW()::text
         ),
         last_seen = NOW(),
         updated_at = NOW()
     WHERE twin_type = $1 AND external_id = $2 AND tenant_id = $3`,
    [twinType, externalId, tenantId, observationType,
     typeof value === 'object' ? JSON.stringify(value) : String(value)]
  );

  // Publish to event bus
  await publishEvent({
    type:      'TwinObservationRecorded',
    source:    'twin-service',
    tenantId,
    payload:   { twinType, externalId, observationType, value, unit },
  });
}

// ─── Risk scoring ─────────────────────────────────────────────────────────────

/**
 * Compute a risk score for a twin based on recent observations.
 * Returns { score: 0–100, factors: string[], level: 'low'|'medium'|'high'|'critical' }
 */
export async function computeRisk(twinType, externalId, tenantId) {
  const pool = await connectPostgres();

  const r = await pool.query(
    `SELECT observation_type, value, observed_at
     FROM hg_twin_observations
     WHERE twin_type = $1 AND external_id = $2 AND tenant_id = $3
       AND observed_at > NOW() - INTERVAL '24 hours'
     ORDER BY observed_at DESC`,
    [twinType, externalId, tenantId]
  );

  const observations = r.rows;
  let score = 0;
  const factors = [];

  if (twinType === 'device') {
    const alerts = observations.filter(o => o.observation_type === 'alert');
    if (alerts.length > 0)  { score += 40; factors.push(`${alerts.length} alert(s) in 24h`); }
    const offline = observations.find(o => o.observation_type === 'offline');
    if (offline)             { score += 30; factors.push('Device went offline'); }
  }

  if (twinType === 'patient') {
    const vitals = observations.filter(o => o.observation_type === 'vital');
    const abnormal = vitals.filter(o => {
      try { const v = JSON.parse(o.value); return v.abnormal === true; } catch { return false; }
    });
    if (abnormal.length > 0) { score += 50; factors.push(`${abnormal.length} abnormal vital(s)`); }
  }

  if (twinType === 'claim') {
    const denials = observations.filter(o => o.observation_type === 'denial_risk');
    if (denials.length > 0)  { score += 60; factors.push('Denial risk flag raised'); }
  }

  score = Math.min(score, 100);
  const level = score >= 75 ? 'critical' : score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low';

  // Persist risk score on twin
  await pool.query(
    `UPDATE hg_digital_twins
     SET attributes = attributes || jsonb_build_object('riskScore', $4, 'riskLevel', $5, 'riskFactors', $6::text),
         updated_at = NOW()
     WHERE twin_type = $1 AND external_id = $2 AND tenant_id = $3`,
    [twinType, externalId, tenantId, score, level, JSON.stringify(factors)]
  );

  return { score, level, factors };
}

// ─── Timeline query ───────────────────────────────────────────────────────────

export async function getTwinTimeline({ twinType, externalId, tenantId,
  from, to, limit = 100 }) {
  const pool = await connectPostgres();
  const r = await pool.query(
    `SELECT * FROM hg_twin_observations
     WHERE twin_type = $1 AND external_id = $2 AND tenant_id = $3
       AND ($4::timestamptz IS NULL OR observed_at >= $4)
       AND ($5::timestamptz IS NULL OR observed_at <= $5)
     ORDER BY observed_at DESC
     LIMIT $6`,
    [twinType, externalId, tenantId, from || null, to || null, limit]
  );
  return r.rows;
}
