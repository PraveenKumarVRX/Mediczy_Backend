import { metricResult, metricUnavailable } from '../services/metric-integrity.service.js';
import { normalizeTriageInput } from '../services/multilingual-triage.service.js';
import { holtWintersForecast } from '../services/pharmacy-forecast.service.js';
import drugInteractionChecker from '../services/ai-drug-interaction.service.js';

describe('MedCore clean-room adoption capabilities', () => {
  test('does not turn an unavailable metric into zero', () => {
    expect(metricUnavailable('no source').value).toBeNull();
    expect(metricUnavailable('no source').unavailable).toBe(true);
    expect(metricResult(0).available).toBe(true);
  });

  test('normalizes a Hindi red-flag phrase before the triage service', () => {
    const normalized = normalizeTriageInput('सीने में दर्द', 'hi');
    expect(normalized.language).toBe('hi');
    expect(normalized.normalizedSymptoms).toContain('chest pain');
    expect(normalized.concepts[0].category).toBe('cardiac');
  });

  test('blocks a deterministic contraindicated drug pair', () => {
    const result = drugInteractionChecker.quickCheck(['fluoxetine', 'selegiline']);
    expect(result.severity).toBe('contraindicated');
    expect(result.safe).toBe(false);
  });

  test('returns an unavailable forecast for insufficient history', () => {
    const result = holtWintersForecast([{ date: '2026-01-01', quantity: 2 }], { seasonLength: 7 });
    expect(result.unavailable).toBe(true);
    expect(result.forecast).toEqual([]);
  });
});
