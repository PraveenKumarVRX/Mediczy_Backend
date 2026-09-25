/**
 * Hospital MRD screen, backed by the real MRD tables (mrd_record_index, digitization_queue).
 *
 * The MRD module (migrations/mrd-module.migration.js, services/mrd.service.js) deliberately records only WHERE a
 * record is and WHO has it — not clinical content. So this returns only what MRD actually owns, plus the patient's
 * name and UHID read from the patient tables. Fields MRD does not hold (department, attending doctor, diagnosis,
 * admission/discharge dates) are omitted rather than invented.
 *
 * `users` has forced row-level security, so every read that joins it runs inside a tenant-scoped transaction.
 */
import pool from '../db/pgPool.js';
import { withRlsTransaction } from '../middleware/rls-context.middleware.js';
import { indexRecord } from './mrd.service.js';

export const formatMrdNumber = (id, createdAt) =>
  `MRD-${new Date(createdAt || Date.now()).getUTCFullYear()}-${String(id).padStart(6, '0')}`;

const fullName = (row) => [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || null;

export function toApiRecord(row) {
  return {
    id: row.id,
    mrdNumber: formatMrdNumber(row.id, row.created_at),
    patientId: row.patient_id,
    patientName: fullName(row),
    uhid: row.uhid || null,
    recordType: row.record_type,
    format: row.format,
    location: row.location,
    status: row.status,
    retentionDueAt: row.retention_due_at || null,
    totalPages: row.total_pages ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const SELECT_RECORD = `
  SELECT i.id, i.patient_id, i.record_type, i.format, i.location, i.status, i.retention_due_at,
         i.created_at, i.updated_at,
         u."firstName" AS first_name, u."lastName" AS last_name,
         COALESCE(p.mrn, p.unique_id) AS uhid,
         q.total_pages
    FROM mrd_record_index i
    LEFT JOIN users u ON u.id = i.patient_id
    LEFT JOIN patients p ON p."userId" = i.patient_id
    LEFT JOIN LATERAL (
      SELECT d.total_pages FROM digitization_queue d
       WHERE d.record_id = i.id AND d.hospital_id = i.organization_id
       ORDER BY d.id DESC LIMIT 1
    ) q ON TRUE`;

const scoped = (orgId, work) => withRlsTransaction(pool, { orgId, userId: 0, isPlatformAdmin: false }, work);

export async function listMrdRecords(orgId, { search, limit = 50 } = {}) {
  const params = [orgId];
  let where = 'i.organization_id = $1';
  const term = String(search || '').trim();
  if (term) {
    params.push(`%${term}%`);
    where += ` AND (concat_ws(' ', u."firstName", u."lastName") ILIKE $${params.length}
                 OR COALESCE(p.mrn, p.unique_id, '') ILIKE $${params.length}
                 OR lpad(i.id::text, 6, '0') ILIKE $${params.length})`;
  }
  params.push(Math.min(Math.max(Number.parseInt(limit, 10) || 50, 1), 200));
  return scoped(orgId, async (client) => {
    const { rows } = await client.query(`${SELECT_RECORD} WHERE ${where} ORDER BY i.updated_at DESC LIMIT $${params.length}`, params);
    return rows.map(toApiRecord);
  });
}

export async function getMrdRecord(orgId, id) {
  return scoped(orgId, async (client) => {
    const { rows } = await client.query(`${SELECT_RECORD} WHERE i.id = $1 AND i.organization_id = $2`, [id, orgId]);
    return rows[0] ? toApiRecord(rows[0]) : null;
  });
}

/**
 * Index a physical/digital record for a patient identified by UHID (patients.mrn / unique_id) or, when no UHID has
 * been assigned yet, by patients.id. Throws {status, message} for caller-fixable input.
 */
export async function createMrdRecord(orgId, { uhid, patientId, recordType, location, format = 'physical' }, indexedBy = null) {
  const key = String(uhid || '').trim();
  const pid = Number.parseInt(patientId, 10);
  if (!key && !pid) throw Object.assign(new Error('uhid (or patientId) is required'), { status: 400 });
  if (!String(recordType || '').trim()) throw Object.assign(new Error('recordType is required'), { status: 400 });
  if (!['physical', 'digital'].includes(format)) throw Object.assign(new Error("format must be 'physical' or 'digital'"), { status: 400 });

  // Resolved inside the tenant context: a patient belonging to another hospital is simply not found.
  const patient = await scoped(orgId, async (client) => {
    const { rows } = pid
      ? await client.query(`SELECT p."userId" AS id FROM patients p JOIN users u ON u.id = p."userId" WHERE p.id = $1 LIMIT 1`, [pid])
      : await client.query(`SELECT p."userId" AS id FROM patients p JOIN users u ON u.id = p."userId" WHERE p.mrn = $1 OR p.unique_id = $1 LIMIT 1`, [key]);
    return rows[0] || null;
  });
  if (!patient) {
    throw Object.assign(new Error(pid ? `No patient ${pid} in this hospital` : `No patient with UHID ${key} in this hospital (UHIDs must be assigned to patients first)`), { status: 404 });
  }

  const row = await indexRecord({
    patientId: patient.id,
    organizationId: orgId,
    recordType: String(recordType).trim(),
    format,
    location: location ? String(location).trim() : null,
    indexedBy,
  });
  return getMrdRecord(orgId, row.id);
}

export async function queueForDigitization(orgId, recordId) {
  const record = await getMrdRecord(orgId, recordId);
  if (!record) throw Object.assign(new Error('MRD record not found'), { status: 404 });
  const { rows } = await pool.query(
    `INSERT INTO digitization_queue (record_id, mrd_number, patient_name, total_pages, status, priority, hospital_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'pending', 'normal', $5, NOW(), NOW()) RETURNING *`,
    [record.id, record.mrdNumber, record.patientName, record.totalPages, orgId]
  );
  return rows[0];
}
