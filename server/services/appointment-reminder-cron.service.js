import cron from 'node-cron';
import Appointment from '../models/appointment.model.intelligent.js';
import notificationService from './notification.service.js';
import { Op } from 'sequelize';
import { tick, tickError, beginJob } from '../utils/cronRegistry.js';
import n8nService from './n8n.service.js';

/**
 * Appointment Reminder Automation Service
 * 
 * Automatically sends multi-stage reminders for upcoming appointments:
 * - 24 hours before: Email + SMS + WhatsApp + Push
 * - 2 hours before: SMS + Push
 * - 15 minutes before: Urgent push notification
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

    // Run every 30 minutes to check for reminders
    cron.schedule('*/30 * * * *', async () => {
      if (!(await beginJob('appt_reminder'))) return;
      await this.checkAndSendReminders();
    });

    console.log('✅ Appointment reminder automation started (checks every 30 minutes)');
  }

  /**
   * Check appointments and send reminders based on time windows
   */
  async checkAndSendReminders() {
    console.log('🔔 Checking for appointment reminders...');
    
    try {
      const now = new Date();
      const twentyFourHoursLater = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      const fifteenMinutesLater = new Date(now.getTime() + 15 * 60 * 1000);
      const twentyThreeHoursLater = new Date(now.getTime() + 23 * 60 * 60 * 1000);
      const oneHourLater = new Date(now.getTime() + 1 * 60 * 60 * 1000);
      const tenMinutesLater = new Date(now.getTime() + 10 * 60 * 1000);

      // Get all upcoming appointments (scheduled or confirmed)
      const upcomingAppointments = await Appointment.findAll({
        where: {
          status: {
            [Op.in]: ['scheduled', 'confirmed', 'pending']
          },
          appointmentDate: {
            [Op.gte]: now.toISOString().split('T')[0]
          }
        }
      });

      let sent24h = 0;
      let sent2h = 0;
      let sent15min = 0;

      for (const appointment of upcomingAppointments) {
        try {
          const appointmentDateTime = this.parseAppointmentDateTime(
            appointment.appointmentDate,
            appointment.appointmentTime
          );

          if (!appointmentDateTime) continue;

          // 24-hour reminder window (23-24 hours before)
          if (appointmentDateTime > twentyThreeHoursLater && 
              appointmentDateTime <= twentyFourHoursLater &&
              !appointment.reminder24hSent) {
            await this.send24HourReminder(appointment);
            await appointment.update({ reminder24hSent: true });
            sent24h++;
          }

          // 2-hour reminder window (1-2 hours before)
          if (appointmentDateTime > oneHourLater && 
              appointmentDateTime <= twoHoursLater &&
              !appointment.reminder2hSent) {
            await this.send2HourReminder(appointment);
            await appointment.update({ reminder2hSent: true });
            sent2h++;
          }

          // 15-minute reminder window (10-15 minutes before)
          if (appointmentDateTime > tenMinutesLater && 
              appointmentDateTime <= fifteenMinutesLater &&
              !appointment.reminder15minSent) {
            await this.send15MinuteReminder(appointment);
            await appointment.update({ reminder15minSent: true });
            sent15min++;
          }

        } catch (error) {
          console.error(`Error processing appointment ${appointment.id}:`, error.message);
        }
      }

      if (sent24h + sent2h + sent15min > 0) {
        console.log(`✅ Reminders sent: 24h=${sent24h}, 2h=${sent2h}, 15min=${sent15min}`);
      }
      tick('appt_reminder', { sent24h, sent2h, sent15min });

    } catch (error) {
      console.error('❌ Error in appointment reminder check:', error);
      tickError('appt_reminder', error.message);
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
