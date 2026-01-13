/**
 * Prometheus Metrics for SIB Control Layer
 * 
 * Tracks AI decision quality, safety events, and system health
 */

import client from 'prom-client';

// Counter: Total decisions processed
export const sibDecisionsTotal = new client.Counter({
  name: 'sib_decisions_total',
  help: 'Total number of AI decisions processed',
  labelNames: ['type', 'status']
});

// Counter: Decisions rejected
export const sibDecisionsRejected = new client.Counter({
  name: 'sib_decisions_rejected',
  help: 'Number of decisions rejected by safety controls',
  labelNames: ['type', 'reason']
});

// Counter: Human approvals
export const sibApprovalsTotal = new client.Counter({
  name: 'sib_approvals_total',
  help: 'Total human approval requests',
  labelNames: ['type', 'outcome']
});

// Gauge: Pending approvals
export const sibApprovalsPending = new client.Gauge({
  name: 'sib_approvals_pending',
  help: 'Number of pending human approvals'
});

// Gauge: Kill switch status
export const sibKillSwitchActive = new client.Gauge({
  name: 'sib_kill_switch_active',
  help: 'Kill switch status (0=inactive, 1=active)'
});

// Histogram: Decision confidence scores
export const sibDecisionConfidence = new client.Histogram({
  name: 'sib_decision_confidence',
  help: 'AI decision confidence scores',
  labelNames: ['type'],
  buckets: [0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0]
});

// Histogram: Decision processing time
export const sibProcessingTime = new client.Histogram({
  name: 'sib_processing_time_ms',
  help: 'Time to process AI decision (milliseconds)',
  labelNames: ['type'],
  buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000]
});

// Counter: Rate limit violations
export const sibRateLimitViolations = new client.Counter({
  name: 'sib_rate_limit_violations_total',
  help: 'Number of rate limit violations',
  labelNames: ['type']
});

// Counter: Circuit breaker trips
export const sibCircuitBreakerTrips = new client.Counter({
  name: 'sib_circuit_breaker_trips_total',
  help: 'Number of circuit breaker trips',
  labelNames: ['type']
});

// Counter: Policy violations
export const sibPolicyViolations = new client.Counter({
  name: 'sib_policy_violations_total',
  help: 'Number of policy violations',
  labelNames: ['type', 'policy']
});

// Gauge: Current rate limit usage
export const sibRateLimitUsage = new client.Gauge({
  name: 'sib_rate_limit_usage',
  help: 'Current rate limit usage by decision type',
  labelNames: ['type']
});

// Helper functions
export function recordDecision(type, status, confidence, processingTimeMs) {
  sibDecisionsTotal.inc({ type, status });
  sibDecisionConfidence.observe({ type }, confidence);
  sibProcessingTime.observe({ type }, processingTimeMs);
}

export function recordRejection(type, reason) {
  sibDecisionsRejected.inc({ type, reason });
}

export function recordApproval(type, outcome) {
  sibApprovalsTotal.inc({ type, outcome });
}

export function updatePendingApprovals(count) {
  sibApprovalsPending.set(count);
}

export function setKillSwitchStatus(active) {
  sibKillSwitchActive.set(active ? 1 : 0);
}

export function recordRateLimitViolation(type) {
  sibRateLimitViolations.inc({ type });
}

export function recordCircuitBreaker(type) {
  sibCircuitBreakerTrips.inc({ type });
}

export function recordPolicyViolation(type, policy) {
  sibPolicyViolations.inc({ type, policy });
}

export function updateRateLimitUsage(type, count) {
  sibRateLimitUsage.set({ type }, count);
}

export default {
  recordDecision,
  recordRejection,
  recordApproval,
  updatePendingApprovals,
  setKillSwitchStatus,
  recordRateLimitViolation,
  recordCircuitBreaker,
  recordPolicyViolation,
  updateRateLimitUsage
};
