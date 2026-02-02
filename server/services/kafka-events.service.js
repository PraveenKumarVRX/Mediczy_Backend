/**
 * Kafka Events Service
 * Central service for publishing all application events to Kafka
 * Enables real-time notifications, analytics, and monitoring
 */

import { publishEvent, KAFKA_TOPICS } from '../config/kafka.js';
import logger from '../config/logger.js';

class KafkaEventsService {
  /**
   * ===========================================
   * APPOINTMENT EVENTS
   * ===========================================
   */

  async publishAppointmentCreated(appointment, patient, doctor) {
    try {
      await publishEvent(KAFKA_TOPICS.APPOINTMENT_EVENTS, {
        type: 'appointment.created',
        eventType: 'appointment.created',
        action: 'appointment_created',
        appointmentId: appointment.id,
        userId: patient.id,
        patientId: patient.id,
        patientName: `${patient.firstName} ${patient.lastName}`,
        patientEmail: patient.email,
        patientPhone: patient.phone,
        doctorId: doctor.id,
        doctorName: `Dr. ${doctor.firstName} ${doctor.lastName}`,
        doctorEmail: doctor.email,
        doctorSpecialization: doctor.specialization,
        appointmentDate: appointment.appointmentDate,
        appointmentTime: appointment.appointmentTime,
        consultationType: appointment.consultationType,
        status: appointment.status,
        consultationFee: appointment.consultationFee,
        symptoms: appointment.symptoms,
        reason: appointment.reason,
        organizationId: appointment.organization_id,
        timestamp: new Date().toISOString(),
        metadata: {
          source: 'appointment-service',
          version: '1.0'
        }
      });
      logger.info(`Kafka event published: appointment.created for appointment ${appointment.id}`);
    } catch (error) {
      logger.error('Failed to publish appointment.created event:', error);
    }
  }

  async publishAppointmentConfirmed(appointment, patient, doctor) {
    try {
      await publishEvent(KAFKA_TOPICS.APPOINTMENT_EVENTS, {
        type: 'appointment.confirmed',
        eventType: 'appointment.confirmed',
        action: 'appointment_confirmed',
        appointmentId: appointment.id,
        userId: patient.id,
        patientId: patient.id,
        patientName: `${patient.firstName} ${patient.lastName}`,
        doctorId: doctor.id,
        doctorName: `Dr. ${doctor.firstName} ${doctor.lastName}`,
        appointmentDate: appointment.appointmentDate,
        appointmentTime: appointment.appointmentTime,
        consultationType: appointment.consultationType,
        meetingLink: appointment.meetingLink,
        organizationId: appointment.organization_id,
        timestamp: new Date().toISOString()
      });
      logger.info(`Kafka event published: appointment.confirmed for appointment ${appointment.id}`);
    } catch (error) {
      logger.error('Failed to publish appointment.confirmed event:', error);
    }
  }

  async publishAppointmentCancelled(appointment, patient, doctor, reason) {
    try {
      await publishEvent(KAFKA_TOPICS.APPOINTMENT_EVENTS, {
        type: 'appointment.cancelled',
        eventType: 'appointment.cancelled',
        action: 'appointment_cancelled',
        appointmentId: appointment.id,
        userId: patient.id,
        patientId: patient.id,
        patientName: `${patient.firstName} ${patient.lastName}`,
        doctorId: doctor.id,
        doctorName: `Dr. ${doctor.firstName} ${doctor.lastName}`,
        appointmentDate: appointment.appointmentDate,
        appointmentTime: appointment.appointmentTime,
        cancellationReason: reason || 'Not specified',
        cancelledBy: appointment.cancelledBy || 'patient',
        consultationFee: appointment.consultationFee,
        refundStatus: appointment.refundStatus || 'pending',
        organizationId: appointment.organization_id,
        timestamp: new Date().toISOString()
      });
      logger.info(`Kafka event published: appointment.cancelled for appointment ${appointment.id}`);
    } catch (error) {
      logger.error('Failed to publish appointment.cancelled event:', error);
    }
  }

  async publishAppointmentRescheduled(appointment, patient, doctor, oldDate, oldTime) {
    try {
      await publishEvent(KAFKA_TOPICS.APPOINTMENT_EVENTS, {
        type: 'appointment.rescheduled',
        eventType: 'appointment.rescheduled',
        action: 'appointment_rescheduled',
        appointmentId: appointment.id,
        userId: patient.id,
        patientId: patient.id,
        patientName: `${patient.firstName} ${patient.lastName}`,
        doctorId: doctor.id,
        doctorName: `Dr. ${doctor.firstName} ${doctor.lastName}`,
        oldDate,
        oldTime,
        newDate: appointment.appointmentDate,
        newTime: appointment.appointmentTime,
        consultationType: appointment.consultationType,
        organizationId: appointment.organization_id,
        timestamp: new Date().toISOString()
      });
      logger.info(`Kafka event published: appointment.rescheduled for appointment ${appointment.id}`);
    } catch (error) {
      logger.error('Failed to publish appointment.rescheduled event:', error);
    }
  }

