/**
 * AI Email + ARG service.
 *
 * ARG here means AI-assisted revenue generation: draft useful email,
 * monitor communication outcomes, and turn engagement into pipeline action.
 */

import llmProvider from './ai-brain/llm-provider.js';

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

function fallbackEmailDraft({ entity = {}, intent = 'follow_up', tone = 'professional' }) {
  const name = entity.name || entity.contact_name || entity.title || 'there';
  const company = entity.company ? ` at ${entity.company}` : '';
  const subjectIntent = String(intent).replace(/_/g, ' ');

  return {
    subject: `Following up on ${subjectIntent}`,
    preheader: 'A quick next step from Mediqzy.',
    body: `Hi ${name},\n\nI wanted to follow up${company} and share the next practical step. Mediqzy can help simplify employee healthcare access, care navigation, and digital health workflows with a measurable rollout plan.\n\nWould you be open to a short discussion this week so we can align this to your current priorities?\n\nRegards,\nMediqzy Team`,
    cta: 'Book a 15-minute discussion',
    tone,
    recommendedSendTime: 'next_business_morning',
    followUpAfterHours: 48,
    pipelineStageSuggestion: 'contacted',
    revenueAngle: 'Move the account to a structured discovery conversation.',
    approvalRequired: true,
    reasons: ['Rule-based fallback used because AI drafting was unavailable.'],
    source: 'rules',
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

function strongBuyingSignal(replyText = "") {
  return /yes|interested|demo|call|meeting|slots?|share|proposal|pricing|commercial|quote|discuss|available/.test(
    String(replyText).toLowerCase(),
  );
}

export async function generateAssistedEmailDraft(input = {}) {
  const { entity = {}, intent = 'follow_up', tone = 'professional', context = {}, previousMessages = [] } = input;
  const currentSubject = String(context?.currentSubject || '').trim();
  const currentMessage = String(context?.currentMessage || '').trim();
  const hasCurrentDraft = Boolean(currentSubject || currentMessage);
  const assistMode = String(context?.assistMode || 'augment').toLowerCase();

  const systemPrompt = `You are Mediqzy's AI email copilot for B2B healthcare sales and corporate health benefits.
Your role is to ASSIST and AUGMENT team-written drafts, not override user intent.
${hasCurrentDraft ? 'A current draft is provided. Improve that draft while preserving key intent, facts, placeholders, and call-to-action direction.' : 'No current draft provided. Create a practical first draft.'}
If placeholders appear, preserve them exactly (for example: {{companyName}}, {{contactPerson}}, {{employeeCount}}, {{industry}}, {{packageType}}).
Return ONLY valid JSON:
{"subject":"string","preheader":"string","body":"plain text email, 120-180 words","cta":"string","tone":"string","recommendedSendTime":"string","followUpAfterHours":integer,"pipelineStageSuggestion":"string","revenueAngle":"string","approvalRequired":boolean,"reasons":["..."]}`;

  const userPrompt = `Draft an email.
Intent: ${intent}
Tone: ${tone}
Assist mode: ${assistMode}
Entity: ${JSON.stringify(entity)}
Context: ${JSON.stringify(context)}
Existing subject: ${currentSubject || 'N/A'}
Existing message:
${currentMessage || 'N/A'}
Previous messages: ${JSON.stringify(previousMessages.slice(-5))}`;

  const ai = await aiJSON(
    systemPrompt,
    userPrompt,
    1000,
  );

  if (!ai?.subject || !ai?.body) return fallbackEmailDraft(input);

  return {
    subject: ai.subject,
    preheader: ai.preheader || '',
    body: ai.body,
    cta: ai.cta || 'Reply to this email',
    tone: ai.tone || tone,
    recommendedSendTime: ai.recommendedSendTime || 'next_business_morning',
    followUpAfterHours: Number(ai.followUpAfterHours) || 48,
    pipelineStageSuggestion: ai.pipelineStageSuggestion || null,
    revenueAngle: ai.revenueAngle || null,
    approvalRequired: ai.approvalRequired !== false,
    reasons: Array.isArray(ai.reasons) ? ai.reasons : [],
    source: 'ai',
  };
}

export async function analyzeEmailCommunication(input = {}) {
  const { eventType = 'sent', subject = '', body = '', replyText = '', entity = {}, currentStage = '', revenueImpact = 0 } = input;

  const ai = await aiJSON(
    `You are Mediqzy's AI email monitor. Classify email engagement and convert it into pipeline action.
Return ONLY valid JSON:
{"sentiment":"positive|neutral|negative","intent":"buying_signal|question|objection|nurture|disqualify|admin|sent|open|click|bounce","engagementScore":integer,"conversionSignal":"hot|warm|low|negative","urgency":"high|medium|low","nextAction":{"type":"Call|Email|Demo|Proposal|Nurture|Disqualify","dueInHours":integer,"message":"string"},"suggestedStage":"string|null","revenueImpact":number,"learningTags":["..."]}`,
    `Email event:
${JSON.stringify({ eventType, subject, body, replyText, entity, currentStage, revenueImpact })}`,
    800,
  );

  if (!ai?.engagementScore) return fallbackCommunicationAnalysis(input);

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
    revenueImpact: Number(ai.revenueImpact ?? revenueImpact) || 0,
    learningTags: Array.isArray(ai.learningTags) ? ai.learningTags : [eventType],
    source: 'ai',
  };
}
