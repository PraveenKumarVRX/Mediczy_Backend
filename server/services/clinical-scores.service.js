/**
 * Clinical Score Calculators
 *
 * All thresholds and classifications reference the authoritative guidelines:
 *   - CHADS₂VASc / HAS-BLED  → ESC 2020 AF Guidelines
 *   - HEART                   → ACC/AHA 2021 Chest Pain Guideline
 *   - Framingham              → ACC/AHA 2019 Primary Prevention Guideline
 *   - TIMI STEMI / UA-NSTEMI  → ACC/AHA guidelines
 *   - GRACE                   → ESC NSTE-ACS 2020 Guideline
 *   - SOFA                    → ESICM/SCCM Sepsis-3 (JAMA 2016)
 *   - qSOFA                   → Sepsis-3 bedside criterion
 *   - KDIGO AKI               → KDIGO 2012 AKI Guideline
 *   - CKD-EPI eGFR            → NKF/KDIGO 2021 Chronic Kidney Disease Guideline
 *   - CURB-65                 → BTS Community Acquired Pneumonia Guidelines (NICE NG138)
 *   - PSI/PORT                → ATS/IDSA CAP Guideline
 *   - GOLD COPD               → GOLD 2024 Report
 *   - NIHSS                   → AHA/ASA Stroke Guideline
 *   - Modified Rankin Scale   → AHA/ASA
 *   - Wells DVT               → ACCP 2016 VTE Guideline
 *   - Wells PE                → ACCP 2016 / ESC PE Guideline 2019
 *   - PERC                    → ACEP / Ann Emerg Med 2004
 *   - Ottawa Ankle            → JAMA 1994 / NICE CKS
 *   - Ottawa Knee             → JAMA 1996 / NICE CKS
 *   - Child-Pugh              → AASLD / EASL Cirrhosis Guidelines
 *   - MELD / MELD-Na          → AASLD 2021 / UNOS policy
 *   - Bishop score            → ACOG Practice Bulletin 107
 *   - RCRI                    → ACC/AHA Perioperative Guideline 2014 (Lee 1999)
 *   - ASA classification      → ASA Physical Status Classification 2020
 */

// ── Cardiology ────────────────────────────────────────────────────────────────

/**
 * CHA₂DS₂-VASc — ESC 2020 AF Guidelines (10.1093/eurheartj/ehaa612)
 * Score ≥2 (men) or ≥3 (women) → oral anticoagulation recommended.
 */
export function chadsVasc(p) {
  let score = 0;
  if (p.chf)                    score += 1; // Congestive heart failure/LV dysfunction
  if (p.hypertension)           score += 1;
  if (p.age >= 75)              score += 2; // ≥75 years (doubled weight)
  else if (p.age >= 65)         score += 1;
  if (p.diabetes)               score += 1;
  if (p.stroke || p.tia || p.thromboembolism) score += 2; // Doubled weight
  if (p.vascularDisease)        score += 1; // Prior MI / peripheral artery disease / aortic plaque
  if (p.female)                 score += 1; // Sex category (not an independent risk factor)

  let recommendation;
  const effectiveScore = p.female ? score - 1 : score; // ESC: female sex adds 1 but minimum score must be ≥1 in men for OAC
  if (effectiveScore <= 0)      recommendation = 'No antithrombotic therapy';
  else if (effectiveScore === 1 && !p.female) recommendation = 'Consider OAC (net clinical benefit uncertain)';
  else                          recommendation = 'Oral anticoagulation recommended';

  return { score, recommendation, guideline: 'ESC 2020 AF Guidelines' };
}

/**
 * HAS-BLED — ESC 2020 AF Guidelines
 * Bleeding risk score; score ≥3 = high risk (warrants caution, not OAC withholding).
 */
export function hasBleed(p) {
  let score = 0;
  if (p.hypertensionUncontrolled) score += 1; // SBP >160 mmHg
  if (p.renalDisease)             score += 1; // Dialysis / transplant / Cr >200 µmol/L
  if (p.liverDisease)             score += 1; // Cirrhosis / bilirubin >2× + ALT/AST/ALP >3×
  if (p.strokeHistory)            score += 1;
  if (p.bleedingHistory || p.bleedingPredisposition) score += 1;
  if (p.inrLabile)                score += 1; // TTR <60%
  if (p.age >= 65)                score += 1;
  if (p.drugs)                    score += 1; // Antiplatelet / NSAIDs
  if (p.alcohol)                  score += 1; // ≥8 units/week

  const risk = score <= 2 ? 'low' : score === 3 ? 'moderate' : 'high';
  return { score, risk, note: risk === 'high' ? 'Review modifiable bleeding risk factors; do not use score alone to withhold OAC' : null, guideline: 'ESC 2020 AF Guidelines' };
}

/**
 * HEART Score — ACC/AHA 2021 Chest Pain Guideline
 * 0-3 = low risk (0.9-1.7% MACE), 4-6 = moderate (12-16.6%), 7-10 = high (50-65%).
 */
