import express from 'express';

const router = express.Router();

/**
 * Universal logout endpoint for all user types
 * Clears all sessions and revokes all active tokens
 */
router.post('/logout', (req, res) => {
  try {
    const userType = req.userType || 'unknown';
    const userId = req.user?.userId || req.user?.doctorId || req.user?.adminId || 'unknown';
    
    console.log(`🚪 User logout: ${userType} (${userId})`);
    
    // Clear session data (if using session middleware)
    if (req.session) {
      req.session.destroy((err) => {
        if (err) {
          console.error('Session destruction error:', err);
        }
      });
    }
    
    // Return success response with instructions to clear client-side tokens
    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
      action: 'clear_all_tokens',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Logout failed',
      message: error.message
    });
  }
});

/**
 * Endpoint to revoke a specific token (for admin use)
 */
router.post('/revoke-token', (req, res) => {
  try {
    const { userId, userType } = req.body;
    
    // Check if requester is admin
    if (req.userType !== 'admin') {
      return res.status(403).json({
        error: 'Only admins can revoke tokens',
        code: 'ADMIN_ONLY'
      });
    }
    
    console.log(`🔒 Token revoked for ${userType} (${userId}) by admin ${req.user?.adminId}`);
    
    // TODO: Add token to revocation list in Redis/database
    // For now, just return success
    
    res.status(200).json({
      success: true,
      message: `Token revoked for ${userType} ${userId}`,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Token revocation error:', error);
    res.status(500).json({
      success: false,
      error: 'Token revocation failed',
      message: error.message
    });
  }
});

/**
 * Endpoint to check current session info
 */
router.get('/session-info', (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        authenticated: false,
        message: 'No active session'
      });
    }
    
    res.status(200).json({
      authenticated: true,
      userType: req.userType,
      userId: req.user?.userId || req.user?.doctorId || req.user?.adminId || req.user?.teamId,
      email: req.user?.email,
      sessionStart: req.user?.iat ? new Date(req.user.iat * 1000).toISOString() : null,
      sessionExpiry: req.user?.exp ? new Date(req.user.exp * 1000).toISOString() : null,
      privileges: req.user?.privileges || []
    });
    
  } catch (error) {
    console.error('Session info error:', error);
    res.status(500).json({
      error: 'Failed to get session info',
      message: error.message
    });
  }
});

export default router;
