import jwt from 'jsonwebtoken';
import { ipKeyGenerator } from 'express-rate-limit';
import { JWT_CONFIG } from '../config/auth.config.js';
import { COOKIE_NAMES } from '../config/cookies.config.js';

// This identity is only a rate-limit bucket, never an authorization decision.
export function identifyRateLimitAccount(req, _res, next) {
  // Login, OTP and password recovery remain IP-limited even if an old access
  // token accompanies the request.
  const path = (req.originalUrl || req.path || '').split('?')[0];
  if (/(?:^|\/)(?:login|signin|signup|register|otp|send-otp|verify-otp|password-reset|forgot-password|reset-password)(?:\/|$)/i.test(path)) return next();
  const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  const token = bearer ? bearer[1].trim() : req.cookies?.[COOKIE_NAMES.ACCESS];
  if (token) {
    try {
      const claims = jwt.verify(token, JWT_CONFIG.SECRET, { algorithms: [JWT_CONFIG.ALGORITHM] });
      const id = claims.id;
      const kind = claims.userType || claims.role || 'user';
      if ((typeof id === 'string' || typeof id === 'number') && String(id).length > 0 &&
          typeof kind === 'string' && !/refresh/i.test(String(claims.type || ''))) {
        req.rateLimitAccountKey = `account:${encodeURIComponent(kind)}:${encodeURIComponent(String(id))}`;
      }
    } catch { /* Invalid or expired tokens share the unauthenticated IP budget. */ }
  }
  next();
}

export function accountOrIpRateLimitKey(req) {
  return req.rateLimitAccountKey || `ip:${ipKeyGenerator(req.ip)}`;
}
