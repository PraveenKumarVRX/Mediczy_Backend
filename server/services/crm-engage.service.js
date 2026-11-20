/** Engage: the one place for templates, audiences, campaigns and automations.
 *
 * Canonical storage (the duplicates are retired, see installations/crm/consolidate-engagement.mjs):
 *   templates   crm_communication_templates   (WhatsApp via Gupshup review; email and SMS approved on save)
 *   audiences   crm_segments + crm_segment_members (rule-based, or static lists: filter_definition.type = 'static')
 *   campaigns   crm_campaigns_unified (platform 'engage') + crm_campaign_recipients, deliveries in
 *               crm_communication_events.campaign_id so receipts (delivered/read) flow back automatically
 *   automations crm_automations (engine started by crm-app.mjs)
 *
 * The campaign runner is in-process (no queue worker): every minute it sends the next batch of an
 * active, due campaign, one recipient at a time, skipping patients without consent or a usable
 * number/email. It only sends while CRM_BULK_SENDING_ENABLED=true; otherwise campaigns wait and say so. */
import { randomUUID } from 'node:crypto';
import sharedPool from '../db/pgPool.js';
import { compileFilterToSql, createSegment, updateSegment, deleteSegment, refreshSegmentMembership } from './crm-segments.service.js';
import { sendTemplate } from './gupshup-control.service.js';
import { dispatchToChannel, findOrCreateConversation } from './hospital-crm-communication-hub.service.js';

const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const positive = (v) => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : null; };
const CHANNELS = ['whatsapp', 'email', 'sms'];
const NO_CONSENT = ['denied', 'withdrawn'];
export const bulkEnabled = () => process.env.CRM_BULK_SENDING_ENABLED === 'true';

// ── templates ────────────────────────────────────────────────────────────────
export async function listTemplates(tenantId, { channel } = {}) {
  const params = [tenantId];
  let where = `tenant_id = $1 AND status <> 'archived'`;
  if (CHANNELS.includes(channel)) { params.push(channel); where += ` AND channel = $2`; }
  const { rows } = await sharedPool.query(
    `SELECT id, name, channel, category, subject, body, status, provider_status, language_code, rejection_reason,
            metadata->>'family' AS family, (metadata->>'placeholders')::int AS placeholders, metadata->'variableNames' AS variable_names, updated_at
       FROM crm_communication_templates WHERE ${where} ORDER BY channel, metadata->>'family' NULLS LAST, name, language_code`, params);
  return rows;
}

export async function saveTemplate(tenantId, userId, input, id = null) {
  const channel = String(input.channel || '').toLowerCase();
  if (!['email', 'sms'].includes(channel)) throw fail(400, 'Create WhatsApp templates on the WhatsApp page; they need Meta review.');
  const name = String(input.name || '').trim().slice(0, 120);
  const body = String(input.body || '').trim();
  const subject = channel === 'email' ? String(input.subject || '').trim().slice(0, 200) : null;
  if (!name) throw fail(400, 'Give the template a name.');
  if (!body) throw fail(400, 'Write the message.');
  if (channel === 'sms' && body.length > 1000) throw fail(400, 'SMS templates are limited to 1000 characters.');
  if (channel === 'email' && !subject) throw fail(400, 'Email templates need a subject.');
  const variables = [...new Set((body.match(/\{\{\s*[\w.]+\s*\}\}/g) || []).map((v) => v.replace(/[{}\s]/g, '')))];
  if (id) {
    const { rows: [t] } = await sharedPool.query(
      `UPDATE crm_communication_templates SET name = $3, subject = $4, body = $5, variables = $6::jsonb, updated_at = now()
        WHERE tenant_id = $1 AND id = $2 AND channel = $7 RETURNING id`, [tenantId, positive(id), name, subject, body, JSON.stringify(variables), channel]);
    if (!t) throw fail(404, 'Template not found');
    return { id: t.id };
  }
  const { rows: [t] } = await sharedPool.query(
    `INSERT INTO crm_communication_templates (tenant_id, name, channel, category, subject, body, variables, status, created_by, approved_by, approved_at, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'approved', $8, $8, now(), '{"source":"engage"}'::jsonb) RETURNING id`,
    [tenantId, name, channel, String(input.category || 'utility').toLowerCase(), subject, body, JSON.stringify(variables), userId]);
  return { id: t.id };
}

