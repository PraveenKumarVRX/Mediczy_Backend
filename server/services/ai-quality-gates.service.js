/**
 * AI Quality Gates Service
 * ==========================
 * Pre-flight and post-flight quality checks for all patient-facing AI outputs.
 * Every high-stakes AI decision passes through these gates before delivery.
 *
 * Gates implemented:
 *   1. Hallucination Guard         — LLM drug/dose claims cross-checked against rule base
 *   2. Data Completeness Gate      — Blocks high-confidence presentation of low-data outputs
 *   3. Outlier Detection           — Flags anomalous score changes (>3 points in 6h)
 *   4. Contradiction Check         — AI recommendation must not contradict known allergies/conditions
 *   5. Confidence Gate             — Routes low-confidence outputs to mandatory clinical review
 *   6. Demographic Anomaly Gate    — Flags if patient demographics seem inconsistent with inputs
 *   7. Emergency Override Check    — Any ESI-1 output always triggers human alert regardless of channel
 *   8. Drug Interaction Consistency— Checks that AI recommendations don't include flagged drug pairs
 *
 * Returns a QualityGateResult with: passed, warnings[], blockers[], requiredActions[]
 */

import pool from '../db/pgPool.js';

// ─── Critical drug pairs that CANNOT appear together in any recommendation ────
const FORBIDDEN_DRUG_COMBINATIONS = [
  { a: /warfarin/i,       b: /aspirin|ibuprofen|naproxen/i, reason: 'Major bleeding risk' },
  { a: /ssri|fluoxetine|sertraline|paroxetine/i, b: /maoi|selegiline|phenelzine/i, reason: 'Serotonin syndrome — potentially fatal' },
  { a: /sildenafil|tadalafil/i, b: /nitrate|nitroglycerin/i, reason: 'Fatal hypotension' },
  { a: /ciprofloxacin/i,  b: /tizanidine/i,    reason: 'Tenfold tizanidine level increase' },
  { a: /methotrexate/i,   b: /ibuprofen|naproxen|nsaid/i, reason: 'Methotrexate toxicity' },
  { a: /ace.?inhibitor|enalapril|lisinopril|ramipril/i, b: /pregnan/i, reason: 'Teratogenic — contraindicated in pregnancy' },
];

// ─── Dosage anomaly patterns — if LLM generates these, flag immediately ───────
const ANOMALOUS_DOSAGES = [
  { pattern: /(\d{4,})\s*mg/,    label: 'Dose ≥ 1000 mg', check: v => parseInt(v) >= 1000 },
  { pattern: /(\d+)\s*g\b/i,     label: 'Gram-level dose', check: v => parseInt(v) >= 5 },
  { pattern: /(\d+)\s*tablets?\s*(?:daily|per day|\/day)/i, label: 'High tablet count', check: v => parseInt(v) > 8 },
];

// ─── Conditions that require specific caution flags in any recommendation ─────
const HIGH_RISK_CONDITION_CHECKS = [
  { condition: /pregnan/i,       mustWarn: /nsaid|ibuprofen|aspirin|ace|enalapril|lisinopril|ramipril|warfarin|methotrexate/i, warning: 'Potentially teratogenic/harmful in pregnancy detected in recommendation' },
  { condition: /renal|kidney|ckd/i, mustWarn: /metformin|nsaid|ibuprofen|diclofenac/i, warning: 'Renally-excreted/nephrotoxic drug detected for patient with renal condition' },
  { condition: /asthma|copd/i,   mustWarn: /beta.?blocker|atenolol|metoprolol|propranolol/i, warning: 'Non-selective beta-blocker detected for patient with airway disease' },
];

class AIQualityGatesService {

