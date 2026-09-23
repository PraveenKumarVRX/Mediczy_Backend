/**
 * Signup Funnel Analytics Service — Week 4
 *
 * Lightweight event logger for the signup/OTP funnel.
 * Writes to the `signup_analytics` Postgres table when available,
 * with a structured JSON console fallback.
 *
 * Events are batched in memory and flushed every 5 seconds (or on process exit)
 * to avoid blocking request handlers.
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';
import crypto from 'crypto';

// ── Table bootstrap ──────────────────────────────────────────────────────────

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS signup_analytics (
    id          BIGSERIAL PRIMARY KEY,
    event       VARCHAR(100) NOT NULL,
    timestamp   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    session_id  VARCHAR(64),
    payload     JSONB        NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_signup_analytics_event     ON signup_analytics (event);
  CREATE INDEX IF NOT EXISTS idx_signup_analytics_timestamp ON signup_analytics (timestamp);
  CREATE INDEX IF NOT EXISTS idx_signup_analytics_payload   ON signup_analytics USING GIN (payload);
`;

let dbAvailable = false;
let dbInitAttempted = false;

async function initDb() {
  if (dbInitAttempted) return dbAvailable;
  dbInitAttempted = true;
  try {
    await sequelize.query(CREATE_TABLE_SQL);
    dbAvailable = true;
    console.log('signup_analytics: DB table ready');
  } catch (err) {
    console.warn('signup_analytics: DB unavailable, falling back to console logging:', err.message);
    dbAvailable = false;
  }
  return dbAvailable;
}

// Kick off init without blocking module load
initDb().catch(() => {});

// ── Event batch queue ────────────────────────────────────────────────────────

const eventQueue = [];
let flushTimer = null;

const FLUSH_INTERVAL_MS = 5000;

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushEvents().catch((err) => console.error('signup_analytics flush error:', err.message));
  }, FLUSH_INTERVAL_MS);
}

async function flushEvents() {
  if (!eventQueue.length) return;

  const batch = eventQueue.splice(0, eventQueue.length);

  if (!dbAvailable) {
    // Console fallback — structured JSON, one line per event
    for (const ev of batch) {
      console.log(JSON.stringify(ev));
    }
    return;
  }

  try {
    const values = batch.map((ev) => ({
      event: ev.event,
      timestamp: ev.timestamp,
      session_id: ev.session_id || null,
      payload: JSON.stringify(ev),
    }));

    // Bulk insert using individual parameterised queries (no external bulk helper needed)
    for (const v of values) {
      await sequelize.query(
        `INSERT INTO signup_analytics (event, timestamp, session_id, payload)
         VALUES (:event, :timestamp, :session_id, :payload::jsonb)`,
        { replacements: v, type: QueryTypes.INSERT }
      );
    }
  } catch (err) {
    console.error('signup_analytics: DB insert failed, dumping to console:', err.message);
    for (const ev of batch) {
      console.log(JSON.stringify(ev));
    }
  }
}

// Flush remaining events when the event loop naturally drains (not signal-triggered, so this never
// races the coordinated shutdown sequence in controllers/shutdown.controller.js).
const exitHandler = () => {
  if (eventQueue.length) {
    // Best-effort synchronous-style drain — fire and forget
    flushEvents().catch(() => {});
  }
};
process.on('beforeExit', exitHandler);

// Called (awaited) by controllers/shutdown.controller.js as part of the single coordinated shutdown
// sequence, so a SIGTERM drains the queue for real instead of relying on the fire-and-forget handler above.
export async function flushOnShutdown() {
  if (eventQueue.length) await flushEvents().catch(() => {});
}

// ── Core enqueue helper ──────────────────────────────────────────────────────

function enqueue(event, context = {}) {
  const entry = {
    event,
    timestamp: new Date().toISOString(),
    session_id: context.sessionId || null,
    ...context,
  };
  eventQueue.push(entry);
  scheduleFlush();
}

// ── Typed event functions ────────────────────────────────────────────────────

export function trackOTPSendRequested({ channel, purpose, isNewUser, isCorporate, ip, deviceId, sessionId } = {}) {
  enqueue('otp_send_requested', { channel, purpose, isNewUser, isCorporate, ip, deviceId, sessionId });
}

export function trackOTPSendSuccessful({ channel, purpose, otpId, deliveryMs, sessionId } = {}) {
  enqueue('otp_send_successful', { channel, purpose, otpId, deliveryMs, sessionId });
}

export function trackOTPSendFailed({ channel, purpose, error, sessionId } = {}) {
  enqueue('otp_send_failed', { channel, purpose, error: String(error), sessionId });
}

export function trackOTPVerified({ channel, purpose, otpId, verifyMs, sessionId } = {}) {
  enqueue('otp_verified', { channel, purpose, otpId, verifyMs, sessionId });
}

export function trackOTPFailed({ channel, purpose, otpId, attemptsUsed, sessionId } = {}) {
  enqueue('otp_failed', { channel, purpose, otpId, attemptsUsed, sessionId });
}

export function trackEmployeeValidationFailed({ tenantId, rawEmployeeId, normalizedId, reason, sessionId } = {}) {
  enqueue('employee_validation_failed', { tenantId, rawEmployeeId, normalizedId, reason, sessionId });
}

export function trackEmployeeValidationSuccess({ tenantId, employeeId, wasNormalized, sessionId } = {}) {
  enqueue('employee_validation_success', { tenantId, employeeId, wasNormalized, sessionId });
}

export function trackSignupCompleted({ userId, channel, isCorporate, totalTimeMs, sessionId } = {}) {
  enqueue('signup_completed', { userId, channel, isCorporate, totalTimeMs, sessionId });
}

export function trackEmployeeActivated({ userId, tenantId, employeeId, method, sessionId } = {}) {
  enqueue('employee_activated', { userId, tenantId, employeeId, method, sessionId });
}

// ── Analytics query helpers (used by admin routes) ───────────────────────────

const FUNNEL_STEPS = [
  'otp_send_requested',
  'otp_send_successful',
  'otp_verified',
  'signup_completed',
  'employee_activated',
];

/**
 * Returns funnel conversion data for the last N days.
 * Falls back to zero-counts when DB is not available.
 */
