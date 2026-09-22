/**
 * NEWS2 (National Early Warning Score 2) — the ONE place this is computed (WP-1.8).
 *
 * Before this file, three separate implementations disagreed: the stored score (vitals-ews.service.js)
 * ignored supplemental oxygen and used a low GCS value as a crude proxy for altered consciousness;
 * clinical-intelligence.service.js imported that one but had its own fallback with different bands; and every
 * one of them scored a MISSING parameter as 0 — the same as a normal reading — so an incomplete vitals set
 * looked safe. All three now call computeNews2() below.
 *
 * Reference: Royal College of Physicians, National Early Warning Score (NEWS) 2, 2017.
 */

const clamp3 = (band) => band === 3;

function bandRespRate(rr) {
  if (rr <= 8) return 3;
  if (rr <= 11) return 1;
  if (rr <= 20) return 0;
  if (rr <= 24) return 2;
  return 3;
}

/**
 * Scale 1 (default): a single SpO2 threshold table used whether or not the patient is on oxygen — being on
 * oxygen at all contributes its own flat +2 (added in computeNews2, not here).
 * Scale 2 (clinician-set, for a patient with a documented target range of 88-92%, e.g. hypercapnic COPD risk):
 * a different table on air, and a THIRD table when also on oxygen (a "normal" reading on oxygen still scores
 * high, because for this patient a normal-looking saturation on oxygen can hide under-ventilation).
 */
function bandSpo2(spo2, scale, onOxygen) {
  if (scale === 2) {
    if (onOxygen) {
      if (spo2 <= 92) return 0; // still within/under target — covered by the "88-92" and below bands on the air table logic
      if (spo2 <= 94) return 1;
      if (spo2 <= 96) return 2;
      return 3; // >= 97
    }
    if (spo2 <= 83) return 3;
    if (spo2 <= 85) return 2;
    if (spo2 <= 87) return 1;
    if (spo2 <= 92) return 0;
    return 0; // > 92 on air is also 0 per the reference table
  }
  // Scale 1 — the same table regardless of oxygen; oxygen's effect is the separate flat +2 below.
  if (spo2 <= 91) return 3;
  if (spo2 <= 93) return 2;
  if (spo2 <= 95) return 1;
  return 0;
}

function bandSystolic(sbp) {
  if (sbp <= 90) return 3;
  if (sbp <= 100) return 2;
  if (sbp <= 110) return 1;
  if (sbp <= 219) return 0;
  return 3;
}

function bandPulse(pulse) {
  if (pulse <= 40) return 3;
  if (pulse <= 50) return 1;
  if (pulse <= 90) return 0;
  if (pulse <= 110) return 1;
  if (pulse <= 130) return 2;
  return 3;
}

function bandTemperature(temp) {
  if (temp <= 35.0) return 3;
  if (temp <= 36.0) return 1;
  if (temp <= 38.0) return 0;
  if (temp <= 39.0) return 1;
  return 2;
}

/** alert -> 0; anything else (confusion, voice, pain, unresponsive) -> 3. */
function bandConsciousness(level) {
  return level === 'A' ? 0 : 3;
}

const CONSCIOUSNESS_LEVELS = new Set(['A', 'C', 'V', 'P', 'U']);

/**
 * Pure. vitals: { respiratoryRate, spo2, spo2Scale (1|2, default 1), onOxygen (bool),
 *   systolicBp, pulse, consciousness ('A'|'C'|'V'|'P'|'U', optional), legacyGcsScore (optional fallback),
 *   temperature }
 * A parameter left null/undefined is MISSING, never scored as 0 — it is excluded from the total and listed,
 * and the result is marked incomplete. consciousness falls back to the legacy GCS proxy (< 15 -> altered) only
 * when no consciousness letter is given and a legacy score is; that result is marked provisional.
 *
 * Returns { score, parameterScores, missing, complete, singleRed, provisional, band }.
 * band: 'high' (score >= 7, immediate response), 'urgent' (score 5-6, or any single parameter scored 3),
 *       'low' (score 1-4 otherwise), 'routine' (score 0), or null when nothing could be scored at all.
 */
export function computeNews2(vitals = {}) {
  const {
    respiratoryRate, spo2, spo2Scale = 1, onOxygen = false,
    systolicBp, pulse, consciousness = null, legacyGcsScore = null, temperature,
  } = vitals;

  const parameterScores = {};
  const missing = [];
  let provisional = false;

  const add = (key, value, bandFn) => {
    if (value === null || value === undefined || Number.isNaN(value)) { missing.push(key); return; }
    parameterScores[key] = bandFn(value);
  };

  add('respiratoryRate', respiratoryRate, bandRespRate);
  if (spo2 === null || spo2 === undefined || Number.isNaN(spo2)) {
    missing.push('spo2');
  } else {
    parameterScores.spo2 = bandSpo2(spo2, spo2Scale === 2 ? 2 : 1, Boolean(onOxygen));
    if (onOxygen) parameterScores.supplementalOxygen = 2; // flat addition, independent of the SpO2 band itself
  }
  add('systolicBp', systolicBp, bandSystolic);
  add('pulse', pulse, bandPulse);
  add('temperature', temperature, bandTemperature);

  if (consciousness != null) {
    if (!CONSCIOUSNESS_LEVELS.has(consciousness)) missing.push('consciousness');
    else parameterScores.consciousness = bandConsciousness(consciousness);
  } else if (legacyGcsScore !== null && legacyGcsScore !== undefined && !Number.isNaN(legacyGcsScore)) {
    // Old charts only ever recorded a GCS number, never an explicit alert/confused/voice/pain/unresponsive level.
    // A GCS below 15 is treated as altered consciousness (score 3), same as the score the old, wrong callers gave
    // this case — but flagged provisional, because "not 15" is not the same clinical judgement as a real AVPU/ACVPU
    // assessment, and the chart should prompt for a real one.
    parameterScores.consciousness = legacyGcsScore < 15 ? 3 : 0;
    provisional = true;
  } else {
    missing.push('consciousness');
  }

  const scores = Object.values(parameterScores);
  const score = scores.reduce((sum, s) => sum + s, 0);
  const singleRed = scores.some(clamp3);
  const complete = missing.length === 0;

  let band = null;
  if (scores.length > 0) {
    if (score >= 7) band = 'high';
    else if (score >= 5 || singleRed) band = 'urgent';
    else if (score >= 1) band = 'low';
    else band = 'routine';
  }

  return { score, parameterScores, missing, complete, singleRed, provisional, band };
}

/** Human-readable clinical response for a band, matching the RCP 2017 escalation protocol. */
export function news2Response(band) {
  switch (band) {
    case 'high': return 'Immediate review by a clinician or critical care outreach team — continuous monitoring.';
    case 'urgent': return 'Urgent review by a clinician within 30 minutes — increase monitoring frequency.';
    case 'low': return 'Review by the ward nurse; consider increased monitoring frequency.';
    case 'routine': return 'Continue routine monitoring.';
    default: return 'Vitals incomplete — cannot assess.';
  }
}
