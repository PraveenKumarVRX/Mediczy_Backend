/**
 * Closed-Loop Notifier Service
 * ============================
 * Sends a follow-up message to patients 24 hours after their complaint ticket
 * is resolved, inviting them to rate the resolution.  The rating feeds back
 * into unified_feedback_signals via POST /api/feedback-intelligence/post-resolution-rating.
 *
 * Storage: ticket_resolution_followups (created by this service on first run)
 *
 * Delivery channels (in priority order):
 *   1. Email via AWS SES (if requester.email present)
 *   2. WhatsApp (retired with RocketChat on 2026-10-04; never actually delivered -- see below)
 *
 * Schedule: every 30 minutes (offset at :45)
 */

import cron from 'node-cron';
import pool from '../db/pgPool.js';
import { tick, tickError, tickStart, beginJob } from '../utils/cronRegistry.js';

const APP_URL   = process.env.APP_URL || 'https://app.mediqzy.com';
const FROM_EMAIL = process.env.SES_FROM_EMAIL || process.env.EMAIL_FROM || 'support@mediqzy.com';

// ─── Ensure follow-up table exists ───────────────────────────────────────────

async function ensureFollowupTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ticket_resolution_followups (
      id                SERIAL        PRIMARY KEY,
      ticket_id         TEXT          NOT NULL UNIQUE,
      severity          TEXT,
      requester_name    TEXT,
      requester_email   TEXT,
      requester_phone   TEXT,
      send_after        TIMESTAMPTZ   NOT NULL,
      sent_at           TIMESTAMPTZ,
      channel           TEXT,         -- 'email' | 'whatsapp' | 'none'
      created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_trf_pending
      ON ticket_resolution_followups (send_after, sent_at)
      WHERE sent_at IS NULL
  `);
}

// ─── Email sender (direct SES) ────────────────────────────────────────────────

async function sendSesEmail({ to, subject, html }) {
  try {
    const { SESv2Client, SendEmailCommand } = await import('@aws-sdk/client-sesv2');
    const client = new SESv2Client({ region: process.env.AWS_REGION || 'ap-south-1' });
    await client.send(new SendEmailCommand({
      FromEmailAddress: FROM_EMAIL,
      Destination: { ToAddresses: [to] },
      Content: {
        Simple: {
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body:    { Html: { Data: html, Charset: 'UTF-8' } },
        },
      },
    }));
    return true;
  } catch (err) {
    console.warn('[ClosedLoopNotifier] SES send error:', err.message);
    return false;
  }
}

function buildEmailHtml({ name, ticketId, ratingUrl }) {
  return `
<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
<h2 style="color:#1a73e8">How did we do? ⭐</h2>
<p>Hi ${name || 'there'},</p>
<p>Your support ticket <strong>#${ticketId}</strong> has been resolved.
We'd love to know how we handled it.</p>
<p style="margin:24px 0">
  <a href="${ratingUrl}&rating=5" style="background:#22c55e;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;margin-right:8px">⭐⭐⭐⭐⭐ Great</a>
  <a href="${ratingUrl}&rating=3" style="background:#eab308;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;margin-right:8px">⭐⭐⭐ OK</a>
  <a href="${ratingUrl}&rating=1" style="background:#ef4444;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">⭐ Poor</a>
</p>
<p style="font-size:12px;color:#666">
  <a href="${ratingUrl}">Rate on full scale (1–5)</a>
</p>
<hr style="border:none;border-top:1px solid #eee;margin-top:32px">
<p style="font-size:11px;color:#999">Mediczy Healthcare · mediqzy.com</p>
</body></html>`.trim();
}

// ─── Service class ────────────────────────────────────────────────────────────

class ClosedLoopNotifierService {
  constructor() {
    this.isRunning = false;
    this.cronJob   = null;
    this.tableReady = false;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    setTimeout(async () => {
      await ensureFollowupTable().catch(e =>
        console.warn('[ClosedLoopNotifier] Table setup error:', e.message)
      );
      this.tableReady = true;
      this.run().catch(e =>
        console.error('[ClosedLoopNotifier] Initial run error:', e.message)
      );
    }, 150_000); // 2.5 min boot delay

    // Every 30 minutes at :45 past the hour
    this.cronJob = cron.schedule('45 */1 * * *', () => {
      if (!this.tableReady) return;
      this.run().catch(e =>
        console.error('[ClosedLoopNotifier] Cron run error:', e.message)
      );
    });

    console.log('✅ ClosedLoopNotifier started (every 30 min)');
  }

  stop() {
    if (this.cronJob) { this.cronJob.stop(); this.isRunning = false; }
  }

  /**
   * Schedule a follow-up for a resolved ticket.
   * Called from tickets.route.js after status → resolved.
   */
  async scheduleFollowup({ ticketId, severity, requesterName, requesterEmail, requesterPhone }) {
    if (!this.tableReady) {
      await ensureFollowupTable().catch(() => {});
      this.tableReady = true;
    }
    // Only follow up on complaint-tier tickets (those with an SLA record)
    const { rows } = await pool.query(
      `SELECT ticket_id FROM ticket_sla WHERE ticket_id = $1`, [ticketId]
    );
    if (!rows.length) return; // not a tracked complaint

    await pool.query(`
      INSERT INTO ticket_resolution_followups
        (ticket_id, severity, requester_name, requester_email, requester_phone, send_after)
      VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '24 hours')
      ON CONFLICT (ticket_id) DO NOTHING
    `, [ticketId, severity ?? null, requesterName ?? null,
        requesterEmail ?? null, requesterPhone ?? null]);
  }

  async run() {
    if (!(await beginJob('closed_loop_notifier'))) return { skipped: true };
    let sent = 0;

    try {
      const { rows } = await pool.query(`
        SELECT *
        FROM ticket_resolution_followups
        WHERE sent_at  IS NULL
          AND send_after < NOW()
        ORDER BY send_after ASC
        LIMIT 50
      `);

      for (const row of rows) {
        const channel = await this._sendNotification(row);
        await pool.query(`
          UPDATE ticket_resolution_followups
          SET sent_at = NOW(), channel = $2
          WHERE id = $1
        `, [row.id, channel]);
        if (channel !== 'none') sent++;
      }

      tick('closed_loop_notifier', { sent, checked: rows.length });
      if (sent > 0) {
        console.log(`📬 [ClosedLoopNotifier] Sent ${sent} post-resolution follow-up(s)`);
      }
    } catch (err) {
      tickError('closed_loop_notifier', err.message);
      console.error('[ClosedLoopNotifier] Run error:', err.message);
    }

    return sent;
  }

  async _sendNotification(row) {
    const ratingUrl = `${APP_URL}/rate-resolution?ticket_id=${encodeURIComponent(row.ticket_id)}`;

    // ── Email first ──────────────────────────────────────────────────────────
    if (row.requester_email) {
      const html = buildEmailHtml({
        name:      row.requester_name,
        ticketId:  row.ticket_id,
        ratingUrl,
      });
      const ok = await sendSesEmail({
        to:      row.requester_email,
        subject: `How did we do? Rate your Mediczy support experience`,
        html,
      });
      if (ok) return 'email';
    }

    // ── WhatsApp fallback ────────────────────────────────────────────────────
    // Removed with RocketChat on 2026-10-04. This branch called
    // rocketChatService.sendDirectMessage(), a method that was never defined on that service, so
    // it threw on every attempt and fell through to 'none' -- the WhatsApp rating notification has
    // never actually been delivered. Re-implementing it needs a real outbound WhatsApp sender
    // (Twilio, via the Chatwoot bridge in services/chatwoot-bridge.service.js), which is a
    // deliberate piece of work rather than a like-for-like swap. Email above remains the live path.
    return 'none';
  }
}

const closedLoopNotifierService = new ClosedLoopNotifierService();
export default closedLoopNotifierService;
