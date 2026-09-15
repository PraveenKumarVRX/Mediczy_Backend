/**
 * Corporate HMIS Service — Phase 4
 *
 * Covers corporate/TPA referral management, insurance eligibility
 * checks, occupational health fitness certificates, and
 * return-to-work clearance letters.
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';

async function ensureTables() {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS corporate_referrals (
      id                  BIGSERIAL PRIMARY KEY,
      organization_id     BIGINT,
      patient_id          BIGINT NOT NULL,
      admission_id        BIGINT,
      corporate_name      TEXT NOT NULL,
      tpa_name            TEXT,
      policy_number       TEXT,
      employee_id         TEXT,
      referral_code       TEXT,
      pre_auth_number     TEXT,
      pre_auth_amount     NUMERIC(12,2),
      pre_auth_date       DATE,
      approved_procedures TEXT,
      referral_status     TEXT DEFAULT 'pending',  -- pending | approved | denied | expired
      denial_reason       TEXT,
      contacted_by        TEXT,
      contacted_at        TIMESTAMPTZ,
      notes               TEXT,
      referral_data       JSONB DEFAULT '{}'::jsonb,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_corp_referral_patient ON corporate_referrals(patient_id);
    CREATE INDEX IF NOT EXISTS idx_corp_referral_admission ON corporate_referrals(admission_id);

    CREATE TABLE IF NOT EXISTS corporate_eligibility_checks (
      id                BIGSERIAL PRIMARY KEY,
      organization_id   BIGINT,
      patient_id        BIGINT NOT NULL,
      referral_id       BIGINT,
      corporate_name    TEXT,
      policy_number     TEXT,
      employee_id       TEXT,
      check_status      TEXT NOT NULL,  -- eligible | not_eligible | error | pending
      benefit_limit     NUMERIC(12,2),
      used_amount       NUMERIC(12,2),
      balance_amount    NUMERIC(12,2),
      deductible        NUMERIC(12,2),
      copay_percent     NUMERIC(5,2),
      exclusions        TEXT,
      checked_by        TEXT,
      response_data     JSONB DEFAULT '{}'::jsonb,
      checked_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_eligibility_patient ON corporate_eligibility_checks(patient_id);

    CREATE TABLE IF NOT EXISTS fitness_certificates (
      id                BIGSERIAL PRIMARY KEY,
      organization_id   BIGINT,
      patient_id        BIGINT NOT NULL,
      admission_id      BIGINT,
      certificate_type  TEXT DEFAULT 'fitness',  -- fitness | pre_employment | periodic | return_to_work | sick_leave
      issued_by         TEXT NOT NULL,
      doctor_reg_no     TEXT,
      patient_name      TEXT,
      employee_id       TEXT,
      employer_name     TEXT,
      job_description   TEXT,
      examination_date  DATE NOT NULL DEFAULT CURRENT_DATE,
      fitness_status    TEXT NOT NULL,  -- fit | fit_with_restrictions | temporarily_unfit | permanently_unfit
      restrictions      TEXT,
      valid_from        DATE,
      valid_until       DATE,
      remarks           TEXT,
      certificate_data  JSONB DEFAULT '{}'::jsonb,
      signed_at         TIMESTAMPTZ,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_fitness_cert_patient ON fitness_certificates(patient_id);

    CREATE TABLE IF NOT EXISTS return_to_work_clearances (
      id                BIGSERIAL PRIMARY KEY,
      organization_id   BIGINT,
      patient_id        BIGINT NOT NULL,
      admission_id      BIGINT,
      fitness_cert_id   BIGINT,
      issued_by         TEXT NOT NULL,
      employer_name     TEXT,
      return_date       DATE NOT NULL,
      full_duty         BOOLEAN DEFAULT TRUE,
      restricted_duty   TEXT,
      follow_up_date    DATE,
      clearance_notes   TEXT,
      signed_at         TIMESTAMPTZ,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_rtw_patient ON return_to_work_clearances(patient_id);
  `);
}
ensureTables().catch(e => console.warn('[corporate-hmis] table init:', e.message));

// ── Corporate referrals ───────────────────────────────────────────────────────

export async function createReferral(data) {
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
  const {
    organizationId, patientId, admissionId, certificateType, issuedBy,
    doctorRegNo, patientName, employeeId, employerName, jobDescription,
    examinationDate, fitnessStatus, restrictions, validFrom, validUntil,
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
       :remarks, :data::jsonb, NOW()
     ) RETURNING *`,
    {
      replacements: {
        orgId: organizationId || null, patientId, admId: admissionId || null,
        type: certificateType || 'fitness', by: issuedBy,
        regNo: doctorRegNo || null, name: patientName || null, empId: employeeId || null,
        employer: employerName || null, job: jobDescription || null,
        examDate: examinationDate || new Date(), status: fitnessStatus,
        restrictions: restrictions || null, from: validFrom || null, until: validUntil || null,
        remarks: remarks || null, data: JSON.stringify(certificateData || {})
      },
      type: QueryTypes.INSERT
    }
  );
  return result[0];
}

export async function getFitnessCertificatesByPatient(patientId, organizationId) {
  return sequelize.query(
    `SELECT * FROM fitness_certificates WHERE patient_id = :patientId AND organization_id = :organizationId ORDER BY created_at DESC`,
    { replacements: { patientId, organizationId }, type: QueryTypes.SELECT }
  );
}

export async function getFitnessCertificateById(id) {
  const rows = await sequelize.query(
    `SELECT * FROM fitness_certificates WHERE id = :id`,
    { replacements: { id }, type: QueryTypes.SELECT }
  );
  return rows[0] || null;
}

/** A clinic doctor's own recently-issued certificates, across whichever employer each patient works for. */
export async function getFitnessCertificatesIssuedByClinicStaff(clinicStaffId, limit = 50) {
  return sequelize.query(
    `SELECT * FROM fitness_certificates
      WHERE certificate_data->>'issuedByClinicStaffId' = :clinicStaffId
      ORDER BY created_at DESC LIMIT :limit`,
    { replacements: { clinicStaffId: String(clinicStaffId), limit }, type: QueryTypes.SELECT }
  );
}

/** Every certificate an employer's HR should be able to see, across all their employees. */
export async function getFitnessCertificatesForOrganization(organizationId, limit = 200) {
  return sequelize.query(
    `SELECT * FROM fitness_certificates WHERE organization_id = :organizationId ORDER BY created_at DESC LIMIT :limit`,
    { replacements: { organizationId, limit }, type: QueryTypes.SELECT }
  );
}

/** An employee's own certificates, regardless of which employer/clinic issued them. */
export async function getFitnessCertificatesForPatientOnly(patientId, limit = 100) {
  return sequelize.query(
    `SELECT * FROM fitness_certificates WHERE patient_id = :patientId ORDER BY created_at DESC LIMIT :limit`,
    { replacements: { patientId, limit }, type: QueryTypes.SELECT }
  );
}

// ── Return-to-work clearance ──────────────────────────────────────────────────

export async function issueReturnToWorkClearance({
  organizationId, patientId, admissionId, fitnessCertId,
  issuedBy, employerName, returnDate, fullDuty, restrictedDuty,
  followUpDate, clearanceNotes
}) {
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
