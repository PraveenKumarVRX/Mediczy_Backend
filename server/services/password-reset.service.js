import { managedFetch as fetch } from '../integrations/transport.js';
import gupshup, { whatsappProvider } from './gupshup-whatsapp.service.js';
import crypto from 'crypto';
import { sendTransactionalEmail } from './welcome-email.service.js';
import OTP from '../models/otp.model.intelligent.js';
import userModel from '../models/user.model.intelligent.js';
import doctorModel from '../models/doctor.model.intelligent.js';
import Hospital from '../models/hospital.model.intelligent.js';
import Nurse from '../models/nurse.model.intelligent.js';
import Pharmacy from '../models/postgres/pharmacy.model.postgres.js';
import Corporate from '../models/postgres/corporate.model.postgres.js';
import { SMSService, SMSTemplateManager } from './sms.service.js';
import emailService from './emailService.js';
import notificationService from './notification.service.js';
import twilio from '../integrations/twilio.js';
import { col, fn, where as sequelizeWhere } from 'sequelize';

const normalizeEmail = (email) =>
  email ? String(email).trim().toLowerCase() : null;

const findAccountByIdentifier = (Model, { email, phone, phoneField }) =>
  Model.findOne({
    where: email
      ? sequelizeWhere(fn('lower', col('email')), normalizeEmail(email))
      : { [phoneField]: phone }
  });

/**
 * Password Reset Service
 * Handles forgot password flow with OTP delivery via Email, SMS, and WhatsApp
 */

class PasswordResetService {
  constructor() {
    // Initialize SMS service
    this.smsConfig = {
      provider: process.env.SMS_PROVIDER || 'twilio',
      apiKey: process.env.SMS_API_KEY || process.env.TWILIO_ACCOUNT_SID,
      apiSecret: process.env.SMS_API_SECRET || process.env.TWILIO_AUTH_TOKEN,
      senderId: process.env.SMS_SENDER_ID || process.env.TWILIO_PHONE_NUMBER || 'MEDICZY'
    };

    if (this.smsConfig.apiKey && this.smsConfig.apiSecret) {
      this.smsService = new SMSService(this.smsConfig);
      console.log('✅ SMS service initialized for password reset');
    } else {
      console.warn('⚠️  SMS service not configured');
    }

    // Initialize Twilio client for WhatsApp
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    
    // Validate that Twilio credentials are real (not placeholder values)
    const isTwilioConfigured = accountSid && authToken 
      && !accountSid.includes('your-') 
      && !accountSid.includes('twilio-')
      && accountSid.length > 10
      && accountSid.startsWith('AC'); // Twilio Account SIDs start with 'AC'
    
    if (isTwilioConfigured) {
      this.twilioClient = twilio(accountSid, authToken);
      this.twilioConfigured = true;
      console.log('✅ Twilio WhatsApp initialized for password reset');
    } else {
      this.twilioClient = null;
      this.twilioConfigured = false;
      console.warn('⚠️  Twilio WhatsApp not configured - using email/SMS fallback for password reset');
    }
  }

  isAccountInactive(account) {
    if (!account) return false;
    const normalizedStatus = String(account.status || '').toLowerCase();
    if (normalizedStatus && normalizedStatus !== 'active') return true;
    if (account.isActive === false) return true;
    return false;
  }

  shouldBlockInactiveDuringPasswordReset() {
    return String(process.env.PASSWORD_RESET_BLOCK_INACTIVE_ACCOUNTS || 'false').toLowerCase() === 'true';
  }

