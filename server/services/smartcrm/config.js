/**
 * SmartCRM integration — switches and bindings (ADR-001).
 *
 * Two independent switches must both be on before any call leaves this box:
 *
 *   1. SMARTCRM_INTEGRATION_ENABLED=true in the process environment — the
 *      global kill switch. Turning it off stops every partner call at once,
 *      without a deploy and without touching a binding.
 *   2. A smartcrm_corporate_bindings row for the member's corporate with
 *      read_enabled = true (reads), and enrolment_mode = 'in_app' (writes).
 *
 * The partner key for a corporate lives in the environment variable that the
 * binding NAMES (api_key_env). The database never holds a key.
 */
import pool from '../../db/pgPool.js';

export const SOURCE_SYSTEM = 'smartcrm';
export const PARTNER_PREFIX = '/api/v2/partner/mediqzy/';
const KEY_ENV_PATTERN = /^SMARTCRM_KEY_[A-Z0-9_]{1,60}$/;
const MISSING_SCHEMA = new Set(['42P01', '42703']);

export class SmartCrmError extends Error {
  constructor(code, message, status = 503, details = undefined) {
    super(message);
    this.name = 'SmartCrmError';
    this.code = code;
    this.status = status;
    if (details !== undefined) this.details = details;
  }
}

export const integrationEnabled = () =>
  String(process.env.SMARTCRM_INTEGRATION_ENABLED || '').trim().toLowerCase() === 'true';

/** https only, no path, query or credentials: the client appends the prefix itself. */
export function partnerBaseUrl() {
  const raw = String(process.env.SMARTCRM_PARTNER_BASE_URL || '').trim();
  if (!raw) return null;
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
  if (url.pathname && url.pathname !== '/') return null;
  return url.origin;
}

export function apiKeyFor(binding) {
  const name = binding?.api_key_env;
  if (!name || !KEY_ENV_PATTERN.test(name)) return null;
  const key = String(process.env[name] || '').trim();
  return key || null;
}

// Positive answers only: the code ships before the migration is applied, and
// a remembered "not there" would outlive the migration until a reload.
let schemaReady = false;
export async function schemaAvailable(db = pool) {
  if (schemaReady) return true;
  try {
    const { rows } = await db.query(
      `SELECT to_regclass('public.smartcrm_corporate_bindings') IS NOT NULL AS b,
              to_regclass('public.insurance_member_links') IS NOT NULL AS l,
              to_regclass('public.insurance_enrolment_requests') IS NOT NULL AS r`
    );
    schemaReady = Boolean(rows[0]?.b && rows[0]?.l && rows[0]?.r);
  } catch {
    return false;
  }
  return schemaReady;
}
export const _resetSchemaProbe = () => { schemaReady = false; };

const isMissingSchema = (error) => MISSING_SCHEMA.has(error?.code || error?.original?.code);

export async function loadBinding(corporateId, db = pool) {
  const id = Number(corporateId);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  if (!(await schemaAvailable(db))) return null;
  try {
    const { rows } = await db.query(
      `SELECT id, corporate_id, tenant_slug, smartcrm_corporate, api_key_env,
              read_enabled, enrolment_mode, web_enrolment_url
         FROM smartcrm_corporate_bindings
        WHERE corporate_id = $1`,
      [id]
    );
    return rows[0] || null;
  } catch (error) {
    if (isMissingSchema(error)) return null;
    throw error;
  }
}

/** Bindings for several corporates at once, keyed by corporate id. */
export async function loadBindings(corporateIds, db = pool) {
  const ids = [...new Set((corporateIds || []).map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))];
  const out = new Map();
  if (!ids.length || !(await schemaAvailable(db))) return out;
  try {
    const { rows } = await db.query(
      `SELECT id, corporate_id, tenant_slug, smartcrm_corporate, api_key_env,
              read_enabled, enrolment_mode, web_enrolment_url
         FROM smartcrm_corporate_bindings
        WHERE corporate_id = ANY($1::int[])`,
      [ids]
    );
    for (const row of rows) out.set(Number(row.corporate_id), row);
  } catch (error) {
    if (!isMissingSchema(error)) throw error;
  }
  return out;
}

/**
 * The enrolment mode the member actually gets for a binding. 'in_app' and
 * 'web' are downgraded to 'off' when the kill switch is off, and 'web' needs
 * a URL to send the member to.
 */
export function effectiveEnrolmentMode(binding) {
  if (!binding) return 'off';
  const mode = binding.enrolment_mode;
  if (mode === 'web') return binding.web_enrolment_url ? 'web' : 'off';
  if (mode === 'in_app') return integrationEnabled() && binding.read_enabled ? 'in_app' : 'off';
  return 'off';
}

export default {
  SOURCE_SYSTEM, PARTNER_PREFIX, SmartCrmError, integrationEnabled, partnerBaseUrl,
  apiKeyFor, schemaAvailable, loadBinding, loadBindings, effectiveEnrolmentMode,
};
