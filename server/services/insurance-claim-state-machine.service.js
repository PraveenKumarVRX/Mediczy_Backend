/**
 * Insurance Claim / Pre-Authorisation State Machine — Eve-Healthcare pattern
 *
 * Eve-Healthcare implements a formal Booking State Machine governing lifecycle
 * transitions (pending → confirmed → cancelled/completed). This module ports
 * that pattern to Mediqzy's insurance/RCM module, defining a formal state
 * machine for insurance claims and pre-authorisations so that status transitions
 * are auditable, guarded, and cannot bypass required intermediate states.
 *
 * States:
 *   draft            — claim being prepared, not yet submitted
 *   submitted        — claim submitted to payer/TPA, awaiting acknowledgement
 *   pending          — payer has acknowledged, under review
 *   query            — payer raised a query / shortfall; documents requested
 *   approved         — payer approved the claim
 *   rejected         — payer rejected the claim
 *   paid             — payment received and posted
 *   denied           — formal denial recorded (appeal possible)
 *   appeal_drafted   — appeal letter drafted
 *   appeal_submitted — appeal submitted to payer
 *   appealed_approved— appeal successful, claim approved
 *   appealed_rejected— appeal unsuccessful
 *   closed           — terminal state (paid, rejected, or appealed_rejected with no further action)
 *
 * Transitions are guarded: e.g. a claim cannot move from draft → paid without
 * going through submitted → approved → paid. Query responses must go back
 * through pending before approval.
 */
const CLAIM_STATES = new Set([
  'draft', 'submitted', 'pending', 'query', 'approved', 'rejected', 'paid',
  'denied', 'appeal_drafted', 'appeal_submitted', 'appealed_approved',
  'appealed_rejected', 'closed'
]);

const PREAUTH_STATES = new Set([
  'draft', 'submitted', 'pending', 'approved', 'rejected', 'paid', 'denied', 'closed'
]);

/**
 * Allowed transitions: from → [allowed to]
 * A transition not listed here is rejected.
 */
export const CLAIM_TRANSITIONS = {
  draft: ['submitted'],
  submitted: ['pending', 'rejected'],
  pending: ['query', 'approved', 'rejected'],
  query: ['pending', 'rejected', 'submitted'], // resubmit after query response
  approved: ['paid', 'rejected', 'denied'],
  rejected: ['submitted', 'denied'], // resubmit corrected claim or escalate to denial
  paid: ['closed'],
  denied: ['appeal_drafted'],
  appeal_drafted: ['appeal_submitted'],
  appeal_submitted: ['appealed_approved', 'appealed_rejected'],
  appealed_approved: ['paid'],
  appealed_rejected: ['closed'],
  closed: [] // terminal
};

export const PREAUTH_TRANSITIONS = {
  draft: ['submitted'],
  submitted: ['pending', 'rejected'],
  pending: ['approved', 'rejected'],
  approved: ['paid', 'rejected'],
  rejected: ['submitted'], // resubmit with corrections
  paid: ['closed'],
  denied: [],
  closed: [] // terminal
};

/**
 * Validate a state transition for an insurance claim.
 * Returns { valid: true } or { valid: false, reason }.
 */
export function validateClaimTransition(fromStatus, toStatus) {
  if (!CLAIM_STATES.has(fromStatus)) {
    return { valid: false, reason: `Invalid source state: ${fromStatus}` };
  }
  if (!CLAIM_STATES.has(toStatus)) {
    return { valid: false, reason: `Invalid target state: ${toStatus}` };
  }
  const allowed = CLAIM_TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(toStatus)) {
    return {
      valid: false,
      reason: `Transition not allowed: ${fromStatus} → ${toStatus}. Allowed: ${allowed.join(', ') || 'none'}`
    };
  }
  return { valid: true };
}

/**
 * Validate a state transition for a pre-authorisation.
 */
export function validatePreAuthTransition(fromStatus, toStatus) {
  if (!PREAUTH_STATES.has(fromStatus)) {
    return { valid: false, reason: `Invalid source state: ${fromStatus}` };
  }
  if (!PREAUTH_STATES.has(toStatus)) {
    return { valid: false, reason: `Invalid target state: ${toStatus}` };
  }
  const allowed = PREAUTH_TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(toStatus)) {
    return {
      valid: false,
      reason: `Transition not allowed: ${fromStatus} → ${toStatus}. Allowed: ${allowed.join(', ') || 'none'}`
    };
  }
  return { valid: true };
}

/**
 * Get all allowed next states from a given claim status.
 */
export function getNextClaimStates(fromStatus) {
  return CLAIM_TRANSITIONS[fromStatus] || [];
}

/**
 * Get all allowed next states from a given pre-auth status.
 */
export function getNextPreAuthStates(fromStatus) {
  return PREAUTH_TRANSITIONS[fromStatus] || [];
}

/**
 * Check whether a state is terminal.
 */
export function isTerminalState(status, type = 'claim') {
  if (type === 'claim') return status === 'closed';
  if (type === 'preauth') return status === 'closed';
  return false;
}

/**
 * Get the default initial state.
 */
export function getInitialState(type = 'claim') {
  return type === 'preauth' ? 'draft' : 'draft';
}

export default {
  CLAIM_STATES,
  PREAUTH_STATES,
  CLAIM_TRANSITIONS,
  PREAUTH_TRANSITIONS,
  validateClaimTransition,
  validatePreAuthTransition,
  getNextClaimStates,
  getNextPreAuthStates,
  isTerminalState,
  getInitialState
};