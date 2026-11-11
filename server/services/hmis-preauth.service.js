/**
 * HMIS Pre-Auth Service — Phase 4 gap
 *
 * Links insurance pre-authorisation to an IP admission + OT booking.
 * Tracks pre-auth request → approval → claim bundle lifecycle
 * tied directly to the new ADT/OT data model.
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';

import { schemaVerifier, guardedQuery } from '../utils/schema-guard.js';
const SCHEMA_TABLES = ['hmis_preauth_requests', 'hmis_preauth_documents'];

// Owned by the migration and only verified here: creating these on demand
// would let a skipped migration look healthy on tables without its indexes
// and constraints, and would let a request hold an ACCESS EXCLUSIVE lock.
const ensureTables = schemaVerifier({
  sequelize: sequelize,
  tables: SCHEMA_TABLES,
  code: 'SCHEMA_NOT_MIGRATED',
  message: 'Apply the platform-edge governance migrations before using this service',
});


const guardedSequelize = guardedQuery(sequelize, 'Apply the platform-edge governance migrations before using this service');

// Reported at startup so an unmigrated environment shows in the log, not
// only when the first request fails. Boot is not blocked.

// ── Create pre-auth request ───────────────────────────────────────────────────

export async function createPreauthRequest(data) {
  const {
    organizationId, admissionId, otBookingId, patientId,
    insurerName, tpaName, policyNumber, memberId, corporateReferralId,
    diagnosisCodes, procedureCodes, estimatedAmount, submittedBy,
    notes, requestData
  } = data;

  const [result] = await guardedSequelize(
    `INSERT INTO hmis_preauth_requests (
       organization_id, admission_id, ot_booking_id, patient_id,
       insurer_name, tpa_name, policy_number, member_id, corporate_referral_id,
       diagnosis_codes, procedure_codes, estimated_amount, submitted_by, notes, request_data
     ) VALUES (
       :orgId, :admId, :bookingId, :patientId,
       :insurer, :tpa, :policy, :member, :corpRefId,
       :dx, :proc, :amount, :by, :notes, :data::jsonb
     ) RETURNING *`,
    {
      replacements: {
        orgId: organizationId || null, admId: admissionId,
        bookingId: otBookingId || null, patientId: patientId || null,
        insurer: insurerName, tpa: tpaName || null,
        policy: policyNumber || null, member: memberId || null,
        corpRefId: corporateReferralId || null,
        dx: diagnosisCodes || null, proc: procedureCodes || null,
        amount: estimatedAmount || null, by: submittedBy || null,
        notes: notes || null, data: JSON.stringify(requestData || {})
      },
      type: QueryTypes.INSERT
    }
  );
  return result[0];
}

// ── Submit (sends to insurer) ─────────────────────────────────────────────────

export async function submitPreauth(preauthId, { submittedBy }) {
  await guardedSequelize(
    `UPDATE hmis_preauth_requests
     SET status = 'submitted', submitted_by = :by, submitted_at = NOW(), updated_at = NOW()
     WHERE id = :id AND status IN ('draft','pending')`,
    { replacements: { id: preauthId, by: submittedBy || null }, type: QueryTypes.UPDATE }
  );
  return { success: true };
}

// ── Update approval / denial ──────────────────────────────────────────────────

export async function updatePreauthStatus(preauthId, {
  status, preAuthNumber, approvedAmount, preAuthDate, validityDays,
  denialReason, denialCode, approvedByTpa
}) {
  const validUntil = preAuthDate && validityDays
    ? new Date(new Date(preAuthDate).getTime() + validityDays * 86400000).toISOString().split('T')[0]
    : null;

  await guardedSequelize(
    `UPDATE hmis_preauth_requests
     SET status           = :status,
         pre_auth_number  = COALESCE(:authNum, pre_auth_number),
         approved_amount  = COALESCE(:amount, approved_amount),
         pre_auth_date    = COALESCE(:authDate, pre_auth_date),
         validity_days    = COALESCE(:validity, validity_days),
         valid_until      = COALESCE(:validUntil, valid_until),
         denial_reason    = COALESCE(:denial, denial_reason),
         denial_code      = COALESCE(:code, denial_code),
         approved_by_tpa  = COALESCE(:tpa, approved_by_tpa),
         approved_at      = CASE WHEN :status IN ('approved','partial') THEN NOW() ELSE approved_at END,
         updated_at       = NOW()
     WHERE id = :id`,
    {
      replacements: {
        id: preauthId, status,
        authNum: preAuthNumber || null, amount: approvedAmount || null,
        authDate: preAuthDate || null, validity: validityDays || null,
        validUntil, denial: denialReason || null, code: denialCode || null,
        tpa: approvedByTpa || null
      },
      type: QueryTypes.UPDATE
    }
  );
  return { success: true };
}

// ── Attach document ───────────────────────────────────────────────────────────

export async function attachDocument({ preauthId, documentType, fileName, fileUrl, uploadedBy }) {
  const [result] = await guardedSequelize(
    `INSERT INTO hmis_preauth_documents (preauth_id, document_type, file_name, file_url, uploaded_by)
     VALUES (:id, :type, :name, :url, :by) RETURNING *`,
    {
      replacements: {
        id: preauthId, type: documentType, name: fileName || null,
        url: fileUrl || null, by: uploadedBy || null
      },
      type: QueryTypes.INSERT
    }
  );
  return result[0];
}

// ── Queries ───────────────────────────────────────────────────────────────────

export async function getPreauthByAdmission(admissionId) {
  return guardedSequelize(
    `SELECT r.*, array_agg(row_to_json(d)) FILTER (WHERE d.id IS NOT NULL) as documents
     FROM hmis_preauth_requests r
     LEFT JOIN hmis_preauth_documents d ON d.preauth_id = r.id
     WHERE r.admission_id = :admId
     GROUP BY r.id
     ORDER BY r.created_at DESC`,
    { replacements: { admId: admissionId }, type: QueryTypes.SELECT }
  );
}

export async function getPreauthList(organizationId, { status, limit = 50, offset = 0 } = {}) {
  let where = 'r.organization_id = :orgId';
  const replacements = { orgId: organizationId, limit, offset };
  if (status) { where += ' AND r.status = :status'; replacements.status = status; }

  return guardedSequelize(
    `SELECT r.*, p.first_name || ' ' || p.last_name as patient_name,
            a.admission_number
     FROM hmis_preauth_requests r
     LEFT JOIN patients p ON p.id = r.patient_id
     LEFT JOIN ip_admissions a ON a.id = r.admission_id
     WHERE ${where}
     ORDER BY r.created_at DESC
     LIMIT :limit OFFSET :offset`,
    { replacements, type: QueryTypes.SELECT }
  );
}

export async function getPreauthById(preauthId) {
  const [row] = await guardedSequelize(
    `SELECT r.*, array_agg(row_to_json(d)) FILTER (WHERE d.id IS NOT NULL) as documents
     FROM hmis_preauth_requests r
     LEFT JOIN hmis_preauth_documents d ON d.preauth_id = r.id
     WHERE r.id = :id GROUP BY r.id LIMIT 1`,
    { replacements: { id: preauthId }, type: QueryTypes.SELECT }
  );
  return row || null;
}