  /**
   * Request password reset with OTP
   * Sends OTP via Email, SMS, and WhatsApp
   */
  async requestPasswordReset({ email, phone, userType = 'user' }) {
    try {
      email = normalizeEmail(email);

      // Find account by email or phone based on userType
      let account;
      let accountType = userType;

      // Get the appropriate model based on userType
      const findAccount = async () => {
        switch (userType) {
          case 'doctor':
            return findAccountByIdentifier(doctorModel, { email, phone, phoneField: 'phone' });

          case 'team':
            return findAccountByIdentifier(userModel, { email, phone, phoneField: 'phoneNumber' });
          
          case 'hospital':
            return findAccountByIdentifier(Hospital, { email, phone, phoneField: 'phoneNumber' });
          
          case 'nurse':
            return findAccountByIdentifier(Nurse, { email, phone, phoneField: 'phoneNumber' });
          
          case 'pharmacy':
            return findAccountByIdentifier(Pharmacy, { email, phone, phoneField: 'phoneNumber' });
          
          case 'corporate':
            return findAccountByIdentifier(Corporate, { email, phone, phoneField: 'phoneNumber' });
          
          case 'user':
          default:
            return findAccountByIdentifier(userModel, { email, phone, phoneField: 'phoneNumber' });
        }
      };

      account = await findAccount();

      // Don't reveal if account exists (security)
      if (!account) {
        return {
          success: true,
          message: 'If an account exists, you will receive OTP verification codes shortly.'
        };
      }

      if (this.shouldBlockInactiveDuringPasswordReset() && this.isAccountInactive(account)) {
        return {
          success: false,
          code: 'ACCOUNT_INACTIVE',
          message: 'This account is inactive. Please contact support or your HR administrator to activate your account before resetting password.',
          nextStep: 'Activate account and retry forgot password.'
        };
      }

      // Generate OTP for password reset
      // IMPORTANT: Key the OTP by the identifier the user used to request (email OR phone),
      // not always email. This ensures the verify lookup matches the storage key.
      const otp = await OTP.generate({
        phone: account.phoneNumber || account.phone,
        email: email ? account.email : undefined,
        purpose: 'password_reset',
        expiryMinutes: 10,
        userId: account.id
      });

      // Send OTP via all available channels
      const deliveryResults = await this.sendOTPToAllChannels(account, otp.code);

      console.log(`✅ Password reset OTP sent to user ${account.id}:`, deliveryResults);

      const responseData = {
        otpId: otp.id,
        expiresAt: otp.expiresAt,
        expiresIn: '10 minutes',
        deliveryChannels: deliveryResults
      };

      return {
        success: true,
        message: 'OTP sent successfully via Email, SMS, and WhatsApp',
        data: responseData
      };
    } catch (error) {
      console.error('Password reset request error:', error);
      throw error;
    }
  }

