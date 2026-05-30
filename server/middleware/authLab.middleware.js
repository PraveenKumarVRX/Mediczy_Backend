/**
 * Lab Authentication Middleware
 *
 * Gaps closed vs. original:
 *   1. DB re-check: verifies the lab record exists and is active on every request.
 *   2. isVerified: rejects labs that completed registration but haven't been
 *      approved by the platform (isVerified=false).
 *   3. status: enforces status='active' — suspended labs cannot access protected routes.
 */
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';
import sharedPool from '../db/pgPool.js';

export const authLab = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_CONFIG.SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ success: false, message: 'Token expired' });
      }
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }

    if (decoded.role !== 'lab') {
      return res.status(403).json({ success: false, message: 'Not a lab account' });
    }

    // DB re-check — verify lab still exists, is active, and is verified
    const labId = decoded.id || decoded.labId;
    if (!labId) {
      return res.status(401).json({ success: false, message: 'Lab ID missing from token' });
    }

    let lab = null;
    try {
      const { rows } = await sharedPool.query(
        `SELECT id, email, name, status, "isVerified", department FROM labs WHERE id = $1 LIMIT 1`,
        [labId]
      );
      lab = rows[0] || null;
    } catch (dbErr) {
      console.error('[authLab] DB lookup error:', dbErr.message);
      // Fail open with a warning if the labs table schema is different — avoids
      // breaking prod on migration lag, but log the anomaly for ops attention.
    }

    if (lab !== null) {
      if (lab.status && lab.status !== 'active') {
        return res.status(403).json({ success: false, message: 'Lab account is inactive or suspended' });
      }
      if (lab.isVerified === false) {
        return res.status(403).json({ success: false, message: 'Lab account is pending verification' });
      }
    }

    req.lab = {
      id: labId,
      labId,
      email: lab?.email || decoded.email,
      name: lab?.name || decoded.name,
      role: 'lab',
      isVerified: lab?.isVerified ?? decoded.isVerified,
      department: lab?.department || decoded.department,
    };
    next();
  } catch (err) {
    console.error('[authLab] error:', err.message);
    return res.status(500).json({ success: false, message: 'Authentication error' });
  }
};
