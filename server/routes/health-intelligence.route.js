import express from 'express';
import authUser from '../middleware/auth.js';
import healthReminderService from '../services/healthReminder.service.js';
import postgresSequelize from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';
import { enrichLogDataFromDiary, computeDailyScore } from '../services/daily-health-score.service.js';
import llmProvider from '../services/ai-brain/llm-provider.js';

const router = express.Router();

// ─── Domain → reminder-type mapping (matches HealthIntelligenceDashboard CATEGORIES) ──
const DOMAIN_TYPE = {
  activity:   'activity',
  nutrition:  'diet',
  sleep:      'lifestyle',
  vitals:     'vitals',
  medication: 'medication',
  hydration:  'lifestyle',
  mental:     'lifestyle',
};

const DOMAIN_MESSAGES = {
  activity: {
    critical: 'Your activity score is very low today. Even a 15-minute walk can make a big difference — try to hit at least 5,000 steps.',
    low:  'Your activity is below target today. A 20–30 minute brisk walk will help you reach your daily step goal.',
    mid:  'You\'re making progress on activity! A short walk or stretching session will push you past your goal.',
  },
  nutrition: {
    critical: 'Nutrition needs urgent attention. Focus on balanced meals — include vegetables, protein, and whole grains, and avoid processed or high-sugar foods.',
    low:  'Your nutrition score is low. Log your meals and aim for balanced macros — protein, fibre, and healthy fats at every meal.',
    mid:  'Nutrition is almost on track. Swap one processed snack for a fruit or handful of nuts to improve your score.',
  },
  sleep: {
    critical: 'Your sleep is significantly below optimal. Aim for 7–9 hours tonight — poor sleep affects every other health metric.',
    low:  'Your sleep quality or duration is below the recommended range. Try winding down 30–45 minutes earlier and reducing screen time before bed.',
    mid:  'Sleep is slightly below target. Maintaining a consistent sleep schedule helps your body recover better.',
  },
  vitals: {
    critical: 'One or more vitals (BP, heart rate, SpO₂ or blood sugar) are outside the normal range. Please log updated readings and consult your doctor if values remain abnormal.',
    low:  'Your vitals score is low. Log your blood pressure, heart rate, or SpO₂ to get an accurate picture, and consult your doctor if you feel unwell.',
    mid:  'Your vitals are near normal range. Keep monitoring regularly to catch any changes early.',
  },
  medication: {
    critical: 'Medication adherence is very low. Missing doses can affect your treatment outcomes — take your prescribed medicines as directed.',
    low:  'Your medication adherence needs improvement today. Set a reminder to take your prescribed medicines on time.',
    mid:  'Good medication adherence! Stay consistent — missing even one dose can reduce the effectiveness of your treatment.',
  },
  hydration: {
    critical: 'You\'re significantly dehydrated today. Drink water immediately — aim for 8 glasses (2 litres) throughout the day.',
    low:  'Your hydration is low. Drink a glass of water now and set a reminder to sip regularly through the day.',
    mid:  'Hydration is slightly below target. A couple more glasses of water will get you to your daily goal.',
  },
  mental: {
    critical: 'Your stress or mood indicators are very concerning. Please take a break — try 5 minutes of deep breathing or call someone you trust.',
    low:  'Your mental well-being score is low today. A short walk, meditation, or talking to someone you trust can help lift your mood.',
    mid:  'Your mental well-being could use some support. Try a 5-minute breathing exercise or a short break from screens.',
  },
};

/**
 * Converts today's daily health score domain breakdown into reminder objects
 * that are compatible with the existing HealthIntelligenceDashboard reminder format.
 * Only generates insights for domains scoring below 75 (room for improvement).
 */
