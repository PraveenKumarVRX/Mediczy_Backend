/**
 * Corporate HMIS Service — Phase 4
 *
 * Covers corporate/TPA referral management, insurance eligibility
 * checks, occupational health fitness certificates, and
 * return-to-work clearance letters.
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';

import { schemaVerifier, tableNameFromSchemaRow } from '../utils/schema-guard.js';

// Re-exported because callers and tests read information_schema rows through
// it: with this Sequelize/Postgres pairing a row can arrive as a positional
// array rather than an object, which once made every present table look missing.
export { tableNameFromSchemaRow };
const SCHEMA_TABLES = ['corporate_referrals', 'corporate_eligibility_checks', 'fitness_certificates', 'return_to_work_clearances'];

// Schema is owned by the migration, not created here. A missing table
// fails closed with SCHEMA_NOT_MIGRATED naming what to apply, instead of
// this service quietly building a table the migration never shaped.
const ensureTables = schemaVerifier({
  sequelize: sequelize,
  tables: SCHEMA_TABLES,
  code: 'SCHEMA_NOT_MIGRATED',
  message: 'Apply migration 20261015004400-corporate-hmis-governance before using corporate HMIS',
});

// ── Corporate referrals ───────────────────────────────────────────────────────

export async function createReferral(data) {
  await ensureTables();
  const {
    organizationId, patientId, admissionId, corporateName, tpaName,
    policyNumber, employeeId, referralCode, preAuthNumber, preAuthAmount,
    preAuthDate, approvedProcedures, contactedBy, notes, referralData
  } = data;

  const [result] = await sequelize.query(
    `INSERT INTO corporate_referrals (
       organization_id, patient_id, admission_id, corporate_name, tpa_name,
       policy_number, employee_id, referral_code, pre_auth_number, pre_auth_amount,
       pre_auth_date, approved_procedures, contacted_by, notes, referral_data
     ) VALUES (
       :orgId, :patientId, :admId, :corp, :tpa,
       :policy, :empId, :code, :auth, :authAmount,
       :authDate, :procedures, :by, :notes, :data::jsonb
     ) RETURNING *`,
    {
      replacements: {
        orgId: organizationId || null, patientId, admId: admissionId || null,
        corp: corporateName, tpa: tpaName || null,
        policy: policyNumber || null, empId: employeeId || null,
        code: referralCode || null, auth: preAuthNumber || null,
        authAmount: preAuthAmount || null, authDate: preAuthDate || null,
        procedures: approvedProcedures || null, by: contactedBy || null,
        notes: notes || null, data: JSON.stringify(referralData || {})
      },
      type: QueryTypes.INSERT
    }
  );
  return result[0];
}

export async function updateReferralStatus(referralId, organizationId, { status, denialReason, preAuthNumber, preAuthAmount }) {
  await ensureTables();
  // Sequelize's UPDATE query type returns [results, affectedRowCount] for
  // Postgres (verified: a bare number, not a { rowCount } object).
  const [, affectedRowCount] = await sequelize.query(
    `UPDATE corporate_referrals
     SET referral_status = :status,
         denial_reason   = COALESCE(:denial, denial_reason),
         pre_auth_number = COALESCE(:auth, pre_auth_number),
         pre_auth_amount = COALESCE(:amount, pre_auth_amount),
         updated_at = NOW()
     WHERE id = :id AND organization_id = :organizationId`,
    {
      replacements: {
        id: referralId, organizationId, status,
        denial: denialReason || null, auth: preAuthNumber || null, amount: preAuthAmount || null
      },
      type: QueryTypes.UPDATE
    }
  );
  if (!affectedRowCount) {
    const err = new Error('Referral not found for this corporate');
    err.statusCode = 404;
    throw err;
  }
  return { success: true };
}

export async function getReferralsByPatient(patientId, organizationId) {
  await ensureTables();
  return sequelize.query(
    `SELECT * FROM corporate_referrals WHERE patient_id = :patientId AND organization_id = :organizationId ORDER BY created_at DESC`,
    { replacements: { patientId, organizationId }, type: QueryTypes.SELECT }
  );
}

// ── Eligibility checks ────────────────────────────────────────────────────────

export async function recordEligibilityCheck({
  organizationId, patientId, referralId, corporateName, policyNumber,
  employeeId, checkStatus, benefitLimit, usedAmount, deductible, copayPercent,
  exclusions, checkedBy, responseData
}) {
  await ensureTables();
  const balanceAmount = parseFloat(benefitLimit || 0) - parseFloat(usedAmount || 0);

  const [result] = await sequelize.query(
    `INSERT INTO corporate_eligibility_checks (
       organization_id, patient_id, referral_id, corporate_name, policy_number,
       employee_id, check_status, benefit_limit, used_amount, balance_amount,
       deductible, copay_percent, exclusions, checked_by, response_data
     ) VALUES (
       :orgId, :patientId, :refId, :corp, :policy,
       :empId, :status, :limit, :used, :balance,
       :deductible, :copay, :exclusions, :by, :data::jsonb
     ) RETURNING *`,
    {
      replacements: {
        orgId: organizationId || null, patientId, refId: referralId || null,
        corp: corporateName || null, policy: policyNumber || null,
        empId: employeeId || null, status: checkStatus,
        limit: benefitLimit || null, used: usedAmount || null, balance: balanceAmount,
        deductible: deductible || null, copay: copayPercent || null,
        exclusions: exclusions || null, by: checkedBy || null,
        data: JSON.stringify(responseData || {})
      },
      type: QueryTypes.INSERT
    }
  );
  return result[0];
}

// ── Fitness certificates ──────────────────────────────────────────────────────

export async function issueFitnessCertificate(data) {
  await ensureTables();
  const {
    organizationId, patientId, admissionId, certificateType, issuedBy,
    doctorRegNo, patientName, employeeId, employerName, jobDescription,
    examinationDate, issuedDate, fitnessStatus, restrictions, validFrom, validUntil,
    remarks, certificateData
  } = data;

  const [result] = await sequelize.query(
    `INSERT INTO fitness_certificates (
       organization_id, patient_id, admission_id, certificate_type, issued_by,
       doctor_reg_no, patient_name, employee_id, employer_name, job_description,
       examination_date, fitness_status, restrictions, valid_from, valid_until,
       remarks, certificate_data, signed_at
     ) VALUES (
       :orgId, :patientId, :admId, :type, :by,
       :regNo, :name, :empId, :employer, :job,
       :examDate, :status, :restrictions, :from, :until,
       :remarks, :data::jsonb, COALESCE(:signedAt::timestamptz, NOW())
     ) RETURNING *`,
    {
      replacements: {
        orgId: organizationId || null, patientId, admId: admissionId || null,
        type: certificateType || 'fitness', by: issuedBy,
        regNo: doctorRegNo || null, name: patientName || null, empId: employeeId || null,
        employer: employerName || null, job: jobDescription || null,
        examDate: examinationDate || new Date(), status: fitnessStatus,
        restrictions: restrictions || null, from: validFrom || null, until: validUntil || null,
        remarks: remarks || null, data: JSON.stringify(certificateData || {}), signedAt: issuedDate || null
      },
      type: QueryTypes.INSERT
    }
  );
  return result[0];
}

export async function getFitnessCertificatesByPatient(patientId, organizationId) {
  await ensureTables();
  const rows = await sequelize.query(
    `SELECT * FROM fitness_certificates WHERE patient_id = :patientId AND organization_id = :organizationId ORDER BY created_at DESC`,
    { replacements: { patientId, organizationId }, type: QueryTypes.SELECT }
  );
  return rows.map(certificateListEntry);
}

export async function getFitnessCertificateById(id) {
  await ensureTables();
  const rows = await sequelize.query(
    `SELECT * FROM fitness_certificates WHERE id = :id`,
    { replacements: { id }, type: QueryTypes.SELECT }
  );
  return rows[0] || null;
}

/** Hard delete — no soft-delete column exists on this table. Callers must check the certificate
 * belongs to the actor's organization before calling this; this function does not re-check.
 * Uses RETURNING id (read back via SELECT query type) rather than relying on a raw DELETE's
 * affected-row count, whose shape is inconsistent across Sequelize query types. */
