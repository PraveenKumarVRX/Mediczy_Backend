import axios from 'axios';

const N8N_BASE_URL = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678';
const N8N_AUTH_TOKEN = process.env.N8N_AUTH_TOKEN || '';

/**
 * n8n Workflow Automation Service
 * 
 * Integrates Mediczy with n8n for external workflow orchestration.
 * Handles multi-channel notifications, payment automation, and complex workflows.
 */
class N8NService {
  constructor() {
    this.baseURL = N8N_BASE_URL;
    this.enabled = process.env.N8N_ENABLED !== 'false';
    
    if (!this.enabled) {
      console.log('⚠️  n8n integration is disabled');
    } else {
      console.log(`✅ n8n integration enabled: ${this.baseURL}`);
    }
  }

  /**
   * Trigger n8n workflow via webhook
   * @param {string} workflowName - Webhook endpoint name
   * @param {object} data - Workflow data
   * @param {object} options - Additional options
   * @returns {Promise<object>}
   */
  async trigger(workflowName, data, options = {}) {
    if (!this.enabled) {
      console.log(`⚠️  n8n disabled, skipping workflow: ${workflowName}`);
      return { success: true, skipped: true };
    }

    try {
      const headers = {
        'Content-Type': 'application/json',
      };

      if (N8N_AUTH_TOKEN) {
        headers['Authorization'] = `Bearer ${N8N_AUTH_TOKEN}`;
      }

      const response = await axios.post(
        `${this.baseURL}/webhook/${workflowName}`,
        data,
        {
          headers,
          timeout: options.timeout || 5000,
          validateStatus: (status) => status < 500 // Don't throw on 4xx
        }
      );

      console.log(`✅ n8n workflow triggered: ${workflowName} (ID: ${data.id || 'N/A'})`);
      return { 
        success: true, 
        data: response.data,
        status: response.status 
      };
    } catch (error) {
      console.error(`❌ n8n workflow error (${workflowName}):`, error.message);
      
      // Don't fail the main operation if n8n is unavailable
      return { 
        success: false, 
        error: error.message,
        skipped: false 
      };
    }
  }

  // ============================================
  // APPOINTMENT WORKFLOWS
  // ============================================

