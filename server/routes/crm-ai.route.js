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

// ─── Lead scoring ─────────────────────────────────────────────────────────────

// POST /crm/ai/leads/:id/score
router.post('/leads/:id/score', authCRM, async (req, res) => {
  try {
    const lead = await q1(
      `SELECT id, name, email, phone, company, source, status, score, tags, custom_fields AS "customFields",
              last_contact_at AS "lastContactAt", created_at AS "createdAt"
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
                last_contact_at AS "lastContactAt", created_at AS "createdAt"
         FROM crm_leads WHERE id = ANY($1)`,
        [ids],
      );
    } else {
      leads = await q(
        `SELECT id, name, email, phone, company, source, status, score, tags,
                last_contact_at AS "lastContactAt", created_at AS "createdAt"
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
      `SELECT id, name, company, source, status, tags, last_contact_at AS "lastContactAt"
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
      `SELECT id, title, value, currency, stage, probability, expected_close_date AS "expectedCloseDate",
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
      `SELECT id, title, value, currency, stage, probability, expected_close_date AS "expectedCloseDate",
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
                last_contact_at AS "lastContactAt", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM crm_leads WHERE status NOT IN ('converted','lost','dead')
         ORDER BY score DESC NULLS LAST, created_at DESC LIMIT 50`),
      q(`SELECT id, title, value, currency, stage, probability,
                expected_close_date AS "expectedCloseDate",
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

export default router;
