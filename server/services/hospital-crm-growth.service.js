import sharedPool from '../db/pgPool.js';
import { createLead } from './hospital-crm-foundation.service.js';
import { recordTouchpoint } from './hospital-crm-worldclass.service.js';

function tenantId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw Object.assign(new Error('A valid tenantId is required'), { statusCode: 400 });
  return id;
}

function intOrNull(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function json(value, fallback = {}) {
  if (value == null) return fallback;
  return typeof value === 'object' ? value : JSON.parse(value);
}

function clampScore(value) {
  return Math.min(Math.max(Number(value) || 0, 0), 100);
}

function matchesCondition(lead, conditions = {}, eventName, eventMetadata = {}) {
  if (conditions.event_name && conditions.event_name !== eventName) return false;
  return Object.entries(conditions).every(([key, expected]) => {
    if (key === 'event_name') return true;
    const actual = key.startsWith('metadata.')
      ? eventMetadata[key.slice('metadata.'.length)]
      : key.startsWith('lead.')
        ? lead[key.slice('lead.'.length)]
        : lead[key];
    if (Array.isArray(expected)) return expected.map(String).includes(String(actual));
    if (expected && typeof expected === 'object') {
      if (expected.min != null && Number(actual) < Number(expected.min)) return false;
      if (expected.max != null && Number(actual) > Number(expected.max)) return false;
      if (expected.contains != null && !String(actual || '').toLowerCase().includes(String(expected.contains).toLowerCase())) return false;
      return true;
    }
    return String(actual ?? '').toLowerCase() === String(expected ?? '').toLowerCase();
  });
}

async function audit(tenant, entityType, entityId, eventType, actorUserId, value) {
  await sharedPool.query(
    `INSERT INTO crm_audit_log (tenant_id, entity_type, entity_id, event_type, actor_user_id, new_value)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [tenant, entityType, entityId || null, eventType, actorUserId || null, JSON.stringify(value || {})]
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

export async function listScoreRules(tenant, { active } = {}) {
  const id = tenantId(tenant);
  const result = await sharedPool.query(
    `SELECT * FROM crm_lead_score_rules
      WHERE tenant_id = $1 AND ($2::boolean IS NULL OR is_active = $2)
      ORDER BY priority, id`,
    [id, active == null ? null : String(active) === 'true']
  );
  return result.rows;
}

export async function createScoreRule(input, actorUserId) {
  const tenant = tenantId(input.tenantId);
  const result = await sharedPool.query(
    `INSERT INTO crm_lead_score_rules
      (tenant_id, name, rule_type, event_name, conditions, points, priority, is_active, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $9)
     RETURNING *`,
    [tenant, input.name, input.ruleType || 'event', input.eventName || null, JSON.stringify(input.conditions || {}), Number(input.points) || 0, Number(input.priority) || 100, input.isActive !== false, actorUserId || null]
  );
  await audit(tenant, 'lead_score_rule', result.rows[0].id, 'created', actorUserId, result.rows[0]);
  return result.rows[0];
}

export async function scoreLead(input, actorUserId) {
  const tenant = tenantId(input.tenantId);
  const leadId = intOrNull(input.leadId);
  if (!leadId) throw Object.assign(new Error('leadId is required'), { statusCode: 400 });
  const eventName = input.eventName || 'profile_refresh';
  const metadata = input.metadata || {};
  return transaction(async (client) => {
    const leadResult = await client.query(
      `SELECT * FROM crm_leads_v2 WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
      [tenant, leadId]
    );
    if (!leadResult.rows[0]) throw Object.assign(new Error('Lead not found'), { statusCode: 404 });
    const lead = { ...leadResult.rows[0], metadata: json(leadResult.rows[0].metadata) };
    const rules = await client.query(
      `SELECT * FROM crm_lead_score_rules WHERE tenant_id = $1 AND is_active = TRUE ORDER BY priority, id`,
      [tenant]
    );
    if (input.recalculate !== false) await client.query(`DELETE FROM crm_lead_score_events WHERE tenant_id = $1 AND lead_id = $2`, [tenant, leadId]);
    let score = input.recalculate === false ? clampScore(lead.score) : 0;
    const applied = [];
    for (const rule of rules.rows) {
      const isEventRule = rule.rule_type === 'event';
      const eventMatches = !isEventRule || !rule.event_name || rule.event_name === eventName;
      if (!eventMatches || !matchesCondition(lead, json(rule.conditions), eventName, metadata)) continue;
      const before = score;
      score = clampScore(score + Number(rule.points || 0));
      const event = await client.query(
        `INSERT INTO crm_lead_score_events
          (tenant_id, lead_id, rule_id, event_name, points, score_before, score_after, source_ref, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb) RETURNING *`,
        [tenant, leadId, rule.id, eventName, Number(rule.points || 0), before, score, input.sourceRef || null, JSON.stringify(metadata)]
      );
      applied.push(event.rows[0]);
    }
    await client.query(`UPDATE crm_leads_v2 SET score = $1, priority = CASE WHEN $1 >= 80 THEN 'urgent' WHEN $1 >= 50 THEN 'high' ELSE priority END, updated_at = NOW() WHERE tenant_id = $2 AND id = $3`, [score, tenant, leadId]);
    await audit(tenant, 'lead', leadId, 'score_updated', actorUserId, { score, eventName, appliedRules: applied.length });
    return { leadId, score, tier: score >= 80 ? 'hot' : score >= 50 ? 'warm' : 'cold', applied };
  });
}