export async function getFunnelStats(days = 30) {
  if (!dbAvailable) {
    return buildEmptyFunnel();
  }

  try {
    const rows = await sequelize.query(
      `SELECT event, COUNT(*) AS count
       FROM signup_analytics
       WHERE timestamp >= NOW() - INTERVAL '${parseInt(days, 10)} days'
         AND event = ANY(:events)
       GROUP BY event`,
      { replacements: { events: FUNNEL_STEPS }, type: QueryTypes.SELECT }
    );

    const counts = {};
    for (const row of rows) {
      counts[row.event] = parseInt(row.count, 10);
    }

    const funnel = FUNNEL_STEPS.map((step, idx) => {
      const count = counts[step] || 0;
      const prevCount = idx > 0 ? (counts[FUNNEL_STEPS[idx - 1]] || 0) : null;
      const conversionFromPrev =
        idx === 0 || prevCount === null || prevCount === 0
          ? null
          : `${((count / prevCount) * 100).toFixed(1)}%${step === 'employee_activated' ? ' (corporate)' : ''}`;
      return { step, count, conversionFromPrev };
    });

    return funnel;
  } catch (err) {
    console.error('getFunnelStats error:', err.message);
    return buildEmptyFunnel();
  }
}

function buildEmptyFunnel() {
  return FUNNEL_STEPS.map((step, idx) => ({
    step,
    count: 0,
    conversionFromPrev: idx === 0 ? null : '0.0%',
  }));
}

/**
 * Returns per-channel OTP success/fail counts for the last N days.
 */
export async function getChannelStats(days = 30) {
  const channels = ['sms', 'email', 'whatsapp'];
  const result = {};
  for (const ch of channels) {
    result[ch] = { sent: 0, verified: 0 };
  }

  if (!dbAvailable) return result;

  try {
    const rows = await sequelize.query(
      `SELECT
         payload->>'channel' AS channel,
         event,
         COUNT(*) AS count
       FROM signup_analytics
       WHERE timestamp >= NOW() - INTERVAL '${parseInt(days, 10)} days'
         AND event IN ('otp_send_successful', 'otp_verified')
         AND payload->>'channel' IS NOT NULL
       GROUP BY payload->>'channel', event`,
      { type: QueryTypes.SELECT }
    );

    for (const row of rows) {
      const ch = row.channel;
      if (!result[ch]) result[ch] = { sent: 0, verified: 0 };
      const count = parseInt(row.count, 10);
      if (row.event === 'otp_send_successful') result[ch].sent += count;
      if (row.event === 'otp_verified') result[ch].verified += count;
    }
  } catch (err) {
    console.error('getChannelStats error:', err.message);
  }

  return result;
}

/**
 * Returns corporate vs individual signup breakdown for the last N days.
 */
export async function getCorporateBreakdown(days = 30) {
  const breakdown = { corporate: 0, individual: 0, total: 0 };

  if (!dbAvailable) return breakdown;

  try {
    const rows = await sequelize.query(
      `SELECT
         (payload->>'isCorporate')::boolean AS is_corporate,
         COUNT(*) AS count
       FROM signup_analytics
       WHERE timestamp >= NOW() - INTERVAL '${parseInt(days, 10)} days'
         AND event = 'signup_completed'
       GROUP BY (payload->>'isCorporate')::boolean`,
      { type: QueryTypes.SELECT }
    );

    for (const row of rows) {
      const count = parseInt(row.count, 10);
      if (row.is_corporate) {
        breakdown.corporate += count;
      } else {
        breakdown.individual += count;
      }
      breakdown.total += count;
    }
  } catch (err) {
    console.error('getCorporateBreakdown error:', err.message);
  }

  return breakdown;
}

export default {
  trackOTPSendRequested,
  trackOTPSendSuccessful,
  trackOTPSendFailed,
  trackOTPVerified,
  trackOTPFailed,
  trackEmployeeValidationFailed,
  trackEmployeeValidationSuccess,
  trackSignupCompleted,
  trackEmployeeActivated,
  getFunnelStats,
  getChannelStats,
  getCorporateBreakdown,
};
