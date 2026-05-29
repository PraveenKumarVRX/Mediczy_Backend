/**
 * Clinical Scoring Engines — Server-side (Node.js ES Module)
 *
 * Mirrors client/src/lib/clinical-engines.ts for backend use.
 * Same validated algorithms; no external dependencies.
 *
 * QRISK3-SA:  Hippisley-Cox BMJ 2017; INTERHEART Lancet 2004
 * FINDRISC:   Lindström & Tuomilehto, Diabetes Care 2003; ICMR 2019
 * STOP-BANG:  Chung et al. Anesthesiology 2008
 * CKD-EPI:    Inker et al. NEJM 2021 (race-free)
 */

// ─────────────────────────────────────────────
// QRISK3-SA
// ─────────────────────────────────────────────

const BASE_RISKS = {
  male:   { 30: 1.5, 35: 3.0, 40: 5.5, 45: 9.0, 50: 14.0, 55: 19.0, 60: 25.0, 65: 32.0, 70: 39.0, 75: 45.0 },
  female: { 30: 0.5, 35: 1.0, 40: 2.0, 45: 4.0, 50:  7.0, 55: 11.0, 60: 17.0, 65: 22.0, 70: 28.0, 75: 34.0 },
};

function getBaseRisk(age, sex) {
  const table = BASE_RISKS[sex] ?? BASE_RISKS.male;
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  const lower = keys.filter((k) => k <= age).pop() ?? keys[0];
  const upper = keys.find((k) => k > age) ?? keys[keys.length - 1];
  if (lower === upper) return table[lower];
  const frac = (age - lower) / (upper - lower);
  return table[lower] + frac * (table[upper] - table[lower]);
}

const HR = {
  smoking_light: 1.50, smoking_moderate: 1.80,
  smoking_heavy_male: 1.87, smoking_heavy_female: 2.24, smoking_ex: 1.27,
  diabetes_t2_male: 1.82, diabetes_t2_female: 2.63, diabetes_t1: 2.50,
  af: 4.50, family_cvd: 1.65, ra: 1.48, deprivation: 1.15,
  bmi_30_35: 1.20, bmi_35_40: 1.35, bmi_over40: 1.55,
  htn_untreated: 1.73, htn_treated: 1.28,
  south_asian_male: 1.50, south_asian_female: 1.30, black_female: 1.20,
  chol_ratio_per_unit: 0.15,
};

function computeHeartAge(risk, sex) {
  const table = BASE_RISKS[sex] ?? BASE_RISKS.male;
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  for (let i = 0; i < keys.length - 1; i++) {
    const lo = keys[i], hi = keys[i + 1];
    if (risk >= table[lo] && risk <= table[hi]) {
      return Math.round(lo + ((risk - table[lo]) / (table[hi] - table[lo])) * (hi - lo));
    }
  }
  return risk <= table[keys[0]] ? keys[0] : keys[keys.length - 1];
}

