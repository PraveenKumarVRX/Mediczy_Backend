/**
 * AI Intelligence API Routes
 * ============================
 * Routes for AI-powered healthcare intelligence features:
 *   - Drug interaction checking
 *   - Insurance AI assistance
 *   - Emergency triage
 *   - Health risk scores
 *   - Smart notifications
 *   - Clinical insights
 *   - Self-learning feedback
 */

import { Router } from 'express';
import pool from '../db/pgPool.js';
import drugInteractionChecker from '../services/ai-drug-interaction.service.js';
import insuranceBotService from '../services/ai-insurance-bot.service.js';
import emergencyTriageService from '../services/ai-emergency-triage.service.js';

const router = Router();

// ─── Auth middleware ────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!req.user || !req.user.id || req.user.id === 'twilio-webhook') {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

// ════════════════════════════════════════════════════════════
//  DRUG INTERACTION CHECKER
// ════════════════════════════════════════════════════════════

/**
 * POST /drug-interactions/check
 * Full interaction check with LLM enhancement
 */
router.post('/drug-interactions/check', requireAuth, async (req, res) => {
  try {
    const { medications, patientId, useLLM = true } = req.body;

    if (!medications || !Array.isArray(medications) || medications.length === 0) {
      return res.status(400).json({ error: 'medications array is required' });
    }

    const result = await drugInteractionChecker.checkInteractions({
      medications,
      patientId: patientId || null,
      useLLM
    });

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[API] Drug interaction check error:', error.message);
    res.status(500).json({ error: 'Interaction check failed', details: error.message });
  }
});

/**
 * POST /drug-interactions/quick-check
 * Fast built-in database only (no LLM, < 10ms)
 */
router.post('/drug-interactions/quick-check', requireAuth, async (req, res) => {
  try {
    const { medications } = req.body;

    if (!medications || !Array.isArray(medications) || medications.length === 0) {
      return res.status(400).json({ error: 'medications array is required' });
    }

    const result = drugInteractionChecker.quickCheck(medications);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: 'Quick check failed', details: error.message });
  }
});

// ════════════════════════════════════════════════════════════
//  INSURANCE AI BOT
// ════════════════════════════════════════════════════════════

/**
 * POST /insurance/query
 * General insurance question
 */
router.post('/insurance/query', requireAuth, async (req, res) => {
  try {
    const { query, insuranceType } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'query is required' });
    }

    const result = await insuranceBotService.query({
      query,
      userId: req.user.id,
      insuranceType: insuranceType || 'health'
    });

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[API] Insurance query error:', error.message);
    res.status(500).json({ error: 'Insurance query failed', details: error.message });
  }
});

/**
 * POST /insurance/pre-auth
 * Pre-authorization check
 */
router.post('/insurance/pre-auth', requireAuth, async (req, res) => {
  try {
    const { procedureName, diagnosisCode, insuranceProvider, policyNumber } = req.body;

    if (!procedureName) {
      return res.status(400).json({ error: 'procedureName is required' });
    }

    const result = await insuranceBotService.checkPreAuth({
      procedureName,
      diagnosisCode,
      insuranceProvider,
      policyNumber,
      userId: req.user.id
    });

    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: 'Pre-auth check failed', details: error.message });
  }
});

/**
 * POST /insurance/coverage
 * Coverage verification
 */
router.post('/insurance/coverage', requireAuth, async (req, res) => {
  try {
    const { treatmentType, estimatedCost, insuranceProvider } = req.body;

    if (!treatmentType) {
      return res.status(400).json({ error: 'treatmentType is required' });
    }

    const result = await insuranceBotService.verifyCoverage({
      treatmentType,
      estimatedCost,
      insuranceProvider,
      userId: req.user.id
    });

    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: 'Coverage check failed', details: error.message });
  }
});

/**
 * GET /insurance/health
 * Insurance bot health check (GPU model status)
 */
router.get('/insurance/health', async (req, res) => {
  const available = await insuranceBotService.checkHealth();
  res.json({ success: true, gpuModelAvailable: available, model: 'OpenInsurance-LLaMA3-8B', port: 8083 });
});

// ════════════════════════════════════════════════════════════
//  EMERGENCY TRIAGE
// ════════════════════════════════════════════════════════════

/**
 * POST /triage/assess
 * ESI 5-Level emergency triage assessment
 */
