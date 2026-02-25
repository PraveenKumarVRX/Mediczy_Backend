import { validationResult } from 'express-validator';
import Appointment from '../models/appointment.model.intelligent.js';
import DoctorAvailability from '../models/doctorAvailability.model.intelligent.js';
import Doctor from '../models/doctor.model.intelligent.js';
import User from '../models/user.model.intelligent.js';
import { Op } from 'sequelize';
import { postgresSequelize } from '../db/postgres-sequelize.js';
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

const normalizeTimeHHMM = (value = '') => {
  const trimmed = String(value || '').trim();
  // If it's a time range like "12:30 - 13:00" or "12:30-13:00", extract just the start time
  if (trimmed.includes('-')) {
    const startTime = trimmed.split('-')[0].trim();
    if (/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) return startTime;
  }
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(trimmed)) return trimmed;
  if (/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(trimmed)) return trimmed.slice(0, 5);
  return trimmed;
};

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

  const candidate = new Date(`${datePart}T${timePart}:00`);
  return Number.isNaN(candidate.getTime()) ? null : candidate;
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

const mapConsultationTypeForDb = (requestedType) => {
  const normalized = String(requestedType || '').toLowerCase();
  if (normalized === 'in-person' || normalized === 'walkin' || normalized === 'walk-in') {
    return 'in-person';
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
      consultationType,
      symptoms,
      reason
    } = req.body;

    const appointmentTime = normalizeTimeHHMM(rawAppointmentTime);
    const userId = req.user.id;
    const requestedConsultationType = consultationType;
    const dbConsultationType = mapConsultationTypeForDb(requestedConsultationType);
    const normalizedSymptoms = normalizeSymptoms(symptoms);

    const requestedSlot = new Date(`${appointmentDate}T${appointmentTime}:00`);
    if (Number.isNaN(requestedSlot.getTime())) {
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
    const transaction = await postgresSequelize.transaction();
    try {
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
        lock: transaction.LOCK.UPDATE
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

      const corporateTenantId = req.user?.organization_type === 'corporate'
        ? (req.user.organization_id || req.user.tenant_id)
        : null;
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

      // Check if doctor has an appointment at this time (prevent doctor double-booking)
      const doctorConflict = await Appointment.findOne({
        where: {
          doctorId: resolvedDoctorId,
          appointmentDate,
          appointmentTime,
          status: {
            [Op.notIn]: ['cancelled', 'no-show']
          }
        },
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      if (doctorConflict) {
        fail(409, {
          success: false,
          message: `Dr. ${doctor.firstName} ${doctor.lastName} (ID: ${doctor.unique_id || doctor.id}) is not available at the selected time. The time slot is already booked by another patient. Please select a different time slot.`,
          conflict: 'doctor_busy',
          doctorId: doctor.id,
          doctorPublicId: doctor.unique_id
        });
      }

      // Check if patient has an appointment at this time (prevent patient double-booking)
      const patientConflict = await Appointment.findOne({
        where: {
          userId,
          appointmentDate,
          appointmentTime,
          status: {
            [Op.notIn]: ['cancelled', 'no-show']
          }
        },
        transaction,
        lock: transaction.LOCK.UPDATE
      });

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

      consultationFee = 500; // Default
      if (availability) {
        switch (requestedConsultationType) {
          case 'video':
            consultationFee = availability.videoConsultationFee;
            break;
          case 'audio':
            consultationFee = availability.audioConsultationFee;
            break;
          case 'chat':
            consultationFee = availability.chatConsultationFee;
            break;
          case 'in-person':
            consultationFee = availability.inPersonConsultationFee;
            break;
        }
      }
      consultationFee = Number(consultationFee || 500);

      // Auto-assign organization_id from doctor's organization
      const organizationId = doctor.organization_id || doctor.hospitalId || req.userTenantId || null;
      const organizationType = doctor.organization_type || (doctor.hospitalId ? 'hospital' : null);

      // Create appointment
      appointment = await Appointment.create({
        userId,
        patientName: `${user.firstName} ${user.lastName}`,
        patientEmail: user.email,
        patientPhone: user.phoneNumber || 'N/A',
        doctorId: resolvedDoctorId,
        doctorName: `Dr. ${doctor.firstName} ${doctor.lastName}`,
        specialization: doctor.specialization,
        appointmentDate,
        appointmentTime,
        consultationType: dbConsultationType,
        paymentAmount: consultationFee,
        symptoms: normalizedSymptoms,
        reason,
        status: 'scheduled',
        paymentStatus: 'pending',
        organization_id: organizationId,
        organization_type: organizationType,
        tenant_id: organizationId,
        corporate_tenant_id: corporateTenantId,
        metadata: {
          ...(req.userTenantId ? { organizationId: req.userTenantId } : {}),
          ...(corporateTenantId ? { corporateTenantId } : {}),
          requestedConsultationType: requestedConsultationType || null,
          doctorPublicId: doctor.unique_id || null,
          channel:
            requestedConsultationType === 'audio'
              ? 'phone'
              : requestedConsultationType === 'chat'
                ? 'chat'
                : dbConsultationType === 'in-person'
                  ? 'in-person'
                  : 'video'
        }
      }, { transaction });

      // Generate meeting link for video/audio/telemedicine consultations
      if (['video', 'audio', 'telemedicine'].includes(requestedConsultationType)) {
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
    appointment.consultationFee = Number(appointment.paymentAmount || consultationFee || 0);

    // Send confirmation email (async task)
    try {
      await sendAppointmentConfirmation(user.email, {
        doctorName: appointment.doctorName,
        date: appointmentDate,
        time: appointmentTime,
        type: consultationType
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

    // Trigger n8n workflow for multi-channel notifications (async)
    try {
      await n8nService.appointmentBooked({
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
        consultationFee: Number(appointment.paymentAmount || consultationFee || 0),
        status: appointment.status
      });
    } catch (n8nError) {
      console.error('Failed to trigger n8n workflow:', n8nError);
    }

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
        consultationFee: Number(appointment.paymentAmount || consultationFee || 0),
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
        consultationFee: Number(appointment.paymentAmount || consultationFee || 0),
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
          consultationType: consultationType,
          paymentStatus: 'Pending'
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

    return res.status(201).json({
      success: true,
      message: 'Appointment booked successfully',
      data: {
        id: appointment.id,
        doctorName: appointment.doctorName,
        specialization: appointment.specialization,
        appointmentDate: appointment.appointmentDate,
        appointmentTime: appointment.appointmentTime,
        consultationType: requestedConsultationType || appointment.consultationType,
        consultationFee: Number(appointment.paymentAmount || consultationFee || 0),
        status: appointment.status,
        paymentStatus: appointment.paymentStatus
      },
      appointment: {
        id: appointment.id,
        doctorName: appointment.doctorName,
        specialization: appointment.specialization,
        appointmentDate: appointment.appointmentDate,
        appointmentTime: appointment.appointmentTime,
        consultationType: requestedConsultationType || appointment.consultationType,
        consultationFee: Number(appointment.paymentAmount || consultationFee || 0),
        status: appointment.status,
        paymentStatus: appointment.paymentStatus
      }
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
      // Upcoming: scheduled, confirmed, in-progress (not completed, cancelled, or no-show)
      whereClause.appointmentDate = {
        [Op.gte]: now.toISOString().split('T')[0]
      };
      whereClause.status = {
        [Op.in]: ['scheduled', 'confirmed', 'in-progress', 'rescheduled']
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

    const appointments = await Appointment.findAll({
      where: whereClause,
      order: [
        ['appointmentDate', 'DESC'],
        ['appointmentTime', 'DESC']
      ]
    });

    return res.status(200).json({
      success: true,
      count: appointments.length,
      data: appointments,
      appointments // Keep for backward compatibility
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

    const appointments = await Appointment.findAll({
      where: whereClause,
      order: [
        ['appointmentDate', 'ASC'],
        ['appointmentTime', 'ASC']
      ]
    });

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
    const userId = req.user.id;

    const appointment = await Appointment.findByPk(id);

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    // Check authorization (user must be the patient or doctor)
    if (String(appointment.userId) !== String(userId) && String(appointment.doctorId) !== String(userId)) {
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
    const userId = req.user.id;
    const { reason, cancellationReason } = req.body;

    // Use either reason or cancellationReason field
    const cancelReason = reason || cancellationReason;

    const appointment = await Appointment.findByPk(id);

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    // Check authorization
    if (String(appointment.userId) !== String(userId) && String(appointment.doctorId) !== String(userId)) {
      return res.status(403).json({ message: 'Unauthorized access' });
    }

    // Check if appointment can be cancelled
    if (!canCancelOrReschedule(appointment, 2)) {
      return res.status(400).json({
        message: 'Appointment cannot be cancelled. Must be cancelled at least 2 hours before the scheduled time.'
      });
    }

    // Determine who is cancelling
    const cancelledByRole = String(appointment.userId) === String(userId) ? 'patient' : 'doctor';
    const cancelledById = cancelledByRole === 'patient'
      ? appointment.userId
      : appointment.doctorId;
    const defaultReason = cancelledByRole === 'patient'
      ? 'Cancelled by patient'
      : 'Cancelled by doctor';

    // Update appointment
    await appointment.update({
      status: 'cancelled',
      cancelledBy: cancelledById,
      cancellationReason: cancelReason || defaultReason,
      cancelledAt: new Date()
    });

    // Publish Kafka event
    try {
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
    const userId = req.user.id;
    const { appointmentDate, appointmentTime } = req.body;

    const appointment = await Appointment.findByPk(id);

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    // Check authorization
    if (String(appointment.userId) !== String(userId)) {
      return res.status(403).json({ message: 'Unauthorized access' });
    }

    // Check if appointment can be rescheduled
    if (!canCancelOrReschedule(appointment, 2)) {
      return res.status(400).json({
        message: 'Appointment cannot be rescheduled at this time.'
      });
    }

    // Check if new slot is available
    const existingAppointment = await Appointment.findOne({
      where: {
        doctorId: appointment.doctorId,
        appointmentDate,
        appointmentTime,
        status: {
          [Op.notIn]: ['cancelled', 'no-show']
        }
      }
    });

    if (existingAppointment) {
      return res.status(409).json({
        message: 'This time slot is already booked. Please select another slot.'
      });
    }

    // Store old date and time for Kafka event
    const oldDate = appointment.appointmentDate;
    const oldTime = appointment.appointmentTime;

    // Update appointment
    await appointment.update({
      appointmentDate,
      appointmentTime,
      status: 'rescheduled'
    });

    // Publish Kafka event
    try {
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
    const doctorId = req.user.id;
    const { notes, prescription, autoCreatePrescription } = req.body;

    const appointment = await Appointment.findByPk(id);

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    // Check authorization
    if (String(appointment.doctorId) !== String(doctorId)) {
      return res.status(403).json({ message: 'Unauthorized access' });
    }

    let prescriptionData = null;

    // Auto-create prescription draft for online consultations if requested
    if (autoCreatePrescription !== false && ['video', 'audio', 'chat'].includes(appointment.consultationType)) {
      try {
        const { Prescription, Doctor, User } = await import('../models/index.js');

        // Check if prescription already exists
        const existingPrescription = await Prescription.findOne({
          where: { appointmentId: parseInt(id) }
        });

        if (!existingPrescription) {
          const doctor = await Doctor.findByPk(doctorId);
          const patient = await User.findByPk(appointment.userId);

          if (doctor && patient) {
            let patientAge = null;
            if (patient.dateOfBirth) {
              const dob = new Date(patient.dateOfBirth);
              const today = new Date();
              patientAge = today.getFullYear() - dob.getFullYear();
            }

            const newPrescription = await Prescription.create({
              appointmentId: appointment.id,
              tenant_id: appointment.tenant_id || appointment.organization_id || null,
              corporate_tenant_id: appointment.corporate_tenant_id || null,
              organization_id: appointment.organization_id || null,
              organization_type: appointment.organization_type || null,
              patientId: appointment.userId,
              patientName: `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || appointment.patientName,
              patientAge,
              patientGender: patient.gender || 'Not specified',
              patientPhone: patient.phoneNumber || patient.phone || appointment.patientPhone,
              doctorId: doctor.id,
              doctorName: `${doctor.firstName || ''} ${doctor.lastName || ''}`.trim(),
              doctorQualifications: Array.isArray(doctor.qualifications)
                ? doctor.qualifications.join(', ')
                : (doctor.qualifications || doctor.qualification || 'MBBS'),
              doctorRegNo: doctor.registrationNumber || doctor.licenseNumber || 'N/A',
              specialty: doctor.specialization || 'General Medicine',
              clinicName: doctor.clinicHospitalName || doctor.clinicName || 'Mediczy Healthcare',
              clinicAddress: appointment.consultationType === 'in-person'
                ? (doctor.clinicAddress || 'Clinic')
                : 'Online Consultation / Telemedicine',
              clinicPhone: doctor.phone || doctor.phoneNumber,
              clinicEmail: doctor.email,
              clinicDetails: {
                name: doctor.clinicHospitalName || doctor.clinicName || 'Mediczy Healthcare',
                address: appointment.consultationType === 'in-person'
                  ? (doctor.clinicAddress || 'Clinic')
                  : 'Online Consultation / Telemedicine',
                phone: doctor.phone || doctor.phoneNumber,
                email: doctor.email,
                specialty: doctor.specialization,
                consultationType: appointment.consultationType
              },
              diagnosis: 'To be filled by doctor',
              chiefComplaints: appointment.symptoms || ['As discussed during consultation'],
              medications: [],
              labTests: [],
              instructions: [
                'Complete the full course of medications',
                'Take medicines as directed',
                'Contact doctor if symptoms worsen'
              ],
              vitals: {},
              validityDays: 30,
              notes: notes || `${appointment.consultationType} consultation completed`,
              status: 'draft'
            });

            prescriptionData = {
              prescriptionId: newPrescription.prescriptionId,
              status: 'draft',
              message: 'Prescription draft auto-created'
            };
          }
        } else {
          prescriptionData = {
            prescriptionId: existingPrescription.prescriptionId,
            status: existingPrescription.status,
            message: 'Prescription already exists'
          };
        }
      } catch (prescriptionError) {
        console.error('Auto-prescription creation failed:', prescriptionError);
        // Continue even if prescription creation fails
      }
    }

    // Update appointment
    await appointment.update({
      status: 'completed',
      notes: notes || appointment.notes,
      prescription: prescription || prescriptionData?.prescriptionId || appointment.prescription
    });

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
 * Submit appointment rating
 * POST /api/appointments/:id/rating
 */
export const rateAppointment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const userId = req.user.id;
    const { rating, feedback } = req.body;

    const appointment = await Appointment.findByPk(id);

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    // Check authorization
    if (String(appointment.userId) !== String(userId)) {
      return res.status(403).json({ message: 'Unauthorized access' });
    }

    // Check if appointment is completed
    if (appointment.status !== 'completed') {
      return res.status(400).json({
        message: 'Can only rate completed appointments'
      });
    }

    // Update appointment
    await appointment.update({
      rating,
      feedback
    });

    return res.status(200).json({
      message: 'Rating submitted successfully',
      appointment
    });
  } catch (error) {
    console.error('Rate appointment error:', error);
    return res.status(500).json({
      message: 'Failed to submit rating',
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

    const appointment = await Appointment.findByPk(id);

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    await appointment.update({
      paymentStatus,
      paymentMethod,
      transactionId
    });

    // If payment is successful, confirm the appointment
    if (paymentStatus === 'paid' && appointment.status === 'scheduled') {
      await appointment.update({ status: 'confirmed' });
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
