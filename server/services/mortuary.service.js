import crypto from 'node:crypto';
import pool from '../db/pgPool.js';

const TABLES = ['mortuary_deaths', 'mortuary_bodies', 'mortuary_handoffs', 'mortuary_audit_events'];
const workflowError = (message, code, status) => Object.assign(new Error(message), { code, status });

const requireOrg = (organizationId) => {
  const id = Number(organizationId);
  if (!Number.isInteger(id) || id <= 0) throw workflowError('A hospital organization is required', 'TENANT_CONTEXT_REQUIRED', 403);
  return id;
};

const normalizeKey = (value) => {
  const key = String(value || '').trim();
  if (!key) return null;
  if (key.length < 8 || key.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(key)) throw workflowError('Idempotency-Key must be 8-128 characters using A-Z, a-z, 0-9, dot, underscore, colon or hyphen', 'validation_failed', 422);
  return key;
};
const hashRequest = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

const readiness = async () => {
  const { rows } = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])`, [TABLES]);
  const found = new Set(rows.map((row) => row.table_name));
  const missing = TABLES.filter((table) => !found.has(table));
  if (missing.length) throw workflowError(`Mortuary schema is not migrated: ${missing.join(', ')}`, 'SCHEMA_NOT_MIGRATED', 503);
};

const audit = async (client, { organizationId, entityType, entityId, action, actor, witnessActor, correlationId, beforeState = null, afterState = null }) => {
  await client.query(`
    INSERT INTO mortuary_audit_events
      (organization_id, entity_type, entity_id, action, actor, witness_actor, correlation_id, before_state, after_state)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb)
  `, [organizationId, entityType, entityId, action, actor || null, witnessActor || null, correlationId || null,
    beforeState ? JSON.stringify(beforeState) : null, afterState ? JSON.stringify(afterState) : null]);
};

export async function ensureMortuaryReady() { await readiness(); return true; }

export async function createDeath({ organizationId, deathNumber, patientId, admissionId, declaredAt, declaredBy, deathType = 'clinical', certificateRef, nextOfKin = {}, metadata = {}, idempotencyKey }) {
  const org = requireOrg(organizationId);
  await readiness();
  if (!declaredBy) throw workflowError('declaredBy is required', 'validation_failed', 422);
  if (!['clinical', 'medicolegal', 'unknown'].includes(deathType)) throw workflowError('Invalid death type', 'validation_failed', 422);
  const key = normalizeKey(idempotencyKey);
  const payload = { org, deathNumber: deathNumber || null, patientId: patientId || null, admissionId: admissionId || null, declaredAt: declaredAt || null, deathType, certificateRef: certificateRef || null, nextOfKin, metadata };
  const requestHash = hashRequest(payload);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (key) {
      const { rows } = await client.query('SELECT * FROM mortuary_deaths WHERE organization_id = $1 AND idempotency_key = $2 FOR UPDATE', [org, key]);
      if (rows[0]) {
        if (rows[0].request_hash && rows[0].request_hash !== requestHash) throw workflowError('The idempotency key was already used for another death record', 'idempotency_key_reuse', 422);
        await client.query('COMMIT');
        return rows[0];
      }
    }
    const number = String(deathNumber || `DTH-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`).trim();
    const { rows } = await client.query(`
      INSERT INTO mortuary_deaths
        (organization_id, death_number, patient_id, admission_id, declared_at, declared_by, death_type, certificate_ref, next_of_kin, metadata, idempotency_key, request_hash)
      VALUES ($1,$2,$3,$4,COALESCE($5,NOW()),$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12)
      RETURNING *
    `, [org, number, patientId || null, admissionId || null, declaredAt || null, declaredBy, deathType, certificateRef || null, JSON.stringify(nextOfKin || {}), JSON.stringify(metadata || {}), key, requestHash]);
    await audit(client, { organizationId: org, entityType: 'mortuary_death', entityId: rows[0].id, action: 'death_declared', actor: declaredBy, afterState: rows[0] });
    await client.query('COMMIT');
    return rows[0];
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error?.code === '23505' && key) {
      const { rows } = await client.query('SELECT * FROM mortuary_deaths WHERE organization_id = $1 AND idempotency_key = $2', [org, key]);
      if (rows[0] && rows[0].request_hash === requestHash) return rows[0];
    }
    throw error;
  } finally { client.release(); }
}

export async function listDeaths(organizationId, { status, limit = 100, offset = 0 } = {}) {
  const org = requireOrg(organizationId);
  await readiness();
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const values = [org];
  let where = 'd.organization_id = $1';
  if (status) { values.push(status); where += ` AND d.status = $${values.length}`; }
  values.push(safeLimit, safeOffset);
  const { rows } = await pool.query(`
    SELECT d.*, b.id AS body_id, b.body_tag, b.location, b.cold_room_slot, b.status AS body_status
    FROM mortuary_deaths d LEFT JOIN mortuary_bodies b ON b.death_id = d.id AND b.organization_id = d.organization_id AND b.status <> 'disposed'
    WHERE ${where} ORDER BY d.declared_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}
  `, values);
  return rows;
}

export async function getDeath(organizationId, deathId) {
  const org = requireOrg(organizationId);
  await readiness();
  const { rows } = await pool.query(`
    SELECT d.*, COALESCE((SELECT json_agg(b ORDER BY b.stored_at DESC) FROM mortuary_bodies b WHERE b.organization_id = d.organization_id AND b.death_id = d.id), '[]'::json) AS bodies,
      COALESCE((SELECT json_agg(h ORDER BY h.handed_over_at DESC) FROM mortuary_handoffs h WHERE h.organization_id = d.organization_id AND h.death_id = d.id), '[]'::json) AS handoffs
    FROM mortuary_deaths d WHERE d.organization_id = $1 AND d.id = $2
  `, [org, deathId]);
  if (!rows[0]) throw workflowError('Death record not found', 'not_found', 404);
  return rows[0];
}

export async function registerBody(organizationId, deathId, { bodyTag, location, coldRoomSlot, sealedAt, actor, correlationId, metadata = {} } = {}) {
  const org = requireOrg(organizationId);
  await readiness();
  if (!bodyTag) throw workflowError('bodyTag is required', 'validation_failed', 422);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: deaths } = await client.query('SELECT * FROM mortuary_deaths WHERE organization_id = $1 AND id = $2 FOR UPDATE', [org, deathId]);
    const death = deaths[0];
    if (!death) throw workflowError('Death record not found', 'not_found', 404);
    if (['released', 'cancelled'].includes(death.status)) throw workflowError('A released or cancelled death record cannot receive a body', 'invalid_transition', 409);
    const { rows: existing } = await client.query('SELECT * FROM mortuary_bodies WHERE organization_id = $1 AND death_id = $2 AND status <> \'disposed\' FOR UPDATE', [org, deathId]);
    if (existing[0]) { await client.query('COMMIT'); return existing[0]; }
    const { rows } = await client.query(`INSERT INTO mortuary_bodies (organization_id, death_id, body_tag, location, cold_room_slot, sealed_at, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING *`, [org, deathId, bodyTag, location || null, coldRoomSlot || null, sealedAt || null, JSON.stringify(metadata || {})]);
    const { rows: updated } = await client.query(`UPDATE mortuary_deaths SET status = 'stored', updated_at = NOW() WHERE organization_id = $1 AND id = $2 RETURNING *`, [org, deathId]);
    await audit(client, { organizationId: org, entityType: 'mortuary_body', entityId: rows[0].id, action: 'body_registered', actor, correlationId, afterState: rows[0] });
    await audit(client, { organizationId: org, entityType: 'mortuary_death', entityId: deathId, action: 'death_stored', actor, correlationId, beforeState: death, afterState: updated[0] });
    await client.query('COMMIT');
    return rows[0];
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; } finally { client.release(); }
}

export async function setLegalHold(organizationId, deathId, { held, reason, actor, correlationId } = {}) {
  const org = requireOrg(organizationId);
  await readiness();
  if (held && !String(reason || '').trim()) throw workflowError('A legal-hold reason is required', 'validation_failed', 422);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: currentRows } = await client.query('SELECT * FROM mortuary_deaths WHERE organization_id = $1 AND id = $2 FOR UPDATE', [org, deathId]);
    const current = currentRows[0];
    if (!current) throw workflowError('Death record not found', 'not_found', 404);
    const { rows } = await client.query(`UPDATE mortuary_deaths SET legal_hold = $3, legal_hold_reason = $4, updated_at = NOW() WHERE organization_id = $1 AND id = $2 RETURNING *`, [org, deathId, Boolean(held), held ? reason : null]);
    await audit(client, { organizationId: org, entityType: 'mortuary_death', entityId: deathId, action: held ? 'legal_hold_applied' : 'legal_hold_released', actor, correlationId, beforeState: current, afterState: rows[0] });
    await client.query('COMMIT');
    return rows[0];
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; } finally { client.release(); }
}

export async function handoffBody(organizationId, bodyId, { recipientName, recipientType, authorizationRef, witnessActor, handedOverBy, notes, correlationId } = {}) {
  const org = requireOrg(organizationId);
  await readiness();
  if (!recipientName || !recipientType || !handedOverBy || !witnessActor) throw workflowError('recipientName, recipientType, handedOverBy and witnessActor are required', 'validation_failed', 422);
  if (String(handedOverBy) === String(witnessActor)) throw workflowError('Handover requires a second person as witness', 'two_person_verification_required', 422);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: bodyRows } = await client.query(`SELECT b.*, d.status AS death_status, d.legal_hold, d.legal_hold_reason, d.death_type FROM mortuary_bodies b JOIN mortuary_deaths d ON d.id = b.death_id AND d.organization_id = b.organization_id WHERE b.organization_id = $1 AND b.id = $2 FOR UPDATE`, [org, bodyId]);
    const body = bodyRows[0];
    if (!body) throw workflowError('Body record not found', 'not_found', 404);
    if (body.legal_hold) throw workflowError('Body is under legal hold and cannot be released', 'legal_hold_active', 409);
    if (body.death_type === 'medicolegal' && !String(authorizationRef || '').trim()) throw workflowError('Medico-legal release authorization is required', 'authorization_required', 422);
    if (body.status === 'released') {
      const { rows: existing } = await client.query('SELECT * FROM mortuary_handoffs WHERE organization_id = $1 AND body_id = $2', [org, bodyId]);
      await client.query('COMMIT');
      return existing[0] || null;
    }
    if (body.status !== 'stored' || !['stored'].includes(body.death_status)) throw workflowError('Only a stored body with a stored death record can be released', 'invalid_transition', 409);
    const { rows: handoffs } = await client.query(`INSERT INTO mortuary_handoffs (organization_id, death_id, body_id, recipient_name, recipient_type, authorization_ref, witness_actor, handed_over_by, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [org, body.death_id, bodyId, recipientName, recipientType, authorizationRef || null, witnessActor, handedOverBy, notes || null]);
    await client.query(`UPDATE mortuary_bodies SET status = 'released', released_at = NOW() WHERE organization_id = $1 AND id = $2`, [org, bodyId]);
    await client.query(`UPDATE mortuary_deaths SET status = 'released', updated_at = NOW() WHERE organization_id = $1 AND id = $2`, [org, body.death_id]);
    await audit(client, { organizationId: org, entityType: 'mortuary_handoff', entityId: handoffs[0].id, action: 'body_handed_over', actor: handedOverBy, witnessActor, correlationId, beforeState: body, afterState: handoffs[0] });
    await client.query('COMMIT');
    return handoffs[0];
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; } finally { client.release(); }
}

export async function listAudit(organizationId, { limit = 100 } = {}) {
  const org = requireOrg(organizationId);
  await readiness();
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const { rows } = await pool.query('SELECT * FROM mortuary_audit_events WHERE organization_id = $1 ORDER BY created_at DESC LIMIT $2', [org, safeLimit]);
  return rows;
}

export { normalizeKey, hashRequest, workflowError };

export default { ensureMortuaryReady, createDeath, listDeaths, getDeath, registerBody, setLegalHold, handoffBody, listAudit };
