/**
 * Public (token-gated) kiosk registration — no login, no device token.
 * Mount: /api/public/kiosk-register
 */
import express from 'express';
import {
  getInviteByRawToken,
  completeInviteRegistration,
} from '../services/kiosk-registration.service.js';
import { parseAadhaarQrInput } from '../services/aadhaar-qr.service.js';

const router = express.Router();

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
