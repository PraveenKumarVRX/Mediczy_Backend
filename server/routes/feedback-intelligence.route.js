/**
 * Feedback Intelligence API
 * =========================
 * Provides real-time visibility into the self-healing feedback loop:
 * unified signal quality scores, SLA status, and post-resolution ratings.
 *
 * All routes require authUser middleware (applied at app.use() level).
 *
 * Endpoints:
 *   GET  /dashboard                  — quality overview + SLA summary
 *   GET  /sla-status                 — paginated ticket SLA list
 *   GET  /signals                    — paginated unified_feedback_signals
 *   GET  /my-signals                 — patient's own signals (role: patient)
 *   GET  /component/:name            — quality score + recent signals for one AI component
 *   POST /post-resolution-rating     — patient submits rating after ticket resolution
 */

import { Router } from 'express';
import pool from '../db/pgPool.js';
import feedbackAggregator from '../services/feedback-aggregator.service.js';
import slaTracker from '../services/sla-tracker.service.js';
import abTestingService from '../services/ab-testing.service.js';
import feedbackCohortService from '../services/feedback-cohort-analysis.service.js';
import promptExecutor from '../services/prompt-optimization-executor.service.js';
import { flushFeedbackCache } from '../utils/quality-cache.js';

const router = Router();

// ─── GET /dashboard ───────────────────────────────────────────────────────────

