/**
 * Turning an integration failure into an honest API response.
 *
 * Routes call sendIntegrationError(res, error, fallback) in their catch block.
 * An IntegrationError becomes its own status (503 unavailable / switched off /
 * not configured, 502 bad vendor answer, 404/400 for a vendor "not found" or
 * "bad request") with a stable `code` the app can switch on; anything else
 * stays a 500 with the route's message. Vendor messages and payloads are never
 * echoed to the client.
 */
import { IntegrationError } from './core/integration.js';

const RETRYABLE = new Set(['INTEGRATION_UNAVAILABLE', 'INTEGRATION_TIMEOUT', 'INTEGRATION_CIRCUIT_OPEN', 'INTEGRATION_UPSTREAM_ERROR']);

export function sendIntegrationError(res, error, fallbackMessage = 'Something went wrong.') {
  if (error instanceof IntegrationError) {
    if (error.code === 'INTEGRATION_CIRCUIT_OPEN') res.set('Retry-After', '60');
    return res.status(error.status || 503).json({
      success: false,
      code: error.code,
      message: error.message,
      retryable: RETRYABLE.has(error.code),
    });
  }
  return res.status(500).json({ success: false, message: fallbackMessage });
}

export default { sendIntegrationError };
