import crypto from 'node:crypto';
import pool from '../db/pgPool.js';

const TABLES = [
  'infection_cases',
  'infection_isolation_orders',
  'infection_exposures',
  'infection_stewardship_reviews',
  'infection_audit_events',
];

const workflowError = (message, code, status) => Object.assign(new Error(message), { code, status });

const requireOrg = (organizationId) => {
  const id = Number(organizationId);
  if (!Number.isInteger(id) || id <= 0) throw workflowError('A hospital organization is required', 'TENANT_CONTEXT_REQUIRED', 403);
  return id;
};

const normalizeKey = (value) => {
  const key = String(value || '').trim();
  if (!key) return null;
  if (key.length < 8 || key.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    throw workflowError('Idempotency-Key must be 8-128 characters using A-Z, a-z, 0-9, dot, underscore, colon or hyphen', 'validation_failed', 422);
  }
  return key;
};

const hashRequest = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

const readiness = async () => {
  const { rows } = await pool.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ANY($1::text[])
  `, [TABLES]);
  const found = new Set(rows.map((row) => row.table_name));
  const missing = TABLES.filter((table) => !found.has(table));
  if (missing.length) throw workflowError(`Infection-control schema is not migrated: ${missing.join(', ')}`, 'SCHEMA_NOT_MIGRATED', 503);
};

const audit = async (client, { organizationId, entityType, entityId, action, actor, correlationId, beforeState = null, afterState = null }) => {
  await client.query(`
    INSERT INTO infection_audit_events
      (organization_id, entity_type, entity_id, action, actor, correlation_id, before_state, after_state)
    VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)
  `, [organizationId, entityType, entityId, action, actor || null, correlationId || null,
    beforeState ? JSON.stringify(beforeState) : null, afterState ? JSON.stringify(afterState) : null]);
};

const getCaseForUpdate = async (client, organizationId, caseId) => {
  const { rows } = await client.query(
    'SELECT * FROM infection_cases WHERE organization_id = $1 AND id = $2 FOR UPDATE',
    [organizationId, caseId],
  );
  if (!rows[0]) throw workflowError('Infection case not found', 'not_found', 404);
  return rows[0];
};

export async function ensureInfectionControlReady() {
  await readiness();
  return true;
}

export async function createCase({ organizationId, caseNumber, patientId, admissionId, organism, source, onsetAt, metadata = {}, idempotencyKey, actor, correlationId }) {
  const org = requireOrg(organizationId);
  await readiness();
  const key = normalizeKey(idempotencyKey);
  const payload = { org, caseNumber: caseNumber || null, patientId: patientId || null, admissionId: admissionId || null, organism: organism || null, source: source || null, onsetAt: onsetAt || null, metadata };
  const requestHash = hashRequest(payload);
  return pool.connect().then(async (client) => {
    try {
      await client.query('BEGIN');
      if (key) {
        const { rows: existing } = await client.query(
          'SELECT * FROM infection_cases WHERE organization_id = $1 AND idempotency_key = $2 FOR UPDATE',
          [org, key],
        );
        if (existing[0]) {
          if (existing[0].request_hash && existing[0].request_hash !== requestHash) throw workflowError('The idempotency key was already used for another infection case', 'idempotency_key_reuse', 422);
          await client.query('COMMIT');
          return existing[0];
        }
      }
      const number = String(caseNumber || `INF-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`).trim();
      const { rows } = await client.query(`
        INSERT INTO infection_cases
          (organization_id, case_number, patient_id, admission_id, organism, source, onset_at, metadata, idempotency_key, request_hash, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)
        RETURNING *
      `, [org, number, patientId || null, admissionId || null, organism || null, source || null, onsetAt || null,
        JSON.stringify(metadata || {}), key, requestHash, actor || null]);
      await audit(client, { organizationId: org, entityType: 'infection_case', entityId: rows[0].id, action: 'case_created', actor, correlationId, afterState: rows[0] });
      await client.query('COMMIT');
      return rows[0];
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (error?.code === '23505' && key) {
        const { rows } = await client.query('SELECT * FROM infection_cases WHERE organization_id = $1 AND idempotency_key = $2', [org, key]);
        if (rows[0] && rows[0].request_hash === requestHash) return rows[0];
      }
      throw error;
    } finally {
      client.release();
    }
  });
}

export async function listCases(organizationId, { status, limit = 100, offset = 0 } = {}) {
  const org = requireOrg(organizationId);
  await readiness();
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const values = [org];
  let where = 'organization_id = $1';
  if (status) { values.push(String(status)); where += ` AND status = $${values.length}`; }
  values.push(safeLimit, safeOffset);
  const { rows } = await pool.query(`SELECT * FROM infection_cases WHERE ${where} ORDER BY created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
  return rows;
}