export async function archiveTemplate(tenantId, id) {
  const { rows: [used] } = await sharedPool.query(
    `SELECT name FROM crm_campaigns_unified WHERE tenant_id = $1 AND platform = 'engage' AND template_ref = $2 AND lifecycle_status IN ('draft','active','paused') LIMIT 1`,
    [tenantId, String(positive(id))]);
  if (used) throw fail(409, `Used by campaign "${used.name}". Finish or archive it first.`);
  const { rows: [t] } = await sharedPool.query(
    `UPDATE crm_communication_templates SET status = 'archived', updated_at = now() WHERE tenant_id = $1 AND id = $2 AND channel IN ('email','sms') RETURNING id`,
    [tenantId, positive(id)]);
  if (!t) throw fail(404, 'Template not found (WhatsApp templates are deleted from the WhatsApp page).');
  return { archived: true };
}

// ── audiences ────────────────────────────────────────────────────────────────
function normalizeAudience(input) {
  const type = input.type === 'static' ? 'static' : 'dynamic';
  if (type === 'static') {
    const ids = [...new Set((input.leadIds || []).map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))];
    return { type, lead_ids: ids };
  }
  const conditions = (Array.isArray(input.conditions) ? input.conditions : [])
    .filter((c) => c && c.field && c.op && c.value !== undefined && c.value !== '').slice(0, 12);
  return { type, conditions };
}

