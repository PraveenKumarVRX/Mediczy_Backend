process.env.NODE_ENV = 'test';

import { describe, expect, it } from '@jest/globals';
import {
  subscoreFromBand,
  subscoreFromMoodAverage,
  resolveMentalHealthSubscore,
} from '../utils/mentalHealthSubscore.js';

describe('mental-health subscore mapping (G-10)', () => {
  it('maps every published PHQ-9 band, worse band to lower score', () => {
    const v = (b) => subscoreFromBand('PHQ9', b);
    expect(v('minimal')).toBe(9);
    expect(v('mild')).toBe(7);
    expect(v('moderate')).toBe(5);
    expect(v('moderately_severe')).toBe(3);
    expect(v('severe')).toBe(1);
    // monotonic: the ordering is the whole point
    const order = ['minimal', 'mild', 'moderate', 'moderately_severe', 'severe'].map(v);
    expect(order).toEqual([...order].sort((a, b) => b - a));
  });

  it('maps every published GAD-7 band', () => {
    expect(subscoreFromBand('GAD7', 'minimal')).toBe(9);
    expect(subscoreFromBand('GAD7', 'mild')).toBe(7);
    expect(subscoreFromBand('GAD7', 'moderate')).toBe(5);
    expect(subscoreFromBand('GAD7', 'severe')).toBe(2);
  });

  it('is case-insensitive about the code and the band', () => {
    expect(subscoreFromBand('phq9', 'MODERATE')).toBe(5);
    expect(subscoreFromBand('Gad7', 'Mild')).toBe(7);
  });

  it('returns null for an unknown instrument or band rather than guessing', () => {
    expect(subscoreFromBand('BDI2', 'severe')).toBeNull();
    expect(subscoreFromBand('PHQ9', 'catastrophic')).toBeNull();
    expect(subscoreFromBand('GAD7', 'moderately_severe')).toBeNull(); // GAD-7 has no such band
    expect(subscoreFromBand(null, null)).toBeNull();
  });

  it('maps mood averages linearly onto 0-10', () => {
    expect(subscoreFromMoodAverage(1)).toBe(0);
    expect(subscoreFromMoodAverage(3)).toBe(5);
    expect(subscoreFromMoodAverage(5)).toBe(10);
    expect(subscoreFromMoodAverage(4)).toBe(7.5);
  });

  it('clamps out-of-range moods and refuses non-numbers', () => {
    expect(subscoreFromMoodAverage(0)).toBe(0);
    expect(subscoreFromMoodAverage(9)).toBe(10);
    for (const bad of [null, undefined, '', 'three', NaN, {}]) {
      expect(subscoreFromMoodAverage(bad)).toBeNull();
    }
  });
});

describe('resolveMentalHealthSubscore', () => {
  it('returns null when there is no data at all — the caller must omit the subscore', () => {
    expect(resolveMentalHealthSubscore()).toBeNull();
    expect(resolveMentalHealthSubscore({})).toBeNull();
    expect(resolveMentalHealthSubscore({ instrumentResults: [] })).toBeNull();
    expect(resolveMentalHealthSubscore({ instrumentResults: [{ instrumentCode: 'X', band: 'y' }] })).toBeNull();
  });

  it('prefers an instrument result over the mood diary', () => {
    const r = resolveMentalHealthSubscore({
      instrumentResults: [{ instrumentCode: 'PHQ9', band: 'moderate' }],
      moodAverage: 5,
    });
    expect(r).toMatchObject({ value: 5, source: 'instrument' });
  });

  // Under-stating depression or anxiety is the more harmful error.
  it('takes the WORSE of two instrument results', () => {
    const r = resolveMentalHealthSubscore({
      instrumentResults: [
        { instrumentCode: 'GAD7', band: 'minimal' },   // 9
        { instrumentCode: 'PHQ9', band: 'severe' },    // 1
      ],
    });
    expect(r.value).toBe(1);
    expect(r.basis.instrumentCode).toBe('PHQ9');
    expect(r.basis.consideredCount).toBe(2);
  });

  it('falls back to the mood diary and says so', () => {
    const r = resolveMentalHealthSubscore({ moodAverage: 2 });
    expect(r).toMatchObject({ source: 'mood_diary', value: 2.5 });
  });

  it('ignores unrecognised instrument results when choosing', () => {
    const r = resolveMentalHealthSubscore({
      instrumentResults: [{ instrumentCode: 'JUNK', band: 'severe' }, { instrumentCode: 'GAD7', band: 'mild' }],
    });
    expect(r.value).toBe(7);
    expect(r.basis.consideredCount).toBe(1);
  });

  it('never returns the old hardcoded 7.0 as a stand-in for missing data', () => {
    // The whole defect was a constant standing in for absent data.
    expect(resolveMentalHealthSubscore({})).toBeNull();
  });
});

/**
 * The overall-risk weighting, mirrored from ai-health-risk-cron.service.js.
 * Guards the direction fix: good adherence / lifestyle / mental health must
 * LOWER computed risk. The previous implementation used Math.abs() on negative
 * weights and so raised it.
 */
describe('overall risk direction (regression guard)', () => {
  const WEIGHTS = {
    cardiovascular: 0.25, diabetes: 0.20, hypertension: 0.20,
    medication_adherence: 0.15, lifestyle: 0.10, mental_health: 0.10,
  };
  const HIGHER_IS_BETTER = new Set(['medication_adherence', 'lifestyle', 'mental_health']);

  const overall = (s) => {
    let weighted = 0; let used = 0;
    for (const [k, w] of Object.entries(WEIGHTS)) {
      const raw = s[k];
      if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
      weighted += (HIGHER_IS_BETTER.has(k) ? 10 - raw : raw) * w;
      used += w;
    }
    const o = used > 0 ? weighted / used : 5.0;
    return Math.max(0, Math.min(10, Math.round(o * 100) / 100));
  };

  const disease = { cardiovascular: 2, diabetes: 2, hypertension: 2 };

  it('rates good habits as LOWER risk than poor habits', () => {
    const good = overall({ ...disease, medication_adherence: 10, lifestyle: 10, mental_health: 10 });
    const poor = overall({ ...disease, medication_adherence: 1, lifestyle: 1, mental_health: 1 });
    expect(good).toBeLessThan(poor);
    expect(good).toBe(1.3);
    expect(poor).toBe(4.45);
  });

  it('rates worse mental health as higher risk, all else equal', () => {
    const base = { ...disease, medication_adherence: 8, lifestyle: 8 };
    expect(overall({ ...base, mental_health: 9 })).toBeLessThan(overall({ ...base, mental_health: 1 }));
  });

  it('excludes an absent subscore and renormalises instead of defaulting it to 5', () => {
    const withMh = overall({ ...disease, medication_adherence: 8, lifestyle: 8, mental_health: 8 });
    const withoutMh = overall({ ...disease, medication_adherence: 8, lifestyle: 8 });
    // All present values are identical, so excluding one must not move the score.
    expect(withoutMh).toBeCloseTo(withMh, 2);
  });

  it('returns the neutral 5.0 only when nothing at all is known', () => {
    expect(overall({})).toBe(5.0);
  });

  it('keeps high disease risk high', () => {
    expect(overall({ cardiovascular: 9, diabetes: 9, hypertension: 9, medication_adherence: 2, lifestyle: 2, mental_health: 2 }))
      .toBeGreaterThan(8);
  });
});
