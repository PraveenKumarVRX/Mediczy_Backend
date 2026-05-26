/**
 * Clinical Workspace Service — Phase 2
 *
 * Assembles the unified patient workspace for doctors:
 * demographics, active admission, vitals trend, alerts,
 * active medications, latest assessments, pending results.
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';

export async function getPatientWorkspace(patientId, organizationId) {
  const [patient] = await sequelize.query(
    `SELECT id, first_name, last_name, date_of_birth, gender, blood_group,
            phone, email, uhid
     FROM patients WHERE id = :patientId LIMIT 1`,
    { replacements: { patientId }, type: QueryTypes.SELECT }
  ).catch(() => [null]);

  const [admission] = await sequelize.query(
    `SELECT a.*, w.name as ward_name, b.bed_number,
            d.first_name || ' ' || d.last_name as admitting_doctor_name
     FROM ip_admissions a
     LEFT JOIN wards w ON w.id = a.ward_id
     LEFT JOIN beds b  ON b.id = a.bed_id
     LEFT JOIN doctors d ON d.id = a.admitting_doctor_id
     WHERE a.patient_id = :patientId AND a.status NOT IN ('discharged','cancelled')
     ORDER BY a.admission_datetime DESC LIMIT 1`,
    { replacements: { patientId }, type: QueryTypes.SELECT }
  ).catch(() => [null]);

  const vitals = admission ? await sequelize.query(
    `SELECT * FROM vital_records
     WHERE admission_id = :admId
     ORDER BY recorded_at DESC LIMIT 5`,
    { replacements: { admId: admission.id }, type: QueryTypes.SELECT }
  ).catch(() => []) : [];

  const alerts = admission ? await sequelize.query(
    `SELECT * FROM early_warning_alerts
     WHERE admission_id = :admId AND acknowledged = FALSE
     ORDER BY triggered_at DESC LIMIT 10`,
    { replacements: { admId: admission.id }, type: QueryTypes.SELECT }
  ).catch(() => []) : [];

  const activeMeds = admission ? await sequelize.query(
    `SELECT drug_name, dose, route, frequency, start_datetime, special_instructions
     FROM medication_orders
     WHERE admission_id = :admId AND order_status = 'active'
     ORDER BY drug_name`,
    { replacements: { admId: admission.id }, type: QueryTypes.SELECT }
  ).catch(() => []) : [];

  const allergies = await sequelize.query(
    `SELECT allergen, reaction_type, severity FROM patient_allergies
     WHERE patient_id = :patientId AND active = TRUE`,
    { replacements: { patientId }, type: QueryTypes.SELECT }
  ).catch(() => []);

  const recentNotes = await sequelize.query(
    `SELECT id, note_type, chief_complaint, diagnosis, plan, created_at, signed_at
     FROM clinical_notes
     WHERE patient_id = :patientId
     ORDER BY created_at DESC LIMIT 5`,
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

  return {
    patient: patient || null,
    activeAdmission: admission || null,
    latestVitals: vitals[0] || null,
    vitalsTrend: vitals,
    activeAlerts: alerts,
    allergies,
    activeMedications: activeMeds,
    recentNotes,
    pendingOrders,
    pendingOT: otBooking[0] || null,
    generatedAt: new Date()
  };
}
