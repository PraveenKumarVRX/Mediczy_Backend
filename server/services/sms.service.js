import { managedFetch } from '../integrations/transport.js';
import { managedFetch as fetch } from '../integrations/transport.js';
// SMS Service - Multiple Gateway Support
import axios from '../integrations/axios.js';

/** Normalize Twilio phone / whatsapp: sender to bare E.164 digits with +. */
export function normalizeE164(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';
  if (s.toLowerCase().startsWith('whatsapp:')) s = s.slice('whatsapp:'.length).trim();
  s = s.replace(/[^\d+]/g, '');
  if (!s) return '';
  if (!s.startsWith('+')) s = `+${s}`;
  return s;
}

/** WhatsApp-channel senders cannot be used as SMS From (Twilio 21659). */
export function whatsappSenderE164() {
  return normalizeE164(
    process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_PHONE_NUMBER || ''
  );
}

/**
 * Resolve Twilio SMS sender.
 * Prefer dedicated SMS number / Messaging Service — never the WhatsApp sender.
 * @returns {Promise<{ from?: string, messagingServiceSid?: string, source: string }>}
 */
export async function resolveTwilioSmsSender({
  accountSid,
  authToken,
  smsFrom,
  senderId,
  messagingServiceSid,
  fetch = managedFetch,
  allowDiscover = true,
} = {}) {
  const wa = whatsappSenderE164();
  const mg =
    String(
      messagingServiceSid ||
        process.env.TWILIO_MESSAGING_SERVICE_SID ||
        process.env.TWILIO_SMS_MESSAGING_SERVICE_SID ||
        ''
    ).trim();

  if (mg && /^MG[a-zA-Z0-9]+$/.test(mg)) {
    return { messagingServiceSid: mg, source: 'messaging_service' };
  }

  const candidates = [
    smsFrom,
    process.env.TWILIO_SMS_NUMBER,
    senderId,
    // TWILIO_PHONE_NUMBER is often the WhatsApp sender — only use if different
    process.env.TWILIO_PHONE_NUMBER,
  ];

  for (const c of candidates) {
    const from = normalizeE164(c);
    if (!from || /^mediczy$/i.test(String(c || '').trim())) continue;
    if (wa && from === wa) continue; // WhatsApp-only sender → Twilio 21659
    return { from, source: 'env' };
  }

  if (allowDiscover && accountSid && authToken) {
    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PageSize=50`;
      const res = await fetch(url, {
        headers: {
          Authorization:
            'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        },
      });
      if (res.ok) {
        const data = await res.json();
        const nums = Array.isArray(data.incoming_phone_numbers)
          ? data.incoming_phone_numbers
          : [];
        const smsCapable = nums.filter((n) => {
          const phone = normalizeE164(n.phone_number);
          if (!phone || (wa && phone === wa)) return false;
          const caps = n.capabilities || {};
          // Twilio may return sms: true or SMS: true
          return caps.sms === true || caps.SMS === true || n.sms_url != null;
        });
        // Prefer Indian (+91) numbers when present (kiosk users are IN)
        smsCapable.sort((a, b) => {
          const ap = normalizeE164(a.phone_number);
          const bp = normalizeE164(b.phone_number);
          const aIn = ap.startsWith('+91') ? 0 : 1;
          const bIn = bp.startsWith('+91') ? 0 : 1;
          return aIn - bIn;
        });
        if (smsCapable[0]) {
          return {
            from: normalizeE164(smsCapable[0].phone_number),
            source: 'twilio_discover',
          };
        }
      }
    } catch (e) {
      console.warn('[sms] Twilio number discovery failed:', e.message);
    }
  }

  throw new Error(
    'Twilio SMS From not configured — set TWILIO_SMS_NUMBER to an SMS-capable E.164 number ' +
      '(not TWILIO_WHATSAPP_NUMBER). WhatsApp senders cannot send SMS (Twilio 21659).'
  );
}

class SMSService {
  constructor(config) {
    this.config = config;
    /** @type {{ from?: string, messagingServiceSid?: string, source: string } | null} */
    this._twilioSenderCache = null;
  }

  async sendSMS(message) {
    try {
      switch (this.config.provider) {
        case 'twilio':
          return await this.sendViaTwilio(message);
        case 'aws-sns':
          return await this.sendViaAWS(message);
        case 'textlocal':
          return await this.sendViaTextLocal(message);
        case 'msg91':
          return await this.sendViaMsg91(message);
        case 'fast2sms':
          return await this.sendViaFast2SMS(message);
        case 'pay4sms':
          return await this.sendViaPay4SMS(message);
        default:
          throw new Error(`Unsupported SMS provider: ${this.config.provider}`);
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        provider: this.config.provider
      };
    }
  }

  async getTwilioSmsSenderStatus() {
    try {
      const sender = await this.resolveSender();
      return {
        configured: true,
        source: sender.source,
        fromHint: sender.from
          ? `***${sender.from.slice(-4)}`
          : null,
        messagingService: !!sender.messagingServiceSid,
      };
    } catch (e) {
      return { configured: false, message: e.message };
    }
  }

  async resolveSender() {
    if (this._twilioSenderCache) return this._twilioSenderCache;
    const sender = await resolveTwilioSmsSender({
      accountSid: this.config.apiKey,
      authToken: this.config.apiSecret,
      smsFrom: this.config.smsFrom,
      senderId: this.config.senderId,
      messagingServiceSid: this.config.messagingServiceSid,
      allowDiscover: this.config.allowDiscover !== false,
    });
    this._twilioSenderCache = sender;
    return sender;
  }

  async sendViaTwilio(message) {
    const accountSid = this.config.apiKey;
    const authToken = this.config.apiSecret;
    const sender = await this.resolveSender();
    const to = Array.isArray(message.to) ? message.to[0] : message.to;

    const params = { To: to, Body: message.message };
    if (sender.messagingServiceSid) {
      params.MessagingServiceSid = sender.messagingServiceSid;
    } else {
      params.From = sender.from;
    }

    try {
      const response = await axios.post(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        new URLSearchParams(params),
        {
          auth: {
            username: accountSid,
            password: authToken,
          },
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      return {
        success: true,
        messageId: response.data.sid,
        provider: 'twilio',
        deliveryStatus: 'sent',
        fromSource: sender.source,
      };
    } catch (error) {
      // Cached sender may be invalid — allow one rediscovery
      this._twilioSenderCache = null;
      const twilioMsg =
        error?.response?.data?.message ||
        error?.response?.data?.error_message ||
        error.message;
      const code = error?.response?.data?.code;
      throw new Error(code ? `${twilioMsg} (Twilio ${code})` : twilioMsg);
    }
  }

  async sendViaAWS(message) {
    // AWS SNS implementation would go here
    // For now, return a mock response
    return {
      success: true,
      messageId: `aws-${Date.now()}`,
      provider: 'aws-sns',
      deliveryStatus: 'sent'
    };
  }

  async sendViaTextLocal(message) {
    const response = await axios.post('https://api.textlocal.in/send/', {
      apikey: this.config.apiKey,
      numbers: Array.isArray(message.to) ? message.to.join(',') : message.to,
      message: message.message,
      sender: this.config.senderId
    });

    if (response.data.status === 'success') {
      return {
        success: true,
        messageId: response.data.message_id,
        provider: 'textlocal',
        deliveryStatus: 'sent'
      };
    } else {
      throw new Error(response.data.errors?.[0]?.message || 'TextLocal API error');
    }
  }

  async sendViaMsg91(message) {
    const response = await axios.post(
      `https://api.msg91.com/api/v5/sms/send`,
      {
        sender: this.config.senderId,
        route: '4',
        country: '91',
        sms: [{
          message: message.message,
          to: Array.isArray(message.to) ? message.to : [message.to]
        }]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authkey': this.config.apiKey
        }
      }
    );

    return {
      success: response.data.type === 'success',
      messageId: response.data.message_id,
      provider: 'msg91',
      deliveryStatus: 'sent'
    };
  }

  async sendViaFast2SMS(message) {
    const response = await axios.post(
      'https://www.fast2sms.com/dev/bulk',
      {
        sender_id: this.config.senderId,
        message: message.message,
        numbers: Array.isArray(message.to) ? message.to.join(',') : message.to
      },
      {
        headers: {
          'Authorization': this.config.apiKey,
          'Content-Type': 'application/json'
        }
      }
    );

    return {
      success: response.data.return,
      messageId: response.data.request_id,
      provider: 'fast2sms',
      deliveryStatus: 'sent'
    };
  }

  async sendViaPay4SMS(message) {
    // Pay4SMS.in Transactional API
    // API: http://pay4sms.in/sendsms/
    // TRAI COMPLIANCE: Template ID is MANDATORY for all messages
    
    const phones = Array.isArray(message.to) ? message.to.join(',') : message.to;
    
    // Remove + and country code (91 for India) to get 10-digit numbers
    const cleanPhones = phones.replace(/\+91/g, '').replace(/\+/g, '').replace(/^91/g, '');
    
    // Pay4SMS credit types:
    // 2 = Transactional (OTP, alerts, notifications) - ONLY TYPE AVAILABLE
    // 1 = Promotional (not available for this account)
    const credit = '2'; // Always use transactional
    
    // Determine template ID (MANDATORY for TRAI compliance)
    let templateId = message.templateId;
    
    // If no template provided, try to get default based on message type
    if (!templateId) {
      if (message.isOTP || message.message.toLowerCase().includes('otp') || 
          message.message.match(/\b\d{4,6}\b/)) {
        templateId = this.config.otpTemplateId;
      } else {
        templateId = this.config.templateId;
      }
    }
    
    // Validate template ID is present
    if (!templateId) {
      return {
        success: false,
        error: 'Template ID is required for TRAI compliance. Configure SMS_TEMPLATE_ID or SMS_OTP_TEMPLATE_ID in .env',
        provider: 'pay4sms',
        deliveryStatus: 'failed'
      };
    }
    
    try {
      // Build request parameters
      const params = {
        token: this.config.apiKey,
        credit: credit,
        sender: this.config.senderId || 'MSMART',
        message: message.message,
        number: cleanPhones,
        templateid: templateId // MANDATORY
      };
      
      // Send SMS request
      const sendResponse = await axios.get(
        `${this.config.apiUrl || 'http://pay4sms.in'}/sendsms/`,
        { params }
      );

      // Parse response
      // Success response formats:
      // 1. JSON object: {"status":"success","data":"message_id"}
      // 2. Array: [["phone","message_id","Sent",1]]
      // 3. Plain text: message_id
      // Error response: error text or {"status":"error","message":"error description"}
      const responseData = sendResponse.data;
      let isSuccess = false;
      let messageId = null;
      
      if (Array.isArray(responseData)) {
        // Array format: [["7373007737","278854628_0","Sent",1]]
        if (responseData.length > 0 && Array.isArray(responseData[0])) {
          const firstResponse = responseData[0];
          messageId = firstResponse[1]; // message_id
          const status = firstResponse[2]; // "Sent"
          isSuccess = status && (status.toLowerCase() === 'sent' || status.toLowerCase() === 'success');
        }
      } else if (typeof responseData === 'object') {
        isSuccess = responseData.status === 'success' || responseData.Status === 'Success';
        messageId = responseData.data || responseData.messageid || responseData.MessageId;
      } else {
        // Response might be plain text message ID
        const responseText = responseData.toString().trim();
        isSuccess = !responseText.toLowerCase().includes('error') && 
                   !responseText.toLowerCase().includes('fail') &&
                   !responseText.toLowerCase().includes('insufficient') &&
                   responseText.length > 0;
        messageId = isSuccess ? responseText : null;
      }
      
      return {
        success: isSuccess,
        messageId: messageId,
        provider: 'pay4sms',
        deliveryStatus: isSuccess ? 'sent' : 'failed',
        creditType: credit,
        rawResponse: responseData
      };
    } catch (error) {
      console.error('Pay4SMS Error:', error.message);
      return {
        success: false,
        messageId: null,
        provider: 'pay4sms',
        deliveryStatus: 'failed',
        error: error.message
      };
    }
  }

  async checkPay4SMSDeliveryStatus(messageId) {
    // Check delivery status for Pay4SMS
    // API: http://pay4sms.in/Dlrcheck/
    try {
      const response = await axios.get(
        `${this.config.apiUrl || 'http://pay4sms.in'}/Dlrcheck/`,
        {
          params: {
            token: this.config.apiKey,
            msgid: messageId
          }
        }
      );
      
      // Response format: {"status":"delivered","msgid":"123456","delivered_time":"2025-11-25 10:30:00"}
      const data = response.data;
      
      return {
        messageId,
        status: data.status || data.Status || 'unknown',
        deliveredAt: data.delivered_time || data.DeliveredAt || data.delivered_at,
        provider: 'pay4sms',
        rawResponse: data
      };
    } catch (error) {
      console.error('Pay4SMS DLR Check Error:', error.message);
      return {
        messageId,
        status: 'unknown',
        error: error.message
      };
    }
  }

  async checkPay4SMSCredits(creditType = null) {
    // Check available credits for Pay4SMS
    // API: http://pay4sms.in/Credit-Balance/
    // creditType: 4=OTP, 2=Transactional, 1=Promotional
    try {
      const credit = creditType || this.config.otpCredit || this.config.credit || '4';
      
      const response = await axios.get(
        `${this.config.apiUrl || 'http://pay4sms.in'}/Credit-Balance/`,
        {
          params: {
            token: this.config.apiKey,
            credit: credit
          }
        }
      );
      
      // Response format: {"status":"success","balance":"1000","credit_type":"4"}
      // Or plain text: "1000"
      const data = response.data;
      let balance = 'unknown';
      
      if (typeof data === 'object') {
        balance = data.balance || data.Balance || data.credits;
      } else {
        balance = data.toString().trim();
      }
      
      return {
        success: true,
        credits: balance,
        creditType: credit,
        provider: 'pay4sms',
        rawResponse: data
      };
    } catch (error) {
      console.error('Pay4SMS Credits Check Error:', error.message);
      return {
        success: false,
        credits: 'unknown',
        error: error.message
      };
    }
  }

  async sendBulkSMS(messages) {
    const results = await Promise.allSettled(
      messages.map(msg => this.sendSMS(msg))
    );

    return results.map(result => 
      result.status === 'fulfilled' ? result.value : {
        success: false,
        error: 'Bulk send failed',
        provider: this.config.provider
      }
    );
  }

  async getDeliveryStatus(messageId) {
    // Implementation depends on provider
    switch (this.config.provider) {
      case 'twilio':
        // Implement Twilio delivery status check
        return 'delivered';
      case 'pay4sms':
        return await this.checkPay4SMSDeliveryStatus(messageId);
      default:
        return 'unknown';
    }
  }

  async getCredits() {
    // Get available credits for provider
    switch (this.config.provider) {
      case 'pay4sms':
        return await this.checkPay4SMSCredits();
      default:
        return { credits: 'not_supported', provider: this.config.provider };
    }
  }
}

