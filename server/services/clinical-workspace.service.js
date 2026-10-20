/**
 * Clinical Workspace Service — Phase 2
 *
 * Assembles the unified patient workspace for doctors:
 * demographics, active admission, vitals trend, alerts,
 * active medications, latest assessments, pending results.
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';
import { setRlsContext } from '../middleware/rls-context.middleware.js';
import { ensureClinicalNoteColumns } from './clinical-notes.service.js';

async function fetchPatientDemographics(patientId) {
  const [fromPatients] = await sequelize.query(
    `SELECT id, first_name, last_name, date_of_birth, gender, blood_group,
            phone, email, uhid
     FROM patients WHERE id = :patientId LIMIT 1`,
    { replacements: { patientId }, type: QueryTypes.SELECT }
  ).catch(() => [null]);

  if (fromPatients) return fromPatients;

  const [fromUsers] = await sequelize.query(
    `SELECT id,
            "firstName" AS first_name,
            "lastName" AS last_name,
            "dateOfBirth" AS date_of_birth,
            gender,
            NULL::text AS blood_group,
            "phoneNumber" AS phone,
            email,
            COALESCE(metadata->>'uhid', '') AS uhid
     FROM users WHERE id = :patientId LIMIT 1`,
    { replacements: { patientId }, type: QueryTypes.SELECT }
  ).catch(() => [null]);

  return fromUsers || null;
}

function calcAge(dateOfBirth) {
  if (!dateOfBirth) return 0;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return 0;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
  return Math.max(age, 0);
}

export function toPatientSummary(workspace) {
  const patient = workspace.patient;
  const admission = workspace.activeAdmission;
  if (!patient && !admission) return null;

  const name = patient
    ? `${patient.first_name || ''} ${patient.last_name || ''}`.trim()
    : 'Unknown patient';

  return {
    name,
    age: calcAge(patient?.date_of_birth),
    bed: admission?.bed_number || '—',
    ward: admission?.ward_name || '—',
    diagnosis: admission?.admission_diagnosis || admission?.diagnosis || '—',
    allergies: (workspace.allergies || []).map((a) => a.allergen).filter(Boolean),
    admittedAt: admission?.admission_datetime || admission?.admitted_at || new Date().toISOString(),
    admissionId: admission?.id || null,
  };
}

export function formatVitalsForDisplay(record) {
  if (!record) return [];
  const items = [
    { label: 'Temp', value: record.temperature, unit: '°C', flag: record.temperature >= 38 ? 'high' : undefined },
    { label: 'Pulse', value: record.pulse, unit: 'bpm', flag: record.pulse >= 100 ? 'high' : undefined },
    { label: 'BP', value: record.bp_systolic && record.bp_diastolic ? `${record.bp_systolic}/${record.bp_diastolic}` : null, unit: 'mmHg' },
    { label: 'SpO₂', value: record.spo2, unit: '%', flag: record.spo2 < 94 ? 'low' : undefined },
    { label: 'RR', value: record.respiratory_rate, unit: '/min' },
  ];
  return items.filter((i) => i.value != null && i.value !== '');
}

export async function getPatientWorkspace(patientId, organizationId) {
  await ensureClinicalNoteColumns();
  const patient = await fetchPatientDemographics(patientId);

  const [admission] = await sequelize.query(
    `SELECT a.*, w.name AS ward_name, b.bed_number
     FROM ip_admissions a
     LEFT JOIN wards w ON w.id = a.ward_id
     LEFT JOIN beds b ON b.id = a.bed_id
     WHERE a.patient_id = :patientId
       AND a.status NOT IN ('discharged','cancelled')
       AND (:orgId IS NULL OR a.organization_id = :orgId)
     ORDER BY a.admission_datetime DESC LIMIT 1`,
    { replacements: { patientId, orgId: organizationId || null }, type: QueryTypes.SELECT }
  ).catch(() => [null]);

  const vitals = admission ? await sequelize.query(
    `SELECT * FROM vital_records
     WHERE admission_id = :admId
     ORDER BY recorded_at DESC LIMIT 5`,
    { replacements: { admId: admission.id }, type: QueryTypes.SELECT }
  ).catch(() => []) : [];

  const alerts = admission ? await sequelize.query(
    `SELECT * FROM early_warning_alerts
     WHERE admission_id = :admId AND acknowledged_at IS NULL AND COALESCE(resolved, FALSE) = FALSE
     ORDER BY triggered_at DESC LIMIT 10`,
    { replacements: { admId: admission.id }, type: QueryTypes.SELECT }
  ).catch(() => []) : [];

  const activeMeds = admission ? await sequelize.query(
    `SELECT id, drug_name, dose, route, frequency, start_datetime, order_status, special_instructions
     FROM medication_orders
     WHERE admission_id = :admId AND order_status = 'active'
     ORDER BY drug_name`,
    { replacements: { admId: admission.id }, type: QueryTypes.SELECT }
  ).catch(() => []) : [];

  // patient_allergies is keyed by user_id / allergen_name and protected by FORCE RLS (organization OR own user), so
  // the lookup must set that context or it silently sees no rows. A failed lookup must not read as "no allergies".
  let allergyLookupFailed = false;
  const allergies = await sequelize.transaction(async (transaction) => {
    await setRlsContext(transaction, { orgId: organizationId || 0, userId: patientId, isPlatformAdmin: false });
    return sequelize.query(
      `SELECT allergen_name AS allergen, reaction_type, severity FROM patient_allergies
       WHERE user_id = :patientId ORDER BY severity, allergen_name`,
      { replacements: { patientId }, type: QueryTypes.SELECT, transaction }
    );
  }).catch((e) => { console.error('[clinical-workspace] allergy lookup failed:', e.message); allergyLookupFailed = true; return []; });

  // See discharge-workflow.service.js buildDraftContext() for why this table
  // needs mixed quoting: patientId/createdAt/assessment are the real
  // Sequelize-model columns; note_type/signed_at are snake_case add-ons from
  // ensureClinicalNoteColumns(). There is no "diagnosis"/"chief_complaint"
  // column — assessment and chiefComplaint are the real equivalents.
  const recentNotes = await sequelize.query(
    `SELECT id, note_type, "chiefComplaint" AS chief_complaint, assessment AS diagnosis, plan, "createdAt" AS created_at, "signedAt" AS signed_at
     FROM clinical_notes
     WHERE "patientId" = :patientId
     ORDER BY "createdAt" DESC LIMIT 5`,
    { replacements: { patientId }, type: QueryTypes.SELECT }
  ).catch(() => []);

  const pendingOrders = admission ? await sequelize.query(
    `SELECT order_type, order_name, status, ordered_at
     FROM clinical_orders
     WHERE admission_id = :admId AND status IN ('pending','ordered','collected')
     ORDER BY ordered_at DESC LIMIT 20`,
    { replacements: { admId: admission.id }, type: QueryTypes.SELECT }
  ).catch(() => []) : [];

  const otBooking = admission ? await sequelize.query(
    `SELECT procedure_name, scheduled_start, ot_status
     FROM ot_bookings
     WHERE admission_id = :admId AND ot_status NOT IN ('completed','cancelled')
     ORDER BY scheduled_start ASC LIMIT 1`,
    { replacements: { admId: admission.id }, type: QueryTypes.SELECT }
  ).catch(() => []) : [];

  const workspace = {
    patient: patient || null,
    activeAdmission: admission || null,
    latestVitals: vitals[0] || null,
    vitalsTrend: vitals,
    activeAlerts: alerts,
    allergies,
    allergyLookupFailed, // true = status UNKNOWN (the lookup failed); an empty list only means none are recorded
    activeMedications: activeMeds,
    recentNotes,
    pendingOrders,
    pendingOT: otBooking[0] || null,
    generatedAt: new Date(),
  };

  return {
    ...workspace,
    summary: toPatientSummary(workspace),
    vitalsDisplay: formatVitalsForDisplay(vitals[0]),
    medicationsDisplay: activeMeds.map((m) => ({
      orderId: m.id,
      drugName: m.drug_name,
      dose: m.dose,
      route: m.route,
      frequency: m.frequency,
      status: m.order_status,
    })),
  };
}
