/**
 * Multi-OPD / multi-doctor QMS helpers + appointment → token bridge.
 */
import pool from '../db/pgPool.js';
import * as queue from './hospital-queue.service.js';
import { queueZoneForDoctor, isInPersonConsultation } from '../config/qms.config.js';

export { queueZoneForDoctor, isInPersonConsultation };

function toDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function todayDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * List today's OPD queues for an organization (one row per doctor / zone).
 * Includes hospital and clinic doctors under the org.
 */
export async function listOpdQueues(organizationId, { portal } = {}) {
  await queue.ensureQueueTables();
  const org = parseInt(organizationId, 10) || 1;
  const { rows } = await pool.query(
    `SELECT
       COALESCE(doctor_id::text, 'none') AS doctor_key,
       doctor_id,
       MAX(doctor_name) AS doctor_name,
       queue_zone,
       COUNT(*) FILTER (WHERE status = 'waiting')::int AS waiting,
       COUNT(*) FILTER (WHERE status = 'called')::int AS called,
       COUNT(*) FILTER (WHERE status = 'serving')::int AS serving,
       COUNT(*) FILTER (WHERE status IN ('waiting','called','serving'))::int AS active,
       COUNT(*)::int AS total_today
     FROM hospital_queue_entries
     WHERE organization_id = $1
       AND department = 'opd'
       AND check_in_at::date = CURRENT_DATE
     GROUP BY doctor_id, queue_zone
     ORDER BY active DESC, doctor_name ASC NULLS LAST`,
    [org],
  );

  let doctors = [];
  try {
    const typeFilter = portal === 'clinic'
      ? `AND (organization_type = 'clinic' OR organization_type IS NULL OR organization_type = 'hospital')`
      : `AND (organization_type = 'hospital' OR organization_type = 'clinic' OR organization_type IS NULL)`;
    const d = await pool.query(
      `SELECT id, "firstName", "lastName", specialization, organization_type
       FROM doctors
       WHERE organization_id = $1
         ${typeFilter}
         AND COALESCE(status, 'active') = 'active'
       ORDER BY "firstName" ASC
       LIMIT 150`,
      [org],
    );
    doctors = d.rows.map((r) => ({
      doctorId: r.id,
      doctorName: `Dr. ${r.firstName || ''} ${r.lastName || ''}`.trim(),
      specialization: r.specialization || 'General',
      organizationType: r.organization_type || null,
      queueZone: queueZoneForDoctor({ doctorId: r.id, specialization: r.specialization }),
    }));
  } catch (e) {
    console.warn('[qms-opd] doctor list skipped:', e.message);
  }

  const byDoctor = new Map(rows.filter((r) => r.doctor_id != null).map((r) => [String(r.doctor_id), r]));
  const opds = doctors.map((doc) => {
    const live = byDoctor.get(String(doc.doctorId));
    return {
      ...doc,
      waiting: live?.waiting || 0,
      called: live?.called || 0,
      serving: live?.serving || 0,
      active: live?.active || 0,
      totalToday: live?.total_today || 0,
    };
  });

  for (const r of rows) {
    if (r.doctor_id && doctors.some((d) => d.doctorId === r.doctor_id)) continue;
    opds.push({
      doctorId: r.doctor_id,
      doctorName: r.doctor_name || 'General OPD',
      specialization: 'General',
      queueZone: r.queue_zone,
      waiting: r.waiting,
      called: r.called,
      serving: r.serving,
      active: r.active,
      totalToday: r.total_today,
    });
  }

  return { organizationId: org, opds };
}

/**
 * Issue (or reuse) a QMS token for an appointment.
 *
 * @param {'auto'|'force'} mode
 *   - auto (default): only issue if appointmentDate is today; else defer (activate on arrival)
 *   - force: always issue (kiosk / day-of check-in)
 */