  async publishAppointmentCompleted(appointment, patient, doctor) {
    try {
      await publishEvent(KAFKA_TOPICS.APPOINTMENT_EVENTS, {
        type: 'appointment.completed',
        eventType: 'appointment.completed',
        action: 'appointment_completed',
        appointmentId: appointment.id,
        userId: patient.id,
        patientId: patient.id,
        patientName: `${patient.firstName} ${patient.lastName}`,
        doctorId: doctor.id,
        doctorName: `Dr. ${doctor.firstName} ${doctor.lastName}`,
        appointmentDate: appointment.appointmentDate,
        appointmentTime: appointment.appointmentTime,
        consultationType: appointment.consultationType,
        duration: appointment.duration,
        hasPrescription: !!appointment.prescriptionId,
        organizationId: appointment.organization_id,
        timestamp: new Date().toISOString()
      });
      logger.info(`Kafka event published: appointment.completed for appointment ${appointment.id}`);
    } catch (error) {
      logger.error('Failed to publish appointment.completed event:', error);
    }
  }

  async publishAppointmentReminder(appointment, patient, doctor, reminderType = '24hr') {
    try {
      await publishEvent(KAFKA_TOPICS.APPOINTMENT_EVENTS, {
        type: 'appointment.reminder',
        eventType: 'appointment.reminder',
        action: 'appointment_reminder',
        appointmentId: appointment.id,
        userId: patient.id,
        patientId: patient.id,
        patientName: `${patient.firstName} ${patient.lastName}`,
        doctorId: doctor.id,
        doctorName: `Dr. ${doctor.firstName} ${doctor.lastName}`,
        appointmentDate: appointment.appointmentDate,
        appointmentTime: appointment.appointmentTime,
        reminderType, // '24hr', '1hr', '15min'
        consultationType: appointment.consultationType,
        meetingLink: appointment.meetingLink,
        organizationId: appointment.organization_id,
        timestamp: new Date().toISOString()
      });
      logger.info(`Kafka event published: appointment.reminder (${reminderType}) for appointment ${appointment.id}`);
    } catch (error) {
      logger.error('Failed to publish appointment.reminder event:', error);
    }
  }

  /**
   * ===========================================
   * PAYMENT EVENTS
   * ===========================================
   */

  async publishPaymentSuccess(payment, user, appointment = null) {
    try {
      await publishEvent(KAFKA_TOPICS.PAYMENT_EVENTS || 'payment-events', {
        type: 'payment.success',
        eventType: 'payment.success',
        action: 'payment_success',
        paymentId: payment.id || payment.transactionId,
        razorpayOrderId: payment.razorpayOrderId,
        razorpayPaymentId: payment.razorpayPaymentId,
        userId: user.id,
        userName: `${user.firstName} ${user.lastName}`,
        userEmail: user.email,
        amount: payment.amount,
        currency: payment.currency || 'INR',
        fees: payment.fees,
        netAmount: payment.netAmount,
        paymentMethod: payment.paymentMethod,
        status: 'completed',
        appointmentId: appointment?.id,
        appointmentDate: appointment?.appointmentDate,
        appointmentTime: appointment?.appointmentTime,
        description: payment.description,
        organizationId: payment.organizationId || appointment?.organization_id,
        timestamp: new Date().toISOString(),
        metadata: {
          clientType: payment.clientType,
          receipt: payment.receipt
        }
      });
      logger.info(`Kafka event published: payment.success for payment ${payment.id}`);
    } catch (error) {
      logger.error('Failed to publish payment.success event:', error);
    }
  }

  async publishPaymentFailed(payment, user, reason) {
    try {
      await publishEvent(KAFKA_TOPICS.PAYMENT_EVENTS || 'payment-events', {
        type: 'payment.failed',
        eventType: 'payment.failed',
        action: 'payment_failed',
        paymentId: payment.id || payment.transactionId,
        razorpayOrderId: payment.razorpayOrderId,
        userId: user.id,
        userName: `${user.firstName} ${user.lastName}`,
        amount: payment.amount,
        currency: payment.currency || 'INR',
        status: 'failed',
        failureReason: reason,
        timestamp: new Date().toISOString()
      });
      logger.info(`Kafka event published: payment.failed for payment ${payment.id}`);
    } catch (error) {
      logger.error('Failed to publish payment.failed event:', error);
    }
  }

