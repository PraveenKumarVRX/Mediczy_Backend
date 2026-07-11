/**
 * IdentityResolver — the one place that answers "who is making this
 * request, in which id-space" for appointment/video authorization.
 *
 * Why this exists: `doctors` and `users` are separate Postgres tables, each
 * with its own independent auto-increment `id` sequence. There is no
 * guarantee — and in practice frequent occurrence — that a given integer
 * means the same person in both tables (doctors.id=70 is a different real
 * person than users.id=70). A doctor's JWT carries doctors.id; some legacy
 * code paths instead carry a linked users.id with role='doctor'. Comparing
 * appointment.doctorId to req.user.id directly is only sometimes correct.
 *
 * This wraps utils/doctor-appointment-access.js's candidate-resolution
 * logic (which already handles the doctors.id / linked-user.id ambiguity)
 * behind a single, framework-shaped API so route/repository code asks one
 * question — "what id(s) can this actor legitimately own?" — instead of
 * re-deriving it per call site.
 */
import { User } from '../models/index.js';
import { resolveDoctorIdCandidates, isDoctorOwnerFromCandidates } from '../utils/doctor-appointment-access.js';

/**
 * @param {import('express').Request} req - must run after auth middleware
 *   (authUser or authDoctor) so req.user / req.doctor / req.userRole are set.
 * @returns {Promise<{ type: 'doctor'|'patient'|'admin', id: number, candidateIds: Array<string|number> }>}
 */
export async function resolveActor(req) {
  const isAdmin =
    Boolean(req.user?.isAdmin) ||
    (typeof req.userRole === 'string' && req.userRole.includes('admin'));

  if (isAdmin) {
    return { type: 'admin', id: req.user?.id ?? null, candidateIds: [] };
  }

  const isDoctorActor = req.userRole === 'doctor' || Boolean(req.doctor);
  if (isDoctorActor) {
    const actor = req.doctor || req.user;
    const candidateIds = await resolveDoctorIdCandidates({
      actorId: actor?.id,
      actorDoctorId: actor?.doctorId,
      actorEmail: actor?.email,
      UserModel: User,
    });
    return { type: 'doctor', id: actor?.id ?? null, candidateIds };
  }

  // Patient/user — users.id is the canonical id, no cross-table ambiguity
  // has been observed on this side, so no candidate resolution needed.
  const patientId = req.user?.id ?? req.user?.dataValues?.id ?? null;
  return { type: 'patient', id: patientId, candidateIds: patientId == null ? [] : [patientId] };
}

/** True if `appointment.doctorId` matches any id the resolved actor can own. */
export function isOwnedByActor(appointment, actor) {
  if (actor.type === 'admin') return true;
  if (actor.type === 'doctor') return isDoctorOwnerFromCandidates(appointment.doctorId, actor.candidateIds);
  if (actor.type === 'patient') return String(appointment.userId ?? '') === String(actor.id ?? '');
  return false;
}
