/**
 * The integration layer's core: every outbound call to a third-party API goes
 * through one of these. See docs/architecture/API_CONTRACT_AND_INTEGRATIONS.md.
 *
 * What a call gets, in order, before anything leaves the box:
 *   1. kill switch     INTEGRATION_<ID>_ENABLED=false stops every call, no deploy
 *   2. configuration   the env vars the vendor needs are present (names only)
 *   3. host allow-list the URL's host is one this vendor is known to use, so a
 *                      bug or a crafted value cannot send the vendor's key to
 *                      another server (and no redirect is ever followed)
 *   4. circuit breaker one per vendor (optionally per tenant key), so a vendor
 *                      that is down fails fast instead of piling up requests
 *   5. timeout         always; a vendor that hangs cannot hang a request
 *   6. retries         only for idempotent calls, only on transport errors,
 *                      timeouts and 5xx/429, with backoff
 *   7. metrics         counts, latency percentiles, last success/failure and
 *                      last error CODE — never payloads, so no PHI in metrics
 *
 * Errors are IntegrationError with a stable code and an HTTP status the route
 * can pass straight on (503 for unavailable, 502 for a bad vendor answer).
 */
import { CircuitBreaker } from '../../utils/circuit-breaker.js';

export class IntegrationError extends Error {
  constructor(code, message, { status = 503, integration, upstreamStatus } = {}) {
    super(message);
    this.name = 'IntegrationError';
    this.code = code;
    this.status = status;
    if (integration) this.integration = integration;
    if (upstreamStatus !== undefined) this.upstreamStatus = upstreamStatus;
  }
}

const ID_PATTERN = /^[a-z][a-z0-9-]{1,40}$/;
const DATA_CLASSES = new Set(['phi', 'pii', 'none']);
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const LATENCY_WINDOW = 200;

