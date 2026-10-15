import { createHash } from 'node:crypto';
import pool from '../db/pgPool.js';

const KEY_RE = /^[a-z][a-z0-9_.:-]{1,127}$/;
const ENV_NAME_RE = /[^A-Z0-9]+/g;

export function assertFlagKey(key) {
  const value = String(key || '').trim();
  if (!KEY_RE.test(value)) {
    const error = new Error('Flag key must start with a lowercase letter and contain only lowercase letters, digits, _, ., :, or -');
    error.statusCode = 400;
    error.code = 'invalid_flag_key';
    throw error;
  }
  return value;
}

const envName = (key) => `FEATURE_FLAG_${key.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()}`;
const envBool = (value) => {
  if (value === undefined) return undefined;
  if (['1', 'true', 'on', 'yes'].includes(String(value).toLowerCase())) return true;
  if (['0', 'false', 'off', 'no'].includes(String(value).toLowerCase())) return false;
  return undefined;
};

const actorUid = (actor) => actor?.uid || actor?.unique_id || actor?.userUid || actor?.id || null;
const rolloutBucket = (key, subject) => parseInt(createHash('sha256').update(`${key}:${subject}`).digest('hex').slice(0, 8), 16) % 100;

function evaluateValues(key, flag, override, context = {}) {
  const killEnv = envBool(process.env[`${envName(key)}_KILL_SWITCH`]);
  if (killEnv === true || flag?.kill_switch === true) {
    return { enabled: false, key, source: killEnv === true ? 'environment_kill_switch' : 'kill_switch', rolloutPercentage: 0, killSwitch: true };
  }

  const envOverride = envBool(process.env[envName(key)]);
  const enabled = override?.enabled ?? flag?.default_enabled ?? envOverride ?? false;
  const percentage = override?.rollout_percentage ?? flag?.rollout_percentage ?? 100;
  if (!enabled || percentage <= 0) return { enabled: false, key, source: override ? 'tenant_override' : flag ? 'registry' : envOverride !== undefined ? 'environment' : 'default', rolloutPercentage: percentage, killSwitch: false };

  const subject = String(context.subject || context.tenantUid || context.userUid || 'global');
  const inRollout = percentage >= 100 || rolloutBucket(key, subject) < percentage;
  return { enabled: inRollout, key, source: override ? 'tenant_override' : flag ? 'registry' : 'environment', rolloutPercentage: percentage, killSwitch: false };
}

/** Resolve a flag for a request. Missing/unavailable registry data is disabled unless an explicit env fallback exists. */
export async function evaluateFlag(key, context = {}, db = pool) {
  const normalized = assertFlagKey(key);
  try {
    const { rows: flags } = await db.query(
      `SELECT key, description, default_enabled, rollout_percentage, kill_switch, metadata
         FROM feature_flags WHERE key=$1 LIMIT 1`, [normalized],
    );
    let flag = flags[0] || null;
    // Legacy routes can opt into the registry without changing their existing
    // deployment variable. Once an admin creates the registry row, the row
    // becomes authoritative and the legacy variable is ignored.
    if (!flag && context.fallbackEnv) {
      const fallback = envBool(process.env[context.fallbackEnv]);
      if (fallback !== undefined) flag = { default_enabled: fallback, rollout_percentage: 100, kill_switch: false };
    }
    let override = null;
    if (context.tenantUid) {
      const { rows } = await db.query(
        `SELECT enabled, rollout_percentage, metadata
           FROM tenant_feature_flags WHERE tenant_uid=$1 AND flag_key=$2 LIMIT 1`,
        [String(context.tenantUid), normalized],
      );
      override = rows[0] || null;
    }
    return evaluateValues(normalized, flag, override, context);
  } catch (error) {
    const legacyOverride = envBool(context.fallbackEnv ? process.env[context.fallbackEnv] : undefined);
    const envOverride = envBool(process.env[envName(normalized)]) ?? legacyOverride;
    const result = evaluateValues(normalized, envOverride === undefined ? null : { default_enabled: envOverride, rollout_percentage: 100 }, null, context);
    return { ...result, enabled: envOverride === true, source: envOverride === undefined ? 'registry_unavailable' : 'environment' };
  }
}