export async function deleteFitnessCertificate(id) {
  await ensureTables();
  const rows = await sequelize.query(
    `DELETE FROM fitness_certificates WHERE id = :id RETURNING id`,
    { replacements: { id }, type: QueryTypes.SELECT }
  );
  return rows.length > 0;
}

/** A clinic doctor's own recently-issued certificates, across whichever employer each patient works for. */
export async function getFitnessCertificatesIssuedByClinicStaff(clinicStaffId, limit = 50) {
  await ensureTables();
  return sequelize.query(
    `SELECT * FROM fitness_certificates
      WHERE certificate_data->>'issuedByClinicStaffId' = :clinicStaffId
      ORDER BY created_at DESC LIMIT :limit`,
    { replacements: { clinicStaffId: String(clinicStaffId), limit }, type: QueryTypes.SELECT }
  );
}

/** Every certificate an employer's HR should be able to see, across all their employees. */
export async function getFitnessCertificatesForOrganization(organizationId, limit = 200) {
  await ensureTables();
  const rows = await sequelize.query(
    `SELECT * FROM fitness_certificates WHERE organization_id = :organizationId ORDER BY created_at DESC LIMIT :limit`,
    { replacements: { organizationId, limit }, type: QueryTypes.SELECT }
  );
  return rows.map(certificateListEntry);
}