export async function getScoreHistory(tenant, leadId, limit = 100) {
  const id = tenantId(tenant);
  const result = await sharedPool.query(
    `SELECT e.*, r.name AS rule_name FROM crm_lead_score_events e
      LEFT JOIN crm_lead_score_rules r ON r.id = e.rule_id AND r.tenant_id = e.tenant_id
      WHERE e.tenant_id = $1 AND e.lead_id = $2
      ORDER BY e.created_at DESC LIMIT $3`,
    [id, intOrNull(leadId), Math.min(Math.max(Number(limit) || 100, 1), 500)]
  );
  return result.rows;
}

export async function createJourney(input, actorUserId) {
  const tenant = tenantId(input.tenantId);
  return transaction(async (client) => {
    const journeyResult = await client.query(
      `INSERT INTO crm_journeys
        (tenant_id, name, description, journey_type, entry_conditions, exit_conditions, status, goal_stage, frequency_cap, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9::jsonb, $10, $10) RETURNING *`,
      [tenant, input.name, input.description || null, input.journeyType || 'nurture', JSON.stringify(input.entryConditions || {}), JSON.stringify(input.exitConditions || {}), input.status || 'draft', input.goalStage || null, JSON.stringify(input.frequencyCap || {}), actorUserId || null]
    );
    const journey = journeyResult.rows[0];
    const steps = [];
    for (const [index, step] of (input.steps || []).entries()) {
      const result = await client.query(
        `INSERT INTO crm_journey_steps
          (tenant_id, journey_id, step_order, step_type, delay_minutes, channel, template_id, title, content, config)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb) RETURNING *`,
        [tenant, journey.id, Number(step.stepOrder) || index + 1, step.stepType || 'message', Number(step.delayMinutes) || 0, step.channel || null, intOrNull(step.templateId), step.title || null, step.content || null, JSON.stringify(step.config || {})]
      );
      steps.push(result.rows[0]);
    }
    await audit(tenant, 'journey', journey.id, 'created', actorUserId, { journey, steps: steps.length });
    return { ...journey, steps };
  });
}

export async function listJourneys(tenant) {
  const id = tenantId(tenant);
  const result = await sharedPool.query(
    `SELECT j.*, COUNT(DISTINCT s.id)::int AS step_count, COUNT(DISTINCT e.id)::int AS enrollment_count,
            COUNT(DISTINCT e.id) FILTER (WHERE e.status = 'active')::int AS active_enrollment_count
       FROM crm_journeys j
       LEFT JOIN crm_journey_steps s ON s.journey_id = j.id AND s.tenant_id = j.tenant_id
       LEFT JOIN crm_journey_enrollments e ON e.journey_id = j.id AND e.tenant_id = j.tenant_id
      WHERE j.tenant_id = $1
      GROUP BY j.id ORDER BY j.updated_at DESC`,
    [id]
  );
  return result.rows;
}

