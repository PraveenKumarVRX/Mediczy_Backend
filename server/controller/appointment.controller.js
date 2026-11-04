import { appointmentSlotInstant } from '../utils/appointmentSlotTime.js';
import { appointmentFee } from '../utils/appointment-fee.js';
import { validationResult } from 'express-validator';
import Appointment from '../models/appointment.model.intelligent.js';
import DoctorAvailability from '../models/doctorAvailability.model.intelligent.js';
import Doctor from '../models/doctor.model.intelligent.js';
import User from '../models/user.model.intelligent.js';
import { Op } from 'sequelize';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import { DOCTOR_SENSITIVE_FIELDS } from '../utils/doctorSanitizer.js';
// Booking needs doctor.unique_id (used in error messages/payloads below), unlike an
// external-facing response — keep everything else DOCTOR_SENSITIVE_FIELDS excludes,
// above all `documents`, the multi-megabyte KYC blob this fix exists to stop locking.
const DOCTOR_BOOKING_EXCLUDE_FIELDS = DOCTOR_SENSITIVE_FIELDS.filter((field) => field !== 'unique_id');
import { createMeetingInfo } from '../utils/videoProvider.js';
import {
  sendAppointmentConfirmation,
  scheduleAppointmentReminder
} from '../tasks/index.js';
import intelligentDb from '../utils/intelligentDbClient.js';
import n8nService from '../services/n8n.service.js';
import notificationService from '../services/notification.service.js';
import kafkaEvents from '../services/kafka-events.service.js';
import tenantPartnerService from '../services/tenant-partner.service.js';
import {
  canonicalizeAppointmentTime,
  findSlotConflict,
  normalizeTimeHHMM,
} from '../utils/appointmentSlotTime.js';
import {
  buildActiveDoctorCallPayload,
  isRecoverableDoctorCall,
} from '../utils/activeCallPayload.js';
import { notifyCareTeamOfBooking } from '../services/care-team-notification.service.js';
import * as appointmentRepository from '../repositories/appointment.repository.js';
import { resolveActor, isOwnedByActor } from '../services/appointment-identity.service.js';
import { completeAppointment as completeAppointmentOrchestrated } from '../services/appointment-completion.service.js';
import { doctorDisplayName } from '../utils/doctor-name.js';

const getAppointmentDateTime = (appointment) => {
  if (!appointment?.appointmentDate || !appointment?.appointmentTime) return null;

  const datePart =
    appointment.appointmentDate instanceof Date
      ? appointment.appointmentDate.toISOString().split('T')[0]
      : String(appointment.appointmentDate);

  const timePart = normalizeTimeHHMM(appointment.appointmentTime);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(timePart)) {
    return null;
  }

  const candidate = appointmentSlotInstant(datePart, timePart);
  return candidate;
};

const canCancelOrReschedule = (appointment, minimumHours = 2) => {
  if (!appointment) return false;
  if (['completed', 'cancelled', 'no-show'].includes(appointment.status)) return false;
  const dateTime = getAppointmentDateTime(appointment);
  if (!dateTime) return true; // If we cannot parse, don't hard-block; let business rules be permissive.
  const diffMs = dateTime.getTime() - Date.now();
  return diffMs >= minimumHours * 60 * 60 * 1000;
};

