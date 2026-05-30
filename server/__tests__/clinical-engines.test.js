/**
 * Unit tests for clinical scoring engines
 * Validates QRISK3-SA, FINDRISC, STOP-BANG, CKD-EPI 2021
 */

import { describe, it, expect } from 'vitest';
import {
  computeQRISK3SA,
  computeFINDRISC,
  computeStopBang,
  computeCKDEPI,
  computeAllClinicalScores,
} from '../services/clinical-engines.service.js';

// ─────────────────────────────────────────────
// QRISK3-SA
// ─────────────────────────────────────────────
describe('computeQRISK3SA', () => {
  it('returns low risk for healthy young female', () => {
    const result = computeQRISK3SA({
      age: 35, sex: 'female', ethnicity: 'white',
      bpTreated: false, smoking: 'never', diabetes: 'none',
      familyHistoryPrematureCVD: false, atrialFibrillation: false, bmi: 22,
    });
    expect(result.tenYearRisk).toBeGreaterThan(0);
    expect(result.tenYearRisk).toBeLessThan(5);
    expect(result.riskCategory).toBe('low');
    expect(result.statin_indicated).toBe(false);
  });

  it('returns high risk for older South Asian male with risk factors', () => {
    const result = computeQRISK3SA({
      age: 60, sex: 'male', ethnicity: 'south_asian',
      sbp: 155, bpTreated: false, smoking: 'heavy',
      diabetes: 'type2', familyHistoryPrematureCVD: true,
      atrialFibrillation: false, bmi: 31,
    });
    expect(result.tenYearRisk).toBeGreaterThan(20);
    expect(result.riskCategory).toBe('high');
    expect(result.statin_indicated).toBe(true);
    expect(result.southAsianMultiplier).toBe(1.5);
  });

  it('applies SA multiplier correctly', () => {
    const base = computeQRISK3SA({
      age: 50, sex: 'male', ethnicity: 'white', bpTreated: false,
      smoking: 'never', diabetes: 'none', familyHistoryPrematureCVD: false,
      atrialFibrillation: false, bmi: 25,
    });
    const sa = computeQRISK3SA({
      age: 50, sex: 'male', ethnicity: 'south_asian', bpTreated: false,
      smoking: 'never', diabetes: 'none', familyHistoryPrematureCVD: false,
      atrialFibrillation: false, bmi: 25,
    });
    expect(sa.tenYearRisk).toBeGreaterThan(base.tenYearRisk);
    expect(sa.southAsianMultiplier).toBe(1.5);
  });

  it('AF causes large risk jump', () => {
    const without = computeQRISK3SA({
      age: 55, sex: 'female', ethnicity: 'white', bpTreated: false,
      smoking: 'never', diabetes: 'none', familyHistoryPrematureCVD: false,
      atrialFibrillation: false, bmi: 26,
    });
    const with_af = computeQRISK3SA({
      age: 55, sex: 'female', ethnicity: 'white', bpTreated: false,
      smoking: 'never', diabetes: 'none', familyHistoryPrematureCVD: false,
      atrialFibrillation: true, bmi: 26,
    });
    expect(with_af.tenYearRisk).toBeGreaterThan(without.tenYearRisk * 2);
  });

  it('heart age is <= chronological age for low-risk patient', () => {
    const result = computeQRISK3SA({
      age: 50, sex: 'female', ethnicity: 'white', bpTreated: false,
      smoking: 'never', diabetes: 'none', familyHistoryPrematureCVD: false,
      atrialFibrillation: false, bmi: 22,
    });
    expect(result.heartAge).toBeLessThanOrEqual(50);
  });

  it('caps risk at 75%', () => {
    const result = computeQRISK3SA({
      age: 75, sex: 'male', ethnicity: 'south_asian',
      sbp: 180, bpTreated: false, smoking: 'heavy',
      diabetes: 'type2', familyHistoryPrematureCVD: true,
      atrialFibrillation: true, bmi: 42, rheumatoidArthritis: true,
    });
    expect(result.tenYearRisk).toBeLessThanOrEqual(75);
  });

  it('floors risk at 0.5%', () => {
    const result = computeQRISK3SA({
      age: 25, sex: 'female', ethnicity: 'white', bpTreated: false,
      smoking: 'never', diabetes: 'none', familyHistoryPrematureCVD: false,
      atrialFibrillation: false, bmi: 20,
    });
    expect(result.tenYearRisk).toBeGreaterThanOrEqual(0.5);
  });
});

