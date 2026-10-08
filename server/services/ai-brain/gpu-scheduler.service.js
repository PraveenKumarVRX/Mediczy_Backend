/**
 * GPU Scheduler Service
 * =====================
 * Central scheduling layer for all GPU inference workloads.
 *
 * Architecture:
 *   Every LLM request flows through schedule(gpu, task) before hitting the model.
 *   The scheduler enforces per-GPU concurrency limits, priority queuing, timeout
 *   budgets, circuit breaking, and saturation metrics.
 *
 * GPU inventory:
 *   gpu3090  — ai.isha.buzz  — BiMediX2-8B    — DEEP / clinical reasoning only
 *   gpu3060  — isha-inc.com  — GPT-OSS stack   — REFLEX / STANDARD / general agents
 *
 * Concurrency policy:
 *   3090: max 3 concurrent  (long context clinical reasoning; VRAM is the constraint)
 *   3060: max 8 concurrent  (faster general tasks; higher throughput acceptable)
 *   CPU:  unlimited concurrent (bounded only by RAM/threads)
 *
 * Priority levels (higher = served first from queue):
 *   CRITICAL  4  — emergency / life-threatening triage
 *   HIGH      3  — clinical reasoning, SOAP notes, active patient sessions
 *   NORMAL    2  — general agents, email, tickets (default)
 *   LOW       1  — batch / background / analytics
 *
 * Self-healing:
 *   If a GPU's error rate exceeds 50% over a 60 s window, the circuit opens
 *   and requests are transparently rerouted to the other GPU or Groq cloud.
 */

import pool from '../../db/pgPool.js';

// ─── GPU Definitions ──────────────────────────────────────────────────────────

export const GPU = {
  GPU3090: 'gpu3090',  // RTX 3090 — Bimedix — medical deep reasoning
  GPU3060: 'gpu3060',  // RTX 3060 — GPT-OSS — general agents
  CPU:     'cpu',      // No GPU — embeddings, RAG, rules
};

export const PRIORITY = {
  CRITICAL: 4,
  HIGH:     3,
  NORMAL:   2,
  LOW:      1,
};

// ─── Concurrency Limits ───────────────────────────────────────────────────────

const LIMITS = {
  [GPU.GPU3090]: parseInt(process.env.GPU3090_MAX_CONCURRENCY || '3',  10),
  [GPU.GPU3060]: parseInt(process.env.GPU3060_MAX_CONCURRENCY || '8',  10),
  [GPU.CPU]:     parseInt(process.env.CPU_MAX_CONCURRENCY     || '64', 10),
};

// ─── Timeout Budgets (ms) ─────────────────────────────────────────────────────

const TIMEOUTS = {
  [GPU.GPU3090]: parseInt(process.env.GPU3090_TIMEOUT_MS || '45000', 10),
  [GPU.GPU3060]: parseInt(process.env.GPU3060_TIMEOUT_MS || '20000', 10),
  [GPU.CPU]:     parseInt(process.env.CPU_TIMEOUT_MS     || '10000', 10),
};

// ─── Circuit Breaker ──────────────────────────────────────────────────────────

const CIRCUIT = {
  [GPU.GPU3090]: { open: false, openUntil: 0, failures: 0, successes: 0, window: [] },
  [GPU.GPU3060]: { open: false, openUntil: 0, failures: 0, successes: 0, window: [] },
  [GPU.CPU]:     { open: false, openUntil: 0, failures: 0, successes: 0, window: [] },
};

const CB_WINDOW_MS    = 60_000;   // 60 s rolling window
const CB_OPEN_MS      = 5 * 60_000; // open for 5 min when tripped
const CB_ERROR_RATE   = 0.5;      // trip if >50% errors in window
const CB_MIN_CALLS    = 5;        // need at least 5 calls before tripping

