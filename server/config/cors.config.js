/**
 * Header lists shared by the CORS middleware and the explicit preflight handler in app.js.
 *
 * Idempotency-Key, X-Device-Id, X-Correlation-Id and X-App-Version are sent by the phlebotomy
 * collection app (docs/api/PHLEBOTOMY_MOBILE_API_INTEGRATION.md); without them in the allow list a
 * browser preflight fails. Idempotent-Replayed must be exposed so JavaScript can read whether a
 * write was replayed. Origins are separate: add a web build's origin to CORS_ORIGIN.
 */
export const CORS_ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Requested-With',
  'Accept',
  'Origin',
  'Cookie',
  'Idempotency-Key',
  'X-Device-Id',
  'X-Correlation-Id',
  'X-App-Version',
];

export const CORS_EXPOSED_HEADERS = ['Idempotent-Replayed'];
