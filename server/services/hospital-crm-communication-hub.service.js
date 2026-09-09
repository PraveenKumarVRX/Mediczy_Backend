import sharedPool from '../db/pgPool.js';

const CHANNELS = new Set(['email', 'whatsapp', 'sms', 'push', 'in_app']);
const CAMPAIGN_STATUSES = new Set(['draft', 'active', 'paused', 'completed', 'archived']);
const TEMPLATE_STATUSES = new Set(['draft', 'pending_approval', 'approved', 'archived']);

function tenantId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw Object.assign(new Error('A valid tenantId is required'), { statusCode: 400 });
  return id;
}

function positiveInt(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function dateRange({ from, to } = {}) {
  const end = to || new Date().toISOString();
  const start = from || new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)).toISOString();
  return { start, end };
}

function rate(numerator, denominator) {
  const n = Number(numerator || 0);
  const d = Number(denominator || 0);
  return d > 0 ? Number(((n / d) * 100).toFixed(2)) : 0;
}

function json(value, fallback = {}) {
  if (value == null) return fallback;
  return typeof value === 'object' ? value : JSON.parse(value);
}

export async function getCommunicationHubDashboard(tenant, query = {}) {
  const id = tenantId(tenant);
  const { start, end } = dateRange(query);
  const params = [id, start, end];

  const [overview, channels, campaigns, integrations, conversations, activity, alerts, templates] = await Promise.all([
    sharedPool.query(`
      SELECT
        COUNT(*) FILTER (WHERE direction = 'outbound')::int AS sent,
        COUNT(*) FILTER (WHERE direction = 'outbound' AND status IN ('queued', 'pending'))::int AS queued,
        COUNT(*) FILTER (WHERE direction = 'outbound' AND (status = 'delivered' OR delivered_at IS NOT NULL))::int AS delivered,
        COUNT(*) FILTER (WHERE direction = 'outbound' AND (status IN ('failed', 'bounced') OR failed_at IS NOT NULL))::int AS failed,
        COUNT(*) FILTER (WHERE direction = 'outbound' AND (status = 'opened' OR read_at IS NOT NULL))::int AS opened,
        COUNT(*) FILTER (WHERE direction = 'outbound' AND (status = 'clicked' OR clicked_at IS NOT NULL))::int AS clicked,
        COUNT(*) FILTER (WHERE direction = 'inbound')::int AS inbound,
        COUNT(DISTINCT identity_id) FILTER (WHERE direction = 'outbound')::int AS reached
      FROM crm_communication_events
      WHERE tenant_id = $1 AND created_at >= $2::timestamptz AND created_at < $3::timestamptz
    `, params),
    sharedPool.query(`
      SELECT channel,
        COUNT(*) FILTER (WHERE direction = 'outbound')::int AS sent,
        COUNT(*) FILTER (WHERE direction = 'outbound' AND (status = 'delivered' OR delivered_at IS NOT NULL))::int AS delivered,
        COUNT(*) FILTER (WHERE direction = 'outbound' AND (status = 'failed' OR status = 'bounced' OR failed_at IS NOT NULL))::int AS failed,
        COUNT(*) FILTER (WHERE direction = 'outbound' AND (status = 'opened' OR read_at IS NOT NULL))::int AS opened,
        COUNT(*) FILTER (WHERE direction = 'outbound' AND (status = 'clicked' OR clicked_at IS NOT NULL))::int AS clicked
      FROM crm_communication_events
      WHERE tenant_id = $1 AND created_at >= $2::timestamptz AND created_at < $3::timestamptz
      GROUP BY channel ORDER BY sent DESC
    `, params),
    sharedPool.query(`
      SELECT c.id, c.name, c.channel, c.platform, c.lifecycle_status, c.objective,
        c.audience_ref, c.template_ref, c.budget_amount, c.last_run_at, c.last_error,
        COALESCE((SELECT COUNT(*) FROM crm_communication_events e WHERE e.tenant_id = c.tenant_id AND e.campaign_id = c.id AND e.direction = 'outbound' AND e.created_at >= $2::timestamptz AND e.created_at < $3::timestamptz), 0)::int AS sent,
        COALESCE((SELECT COUNT(*) FROM crm_communication_events e WHERE e.tenant_id = c.tenant_id AND e.campaign_id = c.id AND e.direction = 'outbound' AND (e.status = 'delivered' OR e.delivered_at IS NOT NULL) AND e.created_at >= $2::timestamptz AND e.created_at < $3::timestamptz), 0)::int AS delivered,
        COALESCE((SELECT COUNT(*) FROM crm_communication_events e WHERE e.tenant_id = c.tenant_id AND e.campaign_id = c.id AND e.direction = 'outbound' AND (e.status IN ('failed', 'bounced') OR e.failed_at IS NOT NULL) AND e.created_at >= $2::timestamptz AND e.created_at < $3::timestamptz), 0)::int AS failed,
        COALESCE((SELECT COUNT(*) FROM crm_communication_events e WHERE e.tenant_id = c.tenant_id AND e.campaign_id = c.id AND e.direction = 'outbound' AND (e.status = 'opened' OR e.read_at IS NOT NULL) AND e.created_at >= $2::timestamptz AND e.created_at < $3::timestamptz), 0)::int AS opened,
        COALESCE((SELECT COUNT(*) FROM crm_communication_events e WHERE e.tenant_id = c.tenant_id AND e.campaign_id = c.id AND e.direction = 'outbound' AND (e.status = 'clicked' OR e.clicked_at IS NOT NULL) AND e.created_at >= $2::timestamptz AND e.created_at < $3::timestamptz), 0)::int AS clicked,
        COALESCE((SELECT SUM(r.net_amount) FROM crm_revenue_events r WHERE r.tenant_id = c.tenant_id AND r.metadata->>'campaign_id' = c.id::text AND r.revenue_date >= $2::date AND r.revenue_date < $3::date), 0)::numeric AS revenue,
        COALESCE((SELECT SUM(cc.amount) FROM crm_campaign_costs cc WHERE cc.tenant_id = c.tenant_id AND cc.campaign_id = c.id AND cc.cost_date >= $2::date AND cc.cost_date < $3::date), 0)::numeric AS spend
      FROM crm_campaigns_unified c
      WHERE c.tenant_id = $1 AND c.deleted_at IS NULL
      ORDER BY c.updated_at DESC LIMIT 100
    `, params),
    sharedPool.query(`
      SELECT i.id, i.provider, i.integration_type, i.status, i.account_ref,
        i.last_sync_at, i.last_sync_status, i.health_score, i.health_message,
        i.last_health_check_at,
        run.status AS latest_run_status, run.started_at AS latest_run_at,
        run.records_seen AS latest_records_seen, run.records_failed AS latest_records_failed,
        COALESCE(err.open_errors, 0)::int AS open_errors
      FROM crm_marketing_integrations i
      LEFT JOIN LATERAL (
        SELECT status, started_at, records_seen, records_failed
        FROM crm_integration_runs r
        WHERE r.tenant_id = i.tenant_id AND r.integration_name = i.provider
        ORDER BY started_at DESC LIMIT 1
      ) run ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*) FILTER (WHERE status IN ('open', 'retrying')) AS open_errors
        FROM crm_integration_errors e
        WHERE e.tenant_id = i.tenant_id AND e.integration_name = i.provider
      ) err ON TRUE
      WHERE i.tenant_id = $1
      ORDER BY CASE WHEN i.status IN ('error', 'degraded') THEN 0 ELSE 1 END, i.provider
    `, [id]),
    sharedPool.query(`
      SELECT c.id, c.channel, c.status, c.last_message_at, c.lead_id,
        COALESCE(p.display_name, 'Unknown patient') AS contact_name,
        last_event.body_preview AS last_message,
        last_event.direction AS last_direction,
        last_event.status AS last_event_status
      FROM crm_conversations c
      LEFT JOIN crm_person_identities p ON p.id = c.identity_id AND p.tenant_id = c.tenant_id
      LEFT JOIN LATERAL (
        SELECT body_preview, direction, status
        FROM crm_communication_events e
        WHERE e.tenant_id = c.tenant_id AND e.conversation_id = c.id
        ORDER BY e.created_at DESC LIMIT 1
      ) last_event ON TRUE
      WHERE c.tenant_id = $1
      ORDER BY c.last_message_at DESC NULLS LAST LIMIT 25
    `, [id]),
    sharedPool.query(`
      SELECT e.id, e.channel, e.direction, e.message_type, e.status, e.body_preview,
        e.created_at, e.failure_reason, e.provider,
        COALESCE(p.display_name, 'Unknown patient') AS contact_name,
        c.name AS campaign_name
      FROM crm_communication_events e
      LEFT JOIN crm_person_identities p ON p.id = e.identity_id AND p.tenant_id = e.tenant_id
      LEFT JOIN crm_campaigns_unified c ON c.id = e.campaign_id AND c.tenant_id = e.tenant_id
      WHERE e.tenant_id = $1 AND e.created_at >= $2::timestamptz AND e.created_at < $3::timestamptz
      ORDER BY e.created_at DESC LIMIT 30
    `, params),
    sharedPool.query(`
      SELECT id, alert_type, severity, title, details, source_type, source_id, status, last_seen_at
      FROM crm_communication_hub_alerts
      WHERE tenant_id = $1 AND status <> 'resolved'
      ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, last_seen_at DESC
      LIMIT 25
    `, [id]),
    sharedPool.query(`
      SELECT id, name, channel, category, subject, body, variables, status, version, updated_at
      FROM crm_communication_templates
      WHERE tenant_id = $1 AND status <> 'archived'
      ORDER BY updated_at DESC LIMIT 100
    `, [id]),
  ]);

  const o = overview.rows[0] || {};
  return {
    period: { from: start, to: end },
    overview: {
      ...o,
      deliveryRate: rate(o.delivered, o.sent - Number(o.queued || 0)),
      openRate: rate(o.opened, o.delivered || o.sent),
      clickRate: rate(o.clicked, o.delivered || o.sent),
      failureRate: rate(o.failed, o.sent),
    },
    channels: channels.rows.map((row) => ({ ...row, deliveryRate: rate(row.delivered, row.sent), openRate: rate(row.opened, row.delivered || row.sent), clickRate: rate(row.clicked, row.delivered || row.sent) })),
    campaigns: campaigns.rows.map((row) => ({ ...row, revenue: Number(row.revenue || 0), spend: Number(row.spend || 0), roas: Number(row.spend || 0) > 0 ? Number((Number(row.revenue || 0) / Number(row.spend)).toFixed(2)) : 0 })),
    integrations: integrations.rows,
    conversations: conversations.rows,
    activity: activity.rows,
    alerts: alerts.rows,
    templates: templates.rows.map((row) => ({ ...row, variables: json(row.variables, []) })),
  };
}

