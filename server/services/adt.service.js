/**
 * ADT Service — Admit / Discharge / Transfer
 *
 * Implements HL7 ADT event model:
 *   A01 Admit | A02 Transfer | A03 Discharge
 *   A04 OP Register | A05 Pre-Admit
 *   A11 Cancel Admit | A13 Cancel Discharge
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes, Op } from 'sequelize';
import { consumeReservation } from './bed-allocation.service.js';
import { hasSignedReconciliation } from './med-reconciliation.service.js';
import { DISCHARGE_OVERRIDE_ROLES } from '../utils/discharge-policy.js';
import { reconciliationRequired } from './prescription-safety.service.js';
import { isComplexDiagnosis, autoInviteSpecialists } from './careos/care-team.service.js';
import { appendClinicalEvent } from './careos/clinical-timeline.service.js';
import { autoAdvancePathway } from './careos/treatment-pathway.service.js';
import { archiveCase, flagReadmissionIfRecent } from './careos/hospital-memory.service.js';
import { dispatchEvent } from './workflow-ai-orchestrator.service.js';
import { publishEvent, KAFKA_TOPICS } from '../config/kafka.js';

import { schemaVerifier } from '../utils/schema-guard.js';
// ── B4: Discharge readiness table bootstrap ───────────────────────────────────

const SCHEMA_TABLES = ['discharge_readiness_items', 'discharge_overrides'];

// Owned by the migration, verified here. A missing table fails closed with
// SCHEMA_NOT_MIGRATED instead of this service creating a table the
// migration never shaped.
const ensureDischargeReadinessTables = schemaVerifier({
  sequelize,
  tables: SCHEMA_TABLES,
  code: 'SCHEMA_NOT_MIGRATED',
  message: 'Apply migration 20261015003100-discharge-readiness-governance before using discharge readiness',
});


// Mandatory discharge dimensions
const MANDATORY_DISCHARGE_DIMENSIONS = [
  'clinical',
  'nursing_education',
  'medication_reconciliation',
  'billing',
  'discharge_summary',
];


// ── Discharge readiness helpers ───────────────────────────────────────────────

export async function initDischargeReadiness(admissionId, organizationId) {
  await ensureDischargeReadinessTables();
  const defaults = [
    { dimension: 'clinical',                label: 'Clinician signed discharge order',          mandatory: true },
    { dimension: 'nursing_education',       label: 'Nurse completed patient discharge education', mandatory: true },
    { dimension: 'medication_reconciliation', label: 'Discharge medications reconciled and dispensed', mandatory: true },
    { dimension: 'billing',                 label: 'Final bill prepared and patient notified',   mandatory: true },
    { dimension: 'tpa',                     label: 'TPA/insurance discharge clearance',          mandatory: false },
    { dimension: 'discharge_summary',       label: 'Discharge summary signed by doctor',         mandatory: true },
  ];

  for (const item of defaults) {
    await sequelize.query(
      `INSERT INTO discharge_readiness_items (admission_id, organization_id, dimension, label, mandatory)
       VALUES (:admId, :orgId, :dim, :label, :mandatory)
       ON CONFLICT DO NOTHING`,
      {
        replacements: { admId: admissionId, orgId: organizationId, dim: item.dimension, label: item.label, mandatory: item.mandatory },
        type: QueryTypes.INSERT
      }
    );
  }
}

export async function getDischargeReadiness(admissionId, organizationId) {
  await ensureDischargeReadinessTables();
  const items = await sequelize.query(
    `SELECT * FROM discharge_readiness_items WHERE admission_id = :admId ORDER BY mandatory DESC, dimension`,
    { replacements: { admId: admissionId }, type: QueryTypes.SELECT }
  );
  const mandatoryPending = items.filter(i => i.mandatory && !i.is_complete);
  return {
    admissionId,
    items,
    ready: mandatoryPending.length === 0,
    mandatoryPending: mandatoryPending.map(i => ({ dimension: i.dimension, label: i.label }))
  };
}

export async function updateReadinessItem(admissionId, dimension, { completedBy, notes } = {}) {
  await ensureDischargeReadinessTables();
  await sequelize.query(
    `UPDATE discharge_readiness_items
     SET is_complete = TRUE, completed_by = :by, completed_at = NOW(), notes = :notes, updated_at = NOW()
     WHERE admission_id = :admId AND dimension = :dim`,
    { replacements: { admId: admissionId, dim: dimension, by: completedBy || null, notes: notes || null }, type: QueryTypes.UPDATE }
  );

  // Recompute the Living Treatment Pathway now that a readiness item changed.
  const [admission] = await sequelize.query(
    `SELECT organization_id, patient_id FROM ip_admissions WHERE id = :admId`,
    { replacements: { admId: admissionId }, type: QueryTypes.SELECT }
  ).catch(() => [null]);
  if (admission) {
    const readiness = await getDischargeReadiness(admissionId, admission.organization_id);
    autoAdvancePathway(admission.patient_id, admission.organization_id, admissionId, {
      readinessReady: readiness.ready,
    }).catch((err) => console.warn('[adt.service] pathway auto-advance failed:', err.message));
  }

  return { success: true };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function pad(n, len = 6) {
  return String(n).padStart(len, '0');
}

async function generateAdmissionNumber(organizationId) {
  const prefix = `IP${new Date().getFullYear()}`;
  const [row] = await sequelize.query(
    `SELECT COUNT(*) as cnt FROM ip_admissions WHERE organization_id = :orgId AND EXTRACT(YEAR FROM admission_datetime) = EXTRACT(YEAR FROM NOW())`,
    { replacements: { orgId: organizationId }, type: QueryTypes.SELECT }
  );
  const seq = parseInt(row.cnt, 10) + 1;
  return `${prefix}${pad(seq)}`;
}

async function recordEvent(tx, { organizationId, admissionId, patientId, eventType, fromLocation, toLocation, performedBy, reason, metadata }) {
  await sequelize.query(
    `INSERT INTO adt_events (organization_id, admission_id, patient_id, event_type, from_location, to_location, performed_by, reason, metadata, event_datetime)
     VALUES (:orgId, :admissionId, :patientId, :eventType, :fromLoc::jsonb, :toLoc::jsonb, :performedBy, :reason, :meta::jsonb, NOW())`,
    {
      replacements: {
        orgId: organizationId,
        admissionId,
        patientId,
        eventType,
        fromLoc: JSON.stringify(fromLocation || null),
        toLoc: JSON.stringify(toLocation || null),
        performedBy: performedBy || null,
        reason: reason || null,
        meta: JSON.stringify(metadata || {})
      },
      type: QueryTypes.INSERT,
      transaction: tx
    }
  );
}

async function freeBed(tx, bedId) {
  if (!bedId) return;
  await sequelize.query(
    `UPDATE beds SET status = 'available', patient_id = NULL, current_admission_id = NULL, released_at = NOW() WHERE id = :bedId`,
    { replacements: { bedId }, type: QueryTypes.UPDATE, transaction: tx }
  );
}

async function occupyBed(tx, bedId, patientId, admissionId) {
  if (!bedId) return;
  await sequelize.query(
    `UPDATE beds SET status = 'occupied', patient_id = :patientId, current_admission_id = :admissionId, assigned_at = NOW() WHERE id = :bedId`,
    { replacements: { bedId, patientId, admissionId }, type: QueryTypes.UPDATE, transaction: tx }
  );
}

// ── Core operations ───────────────────────────────────────────────────────────

export async function admitPatient({
  organizationId,
  patientId,
  admissionType = 'elective',
  admittingDoctorId,
  admissionDiagnosis,
  wardId,
  bedId,
  bedReservationToken,          // B1: required for elective admissions
  insuranceClaimId,
  corporateAccountId,
  referralSource = 'self',
  referralDoctor,
  expectedLosDays,
  mlcCase = false,
  mlcNumber,
  depositAmount = 0,
  packageId,
  sourceConsultationId,
  sourceErId,
  notes,
  performedBy
}) {
  await ensureDischargeReadinessTables();
  // B1: Validate reservation token before entering transaction.
  // Emergency admissions bypass the token requirement.
  if (bedId && admissionType !== 'emergency') {
    if (!bedReservationToken) {
      throw new Error('A bed reservation token is required before admitting. Call POST /api/v1/beds/reserve first.');
    }
    await consumeReservation(bedReservationToken, bedId, organizationId);
  }

  const tx = await sequelize.transaction();
  try {
    const admissionNumber = await generateAdmissionNumber(organizationId);

    const [result] = await sequelize.query(
      `INSERT INTO ip_admissions (
        organization_id, patient_id, admission_number, admission_type, admission_datetime,
        admitting_doctor_id, admission_diagnosis, ward_id, bed_id,
        insurance_claim_id, corporate_account_id, referral_source, referral_doctor,
        expected_los_days, mlc_case, mlc_number, deposit_amount, package_id,
        source_consultation_id, source_er_id, notes, status, created_at, updated_at
      ) VALUES (
        :orgId, :patientId, :admNo, :admType, NOW(),
        :doctorId, :diagnosis, :wardId, :bedId,
        :insuranceId, :corporateId, :refSource, :refDoctor,
        :losdays, :mlc, :mlcNum, :deposit, :pkgId,
        :srcConsult, :srcEr, :notes, 'admitted', NOW(), NOW()
      ) RETURNING *`,
      {
        replacements: {
          orgId: organizationId, patientId, admNo: admissionNumber,
          admType: admissionType, doctorId: admittingDoctorId || null,
          diagnosis: admissionDiagnosis || null, wardId: wardId || null, bedId: bedId || null,
          insuranceId: insuranceClaimId || null, corporateId: corporateAccountId || null,
          refSource: referralSource, refDoctor: referralDoctor || null,
          losdays: expectedLosDays || null, mlc: mlcCase, mlcNum: mlcNumber || null,
          deposit: depositAmount, pkgId: packageId || null,
          srcConsult: sourceConsultationId || null, srcEr: sourceErId || null,
          notes: notes || null
        },
        type: QueryTypes.INSERT,
        transaction: tx
      }
    );

    const admission = result[0];
    await occupyBed(tx, bedId, patientId, admission.id);
    await recordEvent(tx, {
      organizationId, admissionId: admission.id, patientId,
      eventType: 'A01',
      toLocation: wardId ? { ward_id: wardId, bed_id: bedId } : null,
      performedBy, reason: admissionDiagnosis, metadata: { admissionNumber }
    });

    await tx.commit();

    appendClinicalEvent({
      organizationId, patientId, admissionId: admission.id,
      eventType: 'admission',
      title: `Admitted (${admissionType}) — ${admissionNumber}`,
      body: admissionDiagnosis || null,
      actorType: 'staff', actorId: performedBy,
      severity: 'info',
      metadata: { wardId, bedId, admissionNumber },
    }).catch((err) => console.warn('[adt.service] timeline event failed (admission):', err.message));

    // Dynamic Care Team: auto-invite specialists for recognized high-acuity
    // diagnoses on admission. Fire-and-forget — CareOS being down must never
    // block or fail a patient admission, which is why this runs after commit
    // with errors swallowed rather than inside the transaction.
    if (isComplexDiagnosis(admissionDiagnosis)) {
      autoInviteSpecialists(patientId, organizationId, admissionDiagnosis).catch((err) => {
        console.warn('[adt.service] auto care-team invite failed:', err.message);
      });
    }

    // Learning Agent: this admission is itself an outcome signal for any
    // recently-archived case for the same patient — a readmission within
    // 30 days of a "complex case" discharge is exactly the kind of feedback
    // findSimilarCases should be able to warn future clinicians about.
    flagReadmissionIfRecent(patientId, organizationId).catch((err) => {
      console.warn('[adt.service] readmission flag failed:', err.message);
    });

    // Prediction Agent: LOS estimate, pathway suggestion, readmission-risk
    // scoring — real logic in workflow-ai-orchestrator.service.js that was
    // previously written but never called from anywhere.
    dispatchEvent('patient.admitted', admission).catch((err) => {
      console.warn('[adt.service] prediction agent dispatch failed:', err.message);
    });

    // Event bus: fire-and-forget publish alongside (not instead of) the
    // direct calls above — anything that must happen for the admission to
    // be valid stays a direct call; this is for side-effects that can
    // tolerate being picked up a moment later by an independent consumer
    // (see kafka-consumers.service.js's admission consumer).
    publishEvent(KAFKA_TOPICS.PATIENT_ADMITTED, {
      admissionId: admission.id, patientId, organizationId, admissionType, admissionDiagnosis,
    }, { key: String(organizationId) }).catch(() => {});

    return admission;
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

export async function transferPatient({
  admissionId,
  organizationId,
  toWardId,
  toBedId,
  reason,
  performedBy
}) {
  await ensureDischargeReadinessTables();
  const tx = await sequelize.transaction();
  try {
    const [current] = await sequelize.query(
      `SELECT * FROM ip_admissions WHERE id = :admId AND organization_id = :orgId`,
      { replacements: { admId: admissionId, orgId: organizationId }, type: QueryTypes.SELECT, transaction: tx }
    );
    if (!current) throw new Error('Admission not found');

    const fromLocation = { ward_id: current.ward_id, bed_id: current.bed_id };

    await freeBed(tx, current.bed_id);
    await sequelize.query(
      `UPDATE ip_admissions SET ward_id = :wardId, bed_id = :bedId, updated_at = NOW() WHERE id = :admId`,
      { replacements: { wardId: toWardId, bedId: toBedId, admId: admissionId }, type: QueryTypes.UPDATE, transaction: tx }
    );
    await occupyBed(tx, toBedId, current.patient_id, admissionId);
    await recordEvent(tx, {
      organizationId, admissionId, patientId: current.patient_id,
      eventType: 'A02', fromLocation, toLocation: { ward_id: toWardId, bed_id: toBedId },
      performedBy, reason
    });

    await tx.commit();

    appendClinicalEvent({
      organizationId, patientId: current.patient_id, admissionId,
      eventType: 'transfer',
      title: `Transferred: ward ${fromLocation.ward_id || '—'}/bed ${fromLocation.bed_id || '—'} → ward ${toWardId || '—'}/bed ${toBedId || '—'}`,
      body: reason || null,
      actorType: 'staff', actorId: performedBy,
      severity: 'info',
      metadata: { fromLocation, toLocation: { ward_id: toWardId, bed_id: toBedId } },
    }).catch((err) => console.warn('[adt.service] timeline event failed (transfer):', err.message));

    return { success: true, from: fromLocation, to: { ward_id: toWardId, bed_id: toBedId } };
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

export async function dischargePatient({
  admissionId,
  organizationId,
  dischargeType = 'routine',
  dischargeSummaryId,
  performedBy,
  reason,
  override = null   // B4: { reasonCode, approverId, approverRole }
}) {
  await ensureDischargeReadinessTables();
  // Reconciliation is a separate hard gate: a readiness checkbox must not be able to
  // stand in for a signed clinician/pharmacist reconciliation.
  if (await reconciliationRequired(organizationId)) {
    const [admission] = await sequelize.query(
      `SELECT patient_id FROM ip_admissions WHERE id = :admId AND organization_id = :orgId`,
      { replacements: { admId: admissionId, orgId: organizationId }, type: QueryTypes.SELECT }
    );
    const reconciled = admission && await hasSignedReconciliation({ organizationId, patientId: admission.patient_id, admissionId, type: 'discharge' });
    if (!reconciled) {
      const authorised = override?.reasonCode && override?.approverId && DISCHARGE_OVERRIDE_ROLES.has(override.approverRole);
      if (!authorised) {
        const error = new Error('Discharge blocked — medication reconciliation must be signed before discharge');
        error.code = 'RECONCILIATION_REQUIRED';
        error.status = 409;
        throw error;
      }
      await sequelize.query(
        `INSERT INTO discharge_overrides (admission_id, organization_id, missing_items, reason_code, approver_id, approver_role)
         VALUES (:admId, :orgId, :items::jsonb, :reason, :approver, :role)`,
        { replacements: { admId: admissionId, orgId: organizationId, items: JSON.stringify([{ dimension: 'medication_reconciliation' }]), reason: override.reasonCode, approver: override.approverId, role: override.approverRole }, type: QueryTypes.INSERT }
      );
    }
  }

  // B4: Gate — check discharge readiness before opening transaction
  const readiness = await getDischargeReadiness(admissionId, organizationId);
  if (!readiness.ready) {
    if (override?.reasonCode && override?.approverId) {
      if (!DISCHARGE_OVERRIDE_ROLES.has(override.approverRole)) {
        throw new Error(`Role '${override.approverRole}' is not authorised to override discharge readiness`);
      }
      await sequelize.query(
        `INSERT INTO discharge_overrides (admission_id, organization_id, missing_items, reason_code, approver_id, approver_role)
         VALUES (:admId, :orgId, :items::jsonb, :reason, :approver, :role)`,
        {
          replacements: {
            admId: admissionId, orgId: organizationId,
            items: JSON.stringify(readiness.mandatoryPending),
            reason: override.reasonCode, approver: override.approverId, role: override.approverRole || null
          },
          type: QueryTypes.INSERT
        }
      );
    } else {
      const missing = readiness.mandatoryPending.map(i => i.label).join('; ');
      throw new Error(`Discharge blocked — mandatory readiness items incomplete: ${missing}`);
    }
  }

  // Billing clearance gate — ensure final bill and zero balance (or supervisor override)
  const { runDischargeBillingGate } = await import('./discharge-billing-clearance.service.js');
  try {
    await runDischargeBillingGate(admissionId, organizationId, performedBy);
  } catch (billingErr) {
    if (override?.reasonCode && override?.approverId) {
      await sequelize.query(
        `INSERT INTO discharge_overrides (admission_id, organization_id, missing_items, reason_code, approver_id, approver_role)
         VALUES (:admId, :orgId, :items::jsonb, :reason, :approver, :role)`,
        {
          replacements: {
            admId: admissionId, orgId: organizationId,
            items: JSON.stringify(billingErr.issues || [{ code: 'BILLING', message: billingErr.message }]),
            reason: override.reasonCode, approver: override.approverId, role: override.approverRole || null
          },
          type: QueryTypes.INSERT
        }
      );
    } else {
      const issues = (billingErr.issues || []).map(i => i.message).join('; ') || billingErr.message;
      throw new Error(`Discharge blocked — billing clearance failed: ${issues}`);
    }
  }

  const tx = await sequelize.transaction();
  try {
    const [current] = await sequelize.query(
      `SELECT * FROM ip_admissions WHERE id = :admId AND organization_id = :orgId`,
      { replacements: { admId: admissionId, orgId: organizationId }, type: QueryTypes.SELECT, transaction: tx }
    );
    if (!current) throw new Error('Admission not found');
    if (current.status === 'discharged') throw new Error('Patient already discharged');

    await freeBed(tx, current.bed_id);
    await sequelize.query(
      `UPDATE ip_admissions SET status = 'discharged', discharge_datetime = NOW(), discharge_type = :dischargeType, discharge_summary_id = :summaryId, updated_at = NOW() WHERE id = :admId`,
      { replacements: { admId: admissionId, dischargeType, summaryId: dischargeSummaryId || null }, type: QueryTypes.UPDATE, transaction: tx }
    );
    await recordEvent(tx, {
      organizationId, admissionId, patientId: current.patient_id,
      eventType: 'A03',
      fromLocation: { ward_id: current.ward_id, bed_id: current.bed_id },
      performedBy, reason
    });

    await tx.commit();

    appendClinicalEvent({
      organizationId, patientId: current.patient_id, admissionId,
      eventType: 'discharge',
      title: `Discharged (${dischargeType})`,
      body: reason || null,
      actorType: 'staff', actorId: performedBy,
      severity: 'info',
      metadata: { dischargeType, dischargeSummaryId: dischargeSummaryId || null },
    }).catch((err) => console.warn('[adt.service] timeline event failed (discharge):', err.message));

    // Prediction Agent: queues discharge-summary generation + 30-day
    // follow-up reminder (real logic, previously dead code — see
    // workflow-ai-orchestrator.service.js).
    dispatchEvent('patient.discharged', { ...current, discharge_summary_id: dischargeSummaryId || current.discharge_summary_id }).catch((err) => {
      console.warn('[adt.service] prediction agent dispatch failed (discharge):', err.message);
    });

    publishEvent(KAFKA_TOPICS.PATIENT_DISCHARGED, {
      admissionId, patientId: current.patient_id, organizationId, dischargeType,
    }, { key: String(organizationId) }).catch(() => {});

    // Hospital Knowledge Network: auto-archive complex cases on discharge so
    // future similar presentations can be matched — previously this only
    // happened if a clinician manually called POST /memory/archive.
    if (isComplexDiagnosis(current.admission_diagnosis)) {
      const keywords = String(current.admission_diagnosis || '')
        .toLowerCase().split(/\s+/).filter((w) => w.length > 3).slice(0, 8);
      const losDays = current.admission_datetime
        ? (Date.now() - new Date(current.admission_datetime).getTime()) / (1000 * 60 * 60 * 24)
        : null;
      archiveCase({
        organizationId,
        patientId: current.patient_id,
        presentationSummary: current.admission_diagnosis || 'Complex admission',
        finalDiagnosis: current.admission_diagnosis || null,
        lessonsLearned: reason || null,
        keywords,
        lengthOfStayDays: losDays,
      }).catch((err) => console.warn('[adt.service] auto case-archive failed:', err.message));
    }

    return { success: true, dischargedAt: new Date() };
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

export async function convertOpToIp({
  organizationId,
  patientId,
  consultationId,
  admissionDiagnosis,
  admittingDoctorId,
  wardId,
  bedId,
  admissionType = 'op_converted',
  insuranceClaimId,
  corporateAccountId,
  expectedLosDays,
  notes,
  performedBy
}) {
  await ensureDischargeReadinessTables();
  return admitPatient({
    organizationId, patientId, admittingDoctorId, admissionDiagnosis,
    wardId, bedId, admissionType, insuranceClaimId, corporateAccountId,
    referralSource: 'opd', expectedLosDays, sourceConsultationId: consultationId,
    notes, performedBy
  });
}

export async function convertErToIp({
  organizationId,
  patientId,
  erRecordId,
  admissionDiagnosis,
  admittingDoctorId,
  wardId,
  bedId,
  mlcCase = false,
  mlcNumber,
  insuranceClaimId,
  notes,
  performedBy
}) {
  await ensureDischargeReadinessTables();
  return admitPatient({
    organizationId, patientId, admittingDoctorId, admissionDiagnosis,
    wardId, bedId, admissionType: 'emergency',
    referralSource: 'er', sourceErId: erRecordId,
    mlcCase, mlcNumber, insuranceClaimId, notes, performedBy
  });
}

export async function getAdmission(admissionId, organizationId) {
  await ensureDischargeReadinessTables();
  const [row] = await sequelize.query(
    `SELECT a.*, w.name as ward_name, b.bed_number FROM ip_admissions a
     LEFT JOIN wards w ON w.id = a.ward_id
     LEFT JOIN beds b ON b.id = a.bed_id
     WHERE a.id = :admId AND a.organization_id = :orgId`,
    { replacements: { admId: admissionId, orgId: organizationId }, type: QueryTypes.SELECT }
  );
  return row || null;
}

export async function getActiveAdmissions(organizationId, { wardId, status, limit = 50, offset = 0 } = {}) {
  await ensureDischargeReadinessTables();
  let where = 'a.organization_id = :orgId AND a.status != \'discharged\'';
  const replacements = { orgId: organizationId, limit, offset };
  if (wardId) { where += ' AND a.ward_id = :wardId'; replacements.wardId = wardId; }
  if (status) { where += ' AND a.status = :status'; replacements.status = status; }

  return sequelize.query(
    `SELECT a.*, w.name as ward_name, b.bed_number,
            -- Patient demographics and the admitting doctor's name, so callers do not have to
            -- fetch each patient separately to render an admitted-patient list. ip_admissions
            -- stores only patient_id / admitting_doctor_id, and both reference users.
            p."firstName" AS patient_first_name,
            p."lastName"  AS patient_last_name,
            p.gender      AS patient_gender,
            CASE WHEN p."dateOfBirth" IS NOT NULL
                 THEN date_part('year', age(p."dateOfBirth"))::int END AS patient_age,
            NULLIF(TRIM(CONCAT_WS(' ', d."firstName", d."lastName")), '') AS admitting_doctor_name,
            (SELECT COUNT(*) FROM medication_orders mo WHERE mo.admission_id = a.id AND mo.order_status = 'active') as active_medication_count
     FROM ip_admissions a
     LEFT JOIN wards w ON w.id = a.ward_id
     LEFT JOIN beds b ON b.id = a.bed_id
     LEFT JOIN users p ON p.id = a.patient_id
     LEFT JOIN users d ON d.id = a.admitting_doctor_id
     WHERE ${where}
     ORDER BY a.admission_datetime DESC
     LIMIT :limit OFFSET :offset`,
    { replacements, type: QueryTypes.SELECT }
  );
}

export async function getPatientAdtHistory(patientId, organizationId) {
  await ensureDischargeReadinessTables();
  return sequelize.query(
    `SELECT e.*, a.admission_number FROM adt_events e
     JOIN ip_admissions a ON a.id = e.admission_id
     WHERE e.patient_id = :patientId AND e.organization_id = :orgId
     ORDER BY e.event_datetime DESC`,
    { replacements: { patientId, orgId: organizationId }, type: QueryTypes.SELECT }
  );
}

export async function cancelAdmit(admissionId, organizationId, performedBy, reason) {
  await ensureDischargeReadinessTables();
  const tx = await sequelize.transaction();
  try {
    const [current] = await sequelize.query(
      `SELECT * FROM ip_admissions WHERE id = :admId AND organization_id = :orgId`,
      { replacements: { admId: admissionId, orgId: organizationId }, type: QueryTypes.SELECT, transaction: tx }
    );
    if (!current) throw new Error('Admission not found');

    await freeBed(tx, current.bed_id);
    await sequelize.query(
      `UPDATE ip_admissions SET status = 'cancelled', updated_at = NOW() WHERE id = :admId`,
      { replacements: { admId: admissionId }, type: QueryTypes.UPDATE, transaction: tx }
    );
    await recordEvent(tx, {
      organizationId, admissionId, patientId: current.patient_id,
      eventType: 'A11', fromLocation: { ward_id: current.ward_id, bed_id: current.bed_id },
      performedBy, reason
    });

    await tx.commit();
    return { success: true };
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}
