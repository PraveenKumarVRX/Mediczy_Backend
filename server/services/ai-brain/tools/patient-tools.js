/**
 * Patient Tools — 4 tools for patient data access
 * get_patient_profile, get_patient_vitals, get_patient_prescriptions, get_patient_medical_records
 */

import pool from '../../../db/pgPool.js';
import { register } from './index.js';

// ─── 1. Get Patient Profile ────────────────────────────────

register({
  name: 'get_patient_profile',
  description: 'Get the authenticated patient\'s profile including demographics, contact info, and health summary.',
  category: 'patient',
  parameters: {
    type: 'object',
    properties: {
      patient_id: { type: 'number', description: 'Patient ID (uses authenticated user if not provided)' }
    },
    required: []
  },
  async execute(params, ctx) {
    const db = pool;
    const userId = params.patient_id || ctx.userId;

    const { rows } = await db.query(
      `SELECT u.id, u."firstName", u."lastName", u.email, u."phoneNumber", u.gender,
              u."dateOfBirth", u."bloodType", u.allergies,
              u."emergencyContact_name", u."emergencyContact_phoneNumber",
              u."createdAt",
              p."bloodGroup", p."chronicConditions", p.height, p.weight, p."currentMedications"
       FROM users u
       LEFT JOIN patients p ON p."userId" = u.id
       WHERE u.id = $1`,
      [userId]
    );

    if (rows.length === 0) return { error: 'Patient not found' };

    const patient = rows[0];
    return {
      id: patient.id,
      name: `${patient.firstName || ''} ${patient.lastName || ''}`.trim(),
      email: patient.email,
      phone: patient.phoneNumber,
      gender: patient.gender,
      dateOfBirth: patient.dateOfBirth,
      bloodGroup: patient.bloodGroup || patient.bloodType,
      allergies: patient.allergies,
      chronicConditions: patient.chronicConditions,
      height: patient.height,
      weight: patient.weight,
      currentMedications: patient.currentMedications,
      emergencyContact: patient.emergencyContact_name
        ? { name: patient.emergencyContact_name, phone: patient.emergencyContact_phoneNumber }
        : null,
      memberSince: patient.createdAt
    };
  }
});

// ─── 2. Get Patient Vitals ─────────────────────────────────

register({
  name: 'get_patient_vitals',
  description: 'Get the patient\'s recent vital signs and health readings (blood pressure, heart rate, temperature, weight, BMI, blood sugar, SpO2).',
  category: 'patient',
  parameters: {
    type: 'object',
    properties: {
      patient_id: { type: 'number', description: 'Patient ID' },
      limit: { type: 'number', description: 'Number of recent readings (default 10)' }
    },
    required: []
  },
  async execute(params, ctx) {
    const db = pool;
    const patientId = params.patient_id || ctx.userId;
    const limit = params.limit || 10;

    const { rows } = await db.query(
      `SELECT id, "readingType" AS type, value, unit, notes, "recordedAt", source
       FROM health_readings
       WHERE "patientId" = $1
       ORDER BY "recordedAt" DESC
       LIMIT $2`,
      [patientId, limit]
    );

    if (rows.length === 0) {
      // Try health_data table
      const { rows: hdRows } = await db.query(
        `SELECT id, type, value, unit, notes, "createdAt" AS "recordedAt"
         FROM health_data
         WHERE "userId" = $1
         ORDER BY "createdAt" DESC
         LIMIT $2`,
        [patientId, limit]
      );
      return { readings: hdRows, count: hdRows.length, source: 'health_data' };
    }

    return { readings: rows, count: rows.length, source: 'health_readings' };
  }
});

// ─── 3. Get Patient Prescriptions ──────────────────────────

register({
  name: 'get_patient_prescriptions',
  description: 'Get the patient\'s prescription history including medicines, dosages, and prescribing doctor.',
  category: 'patient',
  parameters: {
    type: 'object',
    properties: {
      patient_id: { type: 'number', description: 'Patient ID' },
      active_only: { type: 'boolean', description: 'Only show active prescriptions (default true)' },
      limit: { type: 'number', description: 'Max prescriptions to return (default 10)' }
    },
    required: []
  },
  async execute(params, ctx) {
    const db = pool;
    const patientId = params.patient_id || ctx.userId;
    const limit = params.limit || 10;

    const { rows } = await db.query(
      `SELECT p.id, p.diagnosis, p.notes, p.status, p."createdAt",
              d."firstName" AS doctor_first, d."lastName" AS doctor_last, d.specialization,
              COALESCE(
                (SELECT json_agg(json_build_object(
                  'medicine', m.medicine, 'dosage', m.dosage, 'frequency', m.frequency,
                  'duration', m.duration, 'instructions', m.instructions
                )) FROM pharmacy_prescription_medicines m WHERE m."prescriptionId" = p.id),
                '[]'::json
              ) AS medicines
       FROM prescriptions p
       LEFT JOIN doctors d ON d.id = p."doctorId"
       WHERE p."patientId" = $1
       ORDER BY p."createdAt" DESC
       LIMIT $2`,
      [patientId, limit]
    );

    return {
      prescriptions: rows.map(r => ({
        id: r.id,
        diagnosis: r.diagnosis,
        notes: r.notes,
        status: r.status,
        doctor: `Dr. ${r.doctor_first || ''} ${r.doctor_last || ''}`.trim(),
        specialization: r.specialization,
        medicines: r.medicines,
        date: r.createdAt
      })),
      count: rows.length
    };
  }
});

// ─── 4. Get Patient Medical Records ────────────────────────

register({
  name: 'get_patient_medical_records',
  description: 'Get medical records, discharge summaries, and EHR data for the patient.',
  category: 'patient',
  parameters: {
    type: 'object',
    properties: {
      patient_id: { type: 'number', description: 'Patient ID' },
      record_type: { type: 'string', description: 'Filter by type: lab_report, prescription, discharge_summary, imaging, all (default all)' },
      limit: { type: 'number', description: 'Max records (default 10)' }
    },
    required: []
  },
  async execute(params, ctx) {
    const db = pool;
    const patientId = params.patient_id || ctx.userId;
    const limit = params.limit || 10;
    const recordType = params.record_type || 'all';

    let whereClause = 'WHERE "patientId" = $1';
    const qParams = [patientId, limit];

    if (recordType && recordType !== 'all') {
      whereClause += ` AND "recordType" = $${qParams.length + 1}`;
      qParams.push(recordType);
    }

    const { rows } = await db.query(
      `SELECT id, "recordType", title, description, "fileUrl", notes, "createdAt"
       FROM medical_records
       ${whereClause}
       ORDER BY "createdAt" DESC
       LIMIT $2`,
      qParams
    );

    return { records: rows, count: rows.length };
  }
});
