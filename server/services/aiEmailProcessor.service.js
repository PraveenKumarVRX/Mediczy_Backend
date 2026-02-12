/**
 * AI Email Processor Service
 * Integrates with FastAPI ML service for email analysis
 */

const FASTAPI_URL = process.env.FASTAPI_URL || 'http://localhost:8001';

export async function aiProcessEmail(emailData) {
  try {
    const {
      subject,
      body,
      from,
      teamMemberId
    } = emailData;

    const text = `Subject: ${subject}\n\nBody: ${body}`;

    // Call FastAPI for NLP processing
    const response = await fetch(`${FASTAPI_URL}/process-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.FASTAPI_TOKEN || 'dev-token'}`
      },
      body: JSON.stringify({
        text,
        subject,
        sender: from,
        teamMemberId
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`FastAPI error: ${response.status} - ${error}`);
      return getDefaultAnalysis(subject, body);
    }

    const aiResult = await response.json();

    return {
      summary: aiResult.summary || generateSummary(body),
      intent: aiResult.intent || detectIntent(subject, body),
      entities: aiResult.entities || {},
      sentiment: aiResult.sentiment || 'neutral',
      confidence: aiResult.confidence || 0.7,
      priority: determinePriority(aiResult.intent || detectIntent(subject, body))
    };
  } catch (error) {
    console.error('AI processing error:', error);
    // Return fallback analysis
    return getDefaultAnalysis(emailData.subject, emailData.body);
  }
}

/**
 * Fallback email analysis when AI service is unavailable
 */
function getDefaultAnalysis(subject, body) {
  const intent = detectIntent(subject, body);

  return {
    summary: generateSummary(body),
    intent,
    entities: extractBasicEntities(body),
    sentiment: detectSentiment(body),
    confidence: 0.5,
    priority: determinePriority(intent)
  };
}

/**
 * Detect email intent from content
 */
function detectIntent(subject, body) {
  const text = `${subject} ${body}`.toLowerCase();

  if (
    text.includes('appointment') ||
    text.includes('book') ||
    text.includes('schedule') ||
    text.includes('time slot')
  ) {
    return 'appointment_request';
  }

  if (
    text.includes('result') ||
    text.includes('lab') ||
    text.includes('test') ||
    text.includes('report')
  ) {
    return 'test_result';
  }

  if (
    text.includes('prescription') ||
    text.includes('medicine') ||
    text.includes('medication') ||
    text.includes('drug')
  ) {
    return 'prescription';
  }

  if (
    text.includes('bill') ||
    text.includes('invoice') ||
    text.includes('payment') ||
    text.includes('charge')
  ) {
    return 'billing';
  }

  if (
    text.includes('thank') ||
    text.includes('feedback') ||
    text.includes('review') ||
    text.includes('excellent')
  ) {
    return 'feedback';
  }

  if (
    text.includes('question') ||
    text.includes('query') ||
    text.includes('help') ||
    text.includes('can you') ||
    text.includes('how')
  ) {
    return 'patient_query';
  }

  return 'other';
}

/**
 * Extract named entities from email body
 */
function extractBasicEntities(body) {
  const entities = {
    medicalTerms: [],
    dates: [],
    names: []
  };

  // Medical terms
  const medicalKeywords = [
    'diabetes', 'hypertension', 'fever', 'cough', 'pain', 'infection',
    'blood pressure', 'cholesterol', 'glucose', 'heart', 'lung'
  ];

  medicalKeywords.forEach(term => {
    if (body.toLowerCase().includes(term)) {
      entities.medicalTerms.push(term);
    }
  });

  // Dates (simple regex)
  const datePattern = /(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}|\d{4}[-]\d{1,2}[-]\d{1,2})/g;
  entities.dates = body.match(datePattern) || [];

  return entities;
}

/**
 * Detect email sentiment
 */
function detectSentiment(body) {
  const text = body.toLowerCase();

  const positiveWords = [
    'thank', 'excellent', 'great', 'good', 'happy', 'satisfied',
    'appreciate', 'wonderful', 'helpful', 'perfect'
  ];

  const negativeWords = [
    'angry', 'frustrated', 'disappointed', 'bad', 'poor', 'terrible',
    'unhappy', 'problem', 'issue', 'complaint', 'urgent', 'emergency'
  ];

  const positiveCount = positiveWords.filter(w => text.includes(w)).length;
  const negativeCount = negativeWords.filter(w => text.includes(w)).length;

  if (positiveCount > negativeCount) return 'positive';
  if (negativeCount > positiveCount) return 'negative';
  return 'neutral';
}

/**
 * Generate summary from email body
 */
function generateSummary(body) {
  // Simple summary: first 150 characters or first sentence
  const sentences = body.split(/[.!?]+/);
  const firstSentence = sentences[0]?.trim() || body;

  if (firstSentence.length > 150) {
    return firstSentence.substring(0, 150) + '...';
  }

  return firstSentence;
}

/**
 * Determine priority based on intent and sentiment
 */
function determinePriority(intent, sentiment = 'neutral') {
  if (intent === 'prescription' || intent === 'test_result') {
    return 'high';
  }

  if (sentiment === 'negative') {
    return 'urgent';
  }

  if (intent === 'appointment_request') {
    return 'normal';
  }

  return 'low';
}

export {
  detectIntent,
  extractBasicEntities,
  detectSentiment,
  generateSummary,
  determinePriority
};
