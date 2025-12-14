import emergencyKeywordConfig from "../../client/src/shared/emergencyKeywords.json" with { type: "json" };

const flattened = Object.entries(emergencyKeywordConfig).flatMap(([category, config]) =>
  config.phrases.map((phrase) => ({
    phrase: phrase.toLowerCase(),
    category,
    specialization: config.specialization,
    severity: config.severity
  }))
);

export const getEmergencyKeywordConfig = () => emergencyKeywordConfig;

export const detectEmergencyKeywords = (text = "") => {
  const normalized = text.toLowerCase();
  const matches = flattened.filter(({ phrase }) => normalized.includes(phrase));
  if (!matches.length) {
    return {
      matched: false,
      matches: [],
      severity: null,
      specialization: null,
      category: null
    };
  }

  const primaryMatch = matches[0];
  return {
    matched: true,
    matches: matches.map((m) => m.phrase),
    severity: primaryMatch.severity,
    specialization: primaryMatch.specialization,
    category: primaryMatch.category
  };
};

export default detectEmergencyKeywords;
