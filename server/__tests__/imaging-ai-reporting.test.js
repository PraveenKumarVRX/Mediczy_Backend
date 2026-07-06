import { applyTemplate } from '../services/imaging/imaging-template-macros.js';
import { computeDraftConfidence } from '../services/imaging/imaging-report-confidence.js';

describe('imaging AI reporting', () => {
  it('applies report template macros', () => {
    const out = applyTemplate('FINDINGS:\n{{findings}}\nIMPRESSION:\n{{impression}}', {
      findings: 'No consolidation.',
      impression: 'Normal chest.',
    });
    expect(out).toContain('No consolidation.');
    expect(out).toContain('Normal chest.');
  });

  it('computes draft confidence from findings', () => {
    const score = computeDraftConfidence(
      { items: [{ label: 'nodule' }] },
      { confidence_score: 0.8 },
      { priorStudy: { id: 1 } },
    );
    expect(score).toBeGreaterThan(0.5);
  });

  it('detects critical patterns for alerts', async () => {
    const { CRITICAL_PATTERNS } = await import('../services/imaging/imaging-critical-patterns.js');
    const match = CRITICAL_PATTERNS.some((p) => p.pattern.test('suspected pneumothorax'));
    expect(match).toBe(true);
  });
});
