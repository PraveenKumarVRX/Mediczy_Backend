import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import {
  issueAccessToken,
  issueRefreshToken,
  rotateTokens,
  revokeRefreshToken,
  revokeAllRefreshTokens,
  validateRefreshToken,
} from '../services/auth-token.service.js';
import { rotatePortalRefreshToken } from '../services/token-revocation.service.js';
import User from '../models/postgres/user.model.postgres.js';
import doctorModel from '../models/doctor.model.intelligent.js';
import { COOKIE_NAMES, setAuthCookies, clearAuthCookies } from '../config/cookies.config.js';
import jwt from 'jsonwebtoken';

const router = express.Router();

const tryRotateDoctorRefreshToken = async (refreshToken, req) => {
  const decoded = jwt.decode(refreshToken);
  if (!decoded || decoded.portal !== 'doctor' || decoded.tokenType !== 'refresh') {
    return null;
  }

  const deviceFp = req.headers['x-device-fingerprint'] || req.body?.deviceFingerprint || null;
  const result = await rotatePortalRefreshToken(refreshToken, {
    portal: 'doctor',
    deviceFp,
    resolvePayload: async (payload) => {
      const doctor = await doctorModel.findByPk(payload.userId);
      if (!doctor) return null;
      if (doctor.status && doctor.status !== 'active') return null;
      if (doctor.isActive === false) return null;
      if (!doctor.isVerified) return null;
      return { id: doctor.id, email: doctor.email, role: 'doctor' };
    },
  });

  if (!result) return null;
  return {
    accessToken: result.accessToken,
    token: result.accessToken,
    refreshToken: result.refreshToken,
    expiresIn: 900,
    role: 'doctor',
  };
};

/**
 * POST /api/auth/refresh
 * Rotate refresh token — returns new 15-min access + new refresh token.
 * Old refresh token is revoked immediately (prevents replay).
 */
router.post('/refresh', async (req, res) => {
  try {
    // Accept refresh token from httpOnly cookie (web) or request body (mobile).
    const refreshToken = req.cookies?.[COOKIE_NAMES.REFRESH] || req.body?.refreshToken;

    if (!refreshToken) {
      return res.status(400).json({ success: false, message: 'refreshToken is required' });
    }

    const getUserById = (id) => User.findByPk(id);
    let result = null;
    try {
      result = await rotateTokens(refreshToken, getUserById);
    } catch (rotateError) {
      console.warn('[auth/refresh] user-token rotation skipped:', rotateError.message);
    }

    if (!result) {
      const doctorResult = await tryRotateDoctorRefreshToken(refreshToken, req);
      if (doctorResult) {
        return res.json({
          success: true,
          ...doctorResult,
        });
      }
    }

    if (!result) {
      // Refresh token invalid — clear cookies so the browser doesn't keep retrying
      clearAuthCookies(res);
      return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
    }

    // Rotate cookies for web clients
    setAuthCookies(res, result.accessToken, result.refreshToken);

    res.json({
      success:      true,
      accessToken:  result.accessToken,
      token:        result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn:    900,
    });
  } catch (error) {
    console.error('[auth/refresh]', error.message);
    clearAuthCookies(res);
    res.status(401).json({ success: false, message: 'Token refresh failed' });
  }
});

/**
 * POST /api/auth/logout
 * Single-device logout — revokes the current refresh token and clears auth cookies.
 * Works for both cookie-based web sessions and token-based mobile sessions.
 */
router.post('/logout', async (req, res) => {
  try {
    const refreshToken = req.cookies?.[COOKIE_NAMES.REFRESH] || req.body?.refreshToken;
    if (refreshToken) {
      await revokeRefreshToken(refreshToken).catch(() => {
        // Non-fatal: token may already be expired/revoked
      });
    }
    clearAuthCookies(res);
    res.json({ success: true, message: 'Logged out' });
  } catch (error) {
    clearAuthCookies(res);
    res.status(500).json({ success: false, message: 'Logout failed' });
  }
});

/**
 * POST /api/auth/revoke
 * Revoke a specific refresh token (single-device logout).
 */
router.post('/revoke', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: 'refreshToken is required' });
    }
    await revokeRefreshToken(refreshToken);
    res.json({ success: true, message: 'Token revoked' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Revocation failed' });
  }
});

/**
 * POST /api/auth/logout-all
 * Revoke ALL refresh tokens for the authenticated user (all-device logout).
 */
router.post('/logout-all', authUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const fingerprint = req.body.deviceFingerprint || undefined;
    await revokeAllRefreshTokens(userId, fingerprint);

    res.json({ success: true, message: `Logged out from ${fingerprint ? 'device' : 'all devices'}` });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Logout failed' });
  }
});

/**
 * GET /api/auth/token-status
 * Check if a refresh token is still valid (without rotating it).
 */
router.get('/token-status', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1] || req.query.token;
    if (!token) return res.status(400).json({ valid: false });

    const payload = await validateRefreshToken(token);
    res.json({ valid: !!payload, userId: payload?.userId });
  } catch {
    res.json({ valid: false });
  }
});

export default router;
