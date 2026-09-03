/**
 * AI Revenue Intelligence Service
 * ─────────────────────────────────
 * Billing gap analysis, revenue leakage scoring, smart order sets, and
 * claim denial risk prediction (SQL-heuristic — see getDenialRiskScoring).
 *
 * runClaimScrubShadow() below is the Upgrade Plan Phase B4 addition: a real
 * LLM-based coding-vs-documentation scrub, run in SHADOW MODE ONLY. It
 * computes and logs a result but nothing in this codebase surfaces its
 * output to coding staff yet — per the plan's own feasibility gate, that
 * happens only after its accuracy has been reviewed against a window of
 * real human-coded outcomes (see Upgrade Plan Phase B4 exit criteria).
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';
import llmProvider from './ai-brain/llm-provider.js';
import qualityGates from './ai-quality-gates.service.js';

// ─── Billing Gap Analysis ─────────────────────────────────────────────────────

export async function getBillingGapAnalysis(organizationId) {
  const [otGaps, labGaps, icuGaps, longStayGaps] = await Promise.allSettled([
    // OT procedures without billing
    sequelize.query(`
      SELECT
        a.id AS admission_id, p.name AS patient_name, p.mrn,
        ob.procedure_name, ob.booked_at,
        'OT procedure unbilled' AS gap_type,
        COALESCE(ob.estimated_cost, 0) AS potential_amount
      FROM ot_bookings ob
      JOIN admissions a ON a.id = ob.admission_id
      JOIN patients p ON p.id = a.patient_id
      WHERE ob.organization_id = :orgId
        AND ob.status = 'completed'
        AND ob.completed_at >= NOW() - INTERVAL '30 days'
        AND NOT EXISTS (
          SELECT 1 FROM billing_estimates be
          WHERE be.admission_id = a.id
            AND be.items::text ILIKE '%surgery%'
        )
      LIMIT 20
    `, { replacements: { orgId: organizationId }, type: QueryTypes.SELECT }),

    // Lab orders without corresponding billing
    sequelize.query(`
      SELECT
        a.id AS admission_id, p.name AS patient_name, p.mrn,
        COUNT(lr.id) AS unbilled_tests,
        'Lab tests unbilled' AS gap_type,
        COUNT(lr.id) * 500 AS potential_amount
      FROM lab_results lr
      JOIN admissions a ON a.id = lr.admission_id
      JOIN patients p ON p.id = a.patient_id
      WHERE lr.organization_id = :orgId
        AND lr.reported_at >= NOW() - INTERVAL '30 days'
        AND NOT EXISTS (
          SELECT 1 FROM billing_estimates be
          WHERE be.admission_id = a.id
            AND be.items::text ILIKE '%lab%'
        )
      GROUP BY a.id, p.name, p.mrn
      HAVING COUNT(lr.id) > 2
      LIMIT 20
    `, { replacements: { orgId: organizationId }, type: QueryTypes.SELECT }),

    // ICU admissions without ICU billing
    sequelize.query(`
      SELECT
        a.id AS admission_id, p.name AS patient_name, p.mrn,
        a.ward,
        EXTRACT(DAY FROM NOW() - a.admitted_at) AS icu_days,
        'ICU charges not captured' AS gap_type,
        EXTRACT(DAY FROM NOW() - a.admitted_at) * 8000 AS potential_amount
      FROM admissions a
      JOIN patients p ON p.id = a.patient_id
      WHERE a.organization_id = :orgId
        AND a.status = 'active'
        AND (a.ward ILIKE '%icu%' OR a.ward ILIKE '%intensive%')
        AND NOT EXISTS (
          SELECT 1 FROM billing_estimates be
          WHERE be.admission_id = a.id
            AND be.items::text ILIKE '%icu%'
        )
      LIMIT 10
    `, { replacements: { orgId: organizationId }, type: QueryTypes.SELECT }),

    // Long-stay admissions potentially missing complication codes
    sequelize.query(`
      SELECT
        a.id AS admission_id, p.name AS patient_name, p.mrn,
        EXTRACT(DAY FROM NOW() - a.admitted_at) AS los_days,
        a.primary_diagnosis,
        'Missing complication codes — LOS outlier' AS gap_type,
        5000 AS potential_amount
      FROM admissions a
      JOIN patients p ON p.id = a.patient_id
      WHERE a.organization_id = :orgId
        AND a.status = 'active'
        AND EXTRACT(DAY FROM NOW() - a.admitted_at) > 10
        AND (a.secondary_diagnoses IS NULL OR a.secondary_diagnoses = '{}' OR a.secondary_diagnoses = '[]')
      LIMIT 10
    `, { replacements: { orgId: organizationId }, type: QueryTypes.SELECT }),
  ]);

  const allGaps = [
    ...(otGaps.status === 'fulfilled' ? otGaps.value : []),
    ...(labGaps.status === 'fulfilled' ? labGaps.value : []),
    ...(icuGaps.status === 'fulfilled' ? icuGaps.value : []),
    ...(longStayGaps.status === 'fulfilled' ? longStayGaps.value : []),
  ];

  const totalLeakage = allGaps.reduce((s, g) => s + parseFloat(g.potential_amount || 0), 0);

  return {
    summary: {
      gap_count: allGaps.length,
      estimated_leakage: Math.round(totalLeakage),
      currency: 'INR',
      gap_types: {
        ot_unbilled: otGaps.status === 'fulfilled' ? otGaps.value.length : 0,
        lab_unbilled: labGaps.status === 'fulfilled' ? labGaps.value.length : 0,
        icu_unbilled: icuGaps.status === 'fulfilled' ? icuGaps.value.length : 0,
        coding_gaps: longStayGaps.status === 'fulfilled' ? longStayGaps.value.length : 0,
      },
    },
    gaps: allGaps.map(g => ({
      admission_id: g.admission_id,
      patient_name: g.patient_name,
      mrn: g.mrn,
      gap_type: g.gap_type,
      potential_amount: parseFloat(g.potential_amount || 0),
      details: g.procedure_name || g.primary_diagnosis || (g.unbilled_tests ? `${g.unbilled_tests} tests` : '') || (g.icu_days ? `${Math.round(g.icu_days)} ICU days` : ''),
    })),
  };
}

// ─── Revenue Leakage Score ────────────────────────────────────────────────────

export async function getRevenueLeakageScore(organizationId) {
  const [billing, admissions] = await Promise.allSettled([
    sequelize.query(`
      SELECT
        COUNT(*) AS total_bills,
        SUM(total_amount) AS total_billed,
        AVG(total_amount) AS avg_bill,
        COUNT(*) FILTER (WHERE payment_status = 'paid') AS paid_count,
        SUM(total_amount) FILTER (WHERE payment_status = 'paid') AS total_collected
      FROM billing_estimates
      WHERE organization_id = :orgId
        AND created_at >= NOW() - INTERVAL '30 days'
    `, { replacements: { orgId: organizationId }, type: QueryTypes.SELECT }),

    sequelize.query(`
      SELECT COUNT(*) AS total_active
      FROM admissions
      WHERE organization_id = :orgId AND status = 'active'
    `, { replacements: { orgId: organizationId }, type: QueryTypes.SELECT }),
  ]);

  const b = billing.status === 'fulfilled' ? billing.value[0] : {};
  const totalBilled = parseFloat(b?.total_billed || 0);
  const totalCollected = parseFloat(b?.total_collected || 0);
  const collectionRate = totalBilled > 0 ? (totalCollected / totalBilled) * 100 : 85;
  const leakageRate = 100 - collectionRate;

  const healthScore = leakageRate < 5 ? 'excellent'
    : leakageRate < 10 ? 'good'
    : leakageRate < 20 ? 'needs-improvement'
    : 'critical';

  return {
    period: '30 days',
    total_billed: Math.round(totalBilled),
    total_collected: Math.round(totalCollected),
    collection_rate_pct: Math.round(collectionRate * 10) / 10,
    leakage_rate_pct: Math.round(leakageRate * 10) / 10,
    estimated_leakage_amount: Math.round(totalBilled * (leakageRate / 100)),
    health_score: healthScore,
    benchmarks: {
      industry_collection_rate: 88,
      your_collection_rate: Math.round(collectionRate * 10) / 10,
      gap: Math.round((88 - collectionRate) * 10) / 10,
    },
    actions: buildLeakageActions(leakageRate),
  };
}

function buildLeakageActions(leakageRate) {
  if (leakageRate < 5) return ['Revenue cycle performing well — maintain current practices'];
  const actions = [];
  if (leakageRate >= 5) actions.push('Implement daily billing reconciliation for OT procedures');
  if (leakageRate >= 10) actions.push('Assign dedicated coding reviewer for ICU and surgical admissions');
  if (leakageRate >= 15) actions.push('Audit pre-auth approvals — check for shortfall billing');
  if (leakageRate >= 20) actions.push('Emergency revenue cycle review — engage billing consultants');
  return actions;
}

// ─── Smart Order Sets ─────────────────────────────────────────────────────────

// Rule-based order recommendations by diagnosis prefix + admission type
const ORDER_SETS = {
  'I21': { name: 'Acute STEMI / ACS Protocol', orders: [
    { category: 'investigations', items: ['Troponin I (serial)', 'ECG (12-lead)', 'CBC with differential', 'BMP', 'Coagulation profile', 'CXR (portable)', 'Echo (bedside)'] },
    { category: 'medications', items: ['Aspirin 325mg loading dose', 'Clopidogrel 600mg loading dose', 'Heparin protocol', 'Atorvastatin 80mg', 'Metoprolol 5mg IV (if no CI)'] },
    { category: 'monitoring', items: ['Continuous cardiac monitoring', 'O2 saturation monitoring', '12-lead ECG q6h x48h', 'Troponin q6h x3'] },
    { category: 'consults', items: ['Cardiology (urgent)', 'Cath lab notification'] },
  ]},
  'I10': { name: 'Hypertensive Crisis Protocol', orders: [
    { category: 'investigations', items: ['CBC', 'BMP', 'Creatinine', 'UA', 'ECG', 'Fundoscopy'] },
    { category: 'medications', items: ['Labetalol 20mg IV or Hydralazine 10mg IV', 'Amlodipine 5mg PO'] },
    { category: 'monitoring', items: ['BP q15min x2h then q1h', 'Urine output monitoring'] },
  ]},
  'K80': { name: 'Acute Cholecystitis Protocol', orders: [
    { category: 'investigations', items: ['CBC', 'LFT', 'Amylase/Lipase', 'Ultrasound abdomen (urgent)', 'Blood cultures', 'CRP'] },
    { category: 'medications', items: ['IV fluids (NS or RL)', 'Piperacillin-tazobactam 4.5g q8h', 'Analgesic protocol', 'Anti-emetic'] },
    { category: 'monitoring', items: ['NPO', 'Strict I&O', 'Vitals q4h'] },
    { category: 'consults', items: ['General surgery (semi-urgent)'] },
  ]},
  'J18': { name: 'Community-Acquired Pneumonia Protocol', orders: [
    { category: 'investigations', items: ['CBC', 'CRP/Procalcitonin', 'Blood cultures x2', 'Sputum culture', 'CXR', 'ABG (if SpO2 < 94%)'] },
    { category: 'medications', items: ['Amoxicillin-clavulanate 1.2g IV q8h', 'Azithromycin 500mg IV OD', 'Paracetamol 1g PO q6h'] },
    { category: 'monitoring', items: ['SpO2 continuous', 'O2 therapy if SpO2 < 94%', 'Vitals q4h', 'CXR in 48h'] },
  ]},
  'N20': { name: 'Renal Colic / Urolithiasis Protocol', orders: [
    { category: 'investigations', items: ['UA + microscopy', 'Creatinine', 'CBC', 'CT KUB (non-contrast)', 'Electrolytes'] },
    { category: 'medications', items: ['Ketorolac 30mg IV', 'Tramadol 50mg IV PRN', 'Hyoscine butylbromide 20mg IV', 'Alpha blocker (tamsulosin 0.4mg OD)'] },
    { category: 'monitoring', items: ['Strain all urine', 'Fluid intake > 2L/day', 'Pain reassessment q2h'] },
    { category: 'consults', items: ['Urology if stone > 5mm or persistent pain'] },
  ]},
  'G40': { name: 'Seizure Protocol', orders: [
    { category: 'investigations', items: ['CBC', 'Electrolytes', 'Blood glucose', 'Calcium/Magnesium', 'EEG', 'CT brain (non-contrast)', 'Serum drug levels (if on AEDs)'] },
    { category: 'medications', items: ['Lorazepam 4mg IV if actively seizing', 'Levetiracetam 1000mg IV loading', 'Phenytoin loading if refractory'] },
    { category: 'monitoring', items: ['Continuous EEG monitoring', 'Airway protection (suction ready)', 'O2 via mask', 'Seizure chart q1h'] },
  ]},
  'E11': { name: 'Diabetic Emergency Protocol', orders: [
    { category: 'investigations', items: ['Blood glucose (stat)', 'ABG', 'Ketones (urine + blood)', 'CBC', 'BMP', 'Lactate'] },
    { category: 'medications', items: ['IV Normal Saline (DKA protocol)', 'Insulin infusion protocol', 'KCl replacement per protocol', 'Bicarbonate if pH < 6.9'] },
    { category: 'monitoring', items: ['Blood glucose q1h', 'Ketones q2h', 'Strict I&O', 'Vitals q1h', 'IV site q4h'] },
  ]},
};

export async function getSmartOrderSets({ diagnosisCode, admissionType, patientId, organizationId }) {
  const prefix = (diagnosisCode || '').substring(0, 3).toUpperCase();
  const orderSet = ORDER_SETS[prefix];

  // Patient-specific context (allergies, current meds)
  const allergies = await sequelize.query(`
    SELECT allergen, reaction_type, severity FROM patient_allergies
    WHERE patient_id = :patId
  `, { replacements: { patId: patientId }, type: QueryTypes.SELECT }).catch(() => []);

  const currentMeds = await sequelize.query(`
    SELECT drug_name FROM prescriptions
    WHERE patient_id = :patId AND status = 'active'
    LIMIT 20
  `, { replacements: { patId: patientId }, type: QueryTypes.SELECT }).catch(() => []);

  // Allergy screening against order set medications
  const allergyNames = allergies.map(a => a.allergen?.toLowerCase());
  const safetyFlags = [];

  if (orderSet) {
    const allMeds = orderSet.orders.find(o => o.category === 'medications')?.items || [];
    allMeds.forEach(med => {
      const medLower = med.toLowerCase();
      const hit = allergyNames.find(a => a && medLower.includes(a));
      if (hit) {
        safetyFlags.push({
          type: 'allergy_alert',
          severity: 'high',
          medication: med,
          allergen: hit,
          message: `Patient has documented allergy to ${hit} — verify before ordering`,
        });
      }
    });
  }

  return {
    diagnosis_code: diagnosisCode,
    matched_protocol: orderSet?.name ?? null,
    order_set: orderSet?.orders ?? [],
    patient_context: {
      allergy_count: allergies.length,
      allergies: allergies.map(a => ({ allergen: a.allergen, severity: a.severity })),
      current_med_count: currentMeds.length,
    },
    safety_flags: safetyFlags,
    ai_note: orderSet
      ? `Suggested orders based on ${orderSet.name}. Always verify against current clinical guidelines and patient-specific factors.`
      : `No protocol found for code ${diagnosisCode}. Please refer to clinical guidelines or consult the CDSS knowledge base.`,
  };
}

// ─── Claim Denial Risk Scoring ────────────────────────────────────────────────

export async function getDenialRiskScoring(organizationId) {
  const pendingAuths = await sequelize.query(`
    SELECT
      pa.id, pa.admission_id,
      pa.patient_name, pa.diagnosis_code,
      pa.requested_amount, pa.insurer_name,
      pa.created_at,
      a.admission_type, a.ward,
      -- Risk factors
      pa.requested_amount > 200000                       AS high_value,
      pa.diagnosis_code ILIKE 'Z%'                       AS cosmetic_code,
      a.los_days IS NOT NULL AND a.los_days::float > 14  AS long_stay,
      -- Prior denial history for same patient
      (SELECT COUNT(*) FROM pre_auth_requests px
        WHERE px.patient_id = pa.patient_id AND px.status = 'denied') AS prior_denials
    FROM pre_auth_requests pa
    JOIN admissions a ON a.id = pa.admission_id
    WHERE pa.organization_id = :orgId
      AND pa.status IN ('pending', 'submitted')
    ORDER BY pa.created_at DESC
    LIMIT 50
  `, { replacements: { orgId: organizationId }, type: QueryTypes.SELECT }).catch(() => []);

  const scored = pendingAuths.map(auth => {
    let riskScore = 0;
    const flags = [];

    if (auth.high_value) { riskScore += 30; flags.push('high_claim_value'); }
    if (auth.cosmetic_code) { riskScore += 40; flags.push('potential_cosmetic_exclusion'); }
    if (auth.long_stay) { riskScore += 20; flags.push('long_stay_outlier'); }
    const priorDenials = parseInt(auth.prior_denials || 0);
    if (priorDenials > 0) { riskScore += Math.min(priorDenials * 15, 30); flags.push('prior_denial_history'); }

    const riskLevel = riskScore >= 60 ? 'high' : riskScore >= 30 ? 'medium' : 'low';

    return {
      auth_id: auth.id,
      admission_id: auth.admission_id,
      patient_name: auth.patient_name,
      insurer: auth.insurer_name,
      diagnosis_code: auth.diagnosis_code,
      requested_amount: parseFloat(auth.requested_amount || 0),
      denial_risk_score: riskScore,
      denial_risk_level: riskLevel,
      risk_flags: flags,
      recommendation: riskLevel === 'high'
        ? 'Escalate to medical director for clinical justification before submission'
        : riskLevel === 'medium'
        ? 'Attach supporting clinical documentation and prior treatment records'
        : 'Standard submission — no additional action required',
    };
  });

  return {
    summary: {
      total_pending: scored.length,
      high_risk: scored.filter(s => s.denial_risk_level === 'high').length,
      medium_risk: scored.filter(s => s.denial_risk_level === 'medium').length,
      low_risk: scored.filter(s => s.denial_risk_level === 'low').length,
    },
    claims: scored.sort((a, b) => b.denial_risk_score - a.denial_risk_score),
  };
}

// ─── AI Claim Scrub — shadow mode (Upgrade Plan Phase B4) ─────────────────────

/**
 * Run a real LLM-based coding-vs-documentation scrub for one pending
 * pre-authorization, comparing the coded diagnosis against the admission's
 * actual clinical notes. Shadow mode: computes and logs to
 * ai_quality_gate_log via qualityGates.checkClaimScrub(); does not write
 * anywhere coding staff would see it, and does not alter the claim.
 *
 * Call this from a scheduled/batch job over a window of already-adjudicated
 * claims to build the accuracy evidence the B4 exit criteria require before
 * this is ever wired into a UI.
 */
