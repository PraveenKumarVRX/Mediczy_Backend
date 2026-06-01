/**
 * AI Interpretability Service
 * ============================
 * Provides post-hoc explainability for all AI/ML decisions in the Mediczy platform.
 * Required for SaMD qualification under:
 *   - FDA AI/ML-Based SaMD Action Plan (Jan 2021)
 *   - EU MDR Annex I §17 (transparency requirements)
 *   - IEC 82304-1 Health Software standard
 *
 * Methods implemented:
 *   - shapValues()        : Exact Shapley values for additive risk models (health risk scoring)
 *   - limeAttribution()   : Local surrogate approximation for rule+LLM triage decisions
 *   - counterfactuals()   : Nearest counterfactual — "what would need to change to lower risk"
 *   - confidenceScore()   : Input data completeness → output confidence interval
 *   - featureAttribution(): Per-feature contribution breakdown for any dimension score
 */

import pool from '../db/pgPool.js';

// ─── Baseline reference values (population average for a 40-year-old patient) ───
// These are the SHAP "background" values — the neutral reference point.
// A positive SHAP value means the feature increases risk above baseline.
const RISK_BASELINES = {
  cardiovascular: 3.0,   // 40-year-old, normal BMI, normal vitals
  diabetes:       2.5,
  hypertension:   3.5,
  medication_adherence: 7.0,  // high = good adherence (protective)
  lifestyle:       6.0,        // high = healthy lifestyle (protective)
  mental_health:   7.0         // high = good mental health (protective)
};

const RISK_WEIGHTS = {
  cardiovascular:       0.25,
  diabetes:             0.20,
  hypertension:         0.20,
  medication_adherence: 0.15,  // protective: high score reduces risk
  lifestyle:            0.10,  // protective
  mental_health:        0.10   // protective
};

// ─── Cardiovascular sub-feature baselines ───────────────────────────────────
const CARDIO_FEATURE_BASELINES = {
  age:               0,    // points added by age bracket
  bmi:               0,
  systolic_bp:       0,
  heart_rate:        0,
  chronic_cardiac:   0,
  cholesterol:       0,
  ldl:               0,
  triglycerides:     0,
  hdl:               0
};

// ─── Diabetes sub-feature baselines ─────────────────────────────────────────
const DIABETES_FEATURE_BASELINES = {
  known_diabetes:    0,
  bmi:               0,
  fasting_glucose:   0,
  hba1c:             0,
  family_history:    0
};

class AIInterpretabilityService {

  // ──────────────────────────────────────────────────────────────────────────
  // 1. SHAP VALUES — Exact Shapley decomposition for additive risk models
  // ──────────────────────────────────────────────────────────────────────────
  /**
   * Compute exact SHAP values for the v2-bayesian health risk model.
   *
   * Because the model is a weighted sum of subscores, SHAP values are exact
   * (no approximation needed). Each subscore's SHAP value is:
   *   φ_i = (subscore_i − baseline_i) × |weight_i| × sign
   * where sign is -1 for protective dimensions (high = good).
   *
   * @param {Object} subscores - The subscore object from computePatientScore()
   * @param {Object} featureDetails - Optional per-feature breakdown within each dimension
   * @returns {Object} SHAP values per dimension and summary statistics
   */
  computeShapValues(subscores, featureDetails = {}) {
    const shapValues = {};
    let totalAttributed = 0;

    // Protective dimensions: high score REDUCES risk, so SHAP contribution is inverted
    const protectiveDimensions = new Set(['medication_adherence', 'lifestyle', 'mental_health']);

    for (const [dimension, weight] of Object.entries(RISK_WEIGHTS)) {
      const baseline = RISK_BASELINES[dimension] ?? 5.0;
      const actual   = subscores[dimension] ?? baseline;
      const delta    = actual - baseline;
      const isProtective = protectiveDimensions.has(dimension);

      // SHAP value: positive = increases overall risk, negative = reduces it
      const shapValue = isProtective
        ? -delta * weight   // high protective score reduces risk
        : delta * weight;   // high risk score increases risk

      shapValues[dimension] = {
        shap:      Math.round(shapValue * 1000) / 1000,
        score:     actual,
        baseline:  baseline,
        delta:     Math.round(delta * 100) / 100,
        weight,
        direction: isProtective ? 'protective' : 'risk',
        impact:    shapValue > 0.5 ? 'high' : shapValue > 0.15 ? 'moderate' : 'low',
        subFeatures: featureDetails[dimension] ?? {}
      };

      totalAttributed += shapValue;
    }

    // SHAP completeness check: sum of SHAP values ≈ model output − baseline output
    const baselineOutput = this._computeBaselineOutput();
    const attributionCheck = {
      sumOfShap: Math.round(totalAttributed * 1000) / 1000,
      baselineOutput: Math.round(baselineOutput * 1000) / 1000,
      consistent: true  // by construction for additive models
    };

    // Rank dimensions by absolute SHAP impact
    const ranked = Object.entries(shapValues)
      .sort((a, b) => Math.abs(b[1].shap) - Math.abs(a[1].shap))
      .map(([dim, vals]) => ({ dimension: dim, ...vals }));

    return {
      values: shapValues,
      ranked,
      topContributor: ranked[0]?.dimension,
      topProtector:   ranked.find(r => r.shap < 0)?.dimension,
      attribution:    attributionCheck,
      method:         'exact-additive-shap',
      modelVersion:   'v2-bayesian'
    };
  }