const normalizeSymptoms = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry ?? '').trim())
      .filter(Boolean);
  }
  const asString = String(value).trim();
  if (!asString) return [];
  const parts = asString
    .split(/[,\n;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts : [asString];
};

const normalizeRequestedConsultationType = (requestedType) => {
  const normalized = String(requestedType || '').toLowerCase().trim();
  if (['video', 'audio', 'chat', 'in-person'].includes(normalized)) return normalized;
  if (['review', 'follow-up', 'followup'].includes(normalized)) return 'review';
  return normalized;
};

const parseMetadata = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

const isReviewRequestType = (value) => normalizeRequestedConsultationType(value) === 'review';

const findEligibleFreeReviewSourceAppointment = async ({ userId, doctorId, transaction }) => {
  const priorAppointments = await Appointment.findAll({
    where: {
      userId,
      doctorId,
      status: {
        [Op.notIn]: ['cancelled', 'no-show']
      }
    },
    order: [
      ['createdAt', 'DESC'],
      ['id', 'DESC']
    ],
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  return priorAppointments.find((apt) => {
    const metadata = parseMetadata(apt.metadata);
    if (isReviewRequestType(metadata?.requestedConsultationType)) return false;

    const reviewBenefit = metadata?.reviewBenefit || {};
    if (reviewBenefit.freeReviewUsed || reviewBenefit.freeReviewUsedAt || reviewBenefit.freeReviewAppointmentId) {
      return false;
    }

    return true;
  }) || null;
};

const mapConsultationTypeForDb = (requestedType) => {
  const normalized = String(requestedType || '').toLowerCase();
  if (normalized === 'in-person' || normalized === 'walkin' || normalized === 'walk-in') {
    return 'in-person';
  }
  if (normalized === 'review' || normalized === 'follow-up' || normalized === 'followup') {
    return 'online';
  }
  // For video/audio/chat and other online modes, Appointment model expects `online`.
  return 'online';
};

const resolveDoctorIdFromRequest = async (req) => {
  const fallbackId = req.user?.id;
  if (!fallbackId) return null;

  const isHospitalDoctor = req.user?.userType === 'hospital' && req.user?.role === 'doctor';
  const isClinicDoctor = req.user?.type === 'clinic_staff' && req.user?.role === 'doctor';
  if ((isHospitalDoctor || isClinicDoctor) && req.user?.email) {
    const doctorRecord = await Doctor.findOne({ where: { email: req.user.email } });
    if (doctorRecord?.id) return doctorRecord.id;
  }

  return fallbackId;
};

/**
 * Resolve doctor by ID (accepts both numeric ID and alphanumeric unique_id)
 * @param {string|number} doctorIdOrUniqueId - Can be numeric (2, 3) or alphanumeric (D2C193)
 * @returns {Promise<Object|null>} Doctor object or null
 */
const resolveDoctorId = async (doctorIdOrUniqueId, queryOptions = {}) => {
  if (!doctorIdOrUniqueId) return null;

  const idString = String(doctorIdOrUniqueId).trim();

  // Check if it's a numeric ID
  if (/^\d+$/.test(idString)) {
    return await Doctor.findByPk(parseInt(idString, 10), queryOptions);
  }

  // Check if it's an alphanumeric unique_id (starts with D)
  if (/^D[A-Z0-9]{5}$/i.test(idString)) {
    return await Doctor.findOne({ where: { unique_id: idString.toUpperCase() }, ...queryOptions });
  }

  // Try both as fallback
  const doctor = await Doctor.findOne({
    where: {
      [Op.or]: [
        { id: isNaN(idString) ? null : parseInt(idString, 10) },
        { unique_id: idString.toUpperCase() }
      ]
    },
    ...queryOptions
  });

  return doctor;
};

/**
 * Create a new appointment
 * POST /api/appointments
 */
export const createAppointment = async (req, res) => {
  try {
    console.log('📅 Appointment creation request received', {
      userId: req.user?.id,
      consultationType: req.body?.consultationType
    });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      doctorId,
      appointmentDate,
      appointmentTime: rawAppointmentTime,
      consultationType: rawConsultationType,
      symptoms,
      reason
    } = req.body;

    const appointmentTime = canonicalizeAppointmentTime(rawAppointmentTime);
    const userId = req.user.id;
    const requestedConsultationType = normalizeRequestedConsultationType(rawConsultationType);
    const dbConsultationType = mapConsultationTypeForDb(requestedConsultationType);
    const normalizedSymptoms = normalizeSymptoms(symptoms);

    const requestedSlot = appointmentSlotInstant(appointmentDate, appointmentTime);
    if (!requestedSlot) {
      return res.status(400).json({
        success: false,
        message: 'Invalid appointment date/time'
      });
    }
    if (requestedSlot <= new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Appointment must be scheduled for a future time'
      });
    }

    const fail = (status, payload) => {
      const err = new Error(payload?.message || 'Appointment validation failed');
      err.statusCode = status;
      err.payload = payload;
      throw err;
    };

    let user;
    let doctor;
    let appointment;
    let consultationFee = 500;
    let paymentStatus = 'pending';
    let freeReviewApplied = false;
    let freeReviewSourceAppointmentId = null;
    const transaction = await postgresSequelize.transaction();
    try {
      await req.setSequelizeRlsContext?.(transaction);

      user = await User.findByPk(userId, {
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!user) {
        fail(404, { success: false, message: 'User not found' });
      }

      // Fetch doctor details (supports both numeric ID and alphanumeric unique_id)
      doctor = await resolveDoctorId(doctorId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
        attributes: { exclude: DOCTOR_BOOKING_EXCLUDE_FIELDS }
      });
      if (!doctor) {
        fail(404, {
          success: false,
          message: 'Doctor not found',
          hint: 'Please provide a valid doctor ID (numeric like 2 or alphanumeric like D2C193)'
        });
      }

      // Use the resolved internal ID for database operations
      const resolvedDoctorId = doctor.id;

      // Prefer explicit corporate org on token; fall back to user_associations lookup
      // so self-booked appointments by corporate employees are visible in the corporate portal.
      let corporateTenantId = req.user?.organization_type === 'corporate'
        ? (req.user.organization_id || req.user.tenant_id)
        : null;
      if (!corporateTenantId && req.user?.id) {
        const [assocRows] = await postgresSequelize.query(
          `SELECT "entityId" FROM user_associations
           WHERE "userId" = :uid AND "entityType" = 'corporate' AND status = 'active'
           LIMIT 1`,
          { replacements: { uid: req.user.id } }
        ).catch(() => [[]]);
        if (assocRows[0]?.entityId) corporateTenantId = assocRows[0].entityId;
      }
      const clinicTenantId = doctor.organization_type === 'clinic'
        ? doctor.organization_id
        : null;

      if (corporateTenantId && clinicTenantId) {
        const isPartnered = await tenantPartnerService.isActivePartner(corporateTenantId, clinicTenantId);
        if (!isPartnered) {
          fail(403, {
            success: false,
            message: 'Selected doctor is not part of your corporate partner clinics'
          });
        }
      }

      const activeDoctorAppointments = await Appointment.findAll({
        where: {
          doctorId: resolvedDoctorId,
          appointmentDate,
          status: {
            [Op.notIn]: ['cancelled', 'no-show']
          }
        },
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      const doctorConflict = findSlotConflict(activeDoctorAppointments, appointmentTime);

      if (doctorConflict) {
        fail(409, {
          success: false,
          message: `${doctorDisplayName([doctor.firstName, doctor.lastName].filter(Boolean).join(' '))} (ID: ${doctor.unique_id || doctor.id}) is not available at the selected time. The time slot is already booked by another patient. Please select a different time slot.`,
          conflict: 'doctor_busy',
          doctorId: doctor.id,
          doctorPublicId: doctor.unique_id
        });
      }

      const activePatientAppointments = await Appointment.findAll({
        where: {
          userId,
          appointmentDate,
          status: {
            [Op.notIn]: ['cancelled', 'no-show']
          }
        },
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      const patientConflict = findSlotConflict(activePatientAppointments, appointmentTime);

      if (patientConflict) {
        const conflictDoctor = await Doctor.findByPk(patientConflict.doctorId, {
          attributes: ['firstName', 'lastName', 'specialization'],
          transaction
        });
        const conflictDoctorName = conflictDoctor
          ? `Dr. ${conflictDoctor.firstName} ${conflictDoctor.lastName} (${conflictDoctor.specialization})`
          : 'another doctor';

        fail(409, {
          success: false,
          message: `You already have an appointment scheduled at ${appointmentTime} on ${appointmentDate} with ${conflictDoctorName}. You cannot book multiple appointments at the same time. Please select a different time slot or cancel your existing appointment first.`,
          conflict: 'patient_busy',
          existingAppointment: {
            id: patientConflict.id,
            doctorName: conflictDoctorName,
            time: appointmentTime,
            date: appointmentDate
          }
        });
      }

      // Get consultation fee based on type
      const availability = await DoctorAvailability.findOne({
        where: { doctorId: resolvedDoctorId },
        transaction
      });

      consultationFee = appointmentFee(doctor, availability, requestedConsultationType);
      if (consultationFee === null) fail(503, { success: false, message: 'Could not confirm the consultation price. Please try another doctor or contact support.' });
      if (consultationFee === 0) paymentStatus = 'paid';

      if (requestedConsultationType === 'review') {
        const eligibleSource = await findEligibleFreeReviewSourceAppointment({
          userId,
          doctorId: resolvedDoctorId,
          transaction
        });

        if (eligibleSource) {
          consultationFee = 0;
          paymentStatus = 'paid';
          freeReviewApplied = true;
          freeReviewSourceAppointmentId = eligibleSource.id;
        }
      }

      // Auto-assign organization_id from doctor's organization
      const organizationId = doctor.organization_id || doctor.hospitalId || req.user?.organization_id || req.userTenantId || null;
      const organizationType = doctor.organization_type || (doctor.hospitalId ? 'hospital' : null);

      // Create appointment
      appointment = await Appointment.create({
        userId,
        patientName: `${user.firstName} ${user.lastName}`,
        patientEmail: user.email,
        patientPhone: user.phoneNumber || 'N/A',
        doctorId: resolvedDoctorId,
        doctorName: doctorDisplayName([doctor.firstName, doctor.lastName].filter(Boolean).join(' ')),
        specialization: doctor.specialization,
        appointmentDate,
        appointmentTime,
        consultationType: dbConsultationType,
        paymentAmount: consultationFee,
        symptoms: normalizedSymptoms,
        reason,
        status: 'scheduled',
        paymentStatus,
        organization_id: organizationId,
        organization_type: organizationType,
        tenant_id: organizationId,
        corporate_tenant_id: corporateTenantId,
        metadata: {
          ...(req.userTenantId ? { organizationId: req.userTenantId } : {}),
          ...(corporateTenantId ? { corporateTenantId } : {}),
          requestedConsultationType: requestedConsultationType || null,
          doctorPublicId: doctor.unique_id || null,
          freeReviewApplied,
          freeReviewSourceAppointmentId,
          reviewBenefit: requestedConsultationType === 'review'
            ? undefined
            : {
                freeReviewEligible: true,
                freeReviewUsed: false,
                sourceConsultationId: null
              },
          channel:
            requestedConsultationType === 'review'
              ? 'review'
              : requestedConsultationType === 'audio'
              ? 'phone'
              : requestedConsultationType === 'chat'
                ? 'chat'
                : dbConsultationType === 'in-person'
                  ? 'in-person'
                  : 'video'
        }
      }, { transaction });

      if (freeReviewApplied && freeReviewSourceAppointmentId) {
        const sourceAppointment = await Appointment.findByPk(freeReviewSourceAppointmentId, {
          transaction,
          lock: transaction.LOCK.UPDATE
        });

        if (sourceAppointment) {
          const sourceMetadata = parseMetadata(sourceAppointment.metadata);
          const sourceReviewBenefit = sourceMetadata.reviewBenefit || {};
          await sourceAppointment.update({
            metadata: {
              ...sourceMetadata,
              reviewBenefit: {
                ...sourceReviewBenefit,
                freeReviewEligible: true,
                freeReviewUsed: true,
                freeReviewUsedAt: new Date().toISOString(),
                freeReviewAppointmentId: appointment.id,
                sourceConsultationId: sourceAppointment.id
              }
            }
          }, { transaction });
        }
      }

      // Generate meeting link for video/audio/telemedicine consultations
      if (['video', 'audio', 'telemedicine', 'review'].includes(requestedConsultationType)) {
        const meetingInfo = createMeetingInfo({ appointmentId: appointment.id });
        await appointment.update({
          meetingId: meetingInfo.meetingId,
          meetingLink: meetingInfo.meetingLink,
          meetingDetails: meetingInfo.meetingDetails,
          metadata: {
            ...(appointment.metadata || {}),
            meeting: {
              roomId: meetingInfo.meetingId,
              meetingLink: meetingInfo.meetingLink,
              roomCreated: false
            }
          }
        }, { transaction });
      }

      await transaction.commit();
    } catch (txError) {
      if (!transaction.finished) {
        await transaction.rollback();
      }
      throw txError;
    }

    // Keep compatibility for existing notification payloads that expect this field.
    appointment.consultationFee = Number(appointment.paymentAmount ?? consultationFee ?? 0);

    // Send confirmation email (async task)
    try {
      await sendAppointmentConfirmation(user.email, {
        doctorName: appointment.doctorName,
        date: appointmentDate,
        time: appointmentTime,
        type: requestedConsultationType
      });
    } catch (emailError) {
      console.error('Failed to send confirmation email:', emailError);
    }

    // Schedule reminder (async task)
    try {
      const appointmentDateTime = new Date(`${appointmentDate} ${appointmentTime}`);
      await scheduleAppointmentReminder(userId, appointment.id, appointmentDateTime);
    } catch (reminderError) {
      console.error('Failed to schedule reminder:', reminderError);
    }

    // Publish to Kafka (async task) - Real-time event streaming
    try {
      await kafkaEvents.publishAppointmentCreated(appointment, user, doctor);
      console.log('✅ Kafka event published: appointment.created');
    } catch (kafkaError) {
      console.error('Failed to publish to Kafka:', kafkaError);
    }

    // Trigger n8n workflow for multi-channel notifications (fire-and-forget, never blocks booking)
    n8nService.appointmentBooked({
      id: appointment.id,
      userId: appointment.userId,
      patientName: appointment.patientName,
      patientEmail: appointment.patientEmail,
      patientPhone: appointment.patientPhone,
      doctorId: appointment.doctorId,
      doctorName: appointment.doctorName,
      appointmentDate: appointment.appointmentDate,
      appointmentTime: appointment.appointmentTime,
      consultationType: appointment.consultationType,
      consultationFee: Number(appointment.paymentAmount ?? consultationFee ?? 0),
      status: appointment.status
    }).catch((n8nError) => {
      console.error('Failed to trigger n8n workflow:', n8nError);
    });

    // Send comprehensive notification to doctor (NEW - Multi-channel)
    try {
      console.log('📧 Sending appointment notification to doctor...');

      // Prepare appointment data for iCal generation
      const appointmentData = {
        id: appointment.id,
        patientName: appointment.patientName,
        patientEmail: appointment.patientEmail || user.email,
        patientPhone: appointment.patientPhone || user.phoneNumber || user.phone,
        doctorName: appointment.doctorName,
        doctorEmail: doctor.email,
        specialization: appointment.specialization,
        appointmentDate: appointment.appointmentDate,
        appointmentTime: appointment.appointmentTime,
        duration: appointment.duration || 30,
        consultationType: appointment.consultationType,
        consultationFee: Number(appointment.paymentAmount ?? consultationFee ?? 0),
        symptoms: appointment.symptoms,
        notes: appointment.notes,
        location: appointment.location,
        meetingLink: appointment.meetingLink
      };

      await notificationService.notifyAppointmentRequest(appointment, appointmentData);
      console.log('✅ Doctor notification sent successfully');
    } catch (notificationError) {
      console.error('❌ Failed to send doctor notification:', notificationError);
    }

    // Notify assigned team users (fire-and-forget)
    (async () => {
      try {
        const orgId = appointment.corporate_tenant_id || appointment.organization_id;
        if (!orgId) return;

        // Find team users assigned to this corporate/org
        const teamUsers = await postgresSequelize.query(
          `SELECT DISTINCT u.id, u.email, u."firstName", u."lastName"
           FROM "Users" u
           WHERE u.id IN (
             SELECT "assignedTo" FROM corporates
             WHERE id = :orgId AND "assignedTo" IS NOT NULL
           )
           UNION
           SELECT DISTINCT u.id, u.email, u."firstName", u."lastName"
           FROM "Users" u
           WHERE u.organization_id = :orgId
             AND (u."isTeam" = true OR u.role IN ('team','team_lead','team_member'))
             AND u.status = 'active'
           LIMIT 10`,
          { replacements: { orgId: parseInt(orgId) }, type: postgresSequelize.QueryTypes.SELECT }
        );

        if (!teamUsers.length) return;

        const nodemailer = (await import('nodemailer')).default;
        const emailServiceModule = (await import('../services/emailService.js')).default;

        const apptDate = new Date(appointment.appointmentDate).toLocaleDateString('en-IN', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
        const symptoms = Array.isArray(appointment.symptoms)
          ? appointment.symptoms.join(', ')
          : (appointment.symptoms || appointment.reason || '—');

        const emailHtml = `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
            <div style="background:#1a6eb5;padding:20px;border-radius:8px 8px 0 0">
              <h2 style="color:#fff;margin:0">New Appointment Booking</h2>
              <p style="color:#cfe8ff;margin:4px 0 0">Action required — please review and confirm</p>
            </div>
            <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
              <table style="width:100%;border-collapse:collapse">
                <tr><td style="padding:8px 0;color:#6b7280;width:40%">Appointment ID</td><td style="padding:8px 0;font-weight:600">#${appointment.id}</td></tr>
                <tr><td style="padding:8px 0;color:#6b7280">Patient</td><td style="padding:8px 0;font-weight:600">${appointment.patientName}</td></tr>
                <tr><td style="padding:8px 0;color:#6b7280">Patient Email</td><td style="padding:8px 0">${appointment.patientEmail || '—'}</td></tr>
                <tr><td style="padding:8px 0;color:#6b7280">Patient Phone</td><td style="padding:8px 0">${appointment.patientPhone || '—'}</td></tr>
                <tr><td style="padding:8px 0;color:#6b7280">Doctor</td><td style="padding:8px 0;font-weight:600">${appointment.doctorName}</td></tr>
                <tr><td style="padding:8px 0;color:#6b7280">Specialization</td><td style="padding:8px 0">${appointment.specialization || '—'}</td></tr>
                <tr><td style="padding:8px 0;color:#6b7280">Date</td><td style="padding:8px 0">${apptDate}</td></tr>
                <tr><td style="padding:8px 0;color:#6b7280">Time</td><td style="padding:8px 0">${appointment.appointmentTime}</td></tr>
                <tr><td style="padding:8px 0;color:#6b7280">Type</td><td style="padding:8px 0;text-transform:capitalize">${appointment.consultationType || '—'}</td></tr>
                <tr><td style="padding:8px 0;color:#6b7280">Symptoms / Reason</td><td style="padding:8px 0">${symptoms}</td></tr>
                <tr><td style="padding:8px 0;color:#6b7280">Payment Status</td><td style="padding:8px 0;text-transform:capitalize">${appointment.paymentStatus || 'pending'}</td></tr>
              </table>
              <div style="margin-top:20px;text-align:center">
                <a href="https://mediqzy.com/team/appointments" style="background:#1a6eb5;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:600">View in Dashboard</a>
              </div>
            </div>
          </div>`;

        for (const tu of teamUsers) {
          if (!tu.email) continue;
          try {
            // Use team user's own email_settings SMTP if available
            const [cfg] = await postgresSequelize.query(
              `SELECT email, display_name, smtp_host, smtp_port, smtp_secure, smtp_username, smtp_password
               FROM email_settings
               WHERE user_id = :userId AND is_active = true AND deleted_at IS NULL
               ORDER BY is_default DESC LIMIT 1`,
              { replacements: { userId: tu.id }, type: postgresSequelize.QueryTypes.SELECT }
            );

            if (cfg?.smtp_host && cfg?.smtp_password) {
              const transporter = nodemailer.createTransport({
                host: cfg.smtp_host,
                port: cfg.smtp_port || 465,
                secure: cfg.smtp_port === 465 || cfg.smtp_secure === true,
                auth: { user: cfg.smtp_username || cfg.email, pass: cfg.smtp_password },
                connectionTimeout: 10000, greetingTimeout: 5000, socketTimeout: 15000,
                tls: { rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false', minVersion: 'TLSv1.2' }
              });
              await transporter.sendMail({
                from: `"${cfg.display_name || 'Mediqzy'}" <${cfg.email}>`,
                to: tu.email,
                subject: `New Appointment — ${appointment.patientName} on ${apptDate}`,
                html: emailHtml,
                headers: { 'X-Mediqzy-System': 'true', 'X-Sender-Type': 'team-booking-alert' }
              });
            } else {
              // Fallback: global noreply config
              await emailServiceModule.sendOutboundEmail(1, {
                to: tu.email,
                subject: `New Appointment — ${appointment.patientName} on ${apptDate}`,
                htmlContent: emailHtml
              });
            }
            console.log(`✅ [team-booking-alert] Notified ${tu.email} (team user ${tu.id}) for appointment #${appointment.id}`);
          } catch (tuErr) {
            console.error(`❌ [team-booking-alert] Failed to notify team user ${tu.id}:`, tuErr.message);
          }
        }
      } catch (teamNotifyErr) {
        console.error('❌ [team-booking-alert] Error resolving team users:', teamNotifyErr.message);
      }
    })();

    // Send confirmation notification to patient
    try {
      console.log('📧 Sending appointment confirmation to patient...');

      // Prepare appointment data for iCal generation
      const appointmentData = {
        id: appointment.id,
        patientName: appointment.patientName,
        patientEmail: appointment.patientEmail || user.email,
        patientPhone: appointment.patientPhone || user.phoneNumber || user.phone,
        doctorName: appointment.doctorName,
        doctorEmail: doctor.email,
        specialization: appointment.specialization,
        appointmentDate: appointment.appointmentDate,
        appointmentTime: appointment.appointmentTime,
        duration: appointment.duration || 30,
        consultationType: appointment.consultationType,
        consultationFee: Number(appointment.paymentAmount ?? consultationFee ?? 0),
        symptoms: appointment.symptoms,
        notes: appointment.notes,
        location: appointment.location,
        meetingLink: appointment.meetingLink
      };

      await notificationService.send({
        userId: appointment.userId,
        userType: 'patient',
        type: 'appointment_booked',
        variables: {
          patientName: appointment.patientName,
          doctorName: appointment.doctorName,
          date: appointment.appointmentDate,
          time: appointment.appointmentTime,
          appointmentId: appointment.id,
            consultationType: requestedConsultationType,
            paymentStatus: paymentStatus === 'paid' ? 'Paid' : 'Pending'
        },
        data: {
          appointmentId: appointment.id,
          status: 'scheduled',
          doctorId: appointment.doctorId
        },
        channels: ['in-app', 'email'],
        actionUrl: '/my-bookings',
        appointmentData: appointmentData
      });
      console.log('✅ Patient confirmation sent successfully');
    } catch (patientNotificationError) {
      console.error('❌ Failed to send patient confirmation:', patientNotificationError);
    }

    notifyCareTeamOfBooking({
      appointment,
      patient: user,
      doctor,
      bookingSource: 'web'
    });

    // Mirror to intelligent DB (fire-and-forget style)
    (async () => {
      try {
        const payload = {
          id: appointment.id,
          patientId: appointment.userId,
          doctorId: appointment.doctorId,
          appointmentDate: appointment.appointmentDate,
          appointmentTime: appointment.appointmentTime,
          consultationType: appointment.consultationType,
          status: appointment.status,
          createdAt: appointment.createdAt,
          updatedAt: appointment.updatedAt
        };
        await intelligentDb.ingest('appointments_v1', payload);
      } catch (err) {
        console.error('Intelligent DB ingest (appointment) failed:', err.message || err);
      }
    })();

    // In-person OPD: issue token only if appointment is today; else defer to arrival (P1)
    let qmsToken = null;
    try {
      const { isInPersonConsultation, issueTokenForAppointment } = await import('../services/qms-opd.service.js');
      const bookedType = requestedConsultationType || appointment.consultationType;
      if (isInPersonConsultation(bookedType)) {
        const notifyOptIn = req.body?.notifyOptIn === true || req.body?.notifyOptIn === 'true';
        qmsToken = await issueTokenForAppointment(appointment, {
          notifyOptIn,
          notifyPhone: appointment.patientPhone || user.phoneNumber || user.phone,
          organizationId: appointment.organization_id || appointment.tenant_id || doctor.organization_id || doctor.hospitalId,
          source: 'online-in-person-booking',
          mode: 'auto',
        });
        try {
          const meta = typeof appointment.metadata === 'object' && appointment.metadata
            ? appointment.metadata
            : {};
          await appointment.update({
            metadata: {
              ...meta,
              notifyOptIn,
              qmsDeferred: Boolean(qmsToken?.deferred),
              qmsActivateOn: qmsToken?.activateOn || null,
              qmsTokenNumber: qmsToken?.tokenNumber || null,
              qmsEntryId: qmsToken?.id || null,
              qmsZone: qmsToken?.queueZone || null,
            },
          });
        } catch (_) { /* non-fatal */ }
      }
    } catch (qmsErr) {
      console.error('[appointment] QMS token issue failed:', qmsErr.message);
    }

    const qmsMessage = !qmsToken
      ? 'Appointment booked successfully'
      : qmsToken.deferred
        ? `Appointment booked. Your OPD token will activate on ${qmsToken.activateOn} at the kiosk/reception.`
        : qmsToken.tokenNumber
          ? `Appointment booked. OPD token ${qmsToken.tokenNumber} issued — check WhatsApp and SMS if you opted in.`
          : 'Appointment booked successfully';

    return res.status(201).json({
      success: true,
      message: qmsMessage,
      data: {
        id: appointment.id,
        doctorId: appointment.doctorId,
        doctorName: appointment.doctorName,
        patientName: appointment.patientName,
        patientPhone: appointment.patientPhone,
        specialization: appointment.specialization,
        appointmentDate: appointment.appointmentDate,
        appointmentTime: appointment.appointmentTime,
        consultationType: requestedConsultationType || appointment.consultationType,
        consultationFee: Number(appointment.paymentAmount ?? consultationFee ?? 0),
        status: appointment.status,
        paymentStatus: appointment.paymentStatus,
        freeReviewApplied,
        qmsToken: qmsToken
          ? {
              tokenNumber: qmsToken.tokenNumber || null,
              deferred: Boolean(qmsToken.deferred),
              activateOn: qmsToken.activateOn || null,
              queueZone: qmsToken.queueZone,
              doctorName: qmsToken.doctorName,
              estimatedWaitMinutes: qmsToken.estimatedWaitMinutes,
              counterId: qmsToken.counterId,
              status: qmsToken.status,
            }
          : null,
      },
      appointment: {
        id: appointment.id,
        doctorId: appointment.doctorId,
        doctorName: appointment.doctorName,
        patientName: appointment.patientName,
        patientPhone: appointment.patientPhone,
        specialization: appointment.specialization,
        appointmentDate: appointment.appointmentDate,
        appointmentTime: appointment.appointmentTime,
        consultationType: requestedConsultationType || appointment.consultationType,
        consultationFee: Number(appointment.paymentAmount ?? consultationFee ?? 0),
        status: appointment.status,
        paymentStatus: appointment.paymentStatus,
        freeReviewApplied,
        qmsToken: qmsToken
          ? {
              tokenNumber: qmsToken.tokenNumber || null,
              deferred: Boolean(qmsToken.deferred),
              activateOn: qmsToken.activateOn || null,
              queueZone: qmsToken.queueZone,
              estimatedWaitMinutes: qmsToken.estimatedWaitMinutes,
            }
          : null,
      },
      qmsToken,
    });
  } catch (error) {
    if (error?.statusCode && error?.payload) {
      return res.status(error.statusCode).json(error.payload);
    }
    console.error('Create appointment error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create appointment',
      error: error.message
    });
  }
};

/**
 * Get user's appointments
 * GET /api/appointments
 */
export const getUserAppointments = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, upcoming, past, consultationType } = req.query;

    const whereClause = { userId };

    // Filter by status if provided (supports comma-separated values)
    if (status) {
      const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        whereClause.status = statuses[0];
      } else if (statuses.length > 1) {
        whereClause.status = { [Op.in]: statuses };
      }
    }

    // Filter by consultation type if provided
    if (consultationType) {
      whereClause.consultationType = consultationType;
    }

    // Filter upcoming or past
    const now = new Date();
    if (upcoming === 'true') {
      // Upcoming: pending, scheduled, confirmed, in-progress (not completed, cancelled, or no-show)
      whereClause.appointmentDate = {
        [Op.gte]: now.toISOString().split('T')[0]
      };
      whereClause.status = {
        [Op.in]: ['pending', 'scheduled', 'confirmed', 'in-progress', 'rescheduled']
      };
    } else if (past === 'true') {
      // Past: completed, cancelled, no-show
      whereClause.appointmentDate = {
        [Op.lt]: now.toISOString().split('T')[0]
      };
      whereClause.status = {
        [Op.in]: ['completed', 'cancelled', 'no-show']
      };
    }

    // appointments has RLS enforced ("userId" = current_app_user_id() OR ...) —
    // without setting the session context, every row is silently filtered out
    // and this always returns an empty list, even for the row's own owner.
    const rlsTransaction = await postgresSequelize.transaction();
    let appointments;
    try {
      await req.setSequelizeRlsContext?.(rlsTransaction);
      appointments = await Appointment.findAll({
        where: whereClause,
        order: [
          ['appointmentDate', 'DESC'],
          ['appointmentTime', 'DESC']
        ],
        transaction: rlsTransaction
      });
      await rlsTransaction.commit();
    } catch (err) {
      await rlsTransaction.rollback();
      throw err;
    }

    const activeCallAppointment = appointments.find((appointment) => isRecoverableDoctorCall(appointment));
    const activeCall = activeCallAppointment
      ? buildActiveDoctorCallPayload(activeCallAppointment)
      : null;

    return res.status(200).json({
      success: true,
      count: appointments.length,
      data: appointments,
      appointments, // Keep for backward compatibility
      activeCall
    });
  } catch (error) {
    console.error('Get appointments error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch appointments',
      error: error.message
    });
  }
};

