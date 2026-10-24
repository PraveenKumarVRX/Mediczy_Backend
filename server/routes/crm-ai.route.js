/**
 * CRM AI Routes — sales intelligence, lead scoring, deal prediction,
 * campaign optimization, revenue forecasting, pipeline health.
 *
 * Mounted at /crm/ai by app.js (behind authCRM middleware).
 */

import express from 'express';
import { crmQuery } from '../services/crm/scoped-query.js';
import { authCRM, requireCRMCapability } from '../middleware/crm.middleware.js';
import { requireFeatureFlag } from '../services/feature-flag.service.js';
import sharedPool from '../db/pgPool.js';
import {
  scoreLead,
  bulkScoreLeads,
  predictDeal,
  nextBestAction,
  optimizeCampaign,
  suggestSubjectLines,
  forecastRevenue,
  analyzePipelineHealth,
  generateDashboardInsights,
  enrichContact,
} from '../services/ai-crm.service.js';
import {
  generateAssistedEmailDraft,
  analyzeEmailCommunication,
} from '../services/ai-email-arg.service.js';
import {
  getMarketingContext,
  marketingCopilotChat,
  executeMarketingAction,
} from '../services/crm-marketing-copilot.service.js';
import { runCrmAgent, applyCrmAgentAction } from '../services/crm-agent/index.js';

const router = express.Router();
const agenticFlag = requireFeatureFlag('crm.agentic_operator', { fallbackEnv: 'CRM_AGENT_ENABLED' });

