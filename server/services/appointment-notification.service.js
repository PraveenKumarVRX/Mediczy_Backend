/**
 * Appointment Notification Service
 * Sends real-time notifications to doctors and patients for upcoming video consultations
 */

import cron from 'node-cron';
import Appointment from '../models/appointment.model.intelligent.js';
import { User } from '../models/user.model.intelligent.js';
import { Doctor } from '../models/index.js';
import { Op } from 'sequelize';
import { tick, tickError } from '../utils/cronRegistry.js';

class AppointmentNotificationService {
  constructor(io) {
    this.io = io;
    this.notificationSchedules = new Map();
  }

  /**
   * Initialize the notification service
   */
  initialize() {
    console.log('🔔 Initializing Appointment Notification Service...');
    
    // Check every minute for upcoming appointments
    cron.schedule('* * * * *', () => {
      this.checkUpcomingAppointments();
    });

    console.log('✅ Appointment Notification Service initialized');
  }

  /**
   * Check for upcoming appointments and send notifications
   */
  async checkUpcomingAppointments() {
    try {
      const now = new Date();
      const fifteenMinutesLater = new Date(now.getTime() + 15 * 60 * 1000);
      const fiveMinutesLater = new Date(now.getTime() + 5 * 60 * 1000);
      const oneMinuteLater = new Date(now.getTime() + 1 * 60 * 1000);

      // Find online consultations happening in next 15 minutes
      const upcomingAppointments = await Appointment.findAll({
        where: {
          consultationType: {
            [Op.in]: ['online', 'video', 'telemedicine']
          },
          status: {
            [Op.in]: ['scheduled', 'confirmed']
          },
          appointmentDate: {
            [Op.gte]: now.toISOString().split('T')[0],
            [Op.lte]: fifteenMinutesLater.toISOString().split('T')[0]
          }
        },
        include: [
          {
            model: User,
            as: 'patient',
            attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber']
          },
          {
            model: Doctor,
            as: 'doctor',
            attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber', 'unique_id']
          }
        ]
      });

      for (const appointment of upcomingAppointments) {
        const appointmentDateTime = new Date(`${appointment.appointmentDate} ${appointment.appointmentTime}`);
        const timeDiff = appointmentDateTime - now;

        // Skip if already notified for this time window
        const notificationKey = `${appointment.id}-${Math.floor(timeDiff / 60000)}`;
        if (this.notificationSchedules.has(notificationKey)) {
          continue;
        }

        // 15-minute warning
        if (timeDiff > 13 * 60 * 1000 && timeDiff <= 15 * 60 * 1000) {
          await this.send15MinuteWarning(appointment);
          this.notificationSchedules.set(notificationKey, true);
        }
        // 5-minute warning
        else if (timeDiff > 4 * 60 * 1000 && timeDiff <= 5 * 60 * 1000) {
          await this.send5MinuteWarning(appointment);
          this.notificationSchedules.set(notificationKey, true);
        }
        // 1-minute warning (urgent)
        else if (timeDiff > 0 && timeDiff <= 1 * 60 * 1000) {
          await this.sendUrgentCallNotification(appointment);
          this.notificationSchedules.set(notificationKey, true);
        }
        // Appointment time reached
        else if (timeDiff <= 0 && timeDiff > -30 * 1000) {
          await this.sendCallNowNotification(appointment);
          this.notificationSchedules.set(notificationKey, true);
        }
      }

      // Clean up old notification records (older than 30 minutes)
      this.cleanupOldNotifications();
      tick('appt_notification', { checked: upcomingAppointments.length });
    } catch (error) {
      console.error('❌ Error checking upcoming appointments:', error);
      tickError('appt_notification', error.message);
    }
  }

