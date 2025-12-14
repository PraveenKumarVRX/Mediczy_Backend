import jwt from 'jsonwebtoken';

/**
 * Middleware to verify team member authentication
 */
export const authTeam = async (req, res, next) => {
  try {
    // Extract token from authorization header
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false,
        message: 'No authorization token provided' 
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if user is a team member
    if (!decoded.isTeam && decoded.role !== 'team') {
      return res.status(403).json({ 
        success: false,
        message: 'Access denied. Team member privileges required.' 
      });
    }

    // Attach team user info to request
    req.teamUser = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role || 'team',
      isTeam: true
    };

    next();
  } catch (error) {
    console.error('Team authentication error:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false,
        message: 'Token expired. Please login again.' 
      });
    }
    
    return res.status(401).json({ 
      success: false,
      message: 'Invalid or expired token' 
    });
  }
};

/**
 * Middleware to check if team member has specific module access
 */
export const requireModule = (moduleName) => {
  return async (req, res, next) => {
    try {
      const teamUser = req.teamUser;
      
      if (!teamUser) {
        return res.status(401).json({ 
          success: false,
          message: 'Authentication required' 
        });
      }

      // Admin and super admin have access to all modules
      if (teamUser.role === 'admin' || teamUser.role === 'super_admin') {
        return next();
      }

      // Check if team user has access to the requested module
      // In production, this should check against database permissions
      // For now, we allow all team members access to basic modules
      const allowedModules = [
        'users', 'doctors', 'appointments', 'chat', 
        'hospitals', 'pharmacies', 'plans', 'reports',
        'team_directory', 'profile', 'notifications'
      ];

      if (!allowedModules.includes(moduleName)) {
        return res.status(403).json({ 
          success: false,
          message: `Access denied to ${moduleName} module` 
        });
      }

      next();
    } catch (error) {
      console.error('Module access check error:', error);
      return res.status(500).json({ 
        success: false,
        message: 'Error checking module access' 
      });
    }
  };
};

/**
 * Middleware to check if team member has specific permission
 */
export const requirePermission = (permissionName) => {
  return async (req, res, next) => {
    try {
      const teamUser = req.teamUser;
      
      if (!teamUser) {
        return res.status(401).json({ 
          success: false,
          message: 'Authentication required' 
        });
      }

      // Admin and super admin have all permissions
      if (teamUser.role === 'admin' || teamUser.role === 'super_admin') {
        return next();
      }

      // In production, check against user's actual permissions from database
      // For now, we allow basic permissions for all team members
      console.log(`Team user ${teamUser.email} accessing ${permissionName}`);
      
      next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({ 
        success: false,
        message: 'Error checking permission' 
      });
    }
  };
};

/**
 * Middleware to check if team member can edit (write access)
 * By default, team members have view-only access
 * Edit access must be explicitly granted by admin
 */
export const requireEditAccess = (moduleName) => {
  return async (req, res, next) => {
    try {
      const teamUser = req.teamUser;
      
      if (!teamUser) {
        return res.status(401).json({ 
          success: false,
          message: 'Authentication required' 
        });
      }

      // Admin and super admin have edit access to everything
      if (teamUser.role === 'admin' || teamUser.role === 'super_admin') {
        req.hasEditAccess = true;
        return next();
      }

      // Check if team user has edit privileges for this module
      // In production, this should fetch from database based on admin configuration
      // For now, check from token or session data
      const editableModules = teamUser.editableModules || [];
      const hasEditAccess = editableModules.includes(moduleName);

      if (!hasEditAccess) {
        return res.status(403).json({ 
          success: false,
          message: `View-only access. Edit permission required for ${moduleName} module.`,
          viewOnly: true
        });
      }

      req.hasEditAccess = true;
      next();
    } catch (error) {
      console.error('Edit access check error:', error);
      return res.status(500).json({ 
        success: false,
        message: 'Error checking edit access' 
      });
    }
  };
};

/**
 * Middleware to attach access level to request
 * Does not block, just adds information for controllers to use
 */
export const attachAccessLevel = async (req, res, next) => {
  try {
    const teamUser = req.teamUser;
    
    if (!teamUser) {
      req.accessLevel = 'none';
      return next();
    }

    // Admin and super admin have full access
    if (teamUser.role === 'admin' || teamUser.role === 'super_admin') {
      req.accessLevel = 'full';
      req.canView = true;
      req.canEdit = true;
      req.canDelete = true;
      return next();
    }

    // Team members have view access by default
    // Edit/Delete access based on privileges
    const editableModules = teamUser.editableModules || [];
    const deletableModules = teamUser.deletableModules || [];

    req.accessLevel = 'view';
    req.canView = true;
    req.canEdit = false;
    req.canDelete = false;
    req.editableModules = editableModules;
    req.deletableModules = deletableModules;

    next();
  } catch (error) {
    console.error('Access level attachment error:', error);
    req.accessLevel = 'view';
    req.canView = true;
    req.canEdit = false;
    req.canDelete = false;
    next();
  }
};

export default { authTeam, requireModule, requirePermission, requireEditAccess, attachAccessLevel };
