import pool from '../db/pgPool.js';
import { sendReply } from './social-inbox.service.js';
import { runFlow } from './crm-flow-builder.service.js';

const CHANNELS = new Set(['instagram', 'facebook', 'whatsapp', 'sms', 'email']);
const TRIGGERS = new Set(['comment_to_dm', 'story_mention', 'follow', 'ref_url', 'qr']);
const actorId = (u) => { const n = Number.parseInt(u?.id, 10); return Number.isInteger(n) ? n : null; };

export async function listIdentities(tenantUid, { channel, limit = 50 } = {}) {
  const n = Math.min(Math.max(Number.parseInt(limit, 10) || 50, 1), 200); const params = [tenantUid]; const where = ['tenant_uid=$1'];
  if (channel) { if (!CHANNELS.has(String(channel))) throw Object.assign(new Error('invalid channel'), { statusCode: 400 }); params.push(channel); where.push(`channel=$${params.length}`); }
  const { rows } = await pool.query(`SELECT * FROM crm_social_identities WHERE ${where.join(' AND ')} ORDER BY updated_at DESC LIMIT ${n}`, params); return rows;
}

export async function resolveIdentity(tenantUid, input, user) {
  const channel = String(input.channel || '').trim(); const externalUserId = String(input.externalUserId || '').trim();
  if (!CHANNELS.has(channel) || !externalUserId) throw Object.assign(new Error('channel and externalUserId are required'), { statusCode: 400 });
  const { rows } = await pool.query(`INSERT INTO crm_social_identities (tenant_uid,channel,external_user_id,contact_id,lead_id,profile,consent_status,last_seen_at) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,NOW()) ON CONFLICT (tenant_uid,channel,external_user_id) DO UPDATE SET contact_id=COALESCE(EXCLUDED.contact_id,crm_social_identities.contact_id), lead_id=COALESCE(EXCLUDED.lead_id,crm_social_identities.lead_id), profile=crm_social_identities.profile || EXCLUDED.profile, consent_status=EXCLUDED.consent_status, last_seen_at=NOW(), updated_at=NOW() RETURNING *`, [tenantUid, channel, externalUserId, input.contactId || null, input.leadId || null, JSON.stringify(input.profile || {}), input.consentStatus || 'unknown']);
  if (input.conversationId) await pool.query('UPDATE social_inbox_conversations SET tenant_uid=$1 WHERE id=$2 AND channel=$3 AND external_user_id=$4', [tenantUid, input.conversationId, channel, externalUserId]);
  return rows[0];
}

export async function listTriggers(tenantUid) { const { rows } = await pool.query('SELECT * FROM crm_social_triggers WHERE tenant_uid=$1 ORDER BY updated_at DESC', [tenantUid]); return rows; }
export async function createTrigger(tenantUid, input, user) {
  const type = String(input.triggerType || '').trim(); const channel = String(input.channel || '').trim(); const key = String(input.triggerKey || '').trim();
  if (!TRIGGERS.has(type) || !CHANNELS.has(channel) || !key) throw Object.assign(new Error('triggerType, channel and triggerKey are required'), { statusCode: 400 });
  if (input.flowId) {
    const flow = await pool.query('SELECT id FROM crm_flow_definitions WHERE id=$1 AND tenant_uid=$2', [input.flowId, tenantUid]);
    if (!flow.rows[0]) throw Object.assign(new Error('flowId is not available in this tenant'), { statusCode: 400 });
  }
  const { rows } = await pool.query(`INSERT INTO crm_social_triggers (tenant_uid,trigger_type,channel,trigger_key,flow_id,config,active,created_by) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8) ON CONFLICT (tenant_uid,trigger_type,channel,trigger_key) DO UPDATE SET flow_id=EXCLUDED.flow_id,config=EXCLUDED.config,active=EXCLUDED.active,updated_at=NOW() RETURNING *`, [tenantUid, type, channel, key, input.flowId || null, JSON.stringify(input.config || {}), input.active !== false, actorId(user)]); return rows[0];
}

export async function dispatchTrigger(tenantUid, input = {}, user) {
  const type = String(input.triggerType || '').trim();
  const channel = String(input.channel || '').trim();
  const key = String(input.triggerKey || '').trim();
  if (!TRIGGERS.has(type) || !CHANNELS.has(channel) || !key) throw Object.assign(new Error('triggerType, channel and triggerKey are required'), { statusCode: 400 });
  const { rows } = await pool.query('SELECT * FROM crm_social_triggers WHERE tenant_uid=$1 AND trigger_type=$2 AND channel=$3 AND trigger_key=$4 AND active=TRUE', [tenantUid, type, channel, key]);
  if (!rows[0]) return { matched: false, run: null };
  if (!rows[0].flow_id) return { matched: true, run: null, reason: 'trigger has no flow' };
  if (input.conversationId || input.payload?.conversationId) {
    const conversationId = String(input.conversationId || input.payload.conversationId);
    await pool.query(`UPDATE crm_flow_runs SET status='queued', next_run_at=NOW(), state=state || $1::jsonb, updated_at=NOW() WHERE tenant_uid=$2 AND flow_id=$3 AND status='waiting' AND state->'input'->>'conversationId'=$4`, [JSON.stringify({ reply: input.payload || input }), tenantUid, rows[0].flow_id, conversationId]);
  }
  const run = await runFlow(tenantUid, rows[0].flow_id, { ...(input.payload || {}), conversationId: input.conversationId || input.payload?.conversationId, trigger: { type, channel, key } }, { dryRun: false, user });
  return { matched: true, trigger: rows[0], run };
}