export function heartScore(p) {
  // History: 0=slightly suspicious, 1=moderately suspicious, 2=highly suspicious
  // ECG: 0=normal, 1=non-specific repolarisation disturbance, 2=significant ST deviation
  // Age: 0=<45, 1=45-64, 2=≥65
  // Risk factors: 0=none/unknown, 1=1-2 risk factors, 2=≥3 risk factors or known atherosclerotic disease
  // Troponin: 0=≤normal limit, 1=1-3× normal, 2=>3× normal

  const ageScore = p.age >= 65 ? 2 : p.age >= 45 ? 1 : 0;
  const score = (p.history || 0) + (p.ecg || 0) + ageScore + (p.riskFactors || 0) + (p.troponin || 0);

  let risk, action;
  if (score <= 3)      { risk = 'low';      action = 'Discharge with outpatient follow-up'; }
  else if (score <= 6) { risk = 'moderate'; action = 'Observation unit / further testing'; }
  else                 { risk = 'high';     action = 'Urgent cardiology referral / early invasive strategy'; }

  return { score, risk, action, guideline: 'ACC/AHA 2021 Chest Pain Guideline' };
}

/**
 * TIMI Risk Score for STEMI — ACC/AHA STEMI Guideline
 * Higher score → higher 30-day mortality.
 */
export function timiStemi(p) {
  let score = 0;
  if (p.age >= 75)                   score += 3;
  else if (p.age >= 65)              score += 2;
  if (p.diabetes || p.hypertension || p.angina) score += 1;
  if (p.sbp < 100)                   score += 3;
  if (p.heartRate > 100)             score += 2;
  if (p.killipClass >= 2)            score += 2;
  if (p.weight < 67)                 score += 1;
  if (p.anteriorSteOrLbbb)          score += 1;
  if (p.timeToTreatmentHours > 4)   score += 1;

  const mortality = [1, 1.6, 2.2, 4.4, 7.3, 12, 16, 23, 27, 36][Math.min(score, 9)];
  return { score, estimatedMortality30d: `${mortality}%`, guideline: 'ACC/AHA STEMI Guideline' };
}

/**
 * TIMI Risk Score for UA/NSTEMI — ACC/AHA NSTEMI Guideline (Antman 2000)
 * 14-day risk of death, MI, or urgent revascularisation.
 */
export function timiUaNstemi(p) {
  let score = 0;
  if (p.age >= 65)                       score += 1;
  if ((p.cad_riskFactors || 0) >= 3)     score += 1; // ≥3 CAD risk factors (family hx, HTN, hypercholesterolaemia, DM, active smoker)
  if (p.priorCoronaryStensosis >= 50)    score += 1;
  if (p.stDeviationOnEcg)               score += 1;
  if ((p.anginalEvents24h || 0) >= 2)    score += 1; // ≥2 anginal events in past 24h
  if (p.aspirinUseInPast7Days)          score += 1;
  if (p.elevatedSerumCardiacMarkers)    score += 1;

  const riskPct = [5, 8, 13, 20, 26, 41, 41][Math.min(score, 6)];
  const risk = score <= 2 ? 'low' : score <= 4 ? 'intermediate' : 'high';
  return { score, risk, eventRisk14d: `${riskPct}%`, guideline: 'ACC/AHA UA/NSTEMI Guideline (Antman 2000)' };
}

/**
 * GRACE Score — ESC NSTE-ACS 2020 Guideline (Fox 2006)
 * Predicts in-hospital and 6-month mortality.
 */
export function graceScore(p) {
  // Simplified linear approximation (full model uses logistic regression)
  let score = 0;
  score += p.age >= 80 ? 59 : p.age >= 70 ? 41 : p.age >= 60 ? 25 : p.age >= 50 ? 12 : 0;
  score += p.heartRate >= 150 ? 46 : p.heartRate >= 110 ? 34 : p.heartRate >= 90 ? 23 : p.heartRate >= 70 ? 13 : 0;
  score += p.sbp <= 80 ? 58 : p.sbp <= 100 ? 53 : p.sbp <= 120 ? 43 : p.sbp <= 140 ? 34 : p.sbp <= 160 ? 24 : p.sbp <= 180 ? 10 : 0;
  score += p.creatinine >= 354 ? 28 : p.creatinine >= 265 ? 20 : p.creatinine >= 177 ? 13 : p.creatinine >= 88 ? 7 : 0;
  if (p.cardiacArrest)   score += 39;
  if (p.stDeviation)     score += 28;
  if (p.elevatedMarkers) score += 14;
  if (p.killipClass === 2) score += 20;
  if (p.killipClass === 3) score += 39;
  if (p.killipClass === 4) score += 59;

  const risk = score < 109 ? 'low' : score <= 140 ? 'intermediate' : 'high';
  const inhospitalMortality = score < 109 ? '<1%' : score <= 140 ? '1-3%' : '>3%';
  return { score, risk, inhospitalMortality, guideline: 'ESC NSTE-ACS 2020 / GRACE (Fox 2006)' };
}

// ── Critical Care / Sepsis ────────────────────────────────────────────────────

