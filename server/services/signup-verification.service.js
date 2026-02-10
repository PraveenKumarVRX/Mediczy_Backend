import OTP from '../models/otp.model.intelligent.js';
import emailService from './emailService.js';
import twilio from 'twilio';
import n8nOTPService from './n8n-otp.service.js';

/**
 * Signup Verification Service
 * Handles email and WhatsApp OTP verification during user (patient) signup
 * Routes through n8n with fallback to direct delivery
 */

class SignupVerificationService {
  constructor() {
    // Initialize Twilio client for WhatsApp (fallback)
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    
    // Check if Twilio credentials are real (not placeholders)
    const isTwilioConfigured = accountSid && authToken 
      && !accountSid.includes('your-') 
      && !accountSid.includes('twilio-')
      && accountSid.length > 10;
    
    if (isTwilioConfigured) {
      this.twilioClient = twilio(accountSid, authToken);
      this.twilioConfigured = true;
      console.log('✅ Twilio WhatsApp initialized for signup verification (fallback)');
    } else {
      this.twilioClient = null;
      this.twilioConfigured = false;
      console.warn('⚠️  Twilio WhatsApp not configured for signup verification - using email fallback');
    }
    
    // Flag to use n8n for OTP delivery
    this.useN8n = process.env.USE_N8N_OTP !== 'false'; // Default to true
    console.log(`✅ Signup Verification Service: n8n delivery ${this.useN8n ? 'ENABLED' : 'DISABLED'}`);
  }

  /**
   * Send OTP for signup verification
   * Sends OTP via Email and WhatsApp
   */
  async sendSignupOTP({ email, phoneNumber, firstName = 'User' }) {
    try {
      const includeOtp = process.env.NODE_ENV === 'development' || process.env.OTP_DEBUG_RESPONSE === 'true';
      // Generate OTP for signup verification
      const otp = await OTP.generate({
        email,
        phone: phoneNumber,
        purpose: 'signup_verification',
        expiryMinutes: 10
      });

      console.log(`📤 Sending signup verification OTP to: ${email}, ${phoneNumber}`);

      // Send OTP via all available channels
      const deliveryResults = await this.sendOTPToAllChannels({
        email,
        phoneNumber,
        firstName
      }, otp.code);

      console.log(`✅ Signup verification OTP sent:`, deliveryResults);

      const responseData = {
        otpId: otp.id,
        expiresAt: otp.expiresAt,
        expiresIn: '10 minutes',
        deliveryChannels: deliveryResults
      };

      if (includeOtp) {
        responseData.otp = otp.code;
      }

      return {
        success: true,
        message: 'OTP sent successfully via Email and WhatsApp',
        data: responseData
      };
    } catch (error) {
      console.error('Signup verification OTP error:', error);
      throw error;
    }
  }

  /**
   * Verify OTP for signup
   */
  async verifySignupOTP({ email, phoneNumber, code }) {
    try {
      const verifyResult = await OTP.verify({
        email,
        phone: phoneNumber,
        code,
        purpose: 'signup_verification'
      });

      return verifyResult;
    } catch (error) {
      console.error('Signup OTP verification error:', error);
      throw error;
    }
  }

  /**
   * Send OTP to all channels (Email, WhatsApp)
   * Routes through n8n with fallback to direct delivery
   */
  async sendOTPToAllChannels(account, otpCode) {
    const results = {
      email: { sent: false, error: null },
      whatsapp: { sent: false, error: null },
      viaN8n: false
    };

    const { email, phoneNumber, firstName } = account;

    // Try n8n delivery first if enabled
    if (this.useN8n) {
      try {
        console.log('📤 Attempting OTP delivery via n8n...');
        const n8nResult = await n8nOTPService.sendBothOTP({
          email,
          phone: phoneNumber,
          otp: otpCode,
          name: firstName || 'User',
          purpose: 'signup_verification',
          expiryMinutes: 10
        });

        if (n8nResult.success) {
          results.email.sent = true;
          results.whatsapp.sent = true;
          results.viaN8n = true;
          console.log('✅ OTP delivered via n8n successfully');
          return results;
        } else {
          console.warn('⚠️  n8n delivery failed, falling back to direct delivery:', n8nResult.error);
        }
      } catch (n8nError) {
        console.warn('⚠️  n8n delivery error, falling back to direct delivery:', n8nError.message);
      }
    }

    // Fallback to direct delivery
    console.log('📤 Using direct delivery (fallback)...');
    await Promise.allSettled([
      // Email delivery
      email && this.sendOTPViaEmail({ email, firstName }, otpCode).then(() => {
        results.email.sent = true;
        console.log(`✅ Email verification OTP sent to ${email}`);
      }).catch(error => {
        results.email.error = error.message;
        console.error('❌ Email delivery failed:', error.message);
      }),

      // WhatsApp delivery
      phoneNumber && this.sendOTPViaWhatsApp({ phoneNumber, firstName }, otpCode).then(() => {
        results.whatsapp.sent = true;
        console.log(`✅ WhatsApp verification OTP sent to ${phoneNumber}`);
      }).catch(error => {
        results.whatsapp.error = error.message;
        console.error('❌ WhatsApp delivery failed:', error.message);
      })
    ]);

    return results;
  }

