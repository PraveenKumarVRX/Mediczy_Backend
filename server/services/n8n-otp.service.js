import axios from '../integrations/axios.js';

/**
 * n8n OTP Service
 * Routes all OTP delivery through n8n workflows
 * Uses the existing Password Reset OTP workflow which handles both Email and WhatsApp
 */

const N8N_BASE_URL = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook';
const N8N_TIMEOUT = 30000; // 30 seconds

class N8nOTPService {
  constructor() {
    // Use the existing working password-reset-otp webhook
    // This workflow already handles both Email and WhatsApp delivery
    this.webhookUrl = `${N8N_BASE_URL}/password-reset-otp`;
    console.log('✅ n8n OTP Service initialized, webhook:', this.webhookUrl);
  }

  /**
   * Send OTP via n8n workflow
   * @param {Object} params - OTP parameters
   * @param {string} params.email - Email address (optional)
   * @param {string} params.phone - Phone number (optional)
   * @param {string} params.otp - OTP code
   * @param {string} params.name - User's name
   * @param {string} params.purpose - OTP purpose (login_otp, signup_verification, password_reset)
   * @param {string} params.channel - Delivery channel: 'email', 'whatsapp', or 'both'
   * @param {number} params.expiryMinutes - OTP expiry in minutes
   * @returns {Promise<Object>} Delivery result
   */
  async sendOTP({ email, phone, otp, name = 'User', purpose = 'verification', channel = 'both', expiryMinutes = 10 }) {
    try {
      console.log(`📤 Sending OTP via n8n: channel=${channel}, purpose=${purpose}`);
      
      const payload = {
        email,
        phone,
        otp,
        name,
        purpose,
        channel,
        expiryMinutes,
        timestamp: new Date().toISOString()
      };

      const response = await axios.post(this.webhookUrl, payload, {
        timeout: N8N_TIMEOUT,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log(`✅ n8n OTP delivery response:`, response.data);

      return {
        success: true,
        message: 'OTP sent via n8n',
        data: response.data
      };
    } catch (error) {
      console.error('❌ n8n OTP delivery failed:', error.message);
      
      // Return failure but don't throw - allow fallback to direct delivery
      return {
        success: false,
        error: error.message,
        message: 'n8n delivery failed'
      };
    }
  }

  /**
   * Send OTP via Email only (through n8n)
   */
  async sendEmailOTP({ email, otp, name = 'User', purpose = 'verification', expiryMinutes = 10 }) {
    return this.sendOTP({
      email,
      otp,
      name,
      purpose,
      channel: 'email',
      expiryMinutes
    });
  }

  /**
   * Send OTP via WhatsApp only (through n8n)
   */
  async sendWhatsAppOTP({ phone, otp, name = 'User', purpose = 'verification', expiryMinutes = 5 }) {
    return this.sendOTP({
      phone,
      otp,
      name,
      purpose,
      channel: 'whatsapp',
      expiryMinutes
    });
  }

  /**
   * Send OTP via both Email and WhatsApp (through n8n)
   */
  async sendBothOTP({ email, phone, otp, name = 'User', purpose = 'verification', expiryMinutes = 10 }) {
    return this.sendOTP({
      email,
      phone,
      otp,
      name,
      purpose,
      channel: 'both',
      expiryMinutes
    });
  }

  /**
   * Check if n8n webhook is available
   */
  async healthCheck() {
    try {
      // Just check if n8n is responding (we can't GET webhooks, but we can try a test)
      const response = await axios.get(`${N8N_BASE_URL.replace('/webhook', '')}/healthz`, {
        timeout: 5000
      });
      return { available: true, status: response.status };
    } catch (error) {
      return { available: false, error: error.message };
    }
  }
}

// Export singleton instance
const n8nOTPService = new N8nOTPService();
export default n8nOTPService;
