import { sendTransactionalEmail } from '../services/welcome-email.service.js';
import OTP from '../models/otp.model.intelligent.js';
import { JWT_CONFIG } from '../config/auth.config.js';
import { SMSService, SMSTemplateManager } from '../services/sms.service.js';
import {
  trackOTPSendRequested,
  trackOTPSendSuccessful,
  trackOTPSendFailed,
  trackOTPVerified,
  trackOTPFailed,
} from '../services/signup-analytics.service.js';

// ── SMS service ───────────────────────────────────────────────────────────────

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

// ── Email OTP delivery ────────────────────────────────────────────────────────

// Email OTPs are sent through the shared mailer, which is SES-only. This file used to own a lazy
// nodemailer transport keyed off EMAIL_HOST/EMAIL_USER/EMAIL_FROM -- a different set of variables
// from the rest of the platform -- so login OTPs depended on config nothing else used and would
// silently return 'failed' if it was unset.

// ── Resend cooldown tracking (in-memory fallback for Redis) ───────────────────
// Shape: Map<identifier, lastSentMs>
const recentSendMap = new Map();
const RESEND_COOLDOWN_SECONDS = 60;
const RESEND_WINDOW_SECONDS = 600; // 10 minutes
const MAX_SENDS_IN_WINDOW = 5;
// Shape: Map<identifier, [timestamp, ...]>
const sendWindowMap = new Map();

function getIdentifier(phone, email) {
  return phone || email || 'unknown';
}

/**
 * Check if the identifier is within the resend cooldown.
 * Returns { blocked: true, retryAfterSeconds } or { blocked: false }.
 */
function checkResendCooldown(identifier) {
  const last = recentSendMap.get(identifier);
  if (!last) return { blocked: false };

  const elapsedSeconds = (Date.now() - last) / 1000;
  if (elapsedSeconds < RESEND_COOLDOWN_SECONDS) {
    const retryAfterSeconds = Math.ceil(RESEND_COOLDOWN_SECONDS - elapsedSeconds);
    return { blocked: true, retryAfterSeconds };
  }
  return { blocked: false };
}

/**
 * Returns how many OTP sends remain in the current 10-minute window.
 */
function getRemainingAttempts(identifier) {
  const now = Date.now();
  const windowStart = now - RESEND_WINDOW_SECONDS * 1000;
  const times = (sendWindowMap.get(identifier) || []).filter((t) => t > windowStart);
  sendWindowMap.set(identifier, times);
  return Math.max(0, MAX_SENDS_IN_WINDOW - times.length);
}

function recordSend(identifier) {
  recentSendMap.set(identifier, Date.now());
  const times = sendWindowMap.get(identifier) || [];
  times.push(Date.now());
  sendWindowMap.set(identifier, times);
}

// ── Channel delivery helpers ──────────────────────────────────────────────────

async function deliverViaSMS(phone, otp) {
  if (!phone || !smsService) {
    return phone ? 'failed' : 'not_requested';
  }
  try {
    const smsMessage = SMSTemplateManager.renderTemplate('otp_verification', { otp: otp.code });
    await smsService.sendSMS({ to: phone, message: smsMessage, templateId: process.env.SMS_OTP_TEMPLATE_ID });
    console.log(`✅ OTP sent via SMS to ${phone}`);
    return 'sent';
  } catch (err) {
    console.error('Error sending OTP via SMS:', err.message);
    return 'failed';
  }
}

async function deliverViaEmail(email, otp) {
  if (!email) return 'not_requested';

  try {
    await sendTransactionalEmail({
      to: email,
      subject: 'Your Mediczy OTP',
      text: `Your Mediczy OTP is ${otp.code}. Valid for 10 minutes. Do not share.`,
      html: `<p>Your Mediczy OTP is <strong>${otp.code}</strong>. Valid for 10 minutes. Do not share.</p>`,
      fromName: 'Mediqzy',
    });
    console.log(`✅ OTP sent via email to ${email}`);
    return 'sent';
  } catch (err) {
    console.error('Error sending OTP via email:', err.message);
    return 'failed';
  }
}

