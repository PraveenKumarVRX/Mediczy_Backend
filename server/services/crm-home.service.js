/** Home: the one role-based dashboard. Every figure comes from this file, computed one way, so the same
 * KPI can no longer differ between screens. The older dashboards remain as drill-down reports.
 *
 *   everyone            My work: my unread conversations, my leads awaiting a first reply, my missed calls
 *                       to return, my overdue tasks
 *   admin / business    Organisation KPIs, team table, setup checklist
 *   marketing roles     Organisation KPIs (acquisition, campaigns), no team table
 *   front-line roles    My work and the headline numbers only */
import sharedPool from '../db/pgPool.js';
import { hasCRMCapability } from '../config/crm-roles.config.js';
import { inboxSummary } from './crm-unified-inbox.service.js';
import { setupStatus } from './crm-setup-status.service.js';

const REPORTS = [
  { label: 'Command Center', path: '/crm/hospital/command-center', cap: 'dashboard:command-center' },
  { label: 'Acquisition', path: '/crm/hospital/acquisition', cap: 'dashboard:marketing-head' },
  { label: 'Patient Experience', path: '/crm/hospital/experience', cap: 'dashboard:business-head' },
  { label: 'Team Performance', path: '/crm/hospital/people', cap: 'dashboard:people-performance' },
  { label: 'Governance', path: '/crm/hospital/governance', cap: 'dashboard:business-head' },
  { label: 'Journey Operations', path: '/crm/hospital/operations', cap: 'worldclass:read' },
  { label: 'Engagement Hub', path: '/crm/hospital/engagement', cap: 'worldclass:read' },
  { label: 'Growth', path: '/crm/hospital/growth', cap: 'growth:read' },
  { label: 'Specialty Growth', path: '/crm/hospital/specialties', cap: 'specialty:read' },
  { label: 'Diagnostic Growth', path: '/crm/hospital/diagnostics', cap: 'specialty:read' },
  { label: 'Digital Growth Hub', path: '/crm/hospital/digital', cap: 'specialty:read' },
  { label: 'Communication Hub', path: '/crm/hospital/communication-hub', cap: 'communication:read' },
  { label: 'Reports', path: '/crm/reports' },
  { label: 'AI Insights', path: '/crm/ai-insights' },
];
// Patient journey: crm_leads_v2.lifecycle_stage grouped into the steps a hospital front office tracks.
export const JOURNEY = [
  { key: 'enquiry', label: 'Enquiry', stages: ['new', 'attempting_contact'] },
  { key: 'contacted', label: 'Contacted', stages: ['contacted', 'qualified'] },
  { key: 'booked', label: 'Appointment booked', stages: ['appointment_requested', 'appointment_booked', 'appointment_confirmed'] },
  { key: 'visited', label: 'Visited', stages: ['visited', 'consulted', 'investigation_advised', 'procedure_advised', 'admission_advised'] },
  { key: 'treated', label: 'Treated and billed', stages: ['billing_completed', 'won'] },
];
const OFF_JOURNEY = { lost: ['lost', 'dormant', 'duplicate'], nurture: ['nurture'] };

export const RETIRED_DASHBOARD_PATHS = REPORTS.filter((r) => r.path.startsWith('/crm/hospital/') && r.path !== '/crm/hospital/communication-hub').map((r) => r.path);

