import { describe, expect, it } from 'vitest';
import { deriveGuidedEsi, EMPTY_GUIDED_TRIAGE, type GuidedTriage } from './erGuidedTriage';

describe('ER guided ESI decision tree', () => {
  it('assigns ESI-1 when immediate life-saving intervention is required', () => {
    expect(deriveGuidedEsi({ ...EMPTY_GUIDED_TRIAGE, immediateLifeThreat: true })).toBe(1);
  });

  it('assigns ESI-2 for high-risk severe distress', () => {
    expect(deriveGuidedEsi({ ...EMPTY_GUIDED_TRIAGE, highRiskDistress: true })).toBe(2);
  });

  it('assigns ESI-3 and ESI-4 from expected resource count', () => {
    expect(deriveGuidedEsi({ ...EMPTY_GUIDED_TRIAGE, multipleResources: true })).toBe(3);
    expect(deriveGuidedEsi({ ...EMPTY_GUIDED_TRIAGE, oneResource: true })).toBe(4);
  });

  it('assigns ESI-5 only when no earlier trigger applies', () => {
    const answers: GuidedTriage = { immediateLifeThreat: false, highRiskDistress: false, multipleResources: false, oneResource: false };
    expect(deriveGuidedEsi(answers)).toBe(5);
  });

  it('uses the highest-acuity trigger when a nurse checks more than one box', () => {
    expect(deriveGuidedEsi({ immediateLifeThreat: true, highRiskDistress: true, multipleResources: true, oneResource: true })).toBe(1);
  });
});
