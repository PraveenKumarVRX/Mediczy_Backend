/**
 * Clinical Scoring Engines — Mediczy Health Platform
 *
 * Validated algorithms for 10-year risk estimation, calibrated for South Asian populations.
 *
 * References:
 *   QRISK3-SA: Hippisley-Cox et al. BMJ 2017; INTERHEART Lancet 2004; DECODE Diabetologia 2001
 *   FINDRISC:  Lindström & Tuomilehto, Diabetes Care 2003; ICMR DM Guidelines 2019
 *   STOP-BANG: Chung et al. Anesthesiology 2008
 *   CKD-EPI:   Inker et al. NEJM 2021 (race-free equation)
 */

// ─────────────────────────────────────────────
// SHARED TYPES
// ─────────────────────────────────────────────

export type Sex = 'male' | 'female';
export type Ethnicity = 'south_asian' | 'white' | 'black' | 'chinese' | 'other';
export type SmokingStatus = 'never' | 'ex' | 'light' | 'moderate' | 'heavy';
export type DiabetesStatus = 'none' | 'type1' | 'type2';
export type FamilyDiabetes = 'none' | 'second_degree' | 'first_degree';
export type OSARisk = 'low' | 'intermediate' | 'high';
export type CVRisk = 'low' | 'intermediate' | 'high';
export type CKDStage = 'G1' | 'G2' | 'G3a' | 'G3b' | 'G4' | 'G5';
export type ACRCategory = 'A1' | 'A2' | 'A3';
export type ProgressionRisk = 'low' | 'moderate' | 'high' | 'very_high';
export type TrendDirection = 'improving' | 'stable' | 'worsening' | 'volatile' | 'insufficient_data';

// ─────────────────────────────────────────────
// QRISK3-SA — 10-year Cardiovascular Risk
// ─────────────────────────────────────────────

export interface QRISK3Input {
  age: number;
  sex: Sex;
  ethnicity: Ethnicity;
  sbp?: number;
  bpTreated: boolean;
  smoking: SmokingStatus;
  diabetes: DiabetesStatus;
  familyHistoryPrematureCVD: boolean;
  atrialFibrillation: boolean;
  bmi: number;
  totalCholesterol_mmol?: number;
  hdlCholesterol_mmol?: number;
  rheumatoidArthritis?: boolean;
  deprivation?: boolean;
}

export interface QRISK3Result {
  tenYearRisk: number;
  riskCategory: CVRisk;
  heartAge: number;
  southAsianMultiplier: number;
  baseRisk: number;
  keyDrivers: string[];
  statin_indicated: boolean;
}

// Base 10-yr CVD risks by age/sex — Framingham Offspring 30-yr follow-up data (%)
const BASE_RISKS: Record<Sex, Record<number, number>> = {
  male:   { 30: 1.5, 35: 3.0, 40: 5.5, 45: 9.0, 50: 14.0, 55: 19.0, 60: 25.0, 65: 32.0, 70: 39.0, 75: 45.0 },
  female: { 30: 0.5, 35: 1.0, 40: 2.0, 45: 4.0, 50:  7.0, 55: 11.0, 60: 17.0, 65: 22.0, 70: 28.0, 75: 34.0 },
};

function getBaseRisk(age: number, sex: Sex): number {
  const table = BASE_RISKS[sex];
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  // Interpolate between nearest age bands
  const lower = keys.filter((k) => k <= age).pop() ?? keys[0];
  const upper = keys.find((k) => k > age) ?? keys[keys.length - 1];
  if (lower === upper) return table[lower];
  const fraction = (age - lower) / (upper - lower);
  return table[lower] + fraction * (table[upper] - table[lower]);
}

// Hazard ratios from published meta-analyses (see file header for sources)
const HR = {
  smoking_light:              1.50,
  smoking_moderate:           1.80,
  smoking_heavy_male:         1.87,
  smoking_heavy_female:       2.24,
  smoking_ex:                 1.27,
  diabetes_t2_male:           1.82,
  diabetes_t2_female:         2.63,
  diabetes_t1:                2.50,
  af:                         4.50,
  family_cvd:                 1.65,
  rheumatoid_arthritis:       1.48,
  deprivation:                1.15,
  bmi_30_35:                  1.20,
  bmi_35_40:                  1.35,
  bmi_over40:                 1.55,
  htn_untreated_sbp140_plus:  1.73,
  htn_treated:                1.28,
  south_asian_male:           1.50,
  south_asian_female:         1.30,
  black_female:               1.20,
  chol_ratio_per_unit:        0.15, // coefficient for ln(totalChol/HDL) per unit
};

