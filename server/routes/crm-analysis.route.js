/**
 * CRM RFQ Analysis Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Retrospective  : Year-wise historical policy data entry + claims experience
 * Prospective    : Demographic projections, medical inflation, industry benchmarks
 * Cost Modelling : Actuarial pure-premium calculation with experience + manual rating
 * Quote Engine   : 3 winning quote strategies with AI narrative explaining each
 * ─────────────────────────────────────────────────────────────────────────────
 */

import express from 'express';
import { authCRM } from '../middleware/crm.middleware.js';
import sharedPool from '../db/pgPool.js';
import llmProvider from '../services/ai-brain/llm-provider.js';

const router = express.Router();

// pg returns JSONB columns as already-parsed JS objects; this handles both cases
function safeJSON(v, fallback = []) {
  if (v === null || v === undefined) return fallback;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return fallback; }
}

// ─── LLM helper ──────────────────────────────────────────────────────────────
const aiComplete = async (messages, opts = {}) => {
  const result = await llmProvider.chat({ messages, maxTokens: opts.maxTokens || 2500, temperature: opts.temperature || 0.2 });
  return result?.content || result?.text || result?.message || String(result || '');
};

// ─── DB Bootstrap ─────────────────────────────────────────────────────────────
async function ensureTables() {
  await sharedPool.query(`
    -- Year-wise historical policy records (retrospective data)
    CREATE TABLE IF NOT EXISTS crm_rfq_policy_history (
      id                      BIGSERIAL    PRIMARY KEY,
      rfq_id                  BIGINT       NOT NULL REFERENCES crm_rfqs(id) ON DELETE CASCADE,
      year_label              VARCHAR(10)  NOT NULL,        -- 'Y-1', 'Y-2', 'Y-3'
      policy_year_start       DATE,
      policy_year_end         DATE,
      insurer_name            VARCHAR(255),
      tpa_name                VARCHAR(255),
      -- Premium data
      gross_premium           NUMERIC(15,2) DEFAULT 0,
      net_premium             NUMERIC(15,2) DEFAULT 0,
      -- Claims data
      total_claims_incurred   NUMERIC(15,2) DEFAULT 0,
      total_claims_count      INTEGER       DEFAULT 0,
      cat_claims_count        INTEGER       DEFAULT 0,      -- claims > 2L
      cat_claims_amount       NUMERIC(15,2) DEFAULT 0,
      avg_claim_size          NUMERIC(12,2),
      claim_frequency_pct     NUMERIC(6,3),                 -- claims per 100 lives
      -- Risk indicators
      loss_ratio              NUMERIC(6,3),                 -- claims/premium
      copay_collected         NUMERIC(12,2) DEFAULT 0,
      ibnr_reserve            NUMERIC(12,2) DEFAULT 0,
      -- Member counts
      lives_count             INTEGER       DEFAULT 0,
      employee_count          INTEGER       DEFAULT 0,
      -- Top diagnoses / notes
      top_diagnoses           JSONB         DEFAULT '[]'::jsonb,
      notes                   TEXT,
      created_by              INTEGER,
      updated_by              INTEGER,
      created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      UNIQUE(rfq_id, year_label)
    );
    CREATE INDEX IF NOT EXISTS idx_policy_hist_rfq  ON crm_rfq_policy_history(rfq_id);

    -- Cached analysis results (re-generated on demand)
    CREATE TABLE IF NOT EXISTS crm_rfq_analysis_cache (
      id                      BIGSERIAL    PRIMARY KEY,
      rfq_id                  BIGINT       NOT NULL REFERENCES crm_rfqs(id) ON DELETE CASCADE,
      version                 INTEGER      NOT NULL DEFAULT 1,
      -- Risk scoring
      risk_score              NUMERIC(5,2),   -- 0–100 (100 = highest risk)
      risk_tier               VARCHAR(20),    -- 'green','amber','red','black'
      renewal_probability     NUMERIC(4,3),   -- 0–1
      -- Retrospective summary
      avg_loss_ratio          NUMERIC(6,3),
      trend_factor            NUMERIC(6,4),
      claim_frequency_trend   VARCHAR(20),    -- 'improving','stable','deteriorating'
      top_diagnoses           JSONB DEFAULT '[]'::jsonb,
      -- Cost model outputs
      pure_premium_per_life   NUMERIC(12,2),
      loaded_premium_per_life NUMERIC(12,2),
      gross_premium_per_life  NUMERIC(12,2),  -- incl. GST
      total_projected_premium NUMERIC(15,2),
      projected_loss_ratio    NUMERIC(6,3),
      -- Quote strategies (array of 3)
      quote_strategies        JSONB DEFAULT '[]'::jsonb,
      -- AI narrative
      ai_narrative            TEXT,
      ai_executive_summary    TEXT,
      -- Meta
      inputs_snapshot         JSONB DEFAULT '{}'::jsonb,
      generated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      generated_by            INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_analysis_rfq ON crm_rfq_analysis_cache(rfq_id);
  `);
}

ensureTables().catch(e => console.error('[CRM Analysis] DB init error:', e.message));

// ═════════════════════════════════════════════════════════════════════════════
// ─── Actuarial Engine ────────────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

// Age-band claim frequency (claims per 100 members/year, Indian group health norms)
const AGE_BAND_FREQ = { '0-17': 8.5, '18-29': 5.2, '30-44': 7.8, '45-59': 14.5, '60-74': 22.0, '75+': 28.0 };
// Average claim size per age band (₹, Indian group health norms)
const AGE_BAND_AVG_CLAIM = { '0-17': 32000, '18-29': 38000, '30-44': 58000, '45-59': 92000, '60-74': 145000, '75+': 185000 };
// Industry loading factors
const INDUSTRY_FACTORS = {
  IT: 0.88, software: 0.88, technology: 0.88, fintech: 0.90,
  banking: 0.93, finance: 0.93, insurance: 0.95,
  healthcare: 1.00, pharma: 1.03, chemical: 1.05,
  fmcg: 1.00, retail: 1.02, hospitality: 1.05, logistics: 1.08,
  manufacturing: 1.12, auto: 1.10, textile: 1.08,
  construction: 1.22, infrastructure: 1.18, engineering: 1.12,
  mining: 1.32, oil: 1.25,
  education: 0.95, government: 0.98, ngo: 0.97,
  default: 1.00,
};
// SI loading factors (higher SI = higher severity liability)
const SI_LOADING = { 100000: 0.85, 200000: 0.90, 300000: 1.00, 500000: 1.12, 750000: 1.22, 1000000: 1.35, 1500000: 1.48, 2000000: 1.60, 2500000: 1.72 };
// Annual medical inflation (India)
const MEDICAL_INFLATION = 0.145; // 14.5% pa
// Expense/profit loading tiers
const LOADING_TIERS = { competitive: 0.185, balanced: 0.225, premium: 0.270 };

