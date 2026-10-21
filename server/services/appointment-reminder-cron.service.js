import { sendPreferenceReminders } from './appointment-preference-reminders.service.js';
import cron from 'node-cron';
import Appointment from '../models/appointment.model.intelligent.js';
import notificationService from './notification.service.js';
import { Op } from 'sequelize';
import { tick, tickError, beginJob } from '../utils/cronRegistry.js';
import n8nService from './n8n.service.js';

/** Sends appointment reminders at each employee's saved lead time.
 * The personal inbox record and deduplication marker commit atomically;
 * selected push and email transports run after that commit.
 */

class AppointmentReminderService {
  constructor() {
    this.isRunning = false;
  }

  /**
   * Start all appointment reminder cron jobs
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️  Appointment reminder service already running');
      return;
    }

    this.isRunning = true;

    // Check every minute so a 15- or 30-minute preference is not skipped.
    cron.schedule('* * * * *', async () => {
      if (!(await beginJob('appt_reminder'))) return;
      await this.checkAndSendReminders();
    });

    console.log('✅ Appointment reminder automation started (checks every minute)');
  }

  /**
   * Check appointments and send reminders based on time windows
   */
  async checkAndSendReminders() {
    try {
      const result = await sendPreferenceReminders({ delivery: async ({ appointment, preferences, decision }) => {
        const channels = Array.isArray(preferences.reminderChannels) ? preferences.reminderChannels : ['push','email'];
        if (preferences.push !== false && channels.includes('push'))
          await notificationService.sendPush(appointment.userId,'patient','Appointment Reminder',decision.message,{appointmentId:String(appointment.id)},'/appointments');
        if (preferences.email !== false && channels.includes('email'))
          await notificationService.sendEmail(appointment.userId,'patient','Appointment Reminder',decision.message,'appointment_reminder',{});
      }});
      tick('appt_reminder', result);
    } catch (error) {
      tickError('appt_reminder', error.message);
      console.error('[appointment-reminder]', error.message);
    }
  }

  /**
   * Parse appointment date and time into a Date object
   */
  parseAppointmentDateTime(dateStr, timeStr) {
    try {
      // Handle date formats
      let date;
      if (dateStr instanceof Date) {
        date = new Date(dateStr);
      } else if (typeof dateStr === 'string') {
        // Support YYYY-MM-DD and DD-MM-YYYY formats
        if (dateStr.includes('-')) {
          const parts = dateStr.split('-');
          if (parts[0].length === 4) {
            // YYYY-MM-DD
            date = new Date(dateStr);
          } else {
            // DD-MM-YYYY
            date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
          }
        } else {
          date = new Date(dateStr);
        }
      }

      if (!date || isNaN(date.getTime())) {
        return null;
      }

      // Handle time formats (HH:MM or HH:MM:SS)
      if (!timeStr) return null;
      
      const timeParts = String(timeStr).trim().split(':');
      if (timeParts.length < 2) return null;

      const hours = parseInt(timeParts[0]);
      const minutes = parseInt(timeParts[1]);

      if (isNaN(hours) || isNaN(minutes)) return null;

      date.setHours(hours, minutes, 0, 0);
      return date;

    } catch (error) {
      console.error('Error parsing appointment datetime:', error);
      return null;
    }
  }

  /**
   * Send 24-hour reminder (all channels)
   */
  async send24HourReminder(appointment) {
    console.log(`📧 Sending 24h reminder for appointment ${appointment.id}`);

    const appointmentTime = this.formatTime(appointment.appointmentTime);
    const appointmentDate = this.formatDate(appointment.appointmentDate);

    // Trigger n8n workflow (best-effort)
    n8nService.appointmentReminder({
      appointmentId: appointment.id,
      patientId: appointment.userId,
      doctorId: appointment.doctorId,
      patientName: appointment.patientName,
      doctorName: appointment.doctorName,
      appointmentDate,
      appointmentTime,
      consultationType: appointment.consultationType || 'consultation',
      reminderType: '24h'
    }).catch(() => {});

    // Send to patient
    await notificationService.send({
      userId: appointment.userId,
      userType: 'patient',
      type: 'appointment_reminder_24h',
      variables: {
        patientName: appointment.patientName,
        doctorName: appointment.doctorName,
        date: appointmentDate,
        time: appointmentTime,
        consultationType: appointment.consultationType || 'consultation',
        appointmentId: appointment.id
      },
      data: {
        appointmentId: appointment.id,
        reminderType: '24h'
      },
      channels: ['in-app', 'email', 'push', 'sms', 'whatsapp'],
      actionUrl: '/my-bookings',
      priority: 'high'
    });

    // Send to doctor
    if (appointment.doctorId) {
      await notificationService.send({
        userId: appointment.doctorId,
        userType: 'doctor',
        type: 'appointment_reminder_24h',
        variables: {
          doctorName: appointment.doctorName,
          patientName: appointment.patientName,
          date: appointmentDate,
          time: appointmentTime,
          appointmentId: appointment.id
        },
        data: {
          appointmentId: appointment.id,
          reminderType: '24h'
        },
        channels: ['in-app', 'email'],
        actionUrl: '/doctor/appointments',
        priority: 'normal'
      });
    }
  }

