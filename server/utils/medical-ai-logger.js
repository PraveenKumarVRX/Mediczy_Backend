/**
 * Safe logging utility for Medical AI routes.
 * Prevents Protected Health Information (PHI) reaching stdout/CloudWatch in production.
 * In development, full detail is logged for debugging.
 */

import crypto from 'crypto';

const IS_PROD = process.env.NODE_ENV === 'production';

const PHI_FIELDS = new Set([
  'symptoms', 'description', 'query', 'message', 'response',
  'allergies', 'medicalHistory', 'medications', 'visionAnalysis',
  'location', 'address', 'guestEmail', 'guestPhone'
]);

function sanitize(data) {
  if (!data || typeof data !== 'object') return data;
  const safe = {};
  for (const [k, v] of Object.entries(data)) {
    if (PHI_FIELDS.has(k)) {
      safe[`${k}_hash`] = typeof v === 'string'
        ? crypto.createHash('sha256').update(v).digest('hex').slice(0, 8)
        : '[redacted]';
    } else {
      safe[k] = v;
    }
  }
  return safe;
}

export function medLog(level, message, data = {}) {
  const payload = IS_PROD ? sanitize(data) : data;
  console[level]?.(`[medical-ai] ${message}`, payload) ?? console.log(`[medical-ai] ${message}`, payload);
}

export const mlog  = (msg, data)  => medLog('log',   msg, data);
export const mwarn = (msg, data)  => medLog('warn',  msg, data);
export const merr  = (msg, data)  => medLog('error', msg, data);