async function deliverViaWhatsApp(phone, otp) {
  // WhatsApp delivery placeholder — integrate with WhatsApp service when available
  if (!phone) return 'not_requested';
  console.warn(`⚠️  WhatsApp OTP delivery not yet implemented for ${phone}`);
  return 'failed';
}

// ── Build delivery status ─────────────────────────────────────────────────────

function buildDeliveryStatus(channel, statuses) {
  const { smsStatus, emailStatus, whatsappStatus } = statuses;
  const primary = statuses[`${channel}Status`] || 'failed';

  let fallbackChannel = null;
  if (primary === 'failed') {
    if (channel !== 'email' && emailStatus === 'sent') fallbackChannel = 'email';
    else if (channel !== 'sms' && smsStatus === 'sent') fallbackChannel = 'sms';
    else if (channel !== 'whatsapp' && whatsappStatus === 'sent') fallbackChannel = 'whatsapp';
  }

  return {
    sms: smsStatus,
    email: emailStatus,
    whatsapp: whatsappStatus,
    _fallbackChannel: fallbackChannel,
  };
}

// ── Controllers ───────────────────────────────────────────────────────────────

/**
 * Send OTP to phone number or email
 * POST /api/otp/send
 * Body: { phone?, email?, purpose?, channel? }
 */