/**
 * Get doctor's appointments
 * GET /api/appointments/doctor
 */
export const getDoctorAppointments = async (req, res) => {
  try {
    const doctorId = await resolveDoctorIdFromRequest(req);
    const { status, date, upcoming } = req.query;

    const whereClause = { doctorId };

    if (status) {
      whereClause.status = status;
    }

    if (date) {
      whereClause.appointmentDate = date;
    }

    if (upcoming === 'true') {
      const now = new Date();
      whereClause.appointmentDate = {
        [Op.gte]: now.toISOString().split('T')[0]
      };
    }

    // Same RLS gap as getUserAppointments — must set app.current_user_id
    // (= this doctor's id) before querying, or every row is filtered out.
    const rlsTransaction = await postgresSequelize.transaction();
    let appointments;
    try {
      await req.setSequelizeRlsContext?.(rlsTransaction);
      appointments = await Appointment.findAll({
        where: whereClause,
        order: [
          ['appointmentDate', 'ASC'],
          ['appointmentTime', 'ASC']
        ],
        transaction: rlsTransaction
      });
      await rlsTransaction.commit();
    } catch (err) {
      await rlsTransaction.rollback();
      throw err;
    }

    return res.status(200).json({
      count: appointments.length,
      appointments
    });
  } catch (error) {
    console.error('Get doctor appointments error:', error);
    return res.status(500).json({
      message: 'Failed to fetch appointments',
      error: error.message
    });
  }
};