/**
 * SOFA Score — ESICM/SCCM Sepsis-3 Definition (JAMA 2016)
 * Total SOFA ≥2 points from baseline = organ dysfunction (Sepsis-3).
 * Total SOFA ≥2 in ICU + suspected infection = sepsis.
 */
export function sofaScore(p) {
  let score = 0;
  const components = {};

  // Respiratory: PaO2/FiO2 ratio (mmHg)
  const pf = p.pao2FiO2Ratio;
  if      (pf == null) { components.respiratory = 0; }
  else if (pf < 100 && p.onMechanicalVentilation) { components.respiratory = 4; score += 4; }
  else if (pf < 200 && p.onMechanicalVentilation) { components.respiratory = 3; score += 3; }
  else if (pf < 300) { components.respiratory = 2; score += 2; }
  else if (pf < 400) { components.respiratory = 1; score += 1; }
  else               { components.respiratory = 0; }

  // Coagulation: Platelets (×10³/µL)
  const plt = p.platelets;
  if      (plt == null)  { components.coagulation = 0; }
  else if (plt < 20)     { components.coagulation = 4; score += 4; }
  else if (plt < 50)     { components.coagulation = 3; score += 3; }
  else if (plt < 100)    { components.coagulation = 2; score += 2; }
  else if (plt < 150)    { components.coagulation = 1; score += 1; }
  else                   { components.coagulation = 0; }

  // Liver: Bilirubin (µmol/L)
  const bili = p.bilirubinUmolL;
  if      (bili == null) { components.liver = 0; }
  else if (bili >= 204)  { components.liver = 4; score += 4; }
  else if (bili >= 102)  { components.liver = 3; score += 3; }
  else if (bili >= 33)   { components.liver = 2; score += 2; }
  else if (bili >= 20)   { components.liver = 1; score += 1; }
  else                   { components.liver = 0; }

  // Cardiovascular: MAP or vasopressors
  const map = p.map;
  const vaso = p.vasopressors; // 'dopa_low'|'dopa_mid'|'dopa_high'|'epi_norepi_low'|'epi_norepi_high'
  if      (vaso === 'epi_norepi_high' || vaso === 'dopa_high') { components.cardiovascular = 4; score += 4; }
  else if (vaso === 'epi_norepi_low')  { components.cardiovascular = 3; score += 3; }
  else if (vaso === 'dopa_mid' || vaso === 'dobutamine') { components.cardiovascular = 2; score += 2; }
  else if (vaso === 'dopa_low')        { components.cardiovascular = 1; score += 1; }
  else if (map != null && map < 70)    { components.cardiovascular = 1; score += 1; }
  else                                 { components.cardiovascular = 0; }

  // CNS: GCS
  const gcs = p.gcs;
  if      (gcs == null) { components.cns = 0; }
  else if (gcs < 6)     { components.cns = 4; score += 4; }
  else if (gcs < 10)    { components.cns = 3; score += 3; }
  else if (gcs < 13)    { components.cns = 2; score += 2; }
  else if (gcs < 15)    { components.cns = 1; score += 1; }
  else                  { components.cns = 0; }

  // Renal: Creatinine (µmol/L) or urine output (mL/day)
  const cr = p.creatinineUmolL;
  const uo = p.urineOutputMlDay;
  let renalScore = 0;
  if      (cr != null && cr >= 440) renalScore = 4;
  else if ((cr != null && cr >= 300) || (uo != null && uo < 200)) renalScore = 3;
  else if ((cr != null && cr >= 171) || (uo != null && uo < 500)) renalScore = 2;
  else if (cr != null && cr >= 110)  renalScore = 1;
  components.renal = renalScore;
  score += renalScore;

  const interpretation = score < 2 ? 'No organ dysfunction' : score < 6 ? 'Mild organ dysfunction' : score < 10 ? 'Moderate organ dysfunction — high mortality' : 'Severe organ dysfunction — very high mortality';
  return { score, components, interpretation, sepsisCriteriaMet: score >= 2, guideline: 'ESICM/SCCM Sepsis-3 (JAMA 2016)' };
}

/**
 * qSOFA — Sepsis-3 bedside screening criterion
 * ≥2 of 3 criteria → prompt assessment for organ dysfunction.
 */
export function qsofa(p) {
  const criteria = {
    alteredMentalStatus: p.gcs != null ? p.gcs < 15 : p.alteredMentalStatus === true,
    respiratoryRate:     p.respiratoryRate >= 22,
    sbp:                 p.sbp <= 100,
  };
  const score = Object.values(criteria).filter(Boolean).length;
  const high = score >= 2;
  return { score, criteria, highRisk: high, recommendation: high ? 'Assess for organ dysfunction; consider blood cultures, lactate, SOFA score' : 'Low risk of sepsis — reassess if clinical status changes', guideline: 'ESICM/SCCM Sepsis-3 (JAMA 2016)' };
}

// ── Nephrology ────────────────────────────────────────────────────────────────

/**
 * KDIGO AKI Staging — KDIGO 2012 AKI Clinical Practice Guideline
 */
