/**
 * Calendar Sync & Post-Booking Event Service
 * ────────────────────────────────────────────
 * Handles everything that must happen AFTER an appointment row is persisted:
 *
 *   1. Generate video/audio meeting room and stamp the appointment record
 *   2. Send confirmation e-mail to the patient
 *   3. Schedule reminder notification(s)
 *   4. Publish real-time event to Kafka topic
 *   5. Trigger n8n multi-channel workflow
 *   6. Send multi-channel notification to doctor
 *   7. Send booking confirmation notification to patient
 *
 * All steps wrap individual try/catch blocks so one failure never rolls
 * back the already-created appointment.  Errors are logged and skipped.
 */

import { createMeetingInfo } from '../utils/videoProvider.js';
import kafkaEvents from './kafka-events.service.js';
import n8nService from './n8n.service.js';
import notificationService from './notification.service.js';

// Optional imports — guard against missing modules at runtime
let sendAppointmentConfirmation = async () => {};
let scheduleAppointmentReminder = async () => {};

try {
  const emailMod = await import('../utils/emailNotifications.js');
  sendAppointmentConfirmation = emailMod.sendAppointmentConfirmation ?? sendAppointmentConfirmation;
} catch { /* email not configured */ }

try {
  const reminderMod = await import('../utils/reminderScheduler.js');
  scheduleAppointmentReminder = reminderMod.scheduleAppointmentReminder ?? scheduleAppointmentReminder;
} catch { /* reminder scheduler not configured */ }

// ─── Step 1: Meeting room creation ───────────────────────────────────────────
/**
 * If the consultation type is video or audio, generate a room and mutate
 * the appointment object with meetingId / meetingLink / meetingDetails.
 *
 * @param {object} appointment - Sequelize appointment instance (will be mutated + saved)
 * @param {string} consultationType - 'video' | 'audio' | 'chat' | 'in-person'
 * @returns {Promise<object|null>} meetingInfo, or null for non-video types
 */
export async function assignMeetingRoom(appointment, consultationType) {
  if (!['video', 'audio'].includes(consultationType)) return null;

  try {
    const meetingInfo = await createMeetingInfo({ appointmentId: appointment.id });

    await appointment.update({
      meetingId:      meetingInfo.meetingId,
      meetingLink:    meetingInfo.meetingLink,
      meetingDetails: meetingInfo.meetingDetails,
      metadata: {
        ...(appointment.metadata || {}),
        meeting: {
          roomId:      meetingInfo.meetingId,
          meetingLink: meetingInfo.meetingLink,
          roomCreated: false,
        },
      },
    });

    appointment.meetingId      = meetingInfo.meetingId;
    appointment.meetingLink    = meetingInfo.meetingLink;
    appointment.meetingDetails = meetingInfo.meetingDetails;

    console.log('📹 Meeting room assigned:', {
      appointmentId: appointment.id,
      meetingId:     meetingInfo.meetingId,
      platform:      meetingInfo.meetingDetails?.platform,
    });

    return meetingInfo;
  } catch (err) {
    console.error('❌ Meeting room creation failed — appointment proceeds without link:', err.message);
    return null;
  }
}

// ─── Step 2: Confirmation e-mail ──────────────────────────────────────────────
/**
 * @param {string} patientEmail
 * @param {object} details - { doctorName, date, time, type }
 */
export async function sendConfirmationEmail(patientEmail, details) {
  try {
    await sendAppointmentConfirmation(patientEmail, details);
  } catch (err) {
    console.error('❌ Confirmation e-mail failed:', err.message);
  }
}

// ─── Step 3: Reminder scheduling ─────────────────────────────────────────────
/**
 * @param {number} userId
 * @param {number} appointmentId
 * @param {string} appointmentDate - YYYY-MM-DD
 * @param {string} appointmentTime - HH:MM
 */
export async function scheduleReminder(userId, appointmentId, appointmentDate, appointmentTime) {
  try {
    const appointmentDateTime = new Date(`${appointmentDate} ${appointmentTime}`);
    await scheduleAppointmentReminder(userId, appointmentId, appointmentDateTime);
  } catch (err) {
    console.error('❌ Reminder scheduling failed:', err.message);
  }
}

// ─── Step 4: Kafka event ──────────────────────────────────────────────────────
/**
 * Publish appointment.created to Kafka for downstream consumers.
 *
 * @param {object} appointment
 * @param {object} user
 * @param {object} doctor
 */
export async function publishKafkaEvent(appointment, user, doctor) {
  try {
    await kafkaEvents.publishAppointmentCreated(appointment, user, doctor);
    console.log('✅ Kafka: appointment.created published');
  } catch (err) {
    console.error('❌ Kafka publish failed:', err.message);
  }
}