export async function listCommunicationHubCampaigns(tenant, query = {}) {
  return (await getCommunicationHubDashboard(tenant, query)).campaigns;
}

export async function createCommunicationHubCampaign(input, actorUserId) {
  const id = tenantId(input.tenantId);
  const channel = String(input.channel || '').toLowerCase();
  if (!CHANNELS.has(channel)) throw Object.assign(new Error('A supported campaign channel is required'), { statusCode: 400 });
  if (!String(input.name || '').trim()) throw Object.assign(new Error('Campaign name is required'), { statusCode: 400 });
  const result = await sharedPool.query(`
    INSERT INTO crm_campaigns_unified
      (tenant_id, channel, platform, name, objective, lifecycle_status, audience_ref, template_ref, budget_amount, starts_at, ends_at, metadata, created_by)
    VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7, $8, $9, $10, $11::jsonb, $12)
    RETURNING *
  `, [id, channel, input.platform || 'crm', String(input.name).trim(), input.objective || 'patient_engagement', input.audienceRef || null, input.templateRef || null, input.budgetAmount == null ? null : Number(input.budgetAmount), input.startsAt || null, input.endsAt || null, JSON.stringify(input.metadata || {}), actorUserId || null]);
  return result.rows[0];
}

export async function updateCommunicationHubCampaignStatus(tenant, campaignId, status, actorUserId) {
  const id = tenantId(tenant);
  if (!CAMPAIGN_STATUSES.has(status)) throw Object.assign(new Error('Unsupported campaign status'), { statusCode: 400 });
  const result = await sharedPool.query(`
    UPDATE crm_campaigns_unified
    SET lifecycle_status = $1, updated_at = NOW(), last_error = CASE WHEN $1 = 'active' THEN NULL ELSE last_error END
    WHERE tenant_id = $2 AND id = $3 AND deleted_at IS NULL
    RETURNING *
  `, [status, id, positiveInt(campaignId)]);
  if (!result.rows[0]) throw Object.assign(new Error('Campaign not found'), { statusCode: 404 });
  return result.rows[0];
}