export async function enrollLead(input, actorUserId) {
  const tenant = tenantId(input.tenantId);
  const leadId = intOrNull(input.leadId);
  const journeyId = intOrNull(input.journeyId);
  if (!leadId || !journeyId) throw Object.assign(new Error('journeyId and leadId are required'), { statusCode: 400 });
  return transaction(async (client) => {
    const step = await client.query(`SELECT * FROM crm_journey_steps WHERE tenant_id = $1 AND journey_id = $2 ORDER BY step_order LIMIT 1`, [tenant, journeyId]);
    const nextRunAt = new Date(Date.now() + Number(step.rows[0]?.delay_minutes || 0) * 60000);
    const enrollment = await client.query(
      `INSERT INTO crm_journey_enrollments (tenant_id, journey_id, lead_id, identity_id, status, current_step_order, next_run_at, metadata)
       SELECT $1, $2, l.id, l.identity_id, 'active', $3, $4, $5::jsonb FROM crm_leads_v2 l WHERE l.tenant_id = $1 AND l.id = $6
       ON CONFLICT (tenant_id, journey_id, lead_id) DO UPDATE SET status = 'active', current_step_order = EXCLUDED.current_step_order, next_run_at = EXCLUDED.next_run_at, exit_reason = NULL
       RETURNING *`,
      [tenant, journeyId, Number(step.rows[0]?.step_order || 1), nextRunAt, JSON.stringify(input.metadata || {}), leadId]
    );
    if (!enrollment.rows[0]) throw Object.assign(new Error('Lead not found'), { statusCode: 404 });
    if (step.rows[0]) {
      await client.query(
        `INSERT INTO crm_journey_events (tenant_id, enrollment_id, step_id, event_type, scheduled_at, metadata)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [tenant, enrollment.rows[0].id, step.rows[0].id, step.rows[0].step_type, nextRunAt, JSON.stringify({ channel: step.rows[0].channel || null })]
      );
    }
    await audit(tenant, 'journey_enrollment', enrollment.rows[0].id, 'enrolled', actorUserId, { journeyId, leadId });
    return enrollment.rows[0];
  });
}

export async function scanRecoveryQueue(tenant, actorUserId) {
  const id = tenantId(tenant);
  const inserted = [];
  const statements = [
    [`INSERT INTO crm_growth_recovery_cases (tenant_id, lead_id, identity_id, case_type, priority, due_at, owner_user_id, metadata)
      SELECT l.tenant_id, l.id, l.identity_id, 'speed_to_lead', CASE WHEN l.score >= 80 THEN 'urgent' ELSE 'high' END, l.created_at + INTERVAL '15 minutes', l.owner_user_id, jsonb_build_object('reason', 'no_first_response')
        FROM crm_leads_v2 l WHERE l.tenant_id = $1 AND l.status = 'open' AND l.first_response_at IS NULL AND l.created_at < NOW() - INTERVAL '15 minutes'
          AND NOT EXISTS (SELECT 1 FROM crm_growth_recovery_cases c WHERE c.tenant_id = l.tenant_id AND c.lead_id = l.id AND c.case_type = 'speed_to_lead' AND c.status IN ('open', 'in_progress')) RETURNING *`, 'speed_to_lead'],
    [`INSERT INTO crm_growth_recovery_cases (tenant_id, lead_id, identity_id, case_type, priority, due_at, owner_user_id, metadata)
      SELECT a.tenant_id, a.lead_id, a.identity_id, 'no_show', 'high', COALESCE(a.scheduled_at, NOW()), l.owner_user_id, jsonb_build_object('appointment_status', a.appointment_status)
        FROM crm_appointment_links a JOIN crm_leads_v2 l ON l.id = a.lead_id AND l.tenant_id = a.tenant_id
       WHERE a.tenant_id = $1 AND (a.appointment_status = 'no_show' OR a.no_show_at IS NOT NULL)
         AND NOT EXISTS (SELECT 1 FROM crm_growth_recovery_cases c WHERE c.tenant_id = a.tenant_id AND c.lead_id = a.lead_id AND c.case_type = 'no_show' AND c.status IN ('open', 'in_progress')) RETURNING *`, 'no_show'],
    [`INSERT INTO crm_growth_recovery_cases (tenant_id, lead_id, identity_id, case_type, priority, due_at, owner_user_id, metadata)
      SELECT l.tenant_id, l.id, l.identity_id, 'dormant', 'medium', NOW(), l.owner_user_id, jsonb_build_object('lifecycle_stage', l.lifecycle_stage)
        FROM crm_leads_v2 l WHERE l.tenant_id = $1 AND l.lifecycle_stage IN ('dormant', 'nurture') AND l.updated_at < NOW() - INTERVAL '30 days'
          AND NOT EXISTS (SELECT 1 FROM crm_growth_recovery_cases c WHERE c.tenant_id = l.tenant_id AND c.lead_id = l.id AND c.case_type = 'dormant' AND c.status IN ('open', 'in_progress')) RETURNING *`, 'dormant'],
    [`INSERT INTO crm_growth_recovery_cases (tenant_id, lead_id, identity_id, case_type, priority, due_at, owner_user_id, metadata)
      SELECT e.tenant_id, e.lead_id, l.identity_id, 'abandoned_form', 'medium', e.event_at + INTERVAL '30 minutes', l.owner_user_id, e.metadata
        FROM crm_landing_page_events e JOIN crm_leads_v2 l ON l.id = e.lead_id AND l.tenant_id = e.tenant_id
       WHERE e.tenant_id = $1 AND e.event_type = 'form_abandon' AND e.lead_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM crm_growth_recovery_cases c WHERE c.tenant_id = e.tenant_id AND c.lead_id = e.lead_id AND c.case_type = 'abandoned_form' AND c.status IN ('open', 'in_progress')) RETURNING *`, 'abandoned_form'],
  ];
  for (const [sql, type] of statements) {
    const result = await sharedPool.query(sql, [id]);
    inserted.push(...result.rows.map((row) => ({ ...row, detected_case_type: type })));
  }
  if (inserted.length) await audit(id, 'recovery_queue', null, 'scanned', actorUserId, { created: inserted.length });
  return inserted;
}

export async function listRecoveryQueue(tenant, query = {}) {
  const id = tenantId(tenant);
  await scanRecoveryQueue(id);
  const result = await sharedPool.query(
    `SELECT c.*, l.lifecycle_stage, l.score, l.service_line, p.display_name,
            COALESCE(k.raw_value, '') AS phone
       FROM crm_growth_recovery_cases c
       LEFT JOIN crm_leads_v2 l ON l.id = c.lead_id AND l.tenant_id = c.tenant_id
       LEFT JOIN crm_person_identities p ON p.id = c.identity_id AND p.tenant_id = c.tenant_id
       LEFT JOIN LATERAL (SELECT raw_value FROM crm_identity_keys WHERE tenant_id = c.tenant_id AND person_id = c.identity_id AND key_type = 'phone' ORDER BY is_primary DESC, id LIMIT 1) k ON TRUE
      WHERE c.tenant_id = $1 AND ($2 = 'all' OR c.status = $2) AND ($3 = 'all' OR c.case_type = $3)
      ORDER BY CASE c.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, c.due_at NULLS LAST
      LIMIT $4`,
    [id, query.status || 'open', query.caseType || 'all', Math.min(Math.max(Number(query.limit) || 100, 1), 500)]
  );
  return result.rows;
}

export async function resolveRecoveryCase(input, actorUserId) {
  const tenant = tenantId(input.tenantId);
  const result = await sharedPool.query(
    `UPDATE crm_growth_recovery_cases SET status = $3, recovered_at = CASE WHEN $3 = 'recovered' THEN NOW() ELSE recovered_at END, updated_at = NOW(), metadata = COALESCE(metadata, '{}'::jsonb) || $4::jsonb
      WHERE tenant_id = $1 AND id = $2 RETURNING *`,
    [tenant, intOrNull(input.caseId), input.status || 'in_progress', JSON.stringify(input.metadata || {})]
  );
  if (!result.rows[0]) throw Object.assign(new Error('Recovery case not found'), { statusCode: 404 });
  await audit(tenant, 'recovery_case', result.rows[0].id, 'status_changed', actorUserId, result.rows[0]);
  return result.rows[0];
}

export async function createLandingPage(input, actorUserId) {
  const tenant = tenantId(input.tenantId);
  const result = await sharedPool.query(
    `INSERT INTO crm_landing_pages (tenant_id, campaign_id, page_name, slug, service_line_id, status, form_schema, tracking_config, published_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, CASE WHEN $6 = 'published' THEN NOW() ELSE NULL END, $9) RETURNING *`,
    [tenant, intOrNull(input.campaignId), input.pageName, input.slug, intOrNull(input.serviceLineId), input.status || 'draft', JSON.stringify(input.formSchema || {}), JSON.stringify(input.trackingConfig || {}), actorUserId || null]
  );
  await audit(tenant, 'landing_page', result.rows[0].id, 'created', actorUserId, result.rows[0]);
  return result.rows[0];
}

export async function listLandingPages(tenant) {
  const id = tenantId(tenant);
  const result = await sharedPool.query(`SELECT p.*, COUNT(e.id)::int AS event_count, COUNT(e.id) FILTER (WHERE e.event_type = 'form_submit')::int AS submissions FROM crm_landing_pages p LEFT JOIN crm_landing_page_events e ON e.landing_page_id = p.id AND e.tenant_id = p.tenant_id WHERE p.tenant_id = $1 GROUP BY p.id ORDER BY p.updated_at DESC`, [id]);
  return result.rows;
}

export async function recordLandingPageEvent(input, actorUserId) {
  const tenant = tenantId(input.tenantId);
  const result = await sharedPool.query(
    `INSERT INTO crm_landing_page_events (tenant_id, landing_page_id, lead_id, session_id, event_type, event_at, metadata)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, NOW()), $7::jsonb) RETURNING *`,
    [tenant, intOrNull(input.landingPageId), intOrNull(input.leadId), input.sessionId || null, input.eventType, input.eventAt || null, JSON.stringify(input.metadata || {})]
  );
  if (input.leadId && input.eventType === 'form_submit') await scoreLead({ tenantId: tenant, leadId: input.leadId, eventName: 'form_submit', metadata: input.metadata || {}, recalculate: false }, actorUserId);
  return result.rows[0];
}

export async function intakeLead(input, actorUserId) {
  const tenant = tenantId(input.tenantId);
  const lead = await createLead({ ...input, tenantId: tenant }, actorUserId);
  if (input.source || input.utmSource || input.utmCampaign || input.landingPageUrl) {
    await recordTouchpoint({ tenantId: tenant, leadId: lead.id, identityId: lead.identity_id, campaignId: input.campaignId, touchpointType: 'lead_capture', channel: input.channel || 'web', source: input.source, medium: input.medium, eventName: 'lead_created', utmSource: input.utmSource, utmMedium: input.utmMedium, utmCampaign: input.utmCampaign, utmTerm: input.utmTerm, utmContent: input.utmContent, landingPageUrl: input.landingPageUrl, externalEventId: input.externalEventId, metadata: input.metadata || {} }, actorUserId);
  }
  const score = await scoreLead({ tenantId: tenant, leadId: lead.id, eventName: 'lead_created', metadata: input.metadata || {}, recalculate: true }, actorUserId);
  await sharedPool.query(`INSERT INTO crm_growth_recovery_cases (tenant_id, lead_id, identity_id, case_type, priority, due_at, owner_user_id, metadata) VALUES ($1, $2, $3, 'speed_to_lead', $4, NOW() + INTERVAL '15 minutes', $5, $6::jsonb) ON CONFLICT DO NOTHING`, [tenant, lead.id, lead.identity_id, score.score >= 80 ? 'urgent' : 'high', lead.owner_user_id || actorUserId || null, JSON.stringify({ reason: 'new_lead' })]);
  return { lead, score };
}

export async function getGrowthDashboard(tenant, { from, to } = {}) {
  const id = tenantId(tenant);
  const start = from || '1970-01-01';
  const end = to || '2999-12-31';
  const [summary, campaigns, recovery, landing, tiers, bySource] = await Promise.all([
    sharedPool.query(`SELECT COUNT(*)::int AS leads, COUNT(*) FILTER (WHERE lifecycle_stage = 'qualified')::int AS qualified, COUNT(*) FILTER (WHERE lifecycle_stage = 'appointment_booked')::int AS appointments, COUNT(*) FILTER (WHERE lifecycle_stage IN ('visited', 'consulted'))::int AS visits, COUNT(*) FILTER (WHERE lifecycle_stage IN ('procedure_advised', 'admission_advised', 'won'))::int AS admissions, COALESCE(SUM(actual_revenue), 0)::numeric AS revenue, AVG(score)::numeric(10,2) AS average_score FROM crm_leads_v2 WHERE tenant_id = $1 AND created_at >= $2::timestamptz AND created_at < $3::timestamptz`, [id, start, end]),
    sharedPool.query(`SELECT c.id, c.name, c.source, c.medium, COALESCE((SELECT SUM(amount) FROM crm_campaign_costs cc WHERE cc.tenant_id = c.tenant_id AND cc.campaign_id = c.id AND cc.cost_date >= $2::date AND cc.cost_date < $3::date), 0)::numeric AS spend, (SELECT COUNT(*) FROM crm_leads_v2 l WHERE l.tenant_id = c.tenant_id AND l.campaign_id = c.id AND l.created_at >= $2::timestamptz AND l.created_at < $3::timestamptz)::int AS leads, (SELECT COUNT(*) FROM crm_appointment_links a JOIN crm_leads_v2 l ON l.id = a.lead_id AND l.tenant_id = a.tenant_id WHERE a.tenant_id = c.tenant_id AND l.campaign_id = c.id AND a.scheduled_at >= $2::timestamptz AND a.scheduled_at < $3::timestamptz)::int AS appointments, COALESCE((SELECT SUM(r.net_amount) FROM crm_revenue_events r JOIN crm_leads_v2 l ON l.id = r.lead_id AND l.tenant_id = r.tenant_id WHERE r.tenant_id = c.tenant_id AND l.campaign_id = c.id AND r.revenue_date >= $2::date AND r.revenue_date < $3::date), 0)::numeric AS revenue FROM crm_campaigns_unified c WHERE c.tenant_id = $1 AND c.deleted_at IS NULL ORDER BY revenue DESC, leads DESC LIMIT 100`, [id, start, end]),
    sharedPool.query(`SELECT case_type, status, COUNT(*)::int AS count FROM crm_growth_recovery_cases WHERE tenant_id = $1 GROUP BY case_type, status ORDER BY case_type, status`, [id]),
    sharedPool.query(`SELECT event_type, COUNT(*)::int AS count FROM crm_landing_page_events WHERE tenant_id = $1 AND event_at >= $2::timestamptz AND event_at < $3::timestamptz GROUP BY event_type ORDER BY event_type`, [id, start, end]),
    sharedPool.query(`SELECT CASE WHEN score >= 80 THEN 'hot' WHEN score >= 50 THEN 'warm' ELSE 'cold' END AS tier, COUNT(*)::int AS count FROM crm_leads_v2 WHERE tenant_id = $1 AND created_at >= $2::timestamptz AND created_at < $3::timestamptz GROUP BY tier ORDER BY tier`, [id, start, end]),
    // Lead generation by channel (social/referral/partner/paid/organic/...), for the business-head's marketing-ROI view.
    sharedPool.query(`SELECT COALESCE(st.channel, 'unknown') AS channel, COUNT(*)::int AS leads, COUNT(*) FILTER (WHERE l.converted_at IS NOT NULL OR l.lifecycle_stage IN ('won', 'billing_completed'))::int AS converted_leads, COALESCE(SUM(l.actual_revenue), 0)::numeric AS revenue FROM crm_leads_v2 l LEFT JOIN crm_source_taxonomy st ON st.id = l.source_taxonomy_id WHERE l.tenant_id = $1 AND l.created_at >= $2::timestamptz AND l.created_at < $3::timestamptz GROUP BY channel ORDER BY leads DESC`, [id, start, end]),
  ]);
  const row = summary.rows[0] || {};
  const totalSpend = campaigns.rows.reduce((sum, item) => sum + Number(item.spend || 0), 0);
  const revenue = Number(row.revenue || 0);
  return {
    summary: { ...row, spend: totalSpend, roas: totalSpend ? revenue / totalSpend : null, cpl: Number(row.leads) ? totalSpend / Number(row.leads) : null, appointment_rate: Number(row.leads) ? Number(row.appointments || 0) / Number(row.leads) : null },
    campaigns: campaigns.rows.map((item) => ({ ...item, cpl: Number(item.leads) ? Number(item.spend) / Number(item.leads) : null, roas: Number(item.spend) ? Number(item.revenue) / Number(item.spend) : null })),
    recovery: recovery.rows,
    landingFunnel: landing.rows,
    scoreTiers: tiers.rows,
    bySource: bySource.rows.map((item) => ({ ...item, conversion_rate: Number(item.leads) ? (Number(item.converted_leads) / Number(item.leads)) * 100 : null })),
  };
}
