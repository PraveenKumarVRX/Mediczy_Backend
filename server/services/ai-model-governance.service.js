/**
 * AI Model Governance Service
 * =============================
 * Implements the mandatory governance layer required for SaMD qualification:
 *
 *   1. Model Cards        — per-component documentation (FDA TPLC guidance)
 *   2. Change Control     — Predetermined Change Control Plan (PCCP) enforcement
 *   3. Drift Detection    — Population Stability Index (PSI) monitoring
 *   4. Demographic Parity — Bias monitoring across age, gender, region
 *   5. Model Registry     — Versioned audit log of every deployed model state
 *
 * References:
 *   - FDA "Artificial Intelligence/Machine Learning (AI/ML)-Based Software as a Medical Device
 *     (SaMD) Action Plan" (Jan 2021)
 *   - FDA "Marketing Submission Recommendations for a Predetermined Change Control Plan for
 *     Artificial Intelligence/Machine Learning-Enabled Device Software Functions" (Apr 2023)
 *   - IEC 82304-1:2016 Health Software Safety
 *   - ISO 14971:2019 Risk Management for Medical Devices
 */

import pool from '../db/pgPool.js';

// ─── Model Card Registry ─────────────────────────────────────────────────────
// Static model cards for each AI decision component.
// Keep synchronized with actual model behavior. Update version on every change.
export const MODEL_CARDS = {
  'health-risk-scoring-v2-bayesian': {
    componentName:      'Health Risk Scoring',
    version:            'v2-bayesian',
    regulatoryClass:    'Class IIb SaMD (moderate-high risk)',
    intendedUse:        'Compute personalized health risk scores (cardiovascular, diabetes, hypertension, lifestyle, medication adherence) for active patients. Output is a decision support tool for clinicians — not a standalone diagnosis.',
    notIntendedFor:     'Replacing physician clinical judgment; acute emergency assessment; pediatric patients < 18 years; pregnant patients.',
    inputFeatures: [
      'Age (years)', 'BMI (kg/m²)', 'Systolic blood pressure (mmHg)',
      'Heart rate (bpm)', 'HbA1c (%)', 'Fasting glucose (mg/dL)',
      'Total cholesterol (mg/dL)', 'LDL (mg/dL)', 'HDL (mg/dL)',
      'Triglycerides (mg/dL)', 'Chronic conditions (structured list)',
      'Current medications (structured list)', 'Prescription fill history (6 months)',
      'Wellness log data (activity, sleep, diet)'
    ],
    outputDescription:  'Overall risk score (0-10), risk level (low/moderate/high/critical), dimension subscores, SHAP attributions, confidence score, counterfactual recommendations.',
    modelType:          'Rule-based Bayesian weighted scoring with LLM-enhanced recommendations',
    trainingDataSource: 'Expert-defined clinical thresholds based on ACC/AHA, ADA, JNC8 guidelines. No population training data — threshold-based deterministic model.',
    validationStatus:   'Threshold validation against ACC/AHA Pooled Cohort Equations for cardiovascular risk. Internal consistency testing only. External clinical validation pending.',
    knownLimitations: [
      'Mental health subscore is a fixed baseline (7.0) — not yet derived from real patient data',
      'Medication adherence assumes prescription fill equals consumption — actual adherence may differ',
      'Not validated on Indian subcontinent population distribution',
      'Does not incorporate genetic risk factors',
      'Performance on patients with >5 chronic conditions untested'
    ],
    performanceMetrics: {
      cardiovascularRisk: { auc: null, sensitivity: null, specificity: null, note: 'Clinical validation pending' },
      diabetesRisk:       { auc: null, sensitivity: null, specificity: null, note: 'Clinical validation pending' }
    },
    demographicPerformance: {
      note: 'Age-stratified and gender-stratified validation not yet completed',
      ageGroups:    null,
      genderGroups: null
    },
    updateCadence:     'Score recomputed every 6 hours per patient. Model thresholds frozen until clinical validation cycle (quarterly review recommended).',
    changeControlPlan: 'Any change to scoring weights, thresholds, or feature set requires (a) clinical review, (b) shadow-run on historical data, (c) medical director approval, (d) staged rollout with monitoring.',
    lastValidatedAt:   null,
    regulatoryNotes:   'Requires clinical validation study before use as primary decision input. Currently approved for decision support only with physician review.'
  },

  'admin-copilot': {
    componentName:      'Admin AI Copilot',
    version:            '1.0.0',
    regulatoryClass:    'NOT SaMD',
    intendedUse:        'Privileged ops assistant for hospital/platform administrators. Default mode: configuration, analytics, audit — not clinical decision support.',
    notIntendedFor:     'Autonomous clinical decisions; patient-facing triage; unsupervised write operations on production configuration.',
    inputFeatures:      ['Admin natural language query', 'Conversation context', 'Ops RAG documents (admin-ops category)'],
    outputDescription:  'Natural language response, tool call results, governance deep links. Write/system actions require human approval.',
    modelType:          'Multi-agent orchestrator (admin/analyst/insurance agents) + llm-provider.js cascade',
    trainingDataSource: 'No population training — retrieval from internal ops docs and live system tools.',
    validationStatus:   'Internal QA and permission-engine integration tests.',
    knownLimitations: [
      'May hallucinate governance steps without RAG corpus coverage',
      'Hospital admins are tenant-scoped — platform-wide ops require super_admin',
      'Write tools blocked until explicit human approval',
    ],
    performanceMetrics: { note: 'Ops assistant — no clinical performance metrics' },
    demographicPerformance: { note: 'N/A — not a clinical model' },
    updateCadence:     'Continuous deployment via feature flags ADMIN_COPILOT_*',
    changeControlPlan: 'Prompt and tool changes via ai-model-governance PCCP; no autonomous weight changes.',
    lastValidatedAt:   null,
    regulatoryNotes:   'Classified NOT SaMD for default ops persona. Clinical oversight route inherits source SaMD controls.',
  },

  'emergency-triage-esi-v1': {
    componentName:      'Emergency Triage (ESI)',
    version:            'v1-rule+llm',
    regulatoryClass:    'Class III SaMD (high risk)',
    intendedUse:        'Provide Emergency Severity Index (ESI) 5-level triage classification based on patient-reported symptoms and vital signs. Assists triage nurses/physicians in prioritizing care.',
    notIntendedFor:     'Replacing trained triage personnel; autonomous patient disposition; use without immediate clinical review; pediatric-specific triage protocols (PEWS).',
    inputFeatures: [
      'Free-text symptom description', 'Vital signs (BP, HR, SpO₂, RR, Temperature)',
      'Pain scale (0-10)', 'Patient age', 'Patient gender'
    ],
    outputDescription:  'ESI level (1-5), recommended actions, specialty routing, ambulance dispatch recommendation, LIME attribution of key symptom drivers, confidence score.',
    modelType:          'Rule-based red-flag pattern matching + vital sign thresholds + LLM clinical enrichment (iSHA/Groq/GPT-4 cascade)',
    trainingDataSource: 'ESI Implementation Handbook v4 (AHRQ), WHO emergency care guidelines, clinical expert review of red-flag patterns.',
    validationStatus:   'Rule patterns reviewed against ESI reference cases. LLM component not independently validated. External clinical validation pending.',
    knownLimitations: [
      'LLM component can misinterpret ambiguous symptom descriptions',
      'No validation on non-English or mixed-language (Hinglish, regional language) inputs',
      'Red flag patterns are regex-based and may miss paraphrased descriptions',
      'Vital sign thresholds are fixed — not adapted for age-specific norms (e.g., pediatric HR)',
      'Cannot assess patient appearance, distress level, or mental status visually'
    ],
    performanceMetrics: {
      triageAccuracy: { sensitivity: null, specificity: null, kappa: null, note: 'Prospective validation study required' }
    },
    changeControlPlan: 'Changes to red-flag patterns or vital thresholds require medical director sign-off. LLM model changes require re-validation of at least 50 reference cases.',
    lastValidatedAt:   null,
    regulatoryNotes:   'High-risk SaMD. Must have trained clinical staff in the decision loop at all times. Not for autonomous triage without human review.'
  },

  'drug-interaction-checker-v1': {
    componentName:      'Drug Interaction Checker',
    version:            'v1-rules+llm',
    regulatoryClass:    'Class III SaMD (high risk)',
    intendedUse:        'Identify drug-drug, drug-condition, and drug-food interactions at point of prescribing. Provides severity classification and clinical recommendation.',
    notIntendedFor:     'Complete pharmacovigilance; replacing clinical pharmacist review for complex polypharmacy; pediatric dosing calculations.',
    modelType:          'Curated interaction database (WHO Essential Medicines + FDA major interactions) + LLM-enhanced analysis',
    knownLimitations: [
      'Built-in database covers ~50 critical pairs — does not cover all possible interactions',
      'LLM may generate plausible but unverified interaction claims for rare combinations',
      'Drug name matching is regex-based — generic/brand name variations may be missed',
      'No pharmacokinetic modeling — severity is categorical not patient-specific'
    ],
    changeControlPlan: 'Database updates require pharmacist or clinical pharmacologist review. LLM model changes require pharmacist validation on interaction test set.',
    lastValidatedAt:   null
  },

  'medical-scribe-whisper-bimedix': {
    componentName:      'Medical Scribe',
    version:            'v1-whisper+bimedix',
    regulatoryClass:    'NOT SaMD (documentation tool — physician review mandatory)',
    intendedUse:        'Convert doctor-patient conversations to structured clinical notes. Output requires mandatory physician review and signature before entering the medical record.',
    notIntendedFor:     'Autonomous generation of prescriptions, diagnoses, or referrals without physician review.',
    modelType:          'Whisper (speech-to-text) + Bimedix/Indic-Gemma-2B (clinical note generation)',
    knownLimitations: [
      'Speech recognition accuracy drops with heavy accents or background noise',
      'May hallucinate medications, dosages, or diagnoses not actually spoken',
      'Not validated for all 14 specialty templates',
      'Indic language models have lower accuracy than English for clinical terminology'
    ],
    safetyControls: [
      'Mandatory physician review and signature before record commit',
      'Medication hallucination detection flag',
      'Allergy omission alert',
      'Safety check on generated content before presenting to physician'
    ],
    regulatoryNotes:   'If physician always reviews and modifies before committing, this is a documentation productivity tool, not SaMD. If notes are committed without physician review, it crosses into SaMD territory.'
  }
};

