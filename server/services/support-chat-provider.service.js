/**
 * Support chat provider — Chatwoot.
 *
 * RocketChat was retired on 2026-10-04. It had already stopped working: ROCKETCHAT_URL pointed at
 * http://localhost:3100, nothing listens there, no process or container runs it, and
 * smart-chat.live serves no API. Every call through the old omnichannel service was failing, so
 * the support widget and hospital team chat were broken in production regardless of this change.
 *
 * Chatwoot (https://chat.mediqzy.com, v4.18.0) is the replacement workspace. This module keeps the
 * exact method surface the old RocketChat omnichannel service exposed, so routes/support-chat.route.js
 * did not have to be rewritten, and it behaves in one of two ways:
 *
 *   - Chatwoot configured  -> real Chatwoot Application API calls.
 *   - Not configured       -> throws SupportChatUnavailableError, which the route layer turns into
 *                             a 503 with code SUPPORT_CHAT_NOT_CONFIGURED. Callers get an honest
 *                             "unavailable" instead of a RocketChat connection error or a hang.
 *
 * Required environment to activate (none are set yet; see docs/integrations/ROCKETCHAT_RETIREMENT.md):
 *   CHATWOOT_URL                 e.g. https://chat.mediqzy.com
 *   CHATWOOT_ACCOUNT_ID          numeric account id from the Chatwoot admin
 *   CHATWOOT_API_TOKEN           an agent/admin API access token
 *   CHATWOOT_SUPPORT_INBOX_ID    numeric id of the API or website inbox used for support
 *   CHATWOOT_WEBSITE_TOKEN       website inbox token, for the browser widget (client-side)
 *
 * The richer agent-console surface the RocketChat build had (livechat rooms, canned responses,
 * broadcast, templates, delivery receipts) has no 1:1 Chatwoot equivalent and is intentionally not
 * reimplemented here. Those routes report unavailable until that work is done deliberately.
 */
import axios from '../integrations/axios.js';

export class SupportChatUnavailableError extends Error {
  constructor(message = 'Support chat is not configured') {
    super(message);
    this.name = 'SupportChatUnavailableError';
    this.statusCode = 503;
    this.code = 'SUPPORT_CHAT_NOT_CONFIGURED';
  }
}

const cfg = () => ({
  url: String(process.env.CHATWOOT_URL || '').replace(/\/+$/, ''),
  accountId: process.env.CHATWOOT_ACCOUNT_ID,
  apiToken: process.env.CHATWOOT_API_TOKEN,
  inboxId: process.env.CHATWOOT_SUPPORT_INBOX_ID,
  websiteToken: process.env.CHATWOOT_WEBSITE_TOKEN,
});

export function isConfigured() {
  const c = cfg();
  return Boolean(c.url && c.accountId && c.apiToken && c.inboxId);
}

/** Non-secret view of the configuration, for health endpoints and dashboards. */
export function describeConfig() {
  const c = cfg();
  return {
    provider: 'chatwoot',
    configured: isConfigured(),
    url: c.url || null,
    accountId: c.accountId || null,
    inboxId: c.inboxId || null,
    hasApiToken: Boolean(c.apiToken),
    hasWebsiteToken: Boolean(c.websiteToken),
    missing: ['CHATWOOT_URL', 'CHATWOOT_ACCOUNT_ID', 'CHATWOOT_API_TOKEN', 'CHATWOOT_SUPPORT_INBOX_ID']
      .filter((k) => !process.env[k]),
  };
}

function requireConfig() {
  if (!isConfigured()) {
    const missing = describeConfig().missing.join(', ');
    throw new SupportChatUnavailableError(`Chatwoot is not configured (missing: ${missing})`);
  }
  return cfg();
}

async function api(method, path, body = null, params = null) {
  const c = requireConfig();
  const res = await axios({
    method,
    url: `${c.url}/api/v1/accounts/${c.accountId}${path}`,
    headers: { api_access_token: c.apiToken, 'Content-Type': 'application/json' },
    ...(body ? { data: body } : {}),
    ...(params ? { params } : {}),
    timeout: Number(process.env.CHATWOOT_TIMEOUT_MS || 10000),
  });
  return res.data;
}

/** Chatwoot: find a contact by identifier, or create one. */
export async function findOrCreateContact({ identifier, name, email, phone }) {
  const c = requireConfig();
  if (identifier) {
    try {
      const found = await api('get', '/contacts/search', null, { q: identifier });
      const hit = (found?.payload || []).find((p) => p.identifier === identifier);
      if (hit) return hit;
    } catch { /* fall through to create */ }
  }
  const created = await api('post', '/contacts', {
    inbox_id: Number(c.inboxId),
    identifier,
    name: name || identifier || 'Mediqzy user',
    ...(email ? { email } : {}),
    ...(phone ? { phone_number: phone } : {}),
  });
  return created?.payload?.contact || created?.payload || created;
}