export function requireFeatureFlag(key, options = {}) {
  const normalized = assertFlagKey(key);
  return async (req, res, next) => {
    const tenantUid = options.tenantUid
      ? options.tenantUid(req)
      : req.crmUser?.tenantUid || req.user?.tenant_uid || req.user?.organization_uid || req.tenantContext?.tenantUid || null;
    const result = await evaluateFlag(normalized, {
      tenantUid,
      userUid: req.crmUser?.uid || req.user?.uid || req.user?.id,
      subject: options.subject ? options.subject(req) : tenantUid,
      fallbackEnv: options.fallbackEnv,
    });
    req.featureFlags = { ...(req.featureFlags || {}), [normalized]: result };
    if (!result.enabled) {
      return res.status(options.status || 404).json({ success: false, code: 'feature_disabled', message: options.message || 'Capability is not enabled' });
    }
    return next();
  };
}

export async function listFlags(tenantUid, db = pool) {
  const { rows } = await db.query(
    `SELECT f.key, f.description, f.default_enabled, f.rollout_percentage, f.kill_switch, f.metadata,
            t.enabled AS tenant_enabled, t.rollout_percentage AS tenant_rollout_percentage, t.metadata AS tenant_metadata
       FROM feature_flags f
       LEFT JOIN tenant_feature_flags t ON t.flag_key=f.key AND t.tenant_uid=$1
      ORDER BY f.key`, [tenantUid || null],
  );
  return rows.map((row) => ({
    key: row.key,
    description: row.description,
    defaultEnabled: row.default_enabled,
    rolloutPercentage: row.rollout_percentage,
    killSwitch: row.kill_switch,
    metadata: row.metadata || {},
    tenantOverride: row.tenant_enabled === null && row.tenant_rollout_percentage === null ? null : {
      enabled: row.tenant_enabled,
      rolloutPercentage: row.tenant_rollout_percentage,
      metadata: row.tenant_metadata || {},
    },
    effective: evaluateValues(row.key, row, row.tenant_enabled === null && row.tenant_rollout_percentage === null ? null : {
      enabled: row.tenant_enabled,
      rollout_percentage: row.tenant_rollout_percentage,
    }, { tenantUid }),
  }));
}

async function audit(client, { key, tenantUid = null, action, previousValue, nextValue, actor }) {
  await client.query(
    `INSERT INTO feature_flag_audit (flag_key, tenant_uid, action, previous_value, next_value, actor_uid)
     VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6)`,
    [key, tenantUid, action, JSON.stringify(previousValue ?? null), JSON.stringify(nextValue ?? null), actorUid(actor)],
  );
}