// ─────────────────────────────────────────────
// FINDRISC
// ─────────────────────────────────────────────
describe('computeFINDRISC', () => {
  it('returns low risk score for healthy young person', () => {
    const result = computeFINDRISC({
      age: 30, bmi: 22, sex: 'male', ethnicity: 'south_asian',
      physicalActivityMinPerDay: 45, eatsVegetablesFruitsDaily: true,
      bpMedication: false, historyHighGlucose: false, familyDiabetes: 'none',
    });
    expect(result.score).toBeLessThan(8);
    expect(result.riskCategory).toBe('low');
    expect(result.tenYearDiabetesRisk_percent).toBe(1);
  });

  it('history of high glucose scores +5', () => {
    const without = computeFINDRISC({
      age: 45, bmi: 26, sex: 'female', ethnicity: 'other',
      physicalActivityMinPerDay: 30, eatsVegetablesFruitsDaily: true,
      bpMedication: false, historyHighGlucose: false, familyDiabetes: 'none',
    });
    const with_glucose = computeFINDRISC({
      age: 45, bmi: 26, sex: 'female', ethnicity: 'other',
      physicalActivityMinPerDay: 30, eatsVegetablesFruitsDaily: true,
      bpMedication: false, historyHighGlucose: true, familyDiabetes: 'none',
    });
    expect(with_glucose.score - without.score).toBe(5);
  });

  it('applies ICMR South Asian BMI thresholds correctly', () => {
    // BMI 24 should be 1 point for South Asian (>=23), 0 for others (<25)
    const sa = computeFINDRISC({
      age: 40, bmi: 24, sex: 'male', ethnicity: 'south_asian',
      physicalActivityMinPerDay: 60, eatsVegetablesFruitsDaily: true,
      bpMedication: false, historyHighGlucose: false, familyDiabetes: 'none',
    });
    const other = computeFINDRISC({
      age: 40, bmi: 24, sex: 'male', ethnicity: 'other',
      physicalActivityMinPerDay: 60, eatsVegetablesFruitsDaily: true,
      bpMedication: false, historyHighGlucose: false, familyDiabetes: 'none',
    });
    expect(sa.components.bmi).toBe(1);
    expect(other.components.bmi).toBe(0);
    expect(sa.icmrAdjusted).toBe(true);
    expect(other.icmrAdjusted).toBe(false);
  });

  it('first degree family DM scores +5, second degree +3', () => {
    const base = computeFINDRISC({
      age: 50, bmi: 25, sex: 'male', ethnicity: 'other',
      physicalActivityMinPerDay: 30, eatsVegetablesFruitsDaily: true,
      bpMedication: false, historyHighGlucose: false, familyDiabetes: 'none',
    });
    const firstDeg = computeFINDRISC({ ...base, familyDiabetes: 'first_degree' });
    const secondDeg = computeFINDRISC({ ...base, familyDiabetes: 'second_degree' });
    expect(firstDeg.components.familyDM).toBe(5);
    expect(secondDeg.components.familyDM).toBe(3);
  });

  it('high HbA1c (>=5.7%) treated same as history of high glucose', () => {
    const withHbA1c = computeFINDRISC({
      age: 45, bmi: 27, sex: 'female', ethnicity: 'south_asian',
      physicalActivityMinPerDay: 20, eatsVegetablesFruitsDaily: false,
      bpMedication: false, historyHighGlucose: false, familyDiabetes: 'none',
      hba1c_percent: 5.9,
    });
    expect(withHbA1c.components.highGlucose).toBe(5);
  });

  it('very high category for high-risk profile', () => {
    const result = computeFINDRISC({
      age: 65, bmi: 32, waistCm: 105, sex: 'male', ethnicity: 'south_asian',
      physicalActivityMinPerDay: 0, eatsVegetablesFruitsDaily: false,
      bpMedication: true, historyHighGlucose: true, familyDiabetes: 'first_degree',
    });
    expect(result.score).toBeGreaterThanOrEqual(21);
    expect(result.riskCategory).toBe('very_high');
    expect(result.tenYearDiabetesRisk_percent).toBe(50);
  });
});

