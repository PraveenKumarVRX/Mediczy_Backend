/**
 * Tenant Metering Middleware
 * 
 * Tracks API calls, AI calls, and storage usage per tenant.
 * Increments counters in-memory (flushed to DB periodically).
 * 
 * Usage: app.use(tenantMeteringMiddleware);
 */

const meterCounters = new Map(); // tenantId → { apiCalls, aiCalls }
const FLUSH_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Periodically flush counters (lazy init)
let flushTimer = null;

function ensureFlushTimer() {
  if (flushTimer) return;
  flushTimer = setInterval(async () => {
    try {
      const { default: tenantRegistry } = await import('../services/tenant-registry.service.js');
      for (const [tenantId, counts] of meterCounters.entries()) {
        if (counts.apiCalls > 0) {
          await tenantRegistry.incrementUsage(tenantId, 'apiCalls', counts.apiCalls);
          counts.apiCalls = 0;
        }
        if (counts.aiCalls > 0) {
          await tenantRegistry.incrementUsage(tenantId, 'aiCalls', counts.aiCalls);
          counts.aiCalls = 0;
        }
      }
    } catch (e) {
      // Non-critical — will retry next flush
    }
  }, FLUSH_INTERVAL);
  flushTimer.unref(); // Don't prevent process exit
}

// AI route patterns for metering
const AI_ROUTE_PATTERNS = [
  /\/api\/cdss/,
  /\/api\/ai/,
  /\/api\/v3\/ai/,
  /\/api\/medical-ai/,
  /\/api\/sib-chatbots/,
  /\/api\/consultation-recordings/
];

function isAIRoute(path) {
  return AI_ROUTE_PATTERNS.some(p => p.test(path));
}

/**
 * Express middleware for tenant metering
 */
export function tenantMeteringMiddleware(req, res, next) {
  const tenantId = req.tenant?.id || req.headers['x-tenant-id'] || 'default';

  // Initialize counters for tenant
  if (!meterCounters.has(tenantId)) {
    meterCounters.set(tenantId, { apiCalls: 0, aiCalls: 0 });
  }
  const counts = meterCounters.get(tenantId);

  // Count API call
  counts.apiCalls++;

  // Count AI call if applicable
  if (isAIRoute(req.originalUrl || req.url)) {
    counts.aiCalls++;
  }

  ensureFlushTimer();
  next();
}

/**
 * Get current metering snapshot (for dashboard)
 */
export function getMeteringSnapshot() {
  const snapshot = {};
  for (const [tenantId, counts] of meterCounters.entries()) {
    snapshot[tenantId] = { ...counts };
  }
  return snapshot;
}

export default tenantMeteringMiddleware;
