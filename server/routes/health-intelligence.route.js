import express from 'express';
import authUser from '../middleware/auth.js';
import healthReminderService from '../services/healthReminder.service.js';
import postgresSequelize from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';
import { currentDailyScore } from '../services/daily-health-score.service.js';


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
async function loadDailyContext(userId) {
  const result = await currentDailyScore(userId);
  return { today: result.date, domains: Object.fromEntries(Object.entries(result.domains).filter(([, score]) => score !== null)), score: result.score };
}

function getScoreInsights(domains, today) {
  return Object.entries(domains).flatMap(([domain, score]) => {
    if (!Number.isFinite(Number(score)) || Number(score) >= 75 || !DOMAIN_MESSAGES[domain]) return [];
    const level = score < 30 ? 'critical' : score < 55 ? 'low' : 'mid';
    return [{ id: `score_${domain}_${today}`, type: DOMAIN_TYPE[domain], priority: score < 30 ? 9 : score < 55 ? 7 : 5,
      message: DOMAIN_MESSAGES[domain][level], actionable: false, source: 'daily_health_score', score: Math.round(score), domain }];
  });
}

// Derive observations only from measured domains. Missing domains never generate praise or risk claims.
function getAiNarrative(domains, insights) {
  const appreciations = Object.entries(domains).filter(([, score]) => score >= 75).map(([domain, score]) => ({
    domain, title: `${domain.charAt(0).toUpperCase() + domain.slice(1)} tracking`,
    message: `Your recorded ${domain} data scored ${Math.round(score)}/100 today. This is a wellness indicator, not a clinical assessment.`,
  }));
  const hazards = insights.map(insight => ({
    domain: insight.domain, title: `${insight.domain.charAt(0).toUpperCase() + insight.domain.slice(1)} needs attention`,
    prediction: insight.message, recommendation: 'Review the recorded data and discuss persistent concerns with your doctor.',
    urgency: insight.priority >= 9 ? 'high' : insight.priority >= 7 ? 'medium' : 'low',
    confidence: 'Limited — based on recorded data, not a validated disease probability',
    reason: `Recorded ${insight.domain} data produced a wellness domain score of ${insight.score}/100.`,
    source: 'Your health diary, daily activity log and synced readings',
  }));
  return { appreciations, hazards };
}


router.get('/', authUser, async (req, res) => {
  try {
    const userId = req.user.id;

    const context = await loadDailyContext(userId);
    const domains = context.domains;
    const overallScore = context.score;
    const scoreInsights = getScoreInsights(domains, context.today);
    const aiNarrative = getAiNarrative(domains, scoreInsights);
    const domainTypes = new Set(Object.keys(domains).map(key => DOMAIN_TYPE[key]));
    const reminders = (await healthReminderService.generateReminders(userId)).filter(reminder => reminder.type === 'medication' || !domainTypes.has(reminder.type));

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