export async function getCase(organizationId, caseId) {
  const org = requireOrg(organizationId);
  await readiness();
  const { rows } = await pool.query(`
    SELECT c.*,
      COALESCE((SELECT json_agg(i ORDER BY i.started_at DESC) FROM infection_isolation_orders i WHERE i.organization_id = c.organization_id AND i.case_id = c.id), '[]'::json) AS isolation_orders,
      COALESCE((SELECT json_agg(e ORDER BY e.created_at DESC) FROM infection_exposures e WHERE e.organization_id = c.organization_id AND e.case_id = c.id), '[]'::json) AS exposures,
      COALESCE((SELECT json_agg(s ORDER BY s.created_at DESC) FROM infection_stewardship_reviews s WHERE s.organization_id = c.organization_id AND s.case_id = c.id), '[]'::json) AS stewardship_reviews
    FROM infection_cases c WHERE c.organization_id = $1 AND c.id = $2
  `, [org, caseId]);
  if (!rows[0]) throw workflowError('Infection case not found', 'not_found', 404);
  return rows[0];
}

export async function transitionCase(organizationId, caseId, { status, reason, actor, correlationId } = {}) {
  const org = requireOrg(organizationId);
  await readiness();
  if (!['confirmed', 'closed'].includes(status)) throw workflowError('Case status must be confirmed or closed', 'validation_failed', 422);
  if (status === 'closed' && !String(reason || '').trim()) throw workflowError('A closure reason is required', 'validation_failed', 422);
  return pool.connect().then(async (client) => {
    try {
      await client.query('BEGIN');
      const current = await getCaseForUpdate(client, org, caseId);
      if (current.status === 'closed') { await client.query('COMMIT'); return current; }
      const { rows } = await client.query(`
        UPDATE infection_cases SET status = $3, confirmed_at = CASE WHEN $3 = 'confirmed' THEN COALESCE(confirmed_at, NOW()) ELSE confirmed_at END,
          closed_at = CASE WHEN $3 = 'closed' THEN NOW() ELSE closed_at END, closed_reason = CASE WHEN $3 = 'closed' THEN $4 ELSE closed_reason END,
          updated_at = NOW() WHERE organization_id = $1 AND id = $2 RETURNING *
      `, [org, caseId, status, reason || null]);
      await audit(client, { organizationId: org, entityType: 'infection_case', entityId: caseId, action: `case_${status}`, actor, correlationId, beforeState: current, afterState: rows[0] });
      await client.query('COMMIT');
      return rows[0];
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; } finally { client.release(); }
  });
}

export async function createIsolation(organizationId, caseId, { precautionType, location, actor, correlationId, metadata = {} } = {}) {
  const org = requireOrg(organizationId);
  await readiness();
  if (!precautionType) throw workflowError('precautionType is required', 'validation_failed', 422);
  return pool.connect().then(async (client) => {
    try {
      await client.query('BEGIN');
      const current = await getCaseForUpdate(client, org, caseId);
      if (current.status === 'closed') throw workflowError('Closed cases cannot receive new isolation orders', 'invalid_transition', 409);
      const { rows: active } = await client.query('SELECT * FROM infection_isolation_orders WHERE organization_id = $1 AND case_id = $2 AND status = \'active\' FOR UPDATE', [org, caseId]);
      if (active[0]) throw workflowError('An active isolation order already exists for this case', 'isolation_already_active', 409);
      const { rows } = await client.query(`INSERT INTO infection_isolation_orders (organization_id, case_id, precaution_type, location, ordered_by, metadata) VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING *`, [org, caseId, precautionType, location || null, actor || 'infection_control', JSON.stringify(metadata || {})]);
      await audit(client, { organizationId: org, entityType: 'infection_isolation', entityId: rows[0].id, action: 'isolation_started', actor, correlationId, afterState: rows[0] });
      await client.query('COMMIT');
      return rows[0];
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; } finally { client.release(); }
  });
}