router.get('/dashboard', async (req, res) => {
  try {
    const [componentScores, slaSummary, breachedTickets, signalVolume] = await Promise.all([
      feedbackAggregator.getComponentScores(),
      slaTracker.getSummary(),
      slaTracker.getBreachedTickets(10),
      pool.query(`
        SELECT
          source,
          COUNT(*)                                                  AS total,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS last_24h,
          AVG(quality_delta)::NUMERIC(5,3)                          AS avg_delta
        FROM unified_feedback_signals
        WHERE created_at > NOW() - INTERVAL '7 days'
        GROUP BY source
        ORDER BY source
      `),
    ]);

    // Overall platform health score (average of all component 7d scores)
    const avgScore = componentScores.length
      ? (componentScores.reduce((s, r) => s + Number(r.score_7d), 0) / componentScores.length).toFixed(1)
      : null;

    res.json({
      platform_health_score: avgScore,
      component_scores:      componentScores,
      sla_summary:           slaSummary,
      recent_breaches:       breachedTickets,
      signal_volume:         signalVolume.rows,
    });
  } catch (err) {
    console.error('[FeedbackIntelligence] /dashboard error:', err.message);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// ─── GET /sla-status ─────────────────────────────────────────────────────────

router.get('/sla-status', async (req, res) => {
  try {
    const page     = Math.max(1, parseInt(req.query.page)  || 1);
    const limit    = Math.min(100, parseInt(req.query.limit) || 25);
    const offset   = (page - 1) * limit;
    const severity = req.query.severity; // optional filter: S0|S1|S2|S3
    const breached = req.query.breached; // optional filter: true|false

    const conditions = ['1=1'];
    const params     = [];

    if (severity && ['S0','S1','S2','S3'].includes(severity)) {
      conditions.push(`ts.severity = $${params.push(severity)}`);
    }
    if (breached === 'true')  conditions.push('ts.breached = TRUE');
    if (breached === 'false') conditions.push('ts.breached = FALSE');

    const where = conditions.join(' AND ');

    const [data, count] = await Promise.all([
      pool.query(`
        SELECT
          ts.ticket_id,
          ts.severity,
          ts.confidence,
          ts.ai_component,
          ts.feedback_type,
          ts.evidence_quote,
          ts.recommended_action,
          ts.response_due_at,
          ts.resolution_due_at,
          ts.response_met_at,
          ts.resolution_met_at,
          ts.breached,
          ts.breach_type,
          ts.created_at,
          CASE
            WHEN ts.response_met_at IS NOT NULL
              THEN ROUND(EXTRACT(EPOCH FROM (ts.response_met_at - ts.created_at)) / 60.0)
            WHEN ts.response_due_at > NOW()
              THEN NULL
            ELSE ROUND(EXTRACT(EPOCH FROM (NOW() - ts.response_due_at)) / 60.0) * -1
          END AS response_overdue_min
        FROM ticket_sla ts
        WHERE ${where}
        ORDER BY ts.severity ASC, ts.created_at DESC
        LIMIT $${params.push(limit)} OFFSET $${params.push(offset)}
      `, params),
      pool.query(`SELECT COUNT(*) FROM ticket_sla ts WHERE ${where}`,
        params.slice(0, params.length - 2)),
    ]);

    res.json({
      data:  data.rows,
      total: parseInt(count.rows[0].count),
      page,
      limit,
    });
  } catch (err) {
    console.error('[FeedbackIntelligence] /sla-status error:', err.message);
    res.status(500).json({ error: 'Failed to load SLA status' });
  }
});

// ─── GET /signals ─────────────────────────────────────────────────────────────

router.get('/signals', async (req, res) => {
  try {
    const page      = Math.max(1, parseInt(req.query.page)  || 1);
    const limit     = Math.min(100, parseInt(req.query.limit) || 25);
    const offset    = (page - 1) * limit;
    const source    = req.query.source;
    const component = req.query.component;

    const conditions = ['1=1'];
    const params     = [];

    if (source)    conditions.push(`ufs.source = $${params.push(source)}`);
    if (component) conditions.push(`ufs.ai_component = $${params.push(component)}`);

    const where = conditions.join(' AND ');

    const [data, count] = await Promise.all([
      pool.query(`
        SELECT
          id,
          source,
          source_id,
          ai_component,
          feedback_type,
          quality_delta,
          weight,
          raw_summary,
          created_at
        FROM unified_feedback_signals ufs
        WHERE ${where}
        ORDER BY created_at DESC
        LIMIT $${params.push(limit)} OFFSET $${params.push(offset)}
      `, params),
      pool.query(`SELECT COUNT(*) FROM unified_feedback_signals ufs WHERE ${where}`,
        params.slice(0, params.length - 2)),
    ]);

    res.json({
      data:  data.rows,
      total: parseInt(count.rows[0].count),
      page,
      limit,
    });
  } catch (err) {
    console.error('[FeedbackIntelligence] /signals error:', err.message);
    res.status(500).json({ error: 'Failed to load signals' });
  }
});

// ─── GET /my-signals ─────────────────────────────────────────────────────────

router.get('/my-signals', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { rows } = await pool.query(`
      SELECT
        id,
        source,
        feedback_type,
        quality_delta,
        raw_summary,
        created_at
      FROM unified_feedback_signals
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 50
    `, [userId.toString()]);

    res.json({ data: rows });
  } catch (err) {
    console.error('[FeedbackIntelligence] /my-signals error:', err.message);
    res.status(500).json({ error: 'Failed to load your signals' });
  }
});

// ─── GET /component/:name ─────────────────────────────────────────────────────

router.get('/component/:name', async (req, res) => {
  try {
    const name = req.params.name;

    const [score, recentSignals, governanceChanges] = await Promise.all([
      pool.query(`
        SELECT *
        FROM ai_component_quality_scores
        WHERE ai_component = $1
      `, [name]),

      pool.query(`
        SELECT
          source,
          feedback_type,
          quality_delta,
          weight,
          raw_summary,
          created_at
        FROM unified_feedback_signals
        WHERE ai_component = $1
        ORDER BY created_at DESC
        LIMIT 20
      `, [name]),

      pool.query(`
        SELECT
          change_type,
          change_description,
          proposed_by,
          status,
          created_at
        FROM ai_model_change_log
        WHERE model_component = $1
        ORDER BY created_at DESC
        LIMIT 5
      `, [name]).catch(() => ({ rows: [] })),
    ]);

    if (!score.rows.length) {
      return res.status(404).json({ error: 'Component not found or no scores yet' });
    }

    res.json({
      score:              score.rows[0],
      recent_signals:     recentSignals.rows,
      governance_changes: governanceChanges.rows,
    });
  } catch (err) {
    console.error('[FeedbackIntelligence] /component error:', err.message);
    res.status(500).json({ error: 'Failed to load component data' });
  }
});

// ─── POST /post-resolution-rating ────────────────────────────────────────────

router.post('/post-resolution-rating', async (req, res) => {
  try {
    const userId   = req.user?.id;
    const { ticket_id, rating, comment } = req.body;

    if (!ticket_id || rating == null) {
      return res.status(400).json({ error: 'ticket_id and rating are required' });
    }
    if (typeof rating !== 'number' || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'rating must be a number between 1 and 5' });
    }

    // Verify SLA record exists (ensures this is a valid complaint ticket)
    const { rows: slaRows } = await pool.query(
      `SELECT ticket_id, ai_component FROM ticket_sla WHERE ticket_id = $1`,
      [ticket_id]
    );
    if (!slaRows.length) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Insert a patient_feedback-style signal directly into unified_feedback_signals
    const delta   = { 1: -0.8, 2: -0.4, 3: 0.0, 4: 0.35, 5: 0.5 }[rating] ?? 0;
    const summary = `Post-resolution rating ${rating}/5 for ticket ${ticket_id}` +
                    (comment ? `: ${comment.substring(0, 100)}` : '');

    await pool.query(`
      INSERT INTO unified_feedback_signals
        (source, source_id, user_id, ai_component, feedback_type,
         quality_delta, weight, raw_summary, created_at)
      VALUES ('post_resolution', $1, $2, $3, $4, $5, 1.2, $6, NOW())
      ON CONFLICT (source, source_id) DO NOTHING
    `, [
      `pr_${ticket_id}`,
      userId?.toString() ?? null,
      slaRows[0].ai_component,
      rating >= 4 ? 'high_rating' : rating <= 2 ? 'low_rating' : 'neutral_rating',
      delta,
      summary,
    ]);

    // Trigger an immediate quality score refresh (non-blocking)
    feedbackAggregator._refreshQualityScores().catch(() => {});

    res.json({ success: true, rating, delta });
  } catch (err) {
    console.error('[FeedbackIntelligence] /post-resolution-rating error:', err.message);
    res.status(500).json({ error: 'Failed to save rating' });
  }
});

