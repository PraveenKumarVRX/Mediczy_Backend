/**
 * Public (token-gated) kiosk registration — no login, no device token.
 * Mount: /api/public/kiosk-register
 */
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import {
  getInviteByRawToken,
  getInviteWhatsAppDelivery,
  completeInviteRegistration,
} from '../services/kiosk-registration.service.js';
import { parseAadhaarQrInput } from '../services/aadhaar-qr.service.js';
import { decodeAadhaarFromImageBytes } from '../services/aadhaar-image-decode.service.js';
import {
  initiateAadhaarAbhaEnrol,
  verifyAadhaarAbhaEnrol,
  isAadhaarAbhaEnrolMockMode,
} from '../services/abdm-aadhaar-enrol.service.js';

const router = express.Router();

function hashInviteToken(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

/** Simple IP rate limit for ABHA OTP (in-memory; Redis preferred in multi-instance). */
const abhaHits = new Map();
function abhaRateLimit(req, res, next) {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'x';
  const key = `${ip}:${req.params.token?.slice(0, 12) || ''}`;
  const now = Date.now();
  let bucket = abhaHits.get(key);
  if (!bucket || now - bucket.start > 300_000) bucket = { start: now, n: 0 };
  bucket.n += 1;
  abhaHits.set(key, bucket);
  if (bucket.n > 12) {
    return res.status(429).json({ success: false, message: 'Too many ABHA OTP attempts. Try again in a few minutes.' });
  }
  return next();
}

/** GET /api/public/kiosk-register/:token */
router.get('/:token', async (req, res) => {
  try {
    const result = await getInviteByRawToken(req.params.token);
    if (!result.success) {
      return res.status(410).json(result);
    }
    res.json({
      success: true,
      status: result.status,
      phone: result.phone,
      expiresAt: result.expiresAt,
      tokenNumber: result.tokenNumber || null,
      prefill: result.prefill || {},
    });
  } catch (e) {
    console.error('[public-kiosk-reg] get:', e.message);
    res.status(500).json({ success: false, message: 'Could not open registration link' });
  }
});

/**
 * GET /api/public/kiosk-register/:token/notify-status
 * Token-gated Twilio delivery status (diagnose "accepted but not received").
 */
router.get('/:token/notify-status', async (req, res) => {
  try {
    const result = await getInviteWhatsAppDelivery(req.params.token);
    if (!result.success && !result.whatsappSid) {
      return res.status(410).json(result);
    }
    res.status(result.success ? 200 : 502).json(result);
  } catch (e) {
    console.error('[public-kiosk-reg] notify-status:', e.message);
    res.status(500).json({ success: false, message: 'Could not check WhatsApp status' });
  }
});

/** POST /api/public/kiosk-register/:token/parse-aadhaar */
router.post('/:token/parse-aadhaar', async (req, res) => {
  try {
    const invite = await getInviteByRawToken(req.params.token);
    if (!invite.success || invite.status !== 'pending') {
      return res.status(410).json({ success: false, message: invite.message || 'Link expired' });
    }
    const parsed = parseAadhaarQrInput({
      qrText: req.body?.qrText,
      qrBytesBase64: req.body?.qrBytesBase64,
    });
    if (!parsed.success) return res.status(422).json(parsed);
    res.json(parsed);
  } catch (e) {
    res.status(500).json({ success: false, message: 'Could not read Aadhaar QR' });
  }
});

/**
 * POST /api/public/kiosk-register/:token/decode-aadhaar-image
 * Multipart `photo` — server zxing-wasm for phones that cannot decode Secure QR locally.
 */
router.post('/:token/decode-aadhaar-image', async (req, res) => {
  try {
    const invite = await getInviteByRawToken(req.params.token);
    if (!invite.success || invite.status !== 'pending') {
      return res.status(410).json({ success: false, message: invite.message || 'Link expired' });
    }
    const file = req.files?.photo || req.files?.image || req.files?.file;
    if (!file) {
      return res.status(400).json({ success: false, message: 'photo file required' });
    }
    const buf = file.data || (file.tempFilePath ? fs.readFileSync(file.tempFilePath) : null);
    if (!buf?.length) {
      return res.status(400).json({ success: false, message: 'empty photo' });
    }
    const result = await decodeAadhaarFromImageBytes(buf);
    if (!result.success) return res.status(422).json(result);
    res.json(result);
  } catch (e) {
    console.error('[public-kiosk-reg] decode-aadhaar-image:', e.message);
    res.status(500).json({ success: false, message: 'Could not read Aadhaar QR from photo' });
  }
});

/**
 * GET /api/public/kiosk-register/:token/abha/status
 * Whether Aadhaar→ABHA self-enrol is available (live ABDM vs sandbox mock).
 */
router.get('/:token/abha/status', async (req, res) => {
  try {
    const invite = await getInviteByRawToken(req.params.token);
    if (!invite.success || invite.status !== 'pending') {
      return res.status(410).json({ success: false, message: invite.message || 'Link expired' });
    }
    res.json({
      success: true,
      available: true,
      mock: isAadhaarAbhaEnrolMockMode(),
      message: isAadhaarAbhaEnrolMockMode()
        ? 'Sandbox ABHA enrol (OTP 123456) — configure ABDM_CLIENT_ID for live NHA'
        : 'Aadhaar OTP ABHA creation via ABDM',
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * POST /api/public/kiosk-register/:token/abha/aadhaar/init
 * Body: { aadhaarNumber, consentAccepted: true }
 * Sends OTP to Aadhaar-linked mobile for ABHA creation.
 */
router.post('/:token/abha/aadhaar/init', abhaRateLimit, async (req, res) => {
  try {
    const invite = await getInviteByRawToken(req.params.token);
    if (!invite.success || invite.status !== 'pending') {
      return res.status(410).json({ success: false, message: invite.message || 'Link expired' });
    }
    if (!req.body?.consentAccepted) {
      return res.status(400).json({
        success: false,
        message: 'Consent is required to create ABHA using Aadhaar OTP',
      });
    }
    const result = await initiateAadhaarAbhaEnrol({
      aadhaarNumber: req.body?.aadhaarNumber,
      mobile: invite.phone,
      inviteTokenHash: hashInviteToken(req.params.token),
      tenantId: invite.organizationId,
      name: req.body?.name || null,
    });
    res.status(202).json({ success: true, ...result });
  } catch (e) {
    const status = e.status || 500;
    console.error('[public-kiosk-reg] abha aadhaar init:', e.message);
    res.status(status).json({ success: false, message: e.message || 'Could not send Aadhaar OTP' });
  }
});

/**
 * POST /api/public/kiosk-register/:token/abha/aadhaar/verify
 * Body: { txnId, otp }
 * Creates ABHA and returns abhaNumber / abhaAddress for the form.
 */
router.post('/:token/abha/aadhaar/verify', abhaRateLimit, async (req, res) => {
  try {
    const invite = await getInviteByRawToken(req.params.token);
    if (!invite.success || invite.status !== 'pending') {
      return res.status(410).json({ success: false, message: invite.message || 'Link expired' });
    }
    const result = await verifyAadhaarAbhaEnrol({
      txnId: req.body?.txnId,
      otp: req.body?.otp,
      mobile: invite.phone,
      inviteTokenHash: hashInviteToken(req.params.token),
      firstName: req.body?.firstName,
      lastName: req.body?.lastName,
      gender: req.body?.gender,
      dateOfBirth: req.body?.dateOfBirth,
    });
    res.json({ success: true, ...result });
  } catch (e) {
    const status = e.status || 500;
    console.error('[public-kiosk-reg] abha aadhaar verify:', e.message);
    res.status(status).json({ success: false, message: e.message || 'Could not verify OTP / create ABHA' });
  }
});

/** POST /api/public/kiosk-register/:token/complete */
router.post('/:token/complete', async (req, res) => {
  try {
    const result = await completeInviteRegistration(req.params.token, req.body || {});
    res.status(result.alreadyCompleted ? 200 : 201).json({
      success: true,
      ...result,
    });
  } catch (e) {
    const status = e.status || 500;
    console.error('[public-kiosk-reg] complete:', e.message);
    res.status(status).json({ success: false, message: e.message || 'Registration failed' });
  }
});

export default router;