export async function releaseIsolation(organizationId, isolationId, { reason, actor, correlationId } = {}) {
  const org = requireOrg(organizationId);
  await readiness();
  if (!String(reason || '').trim()) throw workflowError('A release reason is required', 'validation_failed', 422);
  return pool.connect().then(async (client) => {
    try {
      await client.query('BEGIN');
      const { rows: currentRows } = await client.query('SELECT * FROM infection_isolation_orders WHERE organization_id = $1 AND id = $2 FOR UPDATE', [org, isolationId]);
      const current = currentRows[0];
      if (!current) throw workflowError('Isolation order not found', 'not_found', 404);
      if (current.status === 'released') { await client.query('COMMIT'); return current; }
      const { rows } = await client.query(`UPDATE infection_isolation_orders SET status = 'released', released_by = $3, released_at = NOW(), release_reason = $4 WHERE organization_id = $1 AND id = $2 RETURNING *`, [org, isolationId, actor || null, reason]);
      await audit(client, { organizationId: org, entityType: 'infection_isolation', entityId: isolationId, action: 'isolation_released', actor, correlationId, beforeState: current, afterState: rows[0] });
      await client.query('COMMIT');
      return rows[0];
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; } finally { client.release(); }
  });
}

export async function addExposure(organizationId, caseId, input = {}) {
  const org = requireOrg(organizationId);
  await readiness();
  if (!input.location && !input.exposedPatientId) throw workflowError('An exposed patient or location is required', 'validation_failed', 422);
  const { rows: caseRows } = await pool.query('SELECT id, status FROM infection_cases WHERE organization_id = $1 AND id = $2', [org, caseId]);
  if (!caseRows[0]) throw workflowError('Infection case not found', 'not_found', 404);
  if (caseRows[0].status === 'closed') throw workflowError('Closed cases cannot receive exposures', 'invalid_transition', 409);
  const { rows } = await pool.query(`INSERT INTO infection_exposures (organization_id, case_id, exposed_patient_id, location, exposure_at, risk_level, owner, due_at, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [org, caseId, input.exposedPatientId || null, input.location || null, input.exposureAt || null, input.riskLevel || 'unknown', input.owner || null, input.dueAt || null, input.notes || null]);
  await pool.query(`INSERT INTO infection_audit_events (organization_id, entity_type, entity_id, action, actor, correlation_id, after_state) VALUES ($1,'infection_exposure',$2,'exposure_created',$3,$4,$5::jsonb)`, [org, rows[0].id, input.actor || null, input.correlationId || null, JSON.stringify(rows[0])]);
  return rows[0];
}

export async function closeExposure(organizationId, exposureId, { reason, actor, correlationId } = {}) {
  const org = requireOrg(organizationId);
  await readiness();
  if (!String(reason || '').trim()) throw workflowError('A closure reason is required', 'validation_failed', 422);
  const { rows } = await pool.query(`UPDATE infection_exposures SET status = 'closed', closed_by = $3, closed_at = NOW(), notes = COALESCE(notes || E'\\n', '') || $4, updated_at = NOW() WHERE organization_id = $1 AND id = $2 AND status = 'open' RETURNING *`, [org, exposureId, actor || null, reason]);
  if (!rows[0]) {
    const { rows: existing } = await pool.query('SELECT * FROM infection_exposures WHERE organization_id = $1 AND id = $2', [org, exposureId]);
    if (!existing[0]) throw workflowError('Exposure not found', 'not_found', 404);
    return existing[0];
  }
  await pool.query(`INSERT INTO infection_audit_events (organization_id, entity_type, entity_id, action, actor, correlation_id, after_state) VALUES ($1,'infection_exposure',$2,'exposure_closed',$3,$4,$5::jsonb)`, [org, exposureId, actor || null, correlationId || null, JSON.stringify(rows[0])]);
  return rows[0];
}

export async function addStewardshipReview(organizationId, caseId, input = {}) {
  const org = requireOrg(organizationId);
  await readiness();
  if (!input.antimicrobial) throw workflowError('antimicrobial is required', 'validation_failed', 422);
  const { rows: caseRows } = await pool.query('SELECT id, status FROM infection_cases WHERE organization_id = $1 AND id = $2', [org, caseId]);
  if (!caseRows[0]) throw workflowError('Infection case not found', 'not_found', 404);
  const { rows } = await pool.query(`INSERT INTO infection_stewardship_reviews (organization_id, case_id, antimicrobial, indication, review_due_at) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [org, caseId, input.antimicrobial, input.indication || null, input.reviewDueAt || null]);
  await pool.query(`INSERT INTO infection_audit_events (organization_id, entity_type, entity_id, action, actor, correlation_id, after_state) VALUES ($1,'stewardship_review',$2,'review_created',$3,$4,$5::jsonb)`, [org, rows[0].id, input.actor || null, input.correlationId || null, JSON.stringify(rows[0])]);
  return rows[0];
}