function _cbRecord(gpu, success) {
  const cb = CIRCUIT[gpu];
  const now = Date.now();
  cb.window.push({ ts: now, ok: success });
  // Trim old entries outside the window
  cb.window = cb.window.filter(e => now - e.ts < CB_WINDOW_MS);

  if (cb.window.length >= CB_MIN_CALLS) {
    const errors = cb.window.filter(e => !e.ok).length;
    const rate = errors / cb.window.length;
    if (rate >= CB_ERROR_RATE && !cb.open) {
      cb.open = true;
      cb.openUntil = now + CB_OPEN_MS;
      console.warn(`[GPUSched] Circuit OPENED for ${gpu} (error rate ${(rate*100).toFixed(0)}% over ${cb.window.length} calls). Rerouting for ${CB_OPEN_MS/1000}s.`);
    }
  }
}

function _cbCheck(gpu) {
  const cb = CIRCUIT[gpu];
  if (!cb.open) return false;
  if (Date.now() >= cb.openUntil) {
    cb.open = false;
    cb.window = [];
    console.log(`[GPUSched] Circuit CLOSED for ${gpu} — resuming normal routing`);
    return false;
  }
  return true;
}

// ─── Per-GPU State ────────────────────────────────────────────────────────────

const STATE = {
  [GPU.GPU3090]: { active: 0, queued: 0, totalRequests: 0, totalErrors: 0, totalLatencyMs: 0, queue: [] },
  [GPU.GPU3060]: { active: 0, queued: 0, totalRequests: 0, totalErrors: 0, totalLatencyMs: 0, queue: [] },
  [GPU.CPU]:     { active: 0, queued: 0, totalRequests: 0, totalErrors: 0, totalLatencyMs: 0, queue: [] },
};

// ─── DB logging (table created by migrations/20261008000100-ai-gpu-scheduler-log.sql) ───

let _dbReady = false;
let _dbProbed = false;
async function probeDb() {
  if (_dbProbed) return;
  _dbProbed = true;
  try {
    const { rows } = await pool.query(`SELECT to_regclass('public.ai_gpu_scheduler_log') AS t`);
    _dbReady = Boolean(rows[0]?.t);
  } catch { /* logging is optional */ }
}

// ─── Core: schedule() ─────────────────────────────────────────────────────────

/**
 * Schedule a task on a GPU with concurrency control, priority queuing,
 * circuit breaking and timeout enforcement.
 *
 * @param {string}   gpu      — GPU.GPU3090 | GPU.GPU3060 | GPU.CPU
 * @param {Function} task     — async () => result (the actual inference call)
 * @param {Object}   [opts]
 * @param {number}   [opts.priority]    — PRIORITY.CRITICAL | HIGH | NORMAL | LOW
 * @param {number}   [opts.timeoutMs]   — override default timeout
 * @param {string}   [opts.label]       — for logging/metrics
 * @returns {Promise<any>}   — task result
 */
export async function schedule(gpu, task, opts = {}) {
  const { priority = PRIORITY.NORMAL, timeoutMs, label = '' } = opts;
  probeDb().catch(() => {});
  const state = STATE[gpu];
  const limit = LIMITS[gpu];
  const timeout = timeoutMs || TIMEOUTS[gpu];

  state.totalRequests++;

  // Circuit breaker: fail fast if GPU is in open state
  if (_cbCheck(gpu)) {
    const err = new Error(`[GPUSched] ${gpu} circuit open — request rejected (${label})`);
    err.gpuCircuitOpen = true;
    _cbRecord(gpu, false);
    state.totalErrors++;
    throw err;
  }

  const enqueueTime = Date.now();

  // If below concurrency limit, execute immediately
  if (state.active < limit) {
    return _execute(gpu, task, priority, label, enqueueTime, timeout);
  }

  // Otherwise queue it up (sorted by priority descending)
  return new Promise((resolve, reject) => {
    state.queued++;
    const entry = { task, priority, label, enqueueTime, timeout, resolve, reject };
    // Insert sorted (highest priority first, then FIFO within same priority)
    let i = 0;
    while (i < state.queue.length && state.queue[i].priority >= priority) i++;
    state.queue.splice(i, 0, entry);
    console.log(`[GPUSched] ${gpu} queued (priority=${priority} label=${label}) queue_depth=${state.queue.length}`);
  });
}