/**
 * Get single appointment details
 * GET /api/appointments/:id
 */
export const getAppointmentById = async (req, res) => {
  try {
    const { id } = req.params;

    // appointment.doctorId lives in doctors.id's id-space, not users.id's —
    // resolveActor + isOwnedByActor handle that instead of comparing
    // appointment.doctorId to req.user.id directly (see
    // services/appointment-identity.service.js for why that's unsafe).
    const actor = await resolveActor(req);
    const appointment = actor.type === 'doctor'
      ? await appointmentRepository.findByIdForDoctor(req, id)
      : await appointmentRepository.findById(req, id);

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    if (!isOwnedByActor(appointment, actor)) {
      return res.status(403).json({ message: 'Unauthorized access' });
    }

    return res.status(200).json({ appointment });
  } catch (error) {
    console.error('Get appointment error:', error);
    return res.status(500).json({
      message: 'Failed to fetch appointment',
      error: error.message
    });
  }
};

/**
 * Cancel appointment
 * DELETE /api/appointments/:id
 */
export const cancelAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, cancellationReason } = req.body;
    const cancelReason = reason || cancellationReason;

    const actor = await resolveActor(req);
    const appointment = actor.type === 'doctor'
      ? await appointmentRepository.findByIdForDoctor(req, id)
      : await appointmentRepository.findById(req, id);

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    if (!isOwnedByActor(appointment, actor)) {
      return res.status(403).json({ message: 'Unauthorized access' });
    }

    // Check if appointment can be cancelled
    if (!canCancelOrReschedule(appointment, 2)) {
      return res.status(400).json({
        message: 'Appointment cannot be cancelled. Must be cancelled at least 2 hours before the scheduled time.'
      });
    }

    // actor.type is already known from resolveActor — no need to re-derive
    // who's cancelling by comparing ids again.
    const cancelledById = actor.type === 'patient' ? appointment.userId : appointment.doctorId;
    const defaultReason = actor.type === 'patient' ? 'Cancelled by patient' : 'Cancelled by doctor';

    await appointmentRepository.update(req, appointment, {
      status: 'cancelled',
      cancelledBy: cancelledById,
      cancellationReason: cancelReason || defaultReason,
      cancelledAt: new Date()
    });

    // Chat actions commit their durable receipt with the mutation before dispatch.
    if (!req.chatTransaction) try {
      const patient = await User.findByPk(appointment.userId);
      const doctor = await Doctor.findByPk(appointment.doctorId);
      if (patient && doctor) {
        await kafkaEvents.publishAppointmentCancelled(appointment, patient, doctor, cancelReason || defaultReason);
        console.log('✅ Kafka event published: appointment.cancelled');
      }
    } catch (kafkaError) {
      console.error('Failed to publish appointment cancellation to Kafka:', kafkaError);
    }

    return res.status(200).json({
      message: 'Appointment cancelled successfully',
      appointment
    });
  } catch (error) {
    console.error('Cancel appointment error:', error);
    return res.status(500).json({
      message: 'Failed to cancel appointment',
      error: error.message
    });
  }
};