export async function listCommunicationHubTemplates(tenant, { channel, status } = {}) {
  const id = tenantId(tenant);
  const values = [id];
  const filters = ['tenant_id = $1'];
  if (channel && CHANNELS.has(String(channel).toLowerCase())) { values.push(String(channel).toLowerCase()); filters.push(`channel = $${values.length}`); }
  if (status && TEMPLATE_STATUSES.has(String(status))) { values.push(String(status)); filters.push(`status = $${values.length}`); }
  return (await sharedPool.query(`SELECT * FROM crm_communication_templates WHERE ${filters.join(' AND ')} ORDER BY updated_at DESC`, values)).rows;
}

export async function createCommunicationHubTemplate(input, actorUserId) {
  const id = tenantId(input.tenantId);
  const channel = String(input.channel || '').toLowerCase();
  if (!CHANNELS.has(channel)) throw Object.assign(new Error('A supported template channel is required'), { statusCode: 400 });
  if (!String(input.name || '').trim()) throw Object.assign(new Error('Template name is required'), { statusCode: 400 });
  const result = await sharedPool.query(`
    INSERT INTO crm_communication_templates (tenant_id, name, channel, category, subject, body, variables, status, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'draft', $8)
    RETURNING *
  `, [id, String(input.name).trim(), channel, input.category || 'general', input.subject || null, input.body || '', JSON.stringify(input.variables || []), actorUserId || null]);
  return result.rows[0];
}