  /**
   * Trigger appointment booked workflow
   * Sends multi-channel confirmation and schedules reminders
   */
  async appointmentBooked(appointmentData) {
    return this.trigger('appointment-booked', {
      appointmentId: appointmentData.id,
      patientId: appointmentData.userId,
      patientName: appointmentData.patientName,
      patientEmail: appointmentData.patientEmail,
      patientPhone: appointmentData.patientPhone,
      doctorId: appointmentData.doctorId,
      doctorName: appointmentData.doctorName,
      appointmentDate: appointmentData.appointmentDate,
      appointmentTime: appointmentData.appointmentTime,
      consultationType: appointmentData.consultationType,
      consultationFee: appointmentData.consultationFee,
      status: appointmentData.status,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Trigger appointment reminder workflow
   * Sends reminders 24h, 1h, and 15min before appointment
   */
  async appointmentReminder(appointmentData, reminderType) {
    return this.trigger('appointment-reminder', {
      appointmentId: appointmentData.id,
      patientName: appointmentData.patientName,
      patientEmail: appointmentData.patientEmail,
      patientPhone: appointmentData.patientPhone,
      doctorName: appointmentData.doctorName,
      appointmentDate: appointmentData.appointmentDate,
      appointmentTime: appointmentData.appointmentTime,
      consultationType: appointmentData.consultationType,
      reminderType: reminderType, // '24h', '1h', '15min'
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Trigger appointment cancelled workflow
   */
  async appointmentCancelled(appointmentData, cancelledBy, reason) {
    return this.trigger('appointment-cancelled', {
      appointmentId: appointmentData.id,
      patientName: appointmentData.patientName,
      patientEmail: appointmentData.patientEmail,
      patientPhone: appointmentData.patientPhone,
      doctorName: appointmentData.doctorName,
      appointmentDate: appointmentData.appointmentDate,
      appointmentTime: appointmentData.appointmentTime,
      cancelledBy: cancelledBy, // 'patient' or 'doctor'
      reason: reason,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Trigger no-show detection workflow
   */
  async appointmentNoShow(appointmentData) {
    return this.trigger('appointment-no-show', {
      appointmentId: appointmentData.id,
      patientId: appointmentData.userId,
      patientName: appointmentData.patientName,
      patientEmail: appointmentData.patientEmail,
      patientPhone: appointmentData.patientPhone,
      doctorId: appointmentData.doctorId,
      doctorName: appointmentData.doctorName,
      appointmentDate: appointmentData.appointmentDate,
      appointmentTime: appointmentData.appointmentTime,
      consultationFee: appointmentData.consultationFee,
      timestamp: new Date().toISOString()
    });
  }

  // ============================================
  // PAYMENT WORKFLOWS
  // ============================================

  /**
   * Trigger payment failed workflow
   * Initiates automated recovery process
   */
  async paymentFailed(paymentData) {
    return this.trigger('payment-failed', {
      paymentId: paymentData.id,
      appointmentId: paymentData.appointmentId,
      patientId: paymentData.userId,
      patientName: paymentData.patientName,
      patientEmail: paymentData.patientEmail,
      patientPhone: paymentData.patientPhone,
      amount: paymentData.amount,
      currency: paymentData.currency || 'INR',
      reason: paymentData.failureReason,
      attemptCount: paymentData.attemptCount || 1,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Trigger payment success workflow
   */
  async paymentSuccess(paymentData) {
    return this.trigger('payment-success', {
      paymentId: paymentData.id,
      appointmentId: paymentData.appointmentId,
      patientName: paymentData.patientName,
      patientEmail: paymentData.patientEmail,
      patientPhone: paymentData.patientPhone,
      amount: paymentData.amount,
      currency: paymentData.currency || 'INR',
      timestamp: new Date().toISOString()
    });
  }

  // ============================================
  // PRESCRIPTION WORKFLOWS
  // ============================================

  /**
   * Trigger prescription issued workflow
   * Notifies patient and optionally integrates with pharmacy
   */
  async prescriptionIssued(prescriptionData) {
    return this.trigger('prescription-issued', {
      prescriptionId: prescriptionData.id,
      patientId: prescriptionData.patientId,
      patientName: prescriptionData.patientName,
      patientEmail: prescriptionData.patientEmail,
      patientPhone: prescriptionData.patientPhone,
      doctorName: prescriptionData.doctorName,
      medications: prescriptionData.medications,
      instructions: prescriptionData.instructions,
      pharmacyPreference: prescriptionData.pharmacyPreference,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Trigger medication reminder workflow
   */
  async medicationReminder(reminderData) {
    return this.trigger('medication-reminder', {
      patientId: reminderData.patientId,
      patientName: reminderData.patientName,
      patientPhone: reminderData.patientPhone,
      medicationName: reminderData.medicationName,
      dosage: reminderData.dosage,
      frequency: reminderData.frequency,
      timeOfDay: reminderData.timeOfDay,
      timestamp: new Date().toISOString()
    });
  }

  // ============================================
  // HEALTH MONITORING WORKFLOWS
  // ============================================

  /**
   * Trigger health alert workflow
   * Escalates based on severity level
   */
  async healthAlert(alertData) {
    return this.trigger('health-alert', {
      alertId: alertData.id,
      patientId: alertData.patientId,
      patientName: alertData.patientName,
      patientPhone: alertData.patientPhone,
      doctorId: alertData.assignedDoctorId,
      severity: alertData.severity, // 'critical', 'high', 'medium', 'low'
      metric: alertData.metric, // 'heart_rate', 'blood_pressure', etc.
      value: alertData.value,
      threshold: alertData.threshold,
      message: alertData.message,
      emergencyContact: alertData.emergencyContact,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Trigger wearable sync workflow
   */
  async wearableDataSync(syncData) {
    return this.trigger('wearable-sync', {
      patientId: syncData.patientId,
      deviceType: syncData.deviceType,
      dataType: syncData.dataType,
      metrics: syncData.metrics,
      timestamp: new Date().toISOString()
    });
  }

  // ============================================
  // DOCTOR WORKFLOWS
  // ============================================

  /**
   * Trigger doctor availability update workflow
   * Syncs with external calendars and notifies patients
   */
  async doctorAvailabilityUpdated(availabilityData) {
    return this.trigger('doctor-availability-updated', {
      doctorId: availabilityData.doctorId,
      doctorName: availabilityData.doctorName,
      availability: availabilityData.slots,
      timezone: availabilityData.timezone || 'Asia/Kolkata',
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Trigger doctor onboarding workflow
   */
  async doctorOnboarding(doctorData) {
    return this.trigger('doctor-onboarding', {
      doctorId: doctorData.id,
      doctorName: `${doctorData.firstName} ${doctorData.lastName}`,
      email: doctorData.email,
      phone: doctorData.phoneNumber,
      specialization: doctorData.specialization,
      licenseNumber: doctorData.licenseNumber,
      status: doctorData.verificationStatus,
      timestamp: new Date().toISOString()
    });
  }

  // ============================================
  // ADMIN WORKFLOWS
  // ============================================

  /**
   * Trigger daily report workflow
   */
  async generateDailyReport(reportDate) {
    return this.trigger('daily-report', {
      reportDate: reportDate,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Trigger system alert workflow
   */
  async systemAlert(alertData) {
    return this.trigger('system-alert', {
      alertType: alertData.type,
      severity: alertData.severity,
      message: alertData.message,
      details: alertData.details,
      timestamp: new Date().toISOString()
    });
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  /**
   * Check if n8n is available
   */
  async healthCheck() {
    if (!this.enabled) {
      return { available: false, reason: 'disabled' };
    }

    try {
      const response = await axios.get(`${this.baseURL}/healthz`, {
        timeout: 3000
      });
      return { available: true, status: response.status };
    } catch (error) {
      return { available: false, error: error.message };
    }
  }

  /**
   * Get workflow execution stats (if n8n API is accessible)
   */
  async getStats() {
    // This would require n8n API credentials
    // For now, return placeholder
    return {
      enabled: this.enabled,
      baseURL: this.baseURL,
      message: 'Stats available in n8n UI'
    };
  }
}

export default new N8NService();
