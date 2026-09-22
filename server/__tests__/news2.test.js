import { jest } from '@jest/globals';
import { computeNews2, news2Response } from '../services/news2.service.js';

// The 13 test vectors from the audit plan (WP-1.8), verified by hand against the RCP NEWS2 2017 reference tables.
// Baseline (used unless a vector overrides it): respiratoryRate 16, systolicBp 120, pulse 70, temperature 37.0,
// consciousness 'A' (alert) — every one of these bands to 0, so a vector's total comes only from what it changes.
const baseline = { respiratoryRate: 16, systolicBp: 120, pulse: 70, temperature: 37.0, consciousness: 'A' };

describe('computeNews2 — the 13 acceptance vectors', () => {
  it('1) saturation 97 on air, scale 1 gives 0', () => {
    expect(computeNews2({ ...baseline, spo2: 97, spo2Scale: 1, onOxygen: false }).score).toBe(0);
  });
  it('2) saturation 97 on oxygen gives 2', () => {
    expect(computeNews2({ ...baseline, spo2: 97, spo2Scale: 1, onOxygen: true }).score).toBe(2);
  });
  it('3) saturation 97 on air, confused gives 3 with the single-red flag', () => {
    const r = computeNews2({ ...baseline, spo2: 97, spo2Scale: 1, onOxygen: false, consciousness: 'C' });
    expect(r.score).toBe(3);
    expect(r.singleRed).toBe(true);
  });
  it('4) scale 2 on air, saturation 90 gives 0', () => {
    expect(computeNews2({ ...baseline, spo2: 90, spo2Scale: 2, onOxygen: false }).score).toBe(0);
  });
  it('5) scale 2 on oxygen, saturation 96 gives 4', () => {
    expect(computeNews2({ ...baseline, spo2: 96, spo2Scale: 2, onOxygen: true }).score).toBe(4);
  });
  it('6) scale 2 on air, saturation 84 gives 2', () => {
    expect(computeNews2({ ...baseline, spo2: 84, spo2Scale: 2, onOxygen: false }).score).toBe(2);
  });
  it('7) scale 2 on air, saturation 82 gives 3', () => {
    expect(computeNews2({ ...baseline, spo2: 82, spo2Scale: 2, onOxygen: false }).score).toBe(3);
  });
  it('8) respiration 26, saturation 91 on scale 1, systolic 88, pulse 132, temperature 39.5, alert gives 14', () => {
    const r = computeNews2({ respiratoryRate: 26, spo2: 91, spo2Scale: 1, onOxygen: false, systolicBp: 88, pulse: 132, temperature: 39.5, consciousness: 'A' });
    expect(r.score).toBe(14);
  });
  it('9) respiration 21, saturation 95, systolic 110, pulse 91, temperature 38.1 gives 6', () => {
    const r = computeNews2({ respiratoryRate: 21, spo2: 95, spo2Scale: 1, onOxygen: false, systolicBp: 110, pulse: 91, temperature: 38.1, consciousness: 'A' });
    expect(r.score).toBe(6);
  });
  it('10) respiration 8, saturation 96, systolic 219, pulse 40, temperature 35.0 gives 9', () => {
    const r = computeNews2({ respiratoryRate: 8, spo2: 96, spo2Scale: 1, onOxygen: false, systolicBp: 219, pulse: 40, temperature: 35.0, consciousness: 'A' });
    expect(r.score).toBe(9);
  });
  it('11) systolic 220 otherwise normal gives 3 with the single-red flag', () => {
    const r = computeNews2({ ...baseline, spo2: 98, spo2Scale: 1, onOxygen: false, systolicBp: 220 });
    expect(r.score).toBe(3);
    expect(r.singleRed).toBe(true);
  });
  it('12) only respiration 30 supplied gives 3 and incomplete', () => {
    const r = computeNews2({ respiratoryRate: 30 });
    expect(r.score).toBe(3);
    expect(r.complete).toBe(false);
    expect(r.missing).toEqual(expect.arrayContaining(['spo2', 'systolicBp', 'pulse', 'temperature', 'consciousness']));
  });
  it('13) consciousness-scale 14 with no consciousness entry gives 3, provisional', () => {
    const r = computeNews2({ respiratoryRate: 16, spo2: 98, spo2Scale: 1, onOxygen: false, systolicBp: 120, pulse: 70, temperature: 37.0, legacyGcsScore: 14 });
    expect(r.score).toBe(3);
    expect(r.provisional).toBe(true);
  });
});

describe('computeNews2 — missing parameters are never scored as 0 (the bug this replaces)', () => {
  it('a completely empty vitals object scores 0 but is marked incomplete, not "safe"', () => {
    const r = computeNews2({});
    expect(r.score).toBe(0);
    expect(r.complete).toBe(false);
    expect(r.missing.length).toBe(6); // respiratoryRate, spo2, systolicBp, pulse, temperature, consciousness
    expect(r.band).toBeNull();
  });
  it('a genuinely complete, normal set is complete and routine', () => {
    const r = computeNews2({ ...baseline, spo2: 98, spo2Scale: 1, onOxygen: false });
    expect(r.complete).toBe(true);
    expect(r.score).toBe(0);
    expect(r.band).toBe('routine');
  });
});

describe('computeNews2 — bands', () => {
  it('score >= 7 is "high"', () => { expect(computeNews2({ respiratoryRate: 30, spo2: 85, spo2Scale: 1, pulse: 135 }).band).toBe('high'); });
  it('score 5-6 is "urgent"', () => { expect(computeNews2({ respiratoryRate: 22, systolicBp: 95, temperature: 39.5 }).band).toBe('urgent'); });
  it('a single parameter at 3 is "urgent" even if the total is only 3', () => {
    const r = computeNews2({ ...baseline, spo2: 98, spo2Scale: 1, systolicBp: 220 });
    expect(r.score).toBe(3);
    expect(r.band).toBe('urgent');
  });
  it('score 1-4 with no single red is "low"', () => { expect(computeNews2({ ...baseline, spo2: 98, spo2Scale: 1, respiratoryRate: 22 }).band).toBe('low'); });
});

describe('news2Response', () => {
  it('names an escalation for every band', () => {
    for (const band of ['high', 'urgent', 'low', 'routine', null]) {
      expect(typeof news2Response(band)).toBe('string');
      expect(news2Response(band).length).toBeGreaterThan(0);
    }
  });
});
