/**
 * RCM Success-Fee Ledger (Model 4 monetisation wrapper).
 * The prediction/claims stack already exists (ai-revenue.route.js, claims-rules-engine);
 * this bills the platform 3–5% of recovered revenue via the shared revenue-share ledger.
 */
import {
  recordRevenueEvent, ledgerSummary, listLedger,
} from './revenue-share-ledger.service.js';

export const RCM_DOMAIN = 'rcm';
export const DEFAULT_SUCCESS_FEE_PERCENT = 4; // doc range: 3–5%

/**
 * Bill the success fee on a recovered claim. Idempotent per claim:
 * safe to call again (e.g., recovery pipeline retry) — returns original entry.
 * @param {object} p
 * @param {number} p.organizationId      hospital/org whose claim was recovered
 * @param {string|number} p.claimId      claim identifier
 * @param {number} p.recoveredAmount     INR amount actually recovered
 * @param {number} [p.successFeePercent] override (default 4%)
 */
export async function recordRecoveredRevenue({ organizationId, claimId, recoveredAmount, successFeePercent, metadata = {} }) {
  const gross = Number(recoveredAmount);
  if (!Number.isFinite(gross) || gross <= 0) throw new Error(`invalid recoveredAmount: ${recoveredAmount}`);
  const rate = successFeePercent != null ? Number(successFeePercent) : DEFAULT_SUCCESS_FEE_PERCENT;
  if (!(rate >= 3 && rate <= 5)) throw new Error(`success fee ${rate}% outside contracted 3–5% band`);

  return recordRevenueEvent({
    organizationId,
    domain: RCM_DOMAIN,
    sourceType: 'recovered_claim',
    sourceId: String(claimId),
    grossAmount: gross,
    description: `RCM success fee (${rate}%) on recovered claim ${claimId}`,
    fallbackAgreement: { fee_type: 'percent', fee_rate: rate, counterparty_type: 'platform' },
    metadata: { claimId, recoveredAmount: gross, successFeePercent: rate, ...metadata },
  });
}

export async function getRcmFeeSummary(organizationId) {
  return ledgerSummary(organizationId, { domain: RCM_DOMAIN });
}

export async function listRcmFeeEntries(organizationId, { status = null, limit = 100, offset = 0 } = {}) {
  return listLedger(organizationId, { domain: RCM_DOMAIN, status, limit, offset });
}
