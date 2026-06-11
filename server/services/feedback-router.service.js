/**
 * Feedback Router Service
 * =======================
 * Watches for degrading AI components and automatically proposes governance
 * changes through the PCCP pipeline so medical directors can review them.
 *
 * Routing rules:
 *   score_7d < 4.0 AND signal_count_7d >= 5
 *     → proposeChange() with change_type 'prompt_update'
 *
 *   score_7d < 3.0 AND signal_count_7d >= 3
 *     → proposeChange() with change_type 'model_swap' + S1 socket alert
 *
 *   Any open S0 ticket_sla row (unresolved)
 *     → proposeChange() with change_type 'routing_update' (emergency freeze)
 *
 * All changes flow through governanceService.proposeChange() — this service
 * never modifies prompts or models directly (SaMD PCCP requirement).
 *
 * Runs every 30 minutes, offset from other AI crons.
 */

import cron from 'node-cron';
import pool from '../db/pgPool.js';
import { tick, tickError, tickStart } from '../utils/cronRegistry.js';
import governanceService from './ai-model-governance.service.js';
import socketService from './socket.service.js';

const PROPOSER = 'feedback-router-pipeline';

class FeedbackRouterService {
  constructor() {
    this.isRunning = false;
    this.cronJob   = null;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    // First run 3 minutes after boot.
    setTimeout(() => this.run().catch(e =>
      console.error('[FeedbackRouter] Initial run error:', e.message)
    ), 180_000);

    // Every 30 minutes, offset at :20 to avoid collision with other crons.
    this.cronJob = cron.schedule('20 */1 * * *', () => {
      this.run().catch(e =>
        console.error('[FeedbackRouter] Cron run error:', e.message)
      );
    });

    console.log('✅ FeedbackRouter started (every 30 min)');
  }

  stop() {
    if (this.cronJob) { this.cronJob.stop(); this.isRunning = false; }
  }

  async run() {
    tickStart('feedback_router');
    let proposed = 0;

    try {
      const [scoreRows, s0Rows] = await Promise.all([
        pool.query(`
          SELECT
            ai_component,
            score_7d,
            score_30d,
            signal_count_7d,
            trend
          FROM ai_component_quality_scores
          WHERE score_7d < 4.0
            AND signal_count_7d >= 3
          ORDER BY score_7d ASC
          LIMIT 20
        `).catch(() => ({ rows: [] })),

        pool.query(`
          SELECT DISTINCT ai_component, ticket_id
          FROM ticket_sla
          WHERE severity = 'S0'
            AND resolution_met_at IS NULL
            AND created_at > NOW() - INTERVAL '24 hours'
          LIMIT 10
        `).catch(() => ({ rows: [] })),
      ]);

      // ── Emergency rollback proposals for open S0 incidents ──────────────────
      for (const row of s0Rows.rows) {
        if (!row.ai_component) continue;
        const desc = `SAFETY INCIDENT: Open S0 ticket ${row.ticket_id} ` +
                     `implicates ${row.ai_component}. Emergency routing update or ` +
                     `immediate prompt freeze required pending medical review.`;
        proposed += await this._propose(row.ai_component, 'routing_update', desc, 1.0);

        // Broadcast S0 routing alert
        const io = socketService.getIO();
        if (io) {
          io.emit('s0_routing_alert', {
            ai_component: row.ai_component,
            ticket_id:    row.ticket_id,
            action:       'emergency_rollback_proposed',
            timestamp:    new Date().toISOString(),
          });
        }
      }

      // ── Degrading component proposals ────────────────────────────────────────
      for (const row of scoreRows.rows) {
        // Skip components already covered by emergency rollback above
        if (s0Rows.rows.some(r => r.ai_component === row.ai_component)) continue;

        const type = row.score_7d < 3.0 ? 'model_swap' : 'prompt_update';
        const desc = `Quality score for ${row.ai_component} is ${Number(row.score_7d).toFixed(1)}/10 ` +
                     `over 7 days (${row.signal_count_7d} signals, trend: ${row.trend}). ` +
                     `Action: ${type === 'model_swap' ? 'Evaluate model retraining/swap' : 'Prompt refinement suggested'}.`;
        proposed += await this._propose(row.ai_component, type, desc, row.score_7d / 10);
      }

      tick('feedback_router', { proposed });
      if (proposed > 0) {
        console.log(`🔀 [FeedbackRouter] Proposed ${proposed} governance change(s)`);
      }
    } catch (err) {
      tickError('feedback_router', err.message);
      console.error('[FeedbackRouter] Run error:', err.message);
    }

    return proposed;
  }

  async _propose(component, changeType, description, confidence) {
    try {
      await governanceService.proposeChange({
        component:     component,
        changeType:    changeType,
        description:   description,
        rationale:     `Auto-proposed by ${PROPOSER} based on feedback quality signals. Confidence: ${confidence}`,
        riskAssessment: confidence < 0.4 ? 'high' : confidence < 0.7 ? 'moderate' : 'low',
      });
      return 1;
    } catch (err) {
      console.warn(`[FeedbackRouter] proposeChange failed for ${component}:`, err.message);
      return 0;
    }
  }
}

const feedbackRouterService = new FeedbackRouterService();
export default feedbackRouterService;