  /**
   * Send 15-minute warning notification
   */
  async send15MinuteWarning(appointment) {
    const meetingInfo = appointment.metadata?.meeting || {};
    const roomId = meetingInfo.roomId || appointment.meetingId || `apt-${appointment.id}`;
    const meetingLink = meetingInfo.meetingLink || appointment.meetingLink;

    const patientData = {
      type: 'appointment_reminder',
      urgency: 'info',
      title: 'Upcoming Video Consultation',
      message: `Your appointment with Dr. ${appointment.doctor?.firstName} ${appointment.doctor?.lastName} starts in 15 minutes`,
      appointmentId: appointment.id,
      appointmentTime: appointment.appointmentTime,
      doctorName: `Dr. ${appointment.doctor?.firstName} ${appointment.doctor?.lastName}`,
      roomId,
      meetingLink,
      timeRemaining: '15 minutes',
      action: 'prepare'
    };

    const doctorData = {
      type: 'appointment_reminder',
      urgency: 'info',
      title: 'Upcoming Video Consultation',
      message: `Your appointment with ${appointment.patientName} starts in 15 minutes`,
      appointmentId: appointment.id,
      appointmentTime: appointment.appointmentTime,
      patientName: appointment.patientName,
      roomId,
      meetingLink,
      timeRemaining: '15 minutes',
      action: 'prepare'
    };

    this.sendToUser(appointment.userId, patientData);
    this.sendToDoctor(appointment.doctorId, doctorData);

    console.log(`📢 15-min warning sent for appointment ${appointment.id}`);
  }

  /**
   * Send 5-minute warning notification
   */
  async send5MinuteWarning(appointment) {
    const meetingInfo = appointment.metadata?.meeting || {};
    const roomId = meetingInfo.roomId || appointment.meetingId || `apt-${appointment.id}`;
    const meetingLink = meetingInfo.meetingLink || appointment.meetingLink;

    const patientData = {
      type: 'appointment_reminder',
      urgency: 'warning',
      title: 'Video Consultation Starting Soon',
      message: `Your appointment with Dr. ${appointment.doctor?.firstName} ${appointment.doctor?.lastName} starts in 5 minutes. Please get ready!`,
      appointmentId: appointment.id,
      appointmentTime: appointment.appointmentTime,
      doctorName: `Dr. ${appointment.doctor?.firstName} ${appointment.doctor?.lastName}`,
      roomId,
      meetingLink,
      timeRemaining: '5 minutes',
      action: 'get_ready',
      sound: 'notification'
    };

    const doctorData = {
      type: 'appointment_reminder',
      urgency: 'warning',
      title: 'Video Consultation Starting Soon',
      message: `Your appointment with ${appointment.patientName} starts in 5 minutes. Please get ready!`,
      appointmentId: appointment.id,
      appointmentTime: appointment.appointmentTime,
      patientName: appointment.patientName,
      roomId,
      meetingLink,
      timeRemaining: '5 minutes',
      action: 'get_ready',
      sound: 'notification'
    };

    this.sendToUser(appointment.userId, patientData);
    this.sendToDoctor(appointment.doctorId, doctorData);

    console.log(`⚠️  5-min warning sent for appointment ${appointment.id}`);
  }

  /**
   * Send urgent 1-minute notification
   */
  async sendUrgentCallNotification(appointment) {
    const meetingInfo = appointment.metadata?.meeting || {};
    const roomId = meetingInfo.roomId || appointment.meetingId || `apt-${appointment.id}`;
    const meetingLink = meetingInfo.meetingLink || appointment.meetingLink;

    const patientData = {
      type: 'incoming_call',
      urgency: 'urgent',
      title: '🔔 Video Consultation Starting Now!',
      message: `Dr. ${appointment.doctor?.firstName} ${appointment.doctor?.lastName} is ready to see you`,
      appointmentId: appointment.id,
      appointmentTime: appointment.appointmentTime,
      doctorName: `Dr. ${appointment.doctor?.firstName} ${appointment.doctor?.lastName}`,
      doctorSpecialization: appointment.specialization,
      roomId,
      meetingLink,
      timeRemaining: '1 minute',
      action: 'join_now',
      sound: 'calling',
      vibrate: true,
      persistent: true
    };

    const doctorData = {
      type: 'incoming_call',
      urgency: 'urgent',
      title: '🔔 Video Consultation Starting Now!',
      message: `${appointment.patientName} is waiting to join`,
      appointmentId: appointment.id,
      appointmentTime: appointment.appointmentTime,
      patientName: appointment.patientName,
      roomId,
      meetingLink,
      timeRemaining: '1 minute',
      action: 'join_now',
      sound: 'calling',
      vibrate: true,
      persistent: true
    };

    this.sendToUser(appointment.userId, patientData);
    this.sendToDoctor(appointment.doctorId, doctorData);

    console.log(`🚨 URGENT 1-min notification sent for appointment ${appointment.id}`);
  }

