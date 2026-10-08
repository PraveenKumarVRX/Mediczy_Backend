import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { ChatwootService, normalizeChannelAddress, verifyChatwootSignature } from '../services/chatwoot.service.js';

const signed = (payload, secret = 'test-webhook-secret') => {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const rawBody = JSON.stringify(payload);
  return { payload, rawBody, timestamp,
    signature: `sha256=${createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')}` };
};

describe('Chatwoot callback verification', () => {
  it('accepts the original body and rejects mutation, stale timestamps, and malformed signatures', () => {
    const request = signed({ content: 'Hello' });
    const options = { ...request, secret: 'test-webhook-secret' };
    assert.equal(verifyChatwootSignature(options), true);
    assert.equal(verifyChatwootSignature({ ...options, rawBody: '{"content":"Changed"}' }), false);
    assert.equal(verifyChatwootSignature({ ...options, now: Date.now() + 301000 }), false);
    assert.equal(verifyChatwootSignature({ ...options, signature: 'sha256=abc' }), false);
    assert.equal(verifyChatwootSignature({ ...options, secret: 'different-tenant' }), false);
  });
  it('normalizes channel addresses and rejects ambiguous phone numbers', () => {
    assert.equal(normalizeChannelAddress('whatsapp', 'whatsapp:+91 (98765) 43210'), '+919876543210');
    assert.equal(normalizeChannelAddress('email', ' AGENT@EXAMPLE.COM '), 'agent@example.com');
    assert.throws(() => normalizeChannelAddress('whatsapp', '9876543210'));
  });
  it('rejects paths, credentials and insecure Chatwoot origins', () => {
    for (const url of ['http://chat.example.com', 'https://chat.example.com/app/login', 'https://user:pass@chat.example.com']) {
      const service = new ChatwootService({ env: { CHATWOOT_URL: url } });
      assert.throws(() => service.baseUrl);
    }
  });
  it('sanitizes upstream errors so tokens never escape', async () => {
    const service = new ChatwootService({ env: { TOKEN: 'private-token' },
      http: { request: async () => { throw Object.assign(new Error('private-token'), { config: { headers: { api_access_token: 'private-token' } } }); } } });
    await assert.rejects(service.api({ account_id: 1, api_token_env: 'TOKEN' }, 'GET', '/inboxes'),
      (error) => error.message === 'Chatwoot API request failed' && !error.config);
  });
});

class FakeChatwoot {
  contacts = [];
  conversations = [];
  messages = [];
  calls = [];
  beforeIncoming = null;
  failAfterIncoming = false;
  request = async (request) => {
    this.calls.push(request);
    const path = new URL(request.url).pathname.replace(/^\/api\/v1\/accounts\/\d+/, '');
    const accountId = Number(new URL(request.url).pathname.split('/')[4]);
    let result;
    if (path === '/inboxes') result = { payload: [{ id: accountId === 101 ? 201 : 202, channel_type: 'Channel::Api' }] };
    else if (path === '/contacts/search') result = { payload: this.contacts.filter((contact) =>
      contact.account_id === accountId && [contact.identifier, contact.phone_number, contact.email].includes(request.params.q)) };
    else if (path === '/contacts' && request.method === 'POST') {
      const contact = { ...request.data, account_id: accountId, id: this.contacts.length + 1,
        contact_inboxes: [{ inbox: { id: request.data.inbox_id }, source_id: 'source-test' }] };
      this.contacts.push(contact);
      result = { payload: { contact, contact_inbox: { source_id: 'source-test' } } };
    } else if (/^\/contacts\/\d+\/conversations$/.test(path)) {
      result = { payload: this.conversations.filter((conversation) => conversation.contact_id === Number(path.split('/')[2])) };
    } else if (path === '/conversations') {
      result = { ...request.data, id: this.conversations.length + 301 };
      this.conversations.push(result);
    } else if (path.endsWith('/toggle_status')) result = { status: 'open' };
    else if (path.endsWith('/messages') && request.method === 'GET') {
      result = { payload: this.messages.filter((message) => message.path === path && (!request.params?.before || message.id < request.params.before)).slice(-2) };
    } else if (path.endsWith('/messages') && request.method === 'POST') {
      if (request.data.message_type === 'incoming' && this.beforeIncoming) await this.beforeIncoming();
      result = { ...request.data, path, id: this.messages.length + 401, created_at: Math.floor(Date.now() / 1000) };
      this.messages.push(result);
      if (this.failAfterIncoming && request.data.message_type === 'incoming') {
        this.failAfterIncoming = false;
        throw new Error('Connection lost after acceptance');
      }
    } else throw new Error(`Unexpected Chatwoot API call: ${request.method} ${path}`);
    return { data: result };
  };
}

