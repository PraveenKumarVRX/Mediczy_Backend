/**
 * HealthOS Stage 4 — Developer platform (API keys + webhooks)
 */
import crypto from 'crypto';
import pool from '../../db/pgPool.js';
import { up as migrate } from '../../migrations/healthos-phases-2-4.migration.js';

let ready = false;
async function ensure() { if (!ready) { await migrate(); ready = true; } }

function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export async function createApiKey({ organizationId, name, scopes, createdBy, expiresInDays }) {
  await ensure();
  const rawKey = `hos_${crypto.randomBytes(24).toString('hex')}`;
  const prefix = rawKey.slice(0, 12);
  const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 86400000) : null;
  const { rows } = await pool.query(
    `INSERT INTO healthos_api_keys (organization_id, name, key_prefix, key_hash, scopes, created_by, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, organization_id, name, key_prefix, scopes, created_at, expires_at`,
    [organizationId, name, prefix, hashKey(rawKey), scopes || ['read'], createdBy, expiresAt]
  );
  return { ...rows[0], apiKey: rawKey };
}

export async function listApiKeys(organizationId) {
  await ensure();
  const { rows } = await pool.query(
    `SELECT id, organization_id, name, key_prefix, scopes, last_used_at, expires_at, revoked_at, created_at
     FROM healthos_api_keys WHERE organization_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC`,
    [organizationId]
  );
  return rows;
}

export async function registerWebhook({ organizationId, url, events, createdBy }) {
  await ensure();
  const secret = crypto.randomBytes(16).toString('hex');
  const { rows } = await pool.query(
    `INSERT INTO healthos_webhooks (organization_id, url, events, secret_hash, created_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING id, organization_id, url, events, status, created_at`,
    [organizationId, url, events, hashKey(secret), createdBy]
  );
  return { ...rows[0], webhookSecret: secret };
}

export async function listWebhooks(organizationId) {
  await ensure();
  const { rows } = await pool.query(
    `SELECT id, organization_id, url, events, status, created_at FROM healthos_webhooks
     WHERE organization_id = $1 AND status = 'active'`,
    [organizationId]
  );
  return rows;
}

export default { createApiKey, listApiKeys, registerWebhook, listWebhooks };