  async publishPaymentRefund(payment, user, refundAmount, reason) {
    try {
      await publishEvent(KAFKA_TOPICS.PAYMENT_EVENTS || 'payment-events', {
        type: 'payment.refund',
        eventType: 'payment.refund',
        action: 'payment_refund',
        paymentId: payment.id,
        userId: user.id,
        userName: `${user.firstName} ${user.lastName}`,
        originalAmount: payment.amount,
        refundAmount,
        refundReason: reason,
        status: 'refund_initiated',
        timestamp: new Date().toISOString()
      });
      logger.info(`Kafka event published: payment.refund for payment ${payment.id}`);
    } catch (error) {
      logger.error('Failed to publish payment.refund event:', error);
    }
  }

  /**
   * ===========================================
   * VIDEO CONSULTATION EVENTS
   * ===========================================
   */

  async publishVideoStreamStarted(appointment, patient, doctor, roomDetails) {
    try {
      await publishEvent(KAFKA_TOPICS.VIDEO_STREAM_STARTED, {
        type: 'consultation.started',
        eventType: 'video_stream_started',
        action: 'video_stream_started',
        appointmentId: appointment.id,
        roomId: roomDetails.roomId || roomDetails.room,
        roomName: roomDetails.roomName,
        userId: patient.id,
        patientId: patient.id,
        patientName: `${patient.firstName} ${patient.lastName}`,
        doctorId: doctor.id,
        doctorName: `Dr. ${doctor.firstName} ${doctor.lastName}`,
        consultationType: 'video',
        startTime: new Date().toISOString(),
        meetingLink: appointment.meetingLink,
        organizationId: appointment.organization_id,
        metadata: {
          platform: roomDetails.platform || 'livekit',
          quality: 'auto'
        }
      });
      logger.info(`Kafka event published: video_stream_started for appointment ${appointment.id}`);
    } catch (error) {
      logger.error('Failed to publish video_stream_started event:', error);
    }
  }

  async publishVideoStreamEnded(appointment, patient, doctor, duration, roomDetails) {
    try {
      await publishEvent(KAFKA_TOPICS.VIDEO_STREAM_ENDED, {
        type: 'consultation.ended',
        eventType: 'video_stream_ended',
        action: 'video_stream_ended',
        appointmentId: appointment.id,
        roomId: roomDetails.roomId || roomDetails.room,
        userId: patient.id,
        patientId: patient.id,
        patientName: `${patient.firstName} ${patient.lastName}`,
        doctorId: doctor.id,
        doctorName: `Dr. ${doctor.firstName} ${doctor.lastName}`,
        duration: duration || 0,
        endTime: new Date().toISOString(),
        organizationId: appointment.organization_id,
        metadata: {
          platform: roomDetails.platform || 'livekit',
          endedBy: roomDetails.endedBy || 'system'
        }
      });
      logger.info(`Kafka event published: video_stream_ended for appointment ${appointment.id}`);
    } catch (error) {
      logger.error('Failed to publish video_stream_ended event:', error);
    }
  }

  async publishVideoParticipantJoined(appointmentId, participant, role) {
    try {
      await publishEvent(KAFKA_TOPICS.VIDEO_PARTICIPANT_JOINED, {
        type: 'participant.joined',
        eventType: 'video_participant_joined',
        action: 'participant_joined',
        appointmentId,
        participantId: participant.id,
        participantName: participant.name,
        role, // 'doctor' or 'patient'
        joinTime: new Date().toISOString(),
        metadata: {
          deviceType: participant.deviceType || 'unknown',
          browser: participant.browser || 'unknown'
        }
      });
      logger.info(`Kafka event published: video_participant_joined for appointment ${appointmentId}`);
    } catch (error) {
      logger.error('Failed to publish video_participant_joined event:', error);
    }
  }

  async publishVideoQuality(appointmentId, qualityMetrics) {
    try {
      await publishEvent(KAFKA_TOPICS.VIDEO_STREAM_QUALITY, {
        type: 'quality.update',
        eventType: 'video_stream_quality',
        action: 'quality_update',
        appointmentId,
        timestamp: new Date().toISOString(),
        metrics: {
          bitrate: qualityMetrics.bitrate,
          packetLoss: qualityMetrics.packetLoss,
          latency: qualityMetrics.latency,
          resolution: qualityMetrics.resolution,
          fps: qualityMetrics.fps,
          jitter: qualityMetrics.jitter
        }
      });
    } catch (error) {
      logger.error('Failed to publish video_stream_quality event:', error);
    }
  }

  /**
   * ===========================================
   * USER EVENTS
   * ===========================================
   */

  async publishUserRegistered(user, userType = 'patient') {
    try {
      await publishEvent(KAFKA_TOPICS.USER_EVENTS, {
        type: 'user.registered',
        eventType: 'user.registered',
        action: 'user_registered',
        userId: user.id,
        userType,
        email: user.email,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        registrationMethod: user.registrationMethod || 'email',
        timestamp: new Date().toISOString(),
        metadata: {
          platform: user.platform || 'web',
          referralCode: user.referralCode
        }
      });
      logger.info(`Kafka event published: user.registered for user ${user.id}`);
    } catch (error) {
      logger.error('Failed to publish user.registered event:', error);
    }
  }