export async function upsertFlag(input, actor, db = pool) {
  const key = assertFlagKey(input.key);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const before = (await client.query('SELECT * FROM feature_flags WHERE key=$1 FOR UPDATE', [key])).rows[0] || null;
    const values = {
      description: input.description !== undefined ? String(input.description || '') : before?.description || '',
      defaultEnabled: input.defaultEnabled !== undefined ? Boolean(input.defaultEnabled) : Boolean(before?.default_enabled),
      rolloutPercentage: input.rolloutPercentage !== undefined ? Number(input.rolloutPercentage) : Number(before?.rollout_percentage ?? 100),
      killSwitch: input.killSwitch !== undefined ? Boolean(input.killSwitch) : Boolean(before?.kill_switch),
      metadata: input.metadata !== undefined ? input.metadata : (before?.metadata || {}),
    };
    if (!Number.isInteger(values.rolloutPercentage) || values.rolloutPercentage < 0 || values.rolloutPercentage > 100) {
      const error = new Error('rolloutPercentage must be an integer between 0 and 100'); error.statusCode = 400; error.code = 'invalid_rollout_percentage'; throw error;
    }
    const result = (await client.query(
      `INSERT INTO feature_flags (key, description, default_enabled, rollout_percentage, kill_switch, metadata)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb)
       ON CONFLICT (key) DO UPDATE SET description=EXCLUDED.description,
         default_enabled=EXCLUDED.default_enabled, rollout_percentage=EXCLUDED.rollout_percentage,
         kill_switch=EXCLUDED.kill_switch, metadata=EXCLUDED.metadata, updated_at=NOW()
       RETURNING *`,
      [key, values.description, values.defaultEnabled, values.rolloutPercentage, values.killSwitch, JSON.stringify(values.metadata)],
    )).rows[0];
    await audit(client, { key, action: before ? 'update' : 'create', previousValue: before, nextValue: result, actor });
    await client.query('COMMIT');
    return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function deleteFlag(key, actor, db = pool) {
  const normalized = assertFlagKey(key);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const before = (await client.query('DELETE FROM feature_flags WHERE key=$1 RETURNING *', [normalized])).rows[0] || null;
    if (before) await audit(client, { key: normalized, action: 'delete', previousValue: before, actor });
    await client.query('COMMIT');
    return Boolean(before);
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function upsertTenantOverride(flagKey, tenantUid, input, actor, db = pool) {
  const key = assertFlagKey(flagKey);
  if (!String(tenantUid || '').trim()) { const error = new Error('tenantUid is required'); error.statusCode = 400; throw error; }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const before = (await client.query('SELECT * FROM tenant_feature_flags WHERE tenant_uid=$1 AND flag_key=$2 FOR UPDATE', [tenantUid, key])).rows[0] || null;
    const values = {
      enabled: input.enabled !== undefined ? (input.enabled === null ? null : Boolean(input.enabled)) : (before?.enabled ?? null),
      rolloutPercentage: input.rolloutPercentage !== undefined ? (input.rolloutPercentage === null ? null : Number(input.rolloutPercentage)) : (before?.rollout_percentage ?? null),
      metadata: input.metadata !== undefined ? input.metadata : (before?.metadata || {}),
    };
    if (values.rolloutPercentage !== null && (!Number.isInteger(values.rolloutPercentage) || values.rolloutPercentage < 0 || values.rolloutPercentage > 100)) {
      const error = new Error('rolloutPercentage must be an integer between 0 and 100'); error.statusCode = 400; error.code = 'invalid_rollout_percentage'; throw error;
    }
    const result = (await client.query(
      `INSERT INTO tenant_feature_flags (tenant_uid, flag_key, enabled, rollout_percentage, metadata)
       VALUES ($1,$2,$3,$4,$5::jsonb)
       ON CONFLICT (tenant_uid, flag_key) DO UPDATE SET enabled=EXCLUDED.enabled,
         rollout_percentage=EXCLUDED.rollout_percentage, metadata=EXCLUDED.metadata, updated_at=NOW()
       RETURNING *`,
      [String(tenantUid), key, values.enabled, values.rolloutPercentage, JSON.stringify(values.metadata)],
    )).rows[0];
    await audit(client, { key, tenantUid: String(tenantUid), action: 'tenant_override_upsert', previousValue: before, nextValue: result, actor });
    await client.query('COMMIT');
    return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function deleteTenantOverride(flagKey, tenantUid, actor, db = pool) {
  const key = assertFlagKey(flagKey);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const before = (await client.query('DELETE FROM tenant_feature_flags WHERE tenant_uid=$1 AND flag_key=$2 RETURNING *', [String(tenantUid), key])).rows[0] || null;
    if (before) await audit(client, { key, tenantUid: String(tenantUid), action: 'tenant_override_delete', previousValue: before, actor });
    await client.query('COMMIT');
    return Boolean(before);
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