export function kdigoAki(p) {
  // p.baselineCr, p.currentCr in µmol/L; p.urineOutputMlKgHr
  const ratio = p.baselineCr > 0 ? p.currentCr / p.baselineCr : null;
  const rise   = p.baselineCr > 0 ? p.currentCr - p.baselineCr : null;
  let stage = 0;
  let criteria = [];

  if (ratio != null && ratio >= 3 || (p.currentCr >= 354 && rise != null && rise >= 44) || p.renalReplacementTherapy) {
    stage = 3; criteria.push('Cr ×3 OR Cr ≥354 µmol/L with acute rise ≥44 µmol/L OR RRT');
  } else if (ratio != null && ratio >= 2) {
    stage = 2; criteria.push('Cr ×2.0-2.9');
  } else if ((ratio != null && ratio >= 1.5) || (rise != null && rise >= 26.5)) {
    stage = 1; criteria.push(rise >= 26.5 ? 'Cr rise ≥26.5 µmol/L in 48h' : 'Cr ×1.5-1.9');
  }

  if (p.urineOutputMlKgHr != null) {
    if (p.urineOutputMlKgHr < 0.3 && p.oliguriaHours >= 24) { if (stage < 3) { stage = 3; criteria.push('UO <0.3 mL/kg/h ≥24h or anuria ≥12h'); } }
    else if (p.urineOutputMlKgHr < 0.5 && p.oliguriaHours >= 12) { if (stage < 2) { stage = 2; criteria.push('UO <0.5 mL/kg/h ≥12h'); } }
    else if (p.urineOutputMlKgHr < 0.5 && p.oliguriaHours >= 6)  { if (stage < 1) { stage = 1; criteria.push('UO <0.5 mL/kg/h ×6-12h'); } }
  }

  const labels = { 0: 'No AKI', 1: 'AKI Stage 1 — mild', 2: 'AKI Stage 2 — moderate', 3: 'AKI Stage 3 — severe' };
  return { stage, label: labels[stage], criteria, guideline: 'KDIGO 2012 AKI Guideline' };
}

/**
 * CKD-EPI eGFR — NKF/KDIGO 2021 Guideline (race-free 2021 equation)
 * Input: creatinine in µmol/L, age (years), female boolean.
 */
export function egfrCkdEpi(p) {
  const crMgDl = p.creatinineUmolL / 88.42;
  const kappa  = p.female ? 0.7 : 0.9;
  const alpha  = p.female ? -0.241 : -0.302;
  const ratio  = crMgDl / kappa;
  const egfr   = 142 * Math.pow(Math.min(ratio, 1), alpha) * Math.pow(Math.max(ratio, 1), -1.200) * Math.pow(0.9938, p.age);

  let stage, label;
  if      (egfr >= 90)  { stage = 'G1'; label = 'Normal or high'; }
  else if (egfr >= 60)  { stage = 'G2'; label = 'Mildly decreased'; }
  else if (egfr >= 45)  { stage = 'G3a'; label = 'Mildly to moderately decreased'; }
  else if (egfr >= 30)  { stage = 'G3b'; label = 'Moderately to severely decreased'; }
  else if (egfr >= 15)  { stage = 'G4'; label = 'Severely decreased'; }
  else                  { stage = 'G5'; label = 'Kidney failure'; }

  return { egfr: Math.round(egfr), stage, label, unit: 'mL/min/1.73m²', guideline: 'NKF/KDIGO 2021 CKD Guideline (2021 CKD-EPI race-free)' };
}

// ── Pulmonology ───────────────────────────────────────────────────────────────

/**
 * CURB-65 — BTS CAP Guidelines (Lim 2003), endorsed by NICE NG138
 * 0-1 = low (mortality <3%), 2 = moderate (mortality ~9%), 3-5 = high (>22%).
 */
export function curb65(p) {
  let score = 0;
  if (p.confusion)    score += 1; // New-onset confusion (AMTS ≤8)
  if (p.urea > 7)     score += 1; // Blood urea nitrogen >7 mmol/L (>19 mg/dL)
  if (p.respiratoryRate >= 30) score += 1;
  if (p.sbp < 90 || p.dbp <= 60) score += 1;
  if (p.age >= 65)    score += 1;

  let risk, recommendation;
  if (score <= 1)    { risk = 'low';      recommendation = 'Treat in community or consider short hospital admission'; }
  else if (score === 2) { risk = 'moderate'; recommendation = 'Hospital-supervised treatment or short admission'; }
  else               { risk = 'high';     recommendation = 'Severe CAP — consider ICU care'; }

  return { score, risk, recommendation, guideline: 'BTS CAP Guidelines / NICE NG138' };
}

/**
 * PSI / PORT Score — ATS/IDSA CAP Guideline (Fine 1997)
 * Class I (<50 years, no comorbidities, normal exam) → outpatient.
 * Classes II-III (≤70 / ≤90) → outpatient / observation.
 * Class IV (91-130), V (>130) → inpatient / ICU.
 */
