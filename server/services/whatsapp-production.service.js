import dotenv from 'dotenv';
import twilio from 'twilio';
import gupshup, { normalizeGupshupPhone, whatsappProvider } from './gupshup-whatsapp.service.js';

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
      appointmentConfirmation: (whatsappProvider() === 'gupshup' ? process.env.GUPSHUP_TEMPLATE_APPOINTMENT_CONFIRMATION : process.env.WHATSAPP_TEMPLATE_APPOINTMENT_CONFIRMATION),
      appointmentReminder: (whatsappProvider() === 'gupshup' ? process.env.GUPSHUP_TEMPLATE_APPOINTMENT_REMINDER : process.env.WHATSAPP_TEMPLATE_APPOINTMENT_REMINDER),
      healthReport: (whatsappProvider() === 'gupshup' ? process.env.GUPSHUP_TEMPLATE_HEALTH_REPORT : process.env.WHATSAPP_TEMPLATE_HEALTH_REPORT),
      prescription: (whatsappProvider() === 'gupshup' ? process.env.GUPSHUP_TEMPLATE_PRESCRIPTION : process.env.WHATSAPP_TEMPLATE_PRESCRIPTION),
      otp: (whatsappProvider() === 'gupshup' ? process.env.GUPSHUP_TEMPLATE_OTP : process.env.WHATSAPP_TEMPLATE_OTP),
      checkupReminder: (whatsappProvider() === 'gupshup' ? process.env.GUPSHUP_TEMPLATE_CHECKUP_REMINDER : process.env.WHATSAPP_TEMPLATE_CHECKUP_REMINDER),
      membershipRenewalReminder: (whatsappProvider() === 'gupshup' ? process.env.GUPSHUP_TEMPLATE_MEMBERSHIP_RENEWAL_REMINDER : process.env.WHATSAPP_TEMPLATE_MEMBERSHIP_RENEWAL_REMINDER),
      membershipRenewalPayment: (whatsappProvider() === 'gupshup' ? process.env.GUPSHUP_TEMPLATE_MEMBERSHIP_RENEWAL_PAYMENT : process.env.WHATSAPP_TEMPLATE_MEMBERSHIP_RENEWAL_PAYMENT),
      membershipPlanActivated: (whatsappProvider() === 'gupshup' ? process.env.GUPSHUP_TEMPLATE_MEMBERSHIP_PLAN_ACTIVATED : process.env.WHATSAPP_TEMPLATE_MEMBERSHIP_PLAN_ACTIVATED),
      /** UTILITY template for kiosk WhatsApp registration invites (business-initiated) */
      kioskRegister: (whatsappProvider() === 'gupshup' ? process.env.GUPSHUP_TEMPLATE_KIOSK_REGISTER : process.env.WHATSAPP_TEMPLATE_KIOSK_REGISTER),
    };
    /**
     * text = body vars {{1}} hospital, {{2}} minutes, {{3}} full URL
     * cta  = body vars {{1}} hospital, {{2}} minutes + URL button path {{3}} = token only
     */
    this.kioskRegisterStyle = String(process.env.WHATSAPP_TEMPLATE_KIOSK_REGISTER_STYLE || 'text').toLowerCase();
  }

  get provider() { return whatsappProvider(); }
  get configured() { return this.provider === 'gupshup' ? gupshup.configured : this.provider === 'twilio' && this.twilioConfigured; }

  async sendMessageParams(params, templateKey) {
    if (!this.configured) throw new Error('Selected WhatsApp provider is not configured');
    if (this.provider === 'gupshup') {
      // Business-initiated sends must use this provider's approved template, never a freeform fallback.
      const suffix = templateKey.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
      const templateId = process.env[`GUPSHUP_TEMPLATE_${suffix}`];
      const vars = JSON.parse(params.contentVariables || '{}');
      return gupshup.sendTemplate({ to: params.to, templateId,
        params: Object.keys(vars).sort((a, b) => Number(a) - Number(b)).map(k => vars[k]) });
    }
    // Twilio requires WhatsApp addresses in `whatsapp:+<E.164>`.  The
    // identity-link flow deliberately passes the canonical provider number
    // without a plus (for Gupshup), so normalize at this transport boundary
    // instead of making every caller know Twilio's address syntax.
    return this.client.messages.create({
      ...params,
      from: this.whatsappFrom(),
      to: this.twilioWhatsAppAddress(params.to)
    });
  }

  twilioWhatsAppAddress(value) {
    return `whatsapp:+${normalizeGupshupPhone(value)}`;
  }

  whatsappFrom() {
    const raw = String(this.fromNumber || '').trim();
    if (!raw) throw new Error('TWILIO_WHATSAPP_NUMBER is not set');
    return this.twilioWhatsAppAddress(raw);
  }

  /**
   * Send appointment confirmation
   */
  async sendAppointmentConfirmation({ to, patientName, doctorName, date, time, location, isHealthCheckup = false }) {
    if (!this.configured) {
      throw new Error('Selected WhatsApp provider is not configured');
    }

    if (this.provider === 'gupshup' && isHealthCheckup) {
      return gupshup.sendTemplate({ to, templateId: process.env.GUPSHUP_TEMPLATE_HEALTH_CHECKUP,
        params: [patientName, date, time, location] });
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

    return await this.sendMessageParams(messageParams, 'appointmentConfirmation');
  }

  /**
   * Send appointment reminder
   */
  async sendAppointmentReminder({ to, patientName, doctorName, time, location }) {
    if (!this.configured) {
      throw new Error('Selected WhatsApp provider is not configured');
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

    return await this.sendMessageParams(messageParams, 'appointmentReminder');
  }

  /**
   * Send health report notification with optional download URL
   */
  async sendHealthReportReady({ to, patientName, reportUrl }) {
    if (!this.configured) {
      throw new Error('Selected WhatsApp provider is not configured');
    }

    const messageParams = { from: this.fromNumber, to: `whatsapp:${to}` };

    if (this.templates.healthReport) {
      messageParams.contentSid = this.templates.healthReport;
      messageParams.contentVariables = JSON.stringify({ '1': patientName, '2': reportUrl || '' });
    } else {
      const urlLine = reportUrl ? `\nUrl : ${reportUrl}` : '';
      messageParams.body = `Health Check up Reports\n\nHello ${patientName}\n\nYour Health Check Up reports are ready. Kindly download the reports from the below link.${urlLine}\n\nTeam SmartHealth`;
    }

    return await this.sendMessageParams(messageParams, 'healthReport');
  }

  /**
   * Send prescription notification
   */
  async sendPrescriptionReady({ to, patientName, doctorName, prescriptionUrl, medications, followUpDate }) {
    if (!this.configured) {
      throw new Error('Selected WhatsApp provider is not configured');
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

    return await this.sendMessageParams(messageParams, 'prescription');
  }

  /**
   * Send OTP for verification
   */
  async sendOTP({ to, otp }) {
    if (!this.configured) {
      throw new Error('Selected WhatsApp provider is not configured');
    }

    const messageParams = { from: this.fromNumber, to: `whatsapp:${to}` };

    if (this.templates.otp) {
      messageParams.contentSid = this.templates.otp;
      messageParams.contentVariables = JSON.stringify({ '1': otp });
    } else {
      messageParams.body = `Your SmartHealth verification code is *${otp}*. This code expires in 10 minutes. Do not share this code with anyone.`;
    }

    return await this.sendMessageParams(messageParams, 'otp');
  }

  /**
   * Send health checkup reminder
   */
  async sendCheckupReminder({ to, patientName }) {
    if (!this.configured) {
      throw new Error('Selected WhatsApp provider is not configured');
    }

    const messageParams = { from: this.fromNumber, to: `whatsapp:${to}` };

    if (this.templates.checkupReminder) {
      messageParams.contentSid = this.templates.checkupReminder;
      messageParams.contentVariables = JSON.stringify({ '1': patientName });
    } else {
      messageParams.body = `*Health Checkup Reminder* 🏥\n\nDear ${patientName}, it's time for your routine health checkup. Regular checkups help detect health issues early.\n\nBook your appointment today!\n\n_SmartHealth_`;
    }

    return await this.sendMessageParams(messageParams, 'checkupReminder');
  }

  /**
   * Send membership renewal reminder with payment CTA button.
   * Uses template mediczy_membership_renewal_reminder.
   * Falls back to session message if template not yet approved.
   * Variables: 1=name 2=planName 3=expiryDate 4=daysRemaining 5=rzpLinkSuffix
   */
  async sendMembershipRenewalReminder({ to, name, planName, expiryDate, daysRemaining, renewalUrl }) {
    if (!this.configured) throw new Error('Selected WhatsApp provider is not configured');

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

    return await this.sendMessageParams(messageParams, 'membershipRenewalReminder');
  }

  /**
   * Send standalone payment link message with Pay Now CTA button.
   * Uses template mediczy_membership_renewal_payment.
   * Variables: 1=name 2=planName 3=amount(string) 4=rzpLinkSuffix
   */
  async sendMembershipPaymentLink({ to, name, planName, amount, renewalUrl }) {
    if (!this.configured) throw new Error('Selected WhatsApp provider is not configured');

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

    return await this.sendMessageParams(messageParams, 'membershipRenewalPayment');
  }

  /**
   * Send plan activation confirmation after successful renewal/payment.
   * Uses template mediczy_plan_activation_confirmation.
   * Variables: 1=name 2=planName 3=startDate 4=endDate
   */
  async sendMembershipPlanActivated({ to, name, planName, startDate, endDate }) {
    if (!this.configured) throw new Error('Selected WhatsApp provider is not configured');

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

    return await this.sendMessageParams(messageParams, 'membershipPlanActivated');
  }

  /**
   * Business-initiated kiosk registration invite (requires approved Content template).
   * Env: WHATSAPP_TEMPLATE_KIOSK_REGISTER=HXxxxx
   * Style text (default): {{1}} hospital, {{2}} minutes, {{3}} full register URL
   * Style cta: {{1}} hospital, {{2}} minutes, {{3}} token (URL button suffix)
   */
  async sendKioskRegistrationInvite({ to, hospitalName, expiresMin, registerUrl, token }) {
    if (!this.configured) {
      throw new Error('Selected WhatsApp provider is not configured');
    }
    const contentSid = this.templates.kioskRegister;
    if (!contentSid) {
      throw new Error(
        'The selected provider kiosk registration template is not configured'
      );
    }

    const phoneNumber = String(to || '').trim();
    const hospital = String(hospitalName || 'the hospital').slice(0, 60);
    const minutes = String(expiresMin || 30);
    const url = String(registerUrl || '').trim();
    const pathToken =
      String(token || '').trim() ||
      (url.includes('/kiosk/register/') ? url.split('/kiosk/register/').pop() : '');

    const contentVariables =
      this.kioskRegisterStyle === 'cta'
        ? { '1': hospital, '2': minutes, '3': pathToken }
        : { '1': hospital, '2': minutes, '3': url };

    return await this.sendMessageParams({
      from: this.provider === 'gupshup' ? process.env.GUPSHUP_SOURCE_NUMBER : this.whatsappFrom(),
      to: `whatsapp:${phoneNumber}`,
      contentSid,
      contentVariables: JSON.stringify(contentVariables),
    }, 'kioskRegister');
  }

  /**
   * Send session message (within 24hr window of user message)
   * Use this for replies to user-initiated conversations
   */
  async sendSessionMessage({ to, body }) {
    if (this.provider === 'gupshup') return gupshup.sendText({ to, body });
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

    if (!this.configured) {
      throw new Error('Selected WhatsApp provider is not configured');
    }

    // Add timeout to prevent hanging
    // NOTE: free-form body only delivers inside a 24h customer-care session.
    // Business-initiated invites need an approved Content template (contentSid).
    const sendPromise = this.client.messages.create({
      from: this.whatsappFrom(),
      to: this.twilioWhatsAppAddress(phoneNumber),
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
  async sendMediaMessage({ to, mediaUrl, caption = '', mediaType }) {
    if (this.provider === 'gupshup') return gupshup.sendMedia({ to, mediaUrl, caption, mediaType });
    if (!this.configured) throw new Error('Selected WhatsApp provider is not configured');
    const params = {
      from: this.whatsappFrom(),
      to: this.twilioWhatsAppAddress(to),
      mediaUrl: [mediaUrl]
    };
    if (caption?.trim()) params.body = caption.trim();
    return await this.client.messages.create(params);
  }

  /**
   * Get message status
   */
  async getMessageStatus(messageSid) {
    if (this.provider === 'gupshup') return gupshup.getMessageStatus(messageSid);
    if (!this.configured) {
      throw new Error('Selected WhatsApp provider is not configured');
    }
    
    return await this.client.messages(messageSid).fetch();
  }

  /**
   * Poll Twilio until WhatsApp reaches a terminal or acceptably-sent state.
   * messages.create() resolving is NOT delivery — undelivered/failed often arrive 1–5s later
   * (unapproved template, bad vars, number not on WhatsApp, etc.).
   */
  async waitForOutboundStatus(messageSid, { timeoutMs = 9000, intervalMs = 900 } = {}) {
    if (!messageSid) return { ok: false, status: 'missing_sid', errorCode: null, errorMessage: 'No message SID' };
    const started = Date.now();
    let last = null;
    while (Date.now() - started < timeoutMs) {
      last = await this.getMessageStatus(messageSid);
      const status = String(last?.status || '').toLowerCase();
      if (status === 'delivered' || status === 'read') {
        return {
          ok: true,
          status,
          errorCode: last.errorCode || null,
          errorMessage: last.errorMessage || null,
          message: last,
        };
      }
      if (status === 'undelivered' || status === 'failed' || status === 'canceled') {
        return {
          ok: false,
          status,
          errorCode: last.errorCode || null,
          errorMessage: last.errorMessage || null,
          message: last,
        };
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    const status = String(last?.status || 'unknown').toLowerCase();
    // Still in flight (queued/sent/accepted) — Twilio accepted it; treat as soft-success
    const inflight = ['submitted', 'enqueued', 'queued', 'accepted', 'scheduled', 'sending', 'sent'].includes(status);
    return {
      ok: inflight,
      status,
      pending: inflight,
      errorCode: last?.errorCode || null,
      errorMessage: last?.errorMessage || null,
      message: last,
    };
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
      membershipPlanActivated: !!this.templates.membershipPlanActivated,
      kioskRegister: !!this.templates.kioskRegister,
      kioskRegisterStyle: this.kioskRegisterStyle,
      kioskRegisterSid: this.templates.kioskRegister || null,
    };
  }
}

export default new WhatsAppProductionService();