  /**
   * Send OTP via Email
   */
  async sendOTPViaEmail(account, otpCode) {
    try {
      // Try to get default config from database first
      let transporter, fromEmail, fromName;
      
      try {
        const defaultConfig = await emailService.getDefaultConfig();
        if (defaultConfig) {
          transporter = await emailService.getTransporter(defaultConfig);
          fromEmail = defaultConfig.fromEmail;
          fromName = defaultConfig.fromName;
        }
      } catch (dbError) {
        console.log('No database email config, using environment fallback');
      }

      // Fallback to environment variables if no database config
      if (!transporter) {
        const nodemailer = (await import('nodemailer')).default;
        const port = parseInt(process.env.SMTP_PORT) || 587;
        const smtpConfig = {
          host: process.env.SMTP_HOST || 'smtppro.zoho.in',
          port: port,
          secure: port === 465,
          auth: {
            user: (process.env.SMTP_USER || process.env.SMTP_FROM || '').trim(),
            pass: (process.env.SMTP_PASSWORD || process.env.SMTP_PASS || '').trim()
          }
        };

        transporter = nodemailer.createTransport(smtpConfig);
        fromEmail = smtpConfig.auth.user || 'support@mediqzy.com';
        fromName = 'Mediqzy';
      }

      const firstName = account.firstName || 'User';
      const email = account.email;

      // Professional HTML email template
      const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; text-align: center;">
      <h1 style="color: white; margin: 0;">✉️ Verify Your Email</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Welcome to Mediqzy Healthcare Platform</p>
    </div>
    <div style="padding: 40px;">
      <p style="font-size: 16px; color: #333;">Hello ${firstName},</p>
      <p style="font-size: 16px; color: #555;">Thank you for signing up with Mediqzy! Please use the OTP below to verify your email address:</p>
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 10px; padding: 30px; text-align: center; margin: 20px 0;">
        <p style="color: white; font-size: 36px; font-weight: bold; letter-spacing: 8px; margin: 0;">${otpCode}</p>
      </div>
      <p style="color: #856404; background: #fff3cd; padding: 15px; border-radius: 5px; font-size: 14px;">
        ⚠️ This OTP is valid for <strong>10 minutes</strong> only. Do not share this code with anyone.
      </p>
      <p style="color: #6c757d; font-size: 14px; margin-top: 30px;">
        If you didn't request this verification, please ignore this email.
      </p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
      <p style="color: #6c757d; font-size: 12px;">
        Best regards,<br>
        <strong>Mediqzy Team</strong><br>
        Your Health, Our Priority
      </p>
    </div>
  </div>
</body>
</html>`;

      const mailOptions = {
        from: `"${fromName || 'Mediqzy'}" <${fromEmail}>`,
        to: email,
        subject: '✉️ Verify Your Email - Mediqzy Registration',
        html: htmlContent,
        text: `Hello ${firstName},\n\nYour Mediqzy registration OTP is: ${otpCode}\n\nThis OTP is valid for 10 minutes.\n\nBest regards,\nMediqzy Team`
      };

      await transporter.sendMail(mailOptions);
      console.log(`📧 Signup email OTP sent to ${email}`);
      
    } catch (error) {
      console.error('Signup email OTP error:', error);
      throw error;
    }
  }

  /**
   * Send OTP via WhatsApp using Twilio
   * Falls back to Email if Twilio is not configured
   */
  async sendOTPViaWhatsApp(account, otpCode) {
    // If Twilio is not configured, fallback to email
    if (!this.twilioClient || !this.twilioConfigured) {
      console.warn('⚠️  Twilio WhatsApp not available - falling back to Email OTP');
      return await this.sendOTPViaEmail(account, otpCode);
    }

    try {
      const phoneNumber = account.phoneNumber;
      // Format phone number for WhatsApp
      let formattedPhone = phoneNumber.toString().replace(/[^0-9]/g, '');
      if (!formattedPhone.startsWith('91') && formattedPhone.length === 10) {
        formattedPhone = '91' + formattedPhone;
      }

      const whatsappFrom = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+918098998998';
      const whatsappTo = `whatsapp:+${formattedPhone}`;

      // Use the OTP verification template
      const templateSid = process.env.TWILIO_OTP_TEMPLATE_SID || 'HX33ae0014bd63fad4404789d2373b6174';

      const message = await this.twilioClient.messages.create({
        from: whatsappFrom,
        to: whatsappTo,
        contentSid: templateSid,
        contentVariables: JSON.stringify({
          '1': otpCode
        })
      });

      console.log(`📱 ✅ Signup WhatsApp OTP sent to ${whatsappTo}, SID: ${message.sid}, Status: ${message.status}`);
      
    } catch (error) {
      console.error('❌ Signup WhatsApp OTP error:', error);
      console.warn('⚠️  WhatsApp delivery failed - falling back to Email OTP');
      // Fallback to email if Twilio fails
      return await this.sendOTPViaEmail(account, otpCode);
    }
  }
}

// Export singleton instance
const signupVerificationService = new SignupVerificationService();
export default signupVerificationService;
