/**
 * CRM AI Routes — sales intelligence, lead scoring, deal prediction,
 * campaign optimization, revenue forecasting, pipeline health.
 *
 * Mounted at /crm/ai by app.js (behind authCRM middleware).
 */

import express from 'express';
import { authCRM } from '../middleware/crm.middleware.js';
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

const router = express.Router();

// ─── helpers ─────────────────────────────────────────────────────────────────

async function q(sql, params = []) {
  const { rows } = await sharedPool.query(sql, params);
  return rows;
}

async function q1(sql, params = []) {
  const rows = await q(sql, params);
  return rows[0] ?? null;
}

async function leadActivities(leadId) {
  return q(
    `SELECT type, title, description, outcome, created_at AS "createdAt"
     FROM crm_activities WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [leadId],
  ).catch(() => []);
}

async function dealActivities(dealId) {
  return q(
    `SELECT type, title, description, outcome, created_at AS "createdAt"
     FROM crm_activities WHERE deal_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [dealId],
  ).catch(() => []);
}

async function ensureEmailAiTables() {
  await sharedPool.query(`
    CREATE TABLE IF NOT EXISTS crm_ai_email_communications (
      id                 BIGSERIAL PRIMARY KEY,
      entity_type        VARCHAR(40),
      entity_id          BIGINT,
      lead_id            BIGINT,
      deal_id            BIGINT,
      contact_email      VARCHAR(255),
      subject            TEXT,
      body               TEXT,
      intent             VARCHAR(100),
      tone               VARCHAR(80),
      status             VARCHAR(40) DEFAULT 'draft',
      event_type         VARCHAR(40),
      sentiment          VARCHAR(40),
      engagement_score   INTEGER DEFAULT 0,
      conversion_signal  VARCHAR(40),
      urgency            VARCHAR(40),
      next_action        JSONB DEFAULT '{}'::jsonb,
      suggested_stage    VARCHAR(100),
      revenue_impact     NUMERIC(15,2) DEFAULT 0,
      ai_payload         JSONB DEFAULT '{}'::jsonb,
      learning_tags      JSONB DEFAULT '[]'::jsonb,
      created_by         INTEGER,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ai_email_entity ON crm_ai_email_communications(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_ai_email_lead ON crm_ai_email_communications(lead_id);
    CREATE INDEX IF NOT EXISTS idx_ai_email_deal ON crm_ai_email_communications(deal_id);
    CREATE INDEX IF NOT EXISTS idx_ai_email_status ON crm_ai_email_communications(status);
    CREATE INDEX IF NOT EXISTS idx_ai_email_created ON crm_ai_email_communications(created_at DESC);
  `);
}

ensureEmailAiTables().catch(err => {
  console.warn("[CRM AI] Email AI table initialization skipped:", err.message);
});