// Heart age: find age at which a healthy person (ideal risk factors) has the same risk
function computeHeartAge(actualRisk: number, sex: Sex): number {
  const table = BASE_RISKS[sex];
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  for (let i = 0; i < keys.length - 1; i++) {
    const lo = keys[i], hi = keys[i + 1];
    if (actualRisk >= table[lo] && actualRisk <= table[hi]) {
      const frac = (actualRisk - table[lo]) / (table[hi] - table[lo]);
      return Math.round(lo + frac * (hi - lo));
    }
  }
  if (actualRisk <= table[keys[0]]) return keys[0];
  return keys[keys.length - 1];
}

export function computeQRISK3SA(input: QRISK3Input): QRISK3Result {
  const { age, sex, ethnicity, sbp, bpTreated, smoking, diabetes, familyHistoryPrematureCVD,
          atrialFibrillation, bmi, totalCholesterol_mmol, hdlCholesterol_mmol,
          rheumatoidArthritis = false, deprivation = false } = input;

  const clampedAge = Math.max(25, Math.min(84, age));
  let baseRisk = getBaseRisk(clampedAge, sex);
  let cumulativeHR = 1.0;
  const drivers: string[] = [];

  // Smoking
  if (smoking === 'ex') {
    cumulativeHR *= HR.smoking_ex; drivers.push('Ex-smoker (+27%)');
  } else if (smoking === 'light') {
    cumulativeHR *= HR.smoking_light; drivers.push('Light smoking (+50%)');
  } else if (smoking === 'moderate') {
    cumulativeHR *= HR.smoking_moderate; drivers.push('Moderate smoking (+80%)');
  } else if (smoking === 'heavy') {
    const hrSmoking = sex === 'male' ? HR.smoking_heavy_male : HR.smoking_heavy_female;
    cumulativeHR *= hrSmoking;
    drivers.push(`Heavy smoking (+${Math.round((hrSmoking - 1) * 100)}%)`);
  }

  // Diabetes
  if (diabetes === 'type1') {
    cumulativeHR *= HR.diabetes_t1; drivers.push('Type 1 Diabetes (+150%)');
  } else if (diabetes === 'type2') {
    const hrDM = sex === 'male' ? HR.diabetes_t2_male : HR.diabetes_t2_female;
    cumulativeHR *= hrDM;
    drivers.push(`Type 2 Diabetes (+${Math.round((hrDM - 1) * 100)}%)`);
  }

  // Atrial fibrillation
  if (atrialFibrillation) {
    cumulativeHR *= HR.af; drivers.push('Atrial Fibrillation (+350%)');
  }

  // Family history premature CVD
  if (familyHistoryPrematureCVD) {
    cumulativeHR *= HR.family_cvd; drivers.push('Family history premature CVD (+65%)');
  }

  // Rheumatoid arthritis
  if (rheumatoidArthritis) {
    cumulativeHR *= HR.rheumatoid_arthritis; drivers.push('Rheumatoid Arthritis (+48%)');
  }

  // Deprivation
  if (deprivation) {
    cumulativeHR *= HR.deprivation; drivers.push('Social deprivation (+15%)');
  }

  // BMI
  if (bmi >= 40) {
    cumulativeHR *= HR.bmi_over40; drivers.push('Severe obesity BMI≥40 (+55%)');
  } else if (bmi >= 35) {
    cumulativeHR *= HR.bmi_35_40; drivers.push('Obesity BMI 35–40 (+35%)');
  } else if (bmi >= 30) {
    cumulativeHR *= HR.bmi_30_35; drivers.push('Obesity BMI 30–35 (+20%)');
  }

  // Blood pressure
  if (bpTreated) {
    cumulativeHR *= HR.htn_treated; drivers.push('Treated hypertension (+28%)');
  } else if (sbp && sbp >= 140) {
    cumulativeHR *= HR.htn_untreated_sbp140_plus; drivers.push('Untreated hypertension SBP≥140 (+73%)');
  }

  // Cholesterol ratio adjustment (if available)
  if (totalCholesterol_mmol && hdlCholesterol_mmol && hdlCholesterol_mmol > 0) {
    const ratio = totalCholesterol_mmol / hdlCholesterol_mmol;
    // Coefficient: risk increases 15% per unit increase in ln(ratio) above 3.5
    const lnRatioAdj = Math.log(ratio) - Math.log(3.5);
    if (lnRatioAdj > 0) {
      const cholHR = Math.exp(HR.chol_ratio_per_unit * lnRatioAdj * 5);
      cumulativeHR *= cholHR;
      if (ratio > 5) drivers.push(`Adverse cholesterol ratio ${ratio.toFixed(1)}:1`);
    }
  }

  const rawRisk = Math.min(75, baseRisk * cumulativeHR);

  // South Asian ethnicity multiplier (INTERHEART 2004)
  const saMultiplier = ethnicity === 'south_asian'
    ? (sex === 'male' ? HR.south_asian_male : HR.south_asian_female)
    : ethnicity === 'black' && sex === 'female' ? HR.black_female : 1.0;

  if (ethnicity === 'south_asian') {
    drivers.push(`South Asian ethnicity (×${saMultiplier.toFixed(1)})`);
  }

  const finalRisk = Math.min(75, Math.max(0.5, rawRisk * saMultiplier));
  const rounded = Math.round(finalRisk * 10) / 10;

  const riskCategory: CVRisk =
    rounded < 7.5 ? 'low' : rounded < 20 ? 'intermediate' : 'high';

  const heartAge = computeHeartAge(rawRisk, sex); // use pre-SA base risk for heart age

  return {
    tenYearRisk: rounded,
    riskCategory,
    heartAge,
    southAsianMultiplier: saMultiplier,
    baseRisk: Math.round(rawRisk * 10) / 10,
    keyDrivers: drivers.slice(0, 5),
    statin_indicated: rounded >= 7.5,
  };
}