/**
 * Reschedule appointment
 * PATCH /api/appointments/:id/reschedule
 */
export const rescheduleAppointment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { appointmentDate, appointmentTime: rawAppointmentTime } = req.body;
    const appointmentTime = canonicalizeAppointmentTime(rawAppointmentTime);
    const actor = await resolveActor(req);

    // Fetch, conflict-check, and update all need to share one transaction —
    // the named repository methods each open/commit their own, so this uses
    // the in-transaction primitives directly.
    const result = await appointmentRepository.withTransaction(req, async (transaction) => {
      const appointment = await appointmentRepository.findByIdForActorInTransaction(actor, id, transaction);
      if (!appointment) return { notFound: true };
      if (!isOwnedByActor(appointment, actor)) return { forbidden: true };
      if (!canCancelOrReschedule(appointment, 2)) return { badWindow: true };

      const doctorAppointments = await appointmentRepository.findActiveAppointmentsForDoctorOnDate(
        appointment.doctorId,
        appointmentDate,
        transaction
      );
      const conflict = findSlotConflict(doctorAppointments, appointmentTime, { excludeId: appointment.id });
      if (conflict) return { conflict: true };

      const oldDate = appointment.appointmentDate;
      const oldTime = appointment.appointmentTime;
      await appointment.update({ appointmentDate, appointmentTime, status: 'rescheduled' }, { transaction });
      return { appointment, oldDate, oldTime };
    });

    if (result.notFound) {
      return res.status(404).json({ message: 'Appointment not found' });
    }
    if (result.forbidden) {
      return res.status(403).json({ message: 'Unauthorized access' });
    }
    if (result.badWindow) {
      return res.status(400).json({ message: 'Appointment cannot be rescheduled at this time.' });
    }
    if (result.conflict) {
      return res.status(409).json({ message: 'This time slot is already booked. Please select another slot.' });
    }

    const { appointment, oldDate, oldTime } = result;

    // Chat actions commit their durable receipt with the mutation before dispatch.
    if (!req.chatTransaction) try {
      const patient = await User.findByPk(appointment.userId);
      const doctor = await Doctor.findByPk(appointment.doctorId);
      if (patient && doctor) {
        await kafkaEvents.publishAppointmentRescheduled(appointment, patient, doctor, oldDate, oldTime);
        console.log('✅ Kafka event published: appointment.rescheduled');
      }
    } catch (kafkaError) {
      console.error('Failed to publish appointment reschedule to Kafka:', kafkaError);
    }

    return res.status(200).json({
      message: 'Appointment rescheduled successfully',
      appointment
    });
  } catch (error) {
    console.error('Reschedule appointment error:', error);
    return res.status(500).json({
      message: 'Failed to reschedule appointment',
      error: error.message
    });
  }
};