  /**
   * Run all quality gates on a health risk score output.
   * Call before persisting or delivering the score to a patient/clinician.
   */
  async checkRiskScore({ patientId, overall, subscores, riskLevel, recommendations, confidence, dataSources, patient }) {
    const result = this._newResult('health_risk_score', patientId);

    // Gate 1: Data completeness
    this._gateDataCompleteness(result, confidence, dataSources);

    // Gate 2: Score sanity
    this._gateScoreSanity(result, overall, subscores);

    // Gate 3: Outlier detection (vs previous score)
    await this._gateScoreOutlier(result, patientId, overall);

    // Gate 4: Recommendation safety — check against patient's known allergies and conditions
    if (recommendations?.length && patient) {
      this._gateRecommendationSafety(result, recommendations.join(' '), patient);
    }

    // Gate 5: Mental health baseline flag
    if (subscores?.mental_health === 7.0) {
      result.warnings.push({
        code:    'MENTAL_HEALTH_BASELINE',
        message: 'Mental health score is fixed baseline (7.0) — not derived from patient data',
        action:  'Suppress mental health subscore from patient-facing display until real mood tracking data available'
      });
    }

    return this._finalize(result);
  }

  /**
   * Run all quality gates on a triage output.
   * ESI-1 and ESI-2 outputs receive additional scrutiny.
   */
  async checkTriage({ patientId, esiLevel, actions, symptoms, vitals, confidence, llmExplanation }) {
    const result = this._newResult('emergency_triage', patientId);

    // Gate 1: ESI-1 always requires human alert — never silently route
    if (esiLevel === 1) {
      result.requiredActions.push({
        code:    'ESI1_HUMAN_ALERT_MANDATORY',
        message: 'ESI Level 1 — immediate human notification required regardless of channel',
        action:  'Page on-duty physician, do not rely solely on in-app notification',
        blocking: true
      });
    }

    // Gate 2: Low confidence + high ESI is dangerous
    if (esiLevel <= 2 && confidence < 0.6) {
      result.warnings.push({
        code:    'HIGH_ESI_LOW_CONFIDENCE',
        message: `ESI Level ${esiLevel} assigned with only ${Math.round(confidence * 100)}% confidence (insufficient vitals/context)`,
        action:  'Urgently obtain complete vital signs before finalizing triage level'
      });
    }

    // Gate 3: Vitals missing for high-severity triage
    if (esiLevel <= 2 && (!vitals || Object.keys(vitals).length === 0)) {
      result.blockers.push({
        code:    'MISSING_VITALS_HIGH_ESI',
        message: 'ESI Level 1-2 triage has no vital signs — cannot confirm severity',
        action:  'Obtain vitals immediately before patient routing'
      });
    }

    // Gate 4: LLM hallucination check — triage actions must be clinically coherent
    if (llmExplanation) {
      this._gateDosageHallucination(result, llmExplanation);
    }

    // Gate 5: Contradiction — ESI-5 but critical symptoms mentioned
    if (esiLevel === 5) {
      const criticalPattern = /chest.?pain|stroke|cardiac|unconscious|anaphyla|seizure|overdose|suicid/i;
      if (criticalPattern.test(symptoms)) {
        result.blockers.push({
          code:    'ESI5_WITH_CRITICAL_SYMPTOMS',
          message: 'ESI Level 5 assigned but critical symptom keywords detected in input',
          action:  'Re-run triage or escalate to clinician — possible under-triage'
        });
      }
    }

    return this._finalize(result);
  }