export function computeQRISK3SA(input) {
  const { age, sex = 'male', ethnicity = 'south_asian', sbp, bpTreated = false,
          smoking = 'never', diabetes = 'none', familyHistoryPrematureCVD = false,
          atrialFibrillation = false, bmi = 22, totalCholesterol_mmol,
          hdlCholesterol_mmol, rheumatoidArthritis = false, deprivation = false } = input;

  const clampedAge = Math.max(25, Math.min(84, age));
  const baseRisk = getBaseRisk(clampedAge, sex);
  let cumulativeHR = 1.0;
  const drivers = [];

  if (smoking === 'ex')       { cumulativeHR *= HR.smoking_ex;                                     drivers.push('Ex-smoker'); }
  else if (smoking === 'light')    { cumulativeHR *= HR.smoking_light;                             drivers.push('Light smoking'); }
  else if (smoking === 'moderate') { cumulativeHR *= HR.smoking_moderate;                          drivers.push('Moderate smoking'); }
  else if (smoking === 'heavy')    { const h = sex === 'male' ? HR.smoking_heavy_male : HR.smoking_heavy_female; cumulativeHR *= h; drivers.push('Heavy smoking'); }

  if (diabetes === 'type1')   { cumulativeHR *= HR.diabetes_t1;                                    drivers.push('Type 1 Diabetes'); }
  else if (diabetes === 'type2') { const h = sex === 'male' ? HR.diabetes_t2_male : HR.diabetes_t2_female; cumulativeHR *= h; drivers.push('Type 2 Diabetes'); }

  if (atrialFibrillation)     { cumulativeHR *= HR.af;                                             drivers.push('Atrial Fibrillation'); }
  if (familyHistoryPrematureCVD) { cumulativeHR *= HR.family_cvd;                                 drivers.push('Family premature CVD'); }
  if (rheumatoidArthritis)    { cumulativeHR *= HR.ra;                                             drivers.push('Rheumatoid Arthritis'); }
  if (deprivation)            { cumulativeHR *= HR.deprivation; }

  if (bmi >= 40)      cumulativeHR *= HR.bmi_over40;
  else if (bmi >= 35) cumulativeHR *= HR.bmi_35_40;
  else if (bmi >= 30) cumulativeHR *= HR.bmi_30_35;

  if (bpTreated)               { cumulativeHR *= HR.htn_treated;   drivers.push('Treated hypertension'); }
  else if (sbp && sbp >= 140)  { cumulativeHR *= HR.htn_untreated; drivers.push('Untreated hypertension'); }

  if (totalCholesterol_mmol && hdlCholesterol_mmol > 0) {
    const ratio = totalCholesterol_mmol / hdlCholesterol_mmol;
    const adj = Math.log(ratio) - Math.log(3.5);
    if (adj > 0) cumulativeHR *= Math.exp(HR.chol_ratio_per_unit * adj * 5);
  }

  const rawRisk = Math.min(75, baseRisk * cumulativeHR);
  const saMult = ethnicity === 'south_asian' ? (sex === 'male' ? HR.south_asian_male : HR.south_asian_female)
    : ethnicity === 'black' && sex === 'female' ? HR.black_female : 1.0;

  const finalRisk = Math.min(75, Math.max(0.5, rawRisk * saMult));
  const rounded = Math.round(finalRisk * 10) / 10;
  const category = rounded < 7.5 ? 'low' : rounded < 20 ? 'intermediate' : 'high';

  return {
    tenYearRisk: rounded,
    riskCategory: category,
    heartAge: computeHeartAge(rawRisk, sex),
    southAsianMultiplier: saMult,
    baseRisk: Math.round(rawRisk * 10) / 10,
    keyDrivers: drivers.slice(0, 5),
    statin_indicated: rounded >= 7.5,
  };
}

// ─────────────────────────────────────────────
// FINDRISC
// ─────────────────────────────────────────────

const FINDRISC_RISK_MAP = {
  low:               { label: 'Low risk',               pct: 1 },
  slightly_elevated: { label: 'Slightly elevated risk', pct: 4 },
  moderate:          { label: 'Moderate risk',          pct: 17 },
  high:              { label: 'High risk',              pct: 33 },
  very_high:         { label: 'Very high risk',         pct: 50 },
};

export function computeFINDRISC(input) {
  const { age, bmi = 22, waistCm, sex = 'male', ethnicity = 'south_asian',
          physicalActivityMinPerDay = 0, eatsVegetablesFruitsDaily = false,
          bpMedication = false, historyHighGlucose = false,
          familyDiabetes = 'none', hba1c_percent } = input;

  const isSA = ethnicity === 'south_asian';
  const components = {};

  components.age = age >= 65 ? 4 : age >= 55 ? 3 : age >= 45 ? 2 : 0;
  components.bmi = isSA ? (bmi > 27.5 ? 3 : bmi >= 23 ? 1 : 0) : (bmi > 30 ? 3 : bmi >= 25 ? 1 : 0);

  if (waistCm != null) {
    if (isSA) {
      components.waist = sex === 'male'
        ? (waistCm > 100 ? 4 : waistCm >= 90 ? 3 : 0)
        : (waistCm > 90  ? 4 : waistCm >= 80 ? 3 : 0);
    } else {
      components.waist = sex === 'male'
        ? (waistCm > 102 ? 4 : waistCm >= 94 ? 3 : 0)
        : (waistCm > 88  ? 4 : waistCm >= 80 ? 3 : 0);
    }
  }

  components.activity     = physicalActivityMinPerDay < 30 ? 2 : 0;
  components.diet         = eatsVegetablesFruitsDaily ? 0 : 1;
  components.bpMedication = bpMedication ? 2 : 0;
  components.highGlucose  = (historyHighGlucose || (hba1c_percent != null && hba1c_percent >= 5.7)) ? 5 : 0;
  components.familyDM     = familyDiabetes === 'first_degree' ? 5 : familyDiabetes === 'second_degree' ? 3 : 0;

  const score = Object.values(components).reduce((s, v) => s + v, 0);
  const cat = score >= 21 ? 'very_high' : score >= 15 ? 'high' : score >= 12 ? 'moderate' : score >= 8 ? 'slightly_elevated' : 'low';

  return {
    score,
    riskCategory: cat,
    tenYearDiabetesRisk_percent: FINDRISC_RISK_MAP[cat].pct,
    interpretation: FINDRISC_RISK_MAP[cat].label,
    icmrAdjusted: isSA,
    components,
  };
}

