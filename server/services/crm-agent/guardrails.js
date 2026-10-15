/** Pure guardrails shared by the CRM agent runner and tests. */

export const MAX_ITERATIONS = 5;
export const MAX_TOOL_FAILURES = 3;
export const PROPOSAL_TTL_MS = 15 * 60 * 1000;

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function proposalMatches(proposal, { tenantUid, corporateUid = null, actorUserId, toolName, args }) {
  if (!proposal) return false;
  return String(proposal.tenant_uid) === String(tenantUid)
    && String(proposal.corporate_uid || '') === String(corporateUid || '')
    && String(proposal.actor_user_id) === String(actorUserId)
    && proposal.tool_name === toolName
    && canonicalJson(proposal.args || {}) === canonicalJson(args || {});
}

export function isProposalExpired(proposal, now = Date.now()) {
  if (!proposal?.expires_at) return true;
  return new Date(proposal.expires_at).getTime() <= now;
}