  /**
   * Send 2-hour reminder (SMS + Push)
   */
  async send2HourReminder(appointment) {
    console.log(`📱 Sending 2h reminder for appointment ${appointment.id}`);

    const appointmentTime = this.formatTime(appointment.appointmentTime);

    await notificationService.send({
      userId: appointment.userId,
      userType: 'patient',
      type: 'appointment_reminder_2h',
      variables: {
        patientName: appointment.patientName,
        doctorName: appointment.doctorName,
        time: appointmentTime,
        consultationType: appointment.consultationType || 'consultation',
        appointmentId: appointment.id
      },
      data: {
        appointmentId: appointment.id,
        reminderType: '2h'
      },
      channels: ['in-app', 'push', 'sms'],
      actionUrl: '/my-bookings',
      priority: 'high'
    });
  }

  /**
   * Send 15-minute urgent reminder (Push only)
   */
  async send15MinuteReminder(appointment) {
    console.log(`🚨 Sending 15min urgent reminder for appointment ${appointment.id}`);

    // Bookings are stored with consultationType='online' regardless of the
    // requested video/audio/chat mode (see mapConsultationTypeForDb in
    // appointment.controller.js) — 'online' must be included or every
    // online consultation gets the wrong reminder action URL.
    const isVideoConsultation = ['online', 'video', 'audio', 'chat'].includes(appointment.consultationType);
    const actionUrl = isVideoConsultation 
      ? `/video-consultation/${appointment.id}` 
      : '/my-bookings';

    await notificationService.send({
      userId: appointment.userId,
      userType: 'patient',
      type: 'appointment_reminder_15min',
      variables: {
        patientName: appointment.patientName,
        doctorName: appointment.doctorName,
        consultationType: appointment.consultationType || 'consultation',
        appointmentId: appointment.id,
        actionText: isVideoConsultation ? 'Join Video Call' : 'View Appointment'
      },
      data: {
        appointmentId: appointment.id,
        reminderType: '15min',
        urgent: true
      },
      channels: ['in-app', 'push'],
      actionUrl,
      priority: 'critical'
    });

    // For video consultations, also notify doctor
    if (isVideoConsultation && appointment.doctorId) {
      await notificationService.send({
        userId: appointment.doctorId,
        userType: 'doctor',
        type: 'appointment_reminder_15min',
        variables: {
          doctorName: appointment.doctorName,
          patientName: appointment.patientName,
          appointmentId: appointment.id
        },
        data: {
          appointmentId: appointment.id,
          reminderType: '15min'
        },
        channels: ['in-app', 'push'],
        actionUrl: `/doctor/video-consultation/${appointment.id}`,
        priority: 'critical'
      });
    }
  }

  /**
   * Format time for display
   */
  formatTime(timeStr) {
    if (!timeStr) return 'N/A';
    
    try {
      const parts = String(timeStr).split(':');
      if (parts.length >= 2) {
        const hours = parseInt(parts[0]);
        const minutes = parts[1];
        const period = hours >= 12 ? 'PM' : 'AM';
        const displayHours = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
        return `${displayHours}:${minutes} ${period}`;
      }
      return timeStr;
    } catch (error) {
      return timeStr;
    }
  }

  /**
   * Format date for display
   */
  formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (error) {
      return dateStr;
    }
  }

  /**
   * Stop the cron service
   */
  stop() {
    this.isRunning = false;
    console.log('🛑 Appointment reminder automation stopped');
  }
}

// Export singleton instance
const appointmentReminderService = new AppointmentReminderService();
export default appointmentReminderService;

// Auto-start on import
appointmentReminderService.start();
