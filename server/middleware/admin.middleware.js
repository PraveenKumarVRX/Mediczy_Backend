// Admin authentication middleware
import { JWT_CONFIG } from '../config/auth.config.js';
import jwt from 'jsonwebtoken';

export const adminAuthMiddleware = (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authorization required'
      });
    }

    const decoded = jwt.verify(token, JWT_CONFIG.SECRET || 'mediczy_secret_key');
    
    // Check if user is admin or team member
    const allowedRoles = ['admin', 'super_admin', 'team'];
    if (!decoded.isAdmin && !allowedRoles.includes(decoded.role)) {
      return res.status(403).json({
        success: false,
        error: 'Admin or team access required'
      });
    }

    req.admin = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Invalid token'
    });
  }
};

export default adminAuthMiddleware;