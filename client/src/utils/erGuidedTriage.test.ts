import { describe, expect, it } from 'vitest';
import { assessGuidedTriage, deriveGuidedEsi, EMPTY_GUIDED_TRIAGE, type GuidedTriage } from './erGuidedTriage';

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

describe('audit CLN-04: danger-zone vitals (same vectors as the server tests)', () => {
  const multi: GuidedTriage = { ...EMPTY_GUIDED_TRIAGE, multipleResources: true };

  it('suggests ESI-2 only for a would-be ESI-3 patient in the danger zone', () => {
    expect(assessGuidedTriage(multi, { heartRate: 120 }, 40)).toMatchObject({ base: 3, suggestedLevel: 2, upTriageSuggested: true });
    expect(assessGuidedTriage({ ...EMPTY_GUIDED_TRIAGE, oneResource: true }, { heartRate: 120 }, 40).upTriageSuggested).toBe(false);
    expect(assessGuidedTriage({ ...EMPTY_GUIDED_TRIAGE, highRiskDistress: true }, { heartRate: 120 }, 40).upTriageSuggested).toBe(false);
  });

  it('uses age-banded thresholds', () => {
    expect(assessGuidedTriage(multi, { heartRate: 130 }, 5).upTriageSuggested).toBe(false);
    expect(assessGuidedTriage(multi, { heartRate: 130 }, 40).upTriageSuggested).toBe(true);
    expect(assessGuidedTriage(multi, { heartRate: 170 }, 2).upTriageSuggested).toBe(true);
    expect(assessGuidedTriage(multi, { respiratoryRate: 55 }, 0.1).upTriageSuggested).toBe(true);
  });

  it('SpO2 < 92% is a danger sign at any age; 92% is not', () => {
    expect(assessGuidedTriage(multi, { spo2: 91 }, 8).upTriageSuggested).toBe(true);
    expect(assessGuidedTriage(multi, { spo2: 92 }, 8).upTriageSuggested).toBe(false);
  });

  it('unknown age uses the strictest thresholds and flags the assumption', () => {
    const r = assessGuidedTriage(multi, { heartRate: 130 }, null);
    expect(r.upTriageSuggested).toBe(true);
    expect(r.ageAssumedAdult).toBe(true);
  });

  it('does not imply an ESI-3 patient passed the vitals check when none were recorded', () => {
    expect(assessGuidedTriage(multi, {}, 40)).toMatchObject({ upTriageSuggested: false, vitalsMissingForEsi3: true });
  });
});