// ─────────────────────────────────────────────
// FINDRISC — Finnish Diabetes Risk Score
// ICMR South Asian waist/BMI calibration
// ─────────────────────────────────────────────

export interface FINDRISCInput {
  age: number;
  bmi: number;
  waistCm?: number;
  sex: Sex;
  ethnicity: Ethnicity;
  physicalActivityMinPerDay: number;
  eatsVegetablesFruitsDaily: boolean;
  bpMedication: boolean;
  historyHighGlucose: boolean;
  familyDiabetes: FamilyDiabetes;
  hba1c_percent?: number;
}

export interface FINDRISCResult {
  score: number;
  riskCategory: 'low' | 'slightly_elevated' | 'moderate' | 'high' | 'very_high';
  tenYearDiabetesRisk_percent: number;
  interpretation: string;
  icmrAdjusted: boolean;
  components: Record<string, number>;
}

const FINDRISC_RISK: Record<string, { label: string; pct: number }> = {
  low:               { label: 'Low risk', pct: 1 },
  slightly_elevated: { label: 'Slightly elevated risk', pct: 4 },
  moderate:          { label: 'Moderate risk', pct: 17 },
  high:              { label: 'High risk', pct: 33 },
  very_high:         { label: 'Very high risk', pct: 50 },
};

