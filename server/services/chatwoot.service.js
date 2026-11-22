import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const error = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const positiveId = (value) => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw error('A positive integer ID is required');
  return id;
};

export function normalizeChannelAddress(channel, value) {
  const text = String(value || '').trim();
  if (['whatsapp', 'sms'].includes(channel)) {
    const phone = text.replace(/^whatsapp:/i, '').replace(/[\s()-]/g, '');
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw error('Phone numbers must use E.164 format');
    return phone;
  }
  if (channel === 'email') {
    const email = text.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw error('A valid email address is required');
    return email;
  }
  if (channel !== 'in_app' || !text || text.length > 320) throw error('Invalid channel address');
  return text;
}

export function verifyChatwootSignature({ rawBody, timestamp, signature, secret, now = Date.now() }) {
  if (!secret || !rawBody || !/^\d+$/.test(String(timestamp || '')) ||
      !/^sha256=[a-f0-9]{64}$/.test(String(signature || ''))) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const expected = `sha256=${createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest('hex')}`;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export class ChatwootService {
  constructor({ db, http, dispatch, env = process.env, hooks = {} }) {
    this.db = db;
    this.http = http;
    this.dispatch = dispatch;
    this.env = env;
    // onAgentReply(mapping) / onResolved(mapping): an agent answered in Chatwoot / resolved the
    // conversation. Used to hand a WhatsApp chat to the Team and back to the assistant. Never throw.
    this.hooks = hooks;
  }

  get enabled() { return this.env.CHATWOOT_ENABLED === 'true'; }

  get baseUrl() {
    const url = new URL(this.env.CHATWOOT_URL || 'https://chat.mediqzy.com');
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw error('CHATWOOT_URL must be an HTTPS origin', 503);
    }
    return url.origin;
  }

  secret(key) {
    if (!/^[A-Z][A-Z0-9_]{0,119}$/.test(key || '') || !this.env[key]) {
      throw error('Chatwoot integration credentials are unavailable', 503);
    }
    return this.env[key];
  }

  async api(account, method, path, data, params) {
    try {
      const response = await this.http.request({
        method, url: `${this.baseUrl}/api/v1/accounts/${positiveId(account.account_id)}${path}`,
        headers: { api_access_token: this.secret(account.api_token_env) },
        data, params, timeout: 12000, maxRedirects: 0,
      });
      return response.data;
    } catch (cause) {
      // Axios errors carry request headers; never expose them to clients or logs.
      throw Object.assign(error('Chatwoot API request failed', 502), { upstreamStatus: cause.response?.status });
    }
  }

  async status(tenantId) {
    const tenant = positiveId(tenantId);
    let accounts;
    try { accounts = await this.db.query('SELECT * FROM crm_chatwoot_accounts WHERE tenant_id = $1', [tenant]); }
    catch (cause) {
      if (cause.code === '42P01') return { state: 'migration_required', configured: false, enabled: false };
      throw cause;
    }
    const account = accounts.rows[0];
    if (!account) return { state: 'not_configured', configured: false, enabled: false };
    const { rows: inboxes } = await this.db.query(
      'SELECT inbox_id, channel, channel_address, enabled FROM crm_chatwoot_inboxes WHERE tenant_id = $1 ORDER BY channel', [tenant]);
    const { rows: jobs } = await this.db.query(
      `SELECT status, COUNT(*)::int AS count FROM crm_chatwoot_jobs WHERE tenant_id = $1 GROUP BY status`, [tenant]);
    const enabled = this.enabled && account.enabled;
    const activeInboxes = inboxes.filter((inbox) => inbox.enabled);
    const credentialsReady = Boolean(this.env[account.api_token_env] && this.env[account.webhook_secret_env]);
    return {
      configured: true, enabled, credentialsReady,
      state: !enabled ? 'disabled' : !credentialsReady ? 'credentials_missing' : !activeInboxes.length ? 'inbox_missing' : 'configured',
      accountId: account.account_id, inboxes, jobs,
      agentUrl: enabled && credentialsReady && activeInboxes.length ? `${this.baseUrl}/app/accounts/${account.account_id}/dashboard` : null,
    };
  }

  async checkHealth(tenantId) {
    const result = await this.status(tenantId);
    if (!result.enabled || !result.credentialsReady || result.state === 'inbox_missing') return result;
    const { rows } = await this.db.query('SELECT * FROM crm_chatwoot_accounts WHERE tenant_id = $1', [positiveId(tenantId)]);
    try {
      const response = await this.api(rows[0], 'GET', '/inboxes');
      const remote = response.payload || [];
      const valid = result.inboxes.filter((i) => i.enabled).every((i) =>
        remote.some((r) => Number(r.id) === Number(i.inbox_id) && r.channel_type === 'Channel::Api'));
      return { ...result, state: valid ? 'healthy' : 'inbox_mismatch', apiReachable: true };
    } catch {
      return { ...result, state: 'unreachable', apiReachable: false };
    }
  }

  async conversationLink(tenantId, crmConversationId) {
    if (!this.enabled) return null;
    const { rows } = await this.db.query(
      `SELECT a.account_id, c.conversation_id FROM crm_chatwoot_conversations c
       JOIN crm_chatwoot_accounts a ON a.tenant_id = c.tenant_id AND a.enabled = TRUE
       JOIN crm_chatwoot_inboxes i ON i.id = c.integration_id AND i.tenant_id = c.tenant_id AND i.enabled = TRUE
       WHERE c.tenant_id = $1 AND c.crm_conversation_id = $2`, [positiveId(tenantId), positiveId(crmConversationId)]);
    const mapping = rows[0];
    return mapping?.conversation_id ? `${this.baseUrl}/app/accounts/${mapping.account_id}/conversations/${mapping.conversation_id}` : null;
  }

  async findInbox(channel, address) {
    if (!this.enabled) return null;
    try {
      const { rows } = await this.db.query(
        `SELECT i.*, a.account_id, a.api_token_env, a.webhook_secret_env, a.enabled AS account_enabled
         FROM crm_chatwoot_inboxes i JOIN crm_chatwoot_accounts a USING (tenant_id)
         WHERE i.channel = $1 AND i.channel_address = $2`, [channel, normalizeChannelAddress(channel, address)]);
      const inbox = rows[0];
      if (inbox && (!inbox.enabled || !inbox.account_enabled)) throw error('Tenant agent inbox is disabled', 503);
      return inbox || null;
    } catch (cause) {
      if (cause.code === '42P01') throw error('Chatwoot bridge migration is required', 503);
      throw cause;
    }
  }

  /**
   * direction 'inbound': the customer's message. 'bot': the automatic assistant's reply or a
   * hand-off note, shown in Chatwoot only (never delivered to the customer, the channel already did).
   * status: the Chatwoot conversation status to set ('pending' while the assistant handles it,
   * 'open' once a person is needed); defaults to 'open', as before.
   */
  async enqueueInbound({ inbox, customerId, name, content, externalId, direction = 'inbound', status = null, isPrivate = false }) {
    if (!['inbound', 'bot'].includes(direction)) throw error('Unsupported bridge direction');
    if (!this.enabled || !inbox.enabled || !inbox.account_enabled) throw error('Chatwoot bridge is disabled', 503);
    const customer = normalizeChannelAddress(inbox.channel, customerId);
    if (!externalId || String(externalId).length > 240 || !String(content || '').trim()) throw error('Message content and provider ID are required');
    const db = await this.db.connect();
    try {
      await db.query('BEGIN');
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`chatwoot:${inbox.id}:${customer}`]);
      let { rows } = await db.query(
        'SELECT * FROM crm_chatwoot_conversations WHERE tenant_id = $1 AND integration_id = $2 AND customer_id = $3',
        [inbox.tenant_id, inbox.id, customer]);
      if (!rows[0]) {
        const { rows: leads } = await db.query(
          `SELECT l.id, l.person_id FROM crm_leads_v2 l JOIN crm_identity_keys k ON k.person_id = l.person_id AND k.tenant_id = l.tenant_id
           WHERE l.tenant_id = $1 AND k.key_type = $2 AND k.normalized_value = $3 ORDER BY l.updated_at DESC LIMIT 1`,
          [inbox.tenant_id, inbox.channel === 'email' ? 'email' : 'phone', customer]);
        const { rows: crm } = await db.query(
          `INSERT INTO crm_conversations (tenant_id, lead_id, identity_id, channel, metadata, last_message_at)
           VALUES ($1,$2,$3,$4,$5,NOW()) RETURNING id`,
          [inbox.tenant_id, leads[0]?.id || null, leads[0]?.person_id || null, inbox.channel,
            JSON.stringify({ provider: 'chatwoot', customer_name: String(name || customer).slice(0, 240), customer_id: customer })]);
        ({ rows } = await db.query(
          `INSERT INTO crm_chatwoot_conversations (tenant_id, integration_id, customer_id, customer_name, crm_conversation_id)
           VALUES ($1,$2,$3,$4,$5) RETURNING *`,
          [inbox.tenant_id, inbox.id, customer, String(name || customer).slice(0, 240), crm[0].id]));
      }
      const conversation = rows[0];
      const { rows: jobs } = await db.query(
        `INSERT INTO crm_chatwoot_jobs (tenant_id, bridge_conversation_id, direction, external_id, payload)
         VALUES ($1,$2,$5,$3,$4) ON CONFLICT (bridge_conversation_id, direction, external_id) DO NOTHING RETURNING id`,
        [inbox.tenant_id, conversation.id, String(externalId),
          JSON.stringify({ content: String(content).slice(0, 20000), ...(status ? { status } : {}), ...(isPrivate ? { private: true } : {}) }), direction]);
      if (jobs[0] && !isPrivate) await this.logEvent(db, inbox, conversation, direction === 'bot' ? 'outbound' : 'inbound', content, `${direction}:${externalId}`, direction === 'bot' ? 'sent' : 'received');
      await db.query('COMMIT');
      return { queued: Boolean(jobs[0]), duplicate: !jobs[0], conversationId: conversation.crm_conversation_id };
    } catch (cause) {
      await db.query('ROLLBACK');
      throw cause;
    } finally { db.release(); }
  }

  async logEvent(db, inbox, conversation, direction, content, externalId, status) {
    await db.query(
      `INSERT INTO crm_communication_events (tenant_id, conversation_id, lead_id, identity_id, channel, direction,
         body_preview, provider, provider_message_id, status, sent_at)
       SELECT tenant_id, id, lead_id, identity_id, $3, $4, $5, 'chatwoot', $6, $7,
         CASE WHEN $4 = 'outbound' AND $7 = 'sent' THEN NOW() ELSE NULL END
       FROM crm_conversations WHERE tenant_id = $1 AND id = $2`,
      [inbox.tenant_id, conversation.crm_conversation_id, inbox.channel, direction, String(content).slice(0, 2000), `${direction}:${externalId}`, status]);
    await db.query('UPDATE crm_conversations SET last_message_at = NOW(), updated_at = NOW() WHERE tenant_id = $1 AND id = $2',
      [inbox.tenant_id, conversation.crm_conversation_id]);
  }

  async webhook({ payload, rawBody, timestamp, signature }) {
    if (!this.enabled) throw error('Chatwoot bridge is disabled', 503);
    const accountId = positiveId(payload?.account?.id);
    const { rows } = await this.db.query('SELECT * FROM crm_chatwoot_accounts WHERE account_id = $1 AND enabled = TRUE', [accountId]);
    const account = rows[0];
    if (!account || !verifyChatwootSignature({ rawBody, timestamp, signature, secret: this.secret(account.webhook_secret_env) })) {
      throw error('Invalid Chatwoot webhook signature', 401);
    }
    if (!['message_created', 'conversation_status_changed'].includes(payload.event)) return { ignored: true, reason: 'unsupported_event' };
    const remoteId = positiveId(payload.conversation?.id || (payload.event === 'conversation_status_changed' ? payload.id : null));
    const { rows: mappings } = await this.db.query(
      `SELECT c.*, i.channel, i.inbox_id, i.enabled FROM crm_chatwoot_conversations c
       JOIN crm_chatwoot_inboxes i ON i.id = c.integration_id AND i.tenant_id = c.tenant_id
       WHERE c.tenant_id = $1 AND c.conversation_id = $2`, [account.tenant_id, remoteId]);
    const mapping = mappings[0];
    if (!mapping) return { ignored: true, reason: 'unmapped_conversation' };
    const inboxId = payload.inbox?.id || payload.conversation?.inbox_id || payload.inbox_id;
    if (Number(inboxId) !== Number(mapping.inbox_id)) throw error('Chatwoot inbox does not match conversation', 403);
    if (!mapping.enabled) throw error('Tenant agent inbox is disabled', 503);
    if (payload.event === 'conversation_status_changed') {
      const status = payload.status || payload.conversation?.status;
      const crmStatus = { open: 'open', pending: 'pending', snoozed: 'pending', resolved: 'closed' }[status];
      if (crmStatus) await this.db.query('UPDATE crm_conversations SET status = $3, updated_at = NOW() WHERE tenant_id = $1 AND id = $2',
        [account.tenant_id, mapping.crm_conversation_id, crmStatus]);
      if (status === 'resolved') await this.hooks.onResolved?.(mapping).catch?.(() => {});
      return { synced: Boolean(crmStatus) };
    }
    if (payload.event !== 'message_created' || payload.private !== false ||
        !['outgoing', 1].includes(payload.message_type) ||
        !['user', 'User'].includes(payload.sender?.type || payload.sender_type) ||
        payload.content_attributes?.mediczy_bridge_job_id) return { ignored: true, reason: 'not_public_agent_reply' };
    const messageId = positiveId(payload.id);
    if (!String(payload.content || '').trim() && !payload.attachments?.length) throw error('Agent message is empty');
    const db = await this.db.connect();
    try {
      await db.query('BEGIN');
      const { rows: jobs } = await db.query(
      `INSERT INTO crm_chatwoot_jobs (tenant_id, bridge_conversation_id, direction, external_id, payload)
       VALUES ($1,$2,'outbound',$3,$4) ON CONFLICT (bridge_conversation_id, direction, external_id) DO NOTHING RETURNING id`,
      [account.tenant_id, mapping.id, String(messageId), JSON.stringify({ content: String(payload.content || '').slice(0, 20000),
        attachments: payload.attachments || [], contentType: payload.content_type || 'text' })]);
      if (jobs[0]) await this.logEvent(db, { ...mapping, tenant_id: account.tenant_id }, mapping, 'outbound', payload.content || '[Attachment]', messageId, 'queued');
      await db.query('COMMIT');
      if (jobs[0]) await this.hooks.onAgentReply?.(mapping).catch?.(() => {});
      return { queued: Boolean(jobs[0]), duplicate: !jobs[0] };
    } catch (cause) {
      await db.query('ROLLBACK');
      throw cause;
    } finally { db.release(); }
  }

  async ensureRemoteConversation(db, account, inbox, mapping) {
    if (mapping.conversation_id) return mapping;
    const identifier = `mediczy:${account.tenant_id}:${createHash('sha256').update(mapping.customer_id).digest('hex')}`;
    const search = await this.api(account, 'GET', '/contacts/search', undefined, { q: identifier });
    let contact = (search.payload || []).find((c) => c.identifier === identifier);
    if (!contact && ['whatsapp', 'sms', 'email'].includes(inbox.channel)) {
      const matches = await this.api(account, 'GET', '/contacts/search', undefined, { q: mapping.customer_id });
      contact = (matches.payload || []).find((candidate) => inbox.channel === 'email'
        ? candidate.email?.toLowerCase() === mapping.customer_id : candidate.phone_number === mapping.customer_id);
    }
    let source;
    if (!contact) {
      const created = await this.api(account, 'POST', '/contacts', {
        inbox_id: Number(inbox.inbox_id), identifier, name: mapping.customer_name,
        ...(inbox.channel === 'email' ? { email: mapping.customer_id } :
          ['whatsapp', 'sms'].includes(inbox.channel) ? { phone_number: mapping.customer_id } : {}),
      });
      contact = created.payload?.contact || created.payload?.[0] || created.payload || created;
      source = created.payload?.contact_inbox?.source_id;
    }
    const contactId = positiveId(contact.id);
    if (!source && !contact.contact_inboxes) {
      contact = await this.api(account, 'GET', `/contacts/${contactId}`);
      contact = contact.payload || contact;
    }
    source ||= contact.contact_inboxes?.find((i) => Number(i.inbox?.id) === Number(inbox.inbox_id))?.source_id;
    if (!source) {
      const binding = await this.api(account, 'POST', `/contacts/${contactId}/contact_inboxes`, { inbox_id: Number(inbox.inbox_id), source_id: identifier });
      source = binding.source_id || binding.payload?.source_id;
    }
    if (!source) throw error('Chatwoot contact inbox source is unavailable', 502);
    // Recover a remote conversation created before a process/database interruption.
    const existing = await this.api(account, 'GET', `/contacts/${contactId}/conversations`);
    let conversation = (existing.payload || []).find((c) => Number(c.inbox_id) === Number(inbox.inbox_id) &&
      c.additional_attributes?.mediczy_bridge_id === String(mapping.id));
    if (!conversation) conversation = await this.api(account, 'POST', '/conversations', {
      inbox_id: Number(inbox.inbox_id), contact_id: contactId, source_id: source, status: 'open',
      additional_attributes: { mediczy_bridge_id: String(mapping.id), mediczy_tenant_id: String(account.tenant_id), channel: inbox.channel },
    });
    mapping.contact_id = contactId;
    mapping.conversation_id = positiveId(conversation.id);
    await db.query('UPDATE crm_chatwoot_conversations SET contact_id = $3, conversation_id = $4 WHERE tenant_id = $1 AND id = $2',
      [account.tenant_id, mapping.id, mapping.contact_id, mapping.conversation_id]);
    return mapping;
  }

  async findDeliveredMessage(account, path, job) {
    let before;
    // A retry can be older than the latest message page. Never resend solely because
    // it is absent from that page; stop at the job's creation time instead.
    for (let page = 0; page < 20; page++) {
      const result = await this.api(account, 'GET', `${path}/messages`, undefined, before ? { before } : undefined);
      const messages = result.payload || [];
      const previous = messages.find((m) => String(m.content_attributes?.mediczy_bridge_job_id) === String(job.id));
      if (previous) return previous;
      if (!messages.length) return null;
      const oldest = messages.reduce((a, b) => Number(a.id) < Number(b.id) ? a : b);
      if (Number(oldest.created_at) * 1000 < new Date(job.created_at).getTime() - 60000) return null;
      if (before && Number(oldest.id) >= Number(before)) throw error('Chatwoot message pagination did not advance', 502);
      before = oldest.id;
    }
    throw error('Chatwoot message recovery requires reconciliation', 502);
  }

  async processNext() {
    if (!this.enabled) return false;
    // A provider may have accepted an outbound send before the process stopped.
    // Preserve that uncertainty instead of automatically sending it again.
    const { rows: interrupted } = await this.db.query(`UPDATE crm_chatwoot_jobs SET status = CASE WHEN direction IN ('inbound', 'bot') THEN 'pending' ELSE 'uncertain' END,
      last_error = 'Worker interrupted; outbound delivery requires reconciliation', updated_at = NOW()
      WHERE status = 'processing' AND claimed_at < NOW() - INTERVAL '5 minutes' RETURNING id`);
    if (interrupted.length) await this.db.query(`UPDATE crm_communication_events e SET status = 'uncertain',
      failed_at = NOW(), failure_reason = 'Worker interrupted; reconcile channel delivery before retrying'
      FROM crm_chatwoot_jobs j WHERE j.status = 'uncertain' AND j.direction = 'outbound'
      AND e.tenant_id = j.tenant_id AND e.provider = 'chatwoot'
      AND e.provider_message_id = 'outbound:' || j.external_id AND e.status = 'queued'`);
    const { rows } = await this.db.query(`WITH candidate AS (
      SELECT j.id FROM crm_chatwoot_jobs j
      JOIN crm_chatwoot_accounts a ON a.tenant_id = j.tenant_id AND a.enabled = TRUE
      JOIN crm_chatwoot_conversations c ON c.id = j.bridge_conversation_id AND c.tenant_id = j.tenant_id
      JOIN crm_chatwoot_inboxes i ON i.id = c.integration_id AND i.tenant_id = j.tenant_id AND i.enabled = TRUE
      WHERE j.status = 'pending' AND j.available_at <= NOW()
        AND NOT EXISTS (
          SELECT 1 FROM crm_chatwoot_jobs earlier WHERE earlier.bridge_conversation_id = j.bridge_conversation_id
          AND (earlier.status = 'processing' OR (earlier.status = 'pending' AND earlier.id < j.id)
            OR (earlier.status = 'uncertain' AND earlier.direction = 'outbound' AND j.direction = 'outbound'))
        )
      ORDER BY j.id LIMIT 1 FOR UPDATE OF j SKIP LOCKED
    ) UPDATE crm_chatwoot_jobs j SET status = 'processing', attempts = attempts + 1, claimed_at = NOW(), updated_at = NOW()
      FROM candidate WHERE j.id = candidate.id RETURNING j.*`);
    const job = rows[0];
    if (!job) return false;
    const heartbeat = setInterval(() => {
      this.db.query("UPDATE crm_chatwoot_jobs SET claimed_at = NOW() WHERE id = $1 AND tenant_id = $2 AND status = 'processing'",
        [job.id, job.tenant_id]).catch(() => {});
    }, 30000);
    heartbeat.unref();
    let db;
    let sendStarted = false;
    try {
      db = await this.db.connect();
      await db.query('BEGIN');
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`chatwoot-conversation:${job.bridge_conversation_id}`]);
      const { rows: bindings } = await db.query(
        `SELECT c.*, i.channel, i.channel_address, i.provider, i.credentials_prefix, i.inbox_id,
          a.account_id, a.api_token_env FROM crm_chatwoot_conversations c
         JOIN crm_chatwoot_inboxes i ON i.id = c.integration_id AND i.tenant_id = c.tenant_id AND i.enabled = TRUE
         JOIN crm_chatwoot_accounts a ON a.tenant_id = c.tenant_id AND a.enabled = TRUE
         WHERE c.id = $1 AND c.tenant_id = $2`, [job.bridge_conversation_id, job.tenant_id]);
      const binding = bindings[0];
      if (!binding) throw error('Tenant agent inbox is disabled', 503);
      let providerId;
      if (job.direction === 'inbound' || job.direction === 'bot') {
        const mapping = await this.ensureRemoteConversation(db, binding, binding, binding);
        // Persist the mapping before Chatwoot can emit a reply/status callback.
        await db.query('COMMIT');
        await db.query('BEGIN');
        const path = `/conversations/${mapping.conversation_id}`;
        const previous = job.attempts > 1 ? await this.findDeliveredMessage(binding, path, job) : null;
        if (previous) providerId = previous.id;
        else {
          const status = ['open', 'pending'].includes(job.payload.status) ? job.payload.status : (job.direction === 'inbound' ? 'open' : null);
          if (status) await this.api(binding, 'POST', `${path}/toggle_status`, { status });
          // A 'bot' job is shown as an outgoing message (or a private note); the content attribute
          // makes the webhook ignore it, so it is never sent to the customer a second time.
          const message = await this.api(binding, 'POST', `${path}/messages`, {
            content: job.payload.content, message_type: job.direction === 'bot' ? 'outgoing' : 'incoming',
            private: job.direction === 'bot' && job.payload.private === true,
            content_attributes: { mediczy_bridge_job_id: String(job.id), ...(job.direction === 'bot' ? { mediczy_automated: true } : {}) },
          });
          providerId = message.id;
          if (status) await db.query('UPDATE crm_conversations SET status = $3 WHERE tenant_id = $1 AND id = $2',
            [job.tenant_id, binding.crm_conversation_id, status]);
        }
      } else {
        // Validation happens before network delivery, so unsupported messages are recoverable failures.
        if (job.payload.contentType !== 'text' || job.payload.attachments?.length) throw error('Only text agent replies are supported by this channel bridge');
        sendStarted = true;
        const delivered = await this.dispatch({ inbox: binding, to: binding.customer_id, content: job.payload.content, externalId: job.external_id, bridgeConversationId: binding.id });
        providerId = delivered.id;
        await db.query(`UPDATE crm_communication_events SET status = 'sent', sent_at = NOW()
          WHERE tenant_id = $1 AND conversation_id = $2 AND provider = 'chatwoot' AND provider_message_id = $3`,
          [job.tenant_id, binding.crm_conversation_id, `outbound:${job.external_id}`]);
        await db.query('UPDATE crm_conversations SET last_message_at = NOW(), updated_at = NOW() WHERE tenant_id = $1 AND id = $2',
          [job.tenant_id, binding.crm_conversation_id]);
      }
      await db.query(`UPDATE crm_chatwoot_jobs SET status = 'sent', provider_message_id = $3, last_error = NULL, updated_at = NOW()
        WHERE tenant_id = $1 AND id = $2`, [job.tenant_id, job.id, providerId ? String(providerId) : null]);
      await db.query('COMMIT');
    } catch (cause) {
      if (db) await db.query('ROLLBACK');
      const uncertain = job.direction === 'outbound' && sendStarted && !cause.definitelyNotSent;
      const retry = (job.direction === 'inbound' || job.direction === 'bot') && job.attempts < 5;
      await this.db.query(`UPDATE crm_chatwoot_jobs SET status = $3, last_error = $4,
        available_at = NOW() + ($5 * INTERVAL '1 second'), updated_at = NOW() WHERE tenant_id = $1 AND id = $2`,
        [job.tenant_id, job.id, uncertain ? 'uncertain' : retry ? 'pending' : 'failed',
          uncertain ? 'Channel delivery could not be confirmed; reconcile before retrying' : 'Bridge delivery failed; check integration credentials and channel support',
          Math.min(300, 2 ** job.attempts * 5)]);
      if (job.direction === 'outbound') {
        await this.db.query(`UPDATE crm_communication_events SET status = $3, failed_at = NOW(), failure_reason = $4
          WHERE tenant_id = $1 AND provider = 'chatwoot' AND provider_message_id = $2`,
          [job.tenant_id, `outbound:${job.external_id}`, uncertain ? 'uncertain' : 'failed',
            uncertain ? 'Delivery could not be confirmed' : 'Channel delivery failed']);
        const { rows: mappings } = await this.db.query(
          `SELECT c.conversation_id, a.account_id, a.api_token_env FROM crm_chatwoot_conversations c
           JOIN crm_chatwoot_accounts a ON a.tenant_id = c.tenant_id
           WHERE c.id = $1 AND c.tenant_id = $2`, [job.bridge_conversation_id, job.tenant_id]);
        if (mappings[0]?.conversation_id) {
          try {
            await this.api(mappings[0], 'POST', `/conversations/${mappings[0].conversation_id}/messages`, {
              content: uncertain ? `Mediczy could not confirm delivery of message #${job.external_id}. Check the channel provider before sending again.` :
                cause.publicMessage ? `Not delivered: ${cause.publicMessage}` :
                `Mediczy could not deliver message #${job.external_id}. Check channel credentials; this bridge currently supports text replies only.`,
              message_type: 'outgoing', private: true, content_attributes: { mediczy_bridge_job_id: String(job.id) },
            });
          } catch { /* CRM queue status remains available if Chatwoot is unreachable. */ }
        }
      }
    } finally { clearInterval(heartbeat); db?.release(); }
    return true;
  }
}