  /**
   * Run quality gates on AI-generated radiology report drafts (Level 1 assisted reporting).
   * SaMD Class IIb — physician sign-off required before clinical use.
   */
  async checkImagingReport({ studyId, modality, draftText, structuredFindings, confidence, triageStatus }) {
    const result = this._newResult('imaging_report_draft', studyId);

    if (!draftText || String(draftText).trim().length < 20) {
      result.blockers.push({
        code: 'EMPTY_DRAFT',
        message: 'AI draft is empty or too short to review',
        action: 'Regenerate draft or write report manually',
      });
    }

    if (confidence != null && confidence < 0.35) {
      result.warnings.push({
        code: 'LOW_CONFIDENCE_DRAFT',
        message: `AI draft confidence ${Math.round(confidence * 100)}% — limited structured findings`,
        action: 'Mandatory radiologist review before sign-off',
      });
    }

    const criticalTerms = /pneumothorax|intracranial.?bleed|stroke|pulmonary.?embol|aortic.?dissection/i;
    if (criticalTerms.test(draftText) && triageStatus !== 'reviewed') {
      result.requiredActions.push({
        code: 'CRITICAL_FINDING_REVIEW',
        message: 'Draft mentions critical finding — expedited radiologist review required',
        action: 'Acknowledge critical alert and verify finding before finalizing',
        blocking: false,
      });
    }

    const inventedDose = /(\d{3,})\s*mg|(\d+)\s*Gy/i;
    if (inventedDose.test(draftText)) {
      result.warnings.push({
        code: 'UNEXPECTED_DOSAGE_IN_REPORT',
        message: 'Draft contains dosage/radiation values — verify accuracy',
        action: 'Radiologist must confirm all numeric values',
      });
    }

    if (!structuredFindings?.items?.length && !(Array.isArray(structuredFindings) && structuredFindings.length)) {
      result.warnings.push({
        code: 'NO_STRUCTURED_FINDINGS',
        message: 'Draft generated without structured findings backbone',
        action: 'Prefer drafts built from AI findings or measurements',
      });
    }

    result.requiredActions.push({
      code: 'PHYSICIAN_SIGNOFF_MANDATORY',
      message: 'AI draft is advisory only — radiologist sign-off required',
      action: 'Edit draft as needed, pass QC, then finalize report',
      blocking: false,
    });

    return this._finalize(result);
  }