export const sendOTP = async (req, res) => {
  const startMs = Date.now();
  try {
    const { phone, email, purpose = 'login', channel = 'sms' } = req.body;
    const ip = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
    const deviceId = req.headers['x-device-id'] || null;

    // Fire analytics event immediately (non-blocking)
    trackOTPSendRequested({ channel, purpose, isNewUser: !req.user, isCorporate: false, ip, deviceId });

    // Validate input
    if (!phone && !email) {
      return res.status(400).json({
        success: false,
        message: 'Phone number or email is required'
      });
    }

    // Validate channel
    const validChannels = ['sms', 'email', 'whatsapp'];
    if (!validChannels.includes(channel)) {
      return res.status(400).json({
        success: false,
        message: `Invalid channel. Must be one of: ${validChannels.join(', ')}`
      });
    }

    // Validate phone format when SMS/WhatsApp channel selected
    if (phone && !phone.match(/^\+?[1-9]\d{1,14}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format. Use E.164 format (e.g., +919876543210)'
      });
    }

    const identifier = getIdentifier(phone, email);

    // Resend cooldown check
    const cooldownCheck = checkResendCooldown(identifier);
    if (cooldownCheck.blocked) {
      return res.status(429).json({
        success: false,
        message: 'OTP was recently sent. Please wait before requesting another.',
        data: { retryAfterSeconds: cooldownCheck.retryAfterSeconds }
      });
    }

    const remainingAttempts = getRemainingAttempts(identifier);
    if (remainingAttempts <= 0) {
      return res.status(429).json({
        success: false,
        message: 'Too many OTP requests. Please try again later.',
        data: { retryAfterSeconds: RESEND_WINDOW_SECONDS }
      });
    }

    // Generate OTP
    const otp = await OTP.generate({ phone, email, purpose, expiryMinutes: 10 });

    // Deliver via requested channel; also try other channels if they have identifiers
    let smsStatus = 'not_requested';
    let emailStatus = 'not_requested';
    let whatsappStatus = 'not_requested';

    if (channel === 'sms') {
      smsStatus = await deliverViaSMS(phone, otp);
      if (email) emailStatus = 'not_requested'; // not requested on this call
    } else if (channel === 'email') {
      emailStatus = await deliverViaEmail(email, otp);
    } else if (channel === 'whatsapp') {
      whatsappStatus = await deliverViaWhatsApp(phone, otp);
    }

    const deliveryStatuses = { smsStatus, emailStatus, whatsappStatus };
    const deliveryStatus = buildDeliveryStatus(channel, deliveryStatuses);
    const primaryStatus = deliveryStatus[channel];

    // Record the send for rate-tracking (regardless of delivery outcome)
    recordSend(identifier);

    const deliveryMs = Date.now() - startMs;
    if (primaryStatus === 'sent') {
      trackOTPSendSuccessful({ channel, purpose, otpId: otp.id, deliveryMs });
    } else {
      trackOTPSendFailed({ channel, purpose, error: `delivery_${primaryStatus}` });
    }

    res.json({
      success: true,
      message: 'OTP sent successfully',
      data: {
        otpId: otp.id,
        expiresAt: otp.expiresAt,
        expiresIn: '10 minutes',
        channel,
        deliveryStatus: {
          sms: deliveryStatus.sms,
          email: deliveryStatus.email,
          whatsapp: deliveryStatus.whatsapp,
        },
        retryAfterSeconds: RESEND_COOLDOWN_SECONDS,
        remainingAttempts: Math.max(0, remainingAttempts - 1),
        fallbackChannel: deliveryStatus._fallbackChannel,
        // Only include OTP code in development mode
        ...(process.env.NODE_ENV === 'development' && { otp: otp.code })
      }
    });
  } catch (error) {
    console.error('Error sending OTP:', error);
    trackOTPSendFailed({ channel: req.body?.channel || 'sms', purpose: req.body?.purpose || 'login', error: error.message });
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
 * Body: { phone?, email?, code, purpose? }
 */
export const verifyOTP = async (req, res) => {
  const startMs = Date.now();
  try {
    const { phone, email, code, purpose = 'login', channel = 'sms' } = req.body;

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

    const verifyMs = Date.now() - startMs;

    if (result.success) {
      trackOTPVerified({ channel, purpose, otpId: result.otpId, verifyMs });
      res.json({
        success: true,
        message: 'OTP verified successfully',
        data: {
          otpId: result.otpId
        }
      });
    } else {
      trackOTPFailed({ channel, purpose, otpId: null, attemptsUsed: 1 });
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
 * Body: { phone?, email?, purpose?, channel? }
 */
export const resendOTP = async (req, res) => {
  const startMs = Date.now();
  try {
    const { phone, email, purpose = 'login', channel = 'sms' } = req.body;
    const ip = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';

    // Validate input
    if (!phone && !email) {
      return res.status(400).json({
        success: false,
        message: 'Phone number or email is required'
      });
    }

    const identifier = getIdentifier(phone, email);

    // Resend cooldown check
    const cooldownCheck = checkResendCooldown(identifier);
    if (cooldownCheck.blocked) {
      return res.status(429).json({
        success: false,
        message: 'OTP was recently sent. Please wait before requesting another.',
        data: { retryAfterSeconds: cooldownCheck.retryAfterSeconds }
      });
    }

    // Resend OTP (invalidates previous)
    const otp = await OTP.resend({ phone, email, purpose });

    // Deliver via requested channel
    let smsStatus = 'not_requested';
    let emailStatus = 'not_requested';
    let whatsappStatus = 'not_requested';

    if (channel === 'sms') {
      smsStatus = await deliverViaSMS(phone, otp);
    } else if (channel === 'email') {
      emailStatus = await deliverViaEmail(email, otp);
    } else if (channel === 'whatsapp') {
      whatsappStatus = await deliverViaWhatsApp(phone, otp);
    }

    const deliveryStatuses = { smsStatus, emailStatus, whatsappStatus };
    const deliveryStatus = buildDeliveryStatus(channel, deliveryStatuses);

    recordSend(identifier);

    const deliveryMs = Date.now() - startMs;
    const primaryStatus = deliveryStatus[channel];
    if (primaryStatus === 'sent') {
      trackOTPSendSuccessful({ channel, purpose, otpId: otp.id, deliveryMs });
    } else {
      trackOTPSendFailed({ channel, purpose, error: `delivery_${primaryStatus}` });
    }

    res.json({
      success: true,
      message: 'OTP resent successfully',
      data: {
        otpId: otp.id,
        expiresAt: otp.expiresAt,
        expiresIn: '10 minutes',
        channel,
        deliveryStatus: {
          sms: deliveryStatus.sms,
          email: deliveryStatus.email,
          whatsapp: deliveryStatus.whatsapp,
        },
        retryAfterSeconds: RESEND_COOLDOWN_SECONDS,
        fallbackChannel: deliveryStatus._fallbackChannel,
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