  async publishUserVerified(user, userType = 'patient') {
    try {
      await publishEvent(KAFKA_TOPICS.USER_EVENTS, {
        type: 'user.verified',
        eventType: 'user.verified',
        action: 'user_verified',
        userId: user.id,
        userType,
        email: user.email,
        phone: user.phone,
        verificationMethod: user.verificationMethod || 'otp',
        timestamp: new Date().toISOString()
      });
      logger.info(`Kafka event published: user.verified for user ${user.id}`);
    } catch (error) {
      logger.error('Failed to publish user.verified event:', error);
    }
  }

  async publishUserProfileUpdated(user, updatedFields) {
    try {
      await publishEvent(KAFKA_TOPICS.USER_EVENTS, {
        type: 'user.profile_updated',
        eventType: 'user.profile_updated',
        action: 'user_profile_updated',
        userId: user.id,
        userType: user.userType || 'patient',
        updatedFields,
        timestamp: new Date().toISOString()
      });
      logger.info(`Kafka event published: user.profile_updated for user ${user.id}`);
    } catch (error) {
      logger.error('Failed to publish user.profile_updated event:', error);
    }
  }

  /**
   * ===========================================
   * DOCTOR EVENTS
   * ===========================================
   */

  async publishDoctorOnline(doctor) {
    try {
      await publishEvent(KAFKA_TOPICS.DOCTOR_EVENTS, {
        type: 'doctor.online',
        eventType: 'doctor.online',
        action: 'doctor_online',
        doctorId: doctor.id,
        doctorName: `Dr. ${doctor.firstName} ${doctor.lastName}`,
        specialization: doctor.specialization,
        organizationId: doctor.organization_id,
        timestamp: new Date().toISOString()
      });
      logger.info(`Kafka event published: doctor.online for doctor ${doctor.id}`);
    } catch (error) {
      logger.error('Failed to publish doctor.online event:', error);
    }
  }

  async publishDoctorOffline(doctor) {
    try {
      await publishEvent(KAFKA_TOPICS.DOCTOR_EVENTS, {
        type: 'doctor.offline',
        eventType: 'doctor.offline',
        action: 'doctor_offline',
        doctorId: doctor.id,
        doctorName: `Dr. ${doctor.firstName} ${doctor.lastName}`,
        specialization: doctor.specialization,
        organizationId: doctor.organization_id,
        timestamp: new Date().toISOString()
      });
      logger.info(`Kafka event published: doctor.offline for doctor ${doctor.id}`);
    } catch (error) {
      logger.error('Failed to publish doctor.offline event:', error);
    }
  }

  async publishDoctorAvailabilityUpdated(doctor, availability) {
    try {
      await publishEvent(KAFKA_TOPICS.DOCTOR_EVENTS, {
        type: 'doctor.availability_updated',
        eventType: 'doctor.availability_updated',
        action: 'doctor_availability_updated',
        doctorId: doctor.id,
        doctorName: `Dr. ${doctor.firstName} ${doctor.lastName}`,
        availability: {
          monday: availability.monday,
          tuesday: availability.tuesday,
          wednesday: availability.wednesday,
          thursday: availability.thursday,
          friday: availability.friday,
          saturday: availability.saturday,
          sunday: availability.sunday
        },
        organizationId: doctor.organization_id,
        timestamp: new Date().toISOString()
      });
      logger.info(`Kafka event published: doctor.availability_updated for doctor ${doctor.id}`);
    } catch (error) {
      logger.error('Failed to publish doctor.availability_updated event:', error);
    }
  }

  /**
   * ===========================================
   * ANALYTICS EVENTS
   * ===========================================
   */

  async publishAnalyticsEvent(eventType, data) {
    try {
      await publishEvent(KAFKA_TOPICS.ANALYTICS_EVENTS, {
        eventType,
        action: eventType,
        ...data,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'production'
      });
      logger.info(`Kafka event published: ${eventType} to analytics`);
    } catch (error) {
      logger.error(`Failed to publish ${eventType} analytics event:`, error);
    }
  }

  async publishSystemMetrics(metrics) {
    try {
      await publishEvent(KAFKA_TOPICS.SYSTEM_EVENTS, {
        type: 'system.metrics',
        eventType: 'system.metrics',
        action: 'system_metrics',
        metrics: {
          cpu: metrics.cpu,
          memory: metrics.memory,
          activeUsers: metrics.activeUsers,
          activeConnections: metrics.activeConnections,
          requestRate: metrics.requestRate
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to publish system.metrics event:', error);
    }
  }
}

export default new KafkaEventsService();
