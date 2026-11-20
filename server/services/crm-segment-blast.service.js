/**
 * CRM Growth Engine — Phase 2: bulk send to a segment.
 *
 * Note: this is deliberately NOT the same system as crm_marketing_campaigns
 * (server/routes/crmCampaigns.route.js) — that's a complete, already-working
 * email-only campaign engine (SMTP, A/B testing, click/open tracking,
 * suppression lists) and this pass leaves it untouched. What's missing is a
 * multi-channel (email/SMS/WhatsApp) send to a *segment* (Phase 1's dynamic,
 * v2-native audience), logged into crm_communication_events like every other
 * v2-world send. Same provider integrations as the 1:1 send
 * (dispatchToChannel in hospital-crm-communication-hub.service.js), just
 * fanned out over a queue instead of called once.
 */
import sharedPool from '../db/pgPool.js';
import { queues, addJob } from '../config/queues.js';
import { listSegmentMembers, getSegment } from './crm-segments.service.js';
import { dispatchToChannel, findOrCreateConversation } from './hospital-crm-communication-hub.service.js';

function positiveInt(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function startSegmentBlast({ tenantId, segmentId, channel, subject, message, userId }) {
  const safeChannel = String(channel || '').toLowerCase();
  if (!['email', 'whatsapp', 'sms'].includes(safeChannel)) {
    throw Object.assign(new Error('Invalid channel. Use email, whatsapp, or sms.'), { statusCode: 400 });
  }
  const safeMessage = String(message || '').trim();
  if (!safeMessage) throw Object.assign(new Error('Message is required'), { statusCode: 400 });

  const segment = await getSegment(tenantId, segmentId);
  const members = await listSegmentMembers(tenantId, segmentId, { limit: 500 });
  if (!members.length) throw Object.assign(new Error('This segment currently has no matching leads'), { statusCode: 400 });

  const campaign = await sharedPool.query(
    `INSERT INTO crm_campaigns_unified (tenant_id, channel, name, objective, lifecycle_status, metadata, created_by)
     VALUES ($1,$2,$3,'segment_blast','active',$4,$5) RETURNING id`,
    [
      tenantId, safeChannel, `${segment.name} — ${safeChannel} blast`,
      JSON.stringify({ segment_id: segment.id, segment_name: segment.name, total_recipients: members.length, subject: subject || null }),
      userId || null,
    ]
  );
  const campaignId = campaign.rows[0].id;

  let queued = 0;
  for (const member of members) {
    await addJob('crmSegmentBlast', 'send', {
      tenantId, campaignId, leadId: member.lead_id, name: member.name,
      to: safeChannel === 'email' ? member.email : member.phone,
      channel: safeChannel, subject: subject || null, message: safeMessage, userId,
    }, { attempts: 1 }); // one attempt only — an outbound message send should never be silently retried/duplicated
    queued++;
  }

  return { campaignId, segmentId: segment.id, segmentName: segment.name, channel: safeChannel, queued };
}

/** Called by the BullMQ worker for each queued recipient. */
export async function processSegmentBlastJob({ tenantId, campaignId, leadId, name, to, channel, subject, message }) {
  if (!to) {
    await _logBlastEvent({ tenantId, campaignId, leadId, channel, subject, status: 'failed', failureReason: `${name || 'Recipient'} has no ${channel === 'email' ? 'email address' : 'phone number'} on file` });
    await _maybeCompleteCampaign(tenantId, campaignId);
    return { skipped: true };
  }

  const result = await dispatchToChannel({ channel, to, subject, message, tenantId });
  await _logBlastEvent({
    tenantId, campaignId, leadId, channel, subject,
    status: result.success ? 'sent' : 'failed',
    provider: result.provider, providerMessageId: result.providerMessageId, failureReason: result.error,
    bodyPreview: message,
  });

  await _maybeCompleteCampaign(tenantId, campaignId);
  return result;
}

async function _logBlastEvent({ tenantId, campaignId, leadId, channel, subject, status, provider, providerMessageId, failureReason, bodyPreview }) {
  const conversationId = leadId ? await findOrCreateConversation({ tenantId, leadId, channel }).catch(() => null) : null;
  await sharedPool.query(
    `INSERT INTO crm_communication_events
       (tenant_id, lead_id, campaign_id, conversation_id, channel, direction, message_type, subject, body_preview,
        provider, provider_message_id, status, sent_at, failed_at, failure_reason)
     VALUES ($1,$2,$3,$4,$5,'outbound','campaign',$6,$7,$8,$9,$10::varchar,
             CASE WHEN $10::varchar='sent' THEN NOW() ELSE NULL END,
             CASE WHEN $10::varchar='failed' THEN NOW() ELSE NULL END,
             $11)`,
    [tenantId, leadId || null, positiveInt(campaignId), conversationId, channel, subject || null, bodyPreview ? String(bodyPreview).slice(0, 2000) : null, provider || null, providerMessageId || null, status, failureReason || null]
  );
}

async function _maybeCompleteCampaign(tenantId, campaignId) {
  const { rows } = await sharedPool.query(`SELECT metadata, lifecycle_status FROM crm_campaigns_unified WHERE id = $1 AND tenant_id = $2`, [campaignId, tenantId]);
  const campaign = rows[0];
  if (!campaign || campaign.lifecycle_status === 'completed') return;
  const total = Number(campaign.metadata?.total_recipients || 0);
  if (!total) return;
  const { rows: countRows } = await sharedPool.query(`SELECT COUNT(*) FROM crm_communication_events WHERE campaign_id = $1`, [campaignId]);
  if (Number(countRows[0].count) >= total) {
    await sharedPool.query(`UPDATE crm_campaigns_unified SET lifecycle_status = 'completed', updated_at = NOW() WHERE id = $1`, [campaignId]);
  }
}

export async function getBlastStatus(tenantId, campaignId) {
  const { rows } = await sharedPool.query(`SELECT * FROM crm_campaigns_unified WHERE tenant_id = $1 AND id = $2`, [tenantId, positiveInt(campaignId)]);
  const campaign = rows[0];
  if (!campaign) throw Object.assign(new Error('Campaign not found'), { statusCode: 404 });
  const { rows: summary } = await sharedPool.query(
    `SELECT status, COUNT(*) FROM crm_communication_events WHERE campaign_id = $1 GROUP BY status`,
    [campaignId]
  );
  return { campaign, summary: Object.fromEntries(summary.map((r) => [r.status, Number(r.count)])) };
}

export default { startSegmentBlast, processSegmentBlastJob, getBlastStatus };
