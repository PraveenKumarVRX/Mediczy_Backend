process.env.NODE_ENV = 'test';

import { describe, expect, it } from '@jest/globals';
import { normalizeRiskScoreRow } from '../utils/riskScoreNormalizer.js';

const row = (subscores, extra = {}) => ({
  id: 1, patient_id: 42, overall_score: '3.9', risk_level: 'moderate',
  subscores, risk_factors: [], recommendations: [], model_version: 'v2-bayesian',
  updated_at: '2026-11-08T00:00:00Z', created_at: '2026-11-01T00:00:00Z', ...extra,
});

describe('risk score normalizer (G-9)', () => {
  // The defect: the client read flat fields the API never returned, so every row
  // of the patient's Risk Analysis panel rendered as `--`.
  it('flattens subscores onto the field names the client expects', () => {
    const out = normalizeRiskScoreRow(row({
      cardiovascular: 2.5, diabetes: 3, hypertension: 4,
      medication_adherence: 8, lifestyle: 6, mental_health: 7,
    }));
    expect(out.cardiovascular_risk).toBe(2.5);
    expect(out.diabetes_risk).toBe(3);
    expect(out.hypertension_risk).toBe(4);
    expect(out.adherence_score).toBe(8);
    expect(out.lifestyle_score).toBe(6);
    expect(out.mental_health_score).toBe(7);
  });

  it('keeps subscores intact for anything already reading them', () => {
    const subscores = { cardiovascular: 1 };
    expect(normalizeRiskScoreRow(row(subscores)).subscores).toEqual(subscores);
  });

  it('reports an absent subscore as null, so the UI can omit the row', () => {
    const out = normalizeRiskScoreRow(row({ cardiovascular: 2 }));
    expect(out.cardiovascular_risk).toBe(2);
    expect(out.mental_health_score).toBeNull();
    expect(out.lifestyle_score).toBeNull();
    expect(out.available_subscores).toEqual(['cardiovascular_risk']);
  });

  it('never invents a value for a missing subscore', () => {
    const out = normalizeRiskScoreRow(row({}));
    for (const f of ['cardiovascular_risk', 'diabetes_risk', 'hypertension_risk',
      'adherence_score', 'lifestyle_score', 'mental_health_score']) {
      expect(out[f]).toBeNull();
    }
    expect(out.available_subscores).toEqual([]);
  });

  it('exposes no respiratory field, because nothing computes one', () => {
    const out = normalizeRiskScoreRow(row({ cardiovascular: 2 }));
    expect(out).not.toHaveProperty('respiratory_risk');
  });

  it('coerces numeric strings that pg returns for NUMERIC columns', () => {
    const out = normalizeRiskScoreRow(row({ cardiovascular: '2.50' }, { confidence_score: '0.85' }));
    expect(out.cardiovascular_risk).toBe(2.5);
    expect(out.overall_score).toBe(3.9);
    expect(out.confidence_score).toBe(0.85);
  });

  it('survives subscores arriving as a JSON string, or as junk', () => {
    expect(normalizeRiskScoreRow(row('{"diabetes":5}')).diabetes_risk).toBe(5);
    for (const junk of ['not json', null, undefined, [], 7]) {
      const out = normalizeRiskScoreRow(row(junk));
      expect(out.subscores).toEqual({});
      expect(out.diabetes_risk).toBeNull();
    }
  });

  it('passes a null row straight through', () => {
    expect(normalizeRiskScoreRow(null)).toBeNull();
    expect(normalizeRiskScoreRow(undefined)).toBeNull();
  });

  it('does not treat a legitimate zero as missing', () => {
    const out = normalizeRiskScoreRow(row({ mental_health: 0 }));
    expect(out.mental_health_score).toBe(0);
    expect(out.available_subscores).toContain('mental_health_score');
  });
});