// SMS Template Manager
export class SMSTemplateManager {
  static templates = {
    appointment_reminder: 'Hi {name}, your appointment with Dr. {doctor} is scheduled for {date} at {time}. Please arrive 15 minutes early.',
    appointment_confirmation: 'Your appointment has been confirmed for {date} at {time} with Dr. {doctor}. Reference: {id}',
    prescription_ready: 'Hi {name}, your prescription is ready for pickup at {pharmacy}. Order ID: {orderId}',
    test_results: 'Your test results are ready. Please log in to your account or visit the clinic to view them.',
    payment_reminder: 'Payment reminder: Your bill of ₹{amount} for {service} is due on {dueDate}.',
    welcome_message: 'Welcome to Mediczy! Your account has been created successfully. Use your email and OTP to login.',
    otp_verification: '{otp} is your One Time Password to login with your My Smart Health Account. Don\'t Share this with anyone.',
    insurance_claim: 'Your insurance claim #{claimId} has been {status}. Amount: ₹{amount}',
    emergency_alert: 'EMERGENCY: Patient {name} requires immediate attention at {location}. Contact: {phone}',
    medication_reminder: 'Reminder: Take your {medication} at {time}. Next dose in {nextDose}.'
  };

  static getTemplate(templateId) {
    return this.templates[templateId] || '';
  }

  static renderTemplate(templateId, variables) {
    let template = this.getTemplate(templateId);
    
    Object.entries(variables).forEach(([key, value]) => {
      template = template.replace(new RegExp(`{${key}}`, 'g'), value);
    });
    
    return template;
  }  static getAllTemplates() {
    return { ...this.templates };
  }

  static addTemplate(id, template) {
    this.templates[id] = template;
  }
}

// Export SMS service instance
export { SMSService };