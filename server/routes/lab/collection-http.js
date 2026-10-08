/** HTTP glue shared by the lab-portal and phlebotomist collection routers. */
import { CollectionError, invalid } from '../../services/collection/errors.js';

/** Map any thrown error to a stable JSON body. Unknown errors become a generic 500 with no internals. */
function fail(req, res, err) {
  if (err instanceof CollectionError) {
    return res.status(err.status).json({ success: false, code: err.code, message: err.message, ...(err.details && Object.keys(err.details).length ? { details: err.details } : {}) });
  }
  // Postgres invalid-text-representation on a malformed id etc. should never reach here (ids are validated), but never leak SQL.
  console.error(`[collection] ${req.method} ${req.originalUrl}:`, err.message);
  return res.status(500).json({ success: false, code: 'internal_error', message: 'Something went wrong' });
}

export function handle(fn) {
  return async (req, res) => {
    try { await fn(req, res); } catch (err) { fail(req, res, err); }
  };
}

/** Same error mapping for a middleware: `fn(req, res, next)` may throw a CollectionError. */
export function mw(fn) {
  return async (req, res, next) => {
    try { await fn(req, res, next); } catch (err) { fail(req, res, err); }
  };
}

/** Send a service result ({status, body, replayed}). */
export function send(res, result) {
  if (result.replayed) res.set('Idempotent-Replayed', 'true');
  return res.status(result.status).json({ success: result.status < 400, ...result.body });
}

const KEY = /^[A-Za-z0-9._:-]{8,128}$/;

/** Idempotency-Key + device + correlation headers. `required` for mobile mutations. */
export function operationMeta(req, { required = false } = {}) {
  const operationId = req.get('Idempotency-Key') || null;
  const deviceId = req.get('X-Device-Id') || null;
  if (required && !operationId) throw invalid('Idempotency-Key header is required', { header: 'Idempotency-Key' });
  if (operationId && !KEY.test(operationId)) throw invalid('Idempotency-Key must be 8-128 URL-safe characters', { header: 'Idempotency-Key' });
  if (required && !deviceId) throw invalid('X-Device-Id header is required', { header: 'X-Device-Id' });
  if (deviceId && !KEY.test(deviceId)) throw invalid('X-Device-Id must be 8-128 URL-safe characters', { header: 'X-Device-Id' });
  const correlationId = (req.get('X-Correlation-Id') || '').slice(0, 64) || null;
  return { operationId, deviceId, correlationId };
}
