/**
 * Mediczy — Standardised API response helpers
 *
 * Usage:
 *   import { ok, clientError, serverError, notFound, forbidden } from '../utils/api-response.js';
 *
 *   return ok(res, { user });
 *   return clientError(res, 'Coupon already used', ErrorCodes.COUPON_ALREADY_USED);
 *   return serverError(res, error);
 *
 * All responses have the shape:
 *   { success: bool, code?: string, message?: string, data?: any, errors?: array }
 *
 * HTTP status is ALWAYS correct:
 *   2xx  — success: true
 *   4xx  — success: false, code present
 *   5xx  — success: false, code: INTERNAL_ERROR (no internal detail in production)
 */

import { ErrorCodes } from './error-codes.js';

const isProd = () => process.env.NODE_ENV === 'production';

// ── 2xx ───────────────────────────────────────────────────────────────────────

/** 200 OK */
export const ok = (res, data = {}, message) =>
  res.status(200).json({ success: true, ...(message ? { message } : {}), ...data });

/** 201 Created */
export const created = (res, data = {}, message) =>
  res.status(201).json({ success: true, ...(message ? { message } : {}), ...data });

/** 204 No Content */
export const noContent = (res) => res.status(204).end();

// ── 4xx ───────────────────────────────────────────────────────────────────────

/**
 * 400 Bad Request — validation failure or invalid input.
 * @param {import('express').Response} res
 * @param {string} message
 * @param {string} [code]
 * @param {Array}  [errors]  express-validator errors array
 */
export const clientError = (res, message, code = ErrorCodes.INVALID_INPUT, errors) =>
  res.status(400).json({
    success: false,
    code,
    message,
    ...(errors?.length ? { errors } : {}),
  });

/** 401 Unauthenticated */
export const unauthorized = (res, message = 'Authentication required', code = ErrorCodes.UNAUTHORIZED) =>
  res.status(401).json({ success: false, code, message });

/** 403 Forbidden */
export const forbidden = (res, message = 'You do not have permission to perform this action', code = ErrorCodes.FORBIDDEN) =>
  res.status(403).json({ success: false, code, message });

/** 404 Not Found */
export const notFound = (res, message = 'Resource not found', code = ErrorCodes.NOT_FOUND) =>
  res.status(404).json({ success: false, code, message });

/** 409 Conflict — duplicate resource or state conflict */
export const conflict = (res, message, code = ErrorCodes.ALREADY_EXISTS) =>
  res.status(409).json({ success: false, code, message });

/** 422 Unprocessable — passes validation but fails business rules */
export const unprocessable = (res, message, code = ErrorCodes.INVALID_INPUT) =>
  res.status(422).json({ success: false, code, message });

/** 429 Too Many Requests */
export const tooManyRequests = (res, message = 'Too many requests. Please slow down.', code = ErrorCodes.RATE_LIMIT_EXCEEDED) =>
  res.status(429).json({ success: false, code, message });

// ── 5xx ───────────────────────────────────────────────────────────────────────

/**
 * 500 Internal Server Error.
 * Always logs full error to console; only exposes detail in non-production.
 */
export const serverError = (res, error, message = 'An unexpected error occurred. Please try again.') => {
  console.error('[API] 500:', error);
  return res.status(500).json({
    success: false,
    code: ErrorCodes.INTERNAL_ERROR,
    message,
    ...(isProd() ? {} : { detail: error?.message }),
  });
};

/** 503 Service Unavailable (AI / external dependency down) */
export const serviceUnavailable = (res, message = 'Service temporarily unavailable.', code = ErrorCodes.EXTERNAL_SERVICE_ERROR) =>
  res.status(503).json({ success: false, code, message });

// ── Validation helper ─────────────────────────────────────────────────────────

/**
 * Check express-validator result and send a 400 if invalid.
 * Returns true if validation passed (caller should continue), false if response was sent.
 *
 * Usage:
 *   if (!validateRequest(req, res)) return;
 */
import { validationResult } from 'express-validator';

export const validateRequest = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    clientError(res, 'Validation failed', ErrorCodes.VALIDATION_ERROR, errors.array());
    return false;
  }
  return true;
};