export function psiPort(p) {
  if (p.age < 50 && !p.nursing_home && !p.neoplasm && !p.liver && !p.chf && !p.cvd && !p.renal &&
      p.alteredMentalStatus !== true && p.rr < 30 && p.sbp >= 90 && p.temp >= 35 && p.temp <= 40 && p.hr < 125) {
    return { class: 'I', score: null, mortality: '<0.1%', recommendation: 'Outpatient treatment', guideline: 'ATS/IDSA PSI/PORT (Fine 1997)' };
  }

  let score = 0;
  // Demographics
  score += p.age;
  if (p.female) score -= 10;
  if (p.nursing_home) score += 10;
  // Comorbidities
  if (p.neoplasm)  score += 30;
  if (p.liver)     score += 20;
  if (p.chf)       score += 10;
  if (p.cvd)       score += 10;
  if (p.renal)     score += 10;
  // Exam findings
  if (p.alteredMentalStatus) score += 20;
  if (p.rr >= 30)            score += 20;
  if (p.sbp < 90)            score += 20;
  if (p.temp < 35 || p.temp >= 40) score += 15;
  if (p.hr >= 125)           score += 10;
  // Lab/x-ray
  if (p.ph != null && p.ph < 7.35)  score += 30;
  if (p.bun > 10.7)                 score += 20; // >30 mg/dL = >10.7 mmol/L
  if (p.sodium < 130)               score += 20;
  if (p.glucose > 13.9)             score += 10; // >250 mg/dL
  if (p.hematocrit < 30)            score += 10;
  if (p.pao2 != null && p.pao2 < 60) score += 10;
  if (p.pleuralEffusion)             score += 10;

  let psiClass, mortality, recommendation;
  if      (score <= 70)  { psiClass = 'II';  mortality = '0.6%'; recommendation = 'Outpatient'; }
  else if (score <= 90)  { psiClass = 'III'; mortality = '2.8%'; recommendation = 'Brief inpatient or observation'; }
  else if (score <= 130) { psiClass = 'IV';  mortality = '8.2%'; recommendation = 'Inpatient'; }
  else                   { psiClass = 'V';   mortality = '29.2%'; recommendation = 'Inpatient — consider ICU'; }

  return { class: psiClass, score, mortality, recommendation, guideline: 'ATS/IDSA PSI/PORT (Fine 1997)' };
}

/**
 * GOLD COPD Staging — GOLD 2024 Report
 * Based on post-bronchodilator FEV1/FVC < 0.70 (airflow limitation confirmed).
 */
export function goldCopd(p) {
  // p.fev1PercentPredicted: FEV1 % of predicted value
  // p.mrcDyspnoeaGrade: 0-4
  // p.catScore: COPD Assessment Test 0-40
  if (p.fev1FvcRatio >= 0.70) return { stage: null, label: 'No obstructive pattern (FEV1/FVC ≥0.70)', guideline: 'GOLD 2024 Report' };

  let stage, label;
  const f = p.fev1PercentPredicted;
  if      (f >= 80) { stage = 'GOLD 1'; label = 'Mild — FEV1 ≥80% predicted'; }
  else if (f >= 50) { stage = 'GOLD 2'; label = 'Moderate — FEV1 50-79%'; }
  else if (f >= 30) { stage = 'GOLD 3'; label = 'Severe — FEV1 30-49%'; }
  else              { stage = 'GOLD 4'; label = 'Very Severe — FEV1 <30%'; }

  const symptomsHigh = (p.mrcDyspnoeaGrade >= 2) || (p.catScore >= 10);
  const exacerbationRisk = (p.exacerbationsLastYear >= 2) || (p.hospitalisedExacerbation);
  let group;
  if (!symptomsHigh && !exacerbationRisk) group = 'A';
  else if (symptomsHigh && !exacerbationRisk) group = 'B';
  else if (exacerbationRisk && !symptomsHigh) group = 'C'; // Rarely used in GOLD 2023+
  else group = 'E'; // GOLD 2023 merged C+D → E (exacerbation risk high)

  return { stage, label, group, symptomsHigh, exacerbationRisk, guideline: 'GOLD 2024 Report' };
}

// ── Neurology ─────────────────────────────────────────────────────────────────

/**
 * NIHSS — AHA/ASA Stroke Guidelines
 * 0=no stroke, 1-4=minor, 5-15=moderate, 16-20=moderate-severe, 21-42=severe.
 */
export function nihss(p) {
  const fields = ['consciousness', 'locQuestions', 'locCommands', 'gaze', 'visual',
                  'facialPalsy', 'motorArmLeft', 'motorArmRight', 'motorLegLeft', 'motorLegRight',
                  'limbAtaxia', 'sensory', 'language', 'dysarthria', 'extinction'];
  const score = fields.reduce((s, f) => s + (p[f] || 0), 0);

  let severity;
  if      (score === 0)  severity = 'No stroke symptoms';
  else if (score <= 4)   severity = 'Minor stroke';
  else if (score <= 15)  severity = 'Moderate stroke';
  else if (score <= 20)  severity = 'Moderate to severe stroke';
  else                   severity = 'Severe stroke';

  const tpaEligibilityNote = score > 0 ? 'Check IV tPA eligibility: onset ≤4.5h, no contraindications (AHA/ASA 2019)' : null;
  return { score, severity, tpaEligibilityNote, guideline: 'AHA/ASA 2019 Stroke Guideline' };
}

