import dotenv from 'dotenv';
import twilio from 'twilio';

dotenv.config();

/**
 * WhatsApp Service for Production
 * Handles template-based and session messages
 */
class WhatsAppProductionService {
  constructor() {
    // Validate Twilio credentials before initialization
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    
    // Check if Twilio is properly configured (not placeholder values)
    const isPlaceholder = !accountSid || 
                         !authToken || 
                         accountSid.includes('your-') || 
                         authToken.includes('your-');
    
    const isValidAccountSid = accountSid && accountSid.startsWith('AC');
    
    if (isPlaceholder || !isValidAccountSid) {
      console.warn('⚠️  Twilio WhatsApp Production Service not configured - service disabled');
      this.twilioConfigured = false;
      this.client = null;
    } else {
      this.twilioConfigured = true;
      this.client = twilio(accountSid, authToken);
    }
    
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
    if (!this.twilioConfigured) {
      throw new Error('Twilio WhatsApp is not configured');
    }

    const messageParams = {
      from: this.fromNumber,
      to: `whatsapp:${to}`,
    };

    if (this.templates.appointmentConfirmation) {
      messageParams.contentSid = this.templates.appointmentConfirmation;
      messageParams.contentVariables = JSON.stringify({
        '1': patientName, '2': doctorName, '3': date, '4': time, '5': location
      });
    } else {
      messageParams.body = `*Health Checkup Appointment Update*\n\nDear ${patientName},\n\nYour health checkup appointment has been confirmed!\n\n📍 Lab: ${doctorName}\n📌 Address: ${location}\n📅 Date: ${date}\n🕐 Time: ${time}\n\nPlease arrive 15 minutes early with a valid ID. Fasting may be required for certain tests — kindly check email for more details.\n\nFor rescheduling or queries, contact us via this chat.\n\n_SmartHealth_`;
    }

    return await this.client.messages.create(messageParams);
  }

  /**
   * Send appointment reminder
   */
  async sendAppointmentReminder({ to, patientName, doctorName, time, location }) {
    if (!this.twilioConfigured) {
      throw new Error('Twilio WhatsApp is not configured');
    }

    const messageParams = { from: this.fromNumber, to: `whatsapp:${to}` };

    if (this.templates.appointmentReminder) {
      messageParams.contentSid = this.templates.appointmentReminder;
      messageParams.contentVariables = JSON.stringify({
        '1': patientName, '2': doctorName, '3': time, '4': location
      });
    } else {
      messageParams.body = `*Appointment Reminder* 🩺\n\nHello ${patientName}, this is a reminder for your appointment with ${doctorName} at ${time}.\n\n📍 Location: ${location}\n\nPlease arrive 15 minutes early. Reply YES to confirm or NO to reschedule.\n\n_SmartHealth_`;
    }

    return await this.client.messages.create(messageParams);
  }

  /**
   * Send health report notification
   */
  async sendHealthReportReady({ to, patientName }) {
    if (!this.twilioConfigured) {
      throw new Error('Twilio WhatsApp is not configured');
    }

    const messageParams = { from: this.fromNumber, to: `whatsapp:${to}` };

    if (this.templates.healthReport) {
      messageParams.contentSid = this.templates.healthReport;
      messageParams.contentVariables = JSON.stringify({ '1': patientName });
    } else {
      messageParams.body = `*Health Report Ready* 📋\n\nDear ${patientName}, your health report is now available. Please log in to your SmartHealth account or visit the lab to collect it.\n\n_SmartHealth_`;
    }

    return await this.client.messages.create(messageParams);
  }

  /**
   * Send prescription notification
   */
  async sendPrescriptionReady({ to, patientName, doctorName, prescriptionUrl, medications, followUpDate }) {
    if (!this.twilioConfigured) {
      throw new Error('Twilio WhatsApp is not configured');
    }

    const messageParams = { from: this.fromNumber, to: `whatsapp:${to}` };

    if (this.templates.prescription) {
      messageParams.contentSid = this.templates.prescription;
      messageParams.contentVariables = JSON.stringify({
        '1': patientName, '2': doctorName, '3': prescriptionUrl, '4': medications, '5': followUpDate
      });
    } else {
      messageParams.body = `*Prescription Ready* 💊\n\nHi ${patientName}, your prescription from ${doctorName} is ready.\n\n💊 Medications: ${medications}\n📅 Follow-up: ${followUpDate}\n🔗 Download: ${prescriptionUrl}\n\n_SmartHealth_`;
    }

    return await this.client.messages.create(messageParams);
  }

  /**
   * Send OTP for verification
   */
  async sendOTP({ to, otp }) {
    if (!this.twilioConfigured) {
      throw new Error('Twilio WhatsApp is not configured');
    }

    const messageParams = { from: this.fromNumber, to: `whatsapp:${to}` };

    if (this.templates.otp) {
      messageParams.contentSid = this.templates.otp;
      messageParams.contentVariables = JSON.stringify({ '1': otp });
    } else {
      messageParams.body = `Your SmartHealth verification code is *${otp}*. This code expires in 10 minutes. Do not share this code with anyone.`;
    }

    return await this.client.messages.create(messageParams);
  }

  /**
   * Send health checkup reminder
   */
  async sendCheckupReminder({ to, patientName }) {
    if (!this.twilioConfigured) {
      throw new Error('Twilio WhatsApp is not configured');
    }

    const messageParams = { from: this.fromNumber, to: `whatsapp:${to}` };

    if (this.templates.checkupReminder) {
      messageParams.contentSid = this.templates.checkupReminder;
      messageParams.contentVariables = JSON.stringify({ '1': patientName });
    } else {
      messageParams.body = `*Health Checkup Reminder* 🏥\n\nDear ${patientName}, it's time for your routine health checkup. Regular checkups help detect health issues early.\n\nBook your appointment today!\n\n_SmartHealth_`;
    }

    return await this.client.messages.create(messageParams);
  }

  /**
   * Send session message (within 24hr window of user message)
   * Use this for replies to user-initiated conversations
   */
  async sendSessionMessage({ to, body }) {
    // Trim phone number to remove any spaces
    const phoneNumber = String(to || '').trim();
    
    const normalizedBody = String(body || '').trim();
    const lowerBody = normalizedBody.toLowerCase();
    const isGenericErrorReply = lowerBody.includes('error processing your request') || lowerBody.includes('please try again later');
    if (isGenericErrorReply || !normalizedBody) {
      console.warn('WhatsApp reply sanitized', {
        to: phoneNumber,
        snippet: normalizedBody.slice(0, 120)
      });
    }
    console.info('WhatsApp sendSessionMessage trace', {
      to: phoneNumber,
      snippet: normalizedBody.slice(0, 120),
      stack: new Error().stack?.split('\n').slice(1, 6).map(line => line.trim())
    });
    const safeBody = isGenericErrorReply || !normalizedBody
      ? "I'm here to help. Please share a bit more detail so I can assist you." 
      : normalizedBody;

    if (!this.twilioConfigured) {
      throw new Error('Twilio WhatsApp is not configured');
    }

    // Add timeout to prevent hanging
    const sendPromise = this.client.messages.create({
      from: this.fromNumber,
      to: `whatsapp:${phoneNumber}`,
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
    if (!this.twilioConfigured) {
      throw new Error('Twilio WhatsApp is not configured');
    }
    
    return await this.client.messages(messageSid).fetch();
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
