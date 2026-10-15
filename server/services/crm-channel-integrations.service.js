/**
 * Tenant-scoped CRM channel configuration.
 *
 * Credentials are encrypted at rest and never returned to the browser. This
 * registry is deliberately separate from the process-wide Team provider
 * environment variables, so one hospital/CRM tenant cannot overwrite another.
 */
import crypto from 'crypto';
import sharedPool from '../db/pgPool.js';

export const CRM_CHANNELS = Object.freeze([
  'email', 'whatsapp', 'sms', 'calls',
  'facebook', 'instagram', 'linkedin', 'google_ads', 'youtube',
]);

const SECRET_FIELDS = new Set([
  'password', 'smtpPassword', 'imapPassword', 'apiKey', 'accessToken',
  'authToken', 'authSecret', 'clientSecret', 'appSecret', 'privateKey',
]);

function validTenant(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw Object.assign(new Error('A valid tenantId is required'), { statusCode: 400 });
  return id;
}

function validChannel(value) {
  const channel = String(value || '').trim().toLowerCase();
  if (!CRM_CHANNELS.includes(channel)) {
    throw Object.assign(new Error(`Unsupported CRM channel. Choose one of: ${CRM_CHANNELS.join(', ')}`), { statusCode: 400 });
  }
  return channel;
}

function encryptionKey() {
  const raw = process.env.CRM_CREDENTIAL_ENCRYPTION_KEY;
  if (!raw || !/^[0-9a-f]{64}$/i.test(raw)) {
    throw Object.assign(new Error('CRM_CREDENTIAL_ENCRYPTION_KEY is not configured'), { statusCode: 503 });
  }
  return Buffer.from(raw, 'hex');
}

function encryptCredentials(credentials) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const plaintext = JSON.stringify(credentials);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptCredentials(value) {
  if (!value) return null;
  try {
    const [ivHex, tagHex, encryptedHex] = String(value).split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(encryptedHex, 'hex')), decipher.final()]).toString('utf8');
    return JSON.parse(plaintext);
  } catch {
    throw Object.assign(new Error('Stored channel credentials cannot be decrypted'), { statusCode: 503 });
  }
}

function cleanObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  for (const [key, val] of Object.entries(value)) {
    if (SECRET_FIELDS.has(key) || /token|secret|password|api.?key|private.?key/i.test(key)) continue;
    if (val == null || typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') result[key] = val;
  }
  return result;
}

function cleanCredentials(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw Object.assign(new Error('credentials must be an object'), { statusCode: 400 });
  }
  const result = {};
  for (const [key, val] of Object.entries(value)) {
    if (val == null || typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') result[key] = val;
  }
  if (!Object.keys(result).length) throw Object.assign(new Error('At least one credential field is required'), { statusCode: 400 });
  return result;
}

function safeRow(row) {
  const config = typeof row.config === 'string' ? JSON.parse(row.config || '{}') : (row.config || {});
  return {
    id: row.id,
    channel: row.channel || row.provider,
    provider: config.provider || row.provider,
    status: row.status,
    accountRef: row.account_ref,
    config: cleanObject(config),
    credentialsConfigured: Boolean(row.encrypted_credentials),
    credentialsUpdatedAt: row.credentials_updated_at,
    credentialsFingerprint: row.credentials_fingerprint,
    healthScore: row.health_score,
    healthMessage: row.health_message,
    lastHealthCheckAt: row.last_health_check_at,
    updatedAt: row.updated_at,
  };
}

export async function listCrmChannelIntegrations(tenant) {
  const id = validTenant(tenant);
  const result = await sharedPool.query(`
    SELECT id, provider, integration_type, status, account_ref, config,
      encrypted_credentials, credentials_updated_at, credentials_fingerprint,
      health_score, health_message, last_health_check_at, updated_at
    FROM crm_marketing_integrations
    WHERE tenant_id = $1 AND integration_type = 'communication'
    ORDER BY provider
  `, [id]);
  const byChannel = new Map(result.rows.map((row) => [row.provider, safeRow(row)]));
  return CRM_CHANNELS.map((channel) => byChannel.get(channel) || {
    channel, provider: null, status: 'not_configured', accountRef: null,
    config: {}, credentialsConfigured: false, credentialsUpdatedAt: null,
    credentialsFingerprint: null, healthScore: null, healthMessage: null,
    lastHealthCheckAt: null, updatedAt: null,
  });
}