// ─── Step 5: n8n multi-channel workflow ──────────────────────────────────────
/**
 * @param {object} appointment - Sequelize appointment instance
 */
export async function triggerN8nWorkflow(appointment) {
  try {
    await n8nService.appointmentBooked({
      id:               appointment.id,
      userId:           appointment.userId,
      patientName:      appointment.patientName,
      patientEmail:     appointment.patientEmail,
      patientPhone:     appointment.patientPhone,
      doctorId:         appointment.doctorId,
      doctorName:       appointment.doctorName,
      appointmentDate:  appointment.appointmentDate,
      appointmentTime:  appointment.appointmentTime,
      consultationType: appointment.consultationType,
      consultationFee:  appointment.consultationFee,
      status:           appointment.status,
    });
    console.log('✅ n8n workflow triggered');
  } catch (err) {
    console.error('❌ n8n workflow trigger failed:', err.message);
  }
}

// ─── Step 6 + 7: Notifications ────────────────────────────────────────────────
/**
 * Build a normalised appointmentData object shared by both notifications.
 *
 * @param {object} appointment
 * @param {object} user
 * @param {object} doctor
 */
function buildAppointmentData(appointment, user, doctor) {
  return {
    id:               appointment.id,
    patientName:      appointment.patientName,
    patientEmail:     appointment.patientEmail || user.email,
    patientPhone:     appointment.patientPhone || user.phoneNumber || user.phone,
    doctorName:       appointment.doctorName,
    doctorEmail:      doctor.email,
    specialization:   appointment.specialization,
    appointmentDate:  appointment.appointmentDate,
    appointmentTime:  appointment.appointmentTime,
    duration:         appointment.duration || 30,
    consultationType: appointment.consultationType,
    consultationFee:  appointment.consultationFee,
    symptoms:         appointment.symptoms,
    notes:            appointment.notes,
    location:         appointment.location,
    meetingLink:      appointment.meetingLink,
  };
}

/**
 * Send multi-channel notification to the doctor.
 *
 * @param {object} appointment
 * @param {object} user
 * @param {object} doctor
 */
export async function notifyDoctor(appointment, user, doctor) {
  try {
    const appointmentData = buildAppointmentData(appointment, user, doctor);
    await notificationService.notifyAppointmentRequest(appointment, appointmentData);
    console.log('✅ Doctor notification sent');
  } catch (err) {
    console.error('❌ Doctor notification failed:', err.message);
  }
}

/**
 * Send booking confirmation notification to the patient.
 *
 * @param {object} appointment
 * @param {object} user
 * @param {object} doctor
 * @param {string} consultationType - display value
 */
export async function notifyPatient(appointment, user, doctor, consultationType) {
  try {
    const appointmentData = buildAppointmentData(appointment, user, doctor);
    await notificationService.send({
      userId:   appointment.userId,
      userType: 'patient',
      type:     'appointment_booked',
      variables: {
        patientName:    appointment.patientName,
        doctorName:     appointment.doctorName,
        date:           appointment.appointmentDate,
        time:           appointment.appointmentTime,
        appointmentId:  appointment.id,
        consultationType,
        paymentStatus: 'Pending',
      },
      data: {
        appointmentId: appointment.id,
        status:        'scheduled',
        doctorId:      appointment.doctorId,
      },
      channels:  ['in-app', 'email'],
      actionUrl: '/my-bookings',
    });
    console.log('✅ Patient confirmation notification sent');
  } catch (err) {
    console.error('❌ Patient notification failed:', err.message);
  }
}

// ─── Orchestration convenience function ──────────────────────────────────────
/**
 * Run all post-booking side-effects in parallel where safe, sequentially
 * where order matters.  None of these steps can roll back the booking.
 *
 * @param {{
 *   appointment: object,
 *   user: object,
 *   doctor: object,
 *   consultationType: string,
 * }} ctx
 */
export async function runPostBookingTasks(ctx) {
  const { appointment, user, doctor, consultationType } = ctx;

  // Step 1 must run first so meetingLink is available for notifications
  await assignMeetingRoom(appointment, consultationType);

  // Steps 2-7 are independent — run in parallel
  await Promise.allSettled([
    sendConfirmationEmail(appointment.patientEmail || user.email, {
      doctorName: appointment.doctorName,
      date:       appointment.appointmentDate,
      time:       appointment.appointmentTime,
      type:       consultationType,
    }),
    scheduleReminder(
      appointment.userId,
      appointment.id,
      appointment.appointmentDate,
      appointment.appointmentTime,
    ),
    publishKafkaEvent(appointment, user, doctor),
    triggerN8nWorkflow(appointment),
    notifyDoctor(appointment, user, doctor),
    notifyPatient(appointment, user, doctor, consultationType),
  ]);

  console.log(`✅ Post-booking tasks complete for appointment #${appointment.id}`);
}
