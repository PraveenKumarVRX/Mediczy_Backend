import { jest } from '@jest/globals';

// display-sse-broker.service.js connects to Redis at import time (ambient-deterioration.service.js imports it
// transitively) — mocked so this pure-logic contract test never needs a live Redis/DB and can't hang on one.
jest.unstable_mockModule('../services/display-sse-broker.service.js', () => ({ pushToZone: jest.fn() }));

// WP-1.8 contract test: every caller that computes a NEWS2 score must agree with every other caller and with
// the shared scorer itself, for identical clinical inputs. This is the test the plan specifically asks for
// ("a contract test that every caller uses the shared function") — it would have caught the original bug (three
// implementations, three different answers for the same patient) directly, rather than by inspection.
const { computeNews2 } = await import('../services/news2.service.js');
const { computeNEWS2 } = await import('../services/vitals-ews.service.js');
const { scoreDeterioration } = await import('../services/clinical-intelligence.service.js');
const { evaluateNews2Deterioration } = await import('../services/ambient-deterioration.service.js');

describe('NEWS2 contract: every caller agrees with the shared scorer', () => {
  const cases = [
    { name: 'normal, complete', respiratoryRate: 16, spo2: 98, systolicBp: 120, pulse: 70, temperature: 37.0, consciousness: 'A' },
    { name: 'moderately unwell', respiratoryRate: 22, spo2: 94, systolicBp: 105, pulse: 105, temperature: 38.3, consciousness: 'A' },
    { name: 'critically unwell', respiratoryRate: 28, spo2: 89, systolicBp: 85, pulse: 135, temperature: 39.5, consciousness: 'U' },
    { name: 'single extreme only (systolic crisis)', respiratoryRate: 16, spo2: 98, systolicBp: 220, pulse: 70, temperature: 37.0, consciousness: 'A' },
    { name: 'altered consciousness only', respiratoryRate: 16, spo2: 98, systolicBp: 120, pulse: 70, temperature: 37.0, consciousness: 'C' },
  ];

  it.each(cases)('$name — vitals-ews computeNEWS2 matches the shared score', (c) => {
    const reference = computeNews2({ ...c, spo2Scale: 1, onOxygen: false }).score;
    const shim = computeNEWS2({
      respiratory_rate: c.respiratoryRate, spo2: c.spo2, bp_systolic: c.systolicBp,
      pulse: c.pulse, temperature: c.temperature, consciousness: c.consciousness,
    });
    expect(shim).toBe(reference);
  });

  it.each(cases)('$name — clinical-intelligence scoreDeterioration matches the shared score', (c) => {
    const reference = computeNews2({ ...c, spo2Scale: 1, onOxygen: false }).score;
    const r = scoreDeterioration({
      respiratoryRate: c.respiratoryRate, oxygenSaturation: c.spo2, systolic: c.systolicBp,
      heartRate: c.pulse, temperature: c.temperature,
      consciousness: c.consciousness === 'A' ? 'alert' : c.consciousness === 'C' ? 'confused' : c.consciousness === 'U' ? 'unresponsive' : 'alert',
    });
    expect(r.news2).toBe(reference);
  });

  it.each(cases)('$name — ambient-deterioration evaluateNews2Deterioration matches the shared score (when it fires)', (c) => {
    const reference = computeNews2({ ...c, spo2Scale: 1, onOxygen: false });
    const alert = evaluateNews2Deterioration({
      bedId: 'B1', wardZone: 'ward-1',
      vitals: { respiratoryRate: c.respiratoryRate, spo2: c.spo2, systolicBp: c.systolicBp, hr: c.pulse, temp: c.temperature, consciousness: c.consciousness },
    });
    // ambient-deterioration only raises an alert at NEWS2 >= 5 (by design — a low-grade score never reaches a
    // ward display); below that threshold there is nothing to compare, which is itself correct behaviour.
    if (reference.score >= 5) {
      expect(alert).not.toBeNull();
      expect(alert.news2).toBe(reference.score);
    } else {
      expect(alert).toBeNull();
    }
  });

  it('an incomplete vitals set scores identically (from what was supplied) through every caller', () => {
    const partial = { respiratoryRate: 30 };
    const reference = computeNews2(partial).score;
    expect(computeNEWS2({ respiratory_rate: 30 })).toBe(reference);
    expect(scoreDeterioration({ respiratoryRate: 30 }).news2).toBe(reference);
  });
});
