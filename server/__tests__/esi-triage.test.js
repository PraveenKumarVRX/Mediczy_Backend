import { assessGuidedTriage, baseEsi, dangerZoneVitals, verifyGuidedSubmission, ER_TRIAGE_ROLES } from '../utils/esi-triage.js';

const A = (o = {}) => ({ immediateLifeThreat: false, highRiskDistress: false, multipleResources: false, oneResource: false, ...o });

describe('base tree', () => {
  it('assigns the highest-acuity trigger', () => {
    expect(baseEsi(A({ immediateLifeThreat: true, oneResource: true }))).toBe(1);
    expect(baseEsi(A({ highRiskDistress: true, multipleResources: true }))).toBe(2);
    expect(baseEsi(A({ multipleResources: true }))).toBe(3);
    expect(baseEsi(A({ oneResource: true }))).toBe(4);
    expect(baseEsi(A())).toBe(5);
  });
});

describe('audit CLN-04: danger-zone vitals (ESI decision point D)', () => {
  it('flags an adult with HR > 100, RR > 20 or SpO2 < 92', () => {
    expect(dangerZoneVitals({ heartRate: 101 }, 40).inDangerZone).toBe(true);
    expect(dangerZoneVitals({ respiratoryRate: 21 }, 40).inDangerZone).toBe(true);
    expect(dangerZoneVitals({ spo2: 91 }, 40).inDangerZone).toBe(true);
    expect(dangerZoneVitals({ heartRate: 100, respiratoryRate: 20, spo2: 92 }, 40).inDangerZone).toBe(false);
  });

  it('uses age-banded thresholds for children (a resting HR of 130 is normal at 5 but dangerous at 40)', () => {
    expect(dangerZoneVitals({ heartRate: 130 }, 5).inDangerZone).toBe(false);
    expect(dangerZoneVitals({ heartRate: 130 }, 40).inDangerZone).toBe(true);
    expect(dangerZoneVitals({ heartRate: 170 }, 2).inDangerZone).toBe(true);     // toddler ceiling is 160
    expect(dangerZoneVitals({ heartRate: 150 }, 2).inDangerZone).toBe(false);
    expect(dangerZoneVitals({ respiratoryRate: 45 }, 0.1).inDangerZone).toBe(false); // infant under 3 months: ceiling 50
    expect(dangerZoneVitals({ respiratoryRate: 55 }, 0.1).inDangerZone).toBe(true);
  });

  it('SpO2 below 92% is a danger sign at every age', () => {
    for (const age of [0.1, 1, 6, 30, 80]) expect(dangerZoneVitals({ spo2: 90 }, age).inDangerZone).toBe(true);
  });

  it('unknown age uses the strictest (adult) thresholds and says so — the safe direction', () => {
    const r = dangerZoneVitals({ heartRate: 130 }, null);
    expect(r.inDangerZone).toBe(true); expect(r.ageAssumedAdult).toBe(true);
  });

  it('rejects physiologically impossible values instead of silently ignoring them', () => {
    expect(() => dangerZoneVitals({ spo2: 140 }, 30)).toThrow(/spo2/);
    expect(() => dangerZoneVitals({ heartRate: -5 }, 30)).toThrow(/heartRate/);
  });
});

describe('assessGuidedTriage', () => {
  it('suggests ESI-2 only for a would-be ESI-3 patient in the danger zone', () => {
    expect(assessGuidedTriage(A({ multipleResources: true }), { heartRate: 120 }, 40)).toMatchObject({ base: 3, suggestedLevel: 2, upTriageSuggested: true });
    expect(assessGuidedTriage(A({ oneResource: true }), { heartRate: 120 }, 40)).toMatchObject({ base: 4, upTriageSuggested: false });
    expect(assessGuidedTriage(A({ highRiskDistress: true }), { heartRate: 120 }, 40)).toMatchObject({ base: 2, upTriageSuggested: false });
  });

  it('does not imply an ESI-3 patient passed the vitals check when no vitals were recorded', () => {
    expect(assessGuidedTriage(A({ multipleResources: true }), {}, 40)).toMatchObject({ upTriageSuggested: false, vitalsMissingForEsi3: true });
    expect(assessGuidedTriage(A({ multipleResources: true }), { heartRate: 80 }, 40).vitalsMissingForEsi3).toBe(false);
  });
});

describe('audit CLN-05: the server verifies the level and the nurse\'s decision', () => {
  const guided = (extra = {}) => ({ answers: A({ multipleResources: true }), vitals: { heartRate: 130 }, ...extra });

  it('is not a guided submission when there are no answers (direct ESI / colour passes through)', () => {
    expect(verifyGuidedSubmission({ esiLevel: 3, triageInputs: null })).toBeNull();
  });

  it('requires an explicit decision when an up-triage is suggested', () => {
    expect(() => verifyGuidedSubmission({ esiLevel: 3, triageInputs: guided(), ageYears: 40 })).toThrow(/accept ESI-2 or decline/);
    try { verifyGuidedSubmission({ esiLevel: 3, triageInputs: guided(), ageYears: 40 }); } catch (e) { expect(e.status).toBe(409); expect(e.code).toBe('UP_TRIAGE_DECISION_REQUIRED'); }
  });

  it('accepted up-triage must be recorded as ESI-2; declined needs a reason and keeps ESI-3', () => {
    expect(verifyGuidedSubmission({ esiLevel: 2, triageInputs: guided({ upTriage: { decision: 'accepted' } }), ageYears: 40 }).upTriageSuggested).toBe(true);
    expect(() => verifyGuidedSubmission({ esiLevel: 3, triageInputs: guided({ upTriage: { decision: 'accepted' } }), ageYears: 40 })).toThrow(/must be ESI-2/);
    expect(() => verifyGuidedSubmission({ esiLevel: 3, triageInputs: guided({ upTriage: { decision: 'declined', reason: '' } }), ageYears: 40 })).toThrow(/reason/);
    expect(verifyGuidedSubmission({ esiLevel: 3, triageInputs: guided({ upTriage: { decision: 'declined', reason: 'Anxious, recheck in 10 min' } }), ageYears: 40 }).base).toBe(3);
  });

  it('refuses a level that does not follow from the answers (a tampered or stale client)', () => {
    expect(() => verifyGuidedSubmission({ esiLevel: 5, triageInputs: { answers: A({ multipleResources: true }), vitals: {} }, ageYears: 40 })).toThrow(/does not follow/);
    expect(() => verifyGuidedSubmission({ esiLevel: 1, triageInputs: { answers: A({ oneResource: true }) }, ageYears: 40 })).toThrow(/does not follow/);
  });

  it('only clinical roles may assign a level', () => {
    for (const r of ['nurse', 'doctor', 'ms', 'hospital_admin']) expect(ER_TRIAGE_ROLES.has(r)).toBe(true);
    for (const r of ['receptionist', 'billing', 'patient', 'security_staff']) expect(ER_TRIAGE_ROLES.has(r)).toBe(false);
  });
});