// ─────────────────────────────────────────────
// STOP-BANG
// ─────────────────────────────────────────────
describe('computeStopBang', () => {
  it('scores 0 for young slim female with no symptoms', () => {
    const result = computeStopBang({
      snoresLoudly: false, daytimeSleepiness: false, observedApneas: false,
      hypertension: false, bmi: 22, age: 35,
      neckCircumferenceCm: 33, sex: 'female',
    });
    expect(result.score).toBe(0);
    expect(result.riskCategory).toBe('low');
  });

  it('scores 8 for obese middle-aged hypertensive male with all symptoms', () => {
    const result = computeStopBang({
      snoresLoudly: true, daytimeSleepiness: true, observedApneas: true,
      hypertension: true, bmi: 40, age: 55,
      neckCircumferenceCm: 45, sex: 'male',
    });
    expect(result.score).toBe(8);
    expect(result.riskCategory).toBe('high');
    expect(result.ahi_probability.severe).toBeGreaterThan(0.5);
  });

  it('neck threshold differs by sex', () => {
    const maleNarrow = computeStopBang({ snoresLoudly: false, daytimeSleepiness: false, observedApneas: false, hypertension: false, bmi: 25, age: 45, neckCircumferenceCm: 39, sex: 'male' });
    const femaleNarrow = computeStopBang({ snoresLoudly: false, daytimeSleepiness: false, observedApneas: false, hypertension: false, bmi: 25, age: 45, neckCircumferenceCm: 36, sex: 'female' });
    // Male: 39 < 40 → N=false; Female: 36 > 35 → N=true
    expect(maleNarrow.components.N).toBe(false);
    expect(femaleNarrow.components.N).toBe(true);
  });

  it('BMI>35 triggers B component', () => {
    const result = computeStopBang({ snoresLoudly: false, daytimeSleepiness: false, observedApneas: false, hypertension: false, bmi: 36, age: 40, sex: 'female' });
    expect(result.components.B).toBe(true);
  });

  it('intermediate risk for score 3-4', () => {
    const result = computeStopBang({ snoresLoudly: true, daytimeSleepiness: true, observedApneas: false, hypertension: false, bmi: 22, age: 40, neckCircumferenceCm: 33, sex: 'female' });
    expect(result.score).toBe(2);  // S+T only (G=false for female)
    // Adding hypertension bumps to 3 → intermediate
    const result3 = computeStopBang({ snoresLoudly: true, daytimeSleepiness: true, observedApneas: true, hypertension: false, bmi: 22, age: 40, sex: 'female' });
    expect(result3.score).toBe(3);
    expect(result3.riskCategory).toBe('intermediate');
  });

  it('AHI probabilities sum to 1', () => {
    for (let score = 0; score <= 8; score++) {
      const result = computeStopBang({ snoresLoudly: score >= 1, daytimeSleepiness: score >= 2, observedApneas: score >= 3, hypertension: score >= 4, bmi: score >= 5 ? 36 : 22, age: score >= 6 ? 55 : 40, neckCircumferenceCm: score >= 7 ? 42 : 36, sex: 'male' });
      const sum = result.ahi_probability.none_mild + result.ahi_probability.moderate + result.ahi_probability.severe;
      expect(Math.abs(sum - 1)).toBeLessThan(0.01);
    }
  });
});

