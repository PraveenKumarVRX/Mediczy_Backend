import gupshup, { whatsappProvider } from './gupshup-whatsapp.service.js';
import axios from '../integrations/axios.js';
import nodemailer from '../integrations/nodemailer.js';

// Twilio error codes that are permanent (no point retrying)
const NON_RETRIABLE_CODES = new Set([
  63024, // Recipient's number does not have WhatsApp
  63016, // Outside 24h session window (freeform blocked)
  21211, // Invalid 'To' phone number
  21614, // 'To' number is not a valid mobile number
  21612, // Cannot route to this number
  21610, // Attempt to send to unsubscribed recipient
  21408  // Permission to send an SMS has not been enabled
]);

/**
 * Direct Twilio OTP Service
 * Sends WhatsApp OTP messages directly to Twilio API (bypassing n8n)
 * Includes retry logic and admin failure alerts.
 */

class TwilioOTPService {
  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+918098998998';
    this.otpTemplateSid = process.env.TWILIO_OTP_TEMPLATE_SID || null;
    this.alertEmail = process.env.OTP_FAILURE_ALERT_EMAIL || 'sk@mysmarthealth.in';
    this.maxRetries = 2; // up to 3 total attempts
    
    if (whatsappProvider() === 'gupshup') return;

    if (!this.accountSid || !this.authToken) {
      if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
        this.disabled = true;
        console.warn('⚠️  Twilio OTP disabled — credentials not configured');
        return;
      }
      throw new Error('❌ Twilio credentials not configured in .env');
    }

    this.apiUrl = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    
    // Create Basic Auth header
    this.authHeader = {
      Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    };

    console.log('✅ Direct Twilio OTP Service initialized');
  }

  /**
   * Build Twilio message params
   */
  _buildParams(formattedPhone, otp, messageText) {
    if (this.otpTemplateSid) {
      return new URLSearchParams({
        From: this.whatsappNumber,
        To: `whatsapp:${formattedPhone}`,
        ContentSid: this.otpTemplateSid,
        ContentVariables: JSON.stringify({ '1': otp.toString() })
      });
    }
    return new URLSearchParams({
      From: this.whatsappNumber,
      To: `whatsapp:${formattedPhone}`,
      Body: messageText
    });
  }

  /**
   * Send failure alert email to admin
   */
  async _sendFailureAlert({ phone, purpose, error, attempts }) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: false,
        auth: {
          user: (process.env.SMTP_USER || '').trim(),
          pass: (process.env.SMTP_PASSWORD || process.env.SMTP_PASS || '').trim()
        },
        tls: { rejectUnauthorized: false }
      });

      const maskedPhone = phone ? phone.replace(/(\+?\d{2})\d{6}(\d{4})/, '$1******$2') : 'unknown';
      const now = new Date().toISOString();

      await transporter.sendMail({
        from: `"Mediczy System Alert" <${process.env.SMTP_USER || 'noreply@mysmarthealth.in'}>`,
        to: this.alertEmail,
        subject: `🚨 WhatsApp OTP Delivery Failed — ${purpose || 'verification'} (${now.slice(0, 10)})`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e0e0e0;border-radius:8px;">
            <h2 style="color:#d32f2f;margin-top:0;">⚠️ WhatsApp OTP Delivery Failure</h2>
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr><td style="padding:8px;color:#666;width:40%;">Time (UTC)</td><td style="padding:8px;font-weight:bold;">${now}</td></tr>
              <tr style="background:#f9f9f9;"><td style="padding:8px;color:#666;">Phone (masked)</td><td style="padding:8px;font-weight:bold;">${maskedPhone}</td></tr>
              <tr><td style="padding:8px;color:#666;">Purpose</td><td style="padding:8px;font-weight:bold;">${purpose || 'verification'}</td></tr>
              <tr style="background:#f9f9f9;"><td style="padding:8px;color:#666;">Attempts made</td><td style="padding:8px;font-weight:bold;">${attempts}</td></tr>
              <tr><td style="padding:8px;color:#666;">Error</td><td style="padding:8px;color:#d32f2f;font-weight:bold;">${error}</td></tr>
              <tr style="background:#f9f9f9;"><td style="padding:8px;color:#666;">Twilio Number</td><td style="padding:8px;">${this.whatsappNumber}</td></tr>
              <tr><td style="padding:8px;color:#666;">Template SID</td><td style="padding:8px;">${this.otpTemplateSid || 'none (freeform)'}</td></tr>
            </table>
            <hr style="margin:20px 0;border:none;border-top:1px solid #eee;">
            <p style="color:#888;font-size:12px;margin:0;">This is an automated alert from the Mediczy OTP system. Please check Twilio dashboard for more details.</p>
          </div>
        `,
        text: `WhatsApp OTP Delivery Failure\n\nTime: ${now}\nPhone: ${maskedPhone}\nPurpose: ${purpose}\nAttempts: ${attempts}\nError: ${error}`
      });

      console.log(`📧 OTP failure alert sent to ${this.alertEmail}`);
    } catch (alertErr) {
      console.error('❌ Failed to send OTP failure alert email:', alertErr.message);
    }
  }

  /**
   * Send WhatsApp OTP message directly to Twilio
   * Retries up to 2 times on transient errors.
   * Sends alert email to admin on permanent failure.
   *
   * @param {Object} params
   * @param {string} params.phone - Phone number
   * @param {string} params.otp - 6-digit OTP code
   * @param {string} params.name - User name (optional)
   * @param {string} params.purpose - signup | login | password_reset | verification
   * @returns {Promise<Object>} Delivery result
   */
  async sendWhatsAppOTP({ phone, otp, name = 'User', purpose = 'verification' }) {
    if (!phone) {
      return { success: false, error: 'Phone number is required', message: 'Phone number is required' };
    }
    if (!otp || otp.toString().length !== 6) {
      return { success: false, error: 'OTP must be exactly 6 digits', message: 'Invalid OTP' };
    }

    if (whatsappProvider() === 'gupshup') {
      try {
        // The approved OTP template is a WhatsApp authentication (copy-code) template: the code
        // appears in BOTH the body ({{1}}) and the copy-code button, so Gupshup's positional
        // params array must carry it twice. One param leaves the body placeholder blank; a
        // non-code second param (e.g. a purpose label) fails Meta validation with error 132018.
        const code = String(otp);
        const sent = await gupshup.sendTemplate({ to: phone, templateId: process.env.GUPSHUP_TEMPLATE_OTP, params: [code, code] });
        return { success: true, message: 'WhatsApp OTP submitted', sid: sent.sid, status: sent.status,
          phone: sent.to.replace('whatsapp:', ''), attempts: 1, submittedAt: new Date().toISOString() };
      } catch (error) {
        return { success: false, error: error.code || 'GUPSHUP_NOT_CONFIGURED', message: error.message, attempts: 1 };
      }
    }
    const formattedPhone = this.formatPhoneNumber(phone);

    // Build fallback freeform text (used when no template SID)
    let messageText;
    switch (purpose) {
      case 'signup':
        messageText = `Welcome to Mediczy! 🎉\n\nYour verification code is: *${otp}*\n\nThis code will expire in 10 minutes.\n\n*Never share this code with anyone.*`;
        break;
      case 'password_reset':
        messageText = `Password Reset Request\n\nYour reset code is: *${otp}*\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this, please ignore this message.`;
        break;
      default:
        messageText = `Your Mediczy OTP is: *${otp}*\n\nEnter this code to verify your identity.\nDo not share this code with anyone.\n\nCode expires in 5 minutes.`;
    }

    const bodyParams = this._buildParams(formattedPhone, otp, messageText);

    let lastError = null;
    let attempt = 0;

    while (attempt <= this.maxRetries) {
      attempt++;
      try {
        console.log(`📤 WhatsApp OTP attempt ${attempt}/${this.maxRetries + 1}:`, {
          to: formattedPhone,
          purpose,
          timestamp: new Date().toISOString()
        });

        const response = await axios.post(this.apiUrl, bodyParams.toString(), {
          headers: this.authHeader,
          timeout: 15000
        });

        const { sid, status, error_code } = response.data;

        if (error_code) {
          const err = new Error(`Twilio error code: ${error_code}`);
          err.twilioCode = error_code;
          throw err;
        }

        console.log(`✅ WhatsApp OTP sent (attempt ${attempt}):`, { sid, status, to: formattedPhone });

        return {
          success: true,
          message: 'WhatsApp OTP sent successfully',
          sid,
          status,
          phone: formattedPhone,
          attempts: attempt,
          deliveredAt: new Date().toISOString()
        };

      } catch (error) {
        lastError = error;
        const twilioCode = error.twilioCode || error.response?.data?.code;

        console.error(`❌ WhatsApp OTP attempt ${attempt} failed:`, {
          error: error.message,
          twilioCode,
          phone: formattedPhone
        });

        // Don't retry permanent errors (wrong number, blocked, unsubscribed, etc.)
        if (twilioCode && NON_RETRIABLE_CODES.has(Number(twilioCode))) {
          console.warn(`⚠️  Non-retriable Twilio error ${twilioCode} — skipping retries`);
          break;
        }

        // Wait before next retry: 1s, then 3s (exponential backoff)
        if (attempt <= this.maxRetries) {
          const delay = attempt === 1 ? 1000 : 3000;
          console.log(`⏳ Retrying in ${delay / 1000}s...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All attempts exhausted — send admin alert asynchronously (don't block caller)
    this._sendFailureAlert({
      phone: formattedPhone,
      purpose,
      error: lastError?.message || 'Unknown error',
      attempts: attempt
    }).catch(() => {});

    return {
      success: false,
      error: lastError?.message || 'Unknown error',
      message: 'Failed to send WhatsApp OTP after retries',
      attempts: attempt,
      statusCode: lastError?.response?.status
    };
  }

  /**
   * Format phone number to E.164 international format
   * @param {string} phone - Phone number
   * @returns {string} Formatted phone number
   */
  formatPhoneNumber(phone) {
    // Remove all non-digit characters
    const cleaned = phone.replace(/\D/g, '');

    // If it's 10 digits (Indian number without country code), add +91
    if (cleaned.length === 10) {
      return `+91${cleaned}`;
    }

    // If it already starts with 91 (without +), add +
    if (cleaned.length === 12 && cleaned.startsWith('91')) {
      return `+${cleaned}`;
    }

    // If it already starts with +91, return as is
    if (phone.startsWith('+91') || phone.startsWith('+')) {
      return phone;
    }

    // Default: assume it needs +91 prefix
    return `+91${cleaned}`;
  }

  /**
   * Check OTP delivery status via Twilio
   * @param {string} messageSid - Twilio Message SID
   * @returns {Promise<Object>} Message status
   */
  async getOTPStatus(messageSid) {
    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages/${messageSid}.json`;
      
      const response = await axios.get(url, {
        headers: this.authHeader,
        timeout: 10000
      });

      return {
        success: true,
        status: response.data.status,
        timestamp: response.data.date_sent,
        error_code: response.data.error_code
      };

    } catch (error) {
      console.error('❌ Failed to check OTP status:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Send bulk OTPs to multiple phone numbers
   * @param {Array} recipients - Array of {phone, otp, name, purpose}
   * @returns {Promise<Array>} Results for each recipient
   */
  async sendBulkWhatsAppOTPs(recipients) {
    console.log(`📤 Sending ${recipients.length} WhatsApp OTPs via Twilio`);

    const results = await Promise.all(
      recipients.map(recipient => this.sendWhatsAppOTP(recipient))
    );

    const successCount = results.filter(r => r.success).length;
    console.log(`✅ Bulk dispatch complete: ${successCount}/${recipients.length} successful`);

    return results;
  }
}

// Export singleton instance
export default new TwilioOTPService();