export async function runClaimScrubShadow(authId) {
  const [auth] = await sequelize.query(`
    SELECT pa.id, pa.admission_id, pa.diagnosis_code, pa.requested_amount, pa.insurer_name
    FROM pre_auth_requests pa
    WHERE pa.id = :authId
  `, { replacements: { authId }, type: QueryTypes.SELECT }).catch(() => [null]);

  if (!auth) return { authId, skipped: true, reason: 'pre_auth_request not found' };

  const notes = await sequelize.query(`
    SELECT note_type, chief_complaint, diagnosis, plan, assessment
    FROM clinical_notes WHERE admission_id = :admId ORDER BY created_at DESC LIMIT 10
  `, { replacements: { admId: auth.admission_id }, type: QueryTypes.SELECT }).catch(() => []);

  const sourceTextAvailable = notes.length > 0;
  if (!sourceTextAvailable) {
    const gateResult = await qualityGates.checkClaimScrub({ claimId: authId, defects: [], confidence: 0, sourceTextAvailable: false });
    await qualityGates.logGateResult(gateResult, { authId, admissionId: auth.admission_id, source: 'ai-revenue-intelligence.runClaimScrubShadow' });
    return { authId, skipped: true, reason: 'no clinical documentation to scrub against' };
  }

  const systemPrompt = `You are a medical coding auditor comparing a submitted diagnosis code against the actual clinical documentation.
Identify specific defects only if genuinely supported by the documentation provided — do not guess.
Output JSON: {
  "defects": [{ "type": "coding_documentation_mismatch|missing_modifier|medical_necessity_concern", "description", "evidence" }],
  "confidence": 0-1
}`;

  const llm = await llmProvider.chat({
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: JSON.stringify({
          codedDiagnosis: auth.diagnosis_code,
          requestedAmount: auth.requested_amount,
          insurer: auth.insurer_name,
          clinicalNotes: notes,
        }),
      },
    ],
    temperature: 0.1,
    maxTokens: 900,
    responseFormat: { type: 'json_object' },
    skipCache: true,
  });

  let parsed;
  try {
    parsed = JSON.parse(llm.content || '{}');
  } catch {
    parsed = { defects: [], confidence: 0 };
  }

  const gateResult = await qualityGates.checkClaimScrub({
    claimId: authId,
    defects: parsed.defects || [],
    confidence: parsed.confidence,
    sourceTextAvailable: true,
  });
  await qualityGates.logGateResult(gateResult, {
    authId, admissionId: auth.admission_id, source: 'ai-revenue-intelligence.runClaimScrubShadow',
    defects: parsed.defects || [], confidence: parsed.confidence, provider: llm.provider,
  });

  return {
    authId,
    skipped: false,
    defects: parsed.defects || [],
    confidence: parsed.confidence ?? null,
    gatePassed: gateResult.passed,
    shadowMode: true,
  };
}
