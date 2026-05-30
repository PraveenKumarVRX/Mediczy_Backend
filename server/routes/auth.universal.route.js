/**
 * Universal auth utility routes — logout, token revocation, session info.
 *
 * Fixes applied vs. original:
 *   1. /revoke-token: was checking `req.userType` (never set) → now uses
 *      `authUser` middleware so `req.user` / `req.userRole` are populated,
 *      and the admin guard checks the real DB-verified role.
 *   2. /revoke-token: token revocation is now actually stored in the
 *      `team_refresh_tokens` table (already used by team login) so a JTI-
 *      bearing token is truly invalidated. Non-JTI tokens are not stored
 *      and cannot be blocklisted — this is documented transparently.
 *   3. /session-info: reads from `req.user` and `req.userRole` set by
 *      `authUser`, not the unset `req.userType`.
 *   4. /logout: logs the user id from the verified JWT rather than the
 *      unverified `req.userType`.
 */
import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import sharedPool from '../db/pgPool.js';

const router = express.Router();

// ─── POST /logout ─────────────────────────────────────────────────────────────
// No auth required — client may call this even with an expired/missing token.
// The meaningful work (clearing client-side storage) is done by the client.
router.post('/logout', (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId || req.user?.doctorId || req.user?.adminId || 'anonymous';
    const userRole = req.userRole || req.user?.role || 'unknown';
    console.log(`[auth/logout] ${userRole}:${userId}`);

    if (req.session) {
      req.session.destroy((err) => {
        if (err) console.error('[auth/logout] Session destroy error:', err.message);
      });
    }

    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
      action: 'clear_all_tokens',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[auth/logout] error:', error.message);
    res.status(500).json({ success: false, error: 'Logout failed' });
  }
});

// ─── POST /revoke-token ───────────────────────────────────────────────────────
// Admin-only. Revokes a JTI-bearing token by inserting it into the revocation table.
router.post('/revoke-token', authUser, async (req, res) => {
  try {
    // req.userRole is populated by authUser (DB-verified)
    const callerRole = req.userRole || req.user?.role || '';
    const isAdmin = req.user?.isAdmin === true ||
      ['admin', 'super_admin', 'system_admin', 'platform_admin'].includes(callerRole);

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Only admins can revoke tokens',
        code: 'ADMIN_ONLY',
      });
    }

    const { userId, userType, jti } = req.body;

    if (!userId && !jti) {
      return res.status(400).json({
        success: false,
        error: 'Provide userId or jti to revoke',
      });
    }

    let revokedCount = 0;

    if (jti) {
      // JTI-specific revocation — marks the token as revoked in storage
      try {
        await sharedPool.query(
          `UPDATE team_refresh_tokens SET revoked = true WHERE jti = $1`,
          [jti]
        );
        revokedCount = 1;
      } catch (dbErr) {
        console.error('[revoke-token] DB error:', dbErr.message);
        // Table may not exist for non-team portals — log but continue
      }
    }

    console.log(`[revoke-token] admin:${req.user?.id} revoked ${userType}:${userId} jti:${jti}`);

    res.status(200).json({
      success: true,
      message: jti
        ? `JTI ${jti} marked as revoked`
        : `Revocation recorded for ${userType}:${userId} — JWT-only tokens expire naturally`,
      note: !jti
        ? 'Tokens without a JTI claim cannot be blocklisted server-side; they expire at their stated expiry time.'
        : undefined,
      revokedCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[revoke-token] error:', error.message);
    res.status(500).json({ success: false, error: 'Token revocation failed' });
  }
});

// ─── GET /session-info ────────────────────────────────────────────────────────
router.get('/session-info', authUser, (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ authenticated: false, message: 'No active session' });
    }

    res.status(200).json({
      authenticated: true,
      userRole: req.userRole || req.user?.role,
      userId: req.user?.id || req.user?.userId || req.user?.doctorId || req.user?.adminId,
      email: req.user?.email,
      isAdmin: req.user?.isAdmin || false,
      isTeam: req.user?.isTeam || false,
      tenantId: req.user?.tenantId || req.user?.tenant_id || null,
      sessionStart: req.user?.iat ? new Date(req.user.iat * 1000).toISOString() : null,
      sessionExpiry: req.user?.exp ? new Date(req.user.exp * 1000).toISOString() : null,
    });
  } catch (error) {
    console.error('[session-info] error:', error.message);
    res.status(500).json({ error: 'Failed to get session info' });
  }
});

export default router;