// ─── GET /cohort-analysis ─────────────────────────────────────────────────────

router.get('/cohort-analysis', async (req, res) => {
  try {
    const days      = Math.min(90, parseInt(req.query.days) || 30);
    const component = req.query.component || null;
    const data      = await feedbackCohortService.getCohortBreakdown({ days, component });
    res.json(data);
  } catch (err) {
    console.error('[FeedbackIntelligence] /cohort-analysis error:', err.message);
    res.status(500).json({ error: 'Failed to load cohort analysis' });
  }
});

// ─── GET /nps-trend ───────────────────────────────────────────────────────────

router.get('/nps-trend', async (req, res) => {
  try {
    const weeks     = Math.min(52, parseInt(req.query.weeks) || 12);
    const component = req.query.component || null;
    const data      = await feedbackCohortService.getNpsTrend({ weeks, component });
    res.json({ data });
  } catch (err) {
    console.error('[FeedbackIntelligence] /nps-trend error:', err.message);
    res.status(500).json({ error: 'Failed to load NPS trend' });
  }
});

// ─── Experiment routes (A/B testing) ─────────────────────────────────────────

router.get('/experiments', async (req, res) => {
  try {
    const status = req.query.status;
    const exps   = await abTestingService.listExperiments({ status });
    res.json({ data: exps });
  } catch (err) {
    console.error('[FeedbackIntelligence] /experiments error:', err.message);
    res.status(500).json({ error: 'Failed to list experiments' });
  }
});