// ─── Agentic CRM operator (WS-A) ─────────────────────────────────────────────
// A1 read tools and A2 guarded writes. Write tools can only PROPOSE; proposals come back as
// `pendingActions` and are applied only via /agent/confirm below, after explicit human confirmation.
// Feature-flagged so rollout can be controlled per environment. Production is enabled
// through the managed SSM parameters; authentication and capability checks still apply.
router.post('/agent', authCRM, agenticFlag, requireCRMCapability('foundation:read'), async (req, res) => {
  try {
    if (!req.crmUser?.tenantId) {
      return res.status(400).json({ success: false, message: 'No tenant context on this session.' });
    }
    const { messages, message } = req.body || {};
    const convo = Array.isArray(messages) && messages.length
      ? messages
      : (message ? [{ role: 'user', content: String(message) }] : null);
    if (!convo) {
      return res.status(400).json({ success: false, message: 'Provide `message` (string) or `messages` (array).' });
    }
    const result = await runCrmAgent({ crmUser: req.crmUser, messages: convo });
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[crm-ai] agent error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Apply ONE staged write proposal after the human confirms it in the UI. The body echoes the
// { tool, args } from a `pendingActions` entry. RBAC is re-checked and the change is audited as applied.
router.post('/agent/confirm', authCRM, requireCRMCapability('foundation:write'), async (req, res) => {
  if (process.env.CRM_AGENT_ENABLED !== 'true') {
    return res.status(503).json({ success: false, message: 'The CRM agent is not enabled on this environment.' });
  }
  try {
    if (!req.crmUser?.tenantId) {
      return res.status(400).json({ success: false, message: 'No tenant context on this session.' });
    }
    const { proposalId, tool, args } = req.body || {};
    if (!proposalId || typeof proposalId !== 'string') {
      return res.status(400).json({ success: false, code: 'proposal_id_required', message: '`proposalId` is required. Confirm a proposal returned by /agent.' });
    }
    if (!tool || typeof tool !== 'string') {
      return res.status(400).json({ success: false, message: '`tool` (string) is required.' });
    }
    const result = await applyCrmAgentAction({ crmUser: req.crmUser, proposalId, toolName: tool, args: args || {} });
    if (result?.error) {
      const code = result.error === 'permission_denied' ? 403 : (result.error === 'not_found' || result.error === 'proposal_not_found' ? 404 : 400);
      return res.status(code).json({ success: false, ...result });
    }
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[crm-ai] agent confirm error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Explicit memory endpoints keep the UI useful even when the model does not select a memory tool.
router.get('/agent/memory', authCRM, requireCRMCapability('foundation:read'), async (req, res) => {
  try {
    if (!req.crmUser?.tenantUid || !Number.isFinite(Number(req.crmUser.id))) return res.status(400).json({ success: false, code: 'tenant_context_required' });
    const { rows } = await sharedPool.query(
      `SELECT memory_key AS "key", category, value, source, updated_at AS "updatedAt"
         FROM crm_agent_memories WHERE tenant_uid=$1 AND actor_user_id=$2 ORDER BY updated_at DESC LIMIT 100`,
      [req.crmUser.tenantUid, Number(req.crmUser.id)]);
    return res.json({ success: true, memories: rows });
  } catch (err) { return res.status(500).json({ success: false, code: 'memory_unavailable', message: err.message }); }
});

router.delete('/agent/memory/:key', authCRM, requireCRMCapability('foundation:write'), async (req, res) => {
  try {
    const { rowCount } = await sharedPool.query(
      `DELETE FROM crm_agent_memories WHERE tenant_uid=$1 AND actor_user_id=$2 AND memory_key=$3`,
      [req.crmUser.tenantUid, Number(req.crmUser.id), req.params.key]);
    return res.json({ success: true, deleted: rowCount > 0 });
  } catch (err) { return res.status(500).json({ success: false, code: 'memory_unavailable', message: err.message }); }
});

// ─── helpers ─────────────────────────────────────────────────────────────────

async function q(crmUser, sql, params = []) {
  const { rows } = await crmQuery(crmUser, sql, params);
  return rows;
}

async function q1(crmUser, sql, params = []) {
  const rows = await q(crmUser, sql, params);
  return rows[0] ?? null;
}

async function leadActivities(crmUser, leadId) {
  return q(crmUser,
    `SELECT type, title, description, outcome, created_at AS "createdAt"
     FROM crm_activities WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [leadId],
  ).catch(() => []);
}

async function dealActivities(crmUser, dealId) {
  return q(crmUser,
    `SELECT type, title, description, outcome, created_at AS "createdAt"
     FROM crm_activities WHERE deal_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [dealId],
  ).catch(() => []);
}

// ─── Schema readiness ─────────────────────────────────────────────────────────
const REQUIRED_SCHEMA_TABLES = ['crm_ai_email_communications'];
let schemaReadyPromise = null;
async function ensureSchemaReady() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = sharedPool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ANY($1::text[])`,
      [REQUIRED_SCHEMA_TABLES]
    ).then(({ rows }) => {
      const present = new Set(rows.map((row) => row.table_name));
      const missingTables = REQUIRED_SCHEMA_TABLES.filter((table) => !present.has(table));
      if (missingTables.length) {
        const error = new Error('CRM extension schema migration has not been applied');
        error.status = 503; error.code = 'SCHEMA_NOT_MIGRATED'; error.details = { missingTables };
        throw error;
      }
    }).catch((error) => { schemaReadyPromise = null; throw error; });
  }
  return schemaReadyPromise;
}

router.use(async (_req, res, next) => {
  try { await ensureSchemaReady();  next(); }
  catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 503;
    res.status(status).json({ success: false, code: error.code || 'SCHEMA_UNAVAILABLE', message: error.message || 'CRM extension schema is unavailable', details: error.details });
  }
});

async function loadEmailEntity(crmUser, entityType, entityId) {
  if (!entityId) return null;
  if (entityType === "lead") {
    return q1(crmUser,
      `SELECT id, name, email, phone, company, designation, source, status, priority, notes,
              tags, custom_fields AS "customFields", last_contacted AS "lastContactAt",
              next_followup AS "nextFollowup", created_at AS "createdAt"
       FROM crm_leads WHERE id = $1`,
      [entityId],
    );
  }
  if (entityType === "deal") {
    return q1(crmUser,
      `SELECT id, title, lead_id AS "leadId", value, currency, stage, probability,
              expected_close AS "expectedCloseDate", contact_name AS "contactName",
              contact_email AS "contactEmail", contact_phone AS "contactPhone",
              company, notes, tags, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM crm_deals WHERE id = $1`,
      [entityId],
    );
  }
  if (entityType === "contact") {
    return q1(crmUser,
      `SELECT id, name, email, phone, company, designation, city, state, notes, tags,
              lead_id AS "leadId", created_at AS "createdAt"
       FROM crm_contacts WHERE id = $1`,
      [entityId],
    );
  }
  return null;
}

async function emailLinksVisible(user, ids) {
  if (ids.leadId && !await q1(user, `SELECT id FROM crm_leads WHERE id=$1`, [ids.leadId])) return false;
  if (ids.dealId && !await q1(user, `SELECT id FROM crm_deals WHERE id=$1`, [ids.dealId])) return false;
  return true;
}

function emailEntityIds(entityType, entityId, entity = {}) {
  return {
    leadId: entityType === "lead" ? entityId : entity.leadId ?? entity.lead_id ?? null,
    dealId: entityType === "deal" ? entityId : entity.dealId ?? entity.deal_id ?? null,
  };
}

function contactEmailFrom(entity = {}, fallback = null) {
  return entity.email || entity.contactEmail || entity.contact_email || fallback || null;
}

// ─── Lead scoring ─────────────────────────────────────────────────────────────

// POST /crm/ai/leads/:id/score
router.post('/leads/:id/score', authCRM, async (req, res) => {
  try {
    const lead = await q1(req.crmUser,
      `SELECT id, name, email, phone, company, source, status, score, tags, custom_fields AS "customFields",
              last_contacted AS "lastContactAt", created_at AS "createdAt"
       FROM crm_leads WHERE id = $1`,
      [req.params.id],
    );
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const activities = await leadActivities(req.crmUser, lead.id);
    const result     = await scoreLead(lead, activities);

    // persist score back
    await crmQuery(req.crmUser,
      `UPDATE crm_leads SET score = $1, updated_at = NOW() WHERE id = $2`,
      [result.score, lead.id],
    ).catch(() => {});

    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /crm/ai/leads/bulk-score
router.post('/leads/bulk-score', authCRM, async (req, res) => {
  try {
    const { ids } = req.body; // optional array; if omitted → score all open leads
    let leads;
    if (ids?.length) {
      leads = await q(req.crmUser,
        `SELECT id, name, email, phone, company, source, status, score, tags,
                last_contacted AS "lastContactAt", created_at AS "createdAt"
         FROM crm_leads WHERE id = ANY($1)`,
        [ids],
      );
    } else {
      leads = await q(req.crmUser,
        `SELECT id, name, email, phone, company, source, status, score, tags,
                last_contacted AS "lastContactAt", created_at AS "createdAt"
         FROM crm_leads WHERE status NOT IN ('converted','lost','dead')
         ORDER BY created_at DESC LIMIT 100`,
      );
    }

    const scores = await bulkScoreLeads(leads);

    // persist scores
    await Promise.allSettled(
      scores.map(s => crmQuery(req.crmUser,
        `UPDATE crm_leads SET score = $1, updated_at = NOW() WHERE id = $2`,
        [s.score, s.id],
      )),
    );

    res.json({ data: scores, count: scores.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /crm/ai/leads/:id/next-action
router.get('/leads/:id/next-action', authCRM, async (req, res) => {
  try {
    const lead = await q1(req.crmUser,
      `SELECT id, name, company, source, status, tags, last_contacted AS "lastContactAt"
       FROM crm_leads WHERE id = $1`,
      [req.params.id],
    );
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const activities = await leadActivities(req.crmUser, lead.id);
    const action     = await nextBestAction(lead, 'lead', activities);

    res.json({ data: action });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Deal prediction ──────────────────────────────────────────────────────────

// POST /crm/ai/deals/:id/predict
router.post('/deals/:id/predict', authCRM, async (req, res) => {
  try {
    const deal = await q1(req.crmUser,
      `SELECT id, title, value, currency, stage, probability, expected_close AS "expectedCloseDate",
              updated_at AS "updatedAt", created_at AS "createdAt"
       FROM crm_deals WHERE id = $1`,
      [req.params.id],
    );
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    const activities = await dealActivities(req.crmUser, deal.id);
    const prediction = await predictDeal(deal, activities);

    res.json({ data: prediction });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /crm/ai/deals/:id/next-action
router.get('/deals/:id/next-action', authCRM, async (req, res) => {
  try {
    const deal = await q1(req.crmUser,
      `SELECT id, title, value, stage, probability FROM crm_deals WHERE id = $1`,
      [req.params.id],
    );
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    const activities = await dealActivities(req.crmUser, deal.id);
    const action     = await nextBestAction(deal, 'deal', activities);

    res.json({ data: action });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Pipeline health ──────────────────────────────────────────────────────────

// GET /crm/ai/pipeline/health
router.get('/pipeline/health', authCRM, async (req, res) => {
  try {
    const [leads, deals] = await Promise.all([
      q(req.crmUser,`SELECT id, name, company, email, phone, source, score, status, last_contacted AS "lastContactAt", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM crm_leads WHERE status NOT IN ('converted','lost','dead') LIMIT 200`),
      q(req.crmUser,`SELECT id, title, value, stage, updated_at AS "updatedAt", created_at AS "createdAt"
         FROM crm_deals WHERE stage NOT IN ('won','lost','closed won','closed lost') LIMIT 200`),
    ]);

    const health = await analyzePipelineHealth(leads, deals);
    res.json({ data: health });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Revenue forecast ────────────────────────────────────────────────────────

// GET /crm/ai/revenue/forecast
router.get('/revenue/forecast', authCRM, async (req, res) => {
  try {
    const deals = await q(req.crmUser,
      `SELECT id, title, value, currency, stage, probability, expected_close AS "expectedCloseDate",
              created_at AS "createdAt"
       FROM crm_deals WHERE stage NOT IN ('lost','closed lost') LIMIT 500`,
    );
    const forecast = forecastRevenue(deals);
    res.json({ data: forecast });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Dashboard AI insights ────────────────────────────────────────────────────

// GET /crm/ai/dashboard/insights
router.get('/dashboard/insights', authCRM, async (req, res) => {
  try {
    const [leadStats, dealStats, campaignStats] = await Promise.all([
      q(req.crmUser,`SELECT status, COUNT(*) AS count FROM crm_leads GROUP BY status`),
      q(req.crmUser,`SELECT stage, COUNT(*) AS count, SUM(value) AS total_value FROM crm_deals GROUP BY stage`),
      q(req.crmUser,`SELECT COUNT(*) AS total,
                SUM(CASE WHEN status='sent' THEN 1 ELSE 0 END) AS sent
         FROM crm_marketing_campaigns`).catch(() => [{ total: 0, sent: 0 }]),
    ]);

    const stats = {
      leads: Object.fromEntries(leadStats.map(r => [r.status, parseInt(r.count)])),
      deals: dealStats.map(r => ({
        stage: r.stage,
        count: parseInt(r.count),
        value: parseFloat(r.total_value) || 0,
      })),
      campaigns: campaignStats[0] ?? {},
    };

    const insights = await generateDashboardInsights(stats);
    res.json({ data: insights });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Campaign optimization ────────────────────────────────────────────────────

// POST /crm/ai/campaigns/:id/optimize
router.post('/campaigns/:id/optimize', authCRM, async (req, res) => {
  try {
    const campaign = await q1(req.crmUser,
      `SELECT id, name, subject, preheader FROM crm_marketing_campaigns WHERE id = $1`,
      [req.params.id],
    );
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const stats = await q1(req.crmUser,
      `SELECT COUNT(*) AS total_recipients,
              SUM(CASE WHEN status='delivered' THEN 1 ELSE 0 END) AS delivered,
              SUM(CASE WHEN status='bounced'   THEN 1 ELSE 0 END) AS bounced
       FROM crm_marketing_campaign_recipients WHERE campaign_id = $1`,
      [campaign.id],
    ).catch(() => ({}));

    const openCount = await q1(req.crmUser,
      `SELECT COUNT(DISTINCT recipient_id) AS opens
       FROM crm_marketing_events WHERE campaign_id = $1 AND event_type = 'open'`,
      [campaign.id],
    ).catch(() => ({ opens: 0 }));

    const total = parseInt(stats?.total_recipients) || 0;
    const opens = parseInt(openCount?.opens) || 0;
    const enrichedStats = {
      ...stats,
      open_rate: total > 0 ? ((opens / total) * 100).toFixed(1) : null,
    };

    const suggestions = await optimizeCampaign(campaign, enrichedStats);
    res.json({ data: suggestions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /crm/ai/campaigns/subject-lines
router.post('/campaigns/subject-lines', authCRM, async (req, res) => {
  try {
    const { topic, audience, count = 5 } = req.body;
    if (!topic) return res.status(400).json({ error: 'topic is required' });

    const result = await suggestSubjectLines(
      topic,
      audience ?? 'hospital HR, procurement, and benefits managers',
      Math.min(10, count),
    );
    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Contact enrichment ───────────────────────────────────────────────────────

// POST /crm/ai/contacts/:id/enrich
router.post('/contacts/:id/enrich', authCRM, async (req, res) => {
  try {
    const contact = await q1(req.crmUser,
      `SELECT id, name, email, phone, company, title FROM crm_contacts WHERE id = $1`,
      [req.params.id],
    );
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    const [deals, activities] = await Promise.all([
      q(req.crmUser,`SELECT id, title, stage, value FROM crm_deals WHERE contact_id = $1 LIMIT 10`,
        [contact.id]).catch(() => []),
      q(req.crmUser,`SELECT type, description, outcome FROM crm_activities WHERE contact_id = $1 ORDER BY created_at DESC LIMIT 10`,
        [contact.id]).catch(() => []),
    ]);

    const profile = await enrichContact(contact, deals, activities);
    res.json({ data: profile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Batch insights (used by AI hub page) ────────────────────────────────────

// GET /crm/ai/hub
// Returns everything the AI Insights page needs in a single request.
router.get('/hub', authCRM, async (req, res) => {
  try {
    const [leads, deals, campaignRows] = await Promise.all([
      q(req.crmUser,`SELECT id, name, company, source, status, score, email, phone,
                last_contacted AS "lastContactAt", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM crm_leads WHERE status NOT IN ('converted','lost','dead')
         ORDER BY score DESC NULLS LAST, created_at DESC LIMIT 50`),
      q(req.crmUser,`SELECT id, title, value, currency, stage, probability,
                expected_close AS "expectedCloseDate",
                updated_at AS "updatedAt", created_at AS "createdAt"
         FROM crm_deals WHERE stage NOT IN ('lost','closed lost')
         ORDER BY value DESC LIMIT 50`),
      q(req.crmUser,`SELECT id, name, subject, status, created_at AS "createdAt"
         FROM crm_marketing_campaigns ORDER BY created_at DESC LIMIT 10`).catch(() => []),
    ]);

    const [forecast, pipelineHealth, leadScores] = await Promise.all([
      Promise.resolve(forecastRevenue(deals)),
      Promise.resolve(null),
      bulkScoreLeads(leads),
    ]);

    // Merge scores into leads
    const scoreMap = Object.fromEntries(leadScores.map(s => [s.id, s]));
    const scoredLeads = leads.map(l => ({
      ...l,
      score:      scoreMap[l.id]?.score ?? l.score ?? 0,
      tier:       scoreMap[l.id]?.tier  ?? 'Cold',
      nextAction: scoreMap[l.id]?.nextAction ?? null,
    }));

    // Deal predictions (rule-based only to keep hub fast)
    const { forecastRevenue: _f, ...predictDealFn } = await import('../services/ai-crm.service.js');
    void predictDealFn; // unused; predictions below are rule-based
    const WIN_PROB = { lead: 0.05, qualified: 0.15, proposal: 0.35, negotiation: 0.65, 'closed won': 1.0, 'closed lost': 0.0 };
    const predictedDeals = deals.map(d => ({
      ...d,
      winProbability: d.probability != null ? Number(d.probability) : Math.round((WIN_PROB[(d.stage ?? '').toLowerCase()] ?? 0.1) * 100),
      healthStatus: (Date.now() - new Date(d.updatedAt).getTime()) / 86_400_000 > 21 ? 'Stalled' : 'On Track',
    }));

    res.json({
      data: {
        leads: scoredLeads,
        deals: predictedDeals,
        campaigns: campaignRows,
        forecast,
        pipelineHealth: await analyzePipelineHealth(scoredLeads, deals),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// AI-assisted email flow and ARG monitoring
router.post("/email/draft", authCRM, async (req, res) => {
  try {
    const entityType = String(req.body.entityType || "manual").toLowerCase();
    const entityId = req.body.entityId ? Number(req.body.entityId) : null;
    const intent = req.body.intent || "follow_up";
    const tone = req.body.tone || "professional";
    const context = req.body.context || {};
    const loadedEntity = await loadEmailEntity(req.crmUser, entityType, entityId);
    const entity = loadedEntity || req.body.entity || {};
    if (entityId && !loadedEntity && ["lead", "deal", "contact"].includes(entityType)) {
      return res.status(404).json({ error: "CRM entity not found" });
    }

    const ids = emailEntityIds(entityType, entityId, entity);
    if (!await emailLinksVisible(req.crmUser, ids)) return res.status(404).json({ error:'CRM entity not found' });
    const previousMessages = ids.leadId ? await leadActivities(req.crmUser, ids.leadId) : ids.dealId ? await dealActivities(req.crmUser, ids.dealId) : [];
    const draft = await generateAssistedEmailDraft({ entityType, entity, intent, tone, context, previousMessages });

    const row = await q1(req.crmUser,
      `INSERT INTO crm_ai_email_communications
       (entity_type, entity_id, lead_id, deal_id, contact_email, subject, body, intent, tone, status,
        next_action, suggested_stage, revenue_impact, ai_payload, learning_tags, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        entityType, entityId, ids.leadId, ids.dealId, contactEmailFrom(entity, req.body.contactEmail),
        draft.subject, draft.body, intent, draft.tone || tone, "draft",
        JSON.stringify({ type: "Review", dueInHours: 0, message: "Review and approve AI email draft." }),
        draft.pipelineStageSuggestion || null, 0, JSON.stringify(draft), JSON.stringify(draft.reasons || []),
        req.crmUser?.id || req.user?.id || null,
      ],
    );

    if (ids.leadId || ids.dealId) {
      await sharedPool.query(
        `INSERT INTO crm_activities (type, title, description, lead_id, deal_id, created_by, tenant_uid)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        ["email_ai_draft", `AI email drafted: ${draft.subject}`, draft.revenueAngle || draft.cta || null, ids.leadId, ids.dealId, req.crmUser.id, req.crmUser.tenantUid],
      ).catch(() => {});
    }

    res.json({ data: { id: row.id, draft, communication: row } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/email/monitor", authCRM, async (req, res) => {
  try {
    const communicationId = req.body.communicationId ? Number(req.body.communicationId) : null;
    const entityType = String(req.body.entityType || "manual").toLowerCase();
    const entityId = req.body.entityId ? Number(req.body.entityId) : null;
    const eventType = req.body.eventType || "sent";
    let existing = null;
    if (communicationId) existing = await q1(req.crmUser,`SELECT * FROM crm_ai_email_communications WHERE id = $1`, [communicationId]);
    if (communicationId && !existing) return res.status(404).json({ error:'Communication not found' });
    const loadedEntity = await loadEmailEntity(req.crmUser, entityType, entityId);
    if (entityId && !loadedEntity) return res.status(404).json({ error:'CRM entity not found' });
    const entity = loadedEntity || req.body.entity || {};
    const baseIds = emailEntityIds(entityType, entityId, entity);
    const ids = { leadId: req.body.leadId || existing?.lead_id || baseIds.leadId, dealId: req.body.dealId || existing?.deal_id || baseIds.dealId };

    if (!await emailLinksVisible(req.crmUser, ids)) return res.status(404).json({ error:'CRM entity not found' });
    const analysis = await analyzeEmailCommunication({
      eventType,
      subject: req.body.subject || existing?.subject || "",
      body: req.body.body || existing?.body || "",
      replyText: req.body.replyText || "",
      currentStage: entity.status || entity.stage || req.body.currentStage || "",
      entity,
      revenueImpact: req.body.revenueImpact || existing?.revenue_impact || 0,
    });

    const params = [
      entityType, entityId, ids.leadId || null, ids.dealId || null, contactEmailFrom(entity, req.body.contactEmail || existing?.contact_email),
      req.body.subject || existing?.subject || null, req.body.body || existing?.body || null, req.body.intent || existing?.intent || analysis.intent,
      req.body.tone || existing?.tone || null, eventType, eventType, analysis.sentiment, analysis.engagementScore, analysis.conversionSignal,
      analysis.urgency, JSON.stringify(analysis.nextAction || {}), analysis.suggestedStage || null, Number(analysis.revenueImpact) || 0,
      JSON.stringify({ analysis, sourceCommunicationId: communicationId, replyText: req.body.replyText || null }),
      JSON.stringify(analysis.learningTags || []), req.crmUser?.id || req.user?.id || null,
    ];

    const row = await q1(req.crmUser,
      `INSERT INTO crm_ai_email_communications
       (entity_type, entity_id, lead_id, deal_id, contact_email, subject, body, intent, tone, status, event_type,
        sentiment, engagement_score, conversion_signal, urgency, next_action, suggested_stage, revenue_impact, ai_payload, learning_tags, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       RETURNING *`,
      params,
    );

    if (communicationId) {
      await crmQuery(req.crmUser, `UPDATE crm_ai_email_communications SET status=$1, event_type=$2, updated_at=NOW() WHERE id=$3`, [eventType, eventType, communicationId]).catch(() => {});
    }
    if (ids.leadId || ids.dealId) {
      await sharedPool.query(
        `INSERT INTO crm_activities (type, title, description, lead_id, deal_id, scheduled_at, outcome, created_by, tenant_uid)
         VALUES ($1,$2,$3,$4,$5, NOW() + make_interval(hours => $6::int), $7, $8, $9)`,
        ["email_ai_monitor", `Email ${eventType}: ${analysis.conversionSignal}`, analysis.nextAction?.message || analysis.intent, ids.leadId || null, ids.dealId || null, analysis.nextAction?.dueInHours || 48, analysis.sentiment, req.crmUser.id, req.crmUser.tenantUid],
      ).catch(() => {});
      if (ids.leadId && ["hot", "warm"].includes(analysis.conversionSignal)) {
        await crmQuery(req.crmUser, `UPDATE crm_leads SET last_contacted=NOW(), updated_at=NOW(), score=GREATEST(COALESCE(score,0), $1) WHERE id=$2`, [analysis.engagementScore, ids.leadId]).catch(() => {});
      }
    }

    res.json({ data: { id: row.id, analysis, communication: row } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/email/communications", authCRM, async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
    const rows = await q(req.crmUser,
      `SELECT id, entity_type AS "entityType", entity_id AS "entityId", lead_id AS "leadId", deal_id AS "dealId",
              contact_email AS "contactEmail", subject, intent, tone, status, event_type AS "eventType", sentiment,
              engagement_score AS "engagementScore", conversion_signal AS "conversionSignal", urgency, next_action AS "nextAction",
              suggested_stage AS "suggestedStage", revenue_impact AS "revenueImpact", learning_tags AS "learningTags", created_at AS "createdAt"
       FROM crm_ai_email_communications ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/email/arg-dashboard", authCRM, async (req, res) => {
  try {
    const days = Math.min(180, Math.max(1, Number(req.query.days) || 30));
    const stats = await q1(req.crmUser,
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = $q$draft$q$)::int AS drafts,
              COUNT(*) FILTER (WHERE event_type = $q$sent$q$)::int AS sent,
              COUNT(*) FILTER (WHERE event_type = $q$reply$q$)::int AS replies,
              COUNT(*) FILTER (WHERE event_type = $q$open$q$)::int AS opens,
              COUNT(*) FILTER (WHERE event_type = $q$click$q$)::int AS clicks,
              COUNT(*) FILTER (WHERE conversion_signal = $q$hot$q$)::int AS hot_signals,
              ROUND(AVG(engagement_score))::int AS avg_engagement,
              COALESCE(SUM(revenue_impact),0)::numeric AS revenue_influenced
       FROM crm_ai_email_communications WHERE created_at >= NOW() - make_interval(days => $1::int)`,
      [days],
    );
    const nextActions = await q(req.crmUser,
      `SELECT id, subject, contact_email AS "contactEmail", conversion_signal AS "conversionSignal", urgency, next_action AS "nextAction",
              suggested_stage AS "suggestedStage", revenue_impact AS "revenueImpact", created_at AS "createdAt"
       FROM crm_ai_email_communications
       WHERE created_at >= NOW() - make_interval(days => $1::int)
         AND next_action IS NOT NULL
       ORDER BY engagement_score DESC, created_at DESC LIMIT 10`,
      [days],
    );
    const stageSuggestions = await q(req.crmUser,
      `SELECT suggested_stage AS stage, COUNT(*)::int AS count, COALESCE(SUM(revenue_impact),0)::numeric AS revenue
       FROM crm_ai_email_communications
       WHERE created_at >= NOW() - make_interval(days => $1::int) AND suggested_stage IS NOT NULL
       GROUP BY suggested_stage ORDER BY count DESC LIMIT 8`,
      [days],
    );
    const data = {
      windowDays: days,
      totals: {
        total: Number(stats?.total) || 0,
        drafts: Number(stats?.drafts) || 0,
        sent: Number(stats?.sent) || 0,
        replies: Number(stats?.replies) || 0,
        opens: Number(stats?.opens) || 0,
        clicks: Number(stats?.clicks) || 0,
        hotSignals: Number(stats?.hot_signals) || 0,
        avgEngagement: Number(stats?.avg_engagement) || 0,
        revenueInfluenced: Number(stats?.revenue_influenced) || 0,
      },
      rates: {
        replyRate: stats?.sent ? Math.round((Number(stats.replies) / Number(stats.sent)) * 100) : 0,
        hotSignalRate: stats?.total ? Math.round((Number(stats.hot_signals) / Number(stats.total)) * 100) : 0,
      },
      nextActions,
      stageSuggestions,
    };
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Marketing AI Copilot ─────────────────────────────────────────────────────

router.get('/marketing/context', authCRM, async (req, res) => {
  try {
    const context = await getMarketingContext(req.crmUser);
    res.json({ data: context });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/marketing/chat', authCRM, async (req, res) => {
  try {
    const { messages = [] } = req.body;
    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array required' });
    }
    const result = await marketingCopilotChat({
      messages,
      crmUser: req.crmUser || {},
    });
    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/marketing/action', authCRM, async (req, res) => {
  try {
    const { tool, params = {} } = req.body;
    if (!tool) return res.status(400).json({ error: 'tool required' });
    const result = await executeMarketingAction(tool, params, req.crmUser || {});
    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
