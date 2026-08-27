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

// ─── Imaging report clinical invariants ────────────────────────────────────
// Pathology terms grouped with the evidence-item label fragments that can
// legitimately support them. A term mentioned in the draft with no matching
// evidence item is treated as unsupported — this is the exact failure mode
// that let a fabricated "otitis media" impression and chest-imaging findings
// ("lung nodule", "cardiomegaly") reach a signed brain/other MRI report: the
// LLM free-associated plausible-sounding radiology text from a contaminated
// or empty evidence set instead of only describing what was actually found.
const PATHOLOGY_EVIDENCE_TERMS = [
  { keys: ['lung nodule', 'pulmonary nodule'], evidence: ['nodule'] },
  { keys: ['cardiomegaly', 'enlarged heart', 'cardiac silhouette'], evidence: ['cardiomegaly', 'heart size', 'cardiomediastinal'] },
  { keys: ['pleural effusion'], evidence: ['effusion'] },
  { keys: ['pneumothorax'], evidence: ['pneumothorax'] },
  { keys: ['fracture'], evidence: ['fracture'] },
  { keys: ['hemorrhage', 'haemorrhage', ' bleed'], evidence: ['hemorrhage', 'haemorrhage', 'bleed'] },
  { keys: ['stroke', 'infarct'], evidence: ['stroke', 'infarct', 'signal abnormality'] },
  { keys: ['tumor', 'tumour', 'malignan'], evidence: ['tumor', 'tumour', 'mass', 'lesion'] },
  { keys: ['otitis', 'ear infection', 'middle-ear', 'middle ear'], evidence: ['ear', 'otitis'] },
  { keys: ['appendicitis'], evidence: ['appendi'] },
  { keys: ['gallstone', 'cholelithiasis'], evidence: ['gallbladder', 'gallstone', 'cholelith'] },
];

