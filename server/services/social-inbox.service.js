import axios from 'axios';
import sharedPool from '../db/pgPool.js';

const GRAPH_API_VERSION    = 'v19.0';
const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN || '';
const FB_PAGE_ID           = process.env.FB_PAGE_ID || '';
const IG_BUSINESS_ACCOUNT_ID = process.env.IG_BUSINESS_ACCOUNT_ID || '';

export function getSocialInboxStatus() {
  return {
    facebook: {
      connected: Boolean(FB_PAGE_ACCESS_TOKEN && FB_PAGE_ID),
      pageId: FB_PAGE_ID || null,
    },
    instagram: {
      connected: Boolean(FB_PAGE_ACCESS_TOKEN && IG_BUSINESS_ACCOUNT_ID),
      businessAccountId: IG_BUSINESS_ACCOUNT_ID || null,
    },
  };
}

async function upsertConversation({ channel, pageId, externalUserId, contactName, preview, direction, tenantUid = null }) {
  // The BrightBean adoption migration replaces the legacy global unique key
  // with tenant-aware partial indexes. Keep both paths explicit so legacy
  // webhooks continue to work while registered CRM accounts are isolated.
  const scoped = tenantUid ? {
    conflict: 'ON CONFLICT (tenant_uid, channel, external_user_id) WHERE tenant_uid IS NOT NULL',
    columns: '(tenant_uid, channel, page_id, external_user_id, contact_name, last_message_preview, last_message_at, last_direction, unread_count)',
    values: '$1,$2,$3,$4,$5,$6,NOW(),$7,CASE WHEN $7 = \'inbound\' THEN 1 ELSE 0 END',
    params: [tenantUid, channel, pageId || null, externalUserId, contactName || null, (preview || '').slice(0, 280), direction],
  } : {
    conflict: 'ON CONFLICT (channel, external_user_id) WHERE tenant_uid IS NULL',
    columns: '(channel, page_id, external_user_id, contact_name, last_message_preview, last_message_at, last_direction, unread_count)',
    values: '$1,$2,$3,$4,$5,NOW(),$6,CASE WHEN $6 = \'inbound\' THEN 1 ELSE 0 END',
    params: [channel, pageId || null, externalUserId, contactName || null, (preview || '').slice(0, 280), direction],
  };
  const { rows } = await sharedPool.query(
    `INSERT INTO social_inbox_conversations ${scoped.columns}
     VALUES (${scoped.values})
     ${scoped.conflict} DO UPDATE SET
       page_id = COALESCE(EXCLUDED.page_id, social_inbox_conversations.page_id),
       contact_name = COALESCE(EXCLUDED.contact_name, social_inbox_conversations.contact_name),
       last_message_preview = EXCLUDED.last_message_preview,
       last_message_at = NOW(),
       last_direction = EXCLUDED.last_direction,
       unread_count = CASE WHEN EXCLUDED.last_direction = 'inbound'
                            THEN social_inbox_conversations.unread_count + 1
                            ELSE social_inbox_conversations.unread_count END,
       updated_at = NOW()
     RETURNING id`,
    scoped.params,
  );
  return rows[0].id;
}