export async function pauseConversation(tenantUid, conversationId, reason, user) {
  const id = Number.parseInt(conversationId, 10); if (!Number.isInteger(id) || !String(reason || '').trim()) throw Object.assign(new Error('conversationId and reason are required'), { statusCode: 400 });
  const exists = await pool.query('SELECT id FROM social_inbox_conversations WHERE id=$1 AND tenant_uid=$2', [id, tenantUid]); if (!exists.rows[0]) return null;
  const { rows } = await pool.query(`INSERT INTO crm_social_automation_pauses (tenant_uid,conversation_id,reason,paused_by) VALUES ($1,$2,$3,$4) ON CONFLICT (tenant_uid,conversation_id) WHERE resumed_at IS NULL DO UPDATE SET reason=EXCLUDED.reason,paused_by=EXCLUDED.paused_by,paused_at=NOW() RETURNING *`, [tenantUid, id, String(reason).trim(), actorId(user)]); return rows[0];
}
export async function resumeConversation(tenantUid, conversationId) { const id = Number.parseInt(conversationId, 10); const { rows } = await pool.query(`UPDATE crm_social_automation_pauses SET resumed_at=NOW() WHERE tenant_uid=$1 AND conversation_id=$2 AND resumed_at IS NULL RETURNING *`, [tenantUid, id]); return rows[0] || null; }
export async function scheduleReply(tenantUid, input, user) {
  const id = Number.parseInt(input.conversationId, 10); const body = String(input.body || '').trim(); const date = new Date(input.sendAt);
  if (!Number.isInteger(id) || !body || Number.isNaN(date.valueOf())) throw Object.assign(new Error('conversationId, body and valid sendAt are required'), { statusCode: 400 });
  const exists = await pool.query('SELECT id FROM social_inbox_conversations WHERE id=$1 AND tenant_uid=$2', [id, tenantUid]); if (!exists.rows[0]) return null;
  const { rows } = await pool.query('INSERT INTO crm_social_scheduled_replies (tenant_uid,conversation_id,body,send_at,created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *', [tenantUid, id, body, date, actorId(user)]); return rows[0];
}
export async function listScheduledReplies(tenantUid, { status } = {}) { const { rows } = await pool.query('SELECT * FROM crm_social_scheduled_replies WHERE tenant_uid=$1 AND ($2::text IS NULL OR status=$2) ORDER BY send_at', [tenantUid, status || null]); return rows; }

/**
 * Deliver due replies with a row lock so multiple API instances cannot send
 * the same message. Opted-out identities are cancelled before any provider
 * call. Provider failures remain visible as failed rows for operator retry.
 */
export async function processDueScheduledReplies({ tenantUid = null, limit = 25, now = new Date() } = {}) {
  const boundedLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 25, 1), 100);
  const params = tenantUid ? [tenantUid, now, boundedLimit] : [now, boundedLimit];
  const where = tenantUid ? 'r.tenant_uid=$1 AND' : '';
  const nowParam = tenantUid ? '$2' : '$1';
  const limitParam = tenantUid ? '$3' : '$2';
  const client = await pool.connect();
  const results = [];
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`SELECT r.*, c.channel, c.external_user_id FROM crm_social_scheduled_replies r JOIN social_inbox_conversations c ON c.id=r.conversation_id AND c.tenant_uid=r.tenant_uid LEFT JOIN crm_social_identities i ON i.tenant_uid=r.tenant_uid AND i.channel=c.channel AND i.external_user_id=c.external_user_id WHERE ${where} r.status='scheduled' AND r.send_at <= ${nowParam} ORDER BY r.send_at LIMIT ${limitParam} FOR UPDATE OF r SKIP LOCKED`, params);
    for (const row of rows) {
      try {
        const identity = await client.query('SELECT consent_status FROM crm_social_identities WHERE tenant_uid=$1 AND channel=$2 AND external_user_id=$3', [row.tenant_uid, row.channel, row.external_user_id]);
        if (identity.rows[0]?.consent_status === 'opted_out') {
          await client.query(`UPDATE crm_social_scheduled_replies SET status='cancelled',error='Recipient opted out',updated_at=NOW() WHERE id=$1`, [row.id]);
          results.push({ id: row.id, status: 'cancelled', reason: 'opted_out' });
          continue;
        }
        // Keep the lock through the provider call. The bounded batch and
        // provider timeout prevent a long-running transaction from starving
        // other tenants while guaranteeing at-most-once delivery.
        await sendReply({ conversationId: row.conversation_id, text: row.body, teamUserId: row.created_by, tenantUid: row.tenant_uid });
        await client.query(`UPDATE crm_social_scheduled_replies SET status='sent',sent_at=NOW(),updated_at=NOW(),error=NULL WHERE id=$1`, [row.id]);
        results.push({ id: row.id, status: 'sent' });
      } catch (error) {
        await client.query(`UPDATE crm_social_scheduled_replies SET status='failed',error=$1,updated_at=NOW() WHERE id=$2`, [String(error.message).slice(0, 1000), row.id]);
        results.push({ id: row.id, status: 'failed', error: error.message });
      }
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  return results;
}