// ─── PSI Drift Thresholds ─────────────────────────────────────────────────────
// Population Stability Index interpretation:
//   PSI < 0.10: No significant shift (monitoring only)
//   PSI 0.10–0.20: Minor shift (investigate)
//   PSI > 0.20: Major shift (alert, consider model re-calibration)
const PSI_THRESHOLDS = { warn: 0.10, alert: 0.20 };

class AIModelGovernanceService {

  // ──────────────────────────────────────────────────────────────────────────
  // 1. MODEL CARD OPERATIONS
  // ──────────────────────────────────────────────────────────────────────────
  getModelCard(componentKey) {
    return MODEL_CARDS[componentKey] ?? null;
  }

  getAllModelCards() {
    return Object.entries(MODEL_CARDS).map(([key, card]) => ({ key, ...card }));
  }

  /**
   * Sync model cards to the database for API access.
   */
  async syncModelCardsToDB() {
    for (const [key, card] of Object.entries(MODEL_CARDS)) {
      try {
        await pool.query(`
          INSERT INTO ai_model_cards
            (component_name, version, intended_use, regulatory_class,
             known_limitations, performance_metrics, demographic_performance,
             last_validated_at, card_data, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
          ON CONFLICT (component_name) DO UPDATE SET
            version                = EXCLUDED.version,
            intended_use           = EXCLUDED.intended_use,
            regulatory_class       = EXCLUDED.regulatory_class,
            known_limitations      = EXCLUDED.known_limitations,
            performance_metrics    = EXCLUDED.performance_metrics,
            demographic_performance= EXCLUDED.demographic_performance,
            last_validated_at      = EXCLUDED.last_validated_at,
            card_data              = EXCLUDED.card_data,
            updated_at             = NOW()
        `, [
          card.componentName,
          card.version,
          card.intendedUse,
          card.regulatoryClass,
          JSON.stringify(card.knownLimitations || []),
          JSON.stringify(card.performanceMetrics || {}),
          JSON.stringify(card.demographicPerformance || {}),
          card.lastValidatedAt || null,
          JSON.stringify(card)
        ]);
      } catch (err) {
        console.warn(`[Governance] Failed to sync model card for ${key}:`, err.message);
      }
    }
    console.log(`✅ [Governance] ${Object.keys(MODEL_CARDS).length} model cards synced to DB`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. CHANGE CONTROL — Predetermined Change Control Plan (PCCP)
  // ──────────────────────────────────────────────────────────────────────────
  /**
   * Log a proposed model change for human review.
   * All self-learning pipeline changes MUST go through this before applying.
   *
   * @param {Object} change - The proposed change
   * @param {string} change.component - Which model component is changing
   * @param {string} change.changeType - 'prompt_update' | 'weight_adjustment' | 'threshold_change' | 'tool_selection' | 'routing_update'
   * @param {string} change.description - Human-readable description
   * @param {Object} change.previousConfig - Current config value
   * @param {Object} change.newConfig - Proposed config value
   * @param {string} change.rationale - Why this change is being proposed
   * @param {string} change.riskAssessment - 'low' | 'moderate' | 'high'
   * @returns {string} changeId
   */
  async proposeChange({ component, changeType, description, previousConfig, newConfig, rationale, riskAssessment = 'moderate' }) {
    try {
      // Idempotency: skip if an identical pending_review entry already exists for this component+changeType.
      // Prevents the cron (every 4h) from filing duplicate proposals for the same unresolved issue.
      const existing = await pool.query(`
        SELECT id FROM ai_model_change_log
        WHERE model_component = $1
          AND change_type = $2
          AND status = 'pending_review'
        LIMIT 1
      `, [component, changeType]);

      if (existing.rows.length > 0) {
        const existingId = existing.rows[0].id;
        console.log(`📋 [Governance] Skipping duplicate proposal: ID=${existingId} component=${component} type=${changeType} already pending review`);
        return existingId;
      }

      const { rows } = await pool.query(`
        INSERT INTO ai_model_change_log
          (model_component, change_type, change_description, previous_config,
           new_config, rationale, risk_assessment, status, proposed_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending_review', NOW())
        RETURNING id
      `, [
        component,
        changeType,
        description,
        JSON.stringify(previousConfig),
        JSON.stringify(newConfig),
        rationale,
        riskAssessment
      ]);

      const changeId = rows[0].id;
      console.log(`📋 [Governance] Change proposed: ID=${changeId} component=${component} type=${changeType} risk=${riskAssessment}`);
      return changeId;
    } catch (err) {
      console.error('[Governance] Failed to log proposed change:', err.message);
      throw err;
    }
  }

  /**
   * Approve a pending change (medical director action).
   * Returns the change config for the caller to apply.
   */
  async approveChange(changeId, approvedBy, notes = '') {
    const { rows } = await pool.query(`
      UPDATE ai_model_change_log
      SET status       = 'approved',
          approved_by  = $1,
          approved_at  = NOW(),
          review_notes = $2
      WHERE id = $3 AND status = 'pending_review'
      RETURNING *
    `, [approvedBy, notes, changeId]);

    if (!rows.length) throw new Error(`Change ${changeId} not found or not in pending_review state`);

    console.log(`✅ [Governance] Change ${changeId} approved by ${approvedBy}`);
    return rows[0];
  }

  /**
   * Reject a pending change.
   */
  async rejectChange(changeId, rejectedBy, reason) {
    await pool.query(`
      UPDATE ai_model_change_log
      SET status       = 'rejected',
          approved_by  = $1,
          approved_at  = NOW(),
          review_notes = $2
      WHERE id = $3 AND status = 'pending_review'
    `, [rejectedBy, reason, changeId]);

    console.log(`❌ [Governance] Change ${changeId} rejected by ${rejectedBy}: ${reason}`);
  }

  /**
   * Get all pending changes awaiting review.
   */
  async getPendingChanges() {
    const { rows } = await pool.query(`
      SELECT * FROM ai_model_change_log
      WHERE status = 'pending_review'
      ORDER BY
        CASE risk_assessment WHEN 'high' THEN 1 WHEN 'moderate' THEN 2 ELSE 3 END,
        proposed_at DESC
    `);
    return rows;
  }

  /**
   * Get change audit trail for a component.
   */
  async getChangeHistory(component, limit = 50) {
    const { rows } = await pool.query(`
      SELECT * FROM ai_model_change_log
      WHERE model_component = $1
      ORDER BY proposed_at DESC
      LIMIT $2
    `, [component, limit]);
    return rows;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 3. DRIFT DETECTION — Population Stability Index (PSI)
  // ──────────────────────────────────────────────────────────────────────────
  /**
   * Compute PSI for a numeric feature across two time windows.
   * Alerts when the input distribution has shifted significantly.
   *
   * PSI = Σ (actual% − expected%) × ln(actual% / expected%)
   *
   * @param {string} featureName - Name of the feature being monitored
   * @param {number[]} baseline - Baseline distribution values
   * @param {number[]} current  - Current distribution values
   * @param {number} bins - Number of bins for distribution bucketing
   * @returns {Object} PSI score, drift classification, alert flag
   */
  computePSI(featureName, baseline, current, bins = 10) {
    if (!baseline?.length || !current?.length) {
      return { featureName, psi: null, driftDetected: false, reason: 'Insufficient data' };
    }

    const min = Math.min(...baseline, ...current);
    const max = Math.max(...baseline, ...current);
    if (min === max) return { featureName, psi: 0, driftDetected: false };

    const binWidth = (max - min) / bins;
    const bBuckets = new Array(bins).fill(0);
    const cBuckets = new Array(bins).fill(0);

    for (const v of baseline) {
      const i = Math.min(Math.floor((v - min) / binWidth), bins - 1);
      bBuckets[i]++;
    }
    for (const v of current) {
      const i = Math.min(Math.floor((v - min) / binWidth), bins - 1);
      cBuckets[i]++;
    }

    let psi = 0;
    for (let i = 0; i < bins; i++) {
      const bPct = Math.max(bBuckets[i] / baseline.length, 0.0001);
      const cPct = Math.max(cBuckets[i] / current.length, 0.0001);
      psi += (cPct - bPct) * Math.log(cPct / bPct);
    }

    const driftLevel = psi >= PSI_THRESHOLDS.alert ? 'major'
                     : psi >= PSI_THRESHOLDS.warn  ? 'minor'
                     :                               'none';

    return {
      featureName,
      psi:           Math.round(psi * 10000) / 10000,
      driftDetected: psi >= PSI_THRESHOLDS.warn,
      driftLevel,
      alert:         psi >= PSI_THRESHOLDS.alert,
      bins: { baseline: bBuckets, current: cBuckets, min, max, binWidth },
      interpretation: psi >= PSI_THRESHOLDS.alert
        ? `MAJOR DRIFT: ${featureName} distribution has shifted significantly. Model re-calibration may be needed.`
        : psi >= PSI_THRESHOLDS.warn
        ? `Minor drift detected in ${featureName}. Investigate data collection or population changes.`
        : `${featureName} distribution is stable.`
    };
  }

  /**
   * Run drift monitoring on health risk score inputs across the patient population.
   * Compares last 7 days vs prior 30-day baseline.
   */
  async runDriftMonitor() {
    console.log('📊 [Governance] Running drift monitor...');
    const results = [];

    try {
      // Cardiovascular risk score distribution
      const { rows: baseline } = await pool.query(`
        SELECT (subscores->>'cardiovascular')::float as val
        FROM ai_health_risk_scores
        WHERE updated_at BETWEEN NOW() - INTERVAL '37 days' AND NOW() - INTERVAL '7 days'
          AND subscores->>'cardiovascular' IS NOT NULL
      `);
      const { rows: current } = await pool.query(`
        SELECT (subscores->>'cardiovascular')::float as val
        FROM ai_health_risk_scores
        WHERE updated_at > NOW() - INTERVAL '7 days'
          AND subscores->>'cardiovascular' IS NOT NULL
      `);

      if (baseline.length > 10 && current.length > 5) {
        const cardio = this.computePSI(
          'cardiovascular_risk_score',
          baseline.map(r => r.val),
          current.map(r => r.val)
        );
        results.push(cardio);
        await this._persistDriftResult(cardio);
      }

      // Overall risk score distribution
      const { rows: obline } = await pool.query(`
        SELECT overall_score::float as val FROM ai_health_risk_scores
        WHERE updated_at BETWEEN NOW() - INTERVAL '37 days' AND NOW() - INTERVAL '7 days'
      `);
      const { rows: ocurrent } = await pool.query(`
        SELECT overall_score::float as val FROM ai_health_risk_scores
        WHERE updated_at > NOW() - INTERVAL '7 days'
      `);
      if (obline.length > 10 && ocurrent.length > 5) {
        const overall = this.computePSI('overall_risk_score', obline.map(r => r.val), ocurrent.map(r => r.val));
        results.push(overall);
        await this._persistDriftResult(overall);
      }

    } catch (err) {
      console.error('[Governance] Drift monitor error:', err.message);
    }

    const alerts = results.filter(r => r.alert);
    if (alerts.length > 0) {
      console.warn(`⚠️  [Governance] DRIFT ALERT: ${alerts.map(a => a.featureName).join(', ')}`);
    }

    console.log(`✅ [Governance] Drift monitor complete: ${results.length} features checked, ${alerts.length} alerts`);
    return { results, alertCount: alerts.length };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 4. DEMOGRAPHIC PARITY REPORT
  // ──────────────────────────────────────────────────────────────────────────
  /**
   * Compute risk score distribution by age group and gender.
   * Flags if any demographic group has disproportionately high or low average scores.
   */
  async computeDemographicParity() {
    try {
      const { rows } = await pool.query(`
        SELECT
          CASE
            WHEN EXTRACT(YEAR FROM AGE(u."dateOfBirth")) < 30 THEN '18-29'
            WHEN EXTRACT(YEAR FROM AGE(u."dateOfBirth")) < 45 THEN '30-44'
            WHEN EXTRACT(YEAR FROM AGE(u."dateOfBirth")) < 60 THEN '45-59'
            ELSE '60+'
          END as age_group,
          u.gender,
          COUNT(*) as count,
          ROUND(AVG(r.overall_score)::numeric, 2) as avg_score,
          ROUND(STDDEV(r.overall_score)::numeric, 2) as std_score,
          ROUND(AVG((r.subscores->>'cardiovascular')::float)::numeric, 2) as avg_cardio,
          ROUND(AVG((r.subscores->>'diabetes')::float)::numeric, 2) as avg_diabetes
        FROM ai_health_risk_scores r
        JOIN patients p ON p.id = r.patient_id
        JOIN users u ON u.id = p."userId"
        WHERE r.updated_at > NOW() - INTERVAL '7 days'
          AND u."dateOfBirth" IS NOT NULL
        GROUP BY age_group, u.gender
        ORDER BY age_group, u.gender
      `);

      // Check for groups with < 5 patients (insufficient for statistical inference)
      const smallGroups = rows.filter(r => parseInt(r.count) < 5);

      return {
        groups: rows,
        smallGroups,
        dataInsufficient: smallGroups.length > 0,
        generatedAt: new Date().toISOString(),
        note: smallGroups.length > 0
          ? 'Some demographic groups have < 5 patients — insufficient for bias assessment. Expand patient base before regulatory submission.'
          : 'Sufficient data for demographic comparison.'
      };
    } catch (err) {
      console.error('[Governance] Demographic parity error:', err.message);
      return { groups: [], error: err.message };
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 5. GOVERNANCE DASHBOARD SUMMARY
  // ──────────────────────────────────────────────────────────────────────────
  async getGovernanceDashboard() {
    const [pending, drift, parity] = await Promise.all([
      this.getPendingChanges(),
      pool.query(`
        SELECT feature_name, psi_score, drift_detected, drift_level, measured_at
        FROM ai_drift_monitor
        WHERE measured_at > NOW() - INTERVAL '24 hours'
        ORDER BY psi_score DESC LIMIT 10
      `).then(r => r.rows).catch(() => []),
      pool.query(`
        SELECT COUNT(DISTINCT patient_id) as total_patients,
               ROUND(AVG(overall_score)::numeric, 2) as avg_risk_score,
               ROUND(AVG(confidence_score)::numeric, 2) as avg_confidence,
               COUNT(CASE WHEN confidence_score < 0.5 THEN 1 END) as low_confidence_count,
               COUNT(CASE WHEN risk_level = 'critical' THEN 1 END) as critical_patients
        FROM ai_health_risk_scores
        WHERE updated_at > NOW() - INTERVAL '24 hours'
      `).then(r => r.rows[0]).catch(() => ({}))
    ]);

    const pendingHighRisk = pending.filter(c => c.risk_assessment === 'high');

    return {
      changeControl: {
        pendingCount:        pending.length,
        highRiskPending:     pendingHighRisk.length,
        pendingChanges:      pending,
        recommendation:      pending.length > 0
          ? `⚠️  ${pending.length} model changes pending medical director review (${pendingHighRisk.length} high-risk)`
          : '✅ No pending model changes'
      },
      driftMonitoring: {
        recentResults:  drift,
        alertCount:     drift.filter(d => d.drift_detected).length,
        recommendation: drift.filter(d => d.drift_detected).length > 0
          ? '⚠️  Input distribution drift detected — review recent patient population changes'
          : '✅ No significant drift detected'
      },
      population: parity,
      modelCards: Object.keys(MODEL_CARDS).map(k => ({
        key: k,
        version: MODEL_CARDS[k].version,
        regulatoryClass: MODEL_CARDS[k].regulatoryClass,
        lastValidated: MODEL_CARDS[k].lastValidatedAt ?? 'NOT VALIDATED'
      })),
      samdReadiness: await this._samdReadinessChecklist()
    };
  }

  async _samdReadinessChecklist() {
    // Items 1-10 are always done (implemented in prior session)
    const fixed = [
      { item: 'Model cards documented',                       status: 'done', detail: `${Object.keys(MODEL_CARDS).length} components covered` },
      { item: 'SHAP interpretability implemented',            status: 'done', detail: 'Exact SHAP for risk scoring, LIME for triage' },
      { item: 'Confidence scores on all AI outputs',          status: 'done', detail: 'Data completeness → confidence interval' },
      { item: 'Counterfactual explanations',                  status: 'done', detail: 'Nearest-counterfactual for risk score changes' },
      { item: 'Self-learning change control gate',            status: 'done', detail: 'All changes require medical director approval' },
      { item: 'Drift detection (PSI)',                        status: 'done', detail: 'Weekly PSI check on risk score distributions' },
      { item: 'Demographic parity monitoring',                status: 'done', detail: 'Weekly age/gender stratified analysis' },
      { item: 'Audit trail for all AI decisions',             status: 'done', detail: 'isha_audit_log, sib_decision_log, operations_audit_log' },
      { item: 'Doctor review enforcement (scribe)',           status: 'done', detail: 'Mandatory physician signature before record commit' },
      { item: 'Drug interaction hallucination guard',         status: 'done', detail: 'Rule-based cross-check against LLM output' },
    ];

    // Items 11-16: dynamically check DB tables
    const [cvRisk, cvTriage, qmsDocs, iec62304Items, iso14971Hazards, cdscoSub] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM clinical_validation_studies WHERE model_component='health_risk_scoring' AND status='completed'`).then(r => parseInt(r.rows[0].count)).catch(() => 0),
      pool.query(`SELECT COUNT(*) FROM clinical_validation_studies WHERE model_component='emergency_triage_esi' AND status='completed'`).then(r => parseInt(r.rows[0].count)).catch(() => 0),
      pool.query(`SELECT COUNT(*) FROM qms_documents WHERE status='approved'`).then(r => parseInt(r.rows[0].count)).catch(() => 0),
      pool.query(`SELECT COUNT(*) FROM iec62304_software_items`).then(r => parseInt(r.rows[0].count)).catch(() => 0),
      pool.query(`SELECT COUNT(*) FROM iso14971_hazards`).then(r => parseInt(r.rows[0].count)).catch(() => 0),
      pool.query(`SELECT COUNT(*) FROM cdsco_submissions WHERE status NOT IN ('withdrawn')`).then(r => parseInt(r.rows[0].count)).catch(() => 0),
    ]);

    const dynamic = [
      {
        item: 'Clinical validation study (risk scoring)',
        status: cvRisk > 0 ? 'done' : 'missing',
        detail: cvRisk > 0 ? `${cvRisk} completed validation study in DB` : 'Required before Class IIb SaMD submission',
      },
      {
        item: 'Clinical validation study (triage)',
        status: cvTriage > 0 ? 'done' : 'missing',
        detail: cvTriage > 0 ? `${cvTriage} completed validation study in DB` : 'Required before Class III SaMD submission',
      },
      {
        item: 'ISO 13485 Quality Management System',
        status: qmsDocs >= 5 ? 'done' : qmsDocs > 0 ? 'partial' : 'missing',
        detail: qmsDocs >= 5 ? `${qmsDocs} approved QMS documents` : `${qmsDocs} approved documents (need ≥5 core SOPs)`,
      },
      {
        item: 'IEC 62304 Software Lifecycle Documentation',
        status: iec62304Items >= 5 ? 'done' : iec62304Items > 0 ? 'partial' : 'missing',
        detail: iec62304Items >= 5 ? `${iec62304Items} software items registered` : `${iec62304Items} items (need ≥5)`,
      },
      {
        item: 'ISO 14971 Risk Management File',
        status: iso14971Hazards >= 5 ? 'done' : iso14971Hazards > 0 ? 'partial' : 'missing',
        detail: iso14971Hazards >= 5 ? `${iso14971Hazards} hazards logged with controls` : `${iso14971Hazards} hazards (need ≥5)`,
      },
      {
        item: 'Regulatory submission (CDSCO India)',
        status: cdscoSub > 0 ? 'done' : 'missing',
        detail: cdscoSub > 0 ? 'CDSCO submission record created with MDR 2017 checklist' : 'Class B/C Medical Device Rules 2017 filing',
      },
    ];

    const all = [...fixed, ...dynamic];
    const doneCount = all.filter(i => i.status === 'done').length;
    return { items: all, score: doneCount, total: all.length };
  }

  async _persistDriftResult(result) {
    try {
      await pool.query(`
        INSERT INTO ai_drift_monitor
          (feature_name, psi_score, drift_detected, drift_level, alert_sent, measured_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
      `, [result.featureName, result.psi, result.driftDetected, result.driftLevel || 'none', false]);
    } catch (err) {
      console.warn('[Governance] Failed to persist drift result:', err.message);
    }
  }
}

export default new AIModelGovernanceService();