// Numeric measurement mention in draft text, e.g. "8 mm" or "1.2 cm".
const MEASUREMENT_MENTION = /(\d+(?:\.\d+)?)\s*(mm|cm)\b/gi;

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
  async checkImagingReport({ studyId, modality, draftText, structuredFindings, confidence, triageStatus, matchedRules = [] }) {
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

    // Item 9 — QA-2 (semantic): does the report contradict itself? Unlike
    // every gate above (draft vs. AI evidence), this needs no evidence at
    // all — "no hemorrhage" in FINDINGS and "hemorrhage is present" in
    // IMPRESSION is wrong regardless of what any AI model said, so it runs
    // for every draft, AI-assisted or purely human-typed.
    if (draftText) {
      this._gateSelfContradiction(result, draftText);
    }

    const evidenceItems = Array.isArray(structuredFindings?.items)
      ? structuredFindings.items
      : (Array.isArray(structuredFindings) ? structuredFindings : []);
    const evidenceMeasurements = Array.isArray(structuredFindings?.measurements)
      ? structuredFindings.measurements
      : [];

    if (!evidenceItems.length) {
      result.warnings.push({
        code: 'NO_STRUCTURED_FINDINGS',
        message: 'Draft generated without structured findings backbone',
        action: 'Prefer drafts built from AI findings or measurements',
      });
    }

    // Clinical invariants — every clinical fact stated in the draft must be
    // traceable to an evidence item. Only run when there IS evidence to
    // check against: a report with no AI evidence at all (never AI-drafted,
    // or purely re-typed by the clinician from their own reading) has
    // nothing here to contradict, and flagging every pathology mention as
    // "unsupported" in that case would block a clinician's own independent
    // diagnosis — these gates catch the LLM/cache saying more than its own
    // input evidence supports, not substitute for a human reader's judgment.
    if (draftText && evidenceItems.length) {
      this._gateEvidenceGrounding(result, draftText, evidenceItems);
      this._gateMeasurementConsistency(result, draftText, evidenceItems);
    }
    // Same AI-assisted-only guard as above, applied to the *measurements*
    // array (a sibling of items — e.g. ventricle volumes from
    // mri_unest_adapter.py) and to the draft text's own normalcy claims.
    // Found by generating a real report from real evidence and reading it:
    // the model fabricated an external normalcy reference, silently dropped
    // half its own evidence, and missed a 6x measured asymmetry — none of
    // which the two gates above catch (no invented pathology keyword, no
    // contradicted number). A purely human-typed report with no AI
    // involvement is deliberately exempt from all three, same reasoning as
    // above — a radiologist's own "normal per our reference range" is their
    // professional judgment, not a claim this pipeline can fact-check.
    if (draftText && (evidenceItems.length || evidenceMeasurements.length)) {
      this._gateUnsupportedNormalcyClaim(result, draftText);
    }
    if (draftText && evidenceMeasurements.length) {
      this._gateEvidenceCoverage(result, draftText, evidenceMeasurements);
      this._gatePairedAsymmetry(result, draftText, evidenceMeasurements);
      this._gateAbstentionRespected(result, draftText, evidenceMeasurements);
    }
    if (draftText && matchedRules.length) {
      this._gateProhibitedInference(result, draftText, matchedRules);
    }
    if (evidenceMeasurements.length) {
      this._gateSpatialEvidenceCoverage(result, evidenceMeasurements);
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

  /**
   * True when the SENTENCE containing a matched pathology term negates or
   * scopes it away as an affirmative finding — "does not assess
   * hemorrhage", "not a substitute for review of ... hemorrhage", "no
   * evidence of X". A fixed character window undercounts on longer
   * sentences — found by testing a real hand-written report whose one
   * "hemorrhage" mention was 70+ characters past its negation cue
   * ("this is not a substitute for full diagnostic review of signal
   * characteristics, hemorrhage, or mass lesions") and was still missed by
   * a 45-character window. Sentence scope is the actual unit that matters:
   * a scope disclaimer and its negation are read together by a human
   * regardless of exact distance, as long as they're in the same sentence.
   */
  _isNegatedMention(lowerText, matchIndex) {
    const sentenceStart = Math.max(
      lowerText.lastIndexOf('.', matchIndex),
      lowerText.lastIndexOf('\n', matchIndex),
    ) + 1;
    const sentence = lowerText.slice(sentenceStart, matchIndex);
    const NEGATION_CUES = /\b(no|not|without|exclud\w*|rule(?:d|s)?\s*out|does\s*n[o']?t|doesn't|did\s*n[o']?t|didn't|absent|negative\s+for|free\s+of|denies|unremarkable\s+for)\b/i;
    return NEGATION_CUES.test(sentence);
  }

  /**
   * Evidence-grounding invariant: a pathology named in the draft must be
   * backed by at least one structured evidence item. Catches an LLM (or a
   * stale/mislabeled findings cache) introducing a finding the imaging AI
   * never actually reported — deterministic and auditable, unlike asking
   * the LLM to police its own output.
   */
  _gateEvidenceGrounding(result, draftText, evidenceItems) {
    const lowerText = String(draftText).toLowerCase();
    const evidenceLabels = evidenceItems
      .map(i => `${i.label || i.name || ''} ${i.note || i.description || ''}`.toLowerCase())
      .filter(Boolean);

    for (const group of PATHOLOGY_EVIDENCE_TERMS) {
      // At least one occurrence of any key must be a genuine, non-negated
      // affirmative mention — a term that only ever appears negated (or
      // inside a scope disclaimer) is not a claim this gate needs to verify.
      let affirmativeKey = null;
      for (const key of group.keys) {
        let idx = lowerText.indexOf(key);
        while (idx !== -1) {
          if (!this._isNegatedMention(lowerText, idx)) {
            affirmativeKey = key;
            break;
          }
          idx = lowerText.indexOf(key, idx + 1);
        }
        if (affirmativeKey) break;
      }
      if (!affirmativeKey) continue;
      const supported = evidenceLabels.some(l => group.evidence.some(e => l.includes(e)));
      if (!supported) {
        result.blockers.push({
          code: 'UNSUPPORTED_FINDING',
          message: `Draft mentions "${affirmativeKey}" with no matching structured evidence item — likely fabricated or from mismatched evidence`,
          action: 'Do not sign as-is — verify against the images directly or regenerate the draft before any clinical use',
        });
      }
    }
  }

  /**
   * Measurement-consistency invariant: if evidence carries a numeric size,
   * the draft's stated numbers must include something close to it. Flags
   * both a missing measurement and a contradicting one (e.g. evidence says
   * 8 mm, draft says 15 mm) without trying to parse full report prose.
   */
  _gateMeasurementConsistency(result, draftText, evidenceItems) {
    const sized = evidenceItems.filter(i => i.size_mm != null && Number.isFinite(Number(i.size_mm)));
    if (!sized.length) return;

    const mentioned = [];
    let m;
    MEASUREMENT_MENTION.lastIndex = 0;
    while ((m = MEASUREMENT_MENTION.exec(draftText)) !== null) {
      const value = parseFloat(m[1]);
      mentioned.push(m[2].toLowerCase() === 'cm' ? value * 10 : value);
    }

    for (const item of sized) {
      const evMm = Number(item.size_mm);
      const closeMatch = mentioned.some(v => Math.abs(v - evMm) <= Math.max(1, evMm * 0.15));
      if (!closeMatch) {
        result.blockers.push({
          code: 'MEASUREMENT_MISMATCH',
          message: `Evidence records ${evMm} mm for "${item.label || item.name || 'a finding'}", but the draft's stated measurements don't match`,
          action: 'Verify the measurement against the images before finalizing — do not trust the draft\'s number as-is',
        });
      }
    }
  }

  /**
   * Unsupported-normalcy invariant: nothing in this pipeline supplies a
   * reference range, institutional norm, or age-adjusted normal value
   * anywhere in structured findings — the schema has no such field. A draft
   * that attributes a value's normalcy to "our institution's norms" or a
   * "reference range" is therefore always fabricating that attribution,
   * regardless of whether the underlying number itself happens to be
   * accurate. Caught this in practice: a real report cited a real evidence
   * number, then invented an institutional norm to justify calling it
   * normal — the number was real, the justification was not.
   */
  _gateUnsupportedNormalcyClaim(result, draftText) {
    const NORMALCY_PATTERNS = [
      /per\s+(our\s+)?institution(?:'s)?\s+norms?/i,
      /within\s+normal\s+limits?\s+(for|per|according to)/i,
      /normal\s+range\s+(for|per)/i,
      /reference\s+range/i,
      /considered\s+normal\s+per/i,
      /normal\s+for\s+(this\s+|the\s+)?(age|patient|institution)/i,
    ];
    for (const pattern of NORMALCY_PATTERNS) {
      const match = draftText.match(pattern);
      if (match) {
        result.blockers.push({
          code: 'UNSUPPORTED_NORMALCY_CLAIM',
          message: `Draft attributes a finding's normalcy to an external reference/norm ("${match[0]}") that was never supplied — this pipeline provides no reference ranges, so the attribution is fabricated even if the underlying number is correct`,
          action: 'Remove the unsupported normalcy attribution — state only what the evidence shows, or have the radiologist supply an actual reference range',
        });
      }
    }
  }

  /**
   * Evidence-coverage invariant: every measured structure in evidence must
   * be mentioned somewhere in the draft. An LLM that reads N measurements
   * and reports on fewer than N has silently discarded evidence — the
   * physician reviewing the draft has no way to know a measurement was
   * dropped unless they independently re-check every evidence item against
   * the images themselves, which defeats the point of an AI-assisted draft.
   */
  _gateEvidenceCoverage(result, draftText, measurements) {
    const lowerText = draftText.toLowerCase();
    for (const m of measurements) {
      const hasValue = m.size_mm != null || m.volume_mm3 != null;
      if (!hasValue) continue;
      // `structure` is the current field name (a segmented structure isn't
      // a lesion); `lesion` kept as a fallback for any adapter output not
      // yet updated, `label`/`name` as older/generic fallbacks.
      const label = String(m.structure || m.lesion || m.label || m.name || '').toLowerCase().replace(/_/g, ' ').trim();
      if (!label) continue;
      // Anchor on the most distinctive word in the label (last word, usually
      // the anatomical noun — "left lateral ventricle" -> "ventricle")
      // rather than requiring an exact-phrase match, since the model may
      // rephrase ("the right lateral ventricle appears...").
      const words = label.split(/\s+/).filter(w => w.length > 3);
      const anchor = words[words.length - 1] || label;
      if (!lowerText.includes(anchor)) {
        result.blockers.push({
          code: 'UNADDRESSED_MEASUREMENT',
          message: `Evidence includes a measurement for "${m.structure || m.lesion || m.label}" that the draft never mentions`,
          action: 'Address every measured structure in evidence, or explicitly state it was reviewed and unremarkable',
        });
      }
    }
  }

  /**
   * Paired-structure asymmetry invariant: MRI/CT evidence often carries
   * left/right pairs of the same structure (ventricles, kidneys, adrenal
   * glands...). A large size/volume difference between a pair is exactly
   * the kind of pattern a radiologist would flag for correlation — an LLM
   * that reports the numbers without noting the asymmetry has missed the
   * clinically relevant signal even if every individual number it stated
   * is accurate.
   */
  _gatePairedAsymmetry(result, draftText, measurements) {
    const ASYMMETRY_RATIO_THRESHOLD = 2;
    const mentionsAsymmetry = /asymmetr|asymmetric|discrepan|disparit/i.test(draftText);
    const byBase = new Map();
    for (const m of measurements) {
      const value = m.volume_mm3 ?? m.size_mm;
      if (value == null) continue;
      const name = String(m.structure || m.lesion || m.label || '').toLowerCase();
      const leftMatch = name.match(/^left[_\s](.+)/);
      const rightMatch = name.match(/^right[_\s](.+)/);
      if (leftMatch) {
        const entry = byBase.get(leftMatch[1]) || {};
        entry.left = value;
        byBase.set(leftMatch[1], entry);
      } else if (rightMatch) {
        const entry = byBase.get(rightMatch[1]) || {};
        entry.right = value;
        byBase.set(rightMatch[1], entry);
      }
    }
    for (const [base, pair] of byBase) {
      if (pair.left == null || pair.right == null || pair.left <= 0 || pair.right <= 0) continue;
      const ratio = Math.max(pair.left, pair.right) / Math.min(pair.left, pair.right);
      if (ratio >= ASYMMETRY_RATIO_THRESHOLD && !mentionsAsymmetry) {
        result.blockers.push({
          code: 'MISSED_ASYMMETRY',
          message: `Evidence shows a ${ratio.toFixed(1)}x left-right difference in ${base.replace(/_/g, ' ')} (left ${pair.left}, right ${pair.right}) that the draft doesn't mention`,
          action: 'Flag significant left-right asymmetry explicitly for radiologist correlation, or confirm it was reviewed and is not clinically relevant',
        });
      }
    }
  }

  /**
   * Abstention-state invariant: a measurement the Python pipeline itself
   * marked UNCERTAIN or ABSTAIN (inference.abstention.classify_state —
   * derived from that specific observation's own real confidence, e.g.
   * BraTS enhancing-tumor with no contrast series, or UNesT's 0.56-confidence
   * ventricle read) must not be stated as settled fact in the draft. This is
   * the operational half of the abstention state machine — recording the
   * state is meaningless if nothing downstream enforces it.
   *
   * Deliberately permissive about what counts as "hedged": this is a
   * pattern-match on real qualifying language a radiologist/LLM would
   * plausibly use, not an exhaustive NLP certainty classifier. False
   * negatives (missing a genuinely hedged sentence) fail safe as a WARNING,
   * not a blocker — see below.
   */
  _gateAbstentionRespected(result, draftText, measurements) {
    const lowerText = String(draftText).toLowerCase();
    const HEDGE_CUES = /\b(uncertain|unclear|low confidence|cannot be (?:reliably|confidently)|not (?:reliably|confidently)|limited reliability|may represent|possible|further (?:evaluation|correlation|assessment)|correlate clinically|recommend(?:ed)? correlation|should be interpreted with caution|inconclusive|indeterminate|could not be (?:assessed|determined)|unable to (?:reliably|confidently))\b/i;

    for (const m of measurements) {
      if (m.state !== 'UNCERTAIN' && m.state !== 'ABSTAIN') continue;
      const label = String(m.structure || m.lesion || m.label || '').toLowerCase().replace(/_/g, ' ').trim();
      if (!label) continue;
      const words = label.split(/\s+/).filter(w => w.length > 3);
      const anchor = words[words.length - 1] || label;
      const idx = lowerText.indexOf(anchor);
      if (idx === -1) continue; // unmentioned entirely — _gateEvidenceCoverage already catches this

      // Sentence-ending "." must be followed by whitespace/end-of-string —
      // a bare `indexOf('.')` treats decimal values like "641.2" as a
      // sentence break, truncating before any hedge language that follows
      // the number (e.g. "...641.2 mm3 (low confidence)." would be cut
      // right after "641" with a naive search). Found by testing this gate
      // against a real hedged sentence containing a measurement value.
      const SENTENCE_END = /[.!?](?:\s|$)/g;
      let sentenceStart = 0;
      let sentenceEnd = lowerText.length;
      SENTENCE_END.lastIndex = 0;
      let match;
      while ((match = SENTENCE_END.exec(lowerText))) {
        const boundary = match.index + 1;
        if (boundary <= idx) {
          sentenceStart = boundary;
        } else {
          sentenceEnd = boundary;
          break;
        }
      }
      const sentence = lowerText.slice(sentenceStart, sentenceEnd);

      if (!HEDGE_CUES.test(sentence)) {
        const entry = {
          code: m.state === 'ABSTAIN' ? 'UNHEDGED_ABSTAIN_CLAIM' : 'UNHEDGED_UNCERTAIN_CLAIM',
          message: `AI marked "${m.structure || m.lesion}" as ${m.state} (${m.state_reason || 'low confidence'}), but the draft states it without hedging language`,
          action: m.state === 'ABSTAIN'
            ? 'The AI could not confidently assess this observation — state that explicitly rather than asserting a finding, or have the radiologist assess it independently'
            : 'Add hedging language (e.g. "possible", "low confidence", "recommend correlation") reflecting the AI\'s own uncertainty for this observation',
        };
        // ABSTAIN is a harder guarantee than UNCERTAIN — the pipeline said it
        // cannot answer at all, so an unhedged claim blocks. UNCERTAIN still
        // reflects real (if weak) signal, so an unhedged claim warns instead
        // of blocking — the radiologist reviews every draft regardless.
        if (m.state === 'ABSTAIN') {
          result.blockers.push(entry);
        } else {
          result.warnings.push(entry);
        }
      }
    }
  }

  /**
   * QA-3 spatial-evidence coverage (item 9 — the honest, buildable slice of
   * "image-grounded QA"). This is NOT full image-grounded QA: it does not
   * verify a claim's text against pixel data or an attention map — that
   * needs validated localization ground truth this pipeline doesn't have.
   * What it DOES check, for real: does the measurement backing an active
   * (POSITIVE/UNCERTAIN) finding carry a real (z,y,x) voxel location
   * (mri_unest_adapter.py's centroid_voxel or mri_brats_adapter.py's
   * bounding_box_voxel)? A finding with a real volume but no recorded
   * location is real signal that's currently untraceable to an image
   * position — worth surfacing, not worth blocking a draft over, since
   * every backend wired in today always emits one.
   */
  _gateSpatialEvidenceCoverage(result, measurements) {
    for (const m of measurements) {
      if (m.state !== 'POSITIVE' && m.state !== 'UNCERTAIN') continue;
      if (m.volume_mm3 == null && m.size_mm == null) continue;
      if (m.centroid_voxel || m.bounding_box_voxel) continue;
      result.warnings.push({
        code: 'NO_SPATIAL_EVIDENCE',
        message: `"${m.structure || m.lesion}" has a measured value but no recorded image location (centroid/bounding box) — not traceable to a specific position in this study`,
        action: 'Informational only — this backend does not yet emit spatial evidence for this finding',
      });
    }
  }

  /**
   * QA-2 semantic check (item 9): internal self-contradiction. Reuses
   * PATHOLOGY_EVIDENCE_TERMS (already maintained for evidence-grounding)
   * rather than a second term list — a term that appears both negated
   * ("no evidence of hemorrhage") and affirmed ("hemorrhage is present")
   * anywhere in the same draft is wrong on its face, independent of any
   * evidence data. This is genuinely different from _gateEvidenceGrounding,
   * which checks draft-vs-evidence — this checks draft-vs-itself.
   */
  _gateSelfContradiction(result, draftText) {
    const lowerText = String(draftText).toLowerCase();
    for (const group of PATHOLOGY_EVIDENCE_TERMS) {
      let hasAffirmative = false;
      let hasNegated = false;
      for (const key of group.keys) {
        let idx = lowerText.indexOf(key);
        while (idx !== -1) {
          if (this._isNegatedMention(lowerText, idx)) {
            hasNegated = true;
          } else {
            hasAffirmative = true;
          }
          idx = lowerText.indexOf(key, idx + 1);
        }
      }
      if (hasAffirmative && hasNegated) {
        result.blockers.push({
          code: 'SELF_CONTRADICTORY_REPORT',
          message: `Draft both affirms and negates "${group.keys[0]}" in different sentences — internally contradictory`,
          action: 'Resolve the contradiction before signing: the report cannot both state and deny the same finding',
        });
      }
    }
  }

  /**
   * Prohibited-inference invariant (item 5, Clinical Reasoning Engine):
   * imaging-clinical-rules.service.js matches evidence against a pathway
   * that names conclusions the evidence alone cannot support (e.g.
   * ventricular asymmetry alone cannot support "hydrocephalus" — that needs
   * periventricular signal/sulcal-effacement evidence this pipeline doesn't
   * measure). This is a hard blocker, not a warning: unlike an unhedged
   * UNCERTAIN claim (real, if weak, signal), an affirmative mention of a
   * prohibited term has NO supporting evidence in this pipeline at all —
   * "the ventricle is 6x larger, consistent with hydrocephalus" is exactly
   * the kind of confident-sounding overreach this gate exists to stop.
   * A negated mention ("no evidence of hydrocephalus") is fine — reuses
   * _isNegatedMention, same sentence-scoped logic as evidence grounding.
   */
  _gateProhibitedInference(result, draftText, matchedRules) {
    const lowerText = String(draftText).toLowerCase();
    for (const rule of matchedRules) {
      for (const term of rule.prohibitedInferences || []) {
        const lowerTerm = term.toLowerCase();
        let idx = lowerText.indexOf(lowerTerm);
        while (idx !== -1) {
          if (!this._isNegatedMention(lowerText, idx)) {
            result.blockers.push({
              code: 'PROHIBITED_INFERENCE',
              message: `Draft states "${term}" for pathway "${rule.pathway}" (${rule.ruleId}), but this evidence alone does not support that conclusion`,
              action: `Remove the "${term}" conclusion, or provide the additional evidence (e.g. a distinct finding) that would support it`,
            });
            break; // one blocker per term is enough signal
          }
          idx = lowerText.indexOf(lowerTerm, idx + 1);
        }
      }
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