async function getScoreInsights(userId) {
  const today = new Date().toISOString().split('T')[0];
  try {
    let domains = null;

    // 1. Try precomputed score for today first (fast path)
    const [row] = await postgresSequelize.query(
      `SELECT composite_score, activity_score, nutrition_score, sleep_score, vitals_score, medication_score, hydration_score, mental_score
       FROM daily_health_scores WHERE user_id = :userId AND score_date = :today LIMIT 1`,
      { replacements: { userId, today }, type: QueryTypes.SELECT }
    );

    if (row) {
      domains = {
        activity:   row.activity_score,
        nutrition:  row.nutrition_score,
        sleep:      row.sleep_score,
        vitals:     row.vitals_score,
        medication: row.medication_score,
        hydration:  row.hydration_score,
        mental:     row.mental_score,
      };
    } else {
      // 2. Recompute on demand if no precomputed score exists yet
      const enriched = await enrichLogDataFromDiary(userId, today);
      const result = computeDailyScore(enriched, {}, today);
      domains = result.domains;
    }

    if (!domains) return [];

    const insights = [];
    for (const [domain, rawScore] of Object.entries(domains)) {
      const type = DOMAIN_TYPE[domain];
      if (!type) continue;
      const scoreNum = typeof rawScore === 'object' ? (rawScore.score ?? rawScore) : rawScore;
      if (scoreNum == null || scoreNum >= 75) continue;  // skip — domain is healthy

      const msgs = DOMAIN_MESSAGES[domain];
      if (!msgs) continue;

      const level    = scoreNum < 30 ? 'critical' : scoreNum < 55 ? 'low' : 'mid';
      const priority = scoreNum < 30 ? 9          : scoreNum < 55 ? 7    : 5;

      insights.push({
        id:         `score_${domain}_${today}`,
        type,
        priority,
        message:    msgs[level],
        actionable: false,
        source:     'daily_health_score',
        score:      Math.round(scoreNum),
        domain,
      });
    }

    // Screen time check — if user logged >6h screen time today, add a lifestyle reminder
    try {
      const enriched = await enrichLogDataFromDiary(userId, today);
      if (enriched.screen_time_hours != null && enriched.screen_time_hours > 6) {
        const st = enriched.screen_time_hours;
        insights.push({
          id:         `screen_time_${today}`,
          type:       'lifestyle',
          priority:   st > 8 ? 8 : 6,
          message:    `You've logged ${st.toFixed(1)} hours of screen time today. Prolonged screen exposure strains eyes, disrupts melatonin, and elevates cortisol. Try the 20-20-20 rule and set a daily screen limit under 6 hours.`,
          actionable: false,
          source:     'screen_time',
        });
      }
    } catch (_) { /* non-fatal */ }

    // Sort highest priority first
    return insights.sort((a, b) => b.priority - a.priority);
  } catch (err) {
    console.warn('[HealthIntelligence] Score insights error:', err.message);
    return [];  // non-fatal — dashboard still loads without score insights
  }
}

/**
 * AI-generated narrative: 1–5 appreciations for strong domains, 1–5 health hazard
 * predictions with recommendations for weak domains. Uses llmProvider (iSHA → Groq → OpenAI).
 * Non-fatal — returns empty arrays on failure so the dashboard still loads.
 */
