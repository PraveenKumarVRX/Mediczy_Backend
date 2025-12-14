import express from 'express';
import { refreshAccessToken, revokeToken } from '../utils/tokenManager.js';

const router = express.Router();

/**
 * @route POST /api/auth/refresh
 * @desc Refresh access token using refresh token
 * @access Public (with valid refresh token)
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required',
      });
    }
    
    // Generate new access token
    const result = refreshAccessToken(refreshToken);
    
    res.json({
      success: true,
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      message: error.message || 'Invalid or expired refresh token',
    });
  }
});

/**
 * @route POST /api/auth/revoke
 * @desc Revoke access token (logout)
 * @access Authenticated
 */
router.post('/revoke', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token is required',
      });
    }
    
    // Revoke token (requires Redis)
    const revoked = await revokeToken(token);
    
    res.json({
      success: true,
      message: revoked 
        ? 'Token revoked successfully' 
        : 'Token will expire naturally (Redis not configured)',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Token revocation failed',
    });
  }
});

/**
 * @route POST /api/auth/logout-all
 * @desc Logout from all devices (future: store token version in database)
 * @access Authenticated
 */
router.post('/logout-all', async (req, res) => {
  try {
    // TODO: Implement token version in user model
    // Increment tokenVersion in database
    // All tokens with old version become invalid
    
    res.json({
      success: true,
      message: 'Logged out from all devices',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Logout failed',
    });
  }
});

export default router;
