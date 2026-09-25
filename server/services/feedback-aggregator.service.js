/**
 * Feedback Aggregator Service
 * ============================
 * Pulls new records from all three feedback silos and normalises them
 * into unified_feedback_signals so the self-learning pipeline has a
 * single, weighted quality signal across every source.
 *
 * Sources and weights:
 *   patient_feedback  (weight 1.0) — star ratings + NPS from the patient app
 *   ai_cdss_feedback  (weight 1.5) — doctor accept / modify / reject decisions
 *   tickets           (weight 0.8) — complaint-category support tickets
 *
 * Runs every 15 minutes. Also exported for on-demand calls (e.g. after a
 * new complaint ticket is created).
 *
 * After ingestion, refreshes ai_component_quality_scores so dashboards
 * always reflect the latest weighted signal.
 *
 * Schedule: every 15 minutes
 */

import cron from 'node-cron';
import pool from '../db/pgPool.js';
import { tick, tickError, tickStart, beginJob } from '../utils/cronRegistry.js';

// ─── AI component routing ─────────────────────────────────────────────────────
// Maps ticket categories and CDSS feedback types to the responsible AI component.
const TICKET_CATEGORY_TO_COMPONENT = {
  'complaint':            'medical_scribe_output',
  'doctor-consultation':  'medical_scribe_output',
  'health-checkup':       'health_risk_scoring_v2_bayesian',
  'health-report':        'medical_scribe_output',
  'prescription':         'drug_interaction_checker_v1',
};

const CDSS_FEEDBACK_TYPE_TO_COMPONENT = {
  'triage':               'emergency_triage_esi_v1',
  'drug_interaction':     'drug_interaction_checker_v1',
  'risk_score':           'health_risk_scoring_v2_bayesian',
  'diagnosis':            'medical_scribe_output',
  'icd_coding':           'medical_scribe_output',
  'general':              'medical_scribe_output',
};

// ─── Quality delta computation ────────────────────────────────────────────────

function ratingToQualityDelta(rating) {
  // Converts a 1–5 star rating to a -1…+1 quality signal.
  const map = { 1: -0.8, 2: -0.4, 3: 0.0, 4: 0.35, 5: 0.5 };
  return map[rating] ?? 0;
}

function cdssActionToQualityDelta(action) {
  // Rejected suggestion = negative; accepted = positive; modified = slight negative.
  const map = { accepted: 0.5, modified: -0.2, rejected: -0.7 };
  return map[action] ?? 0;
}

function ticketPriorityToQualityDelta(priority) {
  // All complaint tickets are negative; severity scales the magnitude.
  const map = { critical: -0.9, high: -0.7, medium: -0.4, low: -0.2 };
  return map[priority] ?? -0.4;
}

// ─── Service class ────────────────────────────────────────────────────────────