function isClientError(err) {
  const status = Number(err?.status ?? err?.statusCode);
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

async function _execute(gpu, task, priority, label, enqueueTime, timeout) {
  const state = STATE[gpu];
  state.active++;
  const waitMs = Date.now() - enqueueTime;
  const execStart = Date.now();

  console.log(`[GPUSched] ${gpu} START active=${state.active}/${LIMITS[gpu]} wait=${waitMs}ms label=${label}`);

  let success = false;
  let errorType = null;
  try {
    // Wrap task with timeout
    let timer;
    const result = await Promise.race([
      task(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`[GPUSched] ${gpu} timeout after ${timeout}ms`)), timeout);
      }),
    ]).finally(() => clearTimeout(timer));
    success = true;
    _cbRecord(gpu, true);
    const execMs = Date.now() - execStart;
    state.totalLatencyMs += execMs;
    console.log(`[GPUSched] ${gpu} DONE active=${state.active-1}/${LIMITS[gpu]} exec=${execMs}ms label=${label}`);
    _logAsync(gpu, priority, waitMs, execMs, true, null);
    return result;
  } catch (err) {
    // A 4xx from the provider (consent gate, bad request) says nothing about GPU health.
    if (!isClientError(err)) _cbRecord(gpu, false);
    state.totalErrors++;
    errorType = /timeout/i.test(err.message) ? 'timeout' : 'error';
    const execMs = Date.now() - execStart;
    console.warn(`[GPUSched] ${gpu} ERROR active=${state.active-1}/${LIMITS[gpu]} exec=${execMs}ms label=${label}: ${err.message}`);
    _logAsync(gpu, priority, waitMs, execMs, false, errorType);
    throw err;
  } finally {
    state.active--;
    _drain(gpu);
  }
}