  /**
   * Send call now notification (appointment time reached)
   */
  async sendCallNowNotification(appointment) {
    const meetingInfo = appointment.metadata?.meeting || {};
    const roomId = meetingInfo.roomId || appointment.meetingId || `apt-${appointment.id}`;
    const meetingLink = meetingInfo.meetingLink || appointment.meetingLink;

    const patientData = {
      type: 'incoming_call',
      urgency: 'critical',
      title: '📞 Video Call - Join Now!',
      message: `Dr. ${appointment.doctor?.firstName} ${appointment.doctor?.lastName} is calling you`,
      appointmentId: appointment.id,
      appointmentTime: appointment.appointmentTime,
      doctorName: `Dr. ${appointment.doctor?.firstName} ${appointment.doctor?.lastName}`,
      doctorSpecialization: appointment.specialization,
      roomId,
      meetingLink,
      timeRemaining: 'now',
      action: 'answer',
      sound: 'ringing',
      vibrate: true,
      persistent: true,
      fullScreen: true
    };

    const doctorData = {
      type: 'incoming_call',
      urgency: 'critical',
      title: '📞 Video Call - Join Now!',
      message: `${appointment.patientName} is ready to join`,
      appointmentId: appointment.id,
      appointmentTime: appointment.appointmentTime,
      patientName: appointment.patientName,
      roomId,
      meetingLink,
      timeRemaining: 'now',
      action: 'answer',
      sound: 'ringing',
      vibrate: true,
      persistent: true,
      fullScreen: true
    };

    this.sendToUser(appointment.userId, patientData);
    this.sendToDoctor(appointment.doctorId, doctorData);

    console.log(`📞 CALL NOW notification sent for appointment ${appointment.id}`);
  }

  /**
   * Send notification to user via Socket.io
   */
  sendToUser(userId, data) {
    if (this.io) {
      this.io.to(`user-${userId}`).emit('appointment_notification', data);
      console.log(`📤 Notification sent to user ${userId}`);
    }
  }

  /**
   * Send notification to doctor via Socket.io
   */
  sendToDoctor(doctorId, data) {
    if (this.io) {
      this.io.to(`doctor-${doctorId}`).emit('appointment_notification', data);
      console.log(`📤 Notification sent to doctor ${doctorId}`);
    }
  }

  /**
   * Clean up old notification records
   */
  cleanupOldNotifications() {
    const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
    for (const [key, timestamp] of this.notificationSchedules.entries()) {
      if (timestamp === true || timestamp < thirtyMinutesAgo) {
        this.notificationSchedules.delete(key);
      }
    }
  }

  /**
   * Manually trigger notification for testing
   */
  async sendTestNotification(appointmentId, userId, doctorId) {
    const testData = {
      type: 'incoming_call',
      urgency: 'critical',
      title: '📞 Test Video Call',
      message: 'This is a test notification',
      appointmentId,
      roomId: 'test-room-123',
      action: 'answer',
      sound: 'ringing',
      vibrate: true
    };

    this.sendToUser(userId, testData);
    this.sendToDoctor(doctorId, testData);
  }
}

export default AppointmentNotificationService;