  /**
   * Send OTP to all channels (Email, WhatsApp)
   * Uses direct delivery by default, n8n webhook as backup if configured
   */
  async sendOTPToAllChannels(account, otpCode) {
    const results = {
      email: { sent: false, error: null },
      sms: { sent: false, error: null },
      whatsapp: { sent: false, error: null }
    };

    const phone = account.phoneNumber || account.phone;
    const email = account.email;

    // Use direct delivery (more reliable)
    await Promise.allSettled([
      // Email delivery
      email && this.sendOTPViaEmail(account, otpCode).then(() => {
        results.email.sent = true;
        console.log(`✅ Email OTP sent to ${email}`);
      }).catch(error => {
        results.email.error = error.message;
        console.error('❌ Email delivery failed:', error.message);
      }),

      // WhatsApp delivery
      phone && this.sendOTPViaWhatsApp(account, otpCode).then(() => {
        results.whatsapp.sent = true;
        console.log(`✅ WhatsApp OTP sent to ${phone}`);
      }).catch(error => {
        results.whatsapp.error = error.message;
        console.error('❌ WhatsApp delivery failed:', error.message);
      })
    ]);

    // Optionally also trigger n8n for logging/analytics (without delivery)
    if (process.env.N8N_WEBHOOK_URL && process.env.USE_N8N_FOR_OTP === 'true') {
      try {
        const webhookEndpoint = `${process.env.N8N_WEBHOOK_URL}/password-reset-otp`;
        const name = account.name || account.firstName || account.hospitalName || account.companyName || 'User';
        
        console.log(`📤 Notifying n8n about OTP delivery to: ${email || phone}`);
        
        // Fire and forget - don't wait for response
        fetch(webhookEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Secret': process.env.N8N_WEBHOOK_SECRET || 'mediczy_n8n_webhook_2025'
          },
          body: JSON.stringify({
            otp: otpCode,
            email: email,
            phone: phone,
            name: name,
            otp_id: `otp_${Date.now()}`,
            userType: account.userType || 'user',
            timestamp: new Date().toISOString(),
            deliveryResults: results  // Include delivery status for logging
          })
        }).catch(err => console.log('n8n notification skipped:', err.message));
      } catch (n8nError) {
        console.log('n8n webhook skipped:', n8nError.message);
      }
    }

    // SMS is not configured
    results.sms.error = 'SMS not configured';

    return results;
  }

  /**
   * Send OTP via Email (fallback)
   */
  async sendOTPViaEmail(account, otpCode) {
    try {
      // Try to get default config from database first
      // Sent through the shared mailer, which is SES-only (EMAIL_PROVIDER defaults to 'ses').
      // This built its own nodemailer transport whose fallback host was smtp.gmail.com, so a
      // password-reset OTP could leave over a different provider -- and a different From domain --
      // than the rest of Mediqzy's mail. That is exactly the message you least want filtered.
      await sendTransactionalEmail({
        to: account.email,
        subject: 'Password Reset OTP - Mediczy',
        html: this.getEmailOTPTemplate(account.name || account.email, otpCode),
        text: this.getEmailOTPTextTemplate(account.name || account.email, otpCode),
        fromName: 'Mediqzy',
      });

      console.log(`✅ Password reset OTP sent to email: ${account.email}`);
    } catch (error) {
      console.error('Email OTP sending failed:', error);
      throw error;
    }
  }

  /**
   * Send OTP via SMS
   */
  async sendOTPViaSMS(account, otpCode) {
    if (!this.smsService || !account.phone) {
      throw new Error('SMS service not configured or phone not available');
    }

    try {
      const smsMessage = `Your Mediczy password reset OTP is: ${otpCode}. Valid for 10 minutes. Do not share this code with anyone.`;

      await this.smsService.sendSMS({
        to: account.phone,
        message: smsMessage,
        templateId: process.env.SMS_PASSWORD_RESET_TEMPLATE_ID
      });

      console.log(`✅ Password reset OTP sent to phone: ${account.phone}`);
    } catch (error) {
      console.error('SMS OTP sending failed:', error);
      throw error;
    }
  }

  /**
   * Send OTP via WhatsApp using approved template
   */
  async sendOTPViaWhatsApp(account, otpCode) {
    if (!account.phone && !account.phoneNumber) {
      throw new Error('Phone not available for WhatsApp');
    }

    try {
      if (whatsappProvider() === 'gupshup') {
        // Authentication (copy-code) template: the code fills both the body ({{1}}) and the
        // copy-code button, so it must be passed twice. See twilio-otp.service.js for details.
        const code = String(otpCode);
        const sent = await gupshup.sendTemplate({ to: account.phone || account.phoneNumber,
          templateId: process.env.GUPSHUP_TEMPLATE_OTP, params: [code, code] });
        return { messageSid: sent.sid, status: sent.status };
      }
      // Check if Twilio client is initialized and configured
      if (!this.twilioClient || !this.twilioConfigured) {
        console.warn('⚠️  Twilio WhatsApp not available for password reset - falling back to Email OTP');
        return await this.sendOTPViaEmail(account, otpCode);
      }

      const phoneNumber = account.phone || account.phoneNumber;
      const whatsappFrom = process.env.TWILIO_WHATSAPP_NUMBER;
      
      if (!whatsappFrom) {
        console.warn('⚠️  TWILIO_WHATSAPP_NUMBER not configured - falling back to Email OTP');
        return await this.sendOTPViaEmail(account, otpCode);
      }

      // Format phone number for WhatsApp
      let formattedPhone = phoneNumber.trim();
      if (!formattedPhone.startsWith('+')) {
        formattedPhone = `+${formattedPhone}`;
      }

      // Send using approved OTP template (HX33ae0014bd63fad4404789d2373b6174)
      const message = await this.twilioClient.messages.create({
        from: whatsappFrom,
        to: `whatsapp:${formattedPhone}`,
        contentSid: 'HX33ae0014bd63fad4404789d2373b6174', // Approved otp_verification template
        contentVariables: JSON.stringify({
          1: otpCode  // OTP code variable for template
        })
      });

      console.log(`✅ Password reset OTP sent to WhatsApp: ${formattedPhone}`);
      console.log(`   Message SID: ${message.sid}, Status: ${message.status}`);
      
      // Return message SID for tracking
      return { messageSid: message.sid, status: message.status };
    } catch (error) {
      console.error(`❌ WhatsApp OTP Twilio error (Code: ${error.code}):`, error.message);
      console.warn('   Falling back to Email OTP...');
      // Fallback to email if WhatsApp fails
      return await this.sendOTPViaEmail(account, otpCode);
    }
  }

  /**
   * Verify OTP and get reset token
   */
  async verifyOTPAndGenerateToken({ email, phone, code, userType = 'user' }) {
    try {
      email = normalizeEmail(email);

      // Verify OTP
      const otpResult = await OTP.verify({
        phone,
        email,
        code,
        purpose: 'password_reset'
      });

      if (!otpResult.success) {
        return {
          success: false,
          message: otpResult.message
        };
      }

      // Find account based on userType
      let account;
      const findAccountByType = async () => {
        switch (userType) {
          case 'doctor':
            return findAccountByIdentifier(doctorModel, { email, phone, phoneField: 'phone' });

          case 'team':
            return findAccountByIdentifier(userModel, { email, phone, phoneField: 'phoneNumber' });
          
          case 'hospital':
            return findAccountByIdentifier(Hospital, { email, phone, phoneField: 'phoneNumber' });
          
          case 'nurse':
            return findAccountByIdentifier(Nurse, { email, phone, phoneField: 'phoneNumber' });
          
          case 'pharmacy':
            return findAccountByIdentifier(Pharmacy, { email, phone, phoneField: 'phoneNumber' });
          
          case 'corporate':
            return findAccountByIdentifier(Corporate, { email, phone, phoneField: 'phoneNumber' });
          
          case 'user':
          default:
            return findAccountByIdentifier(userModel, { email, phone, phoneField: 'phoneNumber' });
        }
      };

      account = await findAccountByType();

      if (!account) {
        return {
          success: false,
          message: 'Account not found'
        };
      }

      if (this.shouldBlockInactiveDuringPasswordReset() && this.isAccountInactive(account)) {
        return {
          success: false,
          code: 'ACCOUNT_INACTIVE',
          message: 'This account is inactive. Please contact support or your HR administrator to activate your account before resetting password.',
          nextStep: 'Activate account and retry forgot password.'
        };
      }

      // Generate password reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
      const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour

      console.log(`🔑 Generating reset token for ${userType} account ID: ${account.id}`);
      console.log(`   Reset token (first 16 chars): ${resetToken.substring(0, 16)}...`);
      console.log(`   Reset token hash (first 16 chars): ${resetTokenHash.substring(0, 16)}...`);
      console.log(`   Expiry: ${resetTokenExpiry}`);

      // Get the appropriate model for updating
      const getModelByType = () => {
        switch (userType) {
          case 'doctor': return doctorModel;
          case 'team': return userModel;
          case 'hospital': return Hospital;
          case 'nurse': return Nurse;
          case 'pharmacy': return Pharmacy;
          case 'corporate': return Corporate;
          case 'user':
          default: return userModel;
        }
      };

      const Model = getModelByType();
      await Model.update(
        {
          passwordResetToken: resetTokenHash,
          passwordResetExpires: resetTokenExpiry
        },
        { where: { id: account.id } }
      );

      console.log(`✅ Reset token saved to database for account ID: ${account.id}`);

      return {
        success: true,
        message: 'OTP verified successfully',
        data: {
          resetToken,
          expiresAt: resetTokenExpiry,
          accountId: account.id
        }
      };
    } catch (error) {
      console.error('OTP verification error:', error);
      throw error;
    }
  }

  /**
   * Reset password with token
   */
  async resetPassword({ resetToken, newPassword, userType = 'user' }) {
    try {
      // Validate inputs
      if (!resetToken || typeof resetToken !== 'string') {
        console.warn('⚠️ Password reset: Invalid reset token type or empty');
        return {
          success: false,
          message: 'Invalid reset token provided'
        };
      }

      if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
        console.warn('⚠️ Password reset: Invalid password (too short or wrong type)');
        return {
          success: false,
          message: 'Invalid password provided'
        };
      }

      // Hash the token
      const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
      console.log(`🔍 Password reset attempt for ${userType}:`);
      console.log(`   Token (first 16 chars): ${resetToken.substring(0, 16)}...`);
      console.log(`   Token hash (first 16 chars): ${resetTokenHash.substring(0, 16)}...`);

      // Get the appropriate model based on userType
      const getModelByType = () => {
        switch (userType) {
          case 'doctor': return doctorModel;
          case 'team': return userModel;
          case 'hospital': return Hospital;
          case 'nurse': return Nurse;
          case 'pharmacy': return Pharmacy;
          case 'corporate': return Corporate;
          case 'user':
          default: return userModel;
        }
      };

      const Model = getModelByType();

      // Find account with valid token
      let account = await Model.findOne({
        where: {
          passwordResetToken: resetTokenHash
        }
      });

      if (!account) {
        console.warn(`❌ Password reset: No account found with matching token for ${userType}`);
        return {
          success: false,
          message: 'Invalid or expired reset token'
        };
      }

      if (this.shouldBlockInactiveDuringPasswordReset() && this.isAccountInactive(account)) {
        return {
          success: false,
          code: 'ACCOUNT_INACTIVE',
          message: 'This account is inactive. Please contact support or your HR administrator to activate your account before logging in with a new password.'
        };
      }

      console.log(`✓ Account found: ID ${account.id}, Email: ${account.email || account.name}`);

      // Check if token has expired
      if (!account.passwordResetExpires || new Date() > new Date(account.passwordResetExpires)) {
        console.warn(`❌ Password reset: Token expired for account ID ${account.id}`);
        console.warn(`   Expiry: ${account.passwordResetExpires}, Current: ${new Date()}`);
        return {
          success: false,
          message: 'Reset token has expired. Please request a new password reset.'
        };
      }

      console.log(`✓ Token is valid and not expired`);

      // Update password directly on the instance (will trigger beforeUpdate hook)
      account.password = newPassword;
      account.passwordResetToken = null;
      account.passwordResetExpires = null;
      await account.save();

      console.log(`✅ Password reset successful for ${userType} ID: ${account.id}`);

      return {
        success: true,
        message: 'Password reset successfully'
      };
    } catch (error) {
      console.error('Password reset error:', error);
      throw error;
    }
  }

  /**
   * Email OTP HTML template
   */
  getEmailOTPTemplate(name, otpCode) {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Reset OTP</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td bgcolor="#667eea" style="background-color: #667eea; background-image: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px;">🔐 Password Reset</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">Mediczy Healthcare Platform</p>
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Hello ${name},
              </p>
              
              <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                We received a request to reset your password. Use the following One-Time Password (OTP) to complete your password reset:
              </p>
              
              <!-- OTP Box -->
              <div style="background-color: #667eea; background-image: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 10px; padding: 30px; text-align: center; margin: 30px 0;">
                <p style="color: rgba(255,255,255,0.9); font-size: 14px; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 1px;">Your OTP Code</p>
                <p style="color: white; font-size: 36px; font-weight: bold; letter-spacing: 8px; margin: 0; font-family: 'Courier New', monospace;">
                  ${otpCode}
                </p>
              </div>
              
              <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 30px 0; border-radius: 5px;">
                <p style="color: #856404; margin: 0; font-size: 14px;">
                  ⚠️ <strong>Important:</strong> This OTP is valid for 10 minutes only.
                </p>
              </div>
              
              <div style="background: #f8f9fa; border-radius: 5px; padding: 20px; margin: 20px 0;">
                <p style="color: #495057; font-size: 14px; margin: 0 0 10px 0; font-weight: bold;">Security Tips:</p>
                <ul style="color: #6c757d; font-size: 14px; line-height: 1.8; margin: 0; padding-left: 20px;">
                  <li>Never share your OTP with anyone</li>
                  <li>Mediczy staff will never ask for your OTP</li>
                  <li>If you didn't request this, please ignore this email</li>
                  <li>Consider enabling two-factor authentication</li>
                </ul>
              </div>
              
              <p style="color: #6c757d; font-size: 14px; line-height: 1.6; margin: 30px 0 0 0;">
                Best regards,<br>
                <strong style="color: #667eea;">Mediczy Team</strong>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #dee2e6;">
              <p style="color: #6c757d; font-size: 12px; margin: 0; line-height: 1.6;">
                This is an automated message from Mediczy Healthcare Platform.<br>
                Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
  }

  /**
   * Email OTP plain text template
   */
  getEmailOTPTextTemplate(name, otpCode) {
    return `
Password Reset OTP - Mediczy

Hello ${name},

We received a request to reset your password. Use the following One-Time Password (OTP) to complete your password reset:

Your OTP: ${otpCode}

⚠️ IMPORTANT: This OTP is valid for 10 minutes only.

Security Tips:
- Never share your OTP with anyone
- Mediczy staff will never ask for your OTP
- If you didn't request this, please ignore this email
- Consider enabling two-factor authentication

Best regards,
Mediczy Team

---
This is an automated message from Mediczy Healthcare Platform.
Please do not reply to this email.
    `;
  }
}

export default new PasswordResetService();
