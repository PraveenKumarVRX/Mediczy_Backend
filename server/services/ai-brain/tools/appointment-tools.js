/**
 * Appointment Tools — 3 tools for appointment management
 * get_patient_appointments, search_doctors, book_appointment
 */

import pool from '../../../db/pgPool.js';
import { register } from './index.js';

// ─── 1. Get Patient Appointments ───────────────────────────

register({
  name: 'get_patient_appointments',
  description: 'Get the patient\'s appointments (upcoming, past, or all). Shows doctor name, specialization, date/time, and status.',
  category: 'appointment',
  parameters: {
    type: 'object',
    properties: {
      patient_id: { type: 'string', description: 'Patient ID (number)' },
      status: { type: 'string', description: 'Filter: upcoming, completed, cancelled, all (default upcoming)' },
      limit: { type: 'string', description: 'Max results as a number (default 10)' }
    },
    required: []
  },
  async execute(params, ctx) {
    const db = pool;
    const patientId = Number(params.patient_id) || ctx.userId;
    const limit = Number(params.limit) || 10;
    const status = params.status || 'upcoming';

    let statusFilter = '';
    if (status === 'upcoming') {
      statusFilter = `AND a."appointmentDate" >= CURRENT_DATE AND a.status NOT IN ('cancelled', 'completed')`;
    } else if (status !== 'all') {
      statusFilter = `AND a.status = '${status}'`;
    }

    const { rows } = await db.query(
      `SELECT a.id, a."appointmentDate", a."appointmentTime", a.status, a.type,
              a.symptoms, a.notes_json,
              d."firstName" AS doctor_first, d."lastName" AS doctor_last,
              d.specialization, d."profileImage"
       FROM appointments a
       LEFT JOIN doctors d ON d.id = a."doctorId"
       WHERE a."patientId" = $1 ${statusFilter}
       ORDER BY a."appointmentDate" DESC, a."appointmentTime" DESC
       LIMIT $2`,
      [patientId, limit]
    );

    return {
      appointments: rows.map(r => ({
        id: r.id,
        date: r.appointmentDate,
        time: r.appointmentTime,
        status: r.status,
        type: r.type,
        symptoms: r.symptoms,
        doctor: `Dr. ${r.doctor_first || ''} ${r.doctor_last || ''}`.trim(),
        specialization: r.specialization
      })),
      count: rows.length
    };
  }
});

// ─── 2. Search Doctors ─────────────────────────────────────

register({
  name: 'search_doctors',
  description: 'Search for doctors by specialization, name, or availability. Returns doctor profiles with consultation fees and ratings.',
  category: 'appointment',
  parameters: {
    type: 'object',
    properties: {
      specialization: { type: 'string', description: 'Medical specialization (e.g., "general physician", "cardiologist", "dermatologist")' },
      name: { type: 'string', description: 'Doctor name to search' },
      available_today: { type: 'boolean', description: 'Only show doctors available today' },
      limit: { type: 'string', description: 'Max results as a number (default 5)' }
    },
    required: []
  },
  async execute(params) {
    const db = pool;
    const limit = Number(params.limit) || 5;
    const conditions = [`d.status = 'active'`];
    const qParams = [];

    if (params.specialization) {
      qParams.push(`%${params.specialization}%`);
      conditions.push(`d.specialization ILIKE $${qParams.length}`);
    }

    if (params.name) {
      qParams.push(`%${params.name}%`);
      conditions.push(`(d."firstName" ILIKE $${qParams.length} OR d."lastName" ILIKE $${qParams.length})`);
    }

    qParams.push(limit);

    const { rows } = await db.query(
      `SELECT d.id, d."firstName", d."lastName", d.specialization,
              d."consultationFees", d.experience, d.rating, d.qualification,
              d."isOnline", d."profileImage",
              d."clinicAddress"
       FROM doctors d
       WHERE ${conditions.join(' AND ')}
       ORDER BY d.rating DESC NULLS LAST, d.experience DESC NULLS LAST
       LIMIT $${qParams.length}`,
      qParams
    );

    return {
      doctors: rows.map(r => ({
        id: r.id,
        name: `Dr. ${r.firstName || ''} ${r.lastName || ''}`.trim(),
        specialization: r.specialization,
        qualification: r.qualification,
        experience: r.experience ? `${r.experience} years` : null,
        fee: r.consultationFees,
        rating: r.rating,
        isOnline: r.isOnline,
        clinicAddress: r.clinicAddress
      })),
      count: rows.length
    };
  }
});

// ─── 3. Book Appointment (write tool) ──────────────────────

register({
  name: 'book_appointment',
  description: 'Book an appointment with a doctor. Requires doctor_id, date, time, and reason. This is a WRITE operation that creates a real booking.',
  category: 'appointment',
  isWrite: true,
  parameters: {
    type: 'object',
    properties: {
      doctor_id: { type: 'string', description: 'Doctor ID (number)' },
      appointment_date: { type: 'string', description: 'Appointment date in YYYY-MM-DD format' },
      appointment_time: { type: 'string', description: 'Appointment time in HH:MM format (24hr)' },
      consultation_type: { type: 'string', description: 'Type: video, in_person (default video)' },
      reason: { type: 'string', description: 'Reason for consultation' }
    },
    required: ['doctor_id', 'appointment_date', 'appointment_time']
  },
  async execute(params, ctx) {
    const db = pool;
    const patientId = ctx.userId;
    const doctorId = Number(params.doctor_id);

    if (!patientId) return { error: 'Authentication required to book appointments' };
    if (!doctorId) return { error: 'Invalid doctor_id' };

    // Verify doctor exists
    const { rows: doctors } = await db.query(
      `SELECT id, "firstName", "lastName", specialization, "consultationFee" FROM doctors WHERE id = $1 AND status = 'active'`,
      [doctorId]
    );
    if (doctors.length === 0) return { error: 'Doctor not found or not active' };

    // Check for conflict
    const { rows: conflicts } = await db.query(
      `SELECT id FROM appointments
       WHERE "doctorId" = $1 AND "appointmentDate" = $2 AND "appointmentTime" = $3
       AND status NOT IN ('cancelled')`,
      [doctorId, params.appointment_date, params.appointment_time]
    );
    if (conflicts.length > 0) return { error: 'This time slot is already booked. Please choose another time.' };

    // Create appointment
    const { rows: [appt] } = await db.query(
      `INSERT INTO appointments ("patientId", "doctorId", "appointmentDate", "appointmentTime",
                                  "consultationType", reason, status, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, 'scheduled', NOW(), NOW())
       RETURNING id, "appointmentDate", "appointmentTime", status`,
      [
        patientId,
        doctorId,
        params.appointment_date,
        params.appointment_time,
        params.consultation_type || 'video',
        params.reason || 'AI-assisted booking'
      ]
    );

    const doctor = doctors[0];
    return {
      success: true,
      appointmentId: appt.id,
      date: appt.appointmentDate,
      time: appt.appointmentTime,
      doctor: `Dr. ${doctor.firstName || ''} ${doctor.lastName || ''}`.trim(),
      specialization: doctor.specialization,
      fee: doctor.consultationFee,
      status: 'scheduled',
      message: `Appointment booked successfully with Dr. ${doctor.firstName} ${doctor.lastName} on ${appt.appointmentDate} at ${appt.appointmentTime}`
    };
  }
});