export async function issueTokenForAppointment(appointment, {
  notifyOptIn = false,
  notifyPhone,
  queueZone,
  organizationId,
  source = 'appointment-booking',
  mode = 'auto',
  branchId = null,
} = {}) {
  if (!appointment?.id) throw new Error('appointment required');

  const org =
    organizationId ||
    appointment.organization_id ||
    appointment.organizationId ||
    appointment.tenant_id ||
    process.env.HOSPITAL_DEFAULT_ORG_ID ||
    1;

  const appointmentDate = toDateOnly(appointment.appointmentDate || appointment.appointment_date);
  const today = todayDateOnly();

  if (mode !== 'force' && appointmentDate && appointmentDate !== today) {
    return {
      deferred: true,
      activateOn: appointmentDate,
      tokenNumber: null,
      message: `Token will activate on arrival / ${appointmentDate}. Present at kiosk or reception on that day.`,
      appointmentId: appointment.id,
      doctorId: appointment.doctorId || appointment.doctor_id || null,
      doctorName: appointment.doctorName || appointment.doctor_name || null,
      queueZone: queueZoneForDoctor({
        doctorId: appointment.doctorId || appointment.doctor_id,
        specialization: appointment.specialization,
        queueZone,
      }),
      notifyOptIn: notifyOptIn === true,
      notifyPhone: notifyPhone || appointment.patientPhone || appointment.patient_phone || null,
    };
  }

  const doctorId = appointment.doctorId || appointment.doctor_id || null;
  const doctorName = appointment.doctorName || appointment.doctor_name || null;
  const specialization = appointment.specialization || null;
  const zone = queueZoneForDoctor({
    doctorId,
    specialization,
    queueZone,
  });

  await queue.ensureQueueTables();
  try {
    const { up: harden } = await import('../migrations/20260801-qms-hardening.migration.js');
    await harden(pool);
  } catch (_) { /* best-effort */ }

  const existing = await pool.query(
    `SELECT * FROM hospital_queue_entries
     WHERE appointment_id = $1
       AND organization_id = $2
       AND check_in_at::date = CURRENT_DATE
       AND status IN ('waiting','called','serving')
     ORDER BY id DESC LIMIT 1`,
    [appointment.id, org],
  );
  if (existing.rows[0]) {
    return queue.getEntryById(existing.rows[0].id, org);
  }

  const phone =
    notifyPhone ||
    appointment.patientPhone ||
    appointment.patient_phone ||
    null;

  const entry = await queue.checkIn({
    organizationId: org,
    department: 'opd',
    queueZone: zone,
    branchId, // optional; checkIn validates it against the organization
    patientId: appointment.userId || appointment.patientId || appointment.user_id || null,
    patientName: appointment.patientName || appointment.patient_name || 'Patient',
    appointmentId: appointment.id,
    doctorId: doctorId ? parseInt(doctorId, 10) : null,
    doctorName,
    queueType: 'scheduled',
    priorityScore: 60,
    chiefComplaint: appointment.reason || appointment.symptoms || null,
    counterId: doctorName ? `${doctorName}` : undefined,
    consentVersion: 'qms-appointment-v1',
    metadata: {
      source,
      specialization,
      appointmentDate,
      appointmentTime: appointment.appointmentTime || appointment.appointment_time,
      notifyOptIn: notifyOptIn === true && !!phone,
      notifyPhone: notifyOptIn === true && phone ? phone : undefined,
      opdZone: zone,
    },
  });

  return entry;
}

/** Strip Aadhaar/address PHI from metadata older than N days (default 30). */
export async function purgeQueueMetadataPhi({ olderThanDays = 30, limit = 500 } = {}) {
  const days = Math.max(1, parseInt(olderThanDays, 10) || 30);
  const { rowCount } = await pool.query(
    `UPDATE hospital_queue_entries
     SET metadata = (metadata
       - 'aadhaarLast4' - 'address' - 'pincode' - 'state' - 'careOf'
       - 'dateOfBirth' - 'gender')
       || jsonb_build_object('phiPurgedAt', NOW()::text)
     WHERE check_in_at < NOW() - ($1::text || ' days')::interval
       AND metadata ?| array['aadhaarLast4','address','dateOfBirth']
       AND NOT (metadata ? 'phiPurgedAt')
     AND id IN (
       SELECT id FROM hospital_queue_entries
       WHERE check_in_at < NOW() - ($1::text || ' days')::interval
         AND metadata ?| array['aadhaarLast4','address','dateOfBirth']
         AND NOT (metadata ? 'phiPurgedAt')
       LIMIT $2
     )`,
    [String(days), limit],
  );
  return { purged: rowCount || 0, olderThanDays: days };
}

export default {
  queueZoneForDoctor,
  isInPersonConsultation,
  listOpdQueues,
  issueTokenForAppointment,
  purgeQueueMetadataPhi,
};