export async function recordCommunicationIntegrationHealth(input, actorUserId) {
  const id = tenantId(input.tenantId);
  const integrationId = positiveInt(input.integrationId);
  if (!integrationId) throw Object.assign(new Error('integrationId is required'), { statusCode: 400 });
  const result = await sharedPool.query(`
    UPDATE crm_marketing_integrations
    SET status = $1, health_score = $2, health_message = $3, last_health_check_at = NOW(), last_sync_at = COALESCE($4::timestamptz, last_sync_at), last_sync_status = $1, updated_at = NOW()
    WHERE tenant_id = $5 AND id = $6
    RETURNING *
  `, [input.status || 'connected', input.healthScore == null ? null : Math.max(0, Math.min(100, Number(input.healthScore))), input.healthMessage || null, input.lastSyncAt || null, id, integrationId]);
  if (!result.rows[0]) throw Object.assign(new Error('Integration not found'), { statusCode: 404 });
  return result.rows[0];
}

export async function acknowledgeCommunicationHubAlert(tenant, alertId, actorUserId) {
  const id = tenantId(tenant);
  const result = await sharedPool.query(`
    UPDATE crm_communication_hub_alerts
    SET status = 'acknowledged', acknowledged_by = $1, acknowledged_at = NOW(), updated_at = NOW()
    WHERE tenant_id = $2 AND id = $3 AND status = 'open'
    RETURNING *
  `, [actorUserId || null, id, positiveInt(alertId)]);
  if (!result.rows[0]) throw Object.assign(new Error('Open alert not found'), { statusCode: 404 });
  return result.rows[0];
}

export default {
  getCommunicationHubDashboard,
  listCommunicationHubCampaigns,
  createCommunicationHubCampaign,
  updateCommunicationHubCampaignStatus,
  listCommunicationHubTemplates,
  createCommunicationHubTemplate,
  recordCommunicationIntegrationHealth,
  acknowledgeCommunicationHubAlert,
};
