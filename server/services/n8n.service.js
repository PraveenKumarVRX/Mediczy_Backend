import axios from '../integrations/axios.js';

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
      appointmentId: appointmentData.appointmentId || appointmentData.id,
      patientId: appointmentData.patientId || appointmentData.userId,
      patientName: appointmentData.patientName,
      patientEmail: appointmentData.patientEmail,
      patientPhone: appointmentData.patientPhone,
      doctorName: appointmentData.doctorName,
      appointmentDate: appointmentData.appointmentDate,
      appointmentTime: appointmentData.appointmentTime,
      consultationType: appointmentData.consultationType,
      reminderType: reminderType || appointmentData.reminderType, // '24h', '1h', '15min'
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Trigger appointment cancelled workflow
   */
  async appointmentCancelled(appointmentData, cancelledBy, reason) {
    return this.trigger('appointment-cancelled', {
      appointmentId: appointmentData.appointmentId || appointmentData.id,
      patientId: appointmentData.patientId || appointmentData.userId,
      patientName: appointmentData.patientName,
      patientEmail: appointmentData.patientEmail,
      patientPhone: appointmentData.patientPhone,
      doctorId: appointmentData.doctorId,
      doctorName: appointmentData.doctorName,
      appointmentDate: appointmentData.appointmentDate,
      appointmentTime: appointmentData.appointmentTime,
      consultationFee: appointmentData.consultationFee,
      cancelledBy: cancelledBy || appointmentData.cancelledBy, // 'patient' or 'doctor'
      reason: reason || appointmentData.reason,
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
  // USER WORKFLOWS
  // ============================================

  /**
   * Trigger user registered workflow
   */
  async userRegistered(userData) {
    return this.trigger('user-registered', {
      userId: userData.id,
      userType: userData.userType || 'patient',
      name: userData.name,
      email: userData.email,
      phone: userData.phone,
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
      paymentId: paymentData.paymentId || paymentData.id,
      appointmentId: paymentData.appointmentId,
      patientId: paymentData.patientId || paymentData.userId,
      patientName: paymentData.patientName,
      patientEmail: paymentData.patientEmail,
      patientPhone: paymentData.patientPhone,
      invoiceId: paymentData.invoiceId || paymentData.paymentId || paymentData.id,
      amount: paymentData.amount,
      currency: paymentData.currency || 'INR',
      reason: paymentData.failureReason || paymentData.reason,
      attemptCount: paymentData.attemptCount || 1,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Trigger payment success workflow
   */
  async paymentSuccess(paymentData) {
    return this.trigger('payment-success', {
      paymentId: paymentData.paymentId || paymentData.id,
      appointmentId: paymentData.appointmentId,
      patientId: paymentData.patientId || paymentData.userId,
      patientName: paymentData.patientName,
      patientEmail: paymentData.patientEmail,
      patientPhone: paymentData.patientPhone,
      invoiceId: paymentData.invoiceId || paymentData.paymentId || paymentData.id,
      transactionId: paymentData.transactionId || paymentData.razorpayPaymentId || paymentData.paymentId || paymentData.id,
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
   * Trigger health report ready workflow
   */
  async healthReportReady(reportData) {
    return this.trigger('health-report-ready', {
      reportId: reportData.reportId,
      bookingId: reportData.bookingId,
      patientId: reportData.patientId,
      patientName: reportData.patientName,
      patientEmail: reportData.patientEmail,
      patientPhone: reportData.patientPhone,
      reportUrl: reportData.reportUrl,
      tests: reportData.tests,
      source: reportData.source || 'labs',
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
    const reportPayload = typeof reportDate === 'object' && reportDate !== null
      ? reportDate
      : { date: reportDate };

    return this.trigger('daily-report', {
      date: reportPayload.date || reportPayload.reportDate,
      totalAppointments: reportPayload.totalAppointments || 0,
      completedAppointments: reportPayload.completedAppointments || 0,
      newPatients: reportPayload.newPatients || 0,
      revenue: reportPayload.revenue || 0,
      pendingPayments: reportPayload.pendingPayments || 0,
      adminEmail: reportPayload.adminEmail || process.env.ADMIN_EMAIL || 'admin@mediczy.com',
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Trigger system alert workflow
   */
  async systemAlert(alertData) {
    return this.trigger('system-alert', {
      alertType: alertData.alertType || alertData.type,
      severity: alertData.severity,
      message: alertData.message,
      service: alertData.service || alertData.source || 'mediczy-server',
      adminEmail: alertData.adminEmail || process.env.ADMIN_EMAIL || 'admin@mediczy.com',
      details: alertData.details,
      timestamp: alertData.timestamp || new Date().toISOString()
    });
  }

  // ============================================
  // MEMBERSHIP WORKFLOWS
  // ============================================

  /**
   * Trigger membership expiry workflow
   * Notifies patient and prompts renewal
   */
  async membershipExpiry(membershipData, daysUntilExpiry) {
    return this.trigger('membership-expiry', {
      memberId: membershipData.id,
      patientId: membershipData.userId,
      patientName: membershipData.patientName,
      patientEmail: membershipData.patientEmail,
      patientPhone: membershipData.patientPhone,
      planName: membershipData.planName,
      expiresAt: membershipData.expiresAt,
      daysUntilExpiry: daysUntilExpiry,
      renewalUrl: membershipData.renewalUrl || '/membership',
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Trigger prescription expired workflow
   * Sends renewal reminder to patient
   */
  async prescriptionExpired(prescriptionData) {
    return this.trigger('prescription-expired', {
      prescriptionId: prescriptionData.id,
      patientId: prescriptionData.patientId,
      patientName: prescriptionData.patientName,
      patientEmail: prescriptionData.patientEmail,
      patientPhone: prescriptionData.patientPhone,
      doctorName: prescriptionData.doctorName,
      medications: prescriptionData.medications,
      expiredAt: prescriptionData.expiredAt,
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
    const health = await this.healthCheck();
    return {
      enabled: this.enabled,
      baseURL: this.baseURL,
      n8nAvailable: health.available,
      message: health.available ? 'n8n is running' : (health.reason || health.error || 'n8n unavailable')
    };
  }
}

export default new N8NService();
