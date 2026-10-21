/** Tenant connection inventory. Never supplies or enables delivery adapters. */
import crypto from 'node:crypto';
import sharedPool from '../db/pgPool.js';
import { CRM_CHANNELS, channelDefinition, providerDefinition, configurationErrors } from '../../shared/crm-channel-schema.mjs';
export { CRM_CHANNELS };
const columns = `id, provider, integration_type, status, account_ref, config, encrypted_credentials,
  credentials_updated_at, health_score, health_message, last_health_check_at, updated_at, updated_at::text AS revision`;
const fail = (statusCode, message, fields) => Object.assign(new Error(message), { statusCode, fields });
function identity(tenant, channel) {
  const id = Number(tenant);
  if (!Number.isSafeInteger(id) || id < 1) throw fail(400, 'A valid tenantId is required');
  if (channel !== undefined && !CRM_CHANNELS.includes(channel)) throw fail(400, 'Unsupported CRM channel');
  return id;
}
function object(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail(400, `${name} must be an object`);
  return value;
}
function encryptionKey() {
  const raw = process.env.CRM_CREDENTIAL_ENCRYPTION_KEY;
  if (!/^[0-9a-f]{64}$/i.test(raw || '')) throw fail(503, 'Credential storage is unavailable. Contact the platform administrator.');
  return Buffer.from(raw, 'hex');
}
function encrypt(credentials) {
  if (!Object.keys(credentials).length) return null;
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const bytes = Buffer.concat([cipher.update(JSON.stringify(credentials), 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${bytes.toString('hex')}`;
}
function decrypt(value) {
  if (!value) return {};
  const key = encryptionKey();
  try {
    const [iv, tag, bytes] = value.split(':');
    const cipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
    cipher.setAuthTag(Buffer.from(tag, 'hex'));
    return object(JSON.parse(Buffer.concat([cipher.update(Buffer.from(bytes, 'hex')), cipher.final()]).toString('utf8')), 'Stored credentials');
  } catch { throw fail(503, 'Stored credentials cannot be verified. Contact the platform administrator.'); }
}
function configOf(row) { return typeof row?.config === 'string' ? JSON.parse(row.config || '{}') : row?.config || {}; }
function safeRow(row) {
  const config = configOf(row), provider = config.provider || null;
  const fields = providerDefinition(row.provider, provider)?.fields || [];
  return {
    id: row.id, channel: row.provider, provider, status: row.status, accountRef: row.account_ref,
    config: Object.fromEntries(fields.filter(f => !f.secret && config[f.key] !== undefined).map(f => [f.key, config[f.key]])),
    credentialsConfigured: Boolean(row.encrypted_credentials),
    // New records carry a field-name manifest. Legacy records deliberately report unknown per-field state.
    credentialFields: Array.isArray(config.credentialFields) ? config.credentialFields : null,
    credentialsUpdatedAt: row.credentials_updated_at, healthScore: null, healthMessage: row.health_message,
    lastHealthCheckAt: row.last_health_check_at, updatedAt: row.updated_at, revision: row.revision,
    deliveryMode: 'inventory_only', deliveryActive: false,
  };
}
export async function listCrmChannelIntegrations(tenant) {
  const id = identity(tenant);
  const { rows } = await sharedPool.query(`SELECT ${columns} FROM crm_marketing_integrations
    WHERE tenant_id=$1 AND integration_type='communication' ORDER BY provider`, [id]);
  const byChannel = new Map(rows.map(row => [row.provider, safeRow(row)]));
  return CRM_CHANNELS.map(channel => byChannel.get(channel) || {
    channel, provider: null, status: 'not_configured', accountRef: null, config: {}, credentialsConfigured: false,
    credentialFields: [], credentialsUpdatedAt: null, healthScore: null, healthMessage: null, lastHealthCheckAt: null,
    updatedAt: null, revision: null, deliveryMode: 'inventory_only', deliveryActive: false,
  });
}
async function transaction(id, channel, expectedRevision, work) {
  if (expectedRevision !== null && typeof expectedRevision !== 'string') throw fail(400, 'Reload settings before making this change.');
  const client = await sharedPool.connect();
  try {
    await client.query('BEGIN');
    // Serializes both the absent-row case and credential read/merge/write.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`crm-channel:${id}:${channel}`]);
    const { rows: [row] } = await client.query(`SELECT ${columns} FROM crm_marketing_integrations
      WHERE tenant_id=$1 AND provider=$2 AND integration_type='communication' FOR UPDATE`, [id, channel]);
    if ((row?.revision || null) !== expectedRevision) throw fail(409, 'Settings changed in another session. Refresh and reapply your edits.');
    const result = await work(client, row);
    await client.query('COMMIT'); return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
async function audit(client, id, row, actor, event, details) {
  await client.query(`INSERT INTO crm_audit_log (tenant_id, entity_type, entity_id, event_type, actor_user_id, new_value)
    VALUES ($1,'channel_inventory',$2,$3,$4,$5::jsonb)`, [id, row.id, event, actor || null, JSON.stringify(details)]);
}
export async function upsertCrmChannelIntegration(tenant, channel, input = {}, actor = null) {
  const id = identity(tenant, channel);
  if (channelDefinition(channel).managed) throw fail(400, 'Calling is managed in the contact center.');
  const provider = String(input.provider || '').trim().toLowerCase(), definition = providerDefinition(channel, provider);
  if (!definition) throw fail(400, 'Unsupported provider for this channel.', { provider: 'Choose a supported provider.' });
  if (input.status !== undefined || input.credentialsRef !== undefined) throw fail(400, 'Use the dedicated disable or disconnect action.');
  const config = object(input.config || {}, 'config'), credentials = object(input.credentials || {}, 'credentials');
  const publicKeys = new Set(definition.fields.filter(f => !f.secret).map(f => f.key));
  const secretKeys = new Set(definition.fields.filter(f => f.secret).map(f => f.key));
  for (const key of Object.keys(config)) if (!publicKeys.has(key)) throw fail(400, 'Unsupported configuration field.');
  for (const [key, value] of Object.entries(credentials)) if (!secretKeys.has(key) || typeof value !== 'string' || !value.trim() || value.length > 16000) throw fail(400, 'Invalid credential field.');
  const removed = input.removeCredentials || [];
  if (!Array.isArray(removed) || removed.some(key => !secretKeys.has(key) || credentials[key] !== undefined)) throw fail(400, 'Invalid credential removal.');
  const errors = configurationErrors(channel, provider, config);
  if (Object.keys(errors).length) throw fail(400, 'Check the highlighted fields.', errors);
  if (input.accountRef != null && (typeof input.accountRef !== 'string' || input.accountRef.length > 240)) throw fail(400, 'Account reference must be at most 240 characters.');
  return transaction(id, channel, input.expectedRevision, async (client, row) => {
    if (row && configOf(row).provider !== provider && !input.replaceProvider) throw fail(409, 'Confirm provider replacement before saving.');
    // A provider change starts a new bundle; old-provider secrets are never reused.
    const sameProvider = row && configOf(row).provider === provider;
    const merged = { ...(sameProvider ? decrypt(row.encrypted_credentials) : {}), ...credentials };
    for (const key of removed) delete merged[key];
    const supportedSecrets = Object.fromEntries(Object.entries(merged).filter(([key]) => secretKeys.has(key)));
    const encrypted = encrypt(supportedSecrets);
    const storedConfig = { ...config, provider, credentialFields: Object.keys(supportedSecrets).sort(), deliveryMode: 'inventory_only' };
    const { rows: [next] } = await client.query(`INSERT INTO crm_marketing_integrations
      (tenant_id,provider,integration_type,status,account_ref,config,encrypted_credentials,credentials_updated_at,credentials_fingerprint,health_message,created_by)
      VALUES ($1,$2,'communication','configured',$3,$4::jsonb,$5,NOW(),NULL,$6,$7)
      ON CONFLICT (tenant_id,provider,integration_type) DO UPDATE SET status='configured',account_ref=EXCLUDED.account_ref,
      config=EXCLUDED.config,encrypted_credentials=EXCLUDED.encrypted_credentials,credentials_updated_at=NOW(),credentials_fingerprint=NULL,
      health_score=NULL,health_message=EXCLUDED.health_message,last_health_check_at=NULL,updated_at=clock_timestamp()
      RETURNING ${columns}`, [id, channel, input.accountRef?.trim() || null, JSON.stringify(storedConfig), encrypted,
      'Inventory saved. Delivery is not activated by this record.', actor]);
    await audit(client, id, next, actor, 'inventory_saved', { channel, provider, changedCredentialFields: Object.keys(credentials), removedCredentialFields: removed, replacedProvider: Boolean(row && !sameProvider), deliveryActive: false });
    return safeRow(next);
  });
}
export async function testCrmChannelIntegration(tenant, channel, input = {}, actor = null) {
  const id = identity(tenant, channel);
  return transaction(id, channel, input.expectedRevision, async (client, row) => {
    if (!row) throw fail(404, 'No saved inventory record.');
    if (row.status === 'disabled') throw fail(409, 'Inventory record is disabled.');
    const credentials = decrypt(row.encrypted_credentials);
    if (!Object.keys(credentials).length) throw fail(422, 'No stored credentials to verify.');
    const { rows: [next] } = await client.query(`UPDATE crm_marketing_integrations SET health_score=NULL,health_message=$1,
      last_health_check_at=clock_timestamp(),updated_at=clock_timestamp() WHERE tenant_id=$2 AND id=$3 RETURNING ${columns}`,
    ['Encrypted storage verified. Provider connectivity and delivery were not tested.', id, row.id]);
    await audit(client, id, next, actor, 'storage_verified', { channel, deliveryTested: false });
    return safeRow(next);
  });
}
export async function changeCrmChannelIntegration(tenant, channel, action, input = {}, actor = null) {
  const id = identity(tenant, channel);
  if (!['disable', 'disconnect'].includes(action) || input.confirm !== action) throw fail(400, 'Confirm the requested inventory action.');
  return transaction(id, channel, input.expectedRevision, async (client, row) => {
    if (!row) throw fail(404, 'No saved inventory record.');
    await audit(client, id, row, actor, action === 'disconnect' ? 'inventory_disconnected' : 'inventory_disabled', { channel, credentialsDeleted: action === 'disconnect', liveProviderChanged: false });
    if (action === 'disconnect') {
      await client.query("DELETE FROM crm_marketing_integrations WHERE tenant_id=$1 AND id=$2 AND integration_type='communication'", [id, row.id]);
      return { channel, disconnected: true };
    }
    const { rows: [next] } = await client.query(`UPDATE crm_marketing_integrations SET status='disabled',health_score=NULL,
      health_message='Inventory disabled. Live provider configuration is managed separately.',last_health_check_at=NULL,updated_at=clock_timestamp()
      WHERE tenant_id=$1 AND id=$2 RETURNING ${columns}`, [id, row.id]);
    return safeRow(next);
  });
}
