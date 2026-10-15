/**
 * CRM Marketing AI Copilot — conversational assistant with live CRM context.
 * Helps manage campaigns, leads, deals, and sales pipeline.
 */

import sharedPool from '../db/pgPool.js';
import llmProvider from './ai-brain/llm-provider.js';
import {
  bulkScoreLeads,
  suggestSubjectLines,
  optimizeCampaign,
  forecastRevenue,
  analyzePipelineHealth,
  generateDashboardInsights,
} from './ai-crm.service.js';
import { generateAssistedEmailDraft } from './ai-email-arg.service.js';

async function q(sql, params = []) {
  const { rows } = await sharedPool.query(sql, params);
  return rows;
}

async function q1(sql, params = []) {
  const rows = await q(sql, params);
  return rows[0] ?? null;
}

export async function getMarketingContext() {
  const [
    leadStats,
    dealStats,
    hotLeads,
    recentLeads,
    deals,
    campaigns,
    lists,
    funnel,
  ] = await Promise.all([
    q1(`SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'new')::int AS new_count,
          COUNT(*) FILTER (WHERE status = 'contacted')::int AS contacted,
          COUNT(*) FILTER (WHERE status = 'qualified')::int AS qualified,
          COUNT(*) FILTER (WHERE status = 'converted')::int AS converted,
          COUNT(*) FILTER (WHERE source = 'facebook-lead-ads')::int AS fb_leads,
          COUNT(*) FILTER (WHERE source = 'marketing-website')::int AS web_leads,
          COUNT(*) FILTER (WHERE COALESCE(score, 0) >= 70)::int AS hot_count
        FROM crm_leads`),
    q1(`SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE stage NOT IN ('won','lost'))::int AS active,
          COALESCE(SUM(value) FILTER (WHERE stage NOT IN ('won','lost')), 0)::float AS pipeline_value,
          COUNT(*) FILTER (WHERE stage = 'won')::int AS won_count
        FROM crm_deals`),
    q(`SELECT id, name, company, source, status, COALESCE(score, 0) AS score, phone, email
       FROM crm_leads
       WHERE status NOT IN ('converted','lost')
       ORDER BY COALESCE(score, 0) DESC, created_at DESC
       LIMIT 8`),
    q(`SELECT id, name, company, source, status, COALESCE(score, 0) AS score, created_at AS "createdAt"
       FROM crm_leads ORDER BY created_at DESC LIMIT 5`),
    q(`SELECT id, title, stage, value, currency, probability, company
       FROM crm_deals WHERE stage NOT IN ('lost')
       ORDER BY value DESC NULLS LAST LIMIT 8`),
    q(`SELECT id, name, subject, status, recipient_count, sent_at AS "sentAt", created_at AS "createdAt"
       FROM crm_marketing_campaigns ORDER BY created_at DESC LIMIT 6`).catch(() => []),
    q(`SELECT l.id, l.name, COUNT(m.id)::int AS member_count
       FROM crm_marketing_lists l
       LEFT JOIN crm_marketing_list_members m ON m.list_id = l.id
       GROUP BY l.id ORDER BY l.created_at DESC LIMIT 6`).catch(() => []),
    q1(`SELECT
          COUNT(*) FILTER (WHERE status = 'new')::int AS new_leads,
          COUNT(*) FILTER (WHERE status = 'contacted')::int AS contacted,
          COUNT(*) FILTER (WHERE status = 'qualified')::int AS qualified,
          COUNT(*) FILTER (WHERE status = 'converted')::int AS converted
        FROM crm_leads`),
  ]);

  const openLeads = await q(
    `SELECT id, name, company, source, status, COALESCE(score, 0) AS score,
            last_contacted AS "lastContactAt", created_at AS "createdAt"
     FROM crm_leads WHERE status NOT IN ('converted','lost')
     ORDER BY COALESCE(score, 0) DESC LIMIT 30`
  );

  const [forecast, pipelineHealth] = await Promise.all([
    Promise.resolve(forecastRevenue(deals)),
    analyzePipelineHealth(openLeads, deals),
  ]);

  return {
    leadStats: leadStats || {},
    dealStats: dealStats || {},
    funnel: funnel || {},
    hotLeads,
    recentLeads,
    deals,
    campaigns,
    lists,
    forecast,
    pipelineHealth,
    generatedAt: new Date().toISOString(),
  };
}

function buildSystemPrompt(context, crmUser = {}) {
  return `You are Mediqzy Marketing AI Copilot — an expert B2B healthcare sales and marketing assistant embedded in the Mediqzy CRM.

You help the sales/marketing team:
- Prioritize leads and plan outreach
- Draft email campaigns, subject lines, and WhatsApp follow-ups
- Analyze pipeline and campaign performance
- Recommend actions to convert Facebook/Instagram and website leads
- Plan nurture sequences and demo booking strategies

CRM user: ${crmUser.firstName || 'User'} ${crmUser.lastName || ''} (${crmUser.role || 'crm'})

Live CRM snapshot (use this data — do not invent numbers):
${JSON.stringify(context, null, 2)}

Guidelines:
- Be concise, actionable, and specific to Mediqzy (Hospital OS, EMR, insurance, corporate health)
- Reference real lead names, campaign names, and numbers from the snapshot when relevant
- Format with short paragraphs and bullet lists where helpful
- End with 1–3 concrete next steps when appropriate
- If asked to draft copy, provide ready-to-use subject lines and email/WhatsApp text
- Suggest CRM actions like "Score all leads", "Open Campaigns", "Follow up hot leads"

At the end of your response, if you recommend executable actions, append a JSON block on its own line:
ACTIONS:[{"id":"bulk_score","label":"Score all leads"},{"id":"open_campaigns","label":"Open campaigns"}]
Only include actions that are genuinely useful. Valid action ids: bulk_score, subject_lines, pipeline_summary, open_campaigns, open_leads, open_hot_leads, create_campaign.`;
}