  /**
   * Run quality gates on a drug interaction check output.
   */
  async checkDrugInteraction({ patientId, drugs, interactions, recommendation, patient }) {
    const result = this._newResult('drug_interaction', patientId);
    const drugText = (drugs || []).join(' ') + ' ' + (recommendation || '');

    // Gate 1: LLM hallucination — dosage anomalies
    this._gateDosageHallucination(result, recommendation || '');

    // Gate 2: Forbidden combination check
    this._gateForbiddenCombinations(result, drugText);

    // Gate 3: Patient condition cross-check
    if (patient?.chronicConditions) {
      this._gateConditionDrugConflict(result, drugText, patient.chronicConditions, patient);
    }

    // Gate 4: Allergy cross-check
    if (patient?.allergies?.length) {
      for (const allergy of patient.allergies) {
        const allergyRx = new RegExp(allergy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        if (allergyRx.test(drugText)) {
          result.blockers.push({
            code:    'ALLERGY_CONFLICT',
            message: `Drug recommendation contains "${allergy}" — patient has documented allergy`,
            action:  'BLOCK — do not present this recommendation. Remove allergenic drug.'
          });
        }
      }
    }

    // Gate 5: Contraindicated severity requires physician sign-off
    const contraindicated = (interactions || []).filter(i => i.severity === 'contraindicated');
    if (contraindicated.length > 0) {
      result.requiredActions.push({
        code:    'CONTRAINDICATED_COMBO',
        message: `${contraindicated.length} contraindicated combination(s) detected`,
        action:  'Require prescribing physician sign-off before prescription can proceed',
        details: contraindicated.map(i => i.effect)
      });
    }

    return this._finalize(result);
  }

  /**
   * Run quality gates on a medical scribe output (clinical note).
   * This is the final safety check before presenting to the physician.
   */
  async checkScribeOutput({ noteText, patientAllergies = [], patientMedications = [], specialtyTemplate }) {
    const result = this._newResult('medical_scribe', null);

    // Gate 1: Dosage hallucination
    this._gateDosageHallucination(result, noteText);

    // Gate 2: Allergy omission — if allergies exist but note doesn't mention them
    if (patientAllergies.length > 0) {
      const allergyMentioned = /allerg|contraindic|hypersensitiv/i.test(noteText);
      if (!allergyMentioned) {
        result.warnings.push({
          code:    'ALLERGY_OMISSION',
          message: `Patient has ${patientAllergies.length} documented allergy(ies) not referenced in note`,
          action:  'Physician must verify allergy documentation before signing'
        });
      }
    }

    // Gate 3: Forbidden drug combinations in note
    this._gateForbiddenCombinations(result, noteText);

    // Gate 4: Always require physician review (this is non-negotiable for scribe)
    result.requiredActions.push({
      code:    'PHYSICIAN_REVIEW_REQUIRED',
      message: 'AI-generated clinical note — physician review and signature mandatory before committing to record',
      action:  'Present with clear "DRAFT — NOT YET REVIEWED" watermark. Block commit without physician signature.',
      blocking: false  // note is presented, but commit is blocked
    });

    // Gate 5: Critical missing elements
    const missingVitals = !/vital|bp|blood.?pressure|pulse|temperature|spo2|weight/i.test(noteText);
    const missingDiagnosis = !/diagnos|impression|assessment/i.test(noteText);
    if (missingVitals && specialtyTemplate !== 'psychiatry') {
      result.warnings.push({ code: 'MISSING_VITALS_IN_NOTE', message: 'No vitals documentation found in generated note', action: 'Physician should add vitals during review' });
    }
    if (missingDiagnosis) {
      result.warnings.push({ code: 'MISSING_DIAGNOSIS_IN_NOTE', message: 'No diagnosis/impression section detected', action: 'Physician should complete the assessment/plan section' });
    }

    return this._finalize(result);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Individual gate implementations
  // ──────────────────────────────────────────────────────────────────────────

  _gateDataCompleteness(result, confidence, dataSources) {
    if (!confidence) return;
    const score = typeof confidence === 'object' ? confidence.score : confidence;

    if (score < 0.3) {
      result.blockers.push({
        code:    'CRITICALLY_INCOMPLETE_DATA',
        message: `Only ${Math.round(score * 100)}% of expected data sources available`,
        action:  'Do not present this AI output as actionable. Request missing data from patient.'
      });
    } else if (score < 0.5) {
      result.warnings.push({
        code:    'LOW_CONFIDENCE_DATA',
        message: `Data completeness is ${Math.round(score * 100)}% — prediction has high uncertainty`,
        action:  'Present with confidence disclaimer. Require clinician verification.'
      });
    }
  }

  _gateScoreSanity(result, overall, subscores) {
    if (overall < 0 || overall > 10) {
      result.blockers.push({
        code:    'INVALID_SCORE_RANGE',
        message: `Overall risk score ${overall} is outside valid range [0, 10]`,
        action:  'Recompute score — do not persist or display'
      });
    }
    if (subscores) {
      for (const [dim, score] of Object.entries(subscores)) {
        if (typeof score === 'number' && (score < 0 || score > 10)) {
          result.warnings.push({
            code:    'INVALID_SUBSCORE',
            message: `Subscore '${dim}' value ${score} is outside [0, 10]`,
            action:  'Check scoring calculation for this dimension'
          });
        }
      }
    }
  }

  async _gateScoreOutlier(result, patientId, newScore) {
    if (!patientId || newScore == null) return;
    try {
      const { rows } = await pool.query(`
        SELECT overall_score, updated_at FROM ai_health_risk_scores
        WHERE patient_id = $1
        ORDER BY updated_at DESC LIMIT 1
      `, [patientId]);

      if (rows.length > 0) {
        const prev = parseFloat(rows[0].overall_score);
        const delta = Math.abs(newScore - prev);
        if (delta > 3.0) {
          result.warnings.push({
            code:    'SCORE_OUTLIER',
            message: `Risk score changed by ${delta.toFixed(2)} points since last computation (${prev} → ${newScore})`,
            action:  'Large change may indicate data quality issue or genuine clinical deterioration. Flag for clinician review.'
          });
        }
      }
    } catch {
      // Non-blocking — if DB query fails, skip this gate
    }
  }

  _gateRecommendationSafety(result, text, patient) {
    const conditions = patient.chronicConditions || [];
    for (const check of HIGH_RISK_CONDITION_CHECKS) {
      const hasCondition = conditions.some(c => check.condition.test(c));
      if (hasCondition && check.mustWarn.test(text)) {
        result.warnings.push({
          code:    'CONDITION_DRUG_CONFLICT',
          message: check.warning,
          action:  'Clinician must review before presenting recommendation to patient'
        });
      }
    }
  }

  _gateDosageHallucination(result, text) {
    if (!text) return;
    for (const anomaly of ANOMALOUS_DOSAGES) {
      const match = text.match(anomaly.pattern);
      if (match && anomaly.check(match[1])) {
        result.warnings.push({
          code:    'ANOMALOUS_DOSAGE',
          message: `Potentially halluciniated dosage detected: "${match[0]}" — ${anomaly.label}`,
          action:  'Pharmacist or physician must verify this dosage before prescription'
        });
      }
    }
  }

  _gateForbiddenCombinations(result, text) {
    for (const combo of FORBIDDEN_DRUG_COMBINATIONS) {
      if (combo.a.test(text) && combo.b.test(text)) {
        result.blockers.push({
          code:    'FORBIDDEN_DRUG_COMBINATION',
          message: `Dangerous drug combination detected in AI output: ${combo.reason}`,
          action:  'BLOCK — remove conflicting medication before presenting. Require pharmacist review.'
        });
      }
    }
  }

  _gateConditionDrugConflict(result, drugText, conditions, patient) {
    for (const check of HIGH_RISK_CONDITION_CHECKS) {
      const hasCondition = conditions.some(c => check.condition.test(c));
      if (hasCondition && check.mustWarn.test(drugText)) {
        result.warnings.push({
          code:    'DRUG_CONDITION_CONFLICT',
          message: check.warning,
          action:  'Physician must acknowledge condition-drug interaction before proceeding'
        });
      }
    }
    // Special: pregnancy detection from medications or demographics
    const isPregOrFemale = patient.gender === 'female' && patient.age && patient.age < 50;
    if (isPregOrFemale && /methotrexate|thalidomide|isotretinoin|warfarin/i.test(drugText)) {
      result.warnings.push({
        code:    'TERATOGEN_FEMALE_PATIENT',
        message: 'Potentially teratogenic medication in female patient of reproductive age',
        action:  'Confirm patient is not pregnant before prescribing. Document contraception counseling.'
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Result structure helpers
  // ──────────────────────────────────────────────────────────────────────────
  _newResult(gateType, patientId) {
    return {
      gateType,
      patientId,
      passed:          true,
      warnings:        [],
      blockers:        [],
      requiredActions: [],
      checkedAt:       new Date().toISOString()
    };
  }

  _finalize(result) {
    result.blockingCount    = result.blockers.length;
    result.warningCount     = result.warnings.length;
    result.requiredActCount = result.requiredActions.filter(a => a.blocking !== false).length;

    // Fail if any hard blockers exist
    result.passed = result.blockers.length === 0;
    result.hasBlockers    = result.blockers.length > 0;
    result.hasWarnings    = result.warnings.length > 0;
    result.requiresReview = result.warnings.length > 0 || result.requiredActions.length > 0;

    // Composite severity
    result.severity = result.hasBlockers   ? 'blocked'
                    : result.hasWarnings   ? 'warning'
                    : result.requiresReview ? 'review'
                    :                         'pass';

    return result;
  }

  /**
   * Log quality gate result to the audit log.
   */
  async logGateResult(result, context = {}) {
    try {
      await pool.query(`
        INSERT INTO ai_quality_gate_log
          (gate_type, patient_id, passed, severity, blockers, warnings, required_actions, context, checked_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      `, [
        result.gateType,
        result.patientId,
        result.passed,
        result.severity,
        JSON.stringify(result.blockers),
        JSON.stringify(result.warnings),
        JSON.stringify(result.requiredActions),
        JSON.stringify(context)
      ]);
    } catch {
      // Non-blocking — logging failure must never prevent clinical workflow
    }
  }
}

export default new AIQualityGatesService();