export async function previewAudience(tenantId, input) {
  const def = normalizeAudience(input);
  const { whereSql, params } = compileFilterToSql(def, [tenantId]);
  const { rows: [r] } = await sharedPool.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE COALESCE(c.consent_status, 'unknown') NOT IN ('denied','withdrawn'))::int AS reachable,
            count(*) FILTER (WHERE c.phone_e164 IS NOT NULL)::int AS with_phone,
            count(*) FILTER (WHERE c.email IS NOT NULL)::int AS with_email
       FROM crm_leads_v2 lv LEFT JOIN crm_contacts_v2 c ON c.id = lv.contact_id
      WHERE lv.tenant_id = $1 AND lv.deleted_at IS NULL AND (${whereSql})`, params);
  return r;
}

export async function listAudiences(tenantId) {
  const { rows } = await sharedPool.query(
    `SELECT s.id, s.name, s.description, s.filter_definition, s.member_count, s.last_refreshed_at, s.is_active, s.updated_at,
            COALESCE(s.filter_definition->>'type', 'dynamic') AS type,
            (SELECT count(*)::int FROM crm_campaigns_unified c WHERE c.tenant_id = s.tenant_id AND c.platform = 'engage' AND c.audience_ref = s.id::text) AS campaigns
       FROM crm_segments s WHERE s.tenant_id = $1 ORDER BY s.updated_at DESC NULLS LAST, s.id DESC`, [tenantId]);
  return rows;
}

export async function saveAudience(tenantId, userId, input, id = null) {
  const name = String(input.name || '').trim().slice(0, 150);
  if (!name) throw fail(400, 'Give the audience a name.');
  const def = normalizeAudience(input);
  if (def.type === 'dynamic' && !def.conditions.length) throw fail(400, 'Add at least one rule, or make it a static list.');
  try {
    const seg = id
      ? await updateSegment(tenantId, positive(id), { name, description: input.description ?? null, filterDefinition: def })
      : await createSegment({ tenantId, name, description: input.description || null, filterDefinition: def, createdBy: userId });
    const count = await refreshSegmentMembership(seg.id, tenantId);
    return { id: seg.id, member_count: count };
  } catch (error) {
    if (error.code === '23505') throw fail(409, 'An audience with that name already exists.');
    throw error;
  }
}

export async function removeAudience(tenantId, id) {
  const { rows: [used] } = await sharedPool.query(
    `SELECT name FROM crm_campaigns_unified WHERE tenant_id = $1 AND platform = 'engage' AND audience_ref = $2 AND lifecycle_status IN ('draft','active','paused') LIMIT 1`,
    [tenantId, String(positive(id))]);
  if (used) throw fail(409, `Used by campaign "${used.name}". Finish or archive it first.`);
  const { rows: [auto] } = await sharedPool.query(
    `SELECT name FROM crm_automations WHERE tenant_id = $1 AND trigger_type = 'segment_entered' AND (trigger_config->>'segmentId')::bigint = $2 AND status <> 'paused' LIMIT 1`,
    [tenantId, positive(id)]);
  if (auto) throw fail(409, `Used by automation "${auto.name}". Pause it first.`);
  await deleteSegment(tenantId, positive(id));
  return { deleted: true };
}

export async function audienceMembers(tenantId, id, { limit = 100 } = {}) {
  const { rows } = await sharedPool.query(
    `SELECT lv.id AS lead_id, lv.legacy_lead_id, l.name, c.phone_e164 AS phone, c.email, COALESCE(c.consent_status, 'unknown') AS consent, l.status, l.source
       FROM crm_segment_members m JOIN crm_leads_v2 lv ON lv.id = m.lead_id JOIN crm_leads l ON l.id = lv.legacy_lead_id
       LEFT JOIN crm_contacts_v2 c ON c.id = lv.contact_id
      WHERE m.tenant_id = $1 AND m.segment_id = $2 ORDER BY l.name LIMIT $3`, [tenantId, positive(id), Math.min(Number(limit) || 100, 500)]);
  return rows;
}

/** Leads to pick from when building a static list. */
export async function searchLeads(tenantId, q) {
  const s = String(q || '').trim().slice(0, 60);
  const { rows } = await sharedPool.query(
    `SELECT lv.id AS lead_id, l.name, l.phone, l.email, l.source FROM crm_leads_v2 lv JOIN crm_leads l ON l.id = lv.legacy_lead_id
      WHERE lv.tenant_id = $1 AND lv.deleted_at IS NULL AND ($2 = '' OR l.name ILIKE '%' || $2 || '%' OR l.phone LIKE '%' || $2 || '%' OR l.email ILIKE '%' || $2 || '%')
      ORDER BY l.updated_at DESC LIMIT 25`, [tenantId, s]);
  return rows;
}

// ── campaigns ────────────────────────────────────────────────────────────────
async function campaignRow(tenantId, id) {
  const { rows: [c] } = await sharedPool.query(`SELECT * FROM crm_campaigns_unified WHERE tenant_id = $1 AND id = $2 AND platform = 'engage'`, [tenantId, positive(id)]);
  if (!c) throw fail(404, 'Campaign not found');
  return c;
}

export async function listCampaigns(tenantId) {
  const { rows } = await sharedPool.query(
    `SELECT c.id, c.name, c.channel, c.objective, c.lifecycle_status AS status, c.starts_at, c.audience_ref, c.template_ref, c.last_run_at, c.last_error,
            c.metadata, c.created_at, s.name AS audience_name, s.member_count,
            COALESCE(t.name, c.template_ref) AS template_name,
            (SELECT jsonb_build_object(
               'sent', count(*) FILTER (WHERE r.status = 'sent'), 'failed', count(*) FILTER (WHERE r.status = 'failed'),
               'skipped', count(*) FILTER (WHERE r.status = 'skipped'),
               'delivered', count(*) FILTER (WHERE e.status IN ('delivered','read')), 'read', count(*) FILTER (WHERE e.status = 'read'))
               FROM crm_campaign_recipients r LEFT JOIN crm_communication_events e ON e.id = r.event_id
              WHERE r.campaign_id = c.id) AS stats
       FROM crm_campaigns_unified c
       LEFT JOIN crm_segments s ON s.tenant_id = c.tenant_id AND s.id::text = c.audience_ref
       LEFT JOIN crm_communication_templates t ON t.tenant_id = c.tenant_id AND t.id::text = c.template_ref
      WHERE c.tenant_id = $1 AND c.platform = 'engage' AND c.deleted_at IS NULL
      ORDER BY c.created_at DESC`, [tenantId]);
  return { campaigns: rows, bulkEnabled: bulkEnabled() };
}

async function validateCampaign(tenantId, input) {
  const channel = String(input.channel || '').toLowerCase();
  if (!CHANNELS.includes(channel)) throw fail(400, 'Choose WhatsApp, email or SMS.');
  const name = String(input.name || '').trim().slice(0, 150);
  if (!name) throw fail(400, 'Give the campaign a name.');
  const audienceId = positive(input.audienceId);
  const { rows: [aud] } = await sharedPool.query(`SELECT id FROM crm_segments WHERE tenant_id = $1 AND id = $2`, [tenantId, audienceId]);
  if (!aud) throw fail(400, 'Choose an audience.');
  let templateRef;
  if (channel === 'whatsapp') {
    if (input.family) {
      const { rows } = await sharedPool.query(`SELECT 1 FROM crm_communication_templates WHERE tenant_id = $1 AND channel = 'whatsapp' AND status = 'approved' AND metadata->>'family' = $2 LIMIT 1`, [tenantId, String(input.family)]);
      if (!rows.length) throw fail(400, 'That template family has no approved language yet.');
      templateRef = `family:${input.family}`;
    } else {
      const { rows } = await sharedPool.query(`SELECT 1 FROM crm_communication_templates WHERE tenant_id = $1 AND id = $2 AND channel = 'whatsapp' AND status = 'approved'`, [tenantId, positive(input.templateId)]);
      if (!rows.length) throw fail(400, 'WhatsApp campaigns need an approved template.');
      templateRef = String(positive(input.templateId));
    }
  } else {
    const { rows } = await sharedPool.query(`SELECT 1 FROM crm_communication_templates WHERE tenant_id = $1 AND id = $2 AND channel = $3 AND status = 'approved'`, [tenantId, positive(input.templateId), channel]);
    if (!rows.length) throw fail(400, `Choose an ${channel === 'email' ? 'email' : 'SMS'} template.`);
    templateRef = String(positive(input.templateId));
  }
  const startsAt = input.startsAt ? new Date(input.startsAt) : null;
  if (startsAt && Number.isNaN(startsAt.getTime())) throw fail(400, 'Invalid schedule time.');
  const params = (Array.isArray(input.params) ? input.params : []).map((p) => String(p ?? '').slice(0, 200));
  return { channel, name, audienceId, templateRef, startsAt, params, objective: String(input.objective || '').slice(0, 100) || null };
}

export async function saveCampaign(tenantId, userId, input, id = null) {
  const v = await validateCampaign(tenantId, input);
  if (id) {
    const c = await campaignRow(tenantId, id);
    if (c.lifecycle_status !== 'draft') throw fail(409, 'Only draft campaigns can be edited. Pause and duplicate it instead.');
    await sharedPool.query(
      `UPDATE crm_campaigns_unified SET name = $3, channel = $4, audience_ref = $5, template_ref = $6, starts_at = $7, objective = $8,
              metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('params', $9::jsonb), updated_at = now()
        WHERE tenant_id = $1 AND id = $2`, [tenantId, c.id, v.name, v.channel, String(v.audienceId), v.templateRef, v.startsAt, v.objective, JSON.stringify(v.params)]);
    return { id: c.id };
  }
  const { rows: [c] } = await sharedPool.query(
    `INSERT INTO crm_campaigns_unified (tenant_id, channel, platform, external_campaign_id, name, objective, lifecycle_status, audience_ref, template_ref, starts_at, metadata, created_by, campaign_type, source)
     VALUES ($1, $2, 'engage', $3, $4, $5, 'draft', $6, $7, $8, $9::jsonb, $10, 'broadcast', 'crm')
     RETURNING id`,
    [tenantId, v.channel, randomUUID(), v.name, v.objective, String(v.audienceId), v.templateRef, v.startsAt, JSON.stringify({ engage: true, params: v.params }), userId]);
  return { id: c.id };
}

/** launch | pause | resume | archive */
export async function campaignAction(tenantId, id, action) {
  const c = await campaignRow(tenantId, id);
  const next = { launch: 'active', resume: 'active', pause: 'paused', archive: 'archived' }[action];
  if (!next) throw fail(400, 'Unknown action.');
  if (action === 'launch' && c.lifecycle_status !== 'draft') throw fail(409, 'Already launched.');
  if (action === 'resume' && c.lifecycle_status !== 'paused') throw fail(409, 'Only paused campaigns can be resumed.');
  if (action === 'pause' && c.lifecycle_status !== 'active') throw fail(409, 'Only running campaigns can be paused.');
  if (action === 'launch') await refreshSegmentMembership(Number(c.audience_ref), tenantId);
  await sharedPool.query(
    `UPDATE crm_campaigns_unified SET lifecycle_status = $3, starts_at = CASE WHEN $4 AND starts_at IS NULL THEN now() ELSE starts_at END, last_error = NULL, updated_at = now()
      WHERE tenant_id = $1 AND id = $2`, [tenantId, c.id, next, action === 'launch']);
  return { id: c.id, status: next, bulkEnabled: bulkEnabled(),
    note: next === 'active' && !bulkEnabled() ? 'Scheduled. It will start sending once bulk sending is switched on (CRM_BULK_SENDING_ENABLED).' : null };
}

export async function campaignRecipients(tenantId, id) {
  const c = await campaignRow(tenantId, id);
  const { rows } = await sharedPool.query(
    `SELECT r.lead_id, l.name, r.status, r.reason, r.sent_at, e.status AS delivery
       FROM crm_campaign_recipients r JOIN crm_leads_v2 lv ON lv.id = r.lead_id JOIN crm_leads l ON l.id = lv.legacy_lead_id
       LEFT JOIN crm_communication_events e ON e.id = r.event_id
      WHERE r.campaign_id = $1 ORDER BY r.sent_at DESC NULLS LAST LIMIT 500`, [c.id]);
  return rows;
}

// ── runner ───────────────────────────────────────────────────────────────────
function render(text, lead) {
  const first = String(lead.name || '').trim().split(/\s+/)[0] || 'there';
  return String(text || '').replace(/\{\{\s*lead\.name\s*\}\}/g, lead.name || 'there').replace(/\{\{\s*lead\.first_name\s*\}\}/g, first)
    .replace(/\{\{\s*lead\.phone\s*\}\}/g, lead.phone || '').replace(/\{\{\s*lead\.email\s*\}\}/g, lead.email || '');
}

async function sendOne(c, lead) {
  const tenantId = c.tenant_id;
  if (NO_CONSENT.includes(lead.consent)) return { status: 'skipped', reason: 'no consent' };
  if (c.channel === 'whatsapp') {
    if (!lead.phone) return { status: 'skipped', reason: 'no mobile number' };
    const params = (c.metadata?.params || []).map((p) => render(p, lead));
    const ref = String(c.template_ref || '');
    const sent = await sendTemplate(tenantId, ref.startsWith('family:') ? { family: ref.slice(7), leadId: lead.legacy_lead_id, params } : { templateId: Number(ref), leadId: lead.legacy_lead_id, params }, c.created_by);
    const { rows: [ev] } = await sharedPool.query(
      `UPDATE crm_communication_events SET campaign_id = $2, message_type = 'campaign' WHERE tenant_id = $1 AND provider = 'gupshup' AND provider_message_id = $3 RETURNING id`,
      [tenantId, c.id, sent.messageId]);
    return { status: 'sent', eventId: ev?.id || null };
  }
  const { rows: [t] } = await sharedPool.query(`SELECT subject, body FROM crm_communication_templates WHERE tenant_id = $1 AND id = $2`, [tenantId, Number(c.template_ref)]);
  if (!t) throw new Error('Template no longer exists');
  const to = c.channel === 'email' ? lead.email : lead.phone;
  if (!to) return { status: 'skipped', reason: c.channel === 'email' ? 'no email' : 'no mobile number' };
  const message = render(t.body, lead), subject = render(t.subject, lead);
  const result = await dispatchToChannel({ channel: c.channel, to, subject, message, tenantId });
  if (!result?.success) throw new Error(result?.error || 'Send failed');
  const conversationId = await findOrCreateConversation({ tenantId, leadId: lead.lead_id, channel: c.channel }).catch(() => null);
  const { rows: [ev] } = await sharedPool.query(
    `INSERT INTO crm_communication_events (tenant_id, lead_id, contact_id, conversation_id, campaign_id, channel, direction, message_type, subject, body_preview,
       provider, provider_message_id, status, sent_at, owner_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, 'outbound', 'campaign', $7, $8, $9, $10, 'sent', now(), $11) RETURNING id`,
    [tenantId, lead.lead_id, lead.contact_id, conversationId, c.id, c.channel, subject || null, message.slice(0, 2000), result.provider || null, result.providerMessageId || null, c.created_by]);
  return { status: 'sent', eventId: ev.id };
}

let running = false;
export async function runCampaignTick({ batch = 60, paceMs = 700, onlyIds = null } = {}) {
  if (running) return { skipped: 'already running' };
  running = true;
  const summary = { campaigns: 0, sent: 0, skipped: 0, failed: 0 };
  try {
    const { rows: due } = await sharedPool.query(
      `SELECT * FROM crm_campaigns_unified WHERE platform = 'engage' AND lifecycle_status = 'active' AND deleted_at IS NULL AND (starts_at IS NULL OR starts_at <= now())
         AND ($1::bigint[] IS NULL OR id = ANY($1::bigint[])) ORDER BY starts_at NULLS FIRST LIMIT 5`, [onlyIds]); // onlyIds: tests never touch real campaigns
    for (const c of due) {
      if (!bulkEnabled()) {
        await sharedPool.query(`UPDATE crm_campaigns_unified SET last_error = $2::text WHERE id = $1 AND last_error IS DISTINCT FROM $2::text`, [c.id, 'Waiting: bulk sending is switched off (CRM_BULK_SENDING_ENABLED).']);
        continue;
      }
      summary.campaigns += 1;
      const { rows: pending } = await sharedPool.query(
        `SELECT lv.id AS lead_id, lv.legacy_lead_id, lv.contact_id, l.name, ct.phone_e164 AS phone, ct.email, COALESCE(ct.consent_status, 'unknown') AS consent
           FROM crm_segment_members m JOIN crm_leads_v2 lv ON lv.id = m.lead_id AND lv.deleted_at IS NULL JOIN crm_leads l ON l.id = lv.legacy_lead_id
           LEFT JOIN crm_contacts_v2 ct ON ct.id = lv.contact_id
          WHERE m.tenant_id = $1 AND m.segment_id = $2 AND NOT EXISTS (SELECT 1 FROM crm_campaign_recipients r WHERE r.campaign_id = $3 AND r.lead_id = lv.id)
          ORDER BY m.lead_id LIMIT $4`, [c.tenant_id, Number(c.audience_ref), c.id, batch]);
      if (!pending.length) {
        await sharedPool.query(`UPDATE crm_campaigns_unified SET lifecycle_status = 'completed', last_run_at = now(), last_error = NULL, updated_at = now() WHERE id = $1`, [c.id]);
        continue;
      }
      let consecutiveFailures = 0;
      for (const lead of pending) {
        const { rows: [still] } = await sharedPool.query(`SELECT lifecycle_status FROM crm_campaigns_unified WHERE id = $1`, [c.id]);
        if (still?.lifecycle_status !== 'active' || !bulkEnabled()) break; // paused mid-batch
        let outcome;
        try { outcome = await sendOne(c, lead); consecutiveFailures = 0; }
        catch (error) { outcome = { status: 'failed', reason: String(error.message || error).slice(0, 300) }; consecutiveFailures += 1; }
        await sharedPool.query(
          `INSERT INTO crm_campaign_recipients (tenant_id, campaign_id, lead_id, status, reason, event_id, sent_at)
           VALUES ($1, $2, $3, $4::varchar, $5, $6, CASE WHEN $4::varchar = 'sent' THEN now() END) ON CONFLICT (campaign_id, lead_id) DO NOTHING`,
          [c.tenant_id, c.id, lead.lead_id, outcome.status, outcome.reason || null, outcome.eventId || null]);
        summary[outcome.status] += 1;
        if (consecutiveFailures >= 5) {
          await sharedPool.query(`UPDATE crm_campaigns_unified SET lifecycle_status = 'paused', last_error = $2, updated_at = now() WHERE id = $1`,
            [c.id, `Paused after 5 failed sends in a row. Last error: ${outcome.reason}`]);
          break;
        }
        if (outcome.status === 'sent') await new Promise((done) => setTimeout(done, paceMs));
      }
      await sharedPool.query(`UPDATE crm_campaigns_unified SET last_run_at = now() WHERE id = $1`, [c.id]);
    }
  } finally { running = false; }
  return summary;
}

// ── automations (thin wrapper so Engage is the single screen) ─────────────────
export async function automationOptions(tenantId) {
  const [{ rows: audiences }, { rows: templates }, { rows: users }] = await Promise.all([
    sharedPool.query(`SELECT id, name FROM crm_segments WHERE tenant_id = $1 ORDER BY name`, [tenantId]),
    sharedPool.query(`SELECT id, name, channel, metadata->>'family' AS family, language_code, (metadata->>'placeholders')::int AS placeholders
                        FROM crm_communication_templates WHERE tenant_id = $1 AND status = 'approved' ORDER BY channel, name`, [tenantId]),
    sharedPool.query(`SELECT id, NULLIF(trim(concat_ws(' ', "firstName", "lastName")), '') AS name, email FROM users WHERE tenant_id = $1 AND status = 'active' ORDER BY id`, [tenantId]),
  ]);
  return {
    triggers: [
      { id: 'lead_created', label: 'A new lead arrives' }, { id: 'segment_entered', label: 'A lead joins an audience', config: 'segmentId' },
      { id: 'lifecycle_stage_changed', label: 'Lead reaches a stage', config: 'toStage' }, { id: 'lead_score_above', label: 'Lead score goes above', config: 'score' },
      { id: 'source_equals', label: 'Lead comes from a source', config: 'source' }, { id: 'no_activity_days', label: 'No activity for N days', config: 'days' },
    ],
    actions: [{ id: 'send_message', label: 'Send a message' }, { id: 'add_tag', label: 'Add a tag' }, { id: 'assign_owner', label: 'Assign an owner' }],
    audiences, templates, users,
  };
}
