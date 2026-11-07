/**
 * Unified RCM cockpit (Phase 3).
 *
 * Composes the Phase-1/2 building blocks into a single command-center payload and
 * adds two derived reports: claim realization (recovery per claim) and
 * revenue-leakage estimation. Everything is built on data the platform already
 * holds (insurance_claims, era_remittances, claim_denials, ar_follow_up_items);
 * no new tables.
 *
 * Note on terminology: true claim *profitability* needs case-cost accounting
 * (consumables/OT/bed/pharmacy) which lives in the hospital billing ledger, not
 * on the claim. This module reports *realization / recovery* (settled vs billed/
 * approved) — the defensible margin signal from claims data — and flags the cost
 * join as the remaining step for full profitability.
 */
import pool from './../db/pgPool.js';
import { withRlsTransaction } from '../middleware/rls-context.middleware.js';
import rcmGovernance from './insurance-rcm-governance.service.js';
import arFollowUp from './ar-follow-up.service.js';

function parsePeriod(from, to, defaultDays = 90) {
  const fromDate = from ? new Date(from) : new Date(Date.now() - defaultDays * 86400000);
  const toDate = to ? new Date(to) : new Date();
  if (Number.isNaN(fromDate.valueOf()) || Number.isNaN(toDate.valueOf()) || fromDate >= toDate) throw new Error('Invalid reporting period');
  return { fromDate, toDate };
}

/**
 * Revenue-leakage estimate — money at risk or lost, by explicit signal:
 *   underpaid     — flagged ERA short-pay shortfall (hard loss unless recovered)
 *   deniedExposure— denied amount in period (exposure; recoverable via appeal)
 *   agedOver180   — outstanding on claims aged > 180d (deep collection risk)
 *   rejectedStale — unsettled balance on rejected claims idle > 30d (no resubmission)
 * estimatedLeakage = underpaid + agedOver180 + rejectedStale (deniedExposure shown
 * separately because an active appeal may still recover it).
 */
export async function revenueLeakage(hospitalId, { from, to } = {}) {
  const { fromDate, toDate } = parsePeriod(from, to, 180);
  const underpaidQ = await pool.query(
    `SELECT COALESCE(SUM(shortfall_amount),0) AS amt, COUNT(*)::int AS n
       FROM era_remittances
      WHERE hospital_id = $1 AND short_paid = TRUE AND posted_at >= $2 AND posted_at < $3`,
    [hospitalId, fromDate.toISOString(), toDate.toISOString()]);
  const deniedQ = await pool.query(
    `SELECT COALESCE(SUM(denied_amount),0) AS amt, COUNT(*)::int AS n
       FROM claim_denials
      WHERE hospital_id = $1 AND created_at >= $2 AND created_at < $3`,
    [hospitalId, fromDate.toISOString(), toDate.toISOString()]);
  const claimsSide = await withRlsTransaction(pool, { orgId: hospitalId, userId: 0, isPlatformAdmin: false }, async (client) => {
    const aged = await client.query(
      `SELECT COALESCE(SUM(GREATEST(0, COALESCE(claim_amount,0) - COALESCE(settled_amount,0))),0) AS amt, COUNT(*)::int AS n
         FROM insurance_claims
        WHERE hospital_id = $1 AND status NOT IN ('paid','closed','rejected','denied')
          AND GREATEST(0, CURRENT_DATE - COALESCE(submitted_date, created_at::date)) > 180`, [hospitalId]);
    const rejected = await client.query(
      `SELECT COALESCE(SUM(GREATEST(0, COALESCE(claim_amount,0) - COALESCE(settled_amount,0))),0) AS amt, COUNT(*)::int AS n
         FROM insurance_claims
        WHERE hospital_id = $1 AND status = 'rejected' AND updated_at < now() - INTERVAL '30 days'`, [hospitalId]);
    return { aged: aged.rows[0], rejected: rejected.rows[0] };
  });
  const underpaid = Number(underpaidQ.rows[0].amt);
  const deniedExposure = Number(deniedQ.rows[0].amt);
  const agedOver180 = Number(claimsSide.aged.amt);
  const rejectedStale = Number(claimsSide.rejected.amt);
  const estimatedLeakage = Math.round((underpaid + agedOver180 + rejectedStale) * 100) / 100;
  return {
    period: { from: fromDate.toISOString(), to: toDate.toISOString() },
    estimatedLeakage,
    signals: {
      underpaid:      { amount: Math.round(underpaid * 100) / 100,     count: underpaidQ.rows[0].n },
      deniedExposure: { amount: Math.round(deniedExposure * 100) / 100, count: deniedQ.rows[0].n },
      agedOver180:    { amount: Math.round(agedOver180 * 100) / 100,   count: Number(claimsSide.aged.n) },
      rejectedStale:  { amount: Math.round(rejectedStale * 100) / 100, count: Number(claimsSide.rejected.n) },
    },
  };
}