const connectionString = process.env.CHATWOOT_TEST_DATABASE_URL;
describe('Chatwoot bridge with isolated PostgreSQL', { skip: !connectionString }, () => {
  let pool, service, remote, deliveries;
  const schema = `chatwoot_bridge_test_${process.pid}`;
  before(async () => {
    const url = new URL(connectionString);
    assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Integration tests require a loopback database');
    assert.match(url.pathname, /^\/chatwoot_test/);
    pool = new pg.Pool({ connectionString, options: `-c search_path=${schema}` });
    await pool.query(`CREATE SCHEMA ${schema}`);
    await pool.query(`
      CREATE TABLE crm_leads_v2 (id BIGSERIAL PRIMARY KEY, tenant_id BIGINT, person_id BIGINT, updated_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE crm_identity_keys (tenant_id BIGINT, person_id BIGINT, key_type TEXT, normalized_value TEXT);
      CREATE TABLE crm_conversations (id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL, lead_id BIGINT, identity_id BIGINT,
        channel TEXT, status TEXT DEFAULT 'open' CHECK (status IN ('open','pending','closed')), metadata JSONB,
        last_message_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE crm_communication_events (id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL, conversation_id BIGINT,
        lead_id BIGINT, identity_id BIGINT, channel TEXT, direction TEXT, body_preview TEXT, provider TEXT,
        provider_message_id TEXT, status TEXT, sent_at TIMESTAMPTZ, failed_at TIMESTAMPTZ, failure_reason TEXT,
        UNIQUE (tenant_id, provider, provider_message_id));
    `);
    const migration = await readFile(new URL('../migrations/20261003000000-chatwoot-bridge.sql', import.meta.url), 'utf8');
    await pool.query(migration);
    await pool.query(migration);
  });
  after(async () => {
    if (pool) { await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await pool.end(); }
  });
  beforeEach(async () => {
    await pool.query(`TRUNCATE crm_chatwoot_jobs, crm_chatwoot_conversations, crm_chatwoot_inboxes,
      crm_chatwoot_accounts, crm_communication_events, crm_conversations, crm_leads_v2, crm_identity_keys RESTART IDENTITY CASCADE`);
    await pool.query(`INSERT INTO crm_chatwoot_accounts (tenant_id, account_id, api_token_env, webhook_secret_env, enabled)
      VALUES (1,101,'TOKEN_ONE','SECRET_ONE',true), (2,102,'TOKEN_TWO','SECRET_TWO',true);
      INSERT INTO crm_chatwoot_inboxes (tenant_id, inbox_id, channel, channel_address, provider, credentials_prefix, enabled)
      VALUES (1,201,'whatsapp','+919876543210','twilio','CHANNEL_ONE',true),
             (2,202,'whatsapp','+919876543211','twilio','CHANNEL_TWO',true);`);
    remote = new FakeChatwoot();
    deliveries = [];
    service = new ChatwootService({ db: pool, http: remote, env: { CHATWOOT_ENABLED: 'true',
      TOKEN_ONE: 'token-one', TOKEN_TWO: 'token-two', SECRET_ONE: 'test-webhook-secret', SECRET_TWO: 'tenant-two-secret' },
      dispatch: async (message) => { deliveries.push(message); return { id: 'SM-agent-reply' }; } });
  });
  const enqueue = async (externalId = 'SM-customer', tenant = 1) => {
    const inbox = await service.findInbox('whatsapp', tenant === 1 ? '+919876543210' : '+919876543211');
    return service.enqueueInbound({ inbox, customerId: '+919000000001', name: 'Test customer', content: 'Please help', externalId });
  };
  const agentReply = (overrides = {}) => ({ event: 'message_created', account: { id: 101 }, inbox: { id: 201 },
    conversation: { id: 301 }, id: 501, content: 'Hello from the agent', content_type: 'text',
    message_type: 'outgoing', private: false, sender: { type: 'user' }, ...overrides });
  const jobs = async () => (await pool.query('SELECT * FROM crm_chatwoot_jobs ORDER BY id')).rows;

  it('deduplicates concurrent customer callbacks and creates one remote conversation/message', async () => {
    const results = await Promise.all([enqueue(), enqueue(), enqueue()]);
    assert.equal(results.filter((result) => result.queued).length, 1);
    assert.equal((await jobs()).length, 1);
    assert.equal(await service.processNext(), true);
    assert.equal(await service.processNext(), false);
    assert.equal(remote.conversations.length, 1);
    assert.equal(remote.messages.length, 1);
    assert.equal((await jobs())[0].status, 'sent');
    assert.equal(remote.calls[0].headers.api_access_token, 'token-one');
  });
  it('reuses an existing contact in the tenant account without duplicating its phone identity', async () => {
    remote.contacts.push({ id: 1, account_id: 101, identifier: 'existing-contact', phone_number: '+919000000001',
      contact_inboxes: [{ inbox: { id: 201 }, source_id: 'existing-source' }] });
    await enqueue(); await service.processNext();
    assert.equal(remote.contacts.length, 1);
    assert.equal(remote.conversations[0].source_id, 'existing-source');
    assert.equal((await jobs())[0].status, 'sent');
  });
  it('isolates tenant contacts, workspace links, mappings, and health', async () => {
    await enqueue('SM-one', 1);
    await enqueue('SM-two', 2);
    await service.processNext();
    await service.processNext();
    assert.equal(remote.contacts.length, 2);
    assert.notEqual(remote.contacts[0].identifier, remote.contacts[1].identifier);
    assert.equal((await service.checkHealth(1)).state, 'healthy');
    assert.match(await service.conversationLink(1, 1), /accounts\/101\/conversations\/301$/);
    assert.equal(await service.conversationLink(2, 1), null);
    await assert.rejects(pool.query(`INSERT INTO crm_chatwoot_conversations (tenant_id, integration_id, customer_id, crm_conversation_id)
      VALUES (2,2,'cross-tenant',1)`), (error) => error.code === '23503');
  });
  it('deduplicates agent webhooks and routes the reply through the tenant channel', async () => {
    await enqueue(); await service.processNext();
    const request = signed(agentReply());
    assert.equal((await service.webhook(request)).queued, true);
    assert.equal((await service.webhook(request)).duplicate, true);
    await service.processNext();
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].inbox.tenant_id, '1');
    assert.equal(deliveries[0].to, '+919000000001');
    const { rows } = await pool.query("SELECT * FROM crm_communication_events WHERE direction = 'outbound'");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, 'sent');
  });
  it('rejects invalid signatures and inbox mismatches, and ignores notes/bots/echoes/unrelated events', async () => {
    await enqueue(); await service.processNext();
    await assert.rejects(service.webhook(signed(agentReply(), 'wrong-secret')), (error) => error.statusCode === 401);
    await assert.rejects(service.webhook(signed(agentReply({ inbox: { id: 202 } }))), (error) => error.statusCode === 403);
    for (const overrides of [{ private: true }, { sender: { type: 'agent_bot' } }, { message_type: 'incoming' },
      { content_attributes: { mediczy_bridge_job_id: '1' } }]) {
      assert.equal((await service.webhook(signed(agentReply(overrides)))).ignored, true);
    }
    assert.equal((await service.webhook(signed({ event: 'contact_created', account: { id: 101 } }))).ignored, true);
    assert.equal((await jobs()).length, 1);
  });
  it('synchronizes a resolved conversation and reopens it on the next customer message', async () => {
    await enqueue(); await service.processNext();
    await service.webhook(signed({ event: 'conversation_status_changed', account: { id: 101 }, id: 301, inbox_id: 201, status: 'resolved' }));
    assert.equal((await pool.query('SELECT status FROM crm_conversations')).rows[0].status, 'closed');
    await enqueue('SM-next'); await service.processNext();
    assert.equal((await pool.query('SELECT status FROM crm_conversations')).rows[0].status, 'open');
  });
  it('recovers an accepted incoming message after a timeout without sending a duplicate', async () => {
    await enqueue(); remote.failAfterIncoming = true;
    await service.processNext();
    assert.equal((await jobs())[0].status, 'pending');
    // Put two newer messages in the remote history to force pagination.
    remote.messages.push({ id: 450, path: '/conversations/301/messages', created_at: Math.floor(Date.now() / 1000) },
      { id: 451, path: '/conversations/301/messages', created_at: Math.floor(Date.now() / 1000) });
    await pool.query('UPDATE crm_chatwoot_jobs SET available_at = NOW()');
    await service.processNext();
    assert.equal((await jobs())[0].status, 'sent');
    assert.equal(remote.messages.filter((message) => message.message_type === 'incoming').length, 1);
    assert.equal(remote.conversations.length, 1);
  });
  it('preserves per-conversation ordering with concurrent workers', async () => {
    await enqueue('SM-first'); await enqueue('SM-second');
    let release, entered;
    const gate = new Promise((resolve) => { release = resolve; });
    const ready = new Promise((resolve) => { entered = resolve; });
    remote.beforeIncoming = async () => { entered(); await gate; };
    const first = service.processNext();
    await ready;
    try { assert.equal(await service.processNext(), false); }
    finally { release(); await first; }
    remote.beforeIncoming = null;
    assert.equal(await service.processNext(), true);
    assert.deepEqual((await jobs()).map((job) => job.status), ['sent', 'sent']);
  });
  it('flags ambiguous outgoing delivery and holds subsequent replies for reconciliation', async () => {
    await enqueue(); await service.processNext();
    await service.webhook(signed(agentReply()));
    await service.webhook(signed(agentReply({ id: 502 })));
    service.dispatch = async () => { throw new Error('Provider timed out'); };
    await service.processNext();
    assert.deepEqual((await jobs()).map((job) => job.status), ['sent', 'uncertain', 'pending']);
    assert.equal(await service.processNext(), false);
    assert.equal(remote.messages.at(-1).private, true);
    assert.equal((await pool.query("SELECT status FROM crm_communication_events WHERE provider_message_id = 'outbound:501'")).rows[0].status, 'uncertain');
  });
  it('records unsupported attachments as failed without attempting channel delivery', async () => {
    await enqueue(); await service.processNext();
    await service.webhook(signed(agentReply({ attachments: [{ data_url: 'https://example.com/image' }] })));
    await service.processNext();
    assert.equal(deliveries.length, 0);
    assert.equal((await jobs())[1].status, 'failed');
    assert.equal(remote.messages.at(-1).private, true);
  });
  it('recovers interrupted inbound processing and holds interrupted outbound delivery', async () => {
    await enqueue();
    await pool.query("UPDATE crm_chatwoot_jobs SET status = 'processing', claimed_at = NOW() - INTERVAL '6 minutes'");
    assert.equal(await service.processNext(), true);
    assert.equal((await jobs())[0].status, 'sent');
    await service.webhook(signed(agentReply()));
    await pool.query("UPDATE crm_chatwoot_jobs SET status = 'processing', claimed_at = NOW() - INTERVAL '6 minutes' WHERE direction = 'outbound'");
    assert.equal(await service.processNext(), false);
    assert.equal((await jobs())[1].status, 'uncertain');
    assert.equal(deliveries.length, 0);
    assert.equal((await pool.query("SELECT status FROM crm_communication_events WHERE direction = 'outbound'")).rows[0].status, 'uncertain');
  });
  it('records a provider rejection as failed rather than ambiguous', async () => {
    await enqueue(); await service.processNext();
    await service.webhook(signed(agentReply()));
    service.dispatch = async () => { throw Object.assign(new Error('Invalid sender'), { definitelyNotSent: true }); };
    await service.processNext();
    assert.equal((await jobs())[1].status, 'failed');
  });
  it('does not claim work for disabled accounts and reports empty inbox configuration', async () => {
    await enqueue();
    await pool.query('UPDATE crm_chatwoot_accounts SET enabled = false WHERE tenant_id = 1');
    assert.equal(await service.processNext(), false);
    assert.equal((await service.status(1)).agentUrl, null);
    await pool.query('UPDATE crm_chatwoot_accounts SET enabled = true WHERE tenant_id = 1');
    await pool.query('UPDATE crm_chatwoot_inboxes SET enabled = false WHERE tenant_id = 1');
    assert.equal((await service.checkHealth(1)).state, 'inbox_missing');
  });
});
