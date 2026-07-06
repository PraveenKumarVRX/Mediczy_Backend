import { computeImagingConfidence, buildFeatureAttributions } from '../services/imaging/imaging-interpretability-lib.js';

describe('imaging interpretability', () => {
  it('computes confidence tiers', () => {
    const c = computeImagingConfidence({
      structuredFindings: { items: [{ label: 'nodule' }, { label: 'effusion' }] },
      triage: { confidence_score: 0.8 },
      priorComparison: { priorStudy: { id: 1 } },
      gateResult: { passed: true },
    });
    expect(c.tier).toBe('high');
    expect(c.score).toBeGreaterThan(0.7);
  });

  it('prefers CV model feature attributions when present', () => {
    const attrs = buildFeatureAttributions(
      {
        items: [{ label: 'nodule', severity: 'low' }],
        feature_attributions: [
          { feature: 'Pneumonia', attribution: 0.82, direction: 'positive' },
        ],
        inference_backend: 'torchxrayvision',
      },
      [],
    );
    expect(attrs[0].feature).toBe('Pneumonia');
    expect(attrs[0].source).toBe('torchxrayvision');
  });

  it('builds feature attributions sorted by weight', () => {
    const attrs = buildFeatureAttributions(
      { items: [{ label: 'pneumothorax', severity: 'high', note: 'urgent' }] },
      [],
    );
    expect(attrs[0].feature).toBe('pneumothorax');
    expect(attrs[0].attribution).toBeGreaterThan(0.5);
  });
});
