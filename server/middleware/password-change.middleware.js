/**
 * Middleware to check if user requires password change
 * Enforces password change on first login for newly created accounts
 */
export const checkPasswordChangeRequired = (req, res, next) => {
  try {
    // Skip check for password change endpoint itself
    if (req.path === '/change-password' || req.path.includes('/change-password')) {
      return next();
    }

    // Check if user metadata indicates password change is required
    if (req.user && req.user.metadata) {
      let metadata;
      
      // Parse metadata if it's a string
      if (typeof req.user.metadata === 'string') {
        try {
          metadata = JSON.parse(req.user.metadata);
        } catch (e) {
          metadata = req.user.metadata;
        }
      } else {
        metadata = req.user.metadata;
      }

      // If password change is required, block access to other endpoints
      if (metadata && metadata.requirePasswordChange === true) {
        return res.status(403).json({
          success: false,
          message: 'Password change required. Please update your password before accessing other resources.',
          requirePasswordChange: true,
          changePasswordUrl: '/api/users/change-password'
        });
      }
    }

    next();
  } catch (error) {
    console.error('Error in password change check middleware:', error);
    next(); // Allow request to proceed if middleware fails
  }
};

/**
 * Middleware specifically for routes that should be accessible during forced password change
 */
export const allowDuringPasswordChange = (req, res, next) => {
  // This middleware does nothing but signals that the route is allowed
  // during password change requirement
  next();
};

export default {
  checkPasswordChangeRequired,
  allowDuringPasswordChange
};