function getAgeBand(age) {
  if (age < 18) return '0-17';
  if (age < 30) return '18-29';
  if (age < 45) return '30-44';
  if (age < 60) return '45-59';
  if (age < 75) return '60-74';
  return '75+';
}

function getIndustryFactor(industry = '') {
  const key = (industry || '').toLowerCase().replace(/[^a-z]/g, '');
  for (const [k, v] of Object.entries(INDUSTRY_FACTORS)) {
    if (key.includes(k)) return v;
  }
  return INDUSTRY_FACTORS.default;
}

function getSILoadingFactor(avgSI) {
  const bands = Object.keys(SI_LOADING).map(Number).sort((a, b) => a - b);
  let factor = 1.0;
  for (const band of bands) {
    if (avgSI >= band) factor = SI_LOADING[band];
    else break;
  }
  return factor;
}

/**
 * Compute demographic-weighted manual rate from age-band member distribution.
 * Returns: { manualPurePremiumPerLife, demographicFactor, avgAge, ageBandBreakdown }
 */
function computeManualRate(ageBands = [], totalMembers = 0) {
  if (!ageBands.length || !totalMembers) {
    return { manualPurePremiumPerLife: 6500, demographicFactor: 1.0, avgAge: 35, ageBandBreakdown: [] };
  }
  let weightedFreqPremium = 0;
  let weightedAge = 0;
  const breakdown = [];
  for (const { age_band, count } of ageBands) {
    const n = parseInt(count) || 0;
    const freq = AGE_BAND_FREQ[age_band] || 8;
    const avgClaim = AGE_BAND_AVG_CLAIM[age_band] || 55000;
    const pureRateForBand = (freq / 100) * avgClaim;
    const weight = n / totalMembers;
    weightedFreqPremium += pureRateForBand * weight;
    // approximate midpoint age for each band
    const midAge = { '0-17': 10, '18-29': 25, '30-44': 38, '45-59': 52, '60-74': 66, '75+': 78 }[age_band] || 35;
    weightedAge += midAge * weight;
    breakdown.push({ age_band, count: n, claim_freq_pct: freq, avg_claim: avgClaim, pure_rate: Math.round(pureRateForBand), weight: +(weight * 100).toFixed(1) });
  }
  // Baseline market rate = 6500/life; demographic factor = deviation from baseline
  const MARKET_BASELINE = 6500;
  const demographicFactor = weightedFreqPremium / MARKET_BASELINE;
  return {
    manualPurePremiumPerLife: Math.round(weightedFreqPremium),
    demographicFactor: +demographicFactor.toFixed(3),
    avgAge: +weightedAge.toFixed(1),
    ageBandBreakdown: breakdown,
  };
}

/**
 * Compute experience-based pure premium from historical claims data.
 * Uses Bühlmann credibility: credibility = n / (n + k) where k = 750 (Indian SME group norm).
 */
function computeExperienceRate(policyHistory = [], projectedLives = 0) {
  if (!policyHistory.length) return null;
  const CREDIBILITY_K = 750;
  let totalLives = 0, totalClaims = 0, yearWeights = [];

  // Weight recent years more heavily (Y-1 = 0.5, Y-2 = 0.33, Y-3 = 0.17)
  const yearWeightMap = { 'Y-1': 0.50, 'Y-2': 0.33, 'Y-3': 0.17 };

  for (const yr of policyHistory) {
    const lives = parseInt(yr.lives_count) || 0;
    const claims = parseFloat(yr.total_claims_incurred) || 0;
    const w = yearWeightMap[yr.year_label] || 0.33;
    if (lives > 0) {
      yearWeights.push({ yr, lives, claims, purePremiumPerLife: claims / lives, weight: w });
      totalLives += lives * w;
      totalClaims += claims * w;
    }
  }
  if (!totalLives) return null;

  const weightedPureRate = totalClaims / totalLives;
  const n = projectedLives || (yearWeights[0]?.lives || 100);
  const credibility = n / (n + CREDIBILITY_K);
  return { weightedPureRate: +weightedPureRate.toFixed(2), credibility: +credibility.toFixed(3), yearWeights };
}

/**
 * Compute loss ratio trend and forward-looking inflation adjustment.
 */
function computeTrend(policyHistory = []) {
  const sorted = [...policyHistory].sort((a, b) => {
    const order = { 'Y-3': 0, 'Y-2': 1, 'Y-1': 2 };
    return (order[a.year_label] || 0) - (order[b.year_label] || 0);
  });
  const lrs = sorted
    .map(y => parseFloat(y.loss_ratio) || (parseFloat(y.total_claims_incurred) / (parseFloat(y.gross_premium) || 1)))
    .filter(v => !isNaN(v) && v > 0);
  if (lrs.length < 2) return { trendFactor: 1.0 + MEDICAL_INFLATION, direction: 'stable', avgLR: lrs[0] || 0.65 };
  const latestLR = lrs[lrs.length - 1];
  const earliestLR = lrs[0];
  const annualChange = Math.pow(latestLR / earliestLR, 1 / (lrs.length - 1)) - 1;
  const trendFactor = 1 + Math.max(annualChange, 0) + MEDICAL_INFLATION;
  const avgLR = lrs.reduce((s, v) => s + v, 0) / lrs.length;
  const direction = annualChange > 0.05 ? 'deteriorating' : annualChange < -0.05 ? 'improving' : 'stable';
  return { trendFactor: +trendFactor.toFixed(4), direction, avgLR: +avgLR.toFixed(4), annualChange: +annualChange.toFixed(4), lrs };
}

/**
 * Master cost model: blends manual rate + experience rate with credibility.
 */
function buildCostModel({ ageBands, totalMembers, policyHistory, industry, avgSI, projectedLives }) {
  const manual = computeManualRate(ageBands, totalMembers);
  const experience = computeExperienceRate(policyHistory, projectedLives || totalMembers);
  const trend = computeTrend(policyHistory);
  const industryFactor = getIndustryFactor(industry);
  const siLoadingFactor = getSILoadingFactor(avgSI || 300000);

  let blendedPureRate;
  if (experience && experience.credibility > 0.15) {
    blendedPureRate = experience.credibility * experience.weightedPureRate * trend.trendFactor
      + (1 - experience.credibility) * manual.manualPurePremiumPerLife * trend.trendFactor;
  } else {
    blendedPureRate = manual.manualPurePremiumPerLife * trend.trendFactor;
  }
  blendedPureRate = blendedPureRate * industryFactor * siLoadingFactor;

  return {
    manual,
    experience,
    trend,
    industryFactor,
    siLoadingFactor,
    blendedPureRate: Math.round(blendedPureRate),
  };
}

