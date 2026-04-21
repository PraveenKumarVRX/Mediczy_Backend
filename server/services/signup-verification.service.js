import OTP from '../models/otp.model.intelligent.js';
import emailService from './emailService.js';
import twilio from 'twilio';
import n8nOTPService from './n8n-otp.service.js';
import twilioOTPService from './twilio-otp.service.js';

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
   * Routes through direct Twilio with fallback to n8n and email
   */
  async sendOTPToAllChannels(account, otpCode) {
    const results = {
      email: { sent: false, error: null },
      whatsapp: { sent: false, error: null },
      viaDirectTwilio: false,
      viaN8n: false
    };

    const { email, phoneNumber, firstName } = account;

    // Try direct Twilio delivery FIRST for WhatsApp (most reliable)
    if (phoneNumber) {
      try {
        console.log('📤 Attempting WhatsApp OTP delivery via Direct Twilio...');
        const twilioResult = await twilioOTPService.sendWhatsAppOTP({
          phone: phoneNumber,
          otp: otpCode,
          name: firstName || 'User',
          purpose: 'signup'
        });

        if (twilioResult.success) {
          results.whatsapp.sent = true;
          results.viaDirectTwilio = true;
          console.log('✅ WhatsApp OTP delivered via Direct Twilio successfully:', twilioResult.sid);
        } else {
          console.warn('⚠️  Direct Twilio delivery failed, falling back to n8n:', twilioResult.error);
        }
      } catch (twilioError) {
        console.warn('⚠️  Direct Twilio delivery error:', twilioError.message);
      }
    }

    // Try n8n delivery if Direct Twilio failed
    if (!results.whatsapp.sent && this.useN8n && phoneNumber) {
      try {
        console.log('📤 Attempting OTP delivery via n8n (fallback)...');
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
          console.log('✅ OTP delivered via n8n (fallback) successfully');
          return results;
        } else {
          console.warn('⚠️  n8n delivery failed, falling back to direct delivery:', n8nResult.error);
        }
      } catch (n8nError) {
        console.warn('⚠️  n8n delivery error, falling back to direct delivery:', n8nError.message);
      }
    }

    // Fallback to direct email and WhatsApp delivery
    console.log('📤 Using fallback direct delivery (email + SMS if WhatsApp failed)...');
    await Promise.allSettled([
      // Email delivery
      email && this.sendOTPViaEmail({ email, firstName }, otpCode).then(() => {
        results.email.sent = true;
        console.log(`✅ Email verification OTP sent to ${email}`);
      }).catch(error => {
        results.email.error = error.message;
        console.error('❌ Email delivery failed:', error.message);
      }),

      // WhatsApp delivery (fallback if not yet sent)
      phoneNumber && !results.whatsapp.sent && this.sendOTPViaWhatsApp({ phoneNumber, firstName }, otpCode).then(() => {
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
      // Always create a fresh (non-pooled) transporter for OTP sends
      // to avoid Zoho 550 "Unusual activity" on long-lived pooled connections
      let transporter, fromEmail, fromName;

      try {
        const defaultConfig = await emailService.getDefaultConfig();
        if (defaultConfig) {
          fromEmail = defaultConfig.fromEmail;
          fromName = defaultConfig.fromName;
          // Force a fresh non-pooled transporter instead of the cached pool
          const nodemailer = (await import('nodemailer')).default;
          const isSecure = defaultConfig.port === 465 || defaultConfig.port === '465';
          transporter = nodemailer.createTransport({
            host: defaultConfig.host,
            port: defaultConfig.port,
            secure: isSecure,
            auth: { user: defaultConfig.username, pass: defaultConfig.password },
            pool: false,
            tls: { rejectUnauthorized: false, minVersion: 'TLSv1.2' }
          });
        }
      } catch (dbError) {
        console.log('No database email config, using environment fallback');
      }

      // Fallback to environment variables if no database config
      if (!transporter) {
        const nodemailer = (await import('nodemailer')).default;
        const port = parseInt(process.env.SMTP_PORT) || 587;
        transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || 'smtppro.zoho.in',
          port: port,
          secure: port === 465,
          auth: {
            user: (process.env.SMTP_USER || process.env.SMTP_FROM || '').trim(),
            pass: (process.env.SMTP_PASSWORD || process.env.SMTP_PASS || '').trim()
          },
          pool: false,
          tls: { rejectUnauthorized: false, minVersion: 'TLSv1.2' }
        });
        fromEmail = (process.env.SMTP_USER || process.env.SMTP_FROM || '').trim();
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
        subject: `${otpCode} is your Mediqzy verification code`,
        html: htmlContent,
        text: `Hello ${firstName},\n\nYour Mediqzy registration OTP is: ${otpCode}\n\nThis OTP is valid for 10 minutes. Do not share this code.\n\nIf you didn't request this, please ignore this email.\n\nBest regards,\nMediqzy Team`,
        headers: {
          'X-Mailer': 'Mediqzy',
          'X-Priority': '1',
          'Precedence': 'transactional'
        }
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
   * Retries up to 2 times. Falls back to Email and sends admin alert on failure.
   */
  async sendOTPViaWhatsApp(account, otpCode) {
    // If Twilio is not configured, fallback to email
    if (!this.twilioClient || !this.twilioConfigured) {
      console.warn('⚠️  Twilio WhatsApp not available - falling back to Email OTP');
      return await this.sendOTPViaEmail(account, otpCode);
    }

    const phoneNumber = account.phoneNumber;
    let formattedPhone = phoneNumber.toString().replace(/[^0-9]/g, '');
    if (!formattedPhone.startsWith('91') && formattedPhone.length === 10) {
      formattedPhone = '91' + formattedPhone;
    }

    const whatsappFrom = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+918098998998';
    const whatsappTo = `whatsapp:+${formattedPhone}`;
    const templateSid = process.env.TWILIO_OTP_TEMPLATE_SID || 'HX33ae0014bd63fad4404789d2373b6174';

    // Non-retriable Twilio error codes
    const NON_RETRIABLE = new Set([63024, 63016, 21211, 21614, 21612, 21610, 21408]);
    const maxRetries = 2;
    let lastError = null;
    let attempt = 0;

    while (attempt <= maxRetries) {
      attempt++;
      try {
        const message = await this.twilioClient.messages.create({
          from: whatsappFrom,
          to: whatsappTo,
          contentSid: templateSid,
          contentVariables: JSON.stringify({ '1': otpCode })
        });

        console.log(`📱 ✅ Signup WhatsApp OTP sent (attempt ${attempt}): SID=${message.sid} Status=${message.status}`);
        return; // success

      } catch (error) {
        lastError = error;
        const code = error.code || error.status;
        console.error(`❌ Signup WhatsApp OTP attempt ${attempt} failed:`, error.message);

        if (code && NON_RETRIABLE.has(Number(code))) {
          console.warn(`⚠️  Non-retriable Twilio error ${code} — skipping retries`);
          break;
        }

        if (attempt <= maxRetries) {
          const delay = attempt === 1 ? 1000 : 3000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All attempts failed — send admin alert asynchronously
    const maskedPhone = `+${formattedPhone}`.replace(/(\+\d{2})\d{6}(\d{4})/, '$1******$2');
    this._sendWhatsAppFailureAlert({ maskedPhone, purpose: 'signup', error: lastError?.message || 'Unknown error', attempts: attempt })
      .catch(() => {});

    console.warn('⚠️  WhatsApp delivery failed after retries - falling back to Email OTP');
    return await this.sendOTPViaEmail(account, otpCode);
  }

  /**
   * Send admin alert when WhatsApp OTP delivery fails
   */
  async _sendWhatsAppFailureAlert({ maskedPhone, purpose, error, attempts }) {
    try {
      const nodemailer = (await import('nodemailer')).default;
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

      const alertEmail = process.env.OTP_FAILURE_ALERT_EMAIL || 'sk@mysmarthealth.in';
      const now = new Date().toISOString();

      await transporter.sendMail({
        from: `"Mediczy System Alert" <${process.env.SMTP_USER || 'noreply@mysmarthealth.in'}>`,
        to: alertEmail,
        subject: `🚨 WhatsApp OTP Delivery Failed — ${purpose} (${now.slice(0, 10)})`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e0e0e0;border-radius:8px;">
            <h2 style="color:#d32f2f;margin-top:0;">⚠️ WhatsApp OTP Delivery Failure</h2>
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr><td style="padding:8px;color:#666;width:40%;">Time (UTC)</td><td style="padding:8px;font-weight:bold;">${now}</td></tr>
              <tr style="background:#f9f9f9;"><td style="padding:8px;color:#666;">Phone (masked)</td><td style="padding:8px;font-weight:bold;">${maskedPhone}</td></tr>
              <tr><td style="padding:8px;color:#666;">Purpose</td><td style="padding:8px;font-weight:bold;">${purpose}</td></tr>
              <tr style="background:#f9f9f9;"><td style="padding:8px;color:#666;">Attempts made</td><td style="padding:8px;font-weight:bold;">${attempts}</td></tr>
              <tr><td style="padding:8px;color:#666;">Error</td><td style="padding:8px;color:#d32f2f;font-weight:bold;">${error}</td></tr>
            </table>
            <p style="margin-top:16px;color:#555;">User has been automatically switched to <strong>Email OTP</strong> as fallback.</p>
            <hr style="margin:20px 0;border:none;border-top:1px solid #eee;">
            <p style="color:#888;font-size:12px;margin:0;">Automated alert from Mediczy signup OTP system. Check Twilio dashboard for details.</p>
          </div>
        `,
        text: `WhatsApp OTP Failure\n\nTime: ${now}\nPhone: ${maskedPhone}\nPurpose: ${purpose}\nAttempts: ${attempts}\nError: ${error}\n\nUser was switched to Email OTP fallback.`
      });

      console.log(`📧 Signup WhatsApp OTP failure alert sent to ${alertEmail}`);
    } catch (alertErr) {
      console.error('❌ Failed to send signup OTP failure alert:', alertErr.message);
    }
  }
}

// Export singleton instance
const signupVerificationService = new SignupVerificationService();
export default signupVerificationService;