/**
 * Modified Rankin Scale (mRS) — AHA/ASA
 * 0 = no symptoms, 5 = severe disability, 6 = death.
 */
export function modifiedRankin(p) {
  const labels = [
    'No symptoms',
    'No significant disability (able to carry out all usual activities)',
    'Slight disability (able to look after own affairs but unable to carry out all previous activities)',
    'Moderate disability (requiring some help; able to walk without assistance)',
    'Moderately severe disability (unable to attend to body needs without assistance; unable to walk unassisted)',
    'Severe disability (requires constant nursing care)',
    'Death',
  ];
  const score = Math.min(6, Math.max(0, p.score));
  return { score, label: labels[score], guideline: 'AHA/ASA' };
}

// ── Emergency Medicine ─────────────────────────────────────────────────────────

/**
 * Wells DVT Score — ACCP 2016 VTE Guideline (Wells 1997)
 * Low ≤1, Moderate 2, High ≥3.
 */
export function wellsDvt(p) {
  let score = 0;
  if (p.activeCancer)                score += 1;
  if (p.paralysisParesisPlasterImmobilisation) score += 1;
  if (p.bedriddenRecently || p.majorSurgery12Weeks) score += 1;
  if (p.localizedTendernessDeepVein) score += 1;
  if (p.entireLegSwollen)            score += 1;
  if (p.calfSwelling3cmMore)         score += 1;
  if (p.pittingOedema)               score += 1;
  if (p.collateralSuperficialVeins)  score += 1;
  if (p.previousDvt)                 score += 1;
  if (p.alternativeDiagnosisAsLikely) score -= 2;

  const probability = score <= 1 ? 'low' : score === 2 ? 'moderate' : 'high';
  const dvtPrevalence = { low: '~5%', moderate: '~17%', high: '~53%' }[probability];
  const recommendation = score <= 1
    ? 'D-dimer; if negative — DVT excluded (NICE guidance)'
    : 'Proximal leg ultrasound; consider empiric anticoagulation if high probability';

  return { score, probability, dvtPrevalence, recommendation, guideline: 'ACCP 2016 VTE Guideline / NICE NG158' };
}

/**
 * Wells PE Score — ACCP 2016 / ESC PE Guideline 2019
 */
export function wellsPe(p) {
  let score = 0;
  if (p.clinicalSignsDvt)            score += 3;
  if (p.peLikeliestDiagnosis)        score += 3;
  if (p.heartRate > 100)             score += 1.5;
  if (p.immobilisationOrSurgery4Weeks) score += 1.5;
  if (p.previousDvtPe)               score += 1.5;
  if (p.haemoptysis)                 score += 1;
  if (p.malignancy)                  score += 1;

  // Two-level: >4 = PE likely; Three-level: low <2, moderate 2-6, high >6
  const pelikely = score > 4;
  const threeLevel = score < 2 ? 'low' : score <= 6 ? 'moderate' : 'high';
  const recommendation = pelikely
    ? 'CT pulmonary angiography (CTPA)'
    : 'D-dimer; if negative — PE excluded (PERC criteria first if applicable)';

  return { score, peLikely: pelikely, threeLevel, recommendation, guideline: 'ACCP 2016 / ESC PE Guideline 2019' };
}

/**
 * PERC Rule — ACEP / Kline 2004 (Ann Emerg Med)
 * ALL 8 criteria must be negative to exclude PE without D-dimer (in low pre-test probability).
 */
export function percRule(p) {
  const criteria = {
    ageUnder50:          p.age < 50,
    hrUnder100:          p.heartRate < 100,
    spo2Above94:         p.spo2 > 94,
    noUnilateralLegSwelling: !p.unilateralLegSwelling,
    noHaemoptysis:       !p.haemoptysis,
    noRecentTraumaOrSurgery: !p.recentTraumaOrSurgery4Weeks,
    noPreviousDvtPe:     !p.previousDvtPe,
    noEstrogen:          !p.exogenousEstrogen,
  };
  const allNegative = Object.values(criteria).every(Boolean);
  return {
    criteria,
    peExcluded: allNegative,
    recommendation: allNegative
      ? 'All PERC criteria met — PE excluded without D-dimer (in low pre-test probability setting)'
      : 'PERC not met — obtain D-dimer or proceed to Wells PE scoring',
    guideline: 'ACEP / Kline 2004 Ann Emerg Med',
  };
}

/**
 * Ottawa Ankle Rules — JAMA 1994 / NICE CKS
 * Ankle x-ray required if pain in malleolar zone AND any of the 4 criteria.
 */