/**
 * Compute stop-loss clause impact on gross premium.
 * Returns { netAdjFactor, riCostPerLife, riskReductionPct, riskReductionPerLife }
 * so callers can show a breakdown.
 *
 * Actuarial basis (Indian RI market norms):
 *  - Aggregate stop-loss at X% LR caps insurer liability above X% of premium
 *  - RI reinsurance cost ≈ (100−X)% × 0.25% of gross rate (per market pricing)
 *  - Risk margin reduction ≈ (100−X)% × 0.30% of gross rate (tail risk eliminated)
 *  - Net for client: slight reduction in gross rate (insurer passes some saving)
 */
function computeStopLossAdjustment(stopLossPct, grossRate) {
  if (!stopLossPct || stopLossPct <= 0 || stopLossPct >= 100) {
    return { netAdjFactor: 1, riCostPerLife: 0, riskReductionPct: 0, riskReductionPerLife: 0 };
  }
  const exposure = (100 - stopLossPct) / 100;         // e.g. 0.10 for 90% SL
  const riskReductionPct = exposure * 0.30;            // 90% SL → 3.0% of gross rate saved
  const riCostPct        = exposure * 0.25;            // 90% SL → 2.5% of gross rate cost
  const netReductionPct  = riskReductionPct - riCostPct; // net: +0.5% reduction at 90%
  const netAdjFactor     = 1 - netReductionPct;
  return {
    netAdjFactor: +netAdjFactor.toFixed(4),
    riCostPct:    +(riCostPct * 100).toFixed(2),
    riskReductionPct: +(riskReductionPct * 100).toFixed(2),
    netReductionPct:  +(netReductionPct * 100).toFixed(2),
    riCostPerLife: Math.round(grossRate * riCostPct),
    riskReductionPerLife: Math.round(grossRate * riskReductionPct),
  };
}

/**
 * Build 3 differentiated quote strategies from the cost model output.
 */
function buildQuoteStrategies(costModel, rfq, policyHistory, stopLossPct = null) {
  const { blendedPureRate, trend, manual } = costModel;
  const lives = parseInt(rfq.member_count) || 100;
  const avgSI = parseInt((safeJSON(rfq.sum_insured_slabs, [])?.[0]) || 300000);
  const latestPremium = policyHistory.find(y => y.year_label === 'Y-1')?.gross_premium;
  const latestLR = trend.avgLR;
  const avgAge = manual.avgAge;

  const strategies = [];

  // Pre-compute stop-loss adjustment on base gross rate (applied across all strategies)
  const slBaseGross = blendedPureRate / (1 - LOADING_TIERS.balanced); // use balanced as base reference
  const slAdj = computeStopLossAdjustment(stopLossPct, slBaseGross);
  const slNote = stopLossPct
    ? `${stopLossPct}% aggregate stop-loss (RI cost ₹${slAdj.riCostPerLife}/life, risk saving ₹${slAdj.riskReductionPerLife}/life, net ${slAdj.netReductionPct > 0 ? '-' : '+'}${Math.abs(slAdj.netReductionPct)}% on gross rate)`
    : null;

  // ── Strategy A: Value Champion ───────────────────────────────────────────
  const loadingA = LOADING_TIERS.competitive;
  const grossRateA = Math.round(blendedPureRate / (1 - loadingA) * slAdj.netAdjFactor);
  const premiumA = Math.round(grossRateA * 1.18); // with GST
  const siA = Math.max(avgSI * 0.8, 200000);
  const totalA = Math.round(premiumA * lives);
  const discountVsPrev = latestPremium ? ((latestPremium / lives - grossRateA) / (latestPremium / lives) * 100).toFixed(1) : null;

  strategies.push({
    strategy: 'A',
    name: 'Value Champion',
    tagline: 'Lowest cost of ownership — win on price',
    premium_per_life_ex_gst: Math.round(grossRateA),
    premium_per_life_incl_gst: premiumA,
    total_premium_incl_gst: totalA,
    loading_pct: +(loadingA * 100).toFixed(1),
    target_loss_ratio: +((blendedPureRate / grossRateA) * 100).toFixed(1),
    sum_insured: siA,
    co_pay_pct: 10,
    room_rent_limit: '1% of SI / day',
    maternity: 'optional',
    opd: false,
    wellness: false,
    network: 'preferred_network',
    deductible: null,
    key_features: [
      `₹${(siA / 100000).toFixed(1)}L sum insured per family`,
      '10% co-pay on admissible claims',
      'Preferred network hospitals only',
      'No OPD / no wellness add-ons',
      'Standard waiting periods apply',
    ],
    why_wins: [
      'Delivers the most competitive per-life premium in the market',
      avgAge < 38 ? 'Young demographic keeps claims predictable — co-pay is low-impact' : 'Co-pay dampens moral hazard in a higher-risk age profile',
      latestLR > 0.85 ? 'After a loss-making year, re-pricing with cost controls protects your book' : 'Sustainable even at current loss ratio with co-pay buffer',
      discountVsPrev && discountVsPrev > 0 ? `~${discountVsPrev}% lower than existing premium — hard to beat on renewal` : 'Structured for maximum price competitiveness',
      'Best suited for price-sensitive brokers and cost-focused HR teams',
    ],
    best_for: 'Price-sensitive corporate with young workforce / cost-focused CFO-driven decision',
  });

  // ── Strategy B: Balanced Performer ───────────────────────────────────────
  const loadingB = LOADING_TIERS.balanced;
  const grossRateB = Math.round(blendedPureRate / (1 - loadingB) * slAdj.netAdjFactor);
  const premiumB = Math.round(grossRateB * 1.18);
  const siB = Math.max(avgSI, 300000);
  const totalB = Math.round(premiumB * lives);

  strategies.push({
    strategy: 'B',
    name: 'Balanced Performer',
    tagline: 'Best value for money — win on balanced coverage',
    premium_per_life_ex_gst: Math.round(grossRateB),
    premium_per_life_incl_gst: premiumB,
    total_premium_incl_gst: totalB,
    loading_pct: +(loadingB * 100).toFixed(1),
    target_loss_ratio: +((blendedPureRate / grossRateB) * 100).toFixed(1),
    sum_insured: siB,
    co_pay_pct: 0,
    room_rent_limit: 'None (as per IRDAI mandate)',
    maternity: 'included_50k_limit',
    opd: false,
    wellness: 'digital_wellness',
    network: 'pan_india',
    deductible: null,
    key_features: [
      `₹${(siB / 100000).toFixed(1)}L sum insured per family`,
      'Zero co-pay — full claims coverage',
      'Maternity included up to ₹50,000',
      'Digital wellness app access',
      'PAN India cashless network',
    ],
    why_wins: [
      'No co-pay is the single most valued benefit in employee surveys — HR will champion this',
      'Digital wellness reduces claim frequency by 8–12% over 2 years (industry data)',
      `At ₹${premiumB.toLocaleString()} per life, falls within most mid-market budgets`,
      'Maternity inclusion removes a major pain point for young employee groups',
      'Structured for sustainable renewal: ' + +(blendedPureRate / grossRateB * 100).toFixed(0) + '% target LR leaves room for claims fluctuation',
    ],
    best_for: 'Mid-size corporate (100–500 lives), HR-driven decision, balanced cost vs coverage priority',
  });

  // ── Strategy C: Premium Shield ────────────────────────────────────────────
  const loadingC = LOADING_TIERS.premium;
  const grossRateC = Math.round(blendedPureRate / (1 - loadingC) * slAdj.netAdjFactor);
  const premiumC = Math.round(grossRateC * 1.18);
  const siC = Math.max(avgSI * 2, 500000);
  const totalC = Math.round(premiumC * lives);

  strategies.push({
    strategy: 'C',
    name: 'Premium Shield',
    tagline: 'Comprehensive protection — win on coverage depth',
    premium_per_life_ex_gst: Math.round(grossRateC),
    premium_per_life_incl_gst: premiumC,
    total_premium_incl_gst: totalC,
    loading_pct: +(loadingC * 100).toFixed(1),
    target_loss_ratio: +((blendedPureRate / grossRateC) * 100).toFixed(1),
    sum_insured: siC,
    co_pay_pct: 0,
    room_rent_limit: 'None',
    maternity: 'included_75k_limit',
    opd: 'up_to_15k_per_life',
    wellness: 'full_wellness_suite',
    network: 'pan_india_plus_international_emergency',
    deductible: null,
    critical_illness_rider: true,
    key_features: [
      `₹${(siC / 100000).toFixed(1)}L sum insured per family`,
      'OPD cover up to ₹15,000 per life per year',
      'Critical illness rider (20 conditions)',
      'International emergency cover',
      'Full wellness suite + annual health checkup',
      'Dedicated claims relationship manager',
    ],
    why_wins: [
      'Companies competing for talent use this as a hiring and retention tool',
      'OPD cover eliminates the #1 employee complaint about group health — outpatient costs',
      'CI rider provides catastrophe protection that GMC alone cannot offer',
      `High SI of ₹${(siC / 100000).toFixed(1)}L positions the employer as genuinely caring for employee welfare`,
      'International emergency cover is table-stakes for senior management and frequent travelers',
      'Wellness suite generates measurable ROI through preventive care and reduced hospitalisation',
    ],
    best_for: 'Large corporate (500+ lives), tech/finance sector, talent retention priority, executive benefit programme',
  });

  // Attach stop-loss clause metadata to all strategies if applicable
  if (stopLossPct && slAdj.riCostPerLife > 0) {
    for (const s of strategies) {
      s.stop_loss_clause = {
        aggregate_stop_loss_pct: stopLossPct,
        ri_cost_per_life: slAdj.riCostPerLife,
        risk_saving_per_life: slAdj.riskReductionPerLife,
        net_premium_impact_pct: slAdj.netReductionPct,
        note: slNote,
      };
      s.key_features.push(`${stopLossPct}% aggregate stop-loss reinsurance clause included`);
      s.why_wins.push(`Stop-loss at ${stopLossPct}% LR caps insurer tail-risk — RI cost ₹${slAdj.riCostPerLife}/life netted against ₹${slAdj.riskReductionPerLife}/life risk saving`);
    }
  }

  return strategies;
}

