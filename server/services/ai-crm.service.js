/**
 * AI CRM Service — sales intelligence, lead scoring, deal prediction,
 * campaign optimization, revenue forecasting, and pipeline health.
 *
 * All public functions return plain objects and never throw — callers
 * always get a result (AI-enhanced or rule-based fallback).
 */

import llmProvider from './ai-brain/llm-provider.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function aiJSON(systemPrompt, userPrompt, maxTokens = 1024) {
  try {
    const result = await llmProvider.chat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ],
      maxTokens,
      temperature: 0.2,
      skipCache: true,
      cognitiveTier: 'standard',
    });
    const text = result.content?.trim() ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function daysSince(dateStr) {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

// ─── Lead Scoring ─────────────────────────────────────────────────────────────

const SOURCE_WEIGHTS = {
  referral: 20, website: 15, linkedin: 15, conference: 12,
  'facebook-lead-ads': 18, 'marketing-website': 16, instagram: 17,
  cold_call: 5, email: 8, social: 8, other: 3,
};
const STATUS_WEIGHTS = {
  qualified: 25, contacted: 15, new: 10, nurturing: 12,
  proposal: 30, negotiation: 35, converted: 40, lost: 0,
};

function ruleBasedLeadScore(lead) {
  let score = 20; // base
  score += SOURCE_WEIGHTS[lead.source?.toLowerCase()] ?? 5;
  score += STATUS_WEIGHTS[lead.status?.toLowerCase()] ?? 5;
  if (lead.company)  score += 8;
  if (lead.email)    score += 5;
  if (lead.phone)    score += 5;
  const recency = daysSince(lead.lastContactAt ?? lead.createdAt);
  if (recency < 3)   score += 10;
  else if (recency < 7)  score += 7;
  else if (recency < 14) score += 4;
  else if (recency > 60) score -= 15;
  if (!lead.lastContactAt && ['new', ''].includes((lead.status || '').toLowerCase())) score = Math.min(score, 44);
  return Math.max(0, Math.min(100, score));
}

/** Fast rule-based score for automation pipelines (no LLM latency). */
export function quickScoreLead(lead) {
  const score = ruleBasedLeadScore(lead);
  return {
    score,
    tier: tierFromScore(score),
    confidence: 'medium',
    factors: [],
    nextAction: lead.status === 'qualified' ? 'Review requirements' : lead.status === 'contacted' ? 'Follow up' : 'Make first contact',
    source: 'rules',
  };
}

export async function scoreLead(lead, activities = []) {
  const rulesScore = ruleBasedLeadScore(lead);
  if (!lead.lastContactAt && !activities.some(a => ['call','email','meeting','whatsapp','sms'].includes(a.type || a.activityType))) return quickScoreLead(lead);

  const activitySummary = activities.slice(-10).map(
    a => `${a.type ?? a.activityType}: ${a.title ?? a.description ?? ''}`
  ).join('; ') || 'no recent activities';

  const ai = await aiJSON(
    `You are a B2B healthcare sales AI. Score the quality of a sales lead (0-100) and categorise it.
Return ONLY valid JSON:
{"score":integer,"tier":"Hot|Warm|Cold|Dead","confidence":"high|medium|low","factors":["...","..."],"nextAction":{"type":"Call|Email|Demo|Nurture|Disqualify","timing":"today|this_week|next_week|monthly","reason":"one sentence"}}`,
    `Lead data: ${JSON.stringify({ name: lead.name, company: lead.company, source: lead.source, status: lead.status, tags: lead.tags, daysSinceContact: daysSince(lead.lastContactAt), daysSinceCreate: daysSince(lead.createdAt), recentActivities: activitySummary })}
Rule-based score: ${rulesScore}. Refine or confirm.`,
    512,
  );

  if (ai?.score != null) {
    return {
      score: Math.max(0, Math.min(100, ai.score)),
      tier: ai.tier ?? tierFromScore(ai.score),
      confidence: ai.confidence ?? 'medium',
      factors: ai.factors ?? [],
      nextAction: ai.nextAction ?? null,
      source: 'ai',
    };
  }
  return {
    score: rulesScore,
    tier: tierFromScore(rulesScore),
    confidence: 'low',
    factors: [],
    nextAction: lead.status === 'qualified' ? 'Review requirements' : lead.status === 'contacted' ? 'Follow up' : 'Make first contact',
    source: 'rules',
  };
}

function tierFromScore(s) {
  if (s >= 70) return 'Hot';
  if (s >= 45) return 'Warm';
  if (s >= 20) return 'Cold';
  return 'Dead';
}

export async function bulkScoreLeads(leads) {
  return (leads || []).map(lead => ({ id: lead.id, name: lead.name, ...quickScoreLead(lead) }));
}

// ─── Deal Prediction ──────────────────────────────────────────────────────────

export async function predictDeal(deal, activities = []) {
  const daysInStage = daysSince(deal.stageChangedAt ?? deal.updatedAt ?? deal.createdAt);
  const lastActivity = daysSince(activities[0]?.createdAt);
  const activityCount = activities.length;

  const STAGE_BASE = {
    lead: 10, qualified: 20, proposal: 35, negotiation: 60, 'closed won': 100, 'closed lost': 0,
  };
  const stageKey = (deal.stage ?? deal.status ?? '').toLowerCase();
  const baseWin = STAGE_BASE[stageKey] ?? 25;

  const ai = await aiJSON(
    `You are a B2B sales intelligence AI for a healthcare company.
Predict deal outcome and health. Return ONLY valid JSON:
{"winProbability":integer,"healthStatus":"On Track|At Risk|Stalled|Critical","expectedCloseDays":integer,"risks":["..."],"strengths":["..."],"nextAction":{"type":"string","description":"string"}}`,
    `Deal: ${JSON.stringify({ title: deal.title, value: deal.value, stage: deal.stage, daysInStage, activityCount, daysSinceLastActivity: lastActivity, currency: deal.currency ?? 'INR' })}
Base win probability from stage rules: ${baseWin}%`,
    512,
  );

  if (ai?.winProbability != null) {
    return { ...ai, source: 'ai' };
  }

  let health = 'On Track';
  if (daysInStage > 30) health = 'Stalled';
  else if (lastActivity > 14) health = 'At Risk';

  return {
    winProbability: baseWin,
    healthStatus: health,
    expectedCloseDays: 30,
    risks: daysInStage > 30 ? ['No stage movement in 30+ days'] : [],
    strengths: [],
    nextAction: 'Review deal progress',
    source: 'rules',
  };
}

// ─── Next Best Action ─────────────────────────────────────────────────────────

export async function nextBestAction(entity, entityType, activities = []) {
  const activitySummary = activities.slice(-5).map(
    a => `${a.type ?? a.activityType}|${a.title ?? a.description ?? ''}|${a.outcome ?? ''}`
  ).join(' / ') || 'none';

  const ai = await aiJSON(
    `You are a sales coach AI for a B2B healthcare CRM. Recommend the single best next action.
Return ONLY valid JSON:
{"actionType":"Call|Email|WhatsApp|Demo|Proposal|Follow-up|Nurture","timing":"today|tomorrow|this_week","channel":"phone|email|whatsapp|meeting","subject":"string","body":"string (2-3 sentences, personalised)","reason":"why this action now"}`,
    `${entityType}: ${JSON.stringify({ name: entity.name, company: entity.company, status: entity.status ?? entity.stage, recentActivities: activitySummary })}`,
    512,
  );

  return ai ?? {
    actionType: 'Follow-up',
    timing: 'this_week',
    channel: 'email',
    subject: `Following up — ${entity.name ?? entity.title}`,
    body: 'Hi, I wanted to follow up on our last conversation. Would you have 15 minutes this week to connect?',
    reason: 'Default follow-up cadence',
  };
}

// ─── Campaign Optimization ────────────────────────────────────────────────────

export async function optimizeCampaign(campaign, stats = {}) {
  const ai = await aiJSON(
    `You are a healthcare marketing AI. Optimize an email campaign.
Return ONLY valid JSON:
{"subjectLines":["...","...","..."],"preheaders":["...","...","..."],"bestSendDay":"Monday|Tuesday|Wednesday|Thursday|Friday","bestSendHour":integer,"segmentSuggestion":"string","contentTips":["...","...","..."],"predictedOpenRate":number,"predictedCtr":number}`,
    `Campaign: ${JSON.stringify({ name: campaign.name, subject: campaign.subject, preheader: campaign.preheader, listSize: stats.total_recipients ?? campaign.listSize ?? 0, openRate: stats.open_rate, clickRate: stats.ctr, industry: 'healthcare B2B', audience: campaign.audienceNote ?? 'hospital HR/procurement decision makers' })}`,
    768,
  );

  return ai ?? {
    subjectLines: [campaign.subject],
    preheaders: [],
    bestSendDay: 'Tuesday',
    bestSendHour: 10,
    segmentSuggestion: 'Segment by company size and past engagement.',
    contentTips: ['Keep subject under 50 characters.', 'Add a clear CTA above the fold.'],
    predictedOpenRate: 22,
    predictedCtr: 3.5,
  };
}

export async function suggestSubjectLines(topic, audience, count = 5) {
  const ai = await aiJSON(
    `You are a healthcare email marketing expert. Generate compelling subject lines.
Return ONLY valid JSON: {"subjectLines":["..."],"preheaders":["..."]}`,
    `Topic: "${topic}". Audience: "${audience}". Generate ${count} subject lines and matching preheaders. Tone: professional, benefit-driven, concise (under 50 chars each).`,
    512,
  );
  return ai ?? { subjectLines: [], preheaders: [] };
}

// ─── Revenue Forecast ─────────────────────────────────────────────────────────

export function forecastRevenue(deals) {
  if (!deals?.length) {
    return { weighted: 0, optimistic: 0, pessimistic: 0, monthly: [], dealCount: 0 };
  }

  const WIN_PROB = {
    lead: 0.05, qualified: 0.15, proposal: 0.35,
    negotiation: 0.65, 'closed won': 1.0, 'closed lost': 0.0,
  };

  let weighted = 0, optimistic = 0, pessimistic = 0;
  const monthMap = {};

  deals.forEach(d => {
    const stage = (d.stage ?? d.status ?? '').toLowerCase();
    if (['won', 'closed won', 'lost', 'closed lost'].includes(stage)) return;
    const prob = ['won', 'closed won'].includes(stage) ? 1 : d.probability != null && Number.isFinite(Number(d.probability)) ? Math.max(0, Math.min(100, Number(d.probability))) / 100 : (WIN_PROB[stage] ?? 0.1);
    const value = parseFloat(d.value) || 0;

    weighted    += value * prob;
    optimistic  += value * Math.min(1, prob * 1.5);
    pessimistic += value * prob * 0.5;

    const closeMonth = d.expectedCloseDate
      ? new Date(d.expectedCloseDate).toISOString().slice(0, 7)
      : new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 7);

    monthMap[closeMonth] = (monthMap[closeMonth] ?? 0) + value * prob;
  });

  const monthly = Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, amount]) => ({ month, amount: Math.round(amount) }));

  return {
    weighted:    Math.round(weighted),
    optimistic:  Math.round(optimistic),
    pessimistic: Math.round(pessimistic),
    monthly,
    dealCount: deals.filter(d => !['won','closed won','lost','closed lost'].includes((d.stage ?? d.status ?? '').toLowerCase())).length,
  };
}

