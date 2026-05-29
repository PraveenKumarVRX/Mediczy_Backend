/**
 * Aggregator (Insurance Broker) Authentication Middleware.
 *
 * Gaps closed vs. the previous authUser chain:
 *   1. DB re-check: fetches InsuranceBroker on every request.
 *   2. isActive + status + isVerified: all three checked per request.
 *   3. JTI revocation: checked via portal_refresh_tokens.
 *   4. Sets req.aggregatorUser for consistent downstream access.
 */
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';
import { InsuranceBroker } from '../models/index.js';
import { isTokenRevoked } from '../services/token-revocation.service.js';

export const authAggregator = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'No authorization token provided' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_CONFIG.SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ success: false, message: 'Token expired. Please login again.' });
      }
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }

    if (decoded.tokenType && decoded.tokenType !== 'access') {
      return res.status(401).json({ success: false, message: 'Invalid token type' });
    }

    if (decoded.role !== 'aggregator' && decoded.role !== 'insurance_broker') {
      return res.status(403).json({ success: false, message: 'Access denied. Aggregator privileges required.' });
    }

    // JTI revocation check
    if (decoded.jti && await isTokenRevoked(decoded.jti)) {
      return res.status(401).json({ success: false, message: 'Token has been revoked' });
    }

    // DB re-validation
    const aggregator = await InsuranceBroker.findByPk(decoded.id, {
      attributes: ['id', 'email', 'brokerName', 'status', 'isActive', 'isVerified'],
    });

    if (!aggregator) {
      return res.status(401).json({ success: false, message: 'Aggregator account not found' });
    }
    if (aggregator.status !== 'active') {
      return res.status(403).json({ success: false, message: 'Aggregator account is not active. Contact admin.' });
    }
    if (aggregator.isActive === false) {
      return res.status(403).json({ success: false, message: 'Aggregator account has been disabled.' });
    }
    if (!aggregator.isVerified) {
      return res.status(403).json({ success: false, message: 'Aggregator account is pending verification.' });
    }

    req.aggregatorUser = {
      id: aggregator.id,
      email: aggregator.email,
      brokerName: aggregator.brokerName,
      role: 'aggregator',
    };
    req.user = { id: aggregator.id, email: aggregator.email, role: 'aggregator' };
    req.userRole = 'aggregator';
    next();
  } catch (error) {
    console.error('[authAggregator] error:', error.message);
    return res.status(500).json({ success: false, message: 'Authentication error' });
  }
};

export default { authAggregator };
