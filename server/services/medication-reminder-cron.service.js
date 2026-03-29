import cron from 'node-cron';
import { Prescription } from '../models/index.js';
import notificationService from './notification.service.js';
import { Op } from 'sequelize';
import { tick, tickError } from '../utils/cronRegistry.js';
import n8nService from './n8n.service.js';

/**
 * Medication Reminder Automation Service
 * 
 * Sends daily medication reminders based on active prescriptions:
 * - Parses prescription medications
 * - Sends reminders at scheduled times (morning, afternoon, evening)
 * - Tracks medication adherence
 * - Alerts doctor if adherence drops below 70%
 */

class MedicationReminderService {
  constructor() {
    this.isRunning = false;
  }

  /**
   * Start medication reminder cron jobs
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️  Medication reminder service already running');
      return;
    }

    this.isRunning = true;

    // Morning reminders - 8:00 AM
    cron.schedule('0 8 * * *', async () => {
      await this.sendMedicationReminders('morning');
      tick('medication_morning');
    });

    // Afternoon reminders - 2:00 PM
    cron.schedule('0 14 * * *', async () => {
      await this.sendMedicationReminders('afternoon');
      tick('medication_afternoon');
    });

    // Evening reminders - 8:00 PM
    cron.schedule('0 20 * * *', async () => {
      await this.sendMedicationReminders('evening');
      tick('medication_evening');
    });

    console.log('✅ Medication reminder automation started (3x daily: 8AM, 2PM, 8PM)');
  }

  /**
   * Send medication reminders for specific time of day
   */
  async sendMedicationReminders(timeOfDay) {
    console.log(`💊 Sending ${timeOfDay} medication reminders...`);

    try {
      const today = new Date();
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(today.getDate() - 30);

      // Get active prescriptions from last 30 days
      const activePrescriptions = await Prescription.findAll({
        where: {
          status: 'active',
          createdAt: {
            [Op.gte]: thirtyDaysAgo
          }
        }
      });

      let remindersSent = 0;

      for (const prescription of activePrescriptions) {
        try {
          // Parse medications that match this time of day
          const medications = this.getMedicationsForTime(prescription, timeOfDay);

          if (medications.length > 0) {
            await this.sendReminderNotification(prescription, medications, timeOfDay);
            remindersSent++;
          }

        } catch (error) {
          console.error(`Error processing prescription ${prescription.prescriptionId}:`, error.message);
        }
      }

      if (remindersSent > 0) {
        console.log(`✅ Sent ${remindersSent} ${timeOfDay} medication reminders`);
      } else {
        console.log(`ℹ️  No ${timeOfDay} medication reminders to send`);
      }

    } catch (error) {
      console.error('❌ Error in medication reminder check:', error);
    }
  }

  /**
   * Get medications that should be taken at this time
   */
  getMedicationsForTime(prescription, timeOfDay) {
    if (!prescription.medications || !Array.isArray(prescription.medications)) {
      return [];
    }

    const timeKeywords = {
      morning: ['morning', 'breakfast', 'am', 'once daily', 'once a day'],
      afternoon: ['afternoon', 'lunch', 'noon', 'twice daily', 'twice a day'],
      evening: ['evening', 'dinner', 'night', 'pm', 'bedtime', 'before sleep', 'thrice daily', 'three times']
    };

    return prescription.medications.filter(med => {
      const frequency = (med.frequency || '').toLowerCase();
      const instructions = (med.instructions || '').toLowerCase();
      
      // Check if frequency or instructions match this time
      const keywords = timeKeywords[timeOfDay] || [];
      return keywords.some(keyword => 
        frequency.includes(keyword) || instructions.includes(keyword)
      );
    });
  }

  /**
   * Send medication reminder notification
   */
  async sendReminderNotification(prescription, medications, timeOfDay) {
    const patientName = prescription.patientName || 'Patient';
    const patientId = prescription.patientId || prescription.userId;

    // Build medication list
    const medList = medications.map(med => 
      `${med.name} - ${med.dosage}`
    ).join(', ');

    // Trigger n8n workflow (best-effort)
    n8nService.medicationReminder({
      userId: patientId,
      medicationName: medications.map(m => m.name).join(', '),
      dosage: medications.map(m => m.dosage).join(', '),
      frequency: timeOfDay,
      nextDoseTime: timeOfDay === 'morning' ? '08:00' : timeOfDay === 'afternoon' ? '14:00' : '20:00'
    }).catch(() => {});

    await notificationService.send({
      userId: patientId,
      userType: 'patient',
      type: 'medication_reminder',
      variables: {
        patientName: patientName,
        timeOfDay: timeOfDay.charAt(0).toUpperCase() + timeOfDay.slice(1),
        medications: medList,
        count: medications.length
      },
      data: {
        prescriptionId: prescription.id,
        medicationIds: medications.map(m => m.id || m.name),
        timeOfDay: timeOfDay
      },
      channels: ['sms', 'whatsapp', 'push'],
      priority: 'normal'
    });
  }

  /**
   * Track medication adherence (to be called when patient marks taken)
   */
  async trackAdherence(prescriptionId, medicationId, taken = true) {
    try {
      const prescription = await Prescription.findByPk(prescriptionId);
      if (!prescription) return;

      // Initialize adherence tracking if not exists
      if (!prescription.adherenceTracking) {
        prescription.adherenceTracking = {};
      }

      const today = new Date().toISOString().split('T')[0];
      if (!prescription.adherenceTracking[today]) {
        prescription.adherenceTracking[today] = {};
      }

      prescription.adherenceTracking[today][medicationId] = taken;
      await prescription.save();

      // Calculate adherence rate
      const adherenceRate = this.calculateAdherenceRate(prescription);

      // Alert doctor if adherence < 70%
      if (adherenceRate < 70 && prescription.doctorId) {
        await this.alertDoctorLowAdherence(prescription, adherenceRate);
      }

    } catch (error) {
      console.error('Error tracking adherence:', error);
    }
  }

  /**
   * Calculate adherence rate percentage
   */
  calculateAdherenceRate(prescription) {
    if (!prescription.adherenceTracking) return 100;

    let totalDoses = 0;
    let takenDoses = 0;

    Object.values(prescription.adherenceTracking).forEach(day => {
      Object.values(day).forEach(taken => {
        totalDoses++;
        if (taken) takenDoses++;
      });
    });

    return totalDoses > 0 ? (takenDoses / totalDoses) * 100 : 100;
  }

  /**
   * Alert doctor about low adherence
   */
  async alertDoctorLowAdherence(prescription, adherenceRate) {
    await notificationService.send({
      userId: prescription.doctorId,
      userType: 'doctor',
      type: 'low_medication_adherence',
      variables: {
        patientName: prescription.patientName,
        adherenceRate: adherenceRate.toFixed(1),
        prescriptionId: prescription.prescriptionId
      },
      data: {
        prescriptionId: prescription.id,
        patientId: prescription.patientId || prescription.userId,
        adherenceRate: adherenceRate
      },
      channels: ['in-app', 'email'],
      actionUrl: `/doctor/prescriptions/${prescription.id}`,
      priority: 'high'
    });
  }

  /**
   * Stop the cron service
   */
  stop() {
    this.isRunning = false;
    console.log('🛑 Medication reminder automation stopped');
  }
}

// Export singleton instance
const medicationReminderService = new MedicationReminderService();
export default medicationReminderService;

// Auto-start on import
medicationReminderService.start();