export async function homeData(crmUser, { days = 30, owner = 'all' } = {}) {
  const tenantId = Number(crmUser.tenantId), tenantUid = crmUser.tenantUid, me = crmUser.id;
  const role = crmUser.crmRole || 'sales_rep';
  const isAdmin = crmUser.isAdmin || role === 'admin';
  const scope = isAdmin || role === 'business_head' ? 'organisation' : (['marketing_head', 'marketing'].includes(role) ? 'marketing' : 'personal');
  const period = Math.min(Math.max(Number(days) || 30, 1), 3650); // 3650 = "All time" in the period picker
  // Whose figures: front-line roles always see their own; managers can switch between everyone and mine.
  const mineOnly = scope === 'personal' || owner === 'me';
  const ownerId = mineOnly ? Number(me) || -1 : null;

  const { rows: [mine] } = await sharedPool.query(
    `WITH my_leads AS (SELECT lv.id, lv.legacy_lead_id, lv.created_at, lv.first_response_at, lv.metadata FROM crm_leads_v2 lv JOIN crm_leads l ON l.id = lv.legacy_lead_id
                         WHERE lv.tenant_id = $1 AND lv.deleted_at IS NULL AND l.assigned_to = $2)
     SELECT
       (SELECT count(*)::int FROM my_leads ml WHERE ml.first_response_at IS NULL AND ml.created_at > now() - interval '14 days') AS awaiting_first_reply,
       (SELECT count(*)::int FROM my_leads ml WHERE EXISTS (SELECT 1 FROM crm_communication_events e WHERE e.tenant_id = $1 AND e.lead_id = ml.id AND e.direction = 'inbound'
            AND e.created_at > COALESCE((ml.metadata->>'inbox_read_at')::timestamptz, '-infinity'))) AS unread_conversations,
       (SELECT count(*)::int FROM crm_communication_events e JOIN my_leads ml ON ml.id = e.lead_id
         WHERE e.channel = 'call' AND e.direction = 'inbound' AND e.status = 'missed' AND e.created_at > now() - interval '7 days'
           AND NOT EXISTS (SELECT 1 FROM crm_communication_events o WHERE o.lead_id = e.lead_id AND o.direction = 'outbound' AND o.created_at > e.created_at)) AS missed_calls_to_return,
       (SELECT count(*)::int FROM crm_activities a WHERE a.created_by = $2 AND a.tenant_uid = $3 AND a.completed_at IS NULL AND a.scheduled_at IS NOT NULL AND a.scheduled_at < now()) AS overdue_tasks`,
    [tenantId, me, tenantUid]);

  const OWN = `($4::int IS NULL OR owner_user_id = $4)`;
  const { rows: [org] } = await sharedPool.query(
    `SELECT
       (SELECT count(*)::int FROM crm_leads_v2 WHERE tenant_id = $1 AND deleted_at IS NULL AND ${OWN} AND created_at > now() - make_interval(days => $2)) AS new_leads,
       (SELECT count(*)::int FROM crm_leads_v2 WHERE tenant_id = $1 AND deleted_at IS NULL AND ${OWN} AND created_at BETWEEN now() - make_interval(days => $2 * 2) AND now() - make_interval(days => $2)) AS new_leads_prev,
       (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM first_response_at - created_at) / 60))::int
          FROM crm_leads_v2 WHERE tenant_id = $1 AND ${OWN} AND first_response_at IS NOT NULL AND created_at > now() - make_interval(days => $2)) AS median_first_response_min,
       (SELECT count(*)::int FROM crm_leads_v2 WHERE tenant_id = $1 AND deleted_at IS NULL AND ${OWN} AND first_response_at IS NULL AND created_at > now() - interval '14 days') AS awaiting_first_reply,
       (SELECT count(*)::int FROM crm_leads_v2 WHERE tenant_id = $1 AND deleted_at IS NULL AND ${OWN} AND lifecycle_stage IN ('billing_completed','won') AND COALESCE(converted_at, updated_at) > now() - make_interval(days => $2)) AS converted,
       (SELECT COALESCE(sum(actual_revenue), 0)::numeric FROM crm_leads_v2 WHERE tenant_id = $1 AND deleted_at IS NULL AND ${OWN} AND lifecycle_stage IN ('billing_completed','won') AND COALESCE(converted_at, updated_at) > now() - make_interval(days => $2)) AS billed_revenue,
       (SELECT count(*)::int FROM crm_communication_events WHERE tenant_id = $1 AND ${OWN} AND direction = 'outbound' AND channel IN ('whatsapp','sms','email') AND created_at > now() - make_interval(days => $2)) AS messages_sent,
       (SELECT count(*)::int FROM crm_communication_events WHERE tenant_id = $1 AND ${OWN} AND direction = 'outbound' AND status IN ('delivered','read') AND created_at > now() - make_interval(days => $2)) AS messages_delivered,
       (SELECT count(*)::int FROM crm_communication_events WHERE tenant_id = $1 AND ${OWN} AND direction = 'outbound' AND status = 'read' AND created_at > now() - make_interval(days => $2)) AS messages_read,
       (SELECT count(*)::int FROM crm_communication_events WHERE tenant_id = $1 AND ${OWN} AND direction = 'inbound' AND channel IN ('whatsapp','sms','email') AND created_at > now() - make_interval(days => $2)) AS messages_received,
       (SELECT count(*)::int FROM crm_communication_events WHERE tenant_id = $1 AND ${OWN} AND channel = 'call' AND created_at > now() - make_interval(days => $2)) AS calls,
       (SELECT count(*)::int FROM crm_communication_events WHERE tenant_id = $1 AND ${OWN} AND channel = 'call' AND direction = 'inbound' AND status = 'missed' AND created_at > now() - make_interval(days => $2)) AS missed_calls,
       (SELECT count(*)::int FROM crm_campaigns_unified WHERE tenant_id = $1 AND platform = 'engage' AND lifecycle_status = 'active') AS active_campaigns,
       (SELECT count(*)::int FROM crm_deals WHERE tenant_uid = $3 AND ($4::int IS NULL OR assigned_to = $4) AND won_at IS NULL AND lost_at IS NULL) AS open_deals,
       (SELECT COALESCE(sum(value), 0)::numeric FROM crm_deals WHERE tenant_uid = $3 AND ($4::int IS NULL OR assigned_to = $4) AND won_at IS NULL AND lost_at IS NULL) AS open_deal_value,
       (SELECT COALESCE(sum(value), 0)::numeric FROM crm_deals WHERE tenant_uid = $3 AND ($4::int IS NULL OR assigned_to = $4) AND won_at > now() - make_interval(days => $2)) AS won_value`,
    [tenantId, period, tenantUid, ownerId]);

  // Journey of the leads that arrived in the period: where each one is now, and how many reached each step.
  const { rows: stageRows } = await sharedPool.query(
    `SELECT lifecycle_stage AS stage, count(*)::int AS n FROM crm_leads_v2
      WHERE tenant_id = $1 AND deleted_at IS NULL AND ($3::int IS NULL OR owner_user_id = $3) AND created_at > now() - make_interval(days => $2)
      GROUP BY 1`, [tenantId, period, ownerId]);
  const at = (list) => stageRows.filter((r) => list.includes(r.stage)).reduce((sum, r) => sum + r.n, 0);
  const steps = JOURNEY.map((j) => ({ key: j.key, label: j.label, now: at(j.stages) }));
  const total = stageRows.reduce((sum, r) => sum + r.n, 0);
  steps.forEach((step, i) => { step.reached = i === 0 ? total : steps.slice(i).reduce((sum, x) => sum + x.now, 0); });
  const journey = { total, steps, lost: at(OFF_JOURNEY.lost), nurture: at(OFF_JOURNEY.nurture) };

  const { rows: sources } = await sharedPool.query(
    `SELECT COALESCE(NULLIF(l.source, ''), 'unknown') AS source, count(*)::int AS leads
       FROM crm_leads_v2 lv JOIN crm_leads l ON l.id = lv.legacy_lead_id
      WHERE lv.tenant_id = $1 AND lv.deleted_at IS NULL AND ($3::int IS NULL OR lv.owner_user_id = $3) AND lv.created_at > now() - make_interval(days => $2)
      GROUP BY 1 ORDER BY 2 DESC LIMIT 8`, [tenantId, period, ownerId]);

  let team = null;
  if (scope === 'organisation' && !mineOnly) {
    ({ rows: team } = await sharedPool.query(
      `SELECT u.id, NULLIF(trim(concat_ws(' ', u."firstName", u."lastName")), '') AS name, u.metadata->>'crmRole' AS role,
              count(lv.id) FILTER (WHERE l.status NOT IN ('converted','lost'))::int AS open_leads,
              count(lv.id) FILTER (WHERE lv.first_response_at IS NULL AND lv.created_at > now() - interval '14 days')::int AS awaiting_reply,
              round(percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM lv.first_response_at - lv.created_at) / 60) FILTER (WHERE lv.first_response_at IS NOT NULL AND lv.created_at > now() - make_interval(days => $2)))::int AS median_response_min,
              count(lv.id) FILTER (WHERE l.status = 'converted' AND l.converted_at > now() - make_interval(days => $2))::int AS converted
         FROM users u LEFT JOIN crm_leads l ON l.assigned_to = u.id LEFT JOIN crm_leads_v2 lv ON lv.legacy_lead_id = l.id AND lv.tenant_id = $1 AND lv.deleted_at IS NULL
        WHERE u.tenant_id = $1 AND u.status = 'active' GROUP BY u.id ORDER BY open_leads DESC, u.id`, [tenantId, period]));
  }

  const inbox = await inboxSummary(tenantId, tenantUid, me).catch(() => null);
  const setup = isAdmin ? await setupStatus(tenantId, tenantUid).catch(() => null) : null;
  const reports = REPORTS.filter((r) => !r.cap || hasCRMCapability(crmUser, r.cap));
  return { role, scope, owner: mineOnly ? 'me' : 'all', canSwitchOwner: scope !== 'personal', days: period, me: mine, journey,
    org: scope === 'personal' ? { new_leads: org.new_leads, awaiting_first_reply: org.awaiting_first_reply, missed_calls: org.missed_calls, calls: org.calls, converted: org.converted } : org,
    sources: scope === 'personal' ? [] : sources, team, inbox, setup, reports };
}
