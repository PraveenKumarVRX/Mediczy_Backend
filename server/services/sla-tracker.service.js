/**
 * SLA Tracker Service
 * ===================
 * Monitors ticket_sla records and fires when response or resolution
 * deadlines are breached.
 *
 * Actions on breach:
 *   S0 — real-time Socket.IO broadcast to all admin connections
 *   S1 — Socket.IO notification to org (requires org info on ticket)
 *   S2/S3 — logged only; dashboard shows breached flag
 *
 * Schedule: every 5 minutes
 */

import cron from 'node-cron';
import pool from '../db/pgPool.js';
import { tick, tickError, tickStart, beginJob } from '../utils/cronRegistry.js';
import socketService from './socket.service.js';

class SlaTrackerService {
  constructor() {
    this.isRunning = false;
    this.cronJob   = null;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    // First check after 2 minutes to let other services initialise.
    setTimeout(() => this.run().catch(e =>
      console.error('[SlaTracker] Initial run error:', e.message)
    ), 120_000);

    this.cronJob = cron.schedule('*/5 * * * *', () => {
      this.run().catch(e =>
        console.error('[SlaTracker] Cron run error:', e.message)
      );
    });

    console.log('✅ SlaTracker started (every 5 min)');
  }

  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.isRunning = false;
    }
  }

  async run() {
    if (!(await beginJob('sla_breach_checker'))) return { skipped: true };
    const t0 = Date.now();
    let breached = 0;

    try {
      // Find all open SLA records where at least one deadline has passed
      // but hasn't been marked as breached yet.
      const { rows } = await pool.query(`
        SELECT
          ts.ticket_id,
          ts.severity,
          ts.ai_component,
          ts.response_due_at,
          ts.resolution_due_at,
          ts.response_met_at,
          ts.resolution_met_at,
          ts.breach_type
        FROM ticket_sla ts
        WHERE ts.breached = FALSE
          AND (
            (ts.response_met_at IS NULL    AND ts.response_due_at    < NOW())
            OR
            (ts.resolution_met_at IS NULL  AND ts.resolution_due_at  < NOW())
          )
        ORDER BY ts.severity ASC, ts.response_due_at ASC
        LIMIT 200
      `);

      for (const row of rows) {
        const responseBreached   = !row.response_met_at   && new Date(row.response_due_at)   < new Date();
        const resolutionBreached = !row.resolution_met_at && new Date(row.resolution_due_at) < new Date();

        const breachType = resolutionBreached ? 'resolution'
                         : responseBreached   ? 'response'
                         : null;

        if (!breachType) continue;

        // Mark breached in DB
        await pool.query(`
          UPDATE ticket_sla
          SET    breached    = TRUE,
                 breach_type = $2,
                 notified_at = NOW()
          WHERE  ticket_id   = $1
        `, [row.ticket_id, breachType]);

        breached++;

        // Real-time alert for S0 and S1
        if (row.severity === 'S0' || row.severity === 'S1') {
          const io = socketService.getIO();
          if (io) {
            io.emit('sla_breach_alert', {
              ticket_id:    row.ticket_id,
              severity:     row.severity,
              breach_type:  breachType,
              ai_component: row.ai_component,
              breached_at:  new Date().toISOString(),
            });
          }
        }

        const icon = row.severity === 'S0' ? '🔴' : row.severity === 'S1' ? '🟠' : '🟡';
        console.warn(
          `${icon} [SlaTracker] ${row.severity} SLA breached: ticket=${row.ticket_id} ` +
          `type=${breachType} component=${row.ai_component ?? 'n/a'}`
        );
      }

      const elapsed = Date.now() - t0;
      tick('sla_breach_checker', { breached, checked: rows.length, elapsedMs: elapsed });
      if (breached > 0) {
        console.log(`⚠️  [SlaTracker] ${breached} SLA breach(es) detected in ${elapsed}ms`);
      }
    } catch (err) {
      tickError('sla_breach_checker', err.message);
      console.error('[SlaTracker] Run error:', err.message);
    }

    return breached;
  }

  /**
   * Record that a ticket's response or resolution was met, clearing any future breach.
   * Called from the ticket resolution route (Phase 2 hook point).
   */
  async recordMet(ticketId, type = 'resolution') {
    const col = type === 'response' ? 'response_met_at' : 'resolution_met_at';
    await pool.query(`
      UPDATE ticket_sla
      SET    ${col} = NOW()
      WHERE  ticket_id = $1
        AND  ${col} IS NULL
    `, [ticketId]);
  }

  /**
   * Returns SLA status summary for the dashboard.
   */
  async getSummary() {
    const { rows } = await pool.query(`
      SELECT
        severity,
        COUNT(*)                                                      AS total,
        COUNT(*) FILTER (WHERE breached = TRUE)                       AS breached_count,
        COUNT(*) FILTER (WHERE breached = FALSE
                           AND resolution_met_at IS NULL
                           AND resolution_due_at > NOW())             AS open_ok,
        AVG(
          EXTRACT(EPOCH FROM (COALESCE(resolution_met_at, NOW())
                             - created_at)) / 60.0
        )::NUMERIC(10,1)                                              AS avg_resolution_min
      FROM ticket_sla
      WHERE created_at > NOW() - INTERVAL '7 days'
      GROUP BY severity
      ORDER BY severity
    `);
    return rows;
  }

  /**
   * Returns breached tickets (most recent first) for the dashboard.
   */
  async getBreachedTickets(limit = 50) {
    const { rows } = await pool.query(`
      SELECT
        ticket_id,
        severity,
        ai_component,
        breach_type,
        response_due_at,
        resolution_due_at,
        notified_at,
        created_at
      FROM ticket_sla
      WHERE breached = TRUE
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]);
    return rows;
  }
}

const slaTrackerService = new SlaTrackerService();
export default slaTrackerService;