/**
 * Complete appointment (Doctor only)
 * POST /api/appointments/:id/complete
 */
export const completeAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const { notes, prescription, autoCreatePrescription } = req.body;

    const actor = await resolveActor(req);
    if (actor.type !== 'doctor' && actor.type !== 'admin') {
      return res.status(403).json({ message: 'Unauthorized access' });
    }

    const result = await completeAppointmentOrchestrated(req, actor, id, { notes, prescription, autoCreatePrescription });

    if (result.notFound) {
      return res.status(404).json({ message: 'Appointment not found' });
    }
    if (result.forbidden) {
      return res.status(403).json({ message: 'Unauthorized access' });
    }

    const { appointment, prescriptionData } = result;

    // Publish Kafka event
    try {
      const patient = await User.findByPk(appointment.userId);
      const doctor = await Doctor.findByPk(appointment.doctorId);
      if (patient && doctor) {
        await kafkaEvents.publishAppointmentCompleted(appointment, patient, doctor);
        console.log('✅ Kafka event published: appointment.completed');
      }
    } catch (kafkaError) {
      console.error('Failed to publish appointment completion to Kafka:', kafkaError);
    }

    return res.status(200).json({
      message: 'Appointment marked as completed',
      appointment,
      prescription: prescriptionData
    });
  } catch (error) {
    console.error('Complete appointment error:', error);
    return res.status(500).json({
      message: 'Failed to complete appointment',
      error: error.message
    });
  }
};