const envName = (id) => `INTEGRATION_${id.toUpperCase().replace(/-/g, '_')}_ENABLED`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function percentile(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

/**
 * @param {object} spec
 * @param {string}   spec.id            kebab-case, unique
 * @param {string}   spec.name          human name
 * @param {string}   spec.category      messaging | government | insurance | payments | ai | maps | identity | email | video | storage | push
 * @param {'phi'|'pii'|'none'} spec.dataClass  the most sensitive data sent to the vendor
 * @param {string[]} [spec.requiredEnv] env var NAMES that must be set for the vendor to be usable
 * @param {string[]|Function} [spec.allowedHosts] hosts this vendor's URLs may point at (exact, or '.suffix')
 * @param {string[][]} [spec.requiredAnyEnv] groups where at least one env setting must be present
 * @param {number}   [spec.timeoutMs=8000]
 * @param {{threshold?:number, cooldownMs?:number}} [spec.breaker]
 * @param {{attempts?:number, backoffMs?:number}}  [spec.retry]  attempts beyond the first; idempotent calls only
 * @param {'core'|'own-client'|'unmanaged'} [spec.managed='core']  how its calls are made today
 * @param {string}   [spec.notes]
 * @param {Function} [spec.health]      () => object, for clients that manage themselves
 */
export function defineIntegration(spec) {
  if (!ID_PATTERN.test(spec?.id || '')) throw new Error(`integration id must be kebab-case: ${spec?.id}`);
  if (!spec.name || !spec.category) throw new Error(`integration ${spec.id} needs name and category`);
  if (!DATA_CLASSES.has(spec.dataClass)) throw new Error(`integration ${spec.id} needs dataClass phi|pii|none`);

  const cfg = {
    requiredEnv: [],
    requiredAnyEnv: [],
    allowedHosts: [],
    timeoutMs: 8000,
    managed: 'core',
    ...spec,
    breaker: { threshold: 5, cooldownMs: 60_000, ...(spec.breaker || {}) },
    retry: { attempts: 0, backoffMs: 300, ...(spec.retry || {}) },
  };
  const killSwitch = envName(cfg.id);
  const breakers = new Map();
  const metrics = {
    calls: 0, ok: 0, failed: 0, refused: 0, retries: 0,
    lastSuccessAt: null, lastFailureAt: null, lastErrorCode: null,
    latencies: [],
  };

  const breakerFor = (key = '') => {
    if (!breakers.has(key)) {
      breakers.set(key, new CircuitBreaker({
        name: key ? `${cfg.id}:${key}` : cfg.id,
        threshold: cfg.breaker.threshold,
        cooldownMs: cfg.breaker.cooldownMs,
      }));
    }
    return breakers.get(key);
  };

  const enabled = () => String(process.env[killSwitch] ?? 'true').trim().toLowerCase() !== 'false';
  const missingEnv = () => [...cfg.requiredEnv.filter((name) => !String(process.env[name] || '').trim()),
    ...cfg.requiredAnyEnv.filter(group => !group.some(name => String(process.env[name] || '').trim())).map(group => group.join(' | '))];
  const configured = () => missingEnv().length === 0;

  const fail = (code, message, extra = {}) => new IntegrationError(code, message, { integration: cfg.id, ...extra });
  const refuse = (error) => {
    metrics.refused += 1;
    metrics.lastErrorCode = error.code;
    return error;
  };

  const allowedHosts = () => typeof cfg.allowedHosts === 'function' ? cfg.allowedHosts() : cfg.allowedHosts;
  const hostAllowed = (host) => allowedHosts().some((allowed) => (
    allowed.startsWith('.') ? host.endsWith(allowed) || host === allowed.slice(1) : host === allowed
  ));

  /**
   * Runs fn(signal) under the integration's rules. The deadline also bounds SDKs
   * that ignore cancellation; adapters set native transport timeouts where supported.
   * @param {(signal: AbortSignal) => Promise<any>} fn
   * @param {{ idempotent?: boolean, key?: string, timeoutMs?: number, isRetryable?: (err) => boolean, preserveError?: boolean, statusOf?: Function, configuration?: boolean }} [opts]
   */
  async function call(fn, { idempotent = false, key = '', timeoutMs = cfg.timeoutMs, isRetryable, preserveError = false, statusOf, configuration = configured() } = {}) {
    if (!enabled()) throw refuse(fail('INTEGRATION_DISABLED', `${cfg.name} is switched off.`));
    if (!configuration) throw refuse(fail('INTEGRATION_NOT_CONFIGURED', `${cfg.name} is not configured.`));
    const breaker = breakerFor(key);
    const attempts = 1 + (idempotent ? Math.max(0, cfg.retry.attempts) : 0);

    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      if (breaker.isOpen()) throw refuse(fail('INTEGRATION_CIRCUIT_OPEN', `${cfg.name} is temporarily unavailable.`));
      const controller = new AbortController();
      const duration = Math.min(Math.max(Number(timeoutMs) || cfg.timeoutMs, 1), cfg.timeoutMs);
      let rejectTimeout;
      const deadline = new Promise((_, reject) => { rejectTimeout = reject; });
      const timer = setTimeout(() => {
        controller.abort();
        rejectTimeout(fail('INTEGRATION_TIMEOUT', `${cfg.name} is temporarily unavailable.`));
      }, duration);
      let result;
      const started = Date.now();
      metrics.calls += 1;
      try {
        result = await Promise.race([Promise.resolve().then(() => fn(controller.signal)), deadline]);
        const upstreamStatus = statusOf?.(result);
        if (upstreamStatus >= 400) throw fail(upstreamStatus >= 500 || upstreamStatus === 429 ? 'INTEGRATION_UPSTREAM_ERROR' : 'INTEGRATION_REJECTED', `${cfg.name} answered ${upstreamStatus}.`, { status: 502, upstreamStatus });
        breaker.onSuccess();
        metrics.ok += 1;
        metrics.lastSuccessAt = new Date().toISOString();
        metrics.latencies.push(Date.now() - started);
        if (metrics.latencies.length > LATENCY_WINDOW) metrics.latencies.shift();
        return result;
      } catch (raw) {
        const timedOut = controller.signal.aborted;
        const error = raw instanceof IntegrationError ? raw
          : fail(timedOut ? 'INTEGRATION_TIMEOUT' : 'INTEGRATION_UNAVAILABLE', `${cfg.name} is temporarily unavailable.`, { upstreamStatus: raw?.response?.status ?? raw?.statusCode ?? raw?.status ?? raw?.$metadata?.httpStatusCode });
        // A 4xx is the vendor's answer about our request, not the vendor being down.
        const vendorDown = !(error.upstreamStatus >= 400 && error.upstreamStatus < 500 && error.upstreamStatus !== 429)
          && error.code !== 'INTEGRATION_BAD_RESPONSE' && error.code !== 'INTEGRATION_HOST_NOT_ALLOWED';
        if (vendorDown) breaker.onFailure(); else breaker.onSuccess();
        metrics.failed += 1;
        metrics.lastFailureAt = new Date().toISOString();
        metrics.lastErrorCode = error.code;
        metrics.latencies.push(Date.now() - started);
        if (metrics.latencies.length > LATENCY_WINDOW) metrics.latencies.shift();
        lastError = error;
        const retryable = isRetryable ? isRetryable(error) : vendorDown;
        if (attempt < attempts && retryable) {
          metrics.retries += 1;
          await sleep(cfg.retry.backoffMs * attempt);
          continue;
        }
        // Fetch and vendor SDK adapters preserve their existing response/error contract.
        if (!timedOut && statusOf && result !== undefined) return result;
        if (!timedOut && preserveError && !(raw instanceof IntegrationError)) throw raw;
        throw error;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError;
  }

  /**
   * fetch() with the rules above, JSON in and out.
   * @param {string} url
   * @param {{ method?: string, headers?: object, query?: object, body?: any, idempotent?: boolean, key?: string, timeoutMs?: number, fetchImpl?: Function, accept?: (status:number) => boolean }} [opts]
   * @returns {Promise<{ status: number, body: any, headers: Headers }>}
   */
  function assertUrl(url) {
    let target;
    try { target = new URL(url); } catch { throw refuse(fail('INTEGRATION_HOST_NOT_ALLOWED', 'Bad integration URL.', { status: 500 })); }
    if (target.protocol !== 'https:' || target.username || target.password || !hostAllowed(target.hostname)) {
      throw refuse(fail('INTEGRATION_HOST_NOT_ALLOWED', `${cfg.name} URL is not allowed.`, { status: 500 }));
    }
    return target;
  }

  async function fetchJson(url, {
    method = 'GET', headers = {}, query, body, idempotent, key, timeoutMs, fetchImpl = globalThis.fetch,
    accept = (status) => status >= 200 && status < 300,
  } = {}) {
    const target = assertUrl(url);
    for (const [k, v] of Object.entries(query || {})) {
      if (v !== undefined && v !== null && v !== '') target.searchParams.set(k, String(v));
    }
    const isIdempotent = idempotent ?? ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'].includes(method);
    return call(async (signal) => {
      const init = { method, headers: { Accept: 'application/json', ...headers }, signal, redirect: 'error' };
      if (body !== undefined && method !== 'GET') {
        init.headers['Content-Type'] = init.headers['Content-Type'] || 'application/json';
        init.body = typeof body === 'string' ? body : JSON.stringify(body);
      }
      const response = await fetchImpl(target.toString(), init);
      const text = await response.text();
      if (text.length > MAX_BODY_BYTES) throw fail('INTEGRATION_BAD_RESPONSE', `${cfg.name} sent an oversized response.`, { status: 502 });
      let parsed = null;
      if (text) {
        try { parsed = JSON.parse(text); } catch {
          throw fail('INTEGRATION_BAD_RESPONSE', `${cfg.name} sent an unreadable response.`, { status: 502, upstreamStatus: response.status });
        }
      }
      if (!accept(response.status)) {
        throw fail(response.status >= 500 || response.status === 429 ? 'INTEGRATION_UPSTREAM_ERROR' : 'INTEGRATION_REJECTED',
          `${cfg.name} answered ${response.status}.`, { status: 502, upstreamStatus: response.status });
      }
      return { status: response.status, body: parsed, headers: response.headers };
    }, { idempotent: isIdempotent, key, timeoutMs });
  }

  /** Configuration and health, safe to show an admin: names, never values. */
  function status() {
    const sorted = [...metrics.latencies].sort((a, b) => a - b);
    const states = [...breakers.values()].map((b) => b.state);
    const base = {
      id: cfg.id,
      name: cfg.name,
      category: cfg.category,
      dataClass: cfg.dataClass,
      managed: cfg.managed,
      enabled: enabled(),
      killSwitch,
      configured: configured(),
      missingEnv: missingEnv(),
      allowedHosts: allowedHosts(),
      timeoutMs: cfg.timeoutMs,
      circuit: states.includes('OPEN') ? 'OPEN' : states.includes('HALF-OPEN') ? 'HALF-OPEN' : 'CLOSED',
      metrics: {
        calls: metrics.calls, ok: metrics.ok, failed: metrics.failed, refused: metrics.refused, retries: metrics.retries,
        p50Ms: percentile(sorted, 50), p95Ms: percentile(sorted, 95),
        lastSuccessAt: metrics.lastSuccessAt, lastFailureAt: metrics.lastFailureAt, lastErrorCode: metrics.lastErrorCode,
      },
      notes: cfg.notes || null,
    };
    if (typeof cfg.health === 'function') {
      try { base.health = cfg.health(); } catch (error) { base.health = { error: error.message }; }
    }
    return base;
  }

  const _reset = () => {
    breakers.clear();
    Object.assign(metrics, { calls: 0, ok: 0, failed: 0, refused: 0, retries: 0, lastSuccessAt: null, lastFailureAt: null, lastErrorCode: null, latencies: [] });
  };

  return Object.freeze({
    id: cfg.id, name: cfg.name, category: cfg.category, dataClass: cfg.dataClass, managed: cfg.managed,
    enabled, configured, missingEnv, assertUrl, call, fetchJson, status, _reset,
  });
}

export default { defineIntegration, IntegrationError };