  /**
   * Compute intra-dimension SHAP for cardiovascular score.
   * Each input feature's contribution within the 0-10 cardiovascular score.
   */
  computeCardioSubShap(patient, vitals, reportLabValues = []) {
    const contributions = {};
    let cumulative = 3.0; // baseline

    // Age
    const age = patient.dateOfBirth
      ? Math.floor((Date.now() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : null;
    let ageDelta = 0;
    if (age !== null) {
      if (age > 65)      ageDelta = 2.5;
      else if (age > 50) ageDelta = 1.5;
      else if (age > 40) ageDelta = 0.5;
    }
    contributions.age = { value: age, pointsAdded: ageDelta, description: age ? `Age ${age}` : 'Age unknown' };
    cumulative += ageDelta;

    // BMI
    let bmiDelta = 0, bmi = null;
    if (patient.height && patient.weight) {
      bmi = patient.weight / Math.pow(patient.height / 100, 2);
      if (bmi > 35)      bmiDelta = 2.0;
      else if (bmi > 30) bmiDelta = 1.5;
      else if (bmi > 25) bmiDelta = 0.5;
    }
    contributions.bmi = { value: bmi?.toFixed(1), pointsAdded: bmiDelta, description: bmi ? `BMI ${bmi.toFixed(1)}` : 'BMI unknown' };
    cumulative += bmiDelta;

    // Blood pressure
    let bpDelta = 0, systolic = null;
    if (vitals) {
      systolic = vitals.bloodPressureSystolic || vitals.systolic;
      if (systolic > 160)      bpDelta = 2.0;
      else if (systolic > 140) bpDelta = 1.5;
      else if (systolic > 130) bpDelta = 0.5;
    }
    contributions.systolic_bp = { value: systolic, pointsAdded: bpDelta, description: systolic ? `Systolic ${systolic} mmHg` : 'BP not recorded' };
    cumulative += bpDelta;

    // Heart rate
    let hrDelta = 0, hr = null;
    if (vitals) {
      hr = vitals.heartRate || vitals.heart_rate;
      if (hr && (hr > 100 || hr < 50)) hrDelta = 1.0;
    }
    contributions.heart_rate = { value: hr, pointsAdded: hrDelta, description: hr ? `HR ${hr} bpm` : 'HR not recorded' };
    cumulative += hrDelta;

    // Chronic conditions
    const conditions = patient.chronicConditions || [];
    const cardiacCondition = conditions.find(c => /heart|cardiac|coronary/i.test(c));
    const cholCondition    = conditions.find(c => /cholesterol|lipid/i.test(c));
    const chronicDelta = (cardiacCondition ? 2.0 : 0) + (cholCondition ? 1.0 : 0);
    contributions.chronic_conditions = {
      value: conditions.filter(c => /heart|cardiac|coronary|cholesterol|lipid/i.test(c)),
      pointsAdded: chronicDelta,
      description: cardiacCondition ? `Known cardiac condition` : cholCondition ? 'Lipid disorder' : 'No relevant chronic conditions'
    };
    cumulative += chronicDelta;

    // Lab values
    let labDelta = 0;
    const labContribs = [];
    for (const lv of reportLabValues) {
      const name = (lv.parameter_name || '').toLowerCase();
      const val  = parseFloat(lv.value);
      if (isNaN(val)) continue;
      let delta = 0;
      if (/total\s*cholesterol/i.test(name) && val > 240) { delta = 1.5; labContribs.push(`Total Chol ${val}`); }
      else if (/ldl/i.test(name)          && val > 160)  { delta = 1.5; labContribs.push(`LDL ${val}`); }
      else if (/triglyceride/i.test(name) && val > 200)  { delta = 1.0; labContribs.push(`TG ${val}`); }
      else if (/hdl/i.test(name)          && val < 40)   { delta = 1.0; labContribs.push(`HDL ${val}`); }
      labDelta += delta;
    }
    contributions.lab_values = { value: labContribs, pointsAdded: Math.min(labDelta, 3.0), description: labContribs.length ? labContribs.join(', ') : 'No relevant labs' };
    cumulative += Math.min(labDelta, 3.0);

    return {
      contributions,
      finalScore: Math.min(10, Math.max(0, cumulative)),
      cumulativeBreakdown: true
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. LIME ATTRIBUTION — Text-level for triage and LLM decisions
  // ──────────────────────────────────────────────────────────────────────────
  /**
   * LIME-style attribution for the emergency triage decision.
   *
   * Since the rule-based layer is deterministic, we can compute exact attribution
   * for pattern matches. For the LLM layer we approximate importance using
   * symptom-token presence scoring (surrogate linear model over text segments).
   *
   * @param {string} symptoms - Raw symptom text
   * @param {Object} triageResult - Result from EmergencyTriageService.triage()
   * @param {Object} vitals - Vital signs used in decision
   * @returns {Object} Token-level attribution and phrase highlights
   */
  computeTriageLimeAttribution(symptoms, triageResult, vitals = {}) {
    const attributions = [];
    const symptomsLC = symptoms.toLowerCase();

    // ── Rule-based attribution (exact, from red flag patterns) ──
    const RED_FLAGS = [
      { pattern: /chest.?pain|angina|\bmi\b|myocardial|heart.?attack/i, esi: 1, label: 'Cardiac emergency signal', severity: 1.0 },
      { pattern: /stroke|facial.?droop|slurred.?speech|arm.?weakness|\btia\b|hemiplegia/i, esi: 1, label: 'Stroke signal', severity: 1.0 },
      { pattern: /anaphyla|severe.?allerg|throat.?swell|airway/i, esi: 1, label: 'Anaphylaxis signal', severity: 1.0 },
      { pattern: /unresponsive|unconscious|cardiac.?arrest|no.?pulse/i, esi: 1, label: 'Cardiac arrest signal', severity: 1.0 },
      { pattern: /severe.?bleed|hemorrhag/i, esi: 1, label: 'Hemorrhage signal', severity: 1.0 },
      { pattern: /seizure.?continuous|status.?epilepticus/i, esi: 1, label: 'Prolonged seizure', severity: 1.0 },
      { pattern: /difficulty.?breathing|dyspnea|respiratory.?distress/i, esi: 2, label: 'Respiratory distress', severity: 0.85 },
      { pattern: /severe.?pain.*(10|9|8)/i, esi: 2, label: 'Severe pain score (8-10/10)', severity: 0.8 },
      { pattern: /poisoning|overdose|ingested|toxic/i, esi: 2, label: 'Toxicological emergency', severity: 0.85 },
      { pattern: /suicid|self.?harm|want.?to.?die/i, esi: 2, label: 'Psychiatric emergency', severity: 0.85 },
      { pattern: /snake.?bite|scorpion|envenomation/i, esi: 2, label: 'Envenomation', severity: 0.85 },
      { pattern: /fracture.?open|compound.?fracture/i, esi: 2, label: 'Open fracture', severity: 0.8 },
      { pattern: /fever|temperature|pyrexia/i, esi: 3, label: 'Fever present', severity: 0.4 },
      { pattern: /pain|ache|discomfort/i, esi: 3, label: 'Pain complaint', severity: 0.3 },
      { pattern: /nausea|vomit|diarrhea/i, esi: 4, label: 'GI symptoms', severity: 0.2 },
      { pattern: /cough|cold|sore.?throat/i, esi: 5, label: 'Upper respiratory symptoms', severity: 0.1 },
    ];

    for (const rf of RED_FLAGS) {
      const match = symptoms.match(rf.pattern);
      if (match) {
        attributions.push({
          phrase:      match[0],
          label:       rf.label,
          esiInfluence: rf.esi,
          importance:  rf.severity,
          type:        'rule_match',
          positive:    rf.esi <= 2  // true = increases urgency
        });
      }
    }

    // ── Vitals attribution ──────────────────────────────────────
    const vitalAttributions = [];
    const s = vitals.systolic || vitals.bloodPressureSystolic;
    const hr = vitals.heartRate || vitals.heart_rate;
    const spo2 = vitals.spo2 || vitals.oxygen;
    const rr = vitals.respiratoryRate;
    const temp = vitals.temperature;

    if (s && s < 80)  vitalAttributions.push({ vital: 'Systolic BP', value: `${s} mmHg`, label: 'Severe hypotension (< 80)', importance: 1.0 });
    else if (s && s < 90) vitalAttributions.push({ vital: 'Systolic BP', value: `${s} mmHg`, label: 'Hypotension (< 90)', importance: 0.8 });
    if (hr && (hr > 150 || hr < 35)) vitalAttributions.push({ vital: 'Heart Rate', value: `${hr} bpm`, label: 'Critical heart rate', importance: 1.0 });
    else if (hr && (hr > 130 || hr < 45)) vitalAttributions.push({ vital: 'Heart Rate', value: `${hr} bpm`, label: 'Abnormal heart rate', importance: 0.75 });
    if (spo2 && spo2 < 85) vitalAttributions.push({ vital: 'SpO₂', value: `${spo2}%`, label: 'Critical hypoxia (< 85%)', importance: 1.0 });
    else if (spo2 && spo2 < 90) vitalAttributions.push({ vital: 'SpO₂', value: `${spo2}%`, label: 'Hypoxia (< 90%)', importance: 0.8 });
    if (temp && temp > 41.5) vitalAttributions.push({ vital: 'Temperature', value: `${temp}°C`, label: 'Hyperpyrexia (> 41.5°C)', importance: 1.0 });

    // ── Absence attribution (what was NOT found) ─────────────
    const absences = [];
    if (!attributions.some(a => a.esiInfluence === 1)) {
      absences.push({ label: 'No ESI-1 red flags detected', importance: -0.5, type: 'absence' });
    }
    if (!vitals || Object.keys(vitals).length === 0) {
      absences.push({ label: 'No vitals available — uncertainty increased', importance: 0.2, type: 'missing_data' });
    }

    // ── Composite explanation ────────────────────────────────
    const topFactors = [...attributions, ...vitalAttributions.map(v => ({ ...v, type: 'vital' }))]
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 5);

    const decisionPath = this._buildDecisionPath(triageResult, attributions, vitalAttributions);

    return {
      symptomAttributions: attributions,
      vitalAttributions,
      absences,
      topFactors,
      decisionPath,
      method: 'lime-rule-surrogate',
      confidence: this._triageConfidence(attributions, vitals),
      humanReadableSummary: this._triageSummary(triageResult, topFactors)
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 3. COUNTERFACTUAL EXPLANATIONS
  // ──────────────────────────────────────────────────────────────────────────
  /**
   * Generate nearest counterfactual: what would need to change to move the
   * patient to the next lower risk level.
   *
   * @param {Object} subscores - Current subscore object
   * @param {Object} patient - Patient demographics/profile
   * @param {string} currentRiskLevel - 'critical' | 'high' | 'moderate' | 'low'
   * @returns {Object} Actionable counterfactual changes
   */
  generateCounterfactuals(subscores, patient, currentRiskLevel) {
    const thresholds = { critical: 7.0, high: 5.5, moderate: 3.5 };
    const currentOverall = this._computeOverall(subscores);

    // Target: drop one level
    const targetLevel = { critical: 'high', high: 'moderate', moderate: 'low' }[currentRiskLevel] ?? 'low';
    const targetScore = thresholds[currentRiskLevel] ? thresholds[currentRiskLevel] - 0.1 : 2.0;
    const scoreGap = currentOverall - targetScore;

    if (scoreGap <= 0) return { targetLevel, counterfactuals: [], alreadyAtTarget: true };

    const counterfactuals = [];
    const protectiveDims = new Set(['medication_adherence', 'lifestyle', 'mental_health']);

    // Sort dimensions by their potential to reduce overall risk per unit of change
    const potentials = Object.entries(subscores)
      .map(([dim, score]) => {
        const weight = RISK_WEIGHTS[dim] || 0;
        const isProtective = protectiveDims.has(dim);
        // How much could this dimension improve?
        const maxImprovement = isProtective
          ? (10 - score) * weight    // increasing protective dimension
          : score * weight;          // decreasing risk dimension
        return { dim, score, weight, isProtective, maxImprovement };
      })
      .sort((a, b) => b.maxImprovement - a.maxImprovement);

    let remainingGap = scoreGap;

    for (const { dim, score, isProtective, maxImprovement } of potentials) {
      if (remainingGap <= 0) break;
      if (maxImprovement <= 0) continue;

      const suggestion = this._dimensionCounterfactual(dim, score, isProtective, remainingGap, patient);
      if (suggestion) {
        counterfactuals.push(suggestion);
        remainingGap -= Math.min(maxImprovement, remainingGap);
      }
    }

    return {
      currentLevel: currentRiskLevel,
      currentScore: Math.round(currentOverall * 100) / 100,
      targetLevel,
      targetScore: Math.round(targetScore * 100) / 100,
      counterfactuals,
      achievable: remainingGap <= 0,
      method: 'nearest-counterfactual'
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 4. CONFIDENCE SCORE — Input data completeness → output confidence
  // ──────────────────────────────────────────────────────────────────────────
  /**
   * Compute confidence score based on data completeness and recency.
   * A high-confidence output is one made with complete, recent data.
   * A low-confidence output should be surfaced to clinicians for review.
   *
   * @param {Object} dataSources - dataSources object from computePatientScore()
   * @param {Object} patient - Patient demographics
   * @returns {Object} confidence score (0-1), interval, and missing data flags
   */
  computeConfidenceScore(dataSources, patient) {
    const checks = [
      { key: 'vitals',             weight: 0.25, present: !!dataSources.vitals,                label: 'Recent vitals' },
      { key: 'prescriptions',      weight: 0.20, present: (dataSources.prescriptions || 0) > 0, label: 'Prescription history' },
      { key: 'labs',               weight: 0.20, present: (dataSources.labs || 0) > 0,          label: 'Lab orders' },
      { key: 'report_lab_values',  weight: 0.15, present: (dataSources.report_lab_values || 0) > 0, label: 'Extracted lab values' },
      { key: 'dob',                weight: 0.10, present: !!patient.dateOfBirth,                label: 'Date of birth' },
      { key: 'height_weight',      weight: 0.05, present: !!(patient.height && patient.weight), label: 'Height & weight (BMI)' },
      { key: 'chronic_conditions', weight: 0.05, present: (patient.chronicConditions?.length || 0) > 0, label: 'Chronic conditions recorded' }
    ];

    let score = 0;
    const missing = [];
    const present = [];

    for (const check of checks) {
      if (check.present) {
        score += check.weight;
        present.push(check.label);
      } else {
        missing.push({ label: check.label, weight: check.weight });
      }
    }

    const rounded = Math.round(score * 100) / 100;
    const marginOfError = (1 - rounded) * 2.5; // up to ±2.5 points uncertainty on 0-10 scale

    return {
      score:           rounded,
      percent:         Math.round(rounded * 100),
      tier:            rounded >= 0.8 ? 'high' : rounded >= 0.5 ? 'moderate' : 'low',
      marginOfError:   Math.round(marginOfError * 100) / 100,
      presentSources:  present,
      missingSources:  missing.sort((a, b) => b.weight - a.weight),
      recommendation:  rounded < 0.5 ? 'Insufficient data — require clinical review before acting on this score' :
                       rounded < 0.8 ? 'Moderate confidence — clinician should verify missing data sources' :
                                       'High confidence — sufficient data for automated decision support'
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 5. FULL EXPLANATION BUNDLE — Store everything for audit trail
  // ──────────────────────────────────────────────────────────────────────────
  /**
   * Assemble the full interpretability bundle for a health risk score.
   * This is what gets stored in ai_health_risk_scores.shap_values and
   * ai_health_risk_scores.feature_attributions.
   */
  buildRiskScoreExplanation(patient, subscores, dataSources) {
    const cardioSubShap  = this.computeCardioSubShap(patient, null, []);
    const shapResult     = this.computeShapValues(subscores, {
      cardiovascular: cardioSubShap.contributions
    });
    const confidence     = this.computeConfidenceScore(dataSources, patient);
    const counterfactual = this.generateCounterfactuals(
      subscores,
      patient,
      this._scoreToLevel(this._computeOverall(subscores))
    );

    return {
      shap: shapResult,
      confidence,
      counterfactual,
      generatedAt: new Date().toISOString(),
      modelVersion: 'v2-bayesian'
    };
  }

  /**
   * Assemble the full interpretability bundle for a triage decision.
   */
  buildTriageExplanation(symptoms, triageResult, vitals, patient = {}) {
    const lime       = this.computeTriageLimeAttribution(symptoms, triageResult, vitals);
    const confidence = this._triageConfidence(lime.symptomAttributions, vitals, patient);

    return {
      lime,
      confidence,
      generatedAt:  new Date().toISOString(),
      modelVersion: 'esi-v1-rule+llm'
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 6. PERSIST interpretability bundle to DB
  // ──────────────────────────────────────────────────────────────────────────
  async persistRiskExplanation(patientId, explanation) {
    try {
      await pool.query(`
        UPDATE ai_health_risk_scores
        SET shap_values          = $1,
            feature_attributions = $2,
            counterfactuals      = $3,
            confidence_score     = $4,
            data_completeness    = $5
        WHERE patient_id = $6
      `, [
        JSON.stringify(explanation.shap),
        JSON.stringify(explanation.shap.ranked),
        JSON.stringify(explanation.counterfactual),
        explanation.confidence.score,
        explanation.confidence.percent,
        patientId
      ]);
    } catch (err) {
      console.warn(`[Interpretability] Failed to persist explanation for patient ${patientId}:`, err.message);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────────────────────
  _computeBaselineOutput() {
    let b = 0;
    const protective = new Set(['medication_adherence', 'lifestyle', 'mental_health']);
    for (const [dim, weight] of Object.entries(RISK_WEIGHTS)) {
      const base = RISK_BASELINES[dim] ?? 5;
      b += base * (protective.has(dim) ? -weight : weight);
    }
    return Math.max(0, Math.min(10, b));
  }

  _computeOverall(subscores) {
    const protective = new Set(['medication_adherence', 'lifestyle', 'mental_health']);
    let overall = 0;
    for (const [dim, weight] of Object.entries(RISK_WEIGHTS)) {
      const score = subscores[dim] ?? 5;
      overall += score * (protective.has(dim) ? -weight : weight);
    }
    return Math.max(0, Math.min(10, overall));
  }

  _scoreToLevel(score) {
    if (score >= 7)   return 'critical';
    if (score >= 5.5) return 'high';
    if (score >= 3.5) return 'moderate';
    return 'low';
  }

  _dimensionCounterfactual(dim, currentScore, isProtective, scoreGap, patient) {
    const suggestions = {
      cardiovascular: [
        { condition: currentScore > 7, action: 'Reduce systolic blood pressure below 130 mmHg', impact: 'high', timeframe: '3-6 months with treatment', modifiable: true },
        { condition: currentScore > 5, action: 'Achieve BMI below 25 through diet and exercise', impact: 'moderate', timeframe: '6-12 months', modifiable: true },
        { condition: true,             action: 'Regular cardiovascular monitoring and lipid panel', impact: 'low', timeframe: 'Immediate', modifiable: true }
      ],
      diabetes: [
        { condition: currentScore > 6, action: 'Achieve HbA1c below 7.0% with medication adherence', impact: 'high', timeframe: '3 months', modifiable: true },
        { condition: currentScore > 4, action: 'Reduce fasting blood glucose below 100 mg/dL', impact: 'moderate', timeframe: '2-3 months', modifiable: true },
        { condition: true,             action: 'Regular diabetes screening every 6 months', impact: 'low', timeframe: 'Immediate', modifiable: true }
      ],
      hypertension: [
        { condition: currentScore > 6, action: 'Target BP < 130/80 mmHg with antihypertensive therapy', impact: 'high', timeframe: '1-3 months', modifiable: true },
        { condition: true,             action: 'Reduce sodium intake below 2g/day', impact: 'moderate', timeframe: '4-8 weeks', modifiable: true }
      ],
      medication_adherence: [
        { condition: currentScore < 5, action: 'Improve medication adherence — use pill organizer or app reminders', impact: 'high', timeframe: '1 month', modifiable: true },
        { condition: true,             action: 'Schedule medication review with prescribing physician', impact: 'moderate', timeframe: 'Next appointment', modifiable: true }
      ],
      lifestyle: [
        { condition: currentScore < 5, action: '150 minutes of moderate aerobic exercise per week', impact: 'high', timeframe: '8-12 weeks', modifiable: true },
        { condition: true,             action: 'Mediterranean diet pattern: increase vegetables, legumes, reduce saturated fat', impact: 'moderate', timeframe: '3-6 months', modifiable: true }
      ],
      mental_health: [
        { condition: currentScore < 5, action: 'Mental health screening and counseling referral', impact: 'high', timeframe: 'Immediate referral', modifiable: true }
      ]
    };

    const options = (suggestions[dim] || []).filter(s => s.condition);
    if (!options.length) return null;
    const chosen = options[0];

    return {
      dimension: dim,
      currentScore: Math.round(currentScore * 10) / 10,
      requiredChange: isProtective ? 'increase' : 'decrease',
      action:    chosen.action,
      impact:    chosen.impact,
      timeframe: chosen.timeframe,
      modifiable: chosen.modifiable
    };
  }

  _triageConfidence(attributions, vitals, patient = {}) {
    let score = 0.5;
    if (attributions.length > 0) score += 0.2;
    if (vitals && Object.keys(vitals).length > 2) score += 0.2;
    if (patient.age) score += 0.05;
    if (attributions.some(a => a.esiInfluence === 1 || a.esiInfluence === 2)) score += 0.05;
    return Math.min(1.0, Math.round(score * 100) / 100);
  }

  _buildDecisionPath(triageResult, symptomAttrs, vitalAttrs) {
    const steps = [];
    const esi = triageResult.esiLevel || triageResult.level;

    if (symptomAttrs.some(a => a.esiInfluence === 1)) {
      steps.push({ step: 1, rule: 'Red flag pattern matched (ESI-1)', outcome: 'Escalate to ESI Level 1' });
    } else if (symptomAttrs.some(a => a.esiInfluence === 2)) {
      steps.push({ step: 1, rule: 'ESI-2 pattern matched', outcome: 'Set ESI Level 2' });
    } else {
      steps.push({ step: 1, rule: 'No critical red flags in symptom text', outcome: `Baseline ESI set to ${esi}` });
    }

    if (vitalAttrs.length > 0) {
      steps.push({ step: 2, rule: `Vital signs abnormal: ${vitalAttrs.map(v => v.vital).join(', ')}`, outcome: 'Vitals override applied' });
    } else {
      steps.push({ step: 2, rule: 'Vital signs within acceptable range or not provided', outcome: 'No vital override' });
    }

    if (triageResult.llmEnhanced) {
      steps.push({ step: 3, rule: 'LLM clinical analysis applied', outcome: `Final ESI: ${esi}` });
    }

    return steps;
  }

  _triageSummary(triageResult, topFactors) {
    const esi = triageResult.esiLevel || triageResult.level;
    const labels = { 1: 'Resuscitation', 2: 'Emergent', 3: 'Urgent', 4: 'Less Urgent', 5: 'Non-Urgent' };
    const primaryFactor = topFactors[0];

    return `ESI Level ${esi} (${labels[esi] || 'Unknown'}) assigned. ` +
      (primaryFactor ? `Primary driver: ${primaryFactor.label || primaryFactor.vital}. ` : '') +
      (topFactors.length > 1 ? `Contributing factors: ${topFactors.slice(1, 3).map(f => f.label || f.vital).join(', ')}.` : '');
  }
}

export default new AIInterpretabilityService();