export async function reviewStewardship(organizationId, reviewId, { status, notes, actor, correlationId } = {}) {
  const org = requireOrg(organizationId);
  await readiness();
  if (!['continued', 'narrowed', 'stopped', 'completed'].includes(status)) throw workflowError('Invalid stewardship decision', 'validation_failed', 422);
  const { rows: currentRows } = await pool.query('SELECT * FROM infection_stewardship_reviews WHERE organization_id = $1 AND id = $2', [org, reviewId]);
  if (!currentRows[0]) throw workflowError('Stewardship review not found', 'not_found', 404);
  const { rows } = await pool.query(`UPDATE infection_stewardship_reviews SET status = $3, reviewed_by = $4, reviewed_at = NOW(), review_notes = $5, updated_at = NOW() WHERE organization_id = $1 AND id = $2 RETURNING *`, [org, reviewId, status, actor || null, notes || null]);
  await pool.query(`INSERT INTO infection_audit_events (organization_id, entity_type, entity_id, action, actor, correlation_id, before_state, after_state) VALUES ($1,'stewardship_review',$2,'review_decided',$3,$4,$5::jsonb,$6::jsonb)`, [org, reviewId, actor || null, correlationId || null, JSON.stringify(currentRows[0]), JSON.stringify(rows[0])]);
  return rows[0];
}

export async function listStewardship(organizationId, { status = 'pending', limit = 100 } = {}) {
  const org = requireOrg(organizationId);
  await readiness();
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const values = [org];
  let where = 'organization_id = $1';
  if (status !== 'all') { values.push(status); where += ` AND status = $${values.length}`; }
  values.push(safeLimit);
  const { rows } = await pool.query(`SELECT * FROM infection_stewardship_reviews WHERE ${where} ORDER BY review_due_at NULLS LAST, created_at DESC LIMIT $${values.length}`, values);
  return rows;
}

export async function listAudit(organizationId, { limit = 100 } = {}) {
  const org = requireOrg(organizationId);
  await readiness();
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const { rows } = await pool.query('SELECT * FROM infection_audit_events WHERE organization_id = $1 ORDER BY created_at DESC LIMIT $2', [org, safeLimit]);
  return rows;
}

export { normalizeKey, hashRequest, workflowError };

export default {
  ensureInfectionControlReady, createCase, listCases, getCase, transitionCase,
  createIsolation, releaseIsolation, addExposure, closeExposure,
  addStewardshipReview, reviewStewardship, listStewardship, listAudit,
};
