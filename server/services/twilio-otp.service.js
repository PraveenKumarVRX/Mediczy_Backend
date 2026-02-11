import axios from 'axios';

/**
 * Direct Twilio OTP Service
 * Sends WhatsApp OTP messages directly to Twilio API (bypassing n8n)
 * This is more reliable and faster than going through n8n routes
 */

class TwilioOTPService {
  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+918098998998';
    
    if (!this.accountSid || !this.authToken) {
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
   * Send WhatsApp OTP message directly to Twilio
   * @param {Object} params - OTP parameters
   * @param {string} params.phone - Phone number (with +91 prefix for India)
   * @param {string} params.otp - OTP code (6 digits)
   * @param {string} params.name - User's name (optional)
   * @param {string} params.purpose - Purpose of OTP (login, signup, password_reset)
   * @returns {Promise<Object>} Delivery result with Twilio SID
   */
  async sendWhatsAppOTP({ phone, otp, name = 'User', purpose = 'verification' }) {
    try {
      if (!phone) {
        throw new Error('Phone number is required');
      }

      if (!otp || otp.toString().length !== 6) {
        throw new Error('OTP must be exactly 6 digits');
      }

      // Format phone number
      const formattedPhone = this.formatPhoneNumber(phone);
      
      // Build message text based on purpose
      let messageText;
      switch (purpose) {
        case 'signup':
          messageText = `Welcome to Mediczy! 🎉\n\nYour verification code is: *${otp}*\n\nThis code will expire in 10 minutes.\n\n*Never share this code with anyone.*`;
          break;
        case 'password_reset':
          messageText = `Password Reset Request\n\nYour reset code is: *${otp}*\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this, please ignore this message.`;
          break;
        case 'login':
        default:
          messageText = `Your Mediczy OTP is: *${otp}*\n\nEnter this code to verify your identity.\nDo not share this code with anyone.\n\nCode expires in 5 minutes.`;
          break;
      }

      // URL-encoded form data
      const bodyParams = new URLSearchParams({
        From: this.whatsappNumber,
        To: `whatsapp:${formattedPhone}`,
        Body: messageText
      });

      console.log(`📤 Sending WhatsApp OTP via Twilio:`, {
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
        throw new Error(`Twilio error: ${error_code}`);
      }

      console.log(`✅ WhatsApp OTP sent successfully:`, {
        sid,
        status,
        to: formattedPhone,
        timestamp: new Date().toISOString()
      });

      return {
        success: true,
        message: 'WhatsApp OTP sent successfully',
        sid,
        status,
        phone: formattedPhone,
        deliveredAt: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Twilio OTP delivery failed:', {
        error: error.message,
        phone,
        status: error.response?.status,
        data: error.response?.data
      });

      return {
        success: false,
        error: error.message,
        message: 'Failed to send WhatsApp OTP',
        statusCode: error.response?.status
      };
    }
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
