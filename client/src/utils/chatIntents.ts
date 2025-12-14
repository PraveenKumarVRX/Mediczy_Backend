import emergencyKeywordConfig from "@/shared/emergencyKeywords.json";

export type ChatIntent = "emergency" | "appointment";

export interface EmergencyMatch {
  matched: boolean;
  phrases: string[];
  severity?: string;
  specialization?: string;
  category?: string;
}

export interface AppointmentIntent {
  matched: boolean;
  specialization?: string;
  keywords: string[];
}

export interface IntentAnalysisResult {
  intents: ChatIntent[];
  emergency?: EmergencyMatch;
  appointment?: AppointmentIntent;
}

const APPOINTMENT_KEYWORDS = [
  "book",
  "appointment",
  "consult doctor",
  "talk to doctor",
  "need doctor",
  "schedule",
  "follow up",
  "consultation",
  "online consultation"
];

const SPECIALIZATION_HINTS: Record<string, string> = {
  migraine: "Neurology",
  headache: "Neurology",
  "vision loss": "Neurology",
  "heart": "Cardiology",
  "chest": "Cardiology",
  "breathing": "Pulmonology",
  asthma: "Pulmonology",
  pregnancy: "Obstetrics",
  diabetes: "Endocrinology"
};

const flattenEmergencyPhrases = () => {
  const flattened: Array<{ phrase: string; category: string; specialization?: string; severity?: string }> = [];
  Object.entries(emergencyKeywordConfig).forEach(([category, config]) => {
    config.phrases.forEach((phrase: string) => {
      flattened.push({
        phrase: phrase.toLowerCase(),
        category,
        specialization: config.specialization,
        severity: config.severity
      });
    });
  });
  return flattened;
};

const EMERGENCY_PHRASES = flattenEmergencyPhrases();

const normalize = (text: string) => text.toLowerCase().trim();

const detectEmergencyIntent = (text: string): EmergencyMatch | undefined => {
  const normalized = normalize(text);
  const matches = EMERGENCY_PHRASES.filter(({ phrase }) => normalized.includes(phrase));
  if (!matches.length) return undefined;

  return {
    matched: true,
    phrases: matches.map((m) => m.phrase),
    severity: matches[0].severity,
    specialization: matches.find((m) => m.specialization)?.specialization,
    category: matches[0].category
  };
};

const detectAppointmentIntent = (text: string): AppointmentIntent | undefined => {
  const normalized = normalize(text);
  const keywords = APPOINTMENT_KEYWORDS.filter((word) => normalized.includes(word));
  if (!keywords.length) return undefined;

  const specializationHint = Object.entries(SPECIALIZATION_HINTS).find(([hint]) => normalized.includes(hint))?.[1];

  return {
    matched: true,
    specialization: specializationHint,
    keywords
  };
};

export const analyzeChatIntent = (text: string): IntentAnalysisResult => {
  const intents: ChatIntent[] = [];
  const emergency = detectEmergencyIntent(text);
  const appointment = detectAppointmentIntent(text);

  if (emergency?.matched) {
    intents.push("emergency");
  }

  if (appointment?.matched) {
    intents.push("appointment");
  }

  // De-duplicate intents
  const uniqueIntents = Array.from(new Set(intents));

  return {
    intents: uniqueIntents,
    emergency,
    appointment
  };
};

export const shouldBypassAIResponse = (analysis: IntentAnalysisResult) => {
  return analysis.intents.includes("emergency") || analysis.intents.includes("appointment");
};