async function getAiNarrative(userId, domains, overallScore) {
  try {
    if (!domains || typeof domains !== 'object') return { appreciations: [], hazards: [] };

    // Separate strong (≥ 75) and weak (< 75) domains for the prompt
    const strong = [], weak = [];
    for (const [domain, rawScore] of Object.entries(domains)) {
      const s = typeof rawScore === 'object' ? (rawScore.score ?? rawScore) : rawScore;
      if (s == null) continue;
      const entry = { domain, score: Math.round(s) };
      if (s >= 75) strong.push(entry);
      else         weak.push(entry);
    }

    // Sort: appreciations = top 5 strongest; hazards = up to 5 weakest (worst first)
    strong.sort((a, b) => b.score - a.score);
    weak.sort((a, b) => a.score - b.score);
    const topStrong = strong.slice(0, 5);
    const topWeak   = weak.slice(0, 5);

    if (topStrong.length === 0 && topWeak.length === 0) return { appreciations: [], hazards: [] };

    const domainLabels = {
      activity: 'Physical Activity', nutrition: 'Nutrition', sleep: 'Sleep',
      vitals: 'Vital Signs', medication: 'Medication Adherence',
      hydration: 'Hydration', mental: 'Mental Well-being',
    };

    const prompt = `You are Dr. iSHA, a caring AI health coach for SmartHealth patients.
A patient's daily health score is ${overallScore}/100.

Strong health domains today (score ≥ 75):
${topStrong.map(d => `- ${domainLabels[d.domain] || d.domain}: ${d.score}/100`).join('\n') || 'None'}

Weak health domains today (score < 75):
${topWeak.map(d => `- ${domainLabels[d.domain] || d.domain}: ${d.score}/100`).join('\n') || 'None'}

Respond ONLY with a valid JSON object (no markdown, no extra text) in this exact shape:
{
  "appreciations": [
    { "title": "short praise heading (≤8 words)", "message": "1–2 sentence positive reinforcement (specific, motivating)", "domain": "<domain key>" }
  ],
  "hazards": [
    { "title": "short risk heading (≤8 words)", "prediction": "1 sentence health risk if trend continues", "recommendation": "1–2 sentence actionable advice", "urgency": "low|medium|high", "domain": "<domain key>" }
  ]
}

Rules:
- Generate exactly ${topStrong.length} appreciations (one per strong domain listed, min 1 if any exist)
- Generate exactly ${topWeak.length} hazards (one per weak domain listed, min 1 if any exist)
- Keep tone warm, encouraging, and medically responsible
- Predictions must be realistic (not alarmist) and specific to the domain score
- Recommendations must be actionable within 24 hours
- Do not mention specific numerical scores in the output`;

    const result = await llmProvider.chat({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 900,
      temperature: 0.5,
      cognitiveTier: 'standard',
      skipCache: false,
      // Force JSON output on providers that support it (Groq, OpenAI).
      // SIB ignores this field gracefully; it only affects cloud fallbacks.
      responseFormat: { type: 'json_object' },
    });

    // Robust JSON extraction — LLMs sometimes wrap JSON in prose preamble.
    // Strategy: try direct parse → strip fences → fish for {...} block → give up.
    const raw = typeof result.content === 'string' ? result.content.trim() : JSON.stringify(result.content);
    let parsed = _extractJson(raw);

    const appreciations = (parsed.appreciations || []).slice(0, 5);
    const hazards       = (parsed.hazards       || []).slice(0, 5);

    return { appreciations, hazards };
  } catch (err) {
    console.warn('[HealthIntelligence] AI narrative error (non-fatal):', err.message);
    return { appreciations: [], hazards: [] };
  }
}

/**
 * Extract the first valid JSON object from a string that may contain prose.
 * Handles: plain JSON, markdown-fenced JSON, JSON embedded in conversational text.
 * Throws SyntaxError if no valid JSON object can be found.
 */
function _extractJson(text) {
  // 1. Try direct parse (happy path — LLM returned only JSON)
  try { return JSON.parse(text); } catch (_) { /* fall through */ }

  // 2. Strip markdown code fences and retry
  const stripped = text.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/im, '').trim();
  try { return JSON.parse(stripped); } catch (_) { /* fall through */ }

  // 3. Fish for first {...} block — handles "Here is the JSON:\n{...}" style responses
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch (_) { /* fall through */ }
  }

  throw new SyntaxError(`No valid JSON found in LLM response (first 120 chars): ${text.slice(0, 120)}`);
}