/**
 * Claim realization / recovery — per-claim recovery against billed and approved,
 * with ERA write-offs rolled in. (Full profitability needs the case-cost join.)
 */
export async function claimRealization(hospitalId, { from, to, limit = 100 } = {}) {
  const { fromDate, toDate } = parsePeriod(from, to, 90);
  const lim = Math.max(1, Math.min(1000, Number(limit) || 100));
  return withRlsTransaction(pool, { orgId: hospitalId, userId: 0, isPlatformAdmin: false }, async (client) => {
    const { rows } = await client.query(
      `WITH era AS (
         SELECT claim_id, COALESCE(SUM(adjustment_amount),0) AS write_off, COALESCE(SUM(shortfall_amount),0) AS shortfall
           FROM era_remittances WHERE hospital_id = $1 GROUP BY claim_id
       )
       SELECT c.id AS claim_id, c.claim_number,
              COALESCE(NULLIF(c.insurance_provider,''), NULLIF(c.scheme_name,''), 'Unassigned') AS payer,
              COALESCE(c.claim_amount,0)  AS billed,
              COALESCE(c.approved_amount,0) AS approved,
              COALESCE(c.settled_amount,0) AS collected,
              COALESCE(e.write_off,0)     AS write_off,
              COALESCE(e.shortfall,0)     AS shortfall,
              c.status
         FROM insurance_claims c
         LEFT JOIN era e ON e.claim_id = c.id
        WHERE c.hospital_id = $1 AND c.created_at >= $2 AND c.created_at < $3
        ORDER BY (COALESCE(c.claim_amount,0) - COALESCE(c.settled_amount,0)) DESC
        LIMIT $4`, [hospitalId, fromDate.toISOString(), toDate.toISOString(), lim]);
    const items = rows.map((r) => {
      const billed = Number(r.billed), collected = Number(r.collected), approved = Number(r.approved);
      return {
        ...r,
        realizationRate: billed ? Math.round((collected / billed) * 1000) / 10 : 0,      // collected vs billed, %
        approvalRate: billed ? Math.round((approved / billed) * 1000) / 10 : 0,          // approved vs billed, %
        recoveryGap: Math.round((billed - collected - Number(r.write_off)) * 100) / 100, // unexplained unrecovered
      };
    });
    const totBilled = items.reduce((s, r) => s + Number(r.billed), 0);
    const totCollected = items.reduce((s, r) => s + Number(r.collected), 0);
    const totWriteOff = items.reduce((s, r) => s + Number(r.write_off), 0);
    return {
      period: { from: fromDate.toISOString(), to: toDate.toISOString() },
      summary: {
        claims: items.length,
        billed: Math.round(totBilled * 100) / 100,
        collected: Math.round(totCollected * 100) / 100,
        writeOff: Math.round(totWriteOff * 100) / 100,
        realizationRate: totBilled ? Math.round((totCollected / totBilled) * 1000) / 10 : 0,
        note: 'Realization = collected ÷ billed. True profitability requires the case-cost join (billing ledger).',
      },
      items,
    };
  });
}

/** One command-center payload: KPIs + aging + denial Pareto + short-pay + AR queue + leakage. */
export async function rcmCockpit(hospitalId, actor, { from, to } = {}) {
  const [analytics, pareto, shortPays, arQueue, leakage] = await Promise.all([
    rcmGovernance.payerRcmAnalytics(hospitalId, actor, { from, to }),
    rcmGovernance.denialPareto(hospitalId, { from, to, limit: 5 }),
    rcmGovernance.listShortPayments(hospitalId, { from, to, limit: 10 }),
    arFollowUp.listArWorkQueue(hospitalId, { status: 'open', limit: 500 }),
    revenueLeakage(hospitalId, { from, to }),
  ]);
  const o = analytics.overall || {};
  return {
    period: analytics.period,
    kpis: {
      claims: o.claim_count || 0,
      claimedAmount: o.claimed_amount || 0,
      collectedAmount: o.collected_amount || 0,
      outstandingAmount: o.outstanding_amount || 0,
      daysInAr: o.daysInAr || 0,
      collectionRate: o.collectionRate || 0,
      denialRate: o.denialRate || 0,
      cleanClaimRate: o.cleanClaimRate || 0,
      estimatedLeakage: leakage.estimatedLeakage,
      openArItems: arQueue.openCount,
      openArOutstanding: arQueue.totalOutstanding,
      shortPayCount: shortPays.count,
      shortPayShortfall: shortPays.totalShortfall,
    },
    agingBuckets: {
      '0-30': o.ar_0_30 || 0, '31-60': o.ar_31_60 || 0, '61-90': o.ar_61_90 || 0,
      '91-180': o.ar_91_180 || 0, '180+': o.ar_180_plus || 0,
    },
    topPayers: (analytics.payers || []).slice(0, 8),
    denialPareto: pareto.items,
    topShortPayments: shortPays.items,
    leakage,
  };
}

export default { revenueLeakage, claimRealization, rcmCockpit };
