export type GuidedTriage = {
  immediateLifeThreat: boolean;
  highRiskDistress: boolean;
  multipleResources: boolean;
  oneResource: boolean;
};

export const EMPTY_GUIDED_TRIAGE: GuidedTriage = {
  immediateLifeThreat: false,
  highRiskDistress: false,
  multipleResources: false,
  oneResource: false,
};

/** Deterministic four-question ESI decision tree used by ER registration (decision points A–C). */
export const deriveGuidedEsi = (answers: GuidedTriage): number => {
  if (answers.immediateLifeThreat) return 1;
  if (answers.highRiskDistress) return 2;
  if (answers.multipleResources) return 3;
  if (answers.oneResource) return 4;
  return 5;
};

export type GuidedVitals = { heartRate?: number | null; respiratoryRate?: number | null; spo2?: number | null };

export type GuidedAssessment = {
  base: number;
  suggestedLevel: number;
  upTriageSuggested: boolean;
  reasons: string[];
  ageAssumedAdult: boolean;
  vitalsMissingForEsi3: boolean;
};

// [max age in years (exclusive), heart-rate ceiling, respiratory-rate ceiling]; SpO2 < 92% at every age.
// MIRRORS server/utils/esi-triage.js, which is authoritative — keep the two in step (same test vectors).
// Clinical sign-off by the medical director is required before this is relied on.
const DANGER_ZONE: Array<[number, number, number]> = [
  [0.25, 180, 50],
  [3, 160, 40],
  [8, 140, 30],
  [Infinity, 100, 20],
];

/** Audit CLN-04: ESI decision point D — danger-zone vitals for a would-be ESI-3 patient suggest ESI-2. */
export const assessGuidedTriage = (answers: GuidedTriage, vitals: GuidedVitals = {}, ageYears?: number | null): GuidedAssessment => {
  const base = deriveGuidedEsi(answers);
  const ageKnown = ageYears != null && Number.isFinite(ageYears);
  // Unknown age → adult (strictest) thresholds, the safe direction.
  const [, hrMax, rrMax] = ageKnown ? DANGER_ZONE.find(([maxAge]) => (ageYears as number) < maxAge)! : DANGER_ZONE[DANGER_ZONE.length - 1];
  const reasons: string[] = [];
  if (vitals.heartRate != null && vitals.heartRate > hrMax) reasons.push(`Heart rate ${vitals.heartRate} > ${hrMax}`);
  if (vitals.respiratoryRate != null && vitals.respiratoryRate > rrMax) reasons.push(`Respiratory rate ${vitals.respiratoryRate} > ${rrMax}`);
  if (vitals.spo2 != null && vitals.spo2 < 92) reasons.push(`SpO2 ${vitals.spo2}% < 92%`);
  const recorded = [vitals.heartRate, vitals.respiratoryRate, vitals.spo2].some((v) => v != null);
  const upTriageSuggested = base === 3 && reasons.length > 0;
  return {
    base, suggestedLevel: upTriageSuggested ? 2 : base, upTriageSuggested, reasons,
    ageAssumedAdult: !ageKnown, vitalsMissingForEsi3: base === 3 && !recorded,
  };
};