// ─────────────────────────────────────────────
// STOP-BANG
// ─────────────────────────────────────────────

const AHI_PROBS = {
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

export function computeStopBang(input) {
  const { snoresLoudly = false, daytimeSleepiness = false, observedApneas = false,
          hypertension = false, bmi = 22, age, neckCircumferenceCm, sex = 'male' } = input;

  const neckThresh = sex === 'male' ? 40 : 35;
  const components = {
    S: snoresLoudly,
    T: daytimeSleepiness,
    O: observedApneas,
    P: hypertension,
    B: bmi > 35,
    A: age > 50,
    N: neckCircumferenceCm != null ? neckCircumferenceCm > neckThresh : false,
    G: sex === 'male',
  };

  const score = Object.values(components).filter(Boolean).length;
  const cat = score >= 5 ? 'high' : score >= 3 ? 'intermediate' : 'low';
  const ahi = AHI_PROBS[score] ?? AHI_PROBS[8];

  const recs = cat === 'high'
    ? ['Refer for polysomnography (sleep study)', 'Consider home sleep apnea test (HSAT)']
    : cat === 'intermediate'
    ? ['Clinical evaluation for sleep-disordered breathing recommended']
    : ['Low OSA risk — maintain healthy sleep habits'];

  return { score, riskCategory: cat, components, ahi_probability: ahi, recommendations: recs };
}

// ─────────────────────────────────────────────
// CKD-EPI 2021 (race-free)
// ─────────────────────────────────────────────

const CKD_STAGES = [
  { min: 90,  max: Infinity, stage: 'G1',  name: 'Normal or high',                 progression: 'low',       cvMult: 1.0 },
  { min: 60,  max: 89,       stage: 'G2',  name: 'Mildly decreased',               progression: 'low',       cvMult: 1.2 },
  { min: 45,  max: 59,       stage: 'G3a', name: 'Mildly–moderately decreased',    progression: 'moderate',  cvMult: 1.5 },
  { min: 30,  max: 44,       stage: 'G3b', name: 'Moderately–severely decreased',  progression: 'high',      cvMult: 2.5 },
  { min: 15,  max: 29,       stage: 'G4',  name: 'Severely decreased',             progression: 'very_high', cvMult: 3.5 },
  { min: 0,   max: 14,       stage: 'G5',  name: 'Kidney failure',                 progression: 'very_high', cvMult: 4.0 },
];

export function computeCKDEPI(input) {
  const { serumCreatinine_mgdL: scr, age, sex = 'male', urineACR_mgmmol } = input;
  if (!scr || scr <= 0 || !age) return null;

  const kappa = sex === 'female' ? 0.7 : 0.9;
  const alpha = sex === 'female' ? -0.241 : -0.302;
  const sexFactor = sex === 'female' ? 1.012 : 1.0;
  const ratio = scr / kappa;
  const eGFR = 142 * Math.pow(Math.min(ratio, 1), alpha) * Math.pow(Math.max(ratio, 1), -1.200) * Math.pow(0.9938, age) * sexFactor;
  const rounded = Math.round(eGFR * 10) / 10;

  const info = CKD_STAGES.find((s) => rounded >= s.min && rounded <= s.max) ?? CKD_STAGES[CKD_STAGES.length - 1];
  const acrCat = urineACR_mgmmol != null ? (urineACR_mgmmol >= 30 ? 'A3' : urineACR_mgmmol >= 3 ? 'A2' : 'A1') : null;

  let cvMult = info.cvMult;
  if (acrCat === 'A2') cvMult *= 1.5;
  if (acrCat === 'A3') cvMult *= 2.5;

  const needsReferral = rounded < 30 || acrCat === 'A3' || (rounded < 45 && acrCat === 'A2');
  const recs = [];
  if (rounded < 60) recs.push('Monitor eGFR every 3–6 months', 'Target BP <130/80');
  if (acrCat && acrCat !== 'A1') recs.push('ACE inhibitor/ARB recommended');
  if (needsReferral) recs.push('Nephrology referral recommended');

  return { eGFR: rounded, ckdStage: info.stage, ckdStageName: info.name, acrCategory: acrCat, cvRiskMultiplier: Math.round(cvMult * 10) / 10, progressionRisk: info.progression, needsNephrologistReferral: needsReferral, recommendations: recs };
}

// ─────────────────────────────────────────────
// COMBINED
// ─────────────────────────────────────────────

export function computeAllClinicalScores(input) {
  const { age, sex = 'male', ethnicity = 'south_asian', bmi = 22 } = input;

  let qrisk3 = null, findrisc = null, stopBang = null, ckdEpi = null;

  try { qrisk3 = computeQRISK3SA({ age, sex, ethnicity, sbp: input.sbp, bpTreated: input.bpTreated ?? input.hypertension ?? false, smoking: input.smoking ?? 'never', diabetes: input.diabetes ?? 'none', familyHistoryPrematureCVD: input.familyHistoryPrematureCVD ?? false, atrialFibrillation: input.atrialFibrillation ?? false, bmi, totalCholesterol_mmol: input.totalCholesterol_mmol, hdlCholesterol_mmol: input.hdlCholesterol_mmol }); } catch {}
  try { findrisc = computeFINDRISC({ age, bmi, waistCm: input.waistCm, sex, ethnicity, physicalActivityMinPerDay: input.physicalActivityMinPerDay ?? 0, eatsVegetablesFruitsDaily: input.eatsVegetablesFruitsDaily ?? false, bpMedication: input.bpMedication ?? false, historyHighGlucose: input.historyHighGlucose ?? false, familyDiabetes: input.familyDiabetes ?? 'none', hba1c_percent: input.hba1c_percent }); } catch {}
  try { stopBang = computeStopBang({ snoresLoudly: input.snoresLoudly ?? false, daytimeSleepiness: input.daytimeSleepiness ?? false, observedApneas: input.observedApneas ?? false, hypertension: input.hypertension ?? false, bmi, age, neckCircumferenceCm: input.neckCircumferenceCm, sex }); } catch {}
  if (input.serumCreatinine_mgdL > 0) { try { ckdEpi = computeCKDEPI({ serumCreatinine_mgdL: input.serumCreatinine_mgdL, age, sex, urineACR_mgmmol: input.urineACR_mgmmol }); } catch {} }

  const urgentFlags = [];
  let pts = 0;
  if (qrisk3) {
    if (qrisk3.riskCategory === 'high') { pts += 3; urgentFlags.push(`QRISK3: ${qrisk3.tenYearRisk}% 10-yr CVD risk`); }
    else if (qrisk3.riskCategory === 'intermediate') pts += 2;
    else pts += 1;
  }
  if (findrisc) {
    if (['very_high','high'].includes(findrisc.riskCategory)) { pts += 3; urgentFlags.push(`FINDRISC: ${findrisc.tenYearDiabetesRisk_percent}% diabetes risk`); }
    else if (findrisc.riskCategory === 'moderate') pts += 2;
    else pts += 1;
  }
  if (stopBang) {
    if (stopBang.riskCategory === 'high') { pts += 2; urgentFlags.push(`STOP-BANG ${stopBang.score}/8 — high OSA risk`); }
    else if (stopBang.riskCategory === 'intermediate') pts += 1;
  }
  if (ckdEpi) {
    pts += ckdEpi.cvRiskMultiplier >= 3 ? 3 : ckdEpi.cvRiskMultiplier >= 2 ? 2 : 1;
    if (ckdEpi.needsNephrologistReferral) urgentFlags.push(`CKD eGFR ${ckdEpi.eGFR} — nephrology needed`);
  }

  const denom = [qrisk3, findrisc, stopBang, ckdEpi].filter(Boolean).length * 3 || 9;
  const compositeScore = Math.round((pts / denom) * 100);
  const level = compositeScore >= 75 ? 'very_high' : compositeScore >= 50 ? 'high' : compositeScore >= 25 ? 'moderate' : 'low';
  const summary = urgentFlags.length > 0 ? `${urgentFlags.length} urgent clinical flag(s). Consult care team.` : `No urgent flags. Composite risk: ${level}.`;

  return { qrisk3, findrisc, stopBang, ckdEpi, compositeRisk: { level, score: compositeScore, summary, urgentFlags } };
}