class FeedbackAggregatorService {
  constructor() {
    this.isRunning = false;
    this.cronJob   = null;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    // First run after 90 seconds to let the app fully boot.
    setTimeout(() => {
      this.run().catch(err =>
        console.error('[FeedbackAggregator] Initial run error:', err.message)
      );
    }, 90_000);

    // Every 15 minutes thereafter.
    this.cronJob = cron.schedule('*/15 * * * *', () => {
      this.run().catch(err =>
        console.error('[FeedbackAggregator] Cron run error:', err.message)
      );
    });

    console.log('✅ FeedbackAggregator started (every 15 min)');
  }

  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.isRunning = false;
    }
  }

  /**
   * Main aggregation run.
   * Can also be called directly (e.g. from autoTicketService after a new complaint).
   */
  async run() {
    if (!(await beginJob('feedback_aggregator'))) return { skipped: true };
    const t0 = Date.now();
    let total = 0;

    try {
      const [pf, cdss, tk] = await Promise.all([
        this._ingestPatientFeedback(),
        this._ingestCDSSFeedback(),
        this._ingestComplaintTickets(),
      ]);
      total = pf + cdss + tk;

      await this._refreshQualityScores();

      const elapsed = Date.now() - t0;
      console.log(
        `✅ [FeedbackAggregator] ingested ${total} signals ` +
        `(patient:${pf} cdss:${cdss} tickets:${tk}) in ${elapsed}ms`
      );
      tick('feedback_aggregator', { total, patient: pf, cdss, tickets: tk, elapsedMs: elapsed });
    } catch (err) {
      tickError('feedback_aggregator', err.message);
      console.error('[FeedbackAggregator] Run error:', err.message);
    }

    return total;
  }

  // ─── Source 1: patient_feedback ─────────────────────────────────────────────

  async _ingestPatientFeedback() {
    const { rows } = await pool.query(`
      SELECT
        pf.id,
        pf.patient_id                               AS user_id,
        pf.overall_rating,
        pf.doctor_rating,
        pf.recommend_score,
        pf.improvement_areas,
        pf.feedback_channel,
        pf.submitted_at                             AS created_at
      FROM patient_feedback pf
      WHERE pf.submitted_at > NOW() - INTERVAL '30 days'
        AND NOT EXISTS (
          SELECT 1
          FROM unified_feedback_signals ufs
          WHERE ufs.source = 'patient_feedback'
            AND ufs.source_id = pf.id::text
        )
      ORDER BY pf.submitted_at ASC
      LIMIT 500
    `);

    let count = 0;
    for (const row of rows) {
      // Use overall_rating preferably; fall back to recommend_score mapped to 1–5.
      const rating = row.overall_rating
        ?? (row.recommend_score != null ? Math.round(row.recommend_score / 2) : null);

      if (rating == null) continue;

      const delta = ratingToQualityDelta(rating);

      // Only negative signals are AI-attributed (patient can't tell which component).
      // Positive signals are still ingested but without component attribution so
      // the quality score benefits from the full signal volume.
      const component = delta < 0 ? 'medical_scribe_output' : null;

      const summary =
        `Patient rated overall: ${rating}/5` +
        (row.feedback_channel ? ` via ${row.feedback_channel}` : '') +
        (row.improvement_areas ? '. Noted improvement areas.' : '');

      await this._upsertSignal({
        source:        'patient_feedback',
        source_id:     row.id.toString(),
        user_id:       row.user_id,
        ai_component:  component,
        feedback_type: delta < 0 ? 'low_rating' : 'high_rating',
        quality_delta: delta,
        weight:        1.0,
        raw_summary:   summary,
        created_at:    row.created_at,
      });
      count++;
    }
    return count;
  }

  // ─── Source 2: ai_cdss_feedback ──────────────────────────────────────────────

  async _ingestCDSSFeedback() {
    const { rows } = await pool.query(`
      SELECT
        cf.id,
        cf.user_id,
        cf.action,
        cf.feedback_type,
        cf.created_at
      FROM ai_cdss_feedback cf
      WHERE cf.created_at > NOW() - INTERVAL '30 days'
        AND NOT EXISTS (
          SELECT 1
          FROM unified_feedback_signals ufs
          WHERE ufs.source = 'cdss_feedback'
            AND ufs.source_id = cf.id::text
        )
      ORDER BY cf.created_at ASC
      LIMIT 500
    `);

    let count = 0;
    for (const row of rows) {
      const delta     = cdssActionToQualityDelta(row.action);
      const component = CDSS_FEEDBACK_TYPE_TO_COMPONENT[row.feedback_type]
                     ?? 'medical_scribe_output';

      const summary = `Doctor ${row.action} AI suggestion (type: ${row.feedback_type ?? 'general'})`;

      await this._upsertSignal({
        source:        'cdss_feedback',
        source_id:     row.id.toString(),
        user_id:       row.user_id,
        ai_component:  component,
        feedback_type: row.action,          // 'accepted' | 'modified' | 'rejected'
        quality_delta: delta,
        weight:        1.5,
        raw_summary:   summary,
        created_at:    row.created_at,
      });
      count++;
    }
    return count;
  }

  // ─── Source 3: tickets (complaint category only) ─────────────────────────────

  async _ingestComplaintTickets() {
    // Tickets are stored by Sequelize; timestamp column is "createdAt" (camelCase).
    const { rows } = await pool.query(`
      SELECT
        t.id,
        t."requester",
        t.category,
        t.priority,
        t."createdAt"                               AS created_at
      FROM tickets t
      WHERE t.category = 'complaint'
        AND t."createdAt" > NOW() - INTERVAL '30 days'
        AND NOT EXISTS (
          SELECT 1
          FROM unified_feedback_signals ufs
          WHERE ufs.source = 'ticket'
            AND ufs.source_id = t.id::text
        )
      ORDER BY t."createdAt" ASC
      LIMIT 500
    `);

    let count = 0;
    for (const row of rows) {
      const delta     = ticketPriorityToQualityDelta(row.priority);
      const component = TICKET_CATEGORY_TO_COMPONENT[row.category]
                     ?? 'medical_scribe_output';

      // requester is a JSONB column — extract source channel for summary if present.
      const requesterSource = row.requester?.source ?? 'unknown';
      const summary = `${row.priority} complaint ticket via ${requesterSource}`;

      await this._upsertSignal({
        source:        'ticket',
        source_id:     row.id.toString(),
        user_id:       row.requester?.userId ?? null,
        ai_component:  component,
        feedback_type: 'complaint',
        quality_delta: delta,
        weight:        0.8,
        raw_summary:   summary,
        created_at:    row.created_at,
      });
      count++;
    }
    return count;
  }

  // ─── Upsert helper ────────────────────────────────────────────────────────────
  // ON CONFLICT DO NOTHING — idempotent, safe to call multiple times per record.

  async _upsertSignal({ source, source_id, user_id, ai_component, feedback_type,
                        quality_delta, weight, raw_summary, created_at }) {
    await pool.query(`
      INSERT INTO unified_feedback_signals
        (source, source_id, user_id, ai_component, feedback_type,
         quality_delta, weight, raw_summary, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (source, source_id) DO NOTHING
    `, [
      source, source_id, user_id ?? null, ai_component ?? null,
      feedback_type, quality_delta, weight, raw_summary,
      created_at ?? new Date(),
    ]);
  }

  // ─── Quality score refresh ────────────────────────────────────────────────────
  // Computes an exponentially time-decayed weighted average per AI component
  // and maps the result onto a 0–10 scale (5 = neutral).
  //
  // recency_factor = exp(-0.1 * days_ago)  →  today = 1.0, 7 days ago ≈ 0.50

  async _refreshQualityScores() {
    const { rows } = await pool.query(`
      SELECT
        ai_component,

        -- 7-day weighted score
        SUM(
          CASE WHEN created_at > NOW() - INTERVAL '7 days'
            THEN weight * quality_delta
                 * EXP(-0.1 * EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400.0)
            ELSE 0 END
        ) /
        NULLIF(SUM(
          CASE WHEN created_at > NOW() - INTERVAL '7 days'
            THEN weight
                 * EXP(-0.1 * EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400.0)
            ELSE 0 END
        ), 0)                                               AS delta_7d,

        -- 30-day weighted score
        SUM(
          weight * quality_delta
          * EXP(-0.1 * EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400.0)
        ) /
        NULLIF(SUM(
          weight * EXP(-0.1 * EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400.0)
        ), 0)                                               AS delta_30d,

        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')  AS cnt_7d,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS cnt_30d

      FROM unified_feedback_signals
      WHERE ai_component IS NOT NULL
        AND created_at > NOW() - INTERVAL '30 days'
      GROUP BY ai_component
    `);

    for (const row of rows) {
      // Map -1…+1 delta to 0…10 score: score = 5 + delta*5, clamped.
      const score7d  = Math.max(0, Math.min(10, 5 + (row.delta_7d  ?? 0) * 5));
      const score30d = Math.max(0, Math.min(10, 5 + (row.delta_30d ?? 0) * 5));

      // Trend: compare 7-day vs 30-day — if 7d is meaningfully better, improving.
      const diff   = score7d - score30d;
      const trend  = diff > 0.3 ? 'improving' : diff < -0.3 ? 'degrading' : 'stable';

      await pool.query(`
        INSERT INTO ai_component_quality_scores
          (ai_component, score_7d, score_30d, signal_count_7d, signal_count_30d, trend, computed_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (ai_component) DO UPDATE SET
          score_7d         = EXCLUDED.score_7d,
          score_30d        = EXCLUDED.score_30d,
          signal_count_7d  = EXCLUDED.signal_count_7d,
          signal_count_30d = EXCLUDED.signal_count_30d,
          trend            = EXCLUDED.trend,
          computed_at      = NOW()
      `, [
        row.ai_component,
        score7d,
        score30d,
        parseInt(row.cnt_7d)  || 0,
        parseInt(row.cnt_30d) || 0,
        trend,
      ]);
    }
  }

  /**
   * Returns the current quality scores for all AI components.
   * Used by the self-learning pipeline and (Phase 1) dashboard API.
   */
  async getComponentScores() {
    const { rows } = await pool.query(`
      SELECT ai_component, score_7d, score_30d, signal_count_7d, trend, computed_at
      FROM   ai_component_quality_scores
      ORDER  BY score_7d ASC
    `);
    return rows;
  }
}

const feedbackAggregatorService = new FeedbackAggregatorService();
export default feedbackAggregatorService;
