import sharedPool from '../db/pgPool.js';
import { getExecutiveDashboards } from './hospital-crm-worldclass.service.js';

function intOrNull(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function tenantId(value) {
  const id = intOrNull(value);
  if (!id) throw Object.assign(new Error('A valid tenantId is required'), { statusCode: 400 });
  return id;
}

async function writeAudit({ tenantId: tenant, entityType, entityId, eventType, actorUserId, newValue }) {
  await sharedPool.query(
    `INSERT INTO crm_audit_log (tenant_id, entity_type, entity_id, event_type, actor_user_id, new_value)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [tenant, entityType, entityId || null, eventType, actorUserId || null, JSON.stringify(newValue || {})]
  );
}

async function transaction(callback) {
  const client = await sharedPool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getMarketingHeadDashboard(tenant, query) {
  const tenantValue = tenantId(tenant);
  const start = query?.from || '1970-01-01';
  const end = query?.to || '2999-12-31';
  const result = await sharedPool.query(
    `SELECT c.id, c.name, c.channel, c.lifecycle_status,
            COALESCE((SELECT SUM(amount) FROM crm_campaign_costs cc WHERE cc.tenant_id = c.tenant_id AND cc.campaign_id = c.id AND cc.cost_date >= $2::date AND cc.cost_date < $3::date), 0)::numeric AS spend,
            (SELECT COUNT(*) FROM crm_leads_v2 l WHERE l.tenant_id = c.tenant_id AND l.campaign_id = c.id AND l.created_at >= $2::timestamptz AND l.created_at < $3::timestamptz)::int AS leads,
            (SELECT COUNT(*) FROM crm_appointment_links a JOIN crm_leads_v2 l ON l.id = a.lead_id AND l.tenant_id = a.tenant_id WHERE a.tenant_id = c.tenant_id AND l.campaign_id = c.id AND a.scheduled_at >= $2::timestamptz AND a.scheduled_at < $3::timestamptz)::int AS appointments,
            COALESCE((SELECT SUM(r.net_amount) FROM crm_revenue_events r JOIN crm_leads_v2 l ON l.id = r.lead_id AND l.tenant_id = r.tenant_id WHERE r.tenant_id = c.tenant_id AND l.campaign_id = c.id AND r.revenue_date >= $2::date AND r.revenue_date < $3::date), 0)::numeric AS revenue
       FROM crm_campaigns_unified c
      WHERE c.tenant_id = $1 AND c.deleted_at IS NULL
      ORDER BY revenue DESC, leads DESC`,
    [tenantValue, start, end]
  );
  return {
    executive: await getExecutiveDashboards(tenantValue, query),
    campaigns: result.rows.map((row) => ({
      ...row,
      cpl: Number(row.leads) ? Number(row.spend) / Number(row.leads) : null,
      roas: Number(row.spend) ? Number(row.revenue) / Number(row.spend) : null,
    })),
  };
}

export async function createAssignmentRule(input, actorUserId) {
  const tenant = tenantId(input.tenantId);
  const result = await sharedPool.query(
    `INSERT INTO crm_assignment_rules (tenant_id, rule_name, priority, conditions, assignment_strategy, target_user_ids, target_team_ids, fallback_user_id, sla_rule_id, created_by, updated_by)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7::jsonb, $8, $9, $10, $10) RETURNING *`,
    [tenant, input.ruleName, Number(input.priority) || 100, JSON.stringify(input.conditions || {}), input.assignmentStrategy || 'round_robin', JSON.stringify(input.targetUserIds || []), JSON.stringify(input.targetTeamIds || []), intOrNull(input.fallbackUserId), intOrNull(input.slaRuleId), actorUserId || null]
  );
  await writeAudit({ tenantId: tenant, entityType: 'assignment_rule', entityId: result.rows[0].id, eventType: 'created', actorUserId, newValue: result.rows[0] });
  return result.rows[0];
}

export async function createSlaRule(input, actorUserId) {
  const tenant = tenantId(input.tenantId);
  const result = await sharedPool.query(
    `INSERT INTO crm_sla_rules (tenant_id, name, applies_to, conditions, first_response_minutes, followup_minutes, resolution_minutes, escalation_policy, business_hours_id)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8::jsonb, $9) RETURNING *`,
    [tenant, input.name, input.appliesTo || 'lead', JSON.stringify(input.conditions || {}), Number(input.firstResponseMinutes) || 60, input.followupMinutes ? Number(input.followupMinutes) : null, input.resolutionMinutes ? Number(input.resolutionMinutes) : null, JSON.stringify(input.escalationPolicy || {}), intOrNull(input.businessHoursId)]
  );
  await writeAudit({ tenantId: tenant, entityType: 'sla_rule', entityId: result.rows[0].id, eventType: 'created', actorUserId, newValue: result.rows[0] });
  return result.rows[0];
}

export async function createTask(input, actorUserId) {
  const tenant = tenantId(input.tenantId);
  const result = await sharedPool.query(
    `INSERT INTO crm_tasks (tenant_id, lead_id, identity_id, task_type, title, description, priority, assigned_to_user_id, due_at, metadata, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11) RETURNING *`,
    [tenant, intOrNull(input.leadId), intOrNull(input.identityId), input.taskType || 'follow_up', input.title, input.description || null, input.priority || 'medium', intOrNull(input.assignedToUserId), input.dueAt || null, JSON.stringify(input.metadata || {}), actorUserId || null]
  );
  return result.rows[0];
}

export async function createBudgetOrCost(type, input, actorUserId) {
  const tenant = tenantId(input.tenantId);
  if (type === 'budget') {
    const result = await sharedPool.query(
      `INSERT INTO crm_marketing_budgets (tenant_id, period_type, period_start, period_end, hospital_id, branch_id, service_line_id, channel, campaign_id, budget_amount, approved_amount, owner_user_id, approval_status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
      [tenant, input.periodType || 'monthly', input.periodStart, input.periodEnd, intOrNull(input.hospitalId), intOrNull(input.branchId), intOrNull(input.serviceLineId), input.channel || null, intOrNull(input.campaignId), Number(input.budgetAmount) || 0, input.approvedAmount == null ? null : Number(input.approvedAmount), actorUserId || null, input.approvalStatus || 'draft', actorUserId || null]
    );
    return result.rows[0];
  }
  const result = await sharedPool.query(
    `INSERT INTO crm_campaign_costs (tenant_id, campaign_id, source_id, cost_type, vendor_id, cost_date, amount, currency, invoice_ref, external_spend_id, is_imported, metadata, created_by)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6::date, CURRENT_DATE), $7, $8, $9, $10, $11, $12::jsonb, $13) RETURNING *`,
    [tenant, intOrNull(input.campaignId), intOrNull(input.sourceId), input.costType || 'ad_spend', intOrNull(input.vendorId), input.costDate || null, Number(input.amount) || 0, input.currency || 'INR', input.invoiceRef || null, input.externalSpendId || null, Boolean(input.isImported), JSON.stringify(input.metadata || {}), actorUserId || null]
  );
  return result.rows[0];
}
