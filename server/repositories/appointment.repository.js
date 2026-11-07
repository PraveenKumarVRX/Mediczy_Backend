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
  if (req.chatTransaction) return work(req.chatTransaction);
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

/**
 * Escape hatch for multi-step operations (fetch + conflict-check + update)
 * that must share ONE already-open transaction — the named methods above
 * each open and commit their own, so they can't be composed for atomicity.
 * Use inside a withTransaction(req, ...) block. allowMeetingFallback
 * defaults false here since actor-scoped in-transaction fetches are
 * exclusively used by numeric-id write flows so far (reschedule etc).
 */
export async function findByIdForActorInTransaction(actor, id, transaction, { include, allowMeetingFallback = false } = {}) {
  if (actor.type === 'doctor') {
    return findDoctorAuthorizedAppointment({
      AppointmentModel: Appointment,
      Op,
      appointmentId: id,
      doctorIdCandidates: actor.candidateIds,
      include,
      transaction,
      allowMeetingFallback,
    });
  }
  return Appointment.findByPk(id, { include, transaction, lock: transaction.LOCK.UPDATE });
}

/** Other non-cancelled/no-show appointments for a doctor on a given date — for slot-conflict checks. */
export async function findActiveAppointmentsForDoctorOnDate(doctorId, date, transaction, { excludeStatuses = ['cancelled', 'no-show'] } = {}) {
  await postgresSequelize.query('SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))', { replacements: { key: `doctor:${doctorId}:${date}` }, transaction });
  return Appointment.findAll({
    where: { doctorId, appointmentDate: date, status: { [Op.notIn]: excludeStatuses } },
    transaction,
  });
}

export async function findByIdForPatient(req, id, { include = [DOCTOR_INCLUDE] } = {}) {
  const actor = await resolveActor(req);
  return withTransaction(req, (transaction) =>
    Appointment.findOne({ where: { id, userId: actor.id }, include, transaction })
  );
}

/**
 * Customer-facing appointment status is deliberately a separate, named
 * repository operation.  It is scoped to the authenticated patient and runs
 * under the same RLS transaction as every other appointment read.
 */
export async function findRecentForPatient(req, { limit = 10 } = {}) {
  const actor = await resolveActor(req);
  if (actor.type !== 'patient' || !actor.id) return [];
  const boundedLimit = Math.min(Math.max(Number(limit) || 10, 1), 25);
  return withTransaction(req, (transaction) => Appointment.findAll({
    where: { userId: actor.id },
    attributes: [
      'id', 'doctorName', 'specialization', 'appointmentDate', 'appointmentTime',
      'consultationType', 'status', 'updatedAt',
    ],
    order: [['appointmentDate', 'DESC'], ['appointmentTime', 'DESC']],
    limit: boundedLimit,
    transaction,
  }));
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

export function queryInTransaction(sql, replacements, transaction) {
  return postgresSequelize.query(sql, { replacements, transaction });
}

export const withSystemTransaction = withPublicTransaction;
export function findByMeetingForUpdate(meetingId, transaction) {
  return Appointment.findOne({ where: { meetingId }, transaction, lock: transaction.LOCK.UPDATE });
}
