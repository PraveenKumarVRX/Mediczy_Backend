import cron from 'node-cron';
import { Prescription } from '../models/index.js';
import Appointment from '../models/appointment.model.intelligent.js';
import notificationService from './notification.service.js';
import { Op } from 'sequelize';
import { tick, tickError, beginJob } from '../utils/cronRegistry.js';

/**
 * Follow-Up Appointment Automation Service
 * 
 * Automatically manages follow-up appointments from prescriptions:
 * - Tracks prescriptions with followUpDate
 * - Sends reminders 7 days before, 3 days before, and 1 day before
 * - Creates appointment suggestions for easy booking
 * - Tracks follow-up compliance
 */

class FollowUpAutomationService {
  constructor() {
    this.isRunning = false;
  }

  /**
   * Start follow-up automation cron job
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️  Follow-up automation service already running');
      return;
    }

    this.isRunning = true;

    // Run daily at 10:00 AM
    cron.schedule('0 10 * * *', async () => {
      if (!(await beginJob('followup_automation'))) return;
      await this.checkFollowUpReminders();
    });

    console.log('✅ Follow-up automation started (daily at 10:00 AM)');
  }

  /**
   * Check prescriptions and send follow-up reminders
   */
  async checkFollowUpReminders() {
    console.log('📅 Checking follow-up reminders...');

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const sevenDaysFromNow = new Date(today);
      sevenDaysFromNow.setDate(today.getDate() + 7);

      const threeDaysFromNow = new Date(today);
      threeDaysFromNow.setDate(today.getDate() + 3);

      const oneDayFromNow = new Date(today);
      oneDayFromNow.setDate(today.getDate() + 1);

      // Get prescriptions with upcoming follow-up dates
      const upcomingFollowUps = await Prescription.findAll({
        where: {
          followUpDate: {
            [Op.gte]: today.toISOString().split('T')[0],
            [Op.lte]: sevenDaysFromNow.toISOString().split('T')[0]
          },
          status: {
            [Op.in]: ['active', 'completed']
          }
        }
      });

      let remindersSent = {
        sevenDays: 0,
        threeDays: 0,
        oneDay: 0
      };

      for (const prescription of upcomingFollowUps) {
        try {
          const followUpDate = new Date(prescription.followUpDate);
          followUpDate.setHours(0, 0, 0, 0);

          const daysDifference = Math.floor((followUpDate - today) / (1000 * 60 * 60 * 24));

          // 7 days before
          if (daysDifference === 7 && !prescription.followUpReminder7DaysSent) {
            await this.sendFollowUpReminder(prescription, 7);
            await prescription.update({ followUpReminder7DaysSent: true });
            await this.createFollowUpSuggestion(
              prescription.id,
              prescription.patientId || prescription.userId,
              prescription.doctorId,
              prescription.followUpDate
            );
            remindersSent.sevenDays++;
          }

          // 3 days before
          if (daysDifference === 3 && !prescription.followUpReminder3DaysSent) {
            await this.sendFollowUpReminder(prescription, 3);
            await prescription.update({ followUpReminder3DaysSent: true });
            remindersSent.threeDays++;
          }

          // 1 day before
          if (daysDifference === 1 && !prescription.followUpReminder1DaySent) {
            await this.sendFollowUpReminder(prescription, 1);
            await prescription.update({ followUpReminder1DaySent: true });
            remindersSent.oneDay++;
          }

        } catch (error) {
          console.error(`Error processing prescription ${prescription.prescriptionId}:`, error.message);
        }
      }

      const total = Object.values(remindersSent).reduce((a, b) => a + b, 0);
      if (total > 0) {
        console.log('✅ Follow-up reminders sent:', remindersSent);
      } else {
        console.log('ℹ️  No follow-up reminders to send today');
      }
      tick('followup_automation', remindersSent);

    } catch (error) {
      tickError('followup_automation', error.message);
      console.error('❌ Error in follow-up reminder check:', error);
    }
  }

  /**
   * Send follow-up reminder to patient
   */
  async sendFollowUpReminder(prescription, daysBeforeFollowUp) {
    console.log(`📧 Sending ${daysBeforeFollowUp}-day follow-up reminder for prescription ${prescription.prescriptionId}`);

    const followUpDate = this.formatDate(prescription.followUpDate);

    // Get patient info
    let patientName = prescription.patientName || 'Patient';
    let patientId = prescription.patientId || prescription.userId;

    // Get doctor info
    const doctorName = prescription.doctorName || 'your doctor';

    await notificationService.send({
      userId: patientId,
      userType: 'patient',
      type: 'followup_reminder',
      variables: {
        patientName: patientName,
        doctorName: doctorName,
        followUpDate: followUpDate,
        daysRemaining: daysBeforeFollowUp,
        prescriptionId: prescription.prescriptionId,
        diagnosis: prescription.diagnosis || 'your condition'
      },
      data: {
        prescriptionId: prescription.id,
        doctorId: prescription.doctorId,
        followUpDate: prescription.followUpDate,
        daysBeforeFollowUp: daysBeforeFollowUp
      },
      channels: ['in-app', 'email', 'sms', 'whatsapp'],
      actionUrl: '/appointments',
      priority: daysBeforeFollowUp === 1 ? 'high' : 'normal'
    });

    // Also notify doctor if 1 day before
    if (daysBeforeFollowUp === 1 && prescription.doctorId) {
      await notificationService.send({
        userId: prescription.doctorId,
        userType: 'doctor',
        type: 'followup_reminder_doctor',
        variables: {
          doctorName: doctorName,
          patientName: patientName,
          followUpDate: followUpDate,
          diagnosis: prescription.diagnosis || 'Prescription follow-up'
        },
        data: {
          prescriptionId: prescription.id,
          patientId: patientId
        },
        channels: ['in-app', 'email'],
        actionUrl: '/doctor/appointments',
        priority: 'normal'
      });
    }
  }

  /**
   * Create follow-up appointment suggestion
   */
  async createFollowUpSuggestion(prescriptionId, patientId, doctorId, followUpDate) {
    try {
      // Check if appointment already exists for this follow-up
      const existingAppointment = await Appointment.findOne({
        where: {
          userId: patientId,
          doctorId: doctorId,
          appointmentDate: followUpDate,
          status: {
            [Op.in]: ['scheduled', 'confirmed', 'pending']
          }
        }
      });

      if (existingAppointment) {
        console.log(`Follow-up appointment already exists for prescription ${prescriptionId}`);
        return existingAppointment;
      }

      // Create appointment suggestion (status: suggested)
      const suggestion = await Appointment.create({
        userId: patientId,
        doctorId: doctorId,
        appointmentDate: followUpDate,
        status: 'suggested',
        consultationType: 'follow-up',
        notes: `Follow-up appointment from prescription ${prescriptionId}`,
        prescriptionId: prescriptionId,
        isSuggestion: true
      });

      console.log(`✅ Follow-up suggestion created for prescription ${prescriptionId}`);
      return suggestion;

    } catch (error) {
      console.error('Error creating follow-up suggestion:', error);
      return null;
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
    console.log('🛑 Follow-up automation stopped');
  }
}

// Export singleton instance
const followUpAutomationService = new FollowUpAutomationService();
export default followUpAutomationService;

// Auto-start on import
followUpAutomationService.start();