async function insertMessage({ conversationId, direction, externalMessageId, body, attachments, sentByTeamUserId }) {
  await sharedPool.query(
    `INSERT INTO social_inbox_messages
       (conversation_id, direction, external_message_id, body, attachments, sent_by_team_user_id)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [conversationId, direction, externalMessageId || null, body || null,
     attachments ? JSON.stringify(attachments) : null, sentByTeamUserId || null]
  );
}

/**
 * Handles one `entry` object from a Meta Messenger/Instagram webhook payload.
 * Both channels deliver events under `entry[].messaging[]` in the unified Send/Receive API.
 */
export async function handleSocialMessagingEntry(entry, channel, tenantUid = null) {
  const pageId = entry.id || null;
  for (const event of entry.messaging || []) {
    // Ignore delivery/read receipts and our own echoes of outbound sends
    if (event.message?.is_echo) continue;
    if (!event.message && !event.postback) continue;

    const externalUserId = event.sender?.id;
    if (!externalUserId) continue;

    const text = event.message?.text || (event.postback?.title ? `[Postback] ${event.postback.title}` : '');
    const attachments = event.message?.attachments || null;

    try {
      const conversationId = await upsertConversation({
        channel,
        pageId,
        externalUserId,
        contactName: null, // Graph API profile lookup can be added once app review grants pages_messaging profile scope
        preview: text || (attachments ? '[Attachment]' : ''),
        direction: 'inbound',
        tenantUid,
      });
      await insertMessage({
        conversationId,
        direction: 'inbound',
        externalMessageId: event.message?.mid || null,
        body: text || null,
        attachments,
      });
    } catch (err) {
      console.error(`[SocialInbox] Failed to store ${channel} message:`, err.message);
    }
  }
}

export async function listConversations({ channel, status = 'open', limit = 50 } = {}) {
  const conditions = [];
  const params = [];
  if (channel) { params.push(channel); conditions.push(`channel = $${params.length}`); }
  if (status && status !== 'all') { params.push(status); conditions.push(`status = $${params.length}`); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(Math.min(Number(limit) || 50, 100));

  const { rows } = await sharedPool.query(
    `SELECT * FROM social_inbox_conversations ${where}
     ORDER BY last_message_at DESC NULLS LAST
     LIMIT $${params.length}`,
    params
  );
  return rows;
}

export async function getConversationMessages(conversationId) {
  const { rows } = await sharedPool.query(
    `SELECT * FROM social_inbox_messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
    [conversationId]
  );
  return rows;
}

export async function markConversationRead(conversationId) {
  await sharedPool.query(
    `UPDATE social_inbox_conversations SET unread_count = 0, updated_at = NOW() WHERE id = $1`,
    [conversationId]
  );
}

export async function sendReply({ conversationId, text, teamUserId, tenantUid = null }) {
  const { rows } = await sharedPool.query(
    `SELECT * FROM social_inbox_conversations WHERE id = $1 AND ($2::text IS NULL OR tenant_uid = $2)`,
    [conversationId, tenantUid]
  );
  const conversation = rows[0];
  if (!conversation) throw new Error('Conversation not found');
  const pause = await sharedPool.query(
    `SELECT id, reason FROM crm_social_automation_pauses WHERE conversation_id = $1 AND ($2::text IS NULL OR tenant_uid = $2) AND resumed_at IS NULL LIMIT 1`,
    [conversationId, tenantUid],
  ).catch(() => ({ rows: [] }));
  if (pause.rows[0]) throw new Error(`Automation is paused for this conversation: ${pause.rows[0].reason}`);
  if (!FB_PAGE_ACCESS_TOKEN) throw new Error('Meta page access token is not configured (FB_PAGE_ACCESS_TOKEN)');

  const senderId = conversation.channel === 'instagram' ? IG_BUSINESS_ACCOUNT_ID : (conversation.page_id || FB_PAGE_ID);
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${senderId}/messages`;

  const { data } = await axios.post(url, {
    recipient: { id: conversation.external_user_id },
    message: { text },
  }, {
    params: { access_token: FB_PAGE_ACCESS_TOKEN },
    timeout: 10000,
  });

  await insertMessage({
    conversationId,
    direction: 'outbound',
    externalMessageId: data?.message_id || null,
    body: text,
    sentByTeamUserId: teamUserId,
  });
  await sharedPool.query(
    `UPDATE social_inbox_conversations
       SET last_message_preview = $1, last_message_at = NOW(), last_direction = 'outbound', updated_at = NOW()
     WHERE id = $2 AND ($3::text IS NULL OR tenant_uid = $3)`,
    [text.slice(0, 280), conversationId, tenantUid]
  );

  return data;
}