async function loadEmailEntity(entityType, entityId) {
  if (!entityId) return null;
  if (entityType === "lead") {
    return q1(
      `SELECT id, name, email, phone, company, designation, source, status, priority, notes,
              tags, custom_fields AS "customFields", last_contacted AS "lastContactAt",
              next_followup AS "nextFollowup", created_at AS "createdAt"
       FROM crm_leads WHERE id = $1`,
      [entityId],
    );
  }
  if (entityType === "deal") {
    return q1(
      `SELECT id, title, lead_id AS "leadId", value, currency, stage, probability,
              expected_close AS "expectedCloseDate", contact_name AS "contactName",
              contact_email AS "contactEmail", contact_phone AS "contactPhone",
              company, notes, tags, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM crm_deals WHERE id = $1`,
      [entityId],
    );
  }
  if (entityType === "contact") {
    return q1(
      `SELECT id, name, email, phone, company, designation, city, state, notes, tags,
              lead_id AS "leadId", created_at AS "createdAt"
       FROM crm_contacts WHERE id = $1`,
      [entityId],
    );
  }
  return null;
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
    const lead = await q1(
      `SELECT id, name, email, phone, company, source, status, score, tags, custom_fields AS "customFields",
              last_contacted AS "lastContactAt", created_at AS "createdAt"
       FROM crm_leads WHERE id = $1`,
      [req.params.id],
    );
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const activities = await leadActivities(lead.id);
    const result     = await scoreLead(lead, activities);

    // persist score back
    await sharedPool.query(
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
      leads = await q(
        `SELECT id, name, email, phone, company, source, status, score, tags,
                last_contacted AS "lastContactAt", created_at AS "createdAt"
         FROM crm_leads WHERE id = ANY($1)`,
        [ids],
      );
    } else {
      leads = await q(
        `SELECT id, name, email, phone, company, source, status, score, tags,
                last_contacted AS "lastContactAt", created_at AS "createdAt"
         FROM crm_leads WHERE status NOT IN ('converted','lost','dead')
         ORDER BY created_at DESC LIMIT 100`,
      );
    }

    const scores = await bulkScoreLeads(leads);

    // persist scores
    await Promise.allSettled(
      scores.map(s => sharedPool.query(
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
    const lead = await q1(
      `SELECT id, name, company, source, status, tags, last_contacted AS "lastContactAt"
       FROM crm_leads WHERE id = $1`,
      [req.params.id],
    );
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const activities = await leadActivities(lead.id);
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
    const deal = await q1(
      `SELECT id, title, value, currency, stage, probability, expected_close AS "expectedCloseDate",
              updated_at AS "updatedAt", created_at AS "createdAt"
       FROM crm_deals WHERE id = $1`,
      [req.params.id],
    );
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    const activities = await dealActivities(deal.id);
    const prediction = await predictDeal(deal, activities);

    // persist AI probability
    if (prediction.winProbability != null) {
      await sharedPool.query(
        `UPDATE crm_deals SET probability = $1, updated_at = NOW() WHERE id = $2`,
        [prediction.winProbability, deal.id],
      ).catch(() => {});
    }

    res.json({ data: prediction });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /crm/ai/deals/:id/next-action
router.get('/deals/:id/next-action', authCRM, async (req, res) => {
  try {
    const deal = await q1(
      `SELECT id, title, value, stage, probability FROM crm_deals WHERE id = $1`,
      [req.params.id],
    );
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    const activities = await dealActivities(deal.id);
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
      q(`SELECT id, name, score, status, created_at AS "createdAt", updated_at AS "updatedAt"
         FROM crm_leads WHERE status NOT IN ('converted','lost','dead') LIMIT 200`),
      q(`SELECT id, title, value, stage, updated_at AS "updatedAt", created_at AS "createdAt"
         FROM crm_deals WHERE stage NOT IN ('closed won','closed lost') LIMIT 200`),
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
    const deals = await q(
      `SELECT id, title, value, currency, stage, probability, expected_close AS "expectedCloseDate",
              created_at AS "createdAt"
       FROM crm_deals WHERE stage NOT IN ('closed lost') LIMIT 500`,
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
      q(`SELECT status, COUNT(*) AS count FROM crm_leads GROUP BY status`),
      q(`SELECT stage, COUNT(*) AS count, SUM(value) AS total_value FROM crm_deals GROUP BY stage`),
      q(`SELECT COUNT(*) AS total,
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
    const campaign = await q1(
      `SELECT id, name, subject, preheader FROM crm_marketing_campaigns WHERE id = $1`,
      [req.params.id],
    );
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const stats = await q1(
      `SELECT COUNT(*) AS total_recipients,
              SUM(CASE WHEN status='delivered' THEN 1 ELSE 0 END) AS delivered,
              SUM(CASE WHEN status='bounced'   THEN 1 ELSE 0 END) AS bounced
       FROM crm_marketing_campaign_recipients WHERE campaign_id = $1`,
      [campaign.id],
    ).catch(() => ({}));

    const openCount = await q1(
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
    const contact = await q1(
      `SELECT id, name, email, phone, company, title FROM crm_contacts WHERE id = $1`,
      [req.params.id],
    );
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    const [deals, activities] = await Promise.all([
      q(`SELECT id, title, stage, value FROM crm_deals WHERE contact_id = $1 LIMIT 10`,
        [contact.id]).catch(() => []),
      q(`SELECT type, description, outcome FROM crm_activities WHERE contact_id = $1 ORDER BY created_at DESC LIMIT 10`,
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
      q(`SELECT id, name, company, source, status, score, email, phone,
                last_contacted AS "lastContactAt", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM crm_leads WHERE status NOT IN ('converted','lost','dead')
         ORDER BY score DESC NULLS LAST, created_at DESC LIMIT 50`),
      q(`SELECT id, title, value, currency, stage, probability,
                expected_close AS "expectedCloseDate",
                updated_at AS "updatedAt", created_at AS "createdAt"
         FROM crm_deals WHERE stage NOT IN ('closed lost')
         ORDER BY value DESC LIMIT 50`),
      q(`SELECT id, name, subject, status, created_at AS "createdAt"
         FROM crm_marketing_campaigns ORDER BY created_at DESC LIMIT 10`).catch(() => []),
    ]);

    const [forecast, pipelineHealth, leadScores] = await Promise.all([
      Promise.resolve(forecastRevenue(deals)),
      analyzePipelineHealth(leads, deals),
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
      winProbability: Math.round((WIN_PROB[(d.stage ?? '').toLowerCase()] ?? 0.1) * 100),
      healthStatus: (Date.now() - new Date(d.updatedAt).getTime()) / 86_400_000 > 21 ? 'Stalled' : 'On Track',
    }));

    res.json({
      data: {
        leads: scoredLeads,
        deals: predictedDeals,
        campaigns: campaignRows,
        forecast,
        pipelineHealth,
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
    const loadedEntity = await loadEmailEntity(entityType, entityId);
    const entity = loadedEntity || req.body.entity || {};
    if (entityId && !loadedEntity && ["lead", "deal", "contact"].includes(entityType)) {
      return res.status(404).json({ error: "CRM entity not found" });
    }

    const ids = emailEntityIds(entityType, entityId, entity);
    const previousMessages = ids.leadId ? await leadActivities(ids.leadId) : ids.dealId ? await dealActivities(ids.dealId) : [];
    const draft = await generateAssistedEmailDraft({ entityType, entity, intent, tone, context, previousMessages });

    const row = await q1(
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
        `INSERT INTO crm_activities (type, title, description, lead_id, deal_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        ["email_ai_draft", `AI email drafted: ${draft.subject}`, draft.revenueAngle || draft.cta || null, ids.leadId, ids.dealId, req.crmUser?.id || req.user?.id || 0],
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
    if (communicationId) existing = await q1(`SELECT * FROM crm_ai_email_communications WHERE id = $1`, [communicationId]);
    const loadedEntity = await loadEmailEntity(entityType, entityId);
    const entity = loadedEntity || req.body.entity || {};
    const baseIds = emailEntityIds(entityType, entityId, entity);
    const ids = { leadId: req.body.leadId || existing?.lead_id || baseIds.leadId, dealId: req.body.dealId || existing?.deal_id || baseIds.dealId };

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

    const row = await q1(
      `INSERT INTO crm_ai_email_communications
       (entity_type, entity_id, lead_id, deal_id, contact_email, subject, body, intent, tone, status, event_type,
        sentiment, engagement_score, conversion_signal, urgency, next_action, suggested_stage, revenue_impact, ai_payload, learning_tags, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       RETURNING *`,
      params,
    );

    if (communicationId) {
      await sharedPool.query(`UPDATE crm_ai_email_communications SET status=$1, event_type=$2, updated_at=NOW() WHERE id=$3`, [eventType, eventType, communicationId]).catch(() => {});
    }
    if (ids.leadId || ids.dealId) {
      await sharedPool.query(
        `INSERT INTO crm_activities (type, title, description, lead_id, deal_id, scheduled_at, outcome, created_by)
         VALUES ($1,$2,$3,$4,$5, NOW() + make_interval(hours => $6::int), $7, $8)`,
        ["email_ai_monitor", `Email ${eventType}: ${analysis.conversionSignal}`, analysis.nextAction?.message || analysis.intent, ids.leadId || null, ids.dealId || null, analysis.nextAction?.dueInHours || 48, analysis.sentiment, req.crmUser?.id || req.user?.id || 0],
      ).catch(() => {});
      if (ids.leadId && ["hot", "warm"].includes(analysis.conversionSignal)) {
        await sharedPool.query(`UPDATE crm_leads SET last_contacted=NOW(), updated_at=NOW(), score=GREATEST(COALESCE(score,0), $1) WHERE id=$2`, [analysis.engagementScore, ids.leadId]).catch(() => {});
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
    const rows = await q(
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
    const stats = await q1(
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
    const nextActions = await q(
      `SELECT id, subject, contact_email AS "contactEmail", conversion_signal AS "conversionSignal", urgency, next_action AS "nextAction",
              suggested_stage AS "suggestedStage", revenue_impact AS "revenueImpact", created_at AS "createdAt"
       FROM crm_ai_email_communications
       WHERE created_at >= NOW() - make_interval(days => $1::int)
         AND next_action IS NOT NULL
       ORDER BY engagement_score DESC, created_at DESC LIMIT 10`,
      [days],
    );
    const stageSuggestions = await q(
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
    const context = await getMarketingContext();
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