router.post('/triage/assess', requireAuth, async (req, res) => {
  try {
    const { symptoms, vitals, painScale, age, gender, patientId } = req.body;

    if (!symptoms || typeof symptoms !== 'string') {
      return res.status(400).json({ error: 'symptoms description is required' });
    }

    const result = await emergencyTriageService.triage({
      symptoms,
      vitals: vitals || {},
      painScale: painScale != null ? parseInt(painScale) : null,
      age: age != null ? parseInt(age) : null,
      gender,
      patientId: patientId || null
    });

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[API] Triage error:', error.message);
    res.status(500).json({ error: 'Triage assessment failed', details: error.message });
  }
});

// ════════════════════════════════════════════════════════════
//  HEALTH RISK SCORES
// ════════════════════════════════════════════════════════════

/**
 * GET /risk-score/me
 * Get current user's health risk score
 */
router.get('/risk-score/me', requireAuth, async (req, res) => {
  try {
    const db = pool;
    const { rows } = await db.query(`
      SELECT hrs.* FROM ai_health_risk_scores hrs
      JOIN patients p ON p.id = hrs.patient_id
      WHERE p."userId" = $1
      ORDER BY hrs.updated_at DESC
      LIMIT 1
    `, [req.user.id]);

    if (rows.length === 0) {
      return res.json({ success: true, score: null, message: 'Risk score not yet calculated. Check back in a few hours.' });
    }

    res.json({ success: true, score: rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve risk score' });
  }
});

/**
 * GET /risk-score/:patientId
 * Get specific patient's risk score (doctors only)
 */
router.get('/risk-score/:patientId', requireAuth, async (req, res) => {
  try {
    const patientId = parseInt(req.params.patientId, 10);
    if (Number.isNaN(patientId)) {
      return res.status(400).json({ error: 'Invalid patientId' });
    }

    // Authorization (IDOR fix): a patient may only read their own risk score;
    // clinicians/admins may read any. Previously any authenticated user could
    // read any patient's score by id.
    const role = String(req.user?.role || req.userRole || '').toLowerCase();
    const clinicianRoles = ['doctor', 'nurse', 'assistant', 'admin', 'super_admin', 'medical_director', 'hospital'];
    const isSelf = Number(req.user?.id) === patientId;
    if (!isSelf && !clinicianRoles.includes(role)) {
      return res.status(403).json({ error: "Not authorized to view this patient's risk score" });
    }

    const db = pool;
    const { rows } = await db.query(`
      SELECT * FROM ai_health_risk_scores
      WHERE patient_id = $1
      ORDER BY updated_at DESC LIMIT 1
    `, [patientId]);

    if (rows.length === 0) {
      return res.json({ success: true, score: null });
    }

    res.json({ success: true, score: rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve risk score' });
  }
});

// ════════════════════════════════════════════════════════════
//  SMART NOTIFICATIONS
// ════════════════════════════════════════════════════════════

/**
 * GET /notifications/smart
 * Get user's AI-generated notifications
 */
router.get('/notifications/smart', requireAuth, async (req, res) => {
  try {
    const db = pool;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status || null;

    let query = `
      SELECT * FROM ai_smart_notifications
      WHERE user_id = $1
    `;
    const params = [req.user.id];

    if (status) {
      query += ` AND status = $2`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const { rows } = await db.query(query, params);
    res.json({ success: true, notifications: rows, count: rows.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve notifications' });
  }
});

/**
 * PATCH /notifications/smart/:id/read
 * Mark notification as read
 */
router.patch('/notifications/smart/:id/read', requireAuth, async (req, res) => {
  try {
    const db = pool;
    await db.query(`
      UPDATE ai_smart_notifications 
      SET status = 'read', read_at = NOW()
      WHERE id = $1 AND user_id = $2
    `, [parseInt(req.params.id), req.user.id]);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark notification' });
  }
});

// ════════════════════════════════════════════════════════════
//  CLINICAL INSIGHTS
// ════════════════════════════════════════════════════════════

/**
 * GET /insights/patient/:patientId
 * Get clinical insights for a patient
 */
router.get('/insights/patient/:patientId', requireAuth, async (req, res) => {
  try {
    const db = pool;
    const { rows } = await db.query(`
      SELECT * FROM ai_clinical_insights
      WHERE target_type = 'patient' AND target_id = $1
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY 
        CASE severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
        created_at DESC
      LIMIT 50
    `, [parseInt(req.params.patientId)]);

    res.json({ success: true, insights: rows, count: rows.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve insights' });
  }
});

/**
 * GET /insights/system
 * Get system-wide clinical insights (admin/doctor)
 */
router.get('/insights/system', requireAuth, async (req, res) => {
  try {
    const db = pool;
    const { rows } = await db.query(`
      SELECT * FROM ai_clinical_insights
      WHERE target_type = 'system'
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY created_at DESC
      LIMIT 20
    `);

    res.json({ success: true, insights: rows, count: rows.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve system insights' });
  }
});

/**
 * PATCH /insights/:id/action
 * Mark insight as actioned
 */
router.patch('/insights/:id/action', requireAuth, async (req, res) => {
  try {
    const db = pool;
    await db.query(`
      UPDATE ai_clinical_insights SET action_taken = true WHERE id = $1
    `, [parseInt(req.params.id)]);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update insight' });
  }
});

// ════════════════════════════════════════════════════════════
//  SELF-LEARNING FEEDBACK
// ════════════════════════════════════════════════════════════

/**
 * POST /feedback
 * Submit feedback for an AI conversation
 */
router.post('/feedback', requireAuth, async (req, res) => {
  try {
    const { conversationId, thumbs, rating, comment } = req.body;

    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId is required' });
    }

    const { default: selfLearningPipeline } = await import('../services/ai-self-learning-pipeline.service.js');
    await selfLearningPipeline.recordFeedback(conversationId, {
      thumbs: thumbs || null,
      rating: rating || null,
      comment: comment || null
    });

    res.json({ success: true, message: 'Feedback recorded' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to record feedback' });
  }
});

/**
 * GET /learning/insights
 * Get learning insights (admin)
 */
router.get('/learning/insights', requireAuth, async (req, res) => {
  try {
    const db = pool;
    const { rows } = await db.query(`
      SELECT * FROM sib_learning_insights
      ORDER BY created_at DESC
      LIMIT 50
    `);

    res.json({ success: true, insights: rows, count: rows.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve learning insights' });
  }
});

/**
 * GET /learning/quality
 * Get response quality metrics (admin)
 */
router.get('/learning/quality', requireAuth, async (req, res) => {
  try {
    const db = pool;
    const { rows } = await db.query(`
      SELECT 
        COUNT(*) as total_responses,
        ROUND(AVG(relevance_score)::numeric, 3) as avg_relevance,
        ROUND(AVG(coherence_score)::numeric, 3) as avg_coherence,
        ROUND(AVG(medical_accuracy_score)::numeric, 3) as avg_accuracy,
        ROUND(AVG(empathy_score)::numeric, 3) as avg_empathy,
        COUNT(CASE WHEN user_thumbs = 'up' THEN 1 END) as thumbs_up,
        COUNT(CASE WHEN user_thumbs = 'down' THEN 1 END) as thumbs_down,
        ROUND(AVG(CASE WHEN user_rating IS NOT NULL THEN user_rating END)::numeric, 2) as avg_rating
      FROM sib_response_quality
      WHERE created_at > NOW() - INTERVAL '30 days'
    `);

    res.json({ success: true, metrics: rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve quality metrics' });
  }
});

// ════════════════════════════════════════════════════════════
//  AI INTELLIGENCE HEALTH
// ════════════════════════════════════════════════════════════

/**
 * GET /health
 * Overall AI intelligence services health check
 */
router.get('/health', async (req, res) => {
  const db = pool;

  const [riskScores, notifications, insights, qualityLogs] = await Promise.all([
    db.query('SELECT COUNT(*) as count FROM ai_health_risk_scores').then(r => r.rows[0].count).catch(() => 0),
    db.query('SELECT COUNT(*) as count FROM ai_smart_notifications').then(r => r.rows[0].count).catch(() => 0),
    db.query('SELECT COUNT(*) as count FROM ai_clinical_insights').then(r => r.rows[0].count).catch(() => 0),
    db.query('SELECT COUNT(*) as count FROM sib_response_quality').then(r => r.rows[0].count).catch(() => 0),
  ]);

  res.json({
    success: true,
    status: 'operational',
    services: {
      drugInteractionChecker: 'active',
      insuranceBot: 'active',
      emergencyTriage: 'active',
      healthRiskScoring: 'active',
      smartNotifications: 'active',
      clinicalInsights: 'active',
      selfLearningPipeline: 'active'
    },
    tablePopulation: {
      ai_health_risk_scores: parseInt(riskScores),
      ai_smart_notifications: parseInt(notifications),
      ai_clinical_insights: parseInt(insights),
      sib_response_quality: parseInt(qualityLogs)
    },
    timestamp: new Date().toISOString()
  });
});

export default router;
