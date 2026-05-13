import cron from 'node-cron';
import { Prescription } from '../models/index.js';
import notificationService from './notification.service.js';
import { Op } from 'sequelize';
import { tick, tickError } from '../utils/cronRegistry.js';
import n8nService from './n8n.service.js';

/**
 * Prescription Expiry Alert Service
 * 
 * Sends alerts when prescriptions are expiring:
 * - 7 days before expiry
 * - 3 days before expiry
 * - On expiry date
 * - Suggests follow-up appointment booking
 */

class PrescriptionExpiryService {
  constructor() {
    this.isRunning = false;
  }

  /**
   * Start prescription expiry cron job
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️  Prescription expiry service already running');
      return;
    }

    this.isRunning = true;

    // Run daily at 9:30 AM
    cron.schedule('30 9 * * *', async () => {
      await this.checkExpiringPrescriptions();
    });

    console.log('✅ Prescription expiry automation started (daily at 9:30 AM)');
  }

  /**
   * Check for expiring prescriptions and send alerts
   */
  async checkExpiringPrescriptions() {
    console.log('💊 Checking expiring prescriptions...');

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const sevenDaysFromNow = new Date(today);
      sevenDaysFromNow.setDate(today.getDate() + 7);

      const threeDaysFromNow = new Date(today);
      threeDaysFromNow.setDate(today.getDate() + 3);

      // Calculate expiry date from prescription date + duration
      // We'll need to check prescriptions from the last 60 days
      const sixtyDaysAgo = new Date(today);
      sixtyDaysAgo.setDate(today.getDate() - 60);

      const activePrescriptions = await Prescription.findAll({
        where: {
          status: { [Op.in]: ['issued', 'active'] },
          createdAt: {
            [Op.gte]: sixtyDaysAgo
          }
        }
      });

      let alertsSent = {
        sevenDays: 0,
        threeDays: 0,
        expired: 0
      };

      for (const prescription of activePrescriptions) {
        try {
          const expiryDate = this.calculateExpiryDate(prescription);
          if (!expiryDate) continue;

          expiryDate.setHours(0, 0, 0, 0);
          const daysDifference = Math.floor((expiryDate - today) / (1000 * 60 * 60 * 24));

          // 7 days before expiry
          if (daysDifference === 7 && !prescription.expiryAlert7DaysSent) {
            await this.sendExpiryAlert(prescription, 7, expiryDate);
            await prescription.update({ expiryAlert7DaysSent: true });
            alertsSent.sevenDays++;
          }

          // 3 days before expiry
          if (daysDifference === 3 && !prescription.expiryAlert3DaysSent) {
            await this.sendExpiryAlert(prescription, 3, expiryDate);
            await prescription.update({ expiryAlert3DaysSent: true });
            alertsSent.threeDays++;
          }

          // Expired today
          if (daysDifference === 0 && !prescription.expiryAlertExpiredSent) {
            await this.sendExpiredAlert(prescription);
            await prescription.update({ 
              expiryAlertExpiredSent: true,
              status: 'expired'
            });
            alertsSent.expired++;
          }

        } catch (error) {
          console.error(`Error processing prescription ${prescription.prescriptionId}:`, error.message);
        }
      }

      const total = Object.values(alertsSent).reduce((a, b) => a + b, 0);
      if (total > 0) {
        console.log('✅ Prescription expiry alerts sent:', alertsSent);
      } else {
        console.log('ℹ️  No prescription expiry alerts to send today');
      }
      tick('prescription_expiry', { total, ...alertsSent });

    } catch (error) {
      console.error('❌ Error in prescription expiry check:', error);
      tickError('prescription_expiry', error.message);
    }
  }

  /**
   * Calculate prescription expiry date based on medications
   */
  calculateExpiryDate(prescription) {
    try {
      if (!prescription.medications || !Array.isArray(prescription.medications)) {
        return null;
      }

      // Find the longest duration medication
      let maxDurationDays = 0;

      prescription.medications.forEach(med => {
        const duration = med.duration || '';
        const days = this.parseDurationToDays(duration);
        if (days > maxDurationDays) {
          maxDurationDays = days;
        }
      });

      if (maxDurationDays === 0) {
        // Default to 30 days if no duration specified
        maxDurationDays = 30;
      }

      const createdDate = new Date(prescription.createdAt);
      const expiryDate = new Date(createdDate);
      expiryDate.setDate(createdDate.getDate() + maxDurationDays);

      return expiryDate;

    } catch (error) {
      console.error('Error calculating expiry date:', error);
      return null;
    }
  }

  /**
   * Parse duration string to days
   */
  parseDurationToDays(duration) {
    if (!duration) return 0;

    const durationStr = duration.toLowerCase();
    let days = 0;

    // Extract number
    const numberMatch = durationStr.match(/(\d+)/);
    if (!numberMatch) return 0;

    const number = parseInt(numberMatch[1]);

    if (durationStr.includes('day')) {
      days = number;
    } else if (durationStr.includes('week')) {
      days = number * 7;
    } else if (durationStr.includes('month')) {
      days = number * 30;
    } else {
      // Default to days
      days = number;
    }

    return days;
  }

  /**
   * Send expiry alert (7 or 3 days before)
   */
  async sendExpiryAlert(prescription, daysBeforeExpiry, expiryDate) {
    console.log(`📧 Sending ${daysBeforeExpiry}-day expiry alert for prescription ${prescription.prescriptionId}`);

    const patientName = prescription.patientName || 'Patient';
    const patientId = prescription.patientId || prescription.userId;
    const doctorName = prescription.doctorName || 'your doctor';

    n8nService.trigger('prescription-expiry', {
      prescriptionId: prescription.prescriptionId,
      patientId,
      patientName,
      doctorName,
      daysBeforeExpiry,
      expiryDate: expiryDate instanceof Date ? expiryDate.toISOString() : expiryDate,
    }).catch(() => {});

    await notificationService.send({
      userId: patientId,
      userType: 'patient',
      type: 'prescription_expiring_soon',
      variables: {
        patientName: patientName,
        doctorName: doctorName,
        daysRemaining: daysBeforeExpiry,
        expiryDate: this.formatDate(expiryDate),
        prescriptionId: prescription.prescriptionId
      },
      data: {
        prescriptionId: prescription.id,
        doctorId: prescription.doctorId,
        expiryDate: expiryDate.toISOString(),
        daysRemaining: daysBeforeExpiry
      },
      channels: ['in-app', 'email', 'sms'],
      actionUrl: '/book-appointment',
      priority: daysBeforeExpiry <= 3 ? 'high' : 'normal'
    });
  }

  /**
   * Send expired alert
   */
  async sendExpiredAlert(prescription) {
    console.log(`🚨 Sending expired alert for prescription ${prescription.prescriptionId}`);

    const patientName = prescription.patientName || 'Patient';
    const patientId = prescription.patientId || prescription.userId;
    const doctorName = prescription.doctorName || 'your doctor';

    n8nService.trigger('prescription-expired', {
      prescriptionId: prescription.prescriptionId,
      patientId,
      patientName,
      doctorName,
    }).catch(() => {});

    await notificationService.send({
      userId: patientId,
      userType: 'patient',
      type: 'prescription_expired',
      variables: {
        patientName: patientName,
        doctorName: doctorName,
        prescriptionId: prescription.prescriptionId,
        diagnosis: prescription.diagnosis || 'your condition'
      },
      data: {
        prescriptionId: prescription.id,
        doctorId: prescription.doctorId
      },
      channels: ['in-app', 'email', 'sms', 'whatsapp'],
      actionUrl: '/book-appointment',
      priority: 'critical'
    });
  }

  /**
   * Format date for display
   */
  formatDate(date) {
    if (!date) return 'N/A';
    
    try {
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      return date.toString();
    }
  }

  /**
   * Stop the cron service
   */
  stop() {
    this.isRunning = false;
    console.log('🛑 Prescription expiry automation stopped');
  }
}

// Export singleton instance
const prescriptionExpiryService = new PrescriptionExpiryService();
export default prescriptionExpiryService;

// Auto-start on import
prescriptionExpiryService.start();