export async function upsertCrmChannelIntegration(tenant, channelInput, input = {}, actorUserId = null) {
  const id = validTenant(tenant);
  const channel = validChannel(channelInput);
  const provider = String(input.provider || '').trim().toLowerCase();
  if (!provider || provider.length > 80) throw Object.assign(new Error('Provider is required'), { statusCode: 400 });
  const config = cleanObject({ ...(input.config || {}), provider });
  const hasCredentials = input.credentials !== undefined && input.credentials !== null;
  const credentials = hasCredentials ? cleanCredentials(input.credentials) : null;
  const fingerprint = credentials ? crypto.createHash('sha256').update(JSON.stringify(credentials)).digest('hex') : null;
  const encrypted = credentials ? encryptCredentials(credentials) : null;
  const result = await sharedPool.query(`
    INSERT INTO crm_marketing_integrations
      (tenant_id, provider, integration_type, status, account_ref, credentials_ref, config,
       encrypted_credentials, credentials_updated_at, credentials_fingerprint, health_message, created_by)
    VALUES ($1, $2, 'communication', $3, $4, $5, $6::jsonb, $7, CASE WHEN $7 IS NULL THEN NULL ELSE NOW() END,
      $8, $9, $10)
    ON CONFLICT (tenant_id, provider, integration_type) DO UPDATE SET
      status = EXCLUDED.status,
      account_ref = EXCLUDED.account_ref,
      credentials_ref = EXCLUDED.credentials_ref,
      config = EXCLUDED.config,
      encrypted_credentials = COALESCE(EXCLUDED.encrypted_credentials, crm_marketing_integrations.encrypted_credentials),
      credentials_updated_at = CASE WHEN EXCLUDED.encrypted_credentials IS NULL THEN crm_marketing_integrations.credentials_updated_at ELSE NOW() END,
      credentials_fingerprint = COALESCE(EXCLUDED.credentials_fingerprint, crm_marketing_integrations.credentials_fingerprint),
      health_message = EXCLUDED.health_message,
      updated_at = NOW()
    RETURNING id, provider, integration_type, status, account_ref, config, encrypted_credentials,
      credentials_updated_at, credentials_fingerprint, health_score, health_message, last_health_check_at, updated_at
  `, [
    id, channel, input.status || 'configured', input.accountRef || null, input.credentialsRef || null,
    JSON.stringify(config), encrypted, fingerprint,
    hasCredentials ? 'Credentials saved; provider health test pending' : 'Configuration updated; existing credentials retained', actorUserId || null,
  ]);
  return safeRow(result.rows[0]);
}

export async function testCrmChannelIntegration(tenant, channelInput) {
  const id = validTenant(tenant);
  const channel = validChannel(channelInput);
  const result = await sharedPool.query(`
    SELECT id, provider, integration_type, status, account_ref, config, encrypted_credentials,
      credentials_updated_at, credentials_fingerprint, health_score, health_message, last_health_check_at, updated_at
    FROM crm_marketing_integrations
    WHERE tenant_id = $1 AND provider = $2 AND integration_type = 'communication'
  `, [id, channel]);
  if (!result.rows[0]) throw Object.assign(new Error('Channel is not configured'), { statusCode: 404 });
  const row = result.rows[0];
  if (!row.encrypted_credentials) throw Object.assign(new Error('Save credentials before testing this channel'), { statusCode: 422 });
  const credentials = decryptCredentials(row.encrypted_credentials);
  if (!credentials || !Object.keys(credentials).length) throw Object.assign(new Error('No usable credentials are stored'), { statusCode: 422 });
  const updated = await sharedPool.query(`
    UPDATE crm_marketing_integrations
    SET status = 'configured', health_score = NULL, health_message = $1, last_health_check_at = NOW(), updated_at = NOW()
    WHERE tenant_id = $2 AND id = $3
    RETURNING id, provider, integration_type, status, account_ref, config, encrypted_credentials,
      credentials_updated_at, credentials_fingerprint, health_score, health_message, last_health_check_at, updated_at
  `, ['Credentials decrypted successfully; live provider delivery is adapter-dependent', id, row.id]);
  return safeRow(updated.rows[0]);
}

