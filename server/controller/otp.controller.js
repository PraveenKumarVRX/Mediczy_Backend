import OTP from '../models/otp.model.intelligent.js';
import { JWT_CONFIG } from '../config/auth.config.js';
import { SMSService, SMSTemplateManager } from '../services/sms.service.js';

// Initialize SMS service from environment
let smsService = null;
const smsConfig = {
  provider: process.env.SMS_PROVIDER || 'twilio',
  apiKey: process.env.SMS_API_KEY || process.env.TWILIO_ACCOUNT_SID,
  apiSecret: process.env.SMS_API_SECRET || process.env.TWILIO_AUTH_TOKEN,
  senderId: process.env.SMS_SENDER_ID || process.env.TWILIO_PHONE_NUMBER || 'MEDICZY'
};

if (smsConfig.apiKey && smsConfig.apiSecret) {
  smsService = new SMSService(smsConfig);
  console.log('✅ SMS service initialized for OTP delivery');
} else {
  console.warn('⚠️  SMS service not configured. Set SMS_API_KEY and SMS_API_SECRET in .env');
}

/**
 * Send OTP to phone number
 * POST /api/otp/send
 */
export const sendOTP = async (req, res) => {
  try {
    const { phone, email, purpose = 'login' } = req.body;

    // Validate input
    if (!phone && !email) {
      return res.status(400).json({
        success: false,
        message: 'Phone number or email is required'
      });
    }

    // Validate phone format (basic)
    if (phone && !phone.match(/^\+?[1-9]\d{1,14}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format. Use E.164 format (e.g., +919876543210)'
      });
    }

    // Generate OTP
    const otp = await OTP.generate({ phone, email, purpose, expiryMinutes: 10 });

    // Send via SMS if phone provided
    if (phone && smsService) {
      try {
        const smsMessage = SMSTemplateManager.renderTemplate('otp_verification', {
          otp: otp.code
        });

        await smsService.sendSMS({
          to: phone,
          message: smsMessage,
          templateId: process.env.SMS_OTP_TEMPLATE_ID
        });

        console.log(`✅ OTP sent to ${phone}: ${otp.code}`);
      } catch (smsError) {
        console.error('Error sending OTP via SMS:', smsError);
        // Don't fail the request, just log the error
        // OTP is still generated and can be verified
      }
    }

    // TODO: Send via email if email provided
    // if (email) {
    //   await sendOTPEmail(email, otp.code);
    // }

    res.json({
      success: true,
      message: 'OTP sent successfully',
      data: {
        otpId: otp.id,
        expiresAt: otp.expiresAt,
        expiresIn: '10 minutes',
        // Only include OTP in development mode
        ...(process.env.NODE_ENV === 'development' && { otp: otp.code })
      }
    });
  } catch (error) {
    console.error('Error sending OTP:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send OTP',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Verify OTP
 * POST /api/otp/verify
 */
export const verifyOTP = async (req, res) => {
  try {
    const { phone, email, code, purpose = 'login' } = req.body;

    // Validate input
    if (!phone && !email) {
      return res.status(400).json({
        success: false,
        message: 'Phone number or email is required'
      });
    }

    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'OTP code is required'
      });
    }

    // Verify OTP
    const result = await OTP.verify({ phone, email, code, purpose });

    if (result.success) {
      res.json({
        success: true,
        message: 'OTP verified successfully',
        data: {
          otpId: result.otpId
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify OTP',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Resend OTP
 * POST /api/otp/resend
 */
export const resendOTP = async (req, res) => {
  try {
    const { phone, email, purpose = 'login' } = req.body;

    // Validate input
    if (!phone && !email) {
      return res.status(400).json({
        success: false,
        message: 'Phone number or email is required'
      });
    }

    // Resend OTP
    const otp = await OTP.resend({ phone, email, purpose });

    // Send via SMS if phone provided
    if (phone && smsService) {
      try {
        const smsMessage = SMSTemplateManager.renderTemplate('otp_verification', {
          otp: otp.code
        });

        await smsService.sendSMS({
          to: phone,
          message: smsMessage
        });

        console.log(`✅ OTP resent to ${phone}: ${otp.code}`);
      } catch (smsError) {
        console.error('Error resending OTP via SMS:', smsError);
      }
    }

    res.json({
      success: true,
      message: 'OTP resent successfully',
      data: {
        otpId: otp.id,
        expiresAt: otp.expiresAt,
        expiresIn: '10 minutes',
        ...(process.env.NODE_ENV === 'development' && { otp: otp.code })
      }
    });
  } catch (error) {
    console.error('Error resending OTP:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resend OTP',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get OTP statistics (admin only)
 * GET /api/otp/stats
 */
export const getOTPStats = async (req, res) => {
  try {
    const stats = await OTP.getStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting OTP stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get OTP statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Clean up expired OTPs (admin only)
 * POST /api/otp/cleanup
 */
export const cleanupExpiredOTPs = async (req, res) => {
  try {
    const deletedCount = await OTP.cleanupExpired();
    
    res.json({
      success: true,
      message: `Cleaned up ${deletedCount} expired OTPs`,
      data: { deletedCount }
    });
  } catch (error) {
    console.error('Error cleaning up OTPs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clean up expired OTPs',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
