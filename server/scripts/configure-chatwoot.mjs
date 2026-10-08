import { parseArgs } from 'node:util';
import axios from 'axios';
import { ChatwootService, normalizeChannelAddress } from '../services/chatwoot.service.js';

const { values } = parseArgs({ options: {
  'tenant-id': { type: 'string' }, 'account-id': { type: 'string' }, 'inbox-id': { type: 'string' },
  channel: { type: 'string', default: 'whatsapp' }, address: { type: 'string' },
  'credentials-prefix': { type: 'string' }, 'api-token-env': { type: 'string' },
  'webhook-secret-env': { type: 'string' }, 'webhook-url': { type: 'string' },
  apply: { type: 'boolean', default: false }, enable: { type: 'boolean', default: false },
} });

let pool;
try {
  const id = (key) => {
    const value = Number(values[key]);
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(`--${key} must be a positive ID`);
    return value;
  };
  const tenantId = id('tenant-id');
  const accountId = id('account-id');
  const inboxId = id('inbox-id');
  const channel = values.channel;
  if (!['whatsapp', 'sms'].includes(channel)) throw new Error('This setup command supports Twilio WhatsApp and SMS inboxes');
  const address = normalizeChannelAddress(channel, values.address);
  for (const key of ['credentials-prefix', 'api-token-env', 'webhook-secret-env']) {
    if (!/^[A-Z][A-Z0-9_]{0,99}$/.test(values[key] || '')) throw new Error(`--${key} must name an environment variable/reference`);
  }
  const webhookUrl = new URL(values['webhook-url']);
  if (webhookUrl.protocol !== 'https:' || webhookUrl.username || webhookUrl.password || webhookUrl.search || webhookUrl.hash ||
      !['/api/chatwoot/channels/twilio', '/api/whatsapp-production/webhook'].includes(webhookUrl.pathname)) {
    throw new Error('--webhook-url must be the exact HTTPS Mediczy Twilio bridge endpoint');
  }
  // Argument validation precedes loading deployment DB/environment configuration.
  ({ default: pool } = await import('../db/pgPool.js'));
  const service = new ChatwootService({ db: pool, http: axios });
  for (const key of [values['api-token-env'], values['webhook-secret-env'],
    `${values['credentials-prefix']}_ACCOUNT_SID`, `${values['credentials-prefix']}_AUTH_TOKEN`]) service.secret(key);
  if (values.enable && !service.enabled) throw new Error('Set CHATWOOT_ENABLED=true before using --enable');
  const { rows: tenants } = await pool.query('SELECT id FROM crm_org_units WHERE tenant_id = $1 LIMIT 1', [tenantId]);
  if (!tenants.length) throw new Error('Tenant has no CRM organization; provision/confirm the tenant before configuration');
  const account = { account_id: accountId, api_token_env: values['api-token-env'] };
  const remote = await service.api(account, 'GET', '/inboxes');
  if (!(remote.payload || []).some((inbox) => Number(inbox.id) === inboxId && inbox.channel_type === 'Channel::Api')) {
    throw new Error('The selected inbox must be an API inbox in this Chatwoot account');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`chatwoot-config:${tenantId}`]);
    const { rows: accounts } = await client.query('SELECT * FROM crm_chatwoot_accounts WHERE tenant_id = $1 OR account_id = $2', [tenantId, accountId]);
    if (accounts.some((row) => Number(row.tenant_id) !== tenantId || Number(row.account_id) !== accountId)) {
      throw new Error('Tenant/account is already mapped differently; account reassignment is not supported');
    }
    const { rows: inboxes } = await client.query(
      'SELECT * FROM crm_chatwoot_inboxes WHERE (tenant_id = $1 AND inbox_id = $2) OR (channel = $3 AND channel_address = $4)',
      [tenantId, inboxId, channel, address]);
    if (inboxes.some((row) => Number(row.tenant_id) !== tenantId || Number(row.inbox_id) !== inboxId || row.channel !== channel || row.channel_address !== address)) {
      throw new Error('Inbox/channel address is already mapped differently; reassignment is not supported');
    }
    if (values.apply) {
      await client.query(`INSERT INTO crm_chatwoot_accounts (tenant_id, account_id, api_token_env, webhook_secret_env, enabled)
        VALUES ($1,$2,$3,$4,$5) ON CONFLICT (tenant_id) DO UPDATE SET api_token_env = EXCLUDED.api_token_env,
        webhook_secret_env = EXCLUDED.webhook_secret_env, enabled = EXCLUDED.enabled`,
        [tenantId, accountId, values['api-token-env'], values['webhook-secret-env'], values.enable]);
      await client.query(`INSERT INTO crm_chatwoot_inboxes (tenant_id, inbox_id, channel, channel_address, provider,
        credentials_prefix, inbound_webhook_url, enabled) VALUES ($1,$2,$3,$4,'twilio',$5,$6,$7)
        ON CONFLICT (tenant_id, inbox_id) DO UPDATE SET credentials_prefix = EXCLUDED.credentials_prefix,
        inbound_webhook_url = EXCLUDED.inbound_webhook_url, enabled = EXCLUDED.enabled`,
        [tenantId, inboxId, channel, address, values['credentials-prefix'], webhookUrl.href, values.enable]);
      await client.query('COMMIT');
    } else await client.query('ROLLBACK');
    console.log(JSON.stringify({ mode: values.apply ? 'applied' : 'validated_only', tenantId, accountId, inboxId, channel, address, enabled: values.apply && values.enable }));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
} catch (error) {
  console.error(error.code === '42P01' ? 'Apply the CRM and Chatwoot bridge migrations first' : error.message);
  process.exitCode = 1;
} finally { if (pool) await pool.end(); }