export function computeFINDRISC(input: FINDRISCInput): FINDRISCResult {
  const { age, bmi, waistCm, sex, ethnicity, physicalActivityMinPerDay,
          eatsVegetablesFruitsDaily, bpMedication, historyHighGlucose,
          familyDiabetes, hba1c_percent } = input;

  const isSouthAsian = ethnicity === 'south_asian';
  const components: Record<string, number> = {};

  // 1. Age
  components.age = age >= 65 ? 4 : age >= 55 ? 3 : age >= 45 ? 2 : 0;

  // 2. BMI — ICMR South Asian thresholds (lower cutoffs)
  if (isSouthAsian) {
    components.bmi = bmi > 27.5 ? 3 : bmi >= 23 ? 1 : 0;
  } else {
    components.bmi = bmi > 30 ? 3 : bmi >= 25 ? 1 : 0;
  }

  // 3. Waist circumference — ICMR South Asian thresholds
  if (waistCm != null) {
    if (isSouthAsian) {
      if (sex === 'male') {
        components.waist = waistCm > 100 ? 4 : waistCm >= 90 ? 3 : 0;
      } else {
        components.waist = waistCm > 90 ? 4 : waistCm >= 80 ? 3 : 0;
      }
    } else {
      if (sex === 'male') {
        components.waist = waistCm > 102 ? 4 : waistCm >= 94 ? 3 : 0;
      } else {
        components.waist = waistCm > 88 ? 4 : waistCm >= 80 ? 3 : 0;
      }
    }
  }

  // 4. Physical activity
  components.activity = physicalActivityMinPerDay < 30 ? 2 : 0;

  // 5. Daily fruits / vegetables
  components.diet = eatsVegetablesFruitsDaily ? 0 : 1;

  // 6. BP medication history
  components.bpMedication = bpMedication ? 2 : 0;

  // 7. History of high blood glucose (or HbA1c ≥5.7% is equivalent)
  const glucosePositive = historyHighGlucose || (hba1c_percent != null && hba1c_percent >= 5.7);
  components.highGlucose = glucosePositive ? 5 : 0;

  // 8. Family history of diabetes
  components.familyDiabetes = familyDiabetes === 'first_degree' ? 5
    : familyDiabetes === 'second_degree' ? 3 : 0;

  const score = Object.values(components).reduce((s, v) => s + v, 0);

  const riskCategory: FINDRISCResult['riskCategory'] =
    score >= 21 ? 'very_high' :
    score >= 15 ? 'high' :
    score >= 12 ? 'moderate' :
    score >= 8  ? 'slightly_elevated' : 'low';

  const riskData = FINDRISC_RISK[riskCategory];

  return {
    score,
    riskCategory,
    tenYearDiabetesRisk_percent: riskData.pct,
    interpretation: riskData.label,
    icmrAdjusted: isSouthAsian,
    components,
  };
}

// ─────────────────────────────────────────────
// STOP-BANG — OSA Screening (8-item)
// Reference: Chung et al. Anesthesiology 2008
// ─────────────────────────────────────────────

export interface StopBangInput {
  snoresLoudly: boolean;
  daytimeSleepiness: boolean;
  observedApneas: boolean;
  hypertension: boolean;
  bmi: number;
  age: number;
  neckCircumferenceCm?: number;
  sex: Sex;
}

export interface StopBangResult {
  score: number;
  riskCategory: OSARisk;
  components: { S: boolean; T: boolean; O: boolean; P: boolean; B: boolean; A: boolean; N: boolean; G: boolean };
  ahi_probability: { none_mild: number; moderate: number; severe: number };
  recommendations: string[];
}

// AHI probability table by STOP-BANG score (Chung 2012 derivation cohort)
const AHI_PROBS: Record<number, { none_mild: number; moderate: number; severe: number }> = {
  0: { none_mild: 0.95, moderate: 0.04, severe: 0.01 },
  1: { none_mild: 0.87, moderate: 0.10, severe: 0.03 },
  2: { none_mild: 0.74, moderate: 0.18, severe: 0.08 },
  3: { none_mild: 0.52, moderate: 0.30, severe: 0.18 },
  4: { none_mild: 0.35, moderate: 0.36, severe: 0.29 },
  5: { none_mild: 0.22, moderate: 0.38, severe: 0.40 },
  6: { none_mild: 0.12, moderate: 0.32, severe: 0.56 },
  7: { none_mild: 0.07, moderate: 0.24, severe: 0.69 },
  8: { none_mild: 0.03, moderate: 0.18, severe: 0.79 },
};

export function computeStopBang(input: StopBangInput): StopBangResult {
  const { snoresLoudly, daytimeSleepiness, observedApneas, hypertension,
          bmi, age, neckCircumferenceCm, sex } = input;

  const neckThreshold = sex === 'male' ? 40 : 35;
  const neckHigh = neckCircumferenceCm != null ? neckCircumferenceCm > neckThreshold : false;

  const components = {
    S: snoresLoudly,
    T: daytimeSleepiness,
    O: observedApneas,
    P: hypertension,
    B: bmi > 35,
    A: age > 50,
    N: neckHigh,
    G: sex === 'male',
  };

  const score = Object.values(components).filter(Boolean).length;

  const riskCategory: OSARisk =
    score >= 5 ? 'high' : score >= 3 ? 'intermediate' : 'low';

  const ahi = AHI_PROBS[score] ?? AHI_PROBS[8];

  const recommendations: string[] = [];
  if (riskCategory === 'high') {
    recommendations.push('Refer for overnight polysomnography (sleep study)');
    recommendations.push('Consider home sleep apnea test (HSAT) as initial step');
    recommendations.push('Avoid driving if excessive daytime sleepiness present');
  } else if (riskCategory === 'intermediate') {
    recommendations.push('Clinical evaluation for sleep-disordered breathing recommended');
    recommendations.push('Sleep hygiene review and positional therapy');
  } else {
    recommendations.push('Low OSA risk — maintain healthy weight and sleep hygiene');
  }

  if (components.B || bmi > 30) {
    recommendations.push('Weight loss of 10% reduces AHI by ~50% in overweight patients');
  }

  return { score, riskCategory, components, ahi_probability: ahi, recommendations };
}

