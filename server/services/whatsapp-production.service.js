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
      checkupReminder: process.env.WHATSAPP_TEMPLATE_CHECKUP_REMINDER,
      membershipRenewalReminder: process.env.WHATSAPP_TEMPLATE_MEMBERSHIP_RENEWAL_REMINDER,
      membershipRenewalPayment: process.env.WHATSAPP_TEMPLATE_MEMBERSHIP_RENEWAL_PAYMENT,
      membershipPlanActivated: process.env.WHATSAPP_TEMPLATE_MEMBERSHIP_PLAN_ACTIVATED
    };
  }

  /**
   * Send appointment confirmation
   */
  async sendAppointmentConfirmation({ to, patientName, doctorName, date, time, location, isHealthCheckup = false }) {
    if (!this.twilioConfigured) {
      throw new Error('Twilio WhatsApp is not configured');
    }

    const messageParams = {
      from: this.fromNumber,
      to: `whatsapp:${to}`,
    };

    // Health checkups don't have a doctor. The appointment template requires variable {{2}}
    // (doctorName) — passing undefined silently drops it from contentVariables JSON, causing
    // Twilio to accept the API call but fail silent delivery. Skip the template for health
    // checkups and always use a plain body message instead.
    if (this.templates.appointmentConfirmation && !isHealthCheckup) {
      messageParams.contentSid = this.templates.appointmentConfirmation;
      messageParams.contentVariables = JSON.stringify({
        '1': patientName, '2': doctorName || '', '3': date, '4': time, '5': location
      });
    } else if (isHealthCheckup) {
      messageParams.body =
        `🏥 *Health Checkup Confirmed* ✅\n\n` +
        `Dear ${patientName},\n\n` +
        `Your corporate health checkup has been scheduled!\n\n` +
        `📍 *Venue:* ${location}\n` +
        `📅 *Date:* ${date}\n` +
        `🕐 *Time:* ${time}\n\n` +
        `Please carry a valid photo ID and arrive 10 minutes early.\n\n` +
        `_Mediqzy Wellness Team_`;
    } else {
      const doctorLine = doctorName ? `\n👨‍⚕️ ${doctorName}` : '';
      messageParams.body = `*Appointment Confirmation* ✅\n\nDear ${patientName},\n\nYour appointment has been confirmed!${doctorLine}\n📍 ${location}\n📅 Date: ${date}\n🕐 Time: ${time}\n\nPlease arrive 15 minutes early. For rescheduling or queries, contact us via this chat.\n\n_Team SmartHealth_`;
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
   * Send health report notification with optional download URL
   */
  async sendHealthReportReady({ to, patientName, reportUrl }) {
    if (!this.twilioConfigured) {
      throw new Error('Twilio WhatsApp is not configured');
    }

    const messageParams = { from: this.fromNumber, to: `whatsapp:${to}` };

    if (this.templates.healthReport) {
      messageParams.contentSid = this.templates.healthReport;
      messageParams.contentVariables = JSON.stringify({ '1': patientName, '2': reportUrl || '' });
    } else {
      const urlLine = reportUrl ? `\nUrl : ${reportUrl}` : '';
      messageParams.body = `Health Check up Reports\n\nHello ${patientName}\n\nYour Health Check Up reports are ready. Kindly download the reports from the below link.${urlLine}\n\nTeam SmartHealth`;
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
   * Send membership renewal reminder with payment CTA button.
   * Uses template mediczy_membership_renewal_reminder.
   * Falls back to session message if template not yet approved.
   * Variables: 1=name 2=planName 3=expiryDate 4=daysRemaining 5=rzpLinkSuffix
   */
  async sendMembershipRenewalReminder({ to, name, planName, expiryDate, daysRemaining, renewalUrl }) {
    if (!this.twilioConfigured) throw new Error('Twilio WhatsApp is not configured');

    const messageParams = { from: this.fromNumber, to: `whatsapp:${to}` };

    if (this.templates.membershipRenewalReminder) {
      messageParams.contentSid = this.templates.membershipRenewalReminder;
      messageParams.contentVariables = JSON.stringify({
        '1': name, '2': planName, '3': expiryDate, '4': String(daysRemaining), '5': renewalUrl || ''
      });
    } else {
      messageParams.body =
        `*Your SmartHealth Membership Expires in ${daysRemaining} Days*\n\n` +
        `Dear ${name},\n\nYour *${planName}* plan expires on *${expiryDate}*.\n\n` +
        `Renew now: ${renewalUrl}\n\n_Team SmartHealth_`;
    }

    return await this.client.messages.create(messageParams);
  }

  /**
   * Send standalone payment link message with Pay Now CTA button.
   * Uses template mediczy_membership_renewal_payment.
   * Variables: 1=name 2=planName 3=amount(string) 4=rzpLinkSuffix
   */
  async sendMembershipPaymentLink({ to, name, planName, amount, renewalUrl }) {
    if (!this.twilioConfigured) throw new Error('Twilio WhatsApp is not configured');

    const messageParams = { from: this.fromNumber, to: `whatsapp:${to}` };

    if (this.templates.membershipRenewalPayment) {
      messageParams.contentSid = this.templates.membershipRenewalPayment;
      messageParams.contentVariables = JSON.stringify({
        '1': name, '2': planName, '3': String(amount), '4': renewalUrl || ''
      });
    } else {
      messageParams.body =
        `Hi ${name},\n\nYour *${planName}* plan renewal of *Rs.${amount}* is ready.\n\n` +
        `Complete payment here: ${renewalUrl}\n\n_Team SmartHealth_`;
    }

    return await this.client.messages.create(messageParams);
  }

  /**
   * Send plan activation confirmation after successful renewal/payment.
   * Uses template mediczy_plan_activation_confirmation.
   * Variables: 1=name 2=planName 3=startDate 4=endDate
   */
  async sendMembershipPlanActivated({ to, name, planName, startDate, endDate }) {
    if (!this.twilioConfigured) throw new Error('Twilio WhatsApp is not configured');

    const messageParams = { from: this.fromNumber, to: `whatsapp:${to}` };

    if (this.templates.membershipPlanActivated) {
      messageParams.contentSid = this.templates.membershipPlanActivated;
      messageParams.contentVariables = JSON.stringify({
        '1': name, '2': planName, '3': startDate, '4': endDate
      });
    } else {
      messageParams.body =
        `✅ *Membership Activated!*\n\nDear ${name},\n\nYour *${planName}* plan is now active!\n\n` +
        `📅 Valid From: *${startDate}*\n📅 Valid Till: *${endDate}*\n\n` +
        `Enjoy all your health benefits.\n\n_Team SmartHealth_`;
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

    // Twilio WhatsApp requires whatsapp: prefix on both ends
    const from = String(this.fromNumber || '').startsWith('whatsapp:')
      ? String(this.fromNumber)
      : `whatsapp:${String(this.fromNumber || '').replace(/^whatsapp:/, '')}`;
    if (!this.fromNumber) {
      throw new Error('TWILIO_WHATSAPP_NUMBER is not set');
    }

    // Add timeout to prevent hanging
    // NOTE: free-form body only delivers inside a 24h customer-care session.
    // Business-initiated invites need an approved Content template (contentSid).
    const sendPromise = this.client.messages.create({
      from,
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
   * Send media message (image, document, audio, video)
   */
  async sendMediaMessage({ to, mediaUrl, caption = '' }) {
    if (!this.twilioConfigured) throw new Error('Twilio WhatsApp is not configured');
    const params = {
      from: this.fromNumber,
      to: `whatsapp:${to}`,
      mediaUrl: [mediaUrl]
    };
    if (caption?.trim()) params.body = caption.trim();
    return await this.client.messages.create(params);
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
      checkupReminder: !!this.templates.checkupReminder,
      membershipRenewalReminder: !!this.templates.membershipRenewalReminder,
      membershipRenewalPayment: !!this.templates.membershipRenewalPayment,
      membershipPlanActivated: !!this.templates.membershipPlanActivated
    };
  }
}

export default new WhatsAppProductionService();