router.get('/', authUser, async (req, res) => {
  try {
    const userId = req.user.id;

    // ── Fetch today's domain scores for AI narrative ─────────────────────────
    const today = new Date().toISOString().split('T')[0];
    let domains = null, overallScore = null;
    try {
      const [scoreRow] = await postgresSequelize.query(
        `SELECT composite_score, activity_score, nutrition_score, sleep_score, vitals_score, medication_score, hydration_score, mental_score
         FROM daily_health_scores WHERE user_id = :userId AND score_date = :today LIMIT 1`,
        { replacements: { userId, today }, type: QueryTypes.SELECT }
      );
      if (scoreRow) {
        overallScore = scoreRow.composite_score;
        domains = {
          activity:   scoreRow.activity_score,
          nutrition:  scoreRow.nutrition_score,
          sleep:      scoreRow.sleep_score,
          vitals:     scoreRow.vitals_score,
          medication: scoreRow.medication_score,
          hydration:  scoreRow.hydration_score,
          mental:     scoreRow.mental_score,
        };
      } else {
        const enriched = await enrichLogDataFromDiary(userId, today);
        const result   = computeDailyScore(enriched, {}, today);
        overallScore   = result.composite_score ?? result.score ?? null;
        domains        = result.domains;
      }
    } catch (_) { /* non-fatal */ }

    // ── Run all three sources in parallel ────────────────────────────────────
    const [reminders, scoreInsights, aiNarrative] = await Promise.all([
      healthReminderService.generateReminders(userId),
      getScoreInsights(userId),
      getAiNarrative(userId, domains, overallScore),
    ]);

    // Merge: score insights appear at the top (sorted by priority), existing reminders follow.
    // De-duplicate: if a reminder for the same domain+type+today already exists, skip the score one.
    const existingIds = new Set(reminders.map(r => r.id));
    const freshInsights = scoreInsights.filter(i => !existingIds.has(i.id));
    const allReminders = [...freshInsights, ...reminders];

    // Organize reminders by type
    const intelligence = {
      user_id: userId,
      generated_at: new Date().toISOString(),
      summary: {
        total_reminders: allReminders.length,
        high_priority: allReminders.filter(r => r.priority >= 8).length,
        actionable: allReminders.filter(r => r.actionable).length,
        overall_score: overallScore,
      },
      // AI-generated appreciations (good domains) and hazard predictions (weak domains)
      appreciations: aiNarrative.appreciations,
      hazards:       aiNarrative.hazards,
      categories: {
        medication: allReminders.filter(r => r.type === 'medication'),
        checkups:   allReminders.filter(r => r.type === 'checkup'),
        lifestyle:  allReminders.filter(r => r.type === 'lifestyle'),
        diet:       allReminders.filter(r => r.type === 'diet'),
        activity:   allReminders.filter(r => r.type === 'activity'),
        vitals:     allReminders.filter(r => r.type === 'vitals'),
        lab_tests:  allReminders.filter(r => r.type === 'lab_test')
      },
      all_reminders: allReminders
    };

    res.json({
      success: true,
      data: intelligence,
      message: 'Dr. iSHA\'s Health Intelligence Dashboard generated successfully'
    });

  } catch (error) {
    console.error('Error generating health intelligence:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate health intelligence dashboard',
      details: error.message
    });
  }
});

/**
 * GET /api/health-intelligence/reminders/:type
 * Get reminders of a specific type
 */
router.get('/reminders/:type', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { type } = req.params;

    const allReminders = await healthReminderService.generateReminders(userId);
    const filteredReminders = allReminders.filter(r => r.type === type);

    res.json({
      success: true,
      data: {
        type,
        count: filteredReminders.length,
        reminders: filteredReminders
      }
    });

  } catch (error) {
    console.error('Error fetching reminders:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch reminders',
      details: error.message
    });
  }
});

/**
 * POST /api/health-intelligence/action
 * Mark a reminder as completed or dismissed
 */
router.post('/action', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { reminder_id, action_type, action_data } = req.body;

    // TODO: Implement action logging in database
    // For now, just acknowledge the action

    res.json({
      success: true,
      message: `Action ${action_type} completed for reminder ${reminder_id}`,
      data: {
        user_id: userId,
        reminder_id,
        action_type,
        action_data,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error processing reminder action:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process reminder action',
      details: error.message
    });
  }
});

export default router;
