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

/** Deterministic four-question ESI decision tree used by ER registration. */
export const deriveGuidedEsi = (answers: GuidedTriage): number => {
  if (answers.immediateLifeThreat) return 1;
  if (answers.highRiskDistress) return 2;
  if (answers.multipleResources) return 3;
  if (answers.oneResource) return 4;
  return 5;
};