/**
 * Compute overall risk score (0–100) and tier.
 */
function computeRiskScore({ avgLR, trendDirection, avgAge, industryFactor, catClaimsRatio = 0 }) {
  let score = 40; // base
  // Loss ratio contribution (max 35 pts)
  if (avgLR > 0) {
    if (avgLR < 0.55) score += 0;
    else if (avgLR < 0.70) score += 8;
    else if (avgLR < 0.85) score += 18;
    else if (avgLR < 1.0) score += 28;
    else score += 35;
  }
  // Trend (max 15 pts)
  if (trendDirection === 'deteriorating') score += 15;
  else if (trendDirection === 'stable') score += 5;
  // Age (max 15 pts)
  if (avgAge > 55) score += 15;
  else if (avgAge > 45) score += 8;
  else if (avgAge > 38) score += 3;
  // Industry (max 10 pts)
  if (industryFactor > 1.2) score += 10;
  else if (industryFactor > 1.1) score += 5;
  // Catastrophic claims (max 10 pts)
  score += Math.min(catClaimsRatio * 20, 10);
  score = Math.min(Math.max(score, 0), 100);
  const tier = score < 40 ? 'green' : score < 60 ? 'amber' : score < 80 ? 'red' : 'black';
  return { score: +score.toFixed(1), tier };
}

// ═════════════════════════════════════════════════════════════════════════════
// ─── Routes ──────────────────────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

