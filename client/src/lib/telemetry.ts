/**
 * Client-side telemetry — route load times, API failure rates, conversion drop-off.
 *
 * Lightweight, zero-dependency instrumentation. Sends events to:
 *   POST /api/telemetry/client  (batched, fire-and-forget)
 *
 * Usage:
 *   import { telemetry } from '@/lib/telemetry';
 *
 *   // Route timing
 *   const mark = telemetry.startMark('LabTests');
 *   ...
 *   telemetry.endMark(mark, { itemCount: tests.length });
 *
 *   // API failure
 *   telemetry.apiError('/lab-tests', 500, 'Internal Server Error');
 *
 *   // Conversion funnel step
 *   telemetry.funnel('lab_checkout', 'cart_opened', { cartSize: 3 });
 */

// ─── Types ────────────────────────────────────────────────────────────────────

type EventType = 'page_load' | 'api_error' | 'api_timeout' | 'funnel' | 'ui_action';

interface TelemetryEvent {
  type:        EventType;
  name:        string;
  durationMs?: number;
  meta?:       Record<string, string | number | boolean | null>;
  ts:          number;          // epoch ms
  sessionId:   string;
  path:        string;
}

// ─── Session ID (per browser session, not per-user) ───────────────────────────

const SESSION_ID = (() => {
  const key = '__mq_sid';
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
  sessionStorage.setItem(key, id);
  return id;
})();

// ─── In-memory queue — batch flushed every 5 s ───────────────────────────────

const QUEUE: TelemetryEvent[] = [];
const BATCH_MS = 5000;
const MAX_QUEUE = 100;

let flushTimer: ReturnType<typeof setTimeout> | null = null;

function enqueue(event: Omit<TelemetryEvent, 'ts' | 'sessionId' | 'path'>) {
  if (QUEUE.length >= MAX_QUEUE) return;  // drop if full — telemetry must never block
  QUEUE.push({
    ...event,
    ts:        Date.now(),
    sessionId: SESSION_ID,
    path:      window.location.pathname,
  });
  scheduleFlush();
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(flush, BATCH_MS);
}

async function flush() {
  flushTimer = null;
  if (QUEUE.length === 0) return;
  const batch = QUEUE.splice(0, 50);           // send up to 50 at a time
  try {
    await fetch('/api/telemetry/client', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ events: batch }),
      keepalive: true,                          // survives page unload
    });
  } catch {
    // Silently drop — telemetry must never break app flow
    // In dev, log to console
    if (import.meta.env.DEV) console.debug('[telemetry] flush failed (dev only)', batch);
  }
}

// Flush on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { if (QUEUE.length) flush(); });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface PageMark {
  name:    string;
  startMs: number;
}

export const telemetry = {
  /**
   * Start a page/component load timer.
   * Call this at the top of a useEffect that kicks off data fetching.
   */
  startMark(name: string): PageMark {
    return { name, startMs: performance.now() };
  },

  /**
   * End a load timer and emit the measurement.
   * @param meta - Optional metadata (itemCount, cacheHit, etc.)
   */
  endMark(mark: PageMark, meta?: Record<string, string | number | boolean | null>) {
    const durationMs = Math.round(performance.now() - mark.startMs);
    enqueue({ type: 'page_load', name: mark.name, durationMs, meta: meta ?? {} });
  },

  /**
   * Record an API error (call in catch blocks).
   */
  apiError(endpoint: string, status: number, message?: string) {
    enqueue({
      type: 'api_error',
      name: endpoint,
      meta: { status, message: message?.slice(0, 200) ?? null },
    });
  },

  /**
   * Record an API timeout.
   */
  apiTimeout(endpoint: string, timeoutMs: number) {
    enqueue({ type: 'api_timeout', name: endpoint, meta: { timeoutMs } });
  },

  /**
   * Record a conversion funnel step.
   * @param funnel  - Name of the funnel e.g. 'lab_checkout'
   * @param step    - Name of the step e.g. 'cart_opened', 'payment_initiated', 'payment_success'
   * @param meta    - Optional context
   */
  funnel(funnel: string, step: string, meta?: Record<string, string | number | boolean | null>) {
    enqueue({ type: 'funnel', name: `${funnel}:${step}`, meta: meta ?? {} });
  },

  /**
   * Record a UI interaction (button click, dialog open, etc.).
   */
  ui(action: string, meta?: Record<string, string | number | boolean | null>) {
    enqueue({ type: 'ui_action', name: action, meta: meta ?? {} });
  },

  /** Force-flush the queue (e.g. before navigation). */
  flush,
};

export default telemetry;