export function ottawaAnkle(p) {
  const ankleXray = p.painInMalleolarZone && (p.boneTendernessLateralMalleolus || p.boneTendernessMedialMalleolus || p.unableToWeightBear);
  const footXray  = p.painInMidfoot && (p.boneTendernessNavicular || p.boneTendernessBaseFifthMetatarsal || p.unableToWeightBear);
  return {
    ankleXrayRequired: ankleXray,
    footXrayRequired: footXray,
    recommendation: (ankleXray || footXray) ? 'X-ray indicated' : 'X-ray not required — Ottawa Ankle Rules negative (97% sensitivity)',
    guideline: 'Ottawa Ankle Rules — JAMA 1994 / NICE CKS',
  };
}

/**
 * Ottawa Knee Rules — JAMA 1996 / NICE CKS
 * Knee x-ray required if any of 5 criteria present.
 */
export function ottawaKnee(p) {
  const required = p.age >= 55
    || p.isolatedTendernessPatellaWithNoOtherBoneTenderness
    || p.tendernessHeadOfFibula
    || p.unableToFlexTo90Degrees
    || p.unableToWeightBear;

  return {
    xrayRequired: required,
    recommendation: required ? 'Knee x-ray indicated' : 'X-ray not required — Ottawa Knee Rules negative (98% sensitivity)',
    guideline: 'Ottawa Knee Rules — JAMA 1996 / NICE CKS',
  };
}

// ── Hepatology ─────────────────────────────────────────────────────────────────

/**
 * Child-Pugh Score — AASLD / EASL Cirrhosis Guidelines
 * Class A (5-6): well-compensated, Class B (7-9): significant dysfunction, Class C (10-15): decompensated.
 */
export function childPugh(p) {
  let score = 0;

  // Bilirubin µmol/L
  const bili = p.bilirubinUmolL;
  if      (bili < 34)  score += 1;
  else if (bili <= 51) score += 2;
  else                 score += 3;

  // Albumin g/L
  const alb = p.albuminGl;
  if      (alb > 35)  score += 1;
  else if (alb >= 28) score += 2;
  else                score += 3;

  // Prothrombin time prolongation (seconds) or INR
  const pt = p.ptProlongation || (p.inr ? (p.inr - 1) * 3.7 : null); // rough conversion
  if      (pt == null || pt < 4)  score += 1;
  else if (pt <= 6)               score += 2;
  else                            score += 3;

  // Ascites
  if      (!p.ascites || p.ascites === 'none')    score += 1;
  else if (p.ascites === 'mild')                  score += 2;
  else                                            score += 3;

  // Encephalopathy
  if      (!p.encephalopathy || p.encephalopathy === 'none') score += 1;
  else if (p.encephalopathy === 'grade1-2')                  score += 2;
  else                                                       score += 3;

  const cpClass = score <= 6 ? 'A' : score <= 9 ? 'B' : 'C';
  const oneYearSurvival = { A: '95%', B: '75%', C: '50%' }[cpClass];
  return { score, class: cpClass, oneYearSurvival, guideline: 'AASLD / EASL Cirrhosis Guidelines' };
}

/**
 * MELD / MELD-Na — AASLD 2021 / UNOS liver allocation policy
 */
export function meldScore(p) {
  // MELD = 3.78×ln(bilirubin mg/dL) + 11.2×ln(INR) + 9.57×ln(creatinine mg/dL) + 6.43
  const bilMgDl = p.bilirubinUmolL / 17.1;
  const crMgDl  = Math.min(p.creatinineUmolL / 88.42, 4.0); // cap at 4.0
  const meld = Math.round(3.78 * Math.log(Math.max(bilMgDl, 1)) + 11.2 * Math.log(Math.max(p.inr, 1)) + 9.57 * Math.log(Math.max(crMgDl, 1)) + 6.43);

  // MELD-Na: MELD + 1.32×(137−Na) − [0.033×MELD×(137−Na)]
  let meldNa = null;
  if (p.sodiumMmolL != null) {
    const na = Math.min(Math.max(p.sodiumMmolL, 125), 137);
    meldNa = Math.round(meld + 1.32 * (137 - na) - 0.033 * meld * (137 - na));
  }

  const mortality90d = meld < 10 ? '<4%' : meld < 20 ? '27%' : meld < 30 ? '76%' : '>83%';
  return { meld: Math.max(6, meld), meldNa, mortality90d, guideline: 'AASLD 2021 / UNOS liver allocation' };
}

// ── Obstetrics ─────────────────────────────────────────────────────────────────

/**
 * Bishop Score — ACOG Practice Bulletin 107
 * ≥8: favourable cervix, induction likely to succeed like spontaneous labour.
 * <6: unfavourable, consider cervical ripening.
 */