export async function createConversation({ contactId, sourceId, customAttributes = {} }) {
  const c = requireConfig();
  return api('post', '/conversations', {
    source_id: sourceId || `mediqzy-${contactId}-${Date.now()}`,
    inbox_id: Number(c.inboxId),
    contact_id: contactId,
    custom_attributes: customAttributes,
  });
}

export async function postMessage({ conversationId, content, messageType = 'outgoing', isPrivate = false }) {
  return api('post', `/conversations/${conversationId}/messages`, {
    content,
    message_type: messageType,
    private: isPrivate,
  });
}

export async function checkConnection() {
  if (!isConfigured()) return { connected: false, ...describeConfig() };
  try {
    // Listing inboxes is the cheapest authenticated call that proves token + account are valid.
    const data = await api('get', '/inboxes');
    const inboxes = data?.payload || [];
    const c = cfg();
    return {
      connected: true,
      provider: 'chatwoot',
      url: c.url,
      inboxCount: inboxes.length,
      supportInboxFound: inboxes.some((i) => String(i.id) === String(c.inboxId)),
    };
  } catch (error) {
    return { connected: false, provider: 'chatwoot', error: error?.message || 'request failed' };
  }
}

/**
 * Best-effort internal note about a ticket event. Never throws: a ticket must still be created and
 * updated when the chat workspace is unreachable. The old code called RocketChat here and the
 * failures were swallowed per call site; this logs once per process instead of on every ticket.
 */
let ticketNoteWarned = false;
export async function postTicketNote({ ticketId, subject = '', body = '' }) {
  if (!isConfigured()) {
    if (!ticketNoteWarned) {
      ticketNoteWarned = true;
      console.warn('[support-chat] Chatwoot not configured; ticket notes are not being mirrored to the agent workspace. Further notices suppressed.');
    }
    return { posted: false, reason: 'not_configured' };
  }
  try {
    const contact = await findOrCreateContact({ identifier: `ticket-${ticketId}`, name: `Ticket #${ticketId}` });
    const conv = await createConversation({
      contactId: contact?.id,
      sourceId: `mediqzy-ticket-${ticketId}`,
      customAttributes: { mediqzy_ticket_id: String(ticketId) },
    });
    await postMessage({
      conversationId: conv?.id,
      content: [subject, body].filter(Boolean).join('\n\n'),
      messageType: 'outgoing',
      isPrivate: true,
    });
    return { posted: true, conversationId: conv?.id };
  } catch (error) {
    console.warn(`[support-chat] Could not mirror ticket #${ticketId} to Chatwoot: ${error?.message}`);
    return { posted: false, reason: error?.message };
  }
}

// ── Compatibility surface ────────────────────────────────────────────────────
// These are the methods routes/support-chat.route.js called on the RocketChat omnichannel service.
// Each one needs a deliberate Chatwoot implementation; until then they report unavailable rather
// than pretending to work. Keeping the names means the route layer is unchanged.
const unavailable = (name) => async () => {
  throw new SupportChatUnavailableError(
    `"${name}" has no Chatwoot implementation yet (RocketChat was retired 2026-10-04)`
  );
};

const provider = {
  // Implemented against Chatwoot
  isConfigured,
  describeConfig,
  findOrCreateContact,
  createConversation,
  postMessage,
  checkConnection,
  postTicketNote,

  // Previously RocketChat-specific; awaiting a Chatwoot implementation
  initialize: async () => ({ provider: 'chatwoot', configured: isConfigured() }),
  getWidgetConfig: () => {
    const c = cfg();
    return {
      provider: 'chatwoot',
      enabled: Boolean(c.url && c.websiteToken),
      baseUrl: c.url || null,
      websiteToken: c.websiteToken || null,
    };
  },
  apiRequest: unavailable('apiRequest'),
  closeConversation: unavailable('closeConversation'),
  detectDepartment: unavailable('detectDepartment'),
  forwardToDrIsha: unavailable('forwardToDrIsha'),
  generateVisitorToken: unavailable('generateVisitorToken'),
  getAvailableAgents: unavailable('getAvailableAgents'),
  getChatHistory: unavailable('getChatHistory'),
  getLivechatRooms: unavailable('getLivechatRooms'),
  getOpenRoom: unavailable('getOpenRoom'),
  getQueueStatus: unavailable('getQueueStatus'),
  getTranscript: unavailable('getTranscript'),
  handleInAppMessage: unavailable('handleInAppMessage'),
  handleWhatsAppMessage: unavailable('handleWhatsAppMessage'),
  normalizeWhatsAppNumber: (phone) => String(phone || '').replace(/[^\d+]/g, ''),
  sendMessage: unavailable('sendMessage'),
  sendToWhatsApp: unavailable('sendToWhatsApp'),
  syncToLivechat: unavailable('syncToLivechat'),
};

export default provider;
