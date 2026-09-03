/**
 * MRD (Medical Records Department) service
 * Upgrade Plan Track A, Phase A2.
 *
 * Record indexing/location tracking, check-out/return, retrieval-request
 * workflow, and a retention schedule lookup. This module tracks WHERE a
 * record is and WHO has it — it does not touch clinical content
 * (medicalRecord/ehrRecord models own that).
 */
import pool from '../db/pgPool.js';

// ── Record index ────────────────────────────────────────────────────────────

export async function indexRecord({ patientId, organizationId = null, recordType, format = 'digital', location = null, indexedBy = null }) {
  if (!patientId) throw new Error('patientId is required');
  if (!recordType) throw new Error('recordType is required');

  const client = await pool.connect();
  try {
    const policy = await client.query(
      `SELECT retention_years FROM mrd_retention_schedule WHERE record_type = $1`,
      [recordType]
    );
    const retentionDueAt = policy.rows[0]
      ? `NOW() + INTERVAL '${parseInt(policy.rows[0].retention_years, 10)} years'`
      : null;

    const result = await client.query(
      `INSERT INTO mrd_record_index
         (patient_id, organization_id, record_type, format, location, status, indexed_by, retention_due_at)
       VALUES ($1, $2, $3, $4, $5, 'in_mrd', $6, ${retentionDueAt || 'NULL'})
       RETURNING *`,
      [patientId, organizationId, recordType, format, location, indexedBy]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

export async function getRecord(id) {
  const { rows } = await pool.query(`SELECT * FROM mrd_record_index WHERE id = $1`, [id]);
  return rows[0] || null;
}

export async function listRecords({ patientId, organizationId, status, recordType, limit = 50, offset = 0 } = {}) {
  const clauses = [];
  const values = [];
  const push = (sql, value) => { values.push(value); clauses.push(sql.replace('?', `$${values.length}`)); };

  if (patientId) push('patient_id = ?', patientId);
  if (organizationId) push('organization_id = ?', organizationId);
  if (status) push('status = ?', status);
  if (recordType) push('record_type = ?', recordType);

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  values.push(Math.min(parseInt(limit, 10) || 50, 200));
  values.push(Math.max(parseInt(offset, 10) || 0, 0));

  const { rows } = await pool.query(
    `SELECT * FROM mrd_record_index ${where} ORDER BY created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  return rows;
}

// ── Check-out / return ──────────────────────────────────────────────────────

export async function checkoutRecord({ recordId, checkedOutBy, department = null, purpose = null, expectedReturnAt = null }) {
  if (!recordId || !checkedOutBy) throw new Error('recordId and checkedOutBy are required');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const record = await client.query(`SELECT status FROM mrd_record_index WHERE id = $1 FOR UPDATE`, [recordId]);
    if (!record.rows[0]) throw new Error('Record not found');
    if (record.rows[0].status === 'checked_out') throw new Error('Record is already checked out');

    const log = await client.query(
      `INSERT INTO mrd_checkout_log (record_id, checked_out_by, checked_out_to_dept, purpose, expected_return_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [recordId, checkedOutBy, department, purpose, expectedReturnAt]
    );
    await client.query(`UPDATE mrd_record_index SET status = 'checked_out', updated_at = NOW() WHERE id = $1`, [recordId]);

    await client.query('COMMIT');
    return log.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function returnRecord({ recordId, returnedTo = null }) {
  if (!recordId) throw new Error('recordId is required');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const openLog = await client.query(
      `SELECT id FROM mrd_checkout_log WHERE record_id = $1 AND returned_at IS NULL ORDER BY checked_out_at DESC LIMIT 1 FOR UPDATE`,
      [recordId]
    );
    if (!openLog.rows[0]) throw new Error('No open checkout found for this record');

    await client.query(
      `UPDATE mrd_checkout_log SET returned_at = NOW(), returned_to = $2 WHERE id = $1`,
      [openLog.rows[0].id, returnedTo]
    );
    await client.query(`UPDATE mrd_record_index SET status = 'in_mrd', updated_at = NOW() WHERE id = $1`, [recordId]);

    await client.query('COMMIT');
    return { recordId, returnedAt: new Date().toISOString() };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function listOpenCheckouts({ organizationId } = {}) {
  const values = [];
  let orgFilter = '';
  if (organizationId) {
    values.push(organizationId);
    orgFilter = `AND r.organization_id = $${values.length}`;
  }
  const { rows } = await pool.query(
    `SELECT c.*, r.record_type, r.patient_id
     FROM mrd_checkout_log c
     JOIN mrd_record_index r ON r.id = c.record_id
     WHERE c.returned_at IS NULL ${orgFilter}
     ORDER BY c.checked_out_at ASC`,
    values
  );
  return rows;
}

// ── Retrieval requests ───────────────────────────────────────────────────────

export async function createRetrievalRequest({ recordId = null, patientId, organizationId = null, requestedBy, requestingDepartment = null, priority = 'routine', notes = null }) {
  if (!patientId || !requestedBy) throw new Error('patientId and requestedBy are required');

  const { rows } = await pool.query(
    `INSERT INTO mrd_retrieval_requests
       (record_id, patient_id, organization_id, requested_by, requesting_department, priority, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [recordId, patientId, organizationId, requestedBy, requestingDepartment, priority, notes]
  );
  return rows[0];
}

export async function listRetrievalRequests({ status, organizationId, patientId, limit = 50, offset = 0 } = {}) {
  const clauses = [];
  const values = [];
  const push = (sql, value) => { values.push(value); clauses.push(sql.replace('?', `$${values.length}`)); };

  if (status) push('status = ?', status);
  if (organizationId) push('organization_id = ?', organizationId);
  if (patientId) push('patient_id = ?', patientId);

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  values.push(Math.min(parseInt(limit, 10) || 50, 200));
  values.push(Math.max(parseInt(offset, 10) || 0, 0));

  const { rows } = await pool.query(
    `SELECT * FROM mrd_retrieval_requests ${where} ORDER BY
       CASE priority WHEN 'urgent' THEN 0 ELSE 1 END, created_at ASC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  return rows;
}

export async function updateRetrievalRequestStatus({ id, status, fulfilledBy = null, rejectionReason = null }) {
  const VALID = ['pending', 'in_progress', 'fulfilled', 'rejected', 'cancelled'];
  if (!VALID.includes(status)) throw new Error(`Invalid status: ${status}`);

  const isFulfilled = status === 'fulfilled';
  const { rows } = await pool.query(
    `UPDATE mrd_retrieval_requests
     SET status = $2,
         fulfilled_by = CASE WHEN $3 THEN $4 ELSE fulfilled_by END,
         fulfilled_at = CASE WHEN $3 THEN NOW() ELSE fulfilled_at END,
         rejection_reason = COALESCE($5, rejection_reason),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, status, isFulfilled, fulfilledBy, rejectionReason]
  );
  if (!rows[0]) throw new Error('Retrieval request not found');
  return rows[0];
}

// ── Retention schedule (advisory — nothing here auto-destroys anything) ────

export async function getRetentionSchedule() {
  const { rows } = await pool.query(`SELECT * FROM mrd_retention_schedule ORDER BY record_type ASC`);
  return rows;
}

export async function upsertRetentionPolicy({ recordType, retentionYears, notes = null }) {
  if (!recordType || !retentionYears) throw new Error('recordType and retentionYears are required');

  const { rows } = await pool.query(
    `INSERT INTO mrd_retention_schedule (record_type, retention_years, notes)
     VALUES ($1, $2, $3)
     ON CONFLICT (record_type) DO UPDATE SET retention_years = $2, notes = $3, updated_at = NOW()
     RETURNING *`,
    [recordType, retentionYears, notes]
  );
  return rows[0];
}

// Records past (or approaching) their retention date — flagged for human
// review, per Delivery Principle "retention/destruction is flagged, never
// auto-executed" (Upgrade Plan Phase A2).
export async function listRecordsDueForRetention({ organizationId, withinDays = 0 } = {}) {
  const values = [withinDays];
  let orgFilter = '';
  if (organizationId) {
    values.push(organizationId);
    orgFilter = `AND organization_id = $${values.length}`;
  }
  const { rows } = await pool.query(
    `SELECT * FROM mrd_record_index
     WHERE retention_due_at IS NOT NULL
       AND retention_due_at <= (CURRENT_DATE + ($1 || ' days')::interval)
       AND status != 'destroyed'
       ${orgFilter}
     ORDER BY retention_due_at ASC`,
    values
  );
  return rows;
}

export default {
  indexRecord,
  getRecord,
  listRecords,
  checkoutRecord,
  returnRecord,
  listOpenCheckouts,
  createRetrievalRequest,
  listRetrievalRequests,
  updateRetrievalRequestStatus,
  getRetentionSchedule,
  upsertRetentionPolicy,
  listRecordsDueForRetention,
};