// ─── GET policy history (retrospective data) ─────────────────────────────────
router.get('/rfqs/:rfqId/policy-history', authCRM, async (req, res) => {
  try {
    const { rows } = await sharedPool.query(
      `SELECT * FROM crm_rfq_policy_history WHERE rfq_id = $1 ORDER BY
        CASE year_label WHEN 'Y-1' THEN 1 WHEN 'Y-2' THEN 2 WHEN 'Y-3' THEN 3 ELSE 4 END`,
      [req.params.rfqId]
    );
    return res.json({ success: true, data: rows });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

// ─── UPSERT one policy year (retrospective data entry) ───────────────────────
router.put('/rfqs/:rfqId/policy-history/:yearLabel', authCRM, async (req, res) => {
  try {
    const { rfqId, yearLabel } = req.params;
    if (!['Y-1', 'Y-2', 'Y-3'].includes(yearLabel)) {
      return res.status(400).json({ success: false, message: 'yearLabel must be Y-1, Y-2 or Y-3' });
    }
    const {
      policy_year_start, policy_year_end, insurer_name, tpa_name,
      gross_premium, net_premium,
      total_claims_incurred, total_claims_count,
      cat_claims_count, cat_claims_amount,
      copay_collected, ibnr_reserve,
      lives_count, employee_count, top_diagnoses, notes,
    } = req.body;

    // Auto-compute derived fields
    const lr = gross_premium && total_claims_incurred
      ? (parseFloat(total_claims_incurred) / parseFloat(gross_premium)).toFixed(4) : null;
    const avgClaim = total_claims_count && total_claims_incurred
      ? (parseFloat(total_claims_incurred) / parseInt(total_claims_count)).toFixed(2) : null;
    const freqPct = lives_count && total_claims_count
      ? ((parseInt(total_claims_count) / parseInt(lives_count)) * 100).toFixed(3) : null;

    const { rows } = await sharedPool.query(
      `INSERT INTO crm_rfq_policy_history
         (rfq_id, year_label, policy_year_start, policy_year_end, insurer_name, tpa_name,
          gross_premium, net_premium, total_claims_incurred, total_claims_count,
          cat_claims_count, cat_claims_amount, avg_claim_size, claim_frequency_pct,
          loss_ratio, copay_collected, ibnr_reserve, lives_count, employee_count,
          top_diagnoses, notes, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$22)
       ON CONFLICT (rfq_id, year_label) DO UPDATE SET
         policy_year_start=$3, policy_year_end=$4, insurer_name=$5, tpa_name=$6,
         gross_premium=$7, net_premium=$8, total_claims_incurred=$9, total_claims_count=$10,
         cat_claims_count=$11, cat_claims_amount=$12, avg_claim_size=$13, claim_frequency_pct=$14,
         loss_ratio=$15, copay_collected=$16, ibnr_reserve=$17, lives_count=$18, employee_count=$19,
         top_diagnoses=$20, notes=$21, updated_by=$22, updated_at=NOW()
       RETURNING *`,
      [rfqId, yearLabel, policy_year_start || null, policy_year_end || null,
       insurer_name || null, tpa_name || null,
       parseFloat(gross_premium) || 0, parseFloat(net_premium) || 0,
       parseFloat(total_claims_incurred) || 0, parseInt(total_claims_count) || 0,
       parseInt(cat_claims_count) || 0, parseFloat(cat_claims_amount) || 0,
       avgClaim, freqPct, lr,
       parseFloat(copay_collected) || 0, parseFloat(ibnr_reserve) || 0,
       parseInt(lives_count) || 0, parseInt(employee_count) || 0,
       JSON.stringify(top_diagnoses || []), notes || null,
       req.crmUser?.id || null]
    );
    return res.json({ success: true, data: rows[0] });
  } catch (err) { console.error('[Policy History Upsert]', err.message); return res.status(500).json({ success: false, message: err.message }); }
});

// ─── DELETE one policy year ───────────────────────────────────────────────────
router.delete('/rfqs/:rfqId/policy-history/:yearLabel', authCRM, async (req, res) => {
  try {
    await sharedPool.query(`DELETE FROM crm_rfq_policy_history WHERE rfq_id=$1 AND year_label=$2`,
      [req.params.rfqId, req.params.yearLabel]);
    return res.json({ success: true });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

// ─── GET cached latest analysis ──────────────────────────────────────────────
router.get('/rfqs/:rfqId/analysis', authCRM, async (req, res) => {
  try {
    const { rows } = await sharedPool.query(
      `SELECT * FROM crm_rfq_analysis_cache WHERE rfq_id=$1 ORDER BY version DESC LIMIT 1`,
      [req.params.rfqId]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'No analysis found — run POST /generate first' });
    return res.json({ success: true, data: rows[0] });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

// ─── POST: Generate full analysis (the main engine) ──────────────────────────
router.post('/rfqs/:rfqId/generate', authCRM, async (req, res) => {
  try {
    const { rfqId } = req.params;
    const { prospective = {} } = req.body; // optional overrides: projected_lives, si_override, industry, stop_loss_pct

    // ── Load RFQ ──────────────────────────────────────────────────────────
    const rfqRes = await sharedPool.query(`SELECT * FROM crm_rfqs WHERE id=$1`, [rfqId]);
    if (!rfqRes.rows.length) return res.status(404).json({ success: false, message: 'RFQ not found' });
    const rfq = rfqRes.rows[0];

    // ── Load retrospective: policy history + uploaded claims ─────────────
    const [histRes, ageBandRes, claimsAggRes] = await Promise.all([
      sharedPool.query(`SELECT * FROM crm_rfq_policy_history WHERE rfq_id=$1 ORDER BY year_label`, [rfqId]),
      sharedPool.query(`SELECT
        CASE WHEN age < 18 THEN '0-17' WHEN age < 30 THEN '18-29' WHEN age < 45 THEN '30-44'
             WHEN age < 60 THEN '45-59' WHEN age < 75 THEN '60-74' ELSE '75+' END AS age_band,
        COUNT(*) AS count
        FROM crm_rfq_members WHERE rfq_id=$1 AND age IS NOT NULL GROUP BY 1`, [rfqId]),
      sharedPool.query(`SELECT
        COUNT(*)                                         AS total_claims,
        COALESCE(SUM(claimed_amount),0)                  AS total_claimed,
        COALESCE(SUM(approved_amount),0)                 AS total_approved,
        COALESCE(AVG(approved_amount),0)                 AS avg_claim,
        COUNT(*) FILTER (WHERE approved_amount > 200000) AS cat_claims,
        COALESCE(SUM(approved_amount) FILTER (WHERE approved_amount > 200000),0) AS cat_amount
        FROM crm_rfq_claims WHERE rfq_id=$1`, [rfqId]),
    ]);

    const policyHistory = histRes.rows;
    const ageBands = ageBandRes.rows;
    const claimsAgg = claimsAggRes.rows[0];
    const totalMembers = parseInt(rfq.member_count) || 100;
    const projectedLives = parseInt(prospective.projected_lives) || totalMembers;

    // Parse sum insured slabs → average SI
    let siSlabs = [];
    siSlabs = safeJSON(rfq.sum_insured_slabs, []);
    const avgSI = prospective.si_override
      || (siSlabs.length ? siSlabs.reduce((a, b) => a + b, 0) / siSlabs.length : 300000);

    const industry = prospective.industry || rfq.industry || '';

    // ── Build cost model ──────────────────────────────────────────────────
    const costModel = buildCostModel({ ageBands, totalMembers, policyHistory, industry, avgSI, projectedLives });
    const { manual, experience, trend, industryFactor } = costModel;

    // ── Compute risk score ────────────────────────────────────────────────
    const catClaimsRatio = parseInt(claimsAgg.cat_claims) / Math.max(totalMembers, 1);
    const riskResult = computeRiskScore({
      avgLR: trend.avgLR || 0,
      trendDirection: trend.direction,
      avgAge: manual.avgAge,
      industryFactor,
      catClaimsRatio,
    });

    // ── Build quote strategies ────────────────────────────────────────────
    const stopLossPct = prospective.stop_loss_pct ? parseFloat(prospective.stop_loss_pct) : null;
    const strategies = buildQuoteStrategies(costModel, rfq, policyHistory, stopLossPct);

    // ── Build top diagnoses summary ───────────────────────────────────────
    const topDxRes = await sharedPool.query(
      `SELECT diagnosis, COUNT(*) AS count, COALESCE(SUM(approved_amount),0) AS total_cost
       FROM crm_rfq_claims WHERE rfq_id=$1 AND diagnosis IS NOT NULL AND diagnosis != ''
       GROUP BY diagnosis ORDER BY count DESC LIMIT 10`, [rfqId]
    );
    const topDiagnoses = topDxRes.rows;

    // ── Compute projected claims + premium ────────────────────────────────
    const projClaimsPerLife = costModel.blendedPureRate;
    const projTotalClaims = Math.round(projClaimsPerLife * projectedLives);
    const recommendedStrategy = strategies[1]; // Balanced as default recommendation

    // ── Generate AI narrative ─────────────────────────────────────────────
    const histSummary = policyHistory.length
      ? policyHistory.map(y =>
          `${y.year_label}: Premium ₹${(parseFloat(y.gross_premium) / 100000).toFixed(1)}L, Claims ₹${(parseFloat(y.total_claims_incurred) / 100000).toFixed(1)}L, LR ${(parseFloat(y.loss_ratio || 0) * 100).toFixed(1)}%, Lives ${y.lives_count}, Claims count ${y.total_claims_count}`
        ).join('\n')
      : 'No historical data entered.';

    const claimsFromUploads = parseInt(claimsAgg.total_claims) > 0
      ? `Uploaded claim records: ${claimsAgg.total_claims} claims, Total claimed ₹${(parseFloat(claimsAgg.total_claimed) / 100000).toFixed(1)}L, Approved ₹${(parseFloat(claimsAgg.total_approved) / 100000).toFixed(1)}L, Avg claim ₹${Math.round(parseFloat(claimsAgg.avg_claim)).toLocaleString()}, Catastrophic claims (>₹2L): ${claimsAgg.cat_claims}`
      : 'No individual claim records uploaded.';

    const dxText = topDiagnoses.length
      ? topDiagnoses.map(d => `${d.diagnosis} (${d.count} claims, ₹${(parseFloat(d.total_cost) / 100000).toFixed(1)}L)`).join(', ')
      : 'Not available';

    const systemPrompt = `You are iSHA-ACT, an expert Indian group health insurance actuary and underwriting strategist. You produce concise, data-driven, board-level analysis for insurance brokers. You know IRDAI regulations, Indian market loss ratios (industry avg 75–85%), medical inflation (14–16% pa), and win-loss drivers for group health tenders.`;

    const stopLossNote = stopLossPct
      ? `\n## STOP-LOSS CLAUSE\n${stopLossPct}% aggregate stop-loss applied. RI cost ₹${computeStopLossAdjustment(stopLossPct, costModel.blendedPureRate / (1 - LOADING_TIERS.balanced)).riCostPerLife}/life. Risk saving ₹${computeStopLossAdjustment(stopLossPct, costModel.blendedPureRate / (1 - LOADING_TIERS.balanced)).riskReductionPerLife}/life. Net impact: ${computeStopLossAdjustment(stopLossPct, costModel.blendedPureRate / (1 - LOADING_TIERS.balanced)).netReductionPct > 0 ? '-' : '+'}${Math.abs(computeStopLossAdjustment(stopLossPct, costModel.blendedPureRate / (1 - LOADING_TIERS.balanced)).netReductionPct)}% on gross rate (slight reduction — RI cost netted against risk saving).`
      : '';

    const userPrompt = `Analyse this group health insurance RFQ and produce a structured analysis report.

## RFQ DETAILS
Insured: ${rfq.insured_name} | Product: ${rfq.product_type} | Lives: ${totalMembers} | Industry: ${industry || 'Not specified'}
Existing Insurer: ${rfq.existing_insurer || 'Unknown'} | Existing TPA: ${rfq.existing_tpa || 'Unknown'}
Sum Insured Slabs: ${siSlabs.length ? siSlabs.map(s => '₹' + (s / 100000).toFixed(1) + 'L').join(', ') : 'Not specified'}

## RETROSPECTIVE (HISTORICAL) DATA
${histSummary}
${claimsFromUploads}
Top diagnoses: ${dxText}

## ACTUARIAL COST MODEL OUTPUTS
Average age: ${manual.avgAge} | Demographic factor: ${manual.demographicFactor}x
Industry factor: ${industryFactor}x | SI loading factor: ${costModel.siLoadingFactor}x
Manual pure rate: ₹${manual.manualPurePremiumPerLife}/life
Experience rate: ${experience ? `₹${experience.weightedPureRate}/life (${(experience.credibility * 100).toFixed(0)}% credibility)` : 'N/A'}
Blended pure rate (post-trend): ₹${costModel.blendedPureRate}/life
Trend: ${trend.direction} | Trend factor: ${trend.trendFactor}x | Avg historical LR: ${(trend.avgLR * 100).toFixed(1)}%
Risk score: ${riskResult.score}/100 (${riskResult.tier.toUpperCase()})

## PROSPECTIVE PROJECTIONS
Projected lives: ${projectedLives} | Projected claims corpus: ₹${(projTotalClaims / 100000).toFixed(1)}L
${stopLossNote}
## 3 QUOTE STRATEGIES
A) ${strategies[0].name}: ₹${strategies[0].premium_per_life_incl_gst}/life incl GST | Total ₹${(strategies[0].total_premium_incl_gst / 100000).toFixed(1)}L | SI ₹${(strategies[0].sum_insured / 100000).toFixed(1)}L | ${strategies[0].co_pay_pct}% co-pay
B) ${strategies[1].name}: ₹${strategies[1].premium_per_life_incl_gst}/life incl GST | Total ₹${(strategies[1].total_premium_incl_gst / 100000).toFixed(1)}L | SI ₹${(strategies[1].sum_insured / 100000).toFixed(1)}L | Nil co-pay | Maternity
C) ${strategies[2].name}: ₹${strategies[2].premium_per_life_incl_gst}/life incl GST | Total ₹${(strategies[2].total_premium_incl_gst / 100000).toFixed(1)}L | SI ₹${(strategies[2].sum_insured / 100000).toFixed(1)}L | OPD+CI rider

Produce a JSON with exactly these keys:
{
  "executive_summary": "2-3 sentence plain-English summary of the risk profile and recommended approach",
  "retrospective_narrative": "150 words: what the claims history tells you — trends, diagnoses, catastrophic claims, insurer profitability story",
  "prospective_narrative": "100 words: what the projected claims cost will look like and key risk factors going forward",
  "cost_model_narrative": "100 words: explain the actuarial methodology used and why the blended rate is appropriate",
  "quote_A_rationale": "80 words: why this quote wins and in what scenario",
  "quote_B_rationale": "80 words: why this quote wins and in what scenario",
  "quote_C_rationale": "80 words: why this quote wins and in what scenario",
  "recommended_strategy": "A, B or C with one sentence reason",
  "underwriting_flags": ["flag1", "flag2"] // up to 5 risk flags or positive indicators
}`;

    const fallbackNarrative = {
      executive_summary: `${rfq.insured_name} — ${totalMembers} lives, risk score ${riskResult.score}/100 (${riskResult.tier.toUpperCase()}). Blended pure rate ₹${costModel.blendedPureRate}/life; avg historical LR ${(trend.avgLR * 100).toFixed(1)}% (${trend.direction}). Recommend Strategy B (Balanced Performer) for optimal win probability.`,
      retrospective_narrative: policyHistory.length ? histSummary : 'No historical data entered — manual actuarial rating applied based on member demographics.',
      prospective_narrative: `Projected claims corpus ₹${(projTotalClaims / 100000).toFixed(1)}L for ${projectedLives} lives at ₹${costModel.blendedPureRate}/life pure rate. Medical inflation of ${(MEDICAL_INFLATION * 100).toFixed(0)}% pa applied to trend factor.`,
      cost_model_narrative: `Blended pure rate ₹${costModel.blendedPureRate}/life using ${experience ? (experience.credibility * 100).toFixed(0) + '% experience weight + ' + (100 - experience.credibility * 100).toFixed(0) + '% manual' : 'full manual rating'}. Industry factor ${industryFactor}x, SI loading ${costModel.siLoadingFactor}x.`,
      quote_A_rationale: strategies[0].why_wins[0],
      quote_B_rationale: strategies[1].why_wins[0],
      quote_C_rationale: strategies[2].why_wins[0],
      recommended_strategy: riskResult.tier === 'red' || riskResult.tier === 'black' ? 'A' : 'B',
      underwriting_flags: riskResult.tier !== 'green'
        ? [`Risk tier ${riskResult.tier.toUpperCase()} — review underwriting terms before binding`, trend.direction === 'deteriorating' ? 'Claims trend deteriorating — consider co-pay or deductible' : null].filter(Boolean)
        : ['Clean risk profile — standard terms applicable'],
    };

    let aiOutput = {};
    try {
      const raw = await aiComplete([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ], { maxTokens: 2500, temperature: 0.2 });
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) aiOutput = JSON.parse(match[0]);
    } catch (e) {
      console.warn('[CRM Analysis AI] AI narrative failed:', e.message);
    }
    // Fall back to rule-based narrative if AI returned empty or missing required key
    if (!aiOutput.executive_summary) {
      aiOutput = { ...fallbackNarrative, ...aiOutput };
    }

    // ── Increment version ──────────────────────────────────────────────────
    const prevVer = await sharedPool.query(`SELECT MAX(version) AS v FROM crm_rfq_analysis_cache WHERE rfq_id=$1`, [rfqId]);
    const version = (parseInt(prevVer.rows[0]?.v) || 0) + 1;

    const inputsSnapshot = {
      totalMembers, projectedLives, avgSI, industry,
      policyHistoryYears: policyHistory.map(y => y.year_label),
      claimsRecords: parseInt(claimsAgg.total_claims),
      ageBandCount: ageBands.length,
    };

    const { rows: saved } = await sharedPool.query(
      `INSERT INTO crm_rfq_analysis_cache
         (rfq_id, version, risk_score, risk_tier, renewal_probability,
          avg_loss_ratio, trend_factor, claim_frequency_trend, top_diagnoses,
          pure_premium_per_life, loaded_premium_per_life, gross_premium_per_life,
          total_projected_premium, projected_loss_ratio,
          quote_strategies, ai_narrative, ai_executive_summary,
          inputs_snapshot, generated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [rfqId, version, riskResult.score, riskResult.tier,
       riskResult.tier === 'green' ? 0.75 : riskResult.tier === 'amber' ? 0.58 : riskResult.tier === 'red' ? 0.40 : 0.22,
       trend.avgLR, trend.trendFactor, trend.direction,
       JSON.stringify(topDiagnoses),
       costModel.blendedPureRate,
       Math.round(strategies[1].premium_per_life_ex_gst),
       strategies[1].premium_per_life_incl_gst,
       strategies[1].total_premium_incl_gst,
       strategies[1].target_loss_ratio / 100,
       JSON.stringify(strategies),
       JSON.stringify(aiOutput),
       aiOutput.executive_summary || '',
       JSON.stringify(inputsSnapshot),
       req.crmUser?.id || null]
    );

    return res.json({
      success: true,
      version,
      risk: riskResult,
      costModel: {
        manual,
        experience,
        trend,
        industryFactor,
        siLoadingFactor: costModel.siLoadingFactor,
        blendedPureRate: costModel.blendedPureRate,
      },
      projections: {
        projectedLives,
        projectedClaimsPerLife: projClaimsPerLife,
        projectedTotalClaims: projTotalClaims,
        medicalInflationApplied: +(MEDICAL_INFLATION * 100).toFixed(1),
      },
      claimsSummary: {
        fromUploads: claimsAgg,
        topDiagnoses,
      },
      quoteStrategies: strategies,
      aiNarrative: aiOutput,
      analysisId: saved[0].id,
    });
  } catch (error) {
    console.error('[CRM Analysis Generate]', error.message, error.stack);
    return res.status(500).json({ success: false, message: 'Analysis generation failed: ' + error.message });
  }
});

// ─── GET all analysis versions for an RFQ ────────────────────────────────────
router.get('/rfqs/:rfqId/analysis/versions', authCRM, async (req, res) => {
  try {
    const { rows } = await sharedPool.query(
      `SELECT id, version, risk_score, risk_tier, ai_executive_summary, generated_at, generated_by
       FROM crm_rfq_analysis_cache WHERE rfq_id=$1 ORDER BY version DESC`,
      [req.params.rfqId]
    );
    return res.json({ success: true, data: rows });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

// ─── GET one specific version ─────────────────────────────────────────────────
router.get('/rfqs/:rfqId/analysis/:versionId', authCRM, async (req, res) => {
  try {
    const { rows } = await sharedPool.query(
      `SELECT * FROM crm_rfq_analysis_cache WHERE rfq_id=$1 AND id=$2`,
      [req.params.rfqId, req.params.versionId]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Version not found' });
    return res.json({ success: true, data: rows[0] });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

// ─── Quick cost model (no DB save — for live calculator) ─────────────────────
router.post('/rfqs/:rfqId/cost-model-preview', authCRM, async (req, res) => {
  try {
    const {
      projected_lives, avg_si, industry,
      age_bands, // [{age_band, count}]
      policy_history, // [{year_label, gross_premium, total_claims_incurred, lives_count}]
      stop_loss_pct,   // optional: 70/80/90 — aggregate stop-loss clause %
    } = req.body;

    const rfqRes = await sharedPool.query(`SELECT * FROM crm_rfqs WHERE id=$1`, [req.params.rfqId]);
    if (!rfqRes.rows.length) return res.status(404).json({ success: false, message: 'RFQ not found' });
    const rfq = rfqRes.rows[0];

    // Fall back to DB data if not provided
    let ageBands = age_bands;
    if (!ageBands?.length) {
      const r = await sharedPool.query(`SELECT CASE WHEN age<18 THEN '0-17' WHEN age<30 THEN '18-29' WHEN age<45 THEN '30-44' WHEN age<60 THEN '45-59' WHEN age<75 THEN '60-74' ELSE '75+' END AS age_band, COUNT(*) AS count FROM crm_rfq_members WHERE rfq_id=$1 AND age IS NOT NULL GROUP BY 1`, [req.params.rfqId]);
      ageBands = r.rows;
    }
    let policyHistory = policy_history;
    if (!policyHistory?.length) {
      const r = await sharedPool.query(`SELECT * FROM crm_rfq_policy_history WHERE rfq_id=$1`, [req.params.rfqId]);
      policyHistory = r.rows;
    }

    let siSlabs = [];
    siSlabs = safeJSON(rfq.sum_insured_slabs, []);
    const avgSI = avg_si || (siSlabs.length ? siSlabs.reduce((a, b) => a + b, 0) / siSlabs.length : 300000);

    const costModel = buildCostModel({
      ageBands, totalMembers: parseInt(rfq.member_count) || 100,
      policyHistory, industry: industry || rfq.industry || '',
      avgSI, projectedLives: projected_lives || parseInt(rfq.member_count) || 100,
    });
    const slPct = stop_loss_pct ? parseFloat(stop_loss_pct) : null;
    const strategies = buildQuoteStrategies(costModel, rfq, policyHistory, slPct);
    const slAdjDetail = slPct ? computeStopLossAdjustment(slPct, costModel.blendedPureRate / (1 - LOADING_TIERS.balanced)) : null;

    return res.json({
      success: true,
      stopLossClause: slPct ? { pct: slPct, ...slAdjDetail } : null,
      costModel: {
        manual: costModel.manual,
        experience: costModel.experience,
        trend: costModel.trend,
        industryFactor: costModel.industryFactor,
        siLoadingFactor: costModel.siLoadingFactor,
        blendedPureRate: costModel.blendedPureRate,
      },
      strategies,
    });
  } catch (err) { console.error('[Cost Model Preview]', err.message); return res.status(500).json({ success: false, message: err.message }); }
});

// ─── POST: Convert a recommended strategy directly into a quote draft ─────────
router.post('/rfqs/:rfqId/strategy-to-quote/:strategy', authCRM, async (req, res) => {
  try {
    const { rfqId, strategy } = req.params;
    const strategyLetter = strategy.toUpperCase();
    if (!['A', 'B', 'C'].includes(strategyLetter)) {
      return res.status(400).json({ success: false, message: 'strategy must be A, B or C' });
    }
    // Load latest analysis
    const { rows: analysisRows } = await sharedPool.query(
      `SELECT * FROM crm_rfq_analysis_cache WHERE rfq_id=$1 ORDER BY version DESC LIMIT 1`, [rfqId]
    );
    if (!analysisRows.length) {
      return res.status(400).json({ success: false, message: 'Run /generate first to produce strategies' });
    }
    const analysis = analysisRows[0];
    const strategies = safeJSON(analysis.quote_strategies, []);
    const chosen = strategies.find(s => s.strategy === strategyLetter);
    if (!chosen) return res.status(404).json({ success: false, message: 'Strategy not found in analysis' });

    // Verify RFQ exists
    const rfqRes = await sharedPool.query(`SELECT id, rfq_number FROM crm_rfqs WHERE id=$1`, [rfqId]);
    if (!rfqRes.rows.length) return res.status(404).json({ success: false, message: 'RFQ not found' });
    const rfq = rfqRes.rows[0];

    // Generate quote number
    const version = 1;
    const rand = String(Math.floor(Math.random() * 9000) + 1000);
    const quoteNumber = rfq.rfq_number.replace('RFQ-', 'QT-') + '-' + rand + '-V1';

    const validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const termsText = [
      `Strategy: ${chosen.name} — ${chosen.tagline}`,
      `Co-pay: ${chosen.co_pay_pct}%`,
      `Room rent: ${chosen.room_rent_limit}`,
      `Network: ${chosen.network}`,
      `Maternity: ${chosen.maternity}`,
      `OPD: ${chosen.opd || 'Not included'}`,
      ...(chosen.key_features || []),
    ].join('\n');

    const { rows } = await sharedPool.query(
      `INSERT INTO crm_quotes
         (rfq_id, quote_number, status, version, valid_until,
          total_premium, total_lives, per_life_cost,
          pricing_model, commission_pct, gst_pct,
          terms, notes, created_by)
       VALUES ($1,$2,'draft',$3,$4,$5,$6,$7,'per_life',0,18,$8,$9,$10) RETURNING *`,
      [rfqId, quoteNumber, version, validUntil,
       chosen.total_premium_incl_gst,
       parseInt(req.body.lives || rfqRes.rows[0].member_count || 0),
       chosen.premium_per_life_incl_gst,
       termsText,
       `Auto-generated from Strategy ${strategyLetter}: ${chosen.name}. Analysis v${analysis.version}.`,
       req.crmUser?.id || null]
    );
    return res.status(201).json({ success: true, data: rows[0], strategyUsed: chosen });
  } catch (err) { console.error('[Strategy-to-Quote]', err.message); return res.status(500).json({ success: false, message: err.message }); }
});

export default router;