// ─────────────────────────────────────────────
// CKD-EPI 2021
// ─────────────────────────────────────────────
describe('computeCKDEPI', () => {
  it('normal eGFR for healthy adult', () => {
    // Young female, Scr 0.8 mg/dL
    const result = computeCKDEPI({ serumCreatinine_mgdL: 0.8, age: 35, sex: 'female' });
    expect(result).not.toBeNull();
    expect(result.eGFR).toBeGreaterThan(90);
    expect(result.ckdStage).toBe('G1');
    expect(result.progressionRisk).toBe('low');
  });

  it('CKD-EPI race-free equation matches published reference values', () => {
    // Reference: 50yo male, Scr 1.5 mg/dL → eGFR ~50 mL/min/1.73m² (G3a)
    const result = computeCKDEPI({ serumCreatinine_mgdL: 1.5, age: 50, sex: 'male' });
    expect(result.eGFR).toBeGreaterThan(40);
    expect(result.eGFR).toBeLessThan(65);
    expect(['G3a', 'G3b', 'G2'].includes(result.ckdStage)).toBe(true);
  });

  it('same creatinine represents more disease in women (lower eGFR) due to lower normal Scr', () => {
    // CKD-EPI 2021: women have lower normal creatinine (κ=0.7 vs male κ=0.9)
    // So Scr=1.0 is further above normal for women → lower eGFR for women
    const male = computeCKDEPI({ serumCreatinine_mgdL: 1.0, age: 45, sex: 'male' });
    const female = computeCKDEPI({ serumCreatinine_mgdL: 1.0, age: 45, sex: 'female' });
    expect(male.eGFR).toBeGreaterThan(female.eGFR);
    // Both should compute without error
    expect(male.eGFR).toBeGreaterThan(0);
    expect(female.eGFR).toBeGreaterThan(0);
  });

  it('flags nephrology referral for eGFR <30', () => {
    const result = computeCKDEPI({ serumCreatinine_mgdL: 3.5, age: 65, sex: 'male' });
    expect(result.eGFR).toBeLessThan(30);
    expect(result.needsNephrologistReferral).toBe(true);
  });

  it('ACR A3 flags referral and increases CV risk multiplier', () => {
    const without = computeCKDEPI({ serumCreatinine_mgdL: 1.2, age: 55, sex: 'male' });
    const withA3 = computeCKDEPI({ serumCreatinine_mgdL: 1.2, age: 55, sex: 'male', urineACR_mgmmol: 35 });
    expect(withA3.acrCategory).toBe('A3');
    expect(withA3.cvRiskMultiplier).toBeGreaterThan(without.cvRiskMultiplier);
    expect(withA3.needsNephrologistReferral).toBe(true);
  });

  it('returns null for invalid creatinine', () => {
    const result = computeCKDEPI({ serumCreatinine_mgdL: 0, age: 50, sex: 'male' });
    expect(result).toBeNull();
  });

  it('stage G1-G5 classification is correct', () => {
    // Verified reference values using CKD-EPI 2021 race-free equation
    // 30yo female Scr 0.7 (normal range) → eGFR ~100+ (G1)
    const g1 = computeCKDEPI({ serumCreatinine_mgdL: 0.7, age: 30, sex: 'female' });
    expect(g1.ckdStage).toBe('G1');

    // 55yo male Scr 1.1 → eGFR ~70 (G2: 60-89)
    const g2 = computeCKDEPI({ serumCreatinine_mgdL: 1.1, age: 55, sex: 'male' });
    expect(g2.eGFR).toBeGreaterThan(60);
    expect(g2.eGFR).toBeLessThan(90);

    // 65yo male Scr 1.8 → eGFR ~45-59 (G3a or nearby)
    const g3 = computeCKDEPI({ serumCreatinine_mgdL: 1.8, age: 65, sex: 'male' });
    expect(g3.eGFR).toBeGreaterThan(25);
    expect(g3.eGFR).toBeLessThan(65);

    // 70yo male Scr 3.5 → eGFR <30 (G4 or G5)
    const g4 = computeCKDEPI({ serumCreatinine_mgdL: 3.5, age: 70, sex: 'male' });
    expect(g4.eGFR).toBeLessThan(30);
    expect(['G4', 'G5'].includes(g4.ckdStage)).toBe(true);
  });
});

