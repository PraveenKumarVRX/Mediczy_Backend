/**
 * Appointment Eligibility Service
 * ────────────────────────────────
 * Encapsulates business rules that determine whether an appointment
 * can be booked: tenant-partner eligibility, doctor & patient conflict
 * detection, and consultation-fee resolution.
 *
 * The main appointment controller can delegate to these helpers rather
 * than re-implementing the same logic inline across create / reschedule
 * flows.
 */

import { Op } from 'sequelize';
import Appointment from '../models/appointment.model.intelligent.js';
import DoctorAvailability from '../models/doctorAvailability.model.intelligent.js';
import Doctor from '../models/doctor.model.intelligent.js';
import tenantPartnerService from './tenant-partner.service.js';
import {
  canonicalizeAppointmentTime,
  findSlotConflict,
} from '../utils/appointmentSlotTime.js';

// ─── Tenant-partner eligibility ───────────────────────────────────────────────
/**
 * Verify that a corporate tenant is allowed to book with a clinic tenant.
 * Returns true if no corporate context OR if the partner relationship is active.
 *
 * @param {number|null} corporateTenantId
 * @param {number|null} clinicTenantId
 * @returns {Promise<{ eligible: boolean, reason?: string }>}
 */
export async function checkTenantPartnerEligibility(corporateTenantId, clinicTenantId) {
  if (!corporateTenantId || !clinicTenantId) return { eligible: true };

  const isPartnered = await tenantPartnerService.isActivePartner(corporateTenantId, clinicTenantId);
  if (!isPartnered) {
    return {
      eligible: false,
      reason: 'Selected doctor is not part of your corporate partner clinics',
    };
  }
  return { eligible: true };
}

// ─── Doctor double-booking check ─────────────────────────────────────────────
/**
 * Check if the doctor already has an active booking at the given slot.
 *
 * @param {number} doctorId - Resolved internal doctor ID
 * @param {string} appointmentDate - YYYY-MM-DD
 * @param {string} appointmentTime - HH:MM
 * @returns {Promise<{ conflict: boolean, appointment?: object }>}
 */
export async function checkDoctorConflict(doctorId, appointmentDate, appointmentTime, options = {}) {
  const canonicalTime = canonicalizeAppointmentTime(appointmentTime);
  const appointments = await Appointment.findAll({
    where: {
      doctorId,
      appointmentDate,
      status: { [Op.notIn]: ['cancelled', 'no-show'] },
      ...(options.excludeAppointmentId ? { id: { [Op.ne]: options.excludeAppointmentId } } : {}),
    },
    ...(options.transaction
      ? { transaction: options.transaction, lock: options.transaction.LOCK.UPDATE }
      : {}),
  });
  const conflict = findSlotConflict(appointments, canonicalTime, {
    excludeId: options.excludeAppointmentId,
  });
  return { conflict: !!conflict, appointment: conflict || undefined };
}

// ─── Patient double-booking check ────────────────────────────────────────────
/**
 * Check if the patient already has an active booking at the given slot.
 * Resolves the conflicting doctor's name for a helpful error message.
 *
 * @param {number} userId
 * @param {string} appointmentDate - YYYY-MM-DD
 * @param {string} appointmentTime - HH:MM
 * @returns {Promise<{ conflict: boolean, conflictDoctorName?: string, existingAppointment?: object }>}
 */
export async function checkPatientConflict(userId, appointmentDate, appointmentTime, options = {}) {
  const canonicalTime = canonicalizeAppointmentTime(appointmentTime);
  const appointments = await Appointment.findAll({
    where: {
      userId,
      appointmentDate,
      status: { [Op.notIn]: ['cancelled', 'no-show'] },
      ...(options.excludeAppointmentId ? { id: { [Op.ne]: options.excludeAppointmentId } } : {}),
    },
    ...(options.transaction
      ? { transaction: options.transaction, lock: options.transaction.LOCK.UPDATE }
      : {}),
  });
  const conflict = findSlotConflict(appointments, canonicalTime, {
    excludeId: options.excludeAppointmentId,
  });

  if (!conflict) return { conflict: false };

  const conflictDoctor = conflict.doctorId
    ? await Doctor.findByPk(conflict.doctorId, {
        attributes: ['firstName', 'lastName', 'specialization'],
      })
    : null;

  const conflictDoctorName = conflictDoctor
    ? `Dr. ${conflictDoctor.firstName} ${conflictDoctor.lastName} (${conflictDoctor.specialization})`
    : 'another doctor';

  return {
    conflict: true,
    conflictDoctorName,
    existingAppointment: { id: conflict.id, time: appointmentTime, date: appointmentDate },
  };
}

// ─── Consultation fee resolution ─────────────────────────────────────────────
/**
 * Resolve the consultation fee for a given type from DoctorAvailability.
 * Falls back to 500 if availability is not found.
 *
 * @param {number} doctorId - Resolved internal doctor ID
 * @param {string} consultationType - 'video' | 'audio' | 'chat' | 'in-person'
 * @returns {Promise<number>}
 */
export async function resolveConsultationFee(doctorId, consultationType) {
  const FALLBACK_FEE = 500;

  const availability = await DoctorAvailability.findOne({ where: { doctorId } });
  if (!availability) return FALLBACK_FEE;

  const feeMap = {
    video:      availability.videoConsultationFee,
    audio:      availability.audioConsultationFee,
    chat:       availability.chatConsultationFee,
    'in-person': availability.inPersonConsultationFee,
  };

  return feeMap[consultationType] ?? FALLBACK_FEE;
}

// ─── Comprehensive eligibility check (convenience wrapper) ───────────────────
/**
 * Run all pre-booking eligibility checks in one call.
 * Returns { eligible: true } if all checks pass, or
 * { eligible: false, statusCode, body } on the first failure.
 *
 * @param {{ doctorId, userId, appointmentDate, appointmentTime, corporateTenantId, clinicTenantId, doctor }} ctx
 * @returns {Promise<{ eligible: boolean, statusCode?: number, body?: object }>}
 */
export async function runEligibilityChecks(ctx) {
  const { doctorId, userId, appointmentDate, appointmentTime, corporateTenantId, clinicTenantId, doctor } = ctx;

  // 1 — Tenant-partner eligibility
  const tpCheck = await checkTenantPartnerEligibility(corporateTenantId, clinicTenantId);
  if (!tpCheck.eligible) {
    return { eligible: false, statusCode: 403, body: { success: false, message: tpCheck.reason } };
  }

  // 2 — Doctor conflict
  const dcCheck = await checkDoctorConflict(doctorId, appointmentDate, appointmentTime);
  if (dcCheck.conflict) {
    return {
      eligible: false,
      statusCode: 409,
      body: {
        success: false,
        message: `Dr. ${doctor.firstName} ${doctor.lastName} is not available at the selected time.`,
        conflict: 'doctor_busy',
      },
    };
  }

  // 3 — Patient conflict
  const pcCheck = await checkPatientConflict(userId, appointmentDate, appointmentTime);
  if (pcCheck.conflict) {
    return {
      eligible: false,
      statusCode: 409,
      body: {
        success: false,
        message: `You already have an appointment at ${appointmentTime} on ${appointmentDate} with ${pcCheck.conflictDoctorName}.`,
        conflict: 'patient_busy',
        existingAppointment: pcCheck.existingAppointment,
      },
    };
  }

  return { eligible: true };
}
