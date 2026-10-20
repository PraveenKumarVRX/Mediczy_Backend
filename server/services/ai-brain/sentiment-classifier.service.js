/**
 * Sentiment Classifier — shared helper
 *
 * One small, reusable sentiment classifier for the three places in the platform that have a
 * `sentiment`/`healthSentiment` column but nothing that ever computed it (chat messages, PREMS
 * feedback comments, CRM reviews). Modeled on the existing LLM-call + regex-fallback pattern already
 * proven in ai-email-arg.service.js's aiJSON()/fallbackCommunicationAnalysis(), generalized down to
 * just sentiment so this file can be shared by all three call sites without pulling in CRM-specific
 * shape (engagementScore, nextAction, etc.) those other callers need and these don't.
 */
import llmProvider from './llm-provider.js';

const POSITIVE_WORDS = /thank|great|good|excellent|perfect|happy|satisfied|appreciate|wonderful|helpful/i;
const NEGATIVE_WORDS = /angry|frustrated|disappointed|bad|poor|terrible|unhappy|problem|issue|complaint|worst|awful/i;

function fallbackSentiment(text) {
  const positive = POSITIVE_WORDS.test(text);
  const negative = NEGATIVE_WORDS.test(text);
  if (positive && !negative) return { sentiment: 'positive', source: 'rules' };
  if (negative && !positive) return { sentiment: 'negative', source: 'rules' };
  return { sentiment: 'neutral', source: 'rules' };
}

/**
 * @param {string} text
 * @returns {Promise<{sentiment: 'positive'|'neutral'|'negative', source: 'ai'|'rules'}|null>} null for empty/whitespace-only input
 */
export async function classifySentiment(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;

  try {
    const result = await llmProvider.chat({
      messages: [
        { role: 'system', content: 'Classify the sentiment of the given text. Return ONLY valid JSON: {"sentiment":"positive|neutral|negative"}' },
        { role: 'user', content: trimmed.slice(0, 2000) },
      ],
      maxTokens: 50,
      temperature: 0,
      skipCache: true,
    });
    const content = result?.content?.trim() ?? '';
    const match = content.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : content);
    if (['positive', 'neutral', 'negative'].includes(parsed.sentiment)) {
      return { sentiment: parsed.sentiment, source: 'ai' };
    }
    return fallbackSentiment(trimmed);
  } catch {
    return fallbackSentiment(trimmed);
  }
}

export default { classifySentiment };