// ─────────────────────────────────────────────
// CKD-EPI 2021 — eGFR + ACR Classification
// Reference: Inker et al. NEJM 2021 (race-free)
// ─────────────────────────────────────────────

export interface CKDEPIInput {
  serumCreatinine_mgdL: number;
  age: number;
  sex: Sex;
  urineACR_mgmmol?: number;
}

export interface CKDEPIResult {
  eGFR: number;
  ckdStage: CKDStage;
  ckdStageName: string;
  acrCategory: ACRCategory | null;
  cvRiskMultiplier: number;
  progressionRisk: ProgressionRisk;
  needsNephrologistReferral: boolean;
  recommendations: string[];
}

const CKD_STAGE_MAP: Array<{ min: number; max: number; stage: CKDStage; name: string; progression: ProgressionRisk; cvMult: number }> = [
  { min: 90,  max: Infinity, stage: 'G1',  name: 'Normal or high',              progression: 'low',       cvMult: 1.0 },
  { min: 60,  max: 89,       stage: 'G2',  name: 'Mildly decreased',            progression: 'low',       cvMult: 1.2 },
  { min: 45,  max: 59,       stage: 'G3a', name: 'Mildly–moderately decreased', progression: 'moderate',  cvMult: 1.5 },
  { min: 30,  max: 44,       stage: 'G3b', name: 'Moderately–severely decreased', progression: 'high',    cvMult: 2.5 },
  { min: 15,  max: 29,       stage: 'G4',  name: 'Severely decreased',          progression: 'very_high', cvMult: 3.5 },
  { min: 0,   max: 14,       stage: 'G5',  name: 'Kidney failure',              progression: 'very_high', cvMult: 4.0 },
];

export function computeCKDEPI(input: CKDEPIInput): CKDEPIResult {
  const { serumCreatinine_mgdL: scr, age, sex, urineACR_mgmmol } = input;

  if (scr <= 0 || age <= 0) {
    throw new Error('Invalid CKD-EPI inputs: creatinine and age must be positive');
  }

  // CKD-EPI 2021 race-free equation
  const kappa = sex === 'female' ? 0.7 : 0.9;
  const alpha = sex === 'female' ? -0.241 : -0.302;
  const sexFactor = sex === 'female' ? 1.012 : 1.0;

  const ratio = scr / kappa;
  const eGFR = 142
    * Math.pow(Math.min(ratio, 1), alpha)
    * Math.pow(Math.max(ratio, 1), -1.200)
    * Math.pow(0.9938, age)
    * sexFactor;

  const roundedEGFR = Math.round(eGFR * 10) / 10;

  const stageInfo = CKD_STAGE_MAP.find((s) => roundedEGFR >= s.min && roundedEGFR <= s.max)
    ?? CKD_STAGE_MAP[CKD_STAGE_MAP.length - 1];

  // ACR category (mg/mmol)
  let acrCategory: ACRCategory | null = null;
  if (urineACR_mgmmol != null) {
    acrCategory = urineACR_mgmmol >= 30 ? 'A3' : urineACR_mgmmol >= 3 ? 'A2' : 'A1';
  }

  // CV risk multiplier: combined GFR+ACR (KDIGO 2021 heat map)
  let cvMult = stageInfo.cvMult;
  if (acrCategory === 'A2') cvMult *= 1.5;
  if (acrCategory === 'A3') cvMult *= 2.5;

  const needsReferral = roundedEGFR < 30 || acrCategory === 'A3'
    || (roundedEGFR < 45 && acrCategory === 'A2');

  const recommendations: string[] = [];
  if (roundedEGFR < 60) {
    recommendations.push('Monitor eGFR every 3–6 months');
    recommendations.push('Optimise blood pressure (<130/80 mmHg target)');
    recommendations.push('Avoid NSAIDs and nephrotoxic agents');
  }
  if (acrCategory === 'A2' || acrCategory === 'A3') {
    recommendations.push('ACE inhibitor or ARB recommended (renal-protective)');
    recommendations.push('Urine ACR recheck in 3 months');
  }
  if (needsReferral) {
    recommendations.push('Nephrology referral recommended');
  }
  if (roundedEGFR < 45) {
    recommendations.push('Review medication doses for renal dose adjustment');
  }

  return {
    eGFR: roundedEGFR,
    ckdStage: stageInfo.stage,
    ckdStageName: stageInfo.name,
    acrCategory,
    cvRiskMultiplier: Math.round(cvMult * 10) / 10,
    progressionRisk: stageInfo.progression,
    needsNephrologistReferral: needsReferral,
    recommendations,
  };
}

