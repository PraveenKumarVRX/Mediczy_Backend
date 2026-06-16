/**
 * AI Email + ARG service.
 *
 * ARG = AI-assisted revenue generation: draft outreach copy,
 * monitor communication outcomes, and turn engagement into pipeline action.
 */

import llmProvider from './ai-brain/llm-provider.js';
import { getChannelLimits, CORPORATE_PLACEHOLDERS } from '../constants/communication-limits.js';

async function aiJSON(systemPrompt, userPrompt, maxTokens = 900) {
  try {
    const result = await llmProvider.chat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      maxTokens,
      temperature: 0.25,
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

function placeholderHint() {
  return CORPORATE_PLACEHOLDERS.map((p) => `{{${p}}}`).join(', ');
}

export function estimateRevenueImpact(entity = {}, context = {}) {
  const explicit = Number(context.estimatedRevenue);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  const employeeCount = Number(entity.employeeCount ?? entity.employee_count) || 0;
  const premium = Number(context.premiumPerEmployee ?? context.premium_per_employee) || 0;
  if (employeeCount && premium) return Math.round(employeeCount * premium);

  const planPrice = Number(context.planPrice) || 0;
  const enrolled = Number(context.enrolledEmployees) || employeeCount;
  if (planPrice && enrolled) return Math.round(planPrice * enrolled);

  return 0;
}

function fallbackEmailDraft({ entity = {}, intent = 'follow_up', tone = 'professional', context = {} }) {
  const name = entity.contactPerson || entity.contact_name || entity.name || '{{contactPerson}}';
  const company = entity.companyName || entity.company || '{{companyName}}';
  const subjectIntent = String(intent).replace(/_/g, ' ');
  const limits = getChannelLimits('email');

  return {
    subject: `Following up on ${subjectIntent} — {{companyName}}`,
    preheader: 'A quick next step from My SmartHealth.',
    body: `Hi ${name},\n\nI wanted to follow up regarding ${company} and share the next practical step. My SmartHealth can help simplify employee healthcare access, care navigation, and digital health workflows with a measurable rollout plan.\n\nWould you be open to a short discussion this week so we can align this to your current priorities?\n\nRegards,\nMy SmartHealth Team`,
    cta: 'Book a 15-minute discussion',
    tone,
    recommendedSendTime: 'next_business_morning',
    followUpAfterHours: 48,
    pipelineStageSuggestion: 'contacted',
    revenueAngle: 'Move the account to a structured discovery conversation.',
    approvalRequired: true,
    reasons: ['Rule-based fallback used because AI drafting was unavailable.'],
    source: 'rules',
    channel: 'email',
    wordLimit: limits.words,
    charLimit: limits.chars,
    revenueImpact: estimateRevenueImpact(entity, context),
  };
}

function fallbackWhatsAppDraft({ entity = {}, intent = 'follow_up', tone = 'professional', context = {} }) {
  const name = entity.contactPerson || '{{contactPerson}}';
  const limits = getChannelLimits('whatsapp');

  return {
    subject: null,
    preheader: '',
    body: `Hi ${name}, Team My SmartHealth here. Quick follow-up for {{companyName}} on ${String(intent).replace(/_/g, ' ')}. Reply YES to schedule a short call.`,
    cta: 'Reply YES',
    tone,
    recommendedSendTime: 'business_hours',
    followUpAfterHours: 24,
    pipelineStageSuggestion: 'contacted',
    revenueAngle: 'Low-friction WhatsApp re-engagement.',
    approvalRequired: true,
    reasons: ['Rule-based WhatsApp fallback.'],
    source: 'rules',
    channel: 'whatsapp',
    wordLimit: limits.words,
    charLimit: limits.chars,
    revenueImpact: estimateRevenueImpact(entity, context),
  };
}

function fallbackSmsDraft({ entity = {}, intent = 'follow_up', tone = 'professional', context = {} }) {
  const limits = getChannelLimits('sms');

  return {
    subject: null,
    preheader: '',
    body: `SmartHealth: Follow-up for {{companyName}} (${String(intent).replace(/_/g, ' ')}). Reply YES for next steps.`,
    cta: 'Reply YES',
    tone,
    recommendedSendTime: 'business_hours',
    followUpAfterHours: 48,
    pipelineStageSuggestion: 'contacted',
    revenueAngle: 'Concise SMS nudge.',
    approvalRequired: true,
    reasons: ['Rule-based SMS fallback.'],
    source: 'rules',
    channel: 'sms',
    wordLimit: limits.words,
    charLimit: limits.chars,
    revenueImpact: estimateRevenueImpact(entity, context),
  };
}

function fallbackCommunicationAnalysis({ eventType = 'sent', replyText = '', revenueImpact = 0 }) {
  const text = String(replyText).toLowerCase();
  const positive = /interested|yes|send|demo|call|meeting|share|discuss/.test(text);
  const negative = /not interested|stop|unsubscribe|no budget|later/.test(text);
  const score = eventType === 'reply' ? (positive ? 85 : negative ? 15 : 55) : eventType === 'open' ? 45 : eventType === 'click' ? 65 : 25;

  return {
    sentiment: positive ? 'positive' : negative ? 'negative' : 'neutral',
    intent: positive ? 'buying_signal' : negative ? 'disqualify_or_nurture' : eventType,
    engagementScore: score,
    conversionSignal: positive ? 'hot' : negative ? 'cold' : score >= 60 ? 'warm' : 'low',
    urgency: positive ? 'high' : 'medium',
    nextAction: {
      type: positive ? 'Call' : negative ? 'Nurture' : 'Follow-up',
      dueInHours: positive ? 4 : negative ? 168 : 48,
      message: positive ? 'Respond quickly and offer meeting slots.' : 'Continue with a useful follow-up cadence.',
    },
    suggestedStage: positive ? 'qualified' : undefined,
    revenueImpact: Number(revenueImpact) || 0,
    learningTags: [eventType, positive ? 'positive_signal' : negative ? 'negative_signal' : 'neutral_signal'],
    source: 'rules',
  };
}

function strongBuyingSignal(replyText = '') {
  return /yes|interested|demo|call|meeting|slots?|share|proposal|pricing|commercial|quote|discuss|available/.test(
    String(replyText).toLowerCase(),
  );
}

function buildDraftSystemPrompt({ channel, limits, hasCurrentDraft, assistMode }) {
  const isTemplate = assistMode === 'create_template';
  const channelLabel = channel === 'whatsapp' ? 'WhatsApp' : channel === 'sms' ? 'SMS' : 'email';

  return `You are My SmartHealth's AI outreach copilot for B2B healthcare sales and corporate health benefits.
Channel: ${channelLabel}
Your role is to ${isTemplate ? 'create a reusable template with placeholders' : 'ASSIST and AUGMENT team-written drafts'}, not override user intent.
${hasCurrentDraft && !isTemplate ? 'A current draft is provided. Improve that draft while preserving key intent, facts, placeholders, and call-to-action direction.' : isTemplate ? 'Create a practical reusable template with placeholders for rapid campaign use.' : 'No current draft provided. Create a practical first draft.'}
Preserve placeholders exactly where appropriate: ${placeholderHint()}.
Maximum body length: ${limits.words} words and ${limits.chars} characters.
Return ONLY valid JSON:
${channel === 'email'
    ? '{"subject":"string","preheader":"string","body":"plain text","cta":"string","tone":"string","recommendedSendTime":"string","followUpAfterHours":integer,"pipelineStageSuggestion":"string","revenueAngle":"string","approvalRequired":boolean,"reasons":["..."]}'
    : '{"subject":null,"preheader":"","body":"plain text message","cta":"string","tone":"string","recommendedSendTime":"string","followUpAfterHours":integer,"pipelineStageSuggestion":"string","revenueAngle":"string","approvalRequired":boolean,"reasons":["..."]}'}`;
}

function normalizeDraft(ai, input, channel, limits) {
  const { entity = {}, tone = 'professional', context = {} } = input;
  if (!ai?.body) return null;

  return {
    subject: channel === 'email' ? (ai.subject || '') : null,
    preheader: ai.preheader || '',
    body: ai.body,
    cta: ai.cta || (channel === 'email' ? 'Reply to this email' : 'Reply YES'),
    tone: ai.tone || tone,
    recommendedSendTime: ai.recommendedSendTime || (channel === 'email' ? 'next_business_morning' : 'business_hours'),
    followUpAfterHours: Number(ai.followUpAfterHours) || (channel === 'sms' ? 48 : 24),
    pipelineStageSuggestion: ai.pipelineStageSuggestion || null,
    revenueAngle: ai.revenueAngle || null,
    approvalRequired: ai.approvalRequired !== false,
    reasons: Array.isArray(ai.reasons) ? ai.reasons : [],
    source: 'ai',
    channel,
    wordLimit: limits.words,
    charLimit: limits.chars,
    revenueImpact: estimateRevenueImpact(entity, { ...context, ...(ai.revenueImpact ? { estimatedRevenue: ai.revenueImpact } : {}) }),
  };
}

async function generateChannelDraft(input = {}) {
  const { entity = {}, intent = 'follow_up', tone = 'professional', context = {}, previousMessages = [] } = input;
  const channel = String(context?.channel || 'email').toLowerCase();
  const limits = getChannelLimits(channel);
  const currentSubject = String(context?.currentSubject || '').trim();
  const currentMessage = String(context?.currentMessage || '').trim();
  const hasCurrentDraft = Boolean(currentSubject || currentMessage);
  const assistMode = String(context?.assistMode || 'augment').toLowerCase();
  const channelLabel = channel === 'whatsapp' ? 'WhatsApp message' : channel === 'sms' ? 'SMS text' : 'email';

  const systemPrompt = buildDraftSystemPrompt({ channel, limits, hasCurrentDraft, assistMode });

  const userPrompt = `Draft a ${channelLabel}.
Intent: ${intent}
Tone: ${tone}
Assist mode: ${assistMode}
Entity: ${JSON.stringify(entity)}
Context: ${JSON.stringify(context)}
Existing subject: ${currentSubject || 'N/A'}
Existing message:
${currentMessage || 'N/A'}
Previous messages: ${JSON.stringify(previousMessages.slice(-5))}`;

  const ai = await aiJSON(systemPrompt, userPrompt, 1000);
  const normalized = normalizeDraft(ai, input, channel, limits);
  if (normalized) return normalized;

  if (channel === 'whatsapp') return fallbackWhatsAppDraft(input);
  if (channel === 'sms') return fallbackSmsDraft(input);
  return fallbackEmailDraft(input);
}

/** Primary export — supports email, WhatsApp, and SMS via context.channel */
export async function generateAssistedEmailDraft(input = {}) {
  return generateChannelDraft(input);
}

export async function analyzeEmailCommunication(input = {}) {
  const { eventType = 'sent', subject = '', body = '', replyText = '', entity = {}, currentStage = '', revenueImpact = 0, context = {} } = input;
  const computedRevenue = estimateRevenueImpact(entity, context) || Number(revenueImpact) || 0;

  const ai = await aiJSON(
    `You are My SmartHealth's AI communication monitor. Classify engagement and convert it into pipeline action.
Return ONLY valid JSON:
{"sentiment":"positive|neutral|negative","intent":"buying_signal|question|objection|nurture|disqualify|admin|sent|open|click|bounce","engagementScore":integer,"conversionSignal":"hot|warm|low|negative","urgency":"high|medium|low","nextAction":{"type":"Call|Email|Demo|Proposal|Nurture|Disqualify","dueInHours":integer,"message":"string"},"suggestedStage":"string|null","revenueImpact":number,"learningTags":["..."]}`,
    `Communication event:
${JSON.stringify({ eventType, subject, body, replyText, entity, currentStage, revenueImpact: computedRevenue })}`,
    800,
  );

  if (!ai?.engagementScore) return fallbackCommunicationAnalysis({ ...input, revenueImpact: computedRevenue });

  const guardedScore = strongBuyingSignal(replyText)
    ? Math.max(75, Number(ai.engagementScore) || 0)
    : Math.max(0, Math.min(100, Number(ai.engagementScore) || 0));

  return {
    sentiment: ai.sentiment || 'neutral',
    intent: strongBuyingSignal(replyText) ? 'buying_signal' : ai.intent || eventType,
    engagementScore: Math.min(100, guardedScore),
    conversionSignal: strongBuyingSignal(replyText) ? 'hot' : ai.conversionSignal || 'low',
    urgency: strongBuyingSignal(replyText) ? 'high' : ai.urgency || 'medium',
    nextAction: ai.nextAction || { type: 'Follow-up', dueInHours: 48, message: 'Continue follow-up.' },
    suggestedStage: ai.suggestedStage || null,
    revenueImpact: Number(ai.revenueImpact ?? computedRevenue) || 0,
    learningTags: Array.isArray(ai.learningTags) ? ai.learningTags : [eventType],
    source: 'ai',
  };
}