/**
 * Update payment status
 * PATCH /api/appointments/:id/payment
 */
export const updatePaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentStatus, paymentMethod, transactionId } = req.body;

    // Same RLS gap as the read paths — must set app.current_user_id before
    // touching the RLS-protected appointments table or the row is invisible.
    const rlsTransaction = await postgresSequelize.transaction();
    let appointment;
    try {
      await req.setSequelizeRlsContext?.(rlsTransaction);
      appointment = await Appointment.findByPk(id, { transaction: rlsTransaction });

      if (!appointment) {
        await rlsTransaction.rollback();
        return res.status(404).json({ message: 'Appointment not found' });
      }

      await appointment.update({
        paymentStatus,
        paymentMethod,
        transactionId
      }, { transaction: rlsTransaction });

      // If payment is successful, confirm the appointment
      if (paymentStatus === 'paid' && appointment.status === 'scheduled') {
        await appointment.update({ status: 'confirmed' }, { transaction: rlsTransaction });
      }

      await rlsTransaction.commit();
    } catch (err) {
      await rlsTransaction.rollback();
      throw err;
    }

    return res.status(200).json({
      message: 'Payment status updated',
      appointment
    });
  } catch (error) {
    console.error('Update payment error:', error);
    return res.status(500).json({
      message: 'Failed to update payment status',
      error: error.message
    });
  }
};