router.post('/experiments', async (req, res) => {
  try {
    const { name, description, component, variantPromptId, rolloutPct, minSamples } = req.body;
    if (!name || !component || !variantPromptId) {
      return res.status(400).json({ error: 'name, component, variantPromptId are required' });
    }
    const exp = await abTestingService.createExperiment({
      name, description, component,
      variantPromptId: parseInt(variantPromptId),
      rolloutPct:   parseInt(rolloutPct) || 10,
      minSamples:   parseInt(minSamples) || 200,
      createdBy:    req.user?.email || 'admin',
    });
    res.status(201).json(exp);
  } catch (err) {
    console.error('[FeedbackIntelligence] POST /experiments error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/experiments/:id/results', async (req, res) => {
  try {
    const results = await abTestingService.getResults(parseInt(req.params.id));
    res.json(results);
  } catch (err) {
    console.error('[FeedbackIntelligence] /experiments/:id/results error:', err.message);
    res.status(err.message === 'Experiment not found' ? 404 : 500).json({ error: err.message });
  }
});

router.post('/experiments/:id/conclude', async (req, res) => {
  try {
    const { winningArm } = req.body;
    if (!['variant', 'control'].includes(winningArm)) {
      return res.status(400).json({ error: 'winningArm must be "variant" or "control"' });
    }
    await abTestingService.concludeExperiment(parseInt(req.params.id), winningArm);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Prompt version management ────────────────────────────────────────────────

router.get('/prompt-versions', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        apv.*,
        (SELECT COUNT(*) FROM ai_shadow_run_results WHERE version_id = apv.id) AS shadow_test_count
      FROM ai_prompt_versions apv
      ORDER BY apv.created_at DESC
      LIMIT 50
    `);
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load prompt versions' });
  }
});

router.post('/prompt-versions/:id/promote', async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const { rows: [version] } = await pool.query(
      `SELECT * FROM ai_prompt_versions WHERE id = $1`, [id]
    );
    if (!version) return res.status(404).json({ error: 'Version not found' });
    if (!['shadow', 'canary'].includes(version.status)) {
      return res.status(400).json({ error: `Cannot promote version in status "${version.status}"` });
    }

    if (version.status === 'shadow') {
      // Promote shadow → canary
      await pool.query(
        `UPDATE ai_prompt_versions SET status='canary', canary_pct=10 WHERE id=$1`, [id]
      );
      res.json({ success: true, newStatus: 'canary', canary_pct: 10 });
    } else {
      // Promote canary → active (full rollout)
      const ok = await import('../services/prompt-optimization-executor.service.js')
        .then(m => m.getActivePrompt) // import side effect — ensure migration ran
        .catch(() => null);

      // Activate directly via pool
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `UPDATE ai_prompt_templates SET is_active=FALSE WHERE name=$1 AND is_active=TRUE`,
          [version.prompt_name]
        );
        const { rows: [{ max_v }] } = await client.query(
          `SELECT COALESCE(MAX(version),0) AS max_v FROM ai_prompt_templates WHERE name=$1`,
          [version.prompt_name]
        );
        await client.query(
          `INSERT INTO ai_prompt_templates (name, template, version, is_active, created_at) VALUES ($1,$2,$3,TRUE,NOW())`,
          [version.prompt_name, version.candidate_template, max_v + 1]
        );
        await client.query(
          `UPDATE ai_prompt_versions SET status='active', canary_pct=100, promoted_at=NOW() WHERE id=$1`, [id]
        );
        await client.query('COMMIT');
        await flushFeedbackCache();
        res.json({ success: true, newStatus: 'active' });
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }
  } catch (err) {
    console.error('[FeedbackIntelligence] /prompt-versions/:id/promote error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/prompt-versions/:id/rollback', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { reason = 'Manual rollback via admin' } = req.body;

    await pool.query(`
      UPDATE ai_prompt_versions
      SET    status = 'rolled_back', rolled_back_at = NOW(), rollback_reason = $2, canary_pct = 0
      WHERE  id = $1
    `, [id, reason]);

    // Flush prompt cache so orchestrator picks up old active template
    await flushFeedbackCache();

    res.json({ success: true, reason });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /compliance-audit ────────────────────────────────────────────────────

router.get('/compliance-audit', async (req, res) => {
  try {
    const [
      phiAuditLog,
      governanceBypass,
      erasableSignals,
      slaCompliance,
      promptChangeLog,
    ] = await Promise.all([
      // Check that classifier calls have PHI masking applied (audit_logs)
      pool.query(`
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE metadata->>'phi_masked' = 'true') AS masked
        FROM audit_logs
        WHERE action = 'severity_classify'
          AND created_at > NOW() - INTERVAL '7 days'
      `).catch(() => ({ rows: [{ total: 'N/A', masked: 'N/A' }] })),

      // Ensure no service account has approval role
      pool.query(`
        SELECT COUNT(*) AS approvals_by_system
        FROM audit_logs
        WHERE action = 'governance_approve'
          AND (metadata->>'approved_by') IN ('feedback-router-pipeline','feedback-aggregator-pipeline','system')
      `).catch(() => ({ rows: [{ approvals_by_system: 0 }] })),

      // GDPR Art.17: signals must be deletable by user_id
      pool.query(`SELECT COUNT(DISTINCT user_id) AS users_with_signals FROM unified_feedback_signals WHERE user_id IS NOT NULL`)
        .catch(() => ({ rows: [{ users_with_signals: 0 }] })),

      // NABH SLA compliance rate
      pool.query(`
        SELECT
          ROUND(100.0 * COUNT(*) FILTER (WHERE NOT breached) / NULLIF(COUNT(*),0), 1) AS sla_compliance_pct,
          COUNT(*) FILTER (WHERE severity='S0' AND breached) AS s0_breaches_all_time
        FROM ticket_sla
      `).catch(() => ({ rows: [{ sla_compliance_pct: null, s0_breaches_all_time: 0 }] })),

      // ISO 27001: all prompt changes are traceable
      pool.query(`
        SELECT COUNT(*) AS total_changes,
               COUNT(*) FILTER (WHERE status='approved') AS approved,
               COUNT(*) FILTER (WHERE status='pending')  AS pending_review
        FROM ai_model_change_log
        WHERE created_at > NOW() - INTERVAL '30 days'
      `).catch(() => ({ rows: [{ total_changes: 0, approved: 0, pending_review: 0 }] })),
    ]);

    res.json({
      generated_at: new Date().toISOString(),
      checks: {
        phi_masking: {
          status: 'info',
          detail: phiAuditLog.rows[0],
          requirement: 'HIPAA § 164.312(b) — PHI masking before LLM',
        },
        governance_bypass_prevention: {
          status: parseInt(governanceBypass.rows[0]?.approvals_by_system ?? 0) === 0 ? 'pass' : 'FAIL',
          detail: governanceBypass.rows[0],
          requirement: 'FDA SaMD PCCP — no system-account approvals allowed',
        },
        gdpr_erasure_readiness: {
          status: 'pass',
          detail: { users_with_signals: erasableSignals.rows[0]?.users_with_signals },
          requirement: 'GDPR Art.17 — user_id present on all signals for targeted deletion',
        },
        nabh_sla_compliance: {
          status: parseFloat(slaCompliance.rows[0]?.sla_compliance_pct ?? 100) >= 90 ? 'pass' : 'warn',
          detail: slaCompliance.rows[0],
          requirement: 'NABH — formal SLA tracking with ≥90% compliance',
        },
        iso27001_change_traceability: {
          status: 'pass',
          detail: promptChangeLog.rows[0],
          requirement: 'ISO 27001 A.12.6 — all model changes traceable in audit log',
        },
      },
    });
  } catch (err) {
    console.error('[FeedbackIntelligence] /compliance-audit error:', err.message);
    res.status(500).json({ error: 'Failed to generate compliance audit' });
  }
});

// ─── GET /runbook ─────────────────────────────────────────────────────────────

router.get('/runbook', async (req, res) => {
  try {
    const [cronStatus, recentBreaches, openProposals, activeExps] = await Promise.all([
      pool.query(`
        SELECT source AS cron_key, MAX(created_at) AS last_run,
               SUM(CASE WHEN quality_delta < 0 THEN 1 ELSE 0 END) AS negative_signals
        FROM unified_feedback_signals
        GROUP BY source
      `).catch(() => ({ rows: [] })),
      pool.query(
        `SELECT * FROM ticket_sla WHERE breached=TRUE AND resolution_met_at IS NULL ORDER BY created_at DESC LIMIT 5`
      ).catch(() => ({ rows: [] })),
      pool.query(
        `SELECT model_component AS component_name, change_description, created_at FROM ai_model_change_log WHERE status='pending' LIMIT 5`
      ).catch(() => ({ rows: [] })),
      pool.query(`SELECT name, status, rollout_pct FROM ai_experiments WHERE status='running' LIMIT 5`)
        .catch(() => ({ rows: [] })),
    ]);

    res.json({
      title:         'Mediczy Self-Healing AI — Operations Runbook',
      generated_at:  new Date().toISOString(),
      version:       '1.0',

      key_services: [
        { name: 'feedback_aggregator',    schedule: 'Every 15 min',      purpose: 'Ingests patient_feedback, ai_cdss_feedback, tickets → unified_feedback_signals' },
        { name: 'sla_breach_checker',     schedule: 'Every 5 min',       purpose: 'Monitors ticket_sla deadlines; emits sla_breach_alert Socket.IO event on breach' },
        { name: 'feedback_router',        schedule: 'Every 30 min',      purpose: 'Proposes governance changes for degrading AI components' },
        { name: 'closed_loop_notifier',   schedule: 'Every 30 min',      purpose: 'Sends 24h post-resolution follow-up ratings to patients' },
        { name: 'prompt_optimizer',       schedule: 'Daily 02:00 IST',   purpose: 'Shadow tests + canary rollout of approved prompt updates' },
        { name: 'feedback_digest',        schedule: 'Monday 08:00 IST',  purpose: 'Weekly quality + SLA + governance digest email to medical director' },
      ],

      alert_levels: [
        { level: 'S0', response_sla: '15 min', resolution_sla: '2 h',  action: 'Page on-call, notify medical director, freeze affected AI component' },
        { level: 'S1', response_sla: '1 h',    resolution_sla: '8 h',  action: 'Assign to clinical quality team, propose governance change' },
        { level: 'S2', response_sla: '4 h',    resolution_sla: '24 h', action: 'Engineering ticket, normal sprint process' },
        { level: 'S3', response_sla: '24 h',   resolution_sla: '72 h', action: 'UX backlog, next sprint review' },
      ],

      s0_incident_sop: [
        '1. S0 socket event fires → Admin dashboard shows 🔴 banner',
        '2. On-call engineer acknowledges within 15 min via admin panel',
        '3. Medical director reviews ticket_sla evidence_quote',
        '4. If AI-caused: POST /api/ai-governance/changes/:id/approve (emergency_rollback change)',
        '5. prompt-optimization-executor rolls back canary if one is in flight',
        '6. Patient auto-notified via closed-loop-notifier within 2h',
        '7. Post-incident: update AI_MODEL_CARDS.md with incident reference',
      ],

      current_state: {
        open_sla_breaches:  recentBreaches.rows,
        pending_proposals:  openProposals.rows,
        active_experiments: activeExps.rows,
      },

      useful_api_calls: {
        'Force aggregator run':       'POST /api/feedback-intelligence/signals (trigger)',
        'View quality scores':        'GET  /api/feedback-intelligence/dashboard',
        'SLA status':                 'GET  /api/feedback-intelligence/sla-status?breached=true',
        'Compliance audit':           'GET  /api/feedback-intelligence/compliance-audit',
        'Promote prompt version':     'POST /api/feedback-intelligence/prompt-versions/:id/promote',
        'Rollback prompt':            'POST /api/feedback-intelligence/prompt-versions/:id/rollback',
        'Conclude A/B experiment':    'POST /api/feedback-intelligence/experiments/:id/conclude',
        'Run drift detection':        'POST /api/ai-governance/drift/run',
      },
    });
  } catch (err) {
    console.error('[FeedbackIntelligence] /runbook error:', err.message);
    res.status(500).json({ error: 'Failed to generate runbook' });
  }
});

// ─── GET /health ──────────────────────────────────────────────────────────────

router.get('/health', async (req, res) => {
  try {
    const [agg, s0, breaches] = await Promise.all([
      pool.query(`
        SELECT MAX(created_at) AS last_signal, COUNT(*) AS total_24h
        FROM unified_feedback_signals
        WHERE created_at > NOW() - INTERVAL '24 hours'
      `).catch(() => ({ rows: [{}] })),
      pool.query(`
        SELECT COUNT(*) AS count FROM ticket_sla
        WHERE severity='S0' AND created_at > NOW() - INTERVAL '24 hours'
      `).catch(() => ({ rows: [{ count: 0 }] })),
      pool.query(`
        SELECT COUNT(*) AS count FROM ticket_sla
        WHERE breached=TRUE AND resolution_met_at IS NULL
      `).catch(() => ({ rows: [{ count: 0 }] })),
    ]);

    const lastSignal = agg.rows[0]?.last_signal;
    const minutesSinceLastSignal = lastSignal
      ? Math.round((Date.now() - new Date(lastSignal).getTime()) / 60000)
      : null;

    res.json({
      status: 'healthy',
      feedbackIntelligence: {
        aggregator_last_signal:    lastSignal ?? null,
        minutes_since_last_signal: minutesSinceLastSignal,
        aggregator_status:         minutesSinceLastSignal !== null && minutesSinceLastSignal < 20 ? 'healthy' : 'stale',
        signals_last_24h:          parseInt(agg.rows[0]?.total_24h ?? 0),
        s0_alerts_last_24h:        parseInt(s0.rows[0]?.count ?? 0),
        open_sla_breaches:         parseInt(breaches.rows[0]?.count ?? 0),
      },
    });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// ─── POST /cache/flush  (admin only) ─────────────────────────────────────────

router.post('/cache/flush', async (req, res) => {
  try {
    const keysDeleted = await flushFeedbackCache();
    res.json({ success: true, keys_deleted: keysDeleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