function _drain(gpu) {
  const state = STATE[gpu];
  if (state.queue.length === 0 || state.active >= LIMITS[gpu]) return;
  const entry = state.queue.shift();
  state.queued--;
  // Check if this request has been waiting too long (>2× timeout)
  const waitMs = Date.now() - entry.enqueueTime;
  if (waitMs > entry.timeout * 2) {
    const err = new Error(`[GPUSched] ${gpu} queue timeout: waited ${waitMs}ms for label=${entry.label}`);
    err.gpuQueueTimeout = true;
    entry.reject(err);
    state.totalErrors++;
    _drain(gpu); // try next in queue
    return;
  }
  _execute(gpu, entry.task, entry.priority, entry.label, entry.enqueueTime, entry.timeout)
    .then(entry.resolve)
    .catch(entry.reject);
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

/**
 * Returns live saturation metrics for all GPUs.
 * Used by monitoring endpoint and self-healing scheduler.
 */
export function getMetrics() {
  const metrics = {};
  for (const gpu of Object.values(GPU)) {
    const s = STATE[gpu];
    const cb = CIRCUIT[gpu];
    const limit = LIMITS[gpu];
    const utilizationPct = limit > 0 ? Math.round((s.active / limit) * 100) : 0;
    const avgLatencyMs = s.totalRequests > s.totalErrors
      ? Math.round(s.totalLatencyMs / Math.max(1, s.totalRequests - s.totalErrors))
      : 0;
    const errorRatePct = s.totalRequests > 0
      ? Math.round((s.totalErrors / s.totalRequests) * 100)
      : 0;

    metrics[gpu] = {
      active:         s.active,
      queued:         s.queued,
      limit,
      utilizationPct,
      totalRequests:  s.totalRequests,
      totalErrors:    s.totalErrors,
      errorRatePct,
      avgLatencyMs,
      circuitOpen:    cb.open,
      circuitOpenUntil: cb.open ? new Date(cb.openUntil).toISOString() : null,
      recentErrorRate: cb.window.length > 0
        ? Math.round(cb.window.filter(e => !e.ok).length / cb.window.length * 100)
        : 0,
    };
  }
  return metrics;
}

/**
 * Returns the recommended GPU for a given cognitive tier.
 * Takes circuit state into account — if preferred GPU is down, falls back.
 *
 * DEEP    → 3090 (Bimedix, medical reasoning)
 * STANDARD→ 3060 (GPT-OSS, general reasoning)
 * REFLEX  → 3060 (GPT-OSS, fast)
 * null    → 3060 (default)
 */
export function recommendGpu(cognitiveTier) {
  const preferred = (cognitiveTier === 'deep') ? GPU.GPU3090 : GPU.GPU3060;
  const fallback  = (preferred === GPU.GPU3090) ? GPU.GPU3060 : GPU.GPU3090;

  if (_cbCheck(preferred)) {
    console.warn(`[GPUSched] ${preferred} circuit open — rerouting to ${fallback}`);
    return _cbCheck(fallback) ? null : fallback;
  }
  return preferred;
}

const CHEAP_TASK_RE = /\b(insurance|claim|billing|coverage|policy|premium|preauth|tpa|copay|mediclaim|reimbursement|book|appointment|schedule|cancel|reschedule|slot|calendar|availability)\b/i;

/**
 * Which GPU slot (and priority) a provider call should occupy, or null for cloud
 * providers that need no slot. Insurance / scheduling text never occupies the 3090.
 */
export function slotForRequest({ providerName, cognitiveTier, messages }) {
  const text = Array.isArray(messages) ? messages.map((m) => (typeof m?.content === 'string' ? m.content : '')).join(' ') : '';
  const cheap = CHEAP_TASK_RE.test(text);
  const deep = cognitiveTier === 'deep' && !cheap;
  let gpu;
  if (providerName === 'isha') gpu = cheap ? GPU.GPU3060 : GPU.GPU3090;
  else if (providerName === 'isha-inc' || providerName === 'isha-insurance') gpu = GPU.GPU3060;
  else if (providerName === 'sib') gpu = deep ? GPU.GPU3090 : GPU.GPU3060;
  else return null; // Groq / OpenAI / local SLM
  return { gpu, priority: deep ? PRIORITY.HIGH : PRIORITY.NORMAL };
}

/**
 * Saturation warning: returns true if a GPU is approaching overload.
 * Used by Node.js routes to add back-pressure.
 */
export function isSaturated(gpu) {
  const s = STATE[gpu];
  return (s.active + s.queued) >= LIMITS[gpu] * 1.5;
}

// ─── Async DB logging (fire-and-forget) ──────────────────────────────────────

function _logAsync(gpu, priority, waitMs, execMs, success, errorType) {
  if (!_dbReady) return;
  pool.query(
    `INSERT INTO ai_gpu_scheduler_log (gpu, priority, wait_ms, exec_ms, success, error_type)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [gpu, priority, waitMs, execMs, success, errorType]
  ).catch(() => {});
}

// ─── DB Stats (for monitoring dashboard) ─────────────────────────────────────

export async function getDbStats(hours = 24) {
  try {
    const { rows } = await pool.query(`
      SELECT
        gpu,
        COUNT(*)                                    AS total,
        ROUND(AVG(wait_ms))                         AS avg_wait_ms,
        ROUND(AVG(exec_ms))                         AS avg_exec_ms,
        ROUND(100.0 * SUM(CASE WHEN success THEN 1 ELSE 0 END) / COUNT(*), 1) AS success_rate_pct,
        SUM(CASE WHEN error_type = 'timeout' THEN 1 ELSE 0 END) AS timeouts
      FROM ai_gpu_scheduler_log
      WHERE created_at > NOW() - ($1 || ' hours')::INTERVAL
      GROUP BY gpu
      ORDER BY gpu
    `, [hours]);
    return rows;
  } catch (err) {
    return { error: err.message };
  }
}

export default { schedule, GPU, PRIORITY, getMetrics, recommendGpu, isSaturated, getDbStats, slotForRequest };