export function bishopScore(p) {
  let score = 0;
  // Dilation (cm): 0→0, 1-2→1, 3-4→2, 5+→3
  const dilScore = p.dilationCm >= 5 ? 3 : p.dilationCm >= 3 ? 2 : p.dilationCm >= 1 ? 1 : 0;
  // Effacement (%): 0-30→0, 40-50→1, 60-70→2, 80+→3
  const effScore = p.effacementPct >= 80 ? 3 : p.effacementPct >= 60 ? 2 : p.effacementPct >= 40 ? 1 : 0;
  // Station: -3→0, -2→1, -1/0→2, +1/+2→3
  const staScore = p.station >= 1 ? 3 : p.station >= -1 ? 2 : p.station >= -2 ? 1 : 0;
  // Consistency: firm→0, medium→1, soft→2
  const conScore = p.consistency === 'soft' ? 2 : p.consistency === 'medium' ? 1 : 0;
  // Position: posterior→0, mid→1, anterior→2
  const posScore = p.position === 'anterior' ? 2 : p.position === 'mid' ? 1 : 0;
  score = dilScore + effScore + staScore + conScore + posScore;

  const favourable = score >= 8;
  return { score, favourable, recommendation: favourable ? 'Favourable cervix — proceed with induction' : 'Unfavourable cervix — consider cervical ripening (prostaglandins / balloon catheter)', guideline: 'ACOG Practice Bulletin 107' };
}

// ── Surgical / Perioperative ──────────────────────────────────────────────────

/**
 * RCRI (Revised Cardiac Risk Index / Lee Index) — ACC/AHA 2014 Perioperative Guidelines (Lee 1999)
 * Predicts major adverse cardiac events (MACE) in non-cardiac surgery.
 */
export function rcri(p) {
  let score = 0;
  if (p.highRiskSurgery)              score += 1; // Suprainguinal vascular, intrathoracic, or intraperitoneal
  if (p.ischemicHeartDisease)         score += 1; // History of MI / positive exercise test / current chest pain from CAD / use of nitrates / ECG with Q waves
  if (p.congestiveHeartFailure)       score += 1;
  if (p.cerebrovascularDisease)       score += 1; // History of stroke or TIA
  if (p.insulinDependentDiabetes)     score += 1;
  if (p.preopCreatinine > 177)        score += 1; // >2.0 mg/dL = 177 µmol/L

  const riskPct = [0.4, 0.9, 6.6, 11][Math.min(score, 3)]; // MACE rate from original Lee cohort
  const risk = score <= 1 ? 'low' : score === 2 ? 'intermediate' : 'high';
  return { score, risk, macePct: `${riskPct}%`, recommendation: risk === 'high' ? 'Consider preoperative cardiology referral; pharmacological stress testing may be indicated (ACC/AHA 2014)' : null, guideline: 'ACC/AHA 2014 Perioperative Guideline (Lee 1999)' };
}

/**
 * ASA Physical Status Classification — ASA 2020 revision
 */
export function asaClassification(p) {
  const labels = {
    'I':   { label: 'ASA I — Healthy patient', examples: 'No organic, physiologic, or psychiatric disturbance', mortalityEstimate: '<0.1%' },
    'II':  { label: 'ASA II — Mild systemic disease', examples: 'Well-controlled DM/HTN, obesity (BMI<40), active smoker, social alcohol drinker, pregnancy, mild lung disease', mortalityEstimate: '0.2%' },
    'III': { label: 'ASA III — Severe systemic disease', examples: 'Poorly controlled DM/HTN, COPD, morbid obesity (BMI≥40), active hepatitis, alcohol dependence, implanted pacemaker, history of MI/CVA/TIA/CAD >3 months ago', mortalityEstimate: '1.8%' },
    'IV':  { label: 'ASA IV — Severe systemic disease that is a constant threat to life', examples: 'Recent MI/CVA/TIA <3 months, severe valvular dysfunction, sepsis, severe cardiac or respiratory failure', mortalityEstimate: '7.8%' },
    'V':   { label: 'ASA V — Moribund patient not expected to survive without the operation', examples: 'Ruptured aortic aneurysm, massive trauma, intracranial bleed with mass effect, ischaemic bowel with multiorgan dysfunction', mortalityEstimate: '9.4%' },
    'VI':  { label: 'ASA VI — Brain-dead patient for organ donation', examples: 'Declared brain-dead', mortalityEstimate: 'N/A' },
  };
  const cls = (p.class || '').toString().toUpperCase();
  return { class: cls, ...(labels[cls] || { label: 'Unknown ASA class' }), emergency: p.emergency ? `${cls}E — Emergency procedure (doubles mortality estimate)` : null, guideline: 'ASA Physical Status Classification 2020' };
}

// ── Master dispatcher ─────────────────────────────────────────────────────────

export const CALCULATORS = {
  chadsVasc, hasBleed, heartScore, timiStemi, timiUaNstemi, graceScore,
  sofaScore, qsofa,
  kdigoAki, egfrCkdEpi,
  curb65, psiPort, goldCopd,
  nihss, modifiedRankin,
  wellsDvt, wellsPe, percRule, ottawaAnkle, ottawaKnee,
  childPugh, meldScore,
  bishopScore,
  rcri, asaClassification,
};

export function calculate(calculatorName, params) {
  const fn = CALCULATORS[calculatorName];
  if (!fn) throw new Error(`Unknown calculator: ${calculatorName}`);
  return fn(params);
}