function parseActionsFromReply(content = '') {
  const match = content.match(/ACTIONS:\s*(\[[\s\S]*?\])\s*$/);
  if (!match) return { text: content.trim(), actions: [] };
  try {
    const actions = JSON.parse(match[1]);
    const text = content.replace(match[0], '').trim();
    return { text, actions: Array.isArray(actions) ? actions : [] };
  } catch {
    return { text: content.trim(), actions: [] };
  }
}

export async function marketingCopilotChat({ messages = [], crmUser = {} }) {
  const context = await getMarketingContext();
  const systemPrompt = buildSystemPrompt(context, crmUser);

  const llmMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.slice(-20).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || ''),
    })),
  ];

  let reply = '';
  try {
    const result = await llmProvider.chat({
      messages: llmMessages,
      maxTokens: 2048,
      temperature: 0.4,
      skipCache: true,
      cognitiveTier: 'standard',
      preferProvider: process.env.CRM_LLM_PROVIDER || 'sarvam',  // Sarvam-first for CRM, cascade fallback
    });
    reply = result.content?.trim() || '';
  } catch (err) {
    reply = `I'm having trouble connecting to the AI service right now. Based on your CRM data: you have ${context.leadStats?.total || 0} leads (${context.leadStats?.hot_count || 0} hot) and ${context.dealStats?.active || 0} active deals worth ₹${Math.round(context.dealStats?.pipeline_value || 0).toLocaleString('en-IN')}. Try scoring all leads or following up your top hot leads first.`;
  }

  const { text, actions } = parseActionsFromReply(reply);

  return {
    reply: text,
    actions,
    context: {
      leadStats: context.leadStats,
      dealStats: context.dealStats,
      funnel: context.funnel,
      hotLeads: context.hotLeads,
      campaigns: context.campaigns,
      pipelineHealth: context.pipelineHealth,
      forecast: context.forecast,
    },
  };
}

export async function executeMarketingAction(tool, params = {}, crmUser = {}) {
  switch (tool) {
    case 'bulk_score': {
      const leads = await q(
        `SELECT id, name, company, source, status, score, created_at AS "createdAt", last_contacted AS "lastContactAt"
         FROM crm_leads WHERE status NOT IN ('converted','lost') LIMIT 100`
      );
      const scores = await bulkScoreLeads(leads);
      await Promise.all(scores.map(s =>
        sharedPool.query(`UPDATE crm_leads SET score = $1, updated_at = NOW() WHERE id = $2`, [s.score, s.id])
      ));
      return {
        tool,
        summary: `Scored ${scores.length} leads. ${scores.filter(s => s.score >= 70).length} are now Hot (70+).`,
        data: scores.slice(0, 10),
      };
    }

    case 'subject_lines': {
      const result = await suggestSubjectLines(
        params.topic || 'Mediqzy Hospital OS demo',
        params.audience || 'Hospital administrators and CIOs in India',
        params.count || 5,
      );
      return {
        tool,
        summary: `Generated ${result.subjectLines?.length || 0} subject line options.`,
        data: result,
      };
    }

    case 'optimize_campaign': {
      const campaignId = Number(params.campaignId);
      if (!campaignId) throw new Error('campaignId required');
      const campaign = await q1(`SELECT * FROM crm_marketing_campaigns WHERE id = $1`, [campaignId]);
      if (!campaign) throw new Error('Campaign not found');
      const stats = await q1(
        `SELECT COUNT(*)::int AS sent,
                COUNT(*) FILTER (WHERE opened_at IS NOT NULL)::int AS opened,
                COUNT(*) FILTER (WHERE clicked_at IS NOT NULL)::int AS clicked
         FROM crm_marketing_campaign_recipients WHERE campaign_id = $1`,
        [campaignId]
      ).catch(() => ({}));
      const tips = await optimizeCampaign(campaign, stats || {});
      return { tool, summary: `Optimization tips for "${campaign.name}".`, data: tips };
    }

    case 'draft_email': {
      const draft = await generateAssistedEmailDraft({
        entityType: params.entityType || 'lead',
        entity: params.entity || { name: params.name, company: params.company, email: params.email },
        intent: params.intent || 'follow_up',
        tone: params.tone || 'professional',
        context: params.context || {},
        previousMessages: [],
      });
      return { tool, summary: 'Email draft ready.', data: draft };
    }

    case 'pipeline_summary': {
      const context = await getMarketingContext();
      const insights = await generateDashboardInsights({
        leads: context.leadStats,
        deals: context.dealStats,
        funnel: context.funnel,
        hotLeads: context.leadStats?.hot_count,
        pipelineValue: context.dealStats?.pipeline_value,
      });
      return {
        tool,
        summary: 'Pipeline summary generated.',
        data: { insights, pipelineHealth: context.pipelineHealth, forecast: context.forecast },
      };
    }

    default:
      throw new Error(`Unknown tool: ${tool}`);
  }
}

export default { getMarketingContext, marketingCopilotChat, executeMarketingAction };