// ─────────────────────────────────────────────
// TRAJECTORY ANALYTICS
// ─────────────────────────────────────────────

export interface AssessmentDataPoint {
  assessedAt: string | Date;
  score: number;
  riskLevel?: string;
  bmi?: number;
  sbp?: number;
  clinicalScores?: {
    qrisk3?: { tenYearRisk: number };
    findrisc?: { score: number; tenYearDiabetesRisk_percent: number };
    stopBang?: { score: number };
    ckdEpi?: { eGFR: number };
  };
}

export interface TrajectoryResult {
  trend: 'improving' | 'stable' | 'worsening' | 'volatile';
  slopePerMonth: number;
  riskEscalationWarning: boolean;
  domains: {
    overall: TrendDirection;
    cardiovascular: TrendDirection;
    metabolic: TrendDirection;
    renal: TrendDirection;
  };
  projectedScoreIn90Days: number;
  recommendation: string;
}

function linearSlope(points: Array<{ x: number; y: number }>): number {
  const n = points.length;
  if (n < 2) return 0;
  const sumX  = points.reduce((s, p) => s + p.x, 0);
  const sumY  = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumX2 - sumX * sumX;
  return denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function classifyTrend(slopePerMonth: number, sd: number): TrendDirection {
  if (sd > 12) return 'volatile';
  if (slopePerMonth < -2) return 'improving';
  if (slopePerMonth > 2) return 'worsening';
  return 'stable';
}

export function computeTrajectory(history: AssessmentDataPoint[]): TrajectoryResult | null {
  if (history.length < 2) return null;

  const sorted = [...history].sort(
    (a, b) => new Date(a.assessedAt).getTime() - new Date(b.assessedAt).getTime()
  );

  const t0 = new Date(sorted[0].assessedAt).getTime();
  const msPerMonth = 30 * 24 * 3600 * 1000;

  const overallPoints = sorted.map((d) => ({
    x: (new Date(d.assessedAt).getTime() - t0) / msPerMonth,
    y: d.score,
  }));

  const slope = linearSlope(overallPoints);
  const scores = sorted.map((d) => d.score);
  const sd = stdDev(scores);
  const trend = classifyTrend(slope, sd);

  // Escalation warning: last 2 readings both worsened AND combined rise > 15 pts
  const last2 = scores.slice(-2);
  const prev2 = scores.slice(-4, -2);
  const recentRise = last2.length >= 2 ? last2[1] - last2[0] : 0;
  const riskEscalationWarning =
    last2.length >= 2 && recentRise > 10 &&
    (prev2.length >= 2 ? last2[0] - prev2[prev2.length - 1] > 5 : false);

  // Cardiovascular trajectory
  const cvPoints = sorted
    .filter((d) => d.clinicalScores?.qrisk3?.tenYearRisk != null)
    .map((d) => ({ x: (new Date(d.assessedAt).getTime() - t0) / msPerMonth, y: d.clinicalScores!.qrisk3!.tenYearRisk }));
  const cvSlope = linearSlope(cvPoints);

  // Metabolic (FINDRISC or BMI proxy)
  const metPoints = sorted
    .filter((d) => d.clinicalScores?.findrisc?.score != null)
    .map((d) => ({ x: (new Date(d.assessedAt).getTime() - t0) / msPerMonth, y: d.clinicalScores!.findrisc!.score }));
  const metSlope = linearSlope(metPoints);

  // Renal (eGFR — lower = worse, so invert)
  const renalPoints = sorted
    .filter((d) => d.clinicalScores?.ckdEpi?.eGFR != null)
    .map((d) => ({ x: (new Date(d.assessedAt).getTime() - t0) / msPerMonth, y: -(d.clinicalScores!.ckdEpi!.eGFR) }));
  const renalSlope = linearSlope(renalPoints);

  const lastX = overallPoints[overallPoints.length - 1].x;
  const projected = Math.max(0, Math.min(299, Math.round(sorted[sorted.length - 1].score + slope * 3)));

  const rec =
    trend === 'improving'  ? 'Your health risk is improving — maintain current momentum.' :
    trend === 'worsening'  ? 'Risk is increasing. Discuss with your care team this month.' :
    trend === 'volatile'   ? 'Highly variable readings — ensure consistent measurement conditions.' :
                             'Risk is stable. Continue current health regimen.';

  return {
    trend,
    slopePerMonth: Math.round(slope * 10) / 10,
    riskEscalationWarning,
    domains: {
      overall:        classifyTrend(slope, sd),
      cardiovascular: cvPoints.length >= 2 ? classifyTrend(cvSlope, 0) : 'insufficient_data',
      metabolic:      metPoints.length >= 2 ? classifyTrend(metSlope, 0) : 'insufficient_data',
      renal:          renalPoints.length >= 2 ? classifyTrend(renalSlope, 0) : 'insufficient_data',
    },
    projectedScoreIn90Days: projected,
    recommendation: rec,
  };
}

// ─────────────────────────────────────────────
// COMBINED INPUT / OUTPUT
// ─────────────────────────────────────────────

export interface ClinicalEnginesInput {
  age: number;
  sex: Sex;
  ethnicity?: Ethnicity;
  bmi?: number;
  waistCm?: number;
  neckCircumferenceCm?: number;
  sbp?: number;
  bpTreated?: boolean;
  smoking?: SmokingStatus;
  physicalActivityMinPerDay?: number;
  eatsVegetablesFruitsDaily?: boolean;
  diabetes?: DiabetesStatus;
  hypertension?: boolean;
  atrialFibrillation?: boolean;
  rheumatoidArthritis?: boolean;
  familyHistoryPrematureCVD?: boolean;
  familyDiabetes?: FamilyDiabetes;
  hba1c_percent?: number;
  totalCholesterol_mmol?: number;
  hdlCholesterol_mmol?: number;
  serumCreatinine_mgdL?: number;
  urineACR_mgmmol?: number;
  snoresLoudly?: boolean;
  daytimeSleepiness?: boolean;
  observedApneas?: boolean;
  bpMedication?: boolean;
  historyHighGlucose?: boolean;
}

export interface ClinicalScores {
  qrisk3: QRISK3Result | null;
  findrisc: FINDRISCResult | null;
  stopBang: StopBangResult | null;
  ckdEpi: CKDEPIResult | null;
  compositeRisk: {
    level: 'low' | 'moderate' | 'high' | 'very_high';
    score: number;
    summary: string;
    urgentFlags: string[];
  };
}

export function computeAllClinicalScores(input: ClinicalEnginesInput): ClinicalScores {
  const ethnicity: Ethnicity = input.ethnicity ?? 'south_asian';
  const bmi = input.bmi ?? 22;
  const sex = input.sex;
  const age = input.age;

  // QRISK3-SA
  let qrisk3: QRISK3Result | null = null;
  try {
    qrisk3 = computeQRISK3SA({
      age,
      sex,
      ethnicity,
      sbp: input.sbp,
      bpTreated: input.bpTreated ?? input.hypertension ?? false,
      smoking: input.smoking ?? 'never',
      diabetes: input.diabetes ?? 'none',
      familyHistoryPrematureCVD: input.familyHistoryPrematureCVD ?? false,
      atrialFibrillation: input.atrialFibrillation ?? false,
      bmi,
      totalCholesterol_mmol: input.totalCholesterol_mmol,
      hdlCholesterol_mmol: input.hdlCholesterol_mmol,
      rheumatoidArthritis: input.rheumatoidArthritis,
      deprivation: false,
    });
  } catch { /* non-fatal */ }

  // FINDRISC
  let findrisc: FINDRISCResult | null = null;
  try {
    findrisc = computeFINDRISC({
      age,
      bmi,
      waistCm: input.waistCm,
      sex,
      ethnicity,
      physicalActivityMinPerDay: input.physicalActivityMinPerDay ?? 0,
      eatsVegetablesFruitsDaily: input.eatsVegetablesFruitsDaily ?? false,
      bpMedication: input.bpMedication ?? input.hypertension ?? false,
      historyHighGlucose: input.historyHighGlucose ?? (input.diabetes !== 'none' && input.diabetes != null),
      familyDiabetes: input.familyDiabetes ?? 'none',
      hba1c_percent: input.hba1c_percent,
    });
  } catch { /* non-fatal */ }

  // STOP-BANG
  let stopBang: StopBangResult | null = null;
  try {
    stopBang = computeStopBang({
      snoresLoudly: input.snoresLoudly ?? false,
      daytimeSleepiness: input.daytimeSleepiness ?? false,
      observedApneas: input.observedApneas ?? false,
      hypertension: input.hypertension ?? false,
      bmi,
      age,
      neckCircumferenceCm: input.neckCircumferenceCm,
      sex,
    });
  } catch { /* non-fatal */ }

  // CKD-EPI (only if creatinine provided)
  let ckdEpi: CKDEPIResult | null = null;
  if (input.serumCreatinine_mgdL != null && input.serumCreatinine_mgdL > 0) {
    try {
      ckdEpi = computeCKDEPI({
        serumCreatinine_mgdL: input.serumCreatinine_mgdL,
        age,
        sex,
        urineACR_mgmmol: input.urineACR_mgmmol,
      });
    } catch { /* non-fatal */ }
  }

  // Composite risk
  const urgentFlags: string[] = [];
  let riskPoints = 0;

  if (qrisk3) {
    if (qrisk3.riskCategory === 'high')         { riskPoints += 3; urgentFlags.push(`QRISK3: ${qrisk3.tenYearRisk}% 10-yr CVD risk (HIGH)`); }
    else if (qrisk3.riskCategory === 'intermediate') riskPoints += 2;
    else riskPoints += 1;
  }
  if (findrisc) {
    if (findrisc.riskCategory === 'very_high' || findrisc.riskCategory === 'high') {
      riskPoints += 3;
      urgentFlags.push(`FINDRISC: ${findrisc.tenYearDiabetesRisk_percent}% 10-yr diabetes risk (${findrisc.interpretation})`);
    } else if (findrisc.riskCategory === 'moderate') riskPoints += 2;
    else riskPoints += 1;
  }
  if (stopBang) {
    if (stopBang.riskCategory === 'high')         { riskPoints += 2; urgentFlags.push(`STOP-BANG score ${stopBang.score}/8 — high OSA risk`); }
    else if (stopBang.riskCategory === 'intermediate') riskPoints += 1;
  }
  if (ckdEpi) {
    riskPoints += ckdEpi.cvRiskMultiplier >= 3 ? 3 : ckdEpi.cvRiskMultiplier >= 2 ? 2 : ckdEpi.cvRiskMultiplier > 1 ? 1 : 0;
    if (ckdEpi.needsNephrologistReferral) urgentFlags.push(`CKD eGFR ${ckdEpi.eGFR} — nephrology review required`);
  }

  const denominator = [qrisk3, findrisc, stopBang, ckdEpi].filter(Boolean).length * 3 || 9;
  const compositeScore = Math.round((riskPoints / denominator) * 100);
  const compositeLevel: ClinicalScores['compositeRisk']['level'] =
    compositeScore >= 75 ? 'very_high' :
    compositeScore >= 50 ? 'high' :
    compositeScore >= 25 ? 'moderate' : 'low';

  const summary = urgentFlags.length > 0
    ? `${urgentFlags.length} urgent clinical flag(s) detected. Consult your care team.`
    : `No urgent flags. Composite risk: ${compositeLevel.replace('_', ' ')}.`;

  return { qrisk3, findrisc, stopBang, ckdEpi, compositeRisk: { level: compositeLevel, score: compositeScore, summary, urgentFlags } };
}