// ─── Pipeline Health ──────────────────────────────────────────────────────────

export async function analyzePipelineHealth(leads, deals) {
  const stalledDeals  = deals.filter(d => daysSince(d.updatedAt) > 21).length;
  const hotLeads      = leads.filter(l => quickScoreLead(l).score >= 70).length;
  const coldLeads     = leads.filter(l => quickScoreLead(l).score < 30).length;
  const totalDealVal  = deals.reduce((s, d) => s + (parseFloat(d.value) || 0), 0);
  const avgDealAge    = deals.length
    ? Math.round(deals.reduce((s, d) => s + daysSince(d.createdAt), 0) / deals.length)
    : 0;

  return {
    healthScore: stalledDeals > deals.length * 0.4 ? 45 : 70,
    status: stalledDeals > deals.length * 0.4 ? 'Needs Attention' : 'Healthy',
    observations: [`${stalledDeals} deals stalled for 21+ days.`],
    alerts: [],
    opportunities: [`${hotLeads} hot leads ready for outreach.`],
  };
}

// ─── Dashboard AI Insights ────────────────────────────────────────────────────

export async function generateDashboardInsights(stats) {
  const ai = await aiJSON(
    `You are a sales intelligence AI for a healthcare B2B CRM. Generate concise executive insights.
Return ONLY valid JSON:
{"insights":[{"title":"string","body":"string","type":"positive|warning|info"}],"topAction":{"title":"string","description":"string","priority":"high|medium"}}`,
    `CRM stats this period: ${JSON.stringify(stats)}. Generate 3 insights and the single most important action.`,
    768,
  );

  return ai ?? {
    insights: [{ title: 'Pipeline review recommended', body: 'Schedule a pipeline review to prioritise follow-ups.', type: 'info' }],
    topAction: { title: 'Follow up hot leads', description: 'Reach out to leads scored 70+ this week.', priority: 'high' },
  };
}

// ─── Contact Enrichment (from internal data) ──────────────────────────────────

export async function enrichContact(contact, relatedDeals = [], relatedActivities = []) {
  const ai = await aiJSON(
    `You are a B2B data enrichment AI for healthcare sales. Infer profile details from available signals.
Return ONLY valid JSON:
{"buyerRole":"Economic Buyer|Technical Buyer|Champion|Influencer|Gatekeeper|Unknown","engagementLevel":"High|Medium|Low","sentiment":"Positive|Neutral|Negative|Unknown","topics":["..."],"summary":"2-sentence profile","recommendedApproach":"string"}`,
    `Contact: ${JSON.stringify({ name: contact.name, company: contact.company, title: contact.title, email: contact.email, dealCount: relatedDeals.length, activityCount: relatedActivities.length, recentActivity: relatedActivities[0]?.description ?? 'none' })}`,
    512,
  );

  return ai ?? {
    buyerRole: 'Unknown',
    engagementLevel: relatedActivities.length > 3 ? 'High' : 'Low',
    sentiment: 'Neutral',
    topics: [],
    summary: `${contact.name} at ${contact.company}.`,
    recommendedApproach: 'Continue relationship building.',
  };
}