/** An employee's own certificates, regardless of which employer/clinic issued them. */
export async function getFitnessCertificatesForPatientOnly(patientId, limit = 100) {
  await ensureTables();
  const rows = await sequelize.query(
    `SELECT * FROM fitness_certificates WHERE patient_id = :patientId ORDER BY created_at DESC LIMIT :limit`,
    { replacements: { patientId, limit }, type: QueryTypes.SELECT }
  );
  return rows.map(certificateListEntry);
}

// ── Return-to-work clearance ──────────────────────────────────────────────────

export async function issueReturnToWorkClearance({
  organizationId, patientId, admissionId, fitnessCertId,
  issuedBy, employerName, returnDate, fullDuty, restrictedDuty,
  followUpDate, clearanceNotes
}) {
  await ensureTables();
  const [result] = await sequelize.query(
    `INSERT INTO return_to_work_clearances (
       organization_id, patient_id, admission_id, fitness_cert_id,
       issued_by, employer_name, return_date, full_duty, restricted_duty,
       follow_up_date, clearance_notes, signed_at
     ) VALUES (
       :orgId, :patientId, :admId, :certId,
       :by, :employer, :date, :fullDuty, :restricted,
       :followUp, :notes, NOW()
     ) RETURNING *`,
    {
      replacements: {
        orgId: organizationId || null, patientId, admId: admissionId || null,
        certId: fitnessCertId || null, by: issuedBy, employer: employerName || null,
        date: returnDate, fullDuty: fullDuty ?? true, restricted: restrictedDuty || null,
        followUp: followUpDate || null, notes: clearanceNotes || null
      },
      type: QueryTypes.INSERT
    }
  );
  return result[0];
}

/** Fetch only requested certificates within the authenticated corporate. */
export async function getCorporateCertificatesByIds(organizationId, ids) {
  await ensureTables();
  return sequelize.query(
    `SELECT * FROM fitness_certificates WHERE organization_id = :organizationId AND id IN (:ids) ORDER BY id`,
    { replacements: { organizationId, ids }, type: QueryTypes.SELECT }
  );
}

/** Encryption storage metadata is for server-side retrieval only. */
export function certificateListEntry(certificate) {
  const data = certificate.certificate_data || {};
  const { storage, uploadedBy, ...publicData } = data;
  return { ...certificate, certificate_data: publicData };
}
