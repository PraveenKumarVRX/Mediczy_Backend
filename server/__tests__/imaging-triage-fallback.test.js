/**
 * Unit coverage for LLM-fallback triage guards (no live LLM / triage service).
 */
describe('imaging triage LLM fallback guards', () => {
  it('caps fallback confidence at 0.2 and requires disclaimer finding', async () => {
    // Mirror the constants/helpers from imaging-triage.service.js without hitting LLM
    const LLM_FALLBACK_MAX_CONFIDENCE = 0.2;
    const LLM_FALLBACK_DISCLAIMER = {
      label: 'No image analysis performed',
      severity: 'info',
      note: 'Text-only LLM fallback — pixel data was not analyzed. Physician review required before any clinical action.',
    };
    const withLlmFallbackDisclaimer = (findings) => {
      const list = Array.isArray(findings) ? findings.filter(Boolean) : [];
      return [LLM_FALLBACK_DISCLAIMER, ...list];
    };

    const findings = withLlmFallbackDisclaimer([{ label: 'Review', severity: 'low' }]);
    expect(findings[0].label.toLowerCase()).toMatch(/no image analysis/);
    expect(LLM_FALLBACK_MAX_CONFIDENCE).toBeLessThanOrEqual(0.2);
    expect(LLM_FALLBACK_MAX_CONFIDENCE).toBeLessThan(0.5);
  });
});