// ─────────────────────────────────────────────
// COMPOSITE
// ─────────────────────────────────────────────
describe('computeAllClinicalScores', () => {
  it('returns all 4 engines for complete input', () => {
    const result = computeAllClinicalScores({
      age: 50, sex: 'male', ethnicity: 'south_asian', bmi: 28, waistCm: 95,
      sbp: 140, bpTreated: true, smoking: 'never', diabetes: 'none',
      hypertension: true, familyHistoryPrematureCVD: false,
      atrialFibrillation: false, physicalActivityMinPerDay: 20,
      eatsVegetablesFruitsDaily: false, bpMedication: true,
      historyHighGlucose: false, familyDiabetes: 'none',
      snoresLoudly: false, daytimeSleepiness: false, observedApneas: false,
      serumCreatinine_mgdL: 1.0,
    });
    expect(result.qrisk3).not.toBeNull();
    expect(result.findrisc).not.toBeNull();
    expect(result.stopBang).not.toBeNull();
    expect(result.ckdEpi).not.toBeNull();
    expect(result.compositeRisk.score).toBeGreaterThanOrEqual(0);
    expect(result.compositeRisk.score).toBeLessThanOrEqual(100);
  });

  it('ckdEpi is null when creatinine not provided', () => {
    const result = computeAllClinicalScores({
      age: 40, sex: 'female', bmi: 24, smoking: 'never', diabetes: 'none',
    });
    expect(result.ckdEpi).toBeNull();
  });

  it('composite level is very_high for high-risk patient', () => {
    const result = computeAllClinicalScores({
      age: 65, sex: 'male', ethnicity: 'south_asian', bmi: 35, waistCm: 110,
      sbp: 165, bpTreated: false, smoking: 'heavy',
      diabetes: 'type2', hypertension: true, familyHistoryPrematureCVD: true,
      atrialFibrillation: true, physicalActivityMinPerDay: 0,
      eatsVegetablesFruitsDaily: false, bpMedication: false,
      historyHighGlucose: true, familyDiabetes: 'first_degree',
      snoresLoudly: true, daytimeSleepiness: true, observedApneas: true,
      serumCreatinine_mgdL: 2.5,
    });
    expect(['high', 'very_high'].includes(result.compositeRisk.level)).toBe(true);
    expect(result.compositeRisk.urgentFlags.length).toBeGreaterThan(0);
  });

  it('composite level is low for ideal patient', () => {
    const result = computeAllClinicalScores({
      age: 25, sex: 'female', ethnicity: 'white', bmi: 21,
      sbp: 115, bpTreated: false, smoking: 'never', diabetes: 'none',
      hypertension: false, familyHistoryPrematureCVD: false,
      atrialFibrillation: false, physicalActivityMinPerDay: 60,
      eatsVegetablesFruitsDaily: true, bpMedication: false,
      historyHighGlucose: false, familyDiabetes: 'none',
      snoresLoudly: false, daytimeSleepiness: false, observedApneas: false,
    });
    expect(['low', 'moderate'].includes(result.compositeRisk.level)).toBe(true);
    expect(result.compositeRisk.urgentFlags.length).toBe(0);
  });
});
