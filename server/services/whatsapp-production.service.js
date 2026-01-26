import dotenv from 'dotenv';
import twilio from 'twilio';

dotenv.config();

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

/**
 * WhatsApp Service for Production
 * Handles template-based and session messages
 */
class WhatsAppProductionService {
  constructor() {
    this.fromNumber = process.env.TWILIO_WHATSAPP_NUMBER;
    this.templates = {
      appointmentConfirmation: process.env.WHATSAPP_TEMPLATE_APPOINTMENT_CONFIRMATION,
      appointmentReminder: process.env.WHATSAPP_TEMPLATE_APPOINTMENT_REMINDER,
      healthReport: process.env.WHATSAPP_TEMPLATE_HEALTH_REPORT,
      prescription: process.env.WHATSAPP_TEMPLATE_PRESCRIPTION,
      otp: process.env.WHATSAPP_TEMPLATE_OTP,
      checkupReminder: process.env.WHATSAPP_TEMPLATE_CHECKUP_REMINDER
    };
  }

  /**
   * Send appointment confirmation
   */
  async sendAppointmentConfirmation({ to, patientName, doctorName, date, time, location }) {
    if (!this.templates.appointmentConfirmation) {
      throw new Error('Appointment confirmation template not configured');
    }

    return await client.messages.create({
      from: this.fromNumber,
      to: `whatsapp:${to}`,
      contentSid: this.templates.appointmentConfirmation,
      contentVariables: JSON.stringify({
        '1': patientName,
        '2': doctorName,
        '3': date,
        '4': time,
        '5': location
      })
    });
  }

  /**
   * Send appointment reminder
   */
  async sendAppointmentReminder({ to, patientName, doctorName, time, location }) {
    if (!this.templates.appointmentReminder) {
      throw new Error('Appointment reminder template not configured');
    }

    return await client.messages.create({
      from: this.fromNumber,
      to: `whatsapp:${to}`,
      contentSid: this.templates.appointmentReminder,
      contentVariables: JSON.stringify({
        '1': patientName,
        '2': doctorName,
        '3': time,
        '4': location
      })
    });
  }

  /**
   * Send health report notification
   */
  async sendHealthReportReady({ to, patientName }) {
    if (!this.templates.healthReport) {
      throw new Error('Health report template not configured');
    }

    return await client.messages.create({
      from: this.fromNumber,
      to: `whatsapp:${to}`,
      contentSid: this.templates.healthReport,
      contentVariables: JSON.stringify({
        '1': patientName
      })
    });
  }

  /**
   * Send prescription notification
   */
  async sendPrescriptionReady({ to, patientName, doctorName, prescriptionUrl, medications, followUpDate }) {
    if (!this.templates.prescription) {
      throw new Error('Prescription template not configured');
    }

    return await client.messages.create({
      from: this.fromNumber,
      to: `whatsapp:${to}`,
      contentSid: this.templates.prescription,
      contentVariables: JSON.stringify({
        '1': patientName,
        '2': doctorName,
        '3': prescriptionUrl,
        '4': medications,
        '5': followUpDate
      })
    });
  }

  /**
   * Send OTP for verification
   */
  async sendOTP({ to, otp }) {
    if (!this.templates.otp) {
      throw new Error('OTP template not configured');
    }

    return await client.messages.create({
      from: this.fromNumber,
      to: `whatsapp:${to}`,
      contentSid: this.templates.otp,
      contentVariables: JSON.stringify({
        '1': otp
      })
    });
  }

  /**
   * Send health checkup reminder
   */
  async sendCheckupReminder({ to, patientName }) {
    if (!this.templates.checkupReminder) {
      throw new Error('Checkup reminder template not configured');
    }

    return await client.messages.create({
      from: this.fromNumber,
      to: `whatsapp:${to}`,
      contentSid: this.templates.checkupReminder,
      contentVariables: JSON.stringify({
        '1': patientName
      })
    });
  }

  /**
   * Send session message (within 24hr window of user message)
   * Use this for replies to user-initiated conversations
   */
  async sendSessionMessage({ to, body }) {
    const normalizedBody = String(body || '').trim();
    const lowerBody = normalizedBody.toLowerCase();
    const isGenericErrorReply = lowerBody.includes('error processing your request') || lowerBody.includes('please try again later');
    if (isGenericErrorReply || !normalizedBody) {
      console.warn('WhatsApp reply sanitized', {
        to,
        snippet: normalizedBody.slice(0, 120)
      });
    }
    console.info('WhatsApp sendSessionMessage trace', {
      to,
      snippet: normalizedBody.slice(0, 120),
      stack: new Error().stack?.split('\n').slice(1, 6).map(line => line.trim())
    });
    const safeBody = isGenericErrorReply || !normalizedBody
      ? "I'm here to help. Please share a bit more detail so I can assist you." 
      : normalizedBody;

    // Add timeout to prevent hanging
    const sendPromise = client.messages.create({
      from: this.fromNumber,
      to: `whatsapp:${to}`,
      body: safeBody
    });

    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('WhatsApp send timeout after 10s')), 10000)
    );

    try {
      return await Promise.race([sendPromise, timeoutPromise]);
    } catch (error) {
      console.error('WhatsApp sendSessionMessage error:', {
        to,
        error: error.message,
        code: error.code
      });
      throw error;
    }
  }

  /**
   * Get message status
   */
  async getMessageStatus(messageSid) {
    return await client.messages(messageSid).fetch();
  }

  /**
   * Check if templates are configured
   */
  getTemplateStatus() {
    return {
      appointmentConfirmation: !!this.templates.appointmentConfirmation,
      appointmentReminder: !!this.templates.appointmentReminder,
      healthReport: !!this.templates.healthReport,
      prescription: !!this.templates.prescription,
      otp: !!this.templates.otp,
      checkupReminder: !!this.templates.checkupReminder
    };
  }
}

export default new WhatsAppProductionService();
