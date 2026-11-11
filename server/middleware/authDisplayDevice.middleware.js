/**
 * Display / kiosk device authentication.
 * Mutations require x-device-token; organizationId is bound from device registry (never client body).
 */
import pool from '../db/pgPool.js';
import { schemaVerifier } from '../utils/schema-guard.js';

let _schemaReady = false;

const SCHEMA_TABLES = ['display_devices'];

// Verified, not created. This ran on the authentication path, so every kiosk
// request could issue DDL; it also swallowed its own failure, leaving a broken
// schema to surface later as a confusing auth error.
const verifyDisplaySchema = schemaVerifier({
  pool,
  tables: SCHEMA_TABLES,
  code: 'SCHEMA_NOT_MIGRATED',
  message: 'Apply migration 20261015004200-display-kiosk-governance before registering display devices',
});

export async function ensureDisplayDeviceSchema() {
  if (_schemaReady) return;
  await verifyDisplaySchema();
  _schemaReady = true;
}

function tokenFromReq(req) {
  return (
    req.headers['x-device-token'] ||
    req.headers['x-kiosk-token'] ||
    req.query.deviceToken ||
    req.body?.deviceToken ||
    null
  );
}

function orgFromDevice(device) {
  const config = typeof device.config === 'object' && device.config ? device.config : {};
  const fromCol = device.organization_id != null ? parseInt(device.organization_id, 10) : null;
  const fromCfg = config.organization_id != null ? parseInt(config.organization_id, 10) : null;
  const n = fromCol || fromCfg || parseInt(process.env.HOSPITAL_DEFAULT_ORG_ID || '1', 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

async function lookupDevice(token) {
  await ensureDisplayDeviceSchema();
  const { rows } = await pool.query(
    `SELECT * FROM display_devices WHERE device_token = $1 AND COALESCE(active, true) = true LIMIT 1`,
    [token],
  );
  return rows[0] || null;
}

/**
 * Strict: mutations / PHI endpoints — token required, org bound from registry.
 */
export async function requireDisplayDevice(req, res, next) {
  try {
    const token = tokenFromReq(req);
    if (!token) {
      return res.status(401).json({
        success: false,
        code: 'DEVICE_TOKEN_REQUIRED',
        message: 'x-device-token header is required for this display/kiosk endpoint',
      });
    }
    const device = await lookupDevice(token);
    if (!device) {
      return res.status(401).json({
        success: false,
        code: 'UNKNOWN_DEVICE',
        message: 'Unknown or inactive device token',
      });
    }
    const organizationId = orgFromDevice(device);
    req.displayDevice = device;
    req.organizationId = organizationId;
    req.qmsOrganizationId = organizationId;
    // Never trust client-supplied org on mutations
    if (req.body && typeof req.body === 'object') {
      delete req.body.organizationId;
      delete req.body.organization_id;
    }
    pool.query(
      `UPDATE display_devices SET last_seen = NOW() WHERE id = $1`,
      [device.id],
    ).catch(() => {});
    return next();
  } catch (e) {
    console.error('[requireDisplayDevice]', e.message);
    return res.status(500).json({ success: false, message: 'Device auth error' });
  }
}

/**
 * Shared resolution logic behind optionalDisplayDeviceOrDefaultOrg, factored
 * out so non-middleware call sites (the SSE stream) can reuse the exact same
 * trust model instead of re-implementing it.
 *
 * Returns { organizationId, displayDevice } on success, or { error: { status, body } }
 * when the caller should reject the request instead of proceeding.
 */
export async function resolveOptionalDisplayOrg(req) {
  try {
    const token = tokenFromReq(req);
    const requestedOrg = req.query.organizationId || req.query.organization_id;

    if (token) {
      const device = await lookupDevice(token);
      if (!device) {
        return { error: { status: 401, body: { success: false, code: 'UNKNOWN_DEVICE', message: 'Unknown device token' } } };
      }
      const organizationId = orgFromDevice(device);
      if (requestedOrg && parseInt(requestedOrg, 10) !== organizationId) {
        return { error: { status: 403, body: { success: false, code: 'ORG_MISMATCH', message: 'organizationId does not match device registry' } } };
      }
      return { organizationId, displayDevice: device };
    }

    if (requestedOrg) {
      return { error: { status: 401, body: { success: false, code: 'DEVICE_TOKEN_REQUIRED', message: 'x-device-token is required when organizationId is specified' } } };
    }

    return { organizationId: parseInt(process.env.HOSPITAL_DEFAULT_ORG_ID || '1', 10) };
  } catch (e) {
    console.error('[resolveOptionalDisplayOrg]', e.message);
    return { error: { status: 500, body: { success: false, message: 'Device auth error' } } };
  }
}

/**
 * Optional device auth for public read boards.
 * If token present → bind org from device.
 * If organizationId query present without token → 401 (prevents cross-tenant scrape).
 * If neither → default org (LAN single-tenant displays).
 */
export async function optionalDisplayDeviceOrDefaultOrg(req, res, next) {
  const result = await resolveOptionalDisplayOrg(req);
  if (result.error) return res.status(result.error.status).json(result.error.body);
  req.organizationId = result.organizationId;
  if (result.displayDevice) req.displayDevice = result.displayDevice;
  return next();
}

export default {
  requireDisplayDevice,
  optionalDisplayDeviceOrDefaultOrg,
  resolveOptionalDisplayOrg,
  ensureDisplayDeviceSchema,
};
