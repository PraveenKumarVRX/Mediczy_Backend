/**
 * AppointmentRepository — single place that touches the `appointments` table.
 *
 * appointments enforces FORCE ROW LEVEL SECURITY: every read/write must run
 * inside a transaction with the session GUCs set (req.setSequelizeRlsContext),
 * or Sequelize silently sees zero rows (reads) / gets rejected (writes). That
 * rule was previously re-implemented ad hoc in ~8 different route files —
 * this repository is the one place it's implemented now. Callers never
 * import the Appointment model or open a transaction themselves.
 *
 * Doctor-scoped lookups delegate identity resolution to
 * appointment-identity.service.js instead of comparing appointment.doctorId
 * to req.user.id directly — doctors.id and users.id are independent
 * sequences and can coincidentally collide (see appointment-identity.service.js).
 */
import { Appointment, Doctor, User } from '../models/index.js';
import { Op } from 'sequelize';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import { setRlsContext } from '../middleware/rls-context.middleware.js';
import { findDoctorAuthorizedAppointment } from '../utils/doctor-appointment-access.js';
import { resolveActor } from '../services/appointment-identity.service.js';

const PATIENT_INCLUDE = { model: User, as: 'patient', attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'] };
const DOCTOR_INCLUDE = { model: Doctor, as: 'doctor', attributes: ['id', 'firstName', 'lastName', 'prefix', 'specialization'] };

/**
 * Run `work(transaction)` inside a request-scoped RLS transaction.
 * Escape hatch for operations this repository doesn't yet name explicitly —
 * prefer adding a named method below over calling this from route code.
 */
export async function withTransaction(req, work) {
  const transaction = await postgresSequelize.transaction();
  try {
    await req.setSequelizeRlsContext?.(transaction);
    const result = await work(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback().catch(() => {});
    throw error;
  }
}

/** Platform-admin bypass, for genuinely public routes with no req.user (e.g. slot availability). */
async function withPublicTransaction(work) {
  const transaction = await postgresSequelize.transaction();
  try {
    await setRlsContext(transaction, { orgId: 0, userId: 0, isPlatformAdmin: true });
    const result = await work(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback().catch(() => {});
    throw error;
  }
}

/** Fetch by id with no ownership check — caller must authorize separately. */
export async function findById(req, id, { include = [PATIENT_INCLUDE, DOCTOR_INCLUDE] } = {}) {
  return withTransaction(req, (transaction) => Appointment.findByPk(id, { include, transaction }));
}

/**
 * Fetch by id scoped to the requesting doctor. Returns null if the
 * appointment doesn't exist OR belongs to a different doctor — callers that
 * need to tell "not found" apart from "not yours" (for a 403 vs 404) should
 * authorize separately with isOwnedByActor() against an unscoped findById().
 *
 * allowMeetingFallback also matches on meetingId/meetingLink, for routes
 * reached via a video room id rather than a numeric appointment id — pass
 * false for anything that must be an exact numeric-id match (e.g. status
 * updates).
 */
export async function findByIdForDoctor(req, id, { include, allowMeetingFallback = true } = {}) {
  const actor = await resolveActor(req);
  return withTransaction(req, (transaction) =>
    findDoctorAuthorizedAppointment({
      AppointmentModel: Appointment,
      Op,
      appointmentId: id,
      doctorIdCandidates: actor.candidateIds,
      include,
      transaction,
      allowMeetingFallback,
    })
  );
}

export async function findByIdForPatient(req, id, { include = [DOCTOR_INCLUDE] } = {}) {
  const actor = await resolveActor(req);
  return withTransaction(req, (transaction) =>
    Appointment.findOne({ where: { id, userId: actor.id }, include, transaction })
  );
}

export async function findTodayForDoctor(req, doctorId) {
  const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const todayIST = `${nowIST.getFullYear()}-${String(nowIST.getMonth() + 1).padStart(2, '0')}-${String(nowIST.getDate()).padStart(2, '0')}`;
  return withTransaction(req, (transaction) =>
    Appointment.findAll({
      where: { doctorId, appointmentDate: todayIST },
      include: [{ ...PATIENT_INCLUDE, required: false }],
      order: [['appointmentTime', 'ASC']],
      transaction,
    })
  );
}

export async function findUpcomingForDoctor(req, doctorId) {
  const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const todayIST = `${nowIST.getFullYear()}-${String(nowIST.getMonth() + 1).padStart(2, '0')}-${String(nowIST.getDate()).padStart(2, '0')}`;
  return withTransaction(req, (transaction) =>
    Appointment.findAll({
      where: {
        doctorId,
        appointmentDate: { [Op.gte]: todayIST },
        status: { [Op.in]: ['pending', 'scheduled', 'confirmed', 'in-progress'] },
      },
      order: [['appointmentDate', 'ASC'], ['appointmentTime', 'ASC']],
      transaction,
    })
  );
}

/** Public, unauthenticated slot-availability check — existence-check only, non-PII. */
export async function findBookedSlotsForDoctorOnDate(doctorId, date) {
  return withPublicTransaction((transaction) =>
    Appointment.findAll({
      where: { doctorId, appointmentDate: date, status: { [Op.notIn]: ['cancelled', 'no-show'] } },
      attributes: ['appointmentTime', 'duration'],
      transaction,
    })
  );
}

export async function create(req, data) {
  return withTransaction(req, (transaction) => Appointment.create(data, { transaction }));
}

/** General-purpose update — updateStatus() is an alias kept for call-site clarity. */
export async function update(req, appointment, updates) {
  return withTransaction(req, (transaction) => appointment.update(updates, { transaction }));
}
export const updateStatus = update;
