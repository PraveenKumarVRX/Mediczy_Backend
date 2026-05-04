/**
 * Lab Authentication Middleware
 * Verifies JWT token issued by Lab.generateAuthToken()
 */
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';

export const authLab = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_CONFIG.SECRET);

    if (decoded.role !== 'lab') {
      return res.status(403).json({ success: false, message: 'Not a lab account' });
    }

    req.lab = decoded; // { id, email, role, labName, isVerified, department }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired' });
    }
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};
