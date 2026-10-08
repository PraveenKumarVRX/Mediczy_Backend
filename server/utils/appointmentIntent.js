/**
 * Appointment Intent Detection Utility
 * Detects when a user wants to book, schedule, or find a doctor
 */

// Intent keywords mapped to actions
const appointmentPhrases = [
  // Booking intents
  { phrase: "book an appointment", action: "book", priority: 10 },
  { phrase: "book appointment", action: "book", priority: 10 },
  { phrase: "schedule appointment", action: "book", priority: 10 },
  { phrase: "schedule an appointment", action: "book", priority: 10 },
  { phrase: "want to book", action: "book", priority: 9 },
  { phrase: "need to book", action: "book", priority: 9 },
  { phrase: "make an appointment", action: "book", priority: 9 },
  { phrase: "set up appointment", action: "book", priority: 9 },
  { phrase: "get an appointment", action: "book", priority: 8 },
  { phrase: "fix an appointment", action: "book", priority: 8 },
  { phrase: "book a consultation", action: "book", priority: 9 },
  { phrase: "schedule a consultation", action: "book", priority: 9 },
  { phrase: "book a checkup", action: "book", priority: 9 },
  { phrase: "schedule a checkup", action: "book", priority: 9 },
  
  // Doctor finding intents - also handles booking variations
  { phrase: "find a doctor", action: "find", priority: 8 },
  { phrase: "looking for a doctor", action: "find", priority: 8 },
  { phrase: "need a doctor", action: "find", priority: 7 },
  { phrase: "need doctor", action: "find", priority: 7 },  // Added: handles "i need doctor appointment"
  { phrase: "doctor appointment", action: "book", priority: 8 },  // Added: handles "i need doctor appointment"
  { phrase: "search for doctor", action: "find", priority: 7 },
  { phrase: "recommend a doctor", action: "find", priority: 8 },
  { phrase: "suggest a doctor", action: "find", priority: 8 },
  { phrase: "which doctor", action: "find", priority: 6 },
  { phrase: "best doctor for", action: "find", priority: 8 },
  { phrase: "specialist for", action: "find", priority: 7 },
  { phrase: "need a specialist", action: "find", priority: 8 },
  
  // Visit intents
  { phrase: "want to see a doctor", action: "visit", priority: 7 },
  { phrase: "need to see a doctor", action: "visit", priority: 7 },
  { phrase: "visit a doctor", action: "visit", priority: 6 },
  { phrase: "consult a doctor", action: "visit", priority: 7 },
  { phrase: "consult with a doctor", action: "visit", priority: 7 },
  { phrase: "doctor consultation", action: "visit", priority: 6 },
  { phrase: "online consultation", action: "book", priority: 8 },  // Added
  { phrase: "schedule a virtual call", action: "book", priority: 10 },
  { phrase: "book a virtual call", action: "book", priority: 10 },
  { phrase: "search for a psychology counselor", action: "find", priority: 10 },
  { phrase: "find a psychology counselor", action: "find", priority: 10 },
  { phrase: "book a therapist", action: "book", priority: 10 },
  { phrase: "schedule counseling", action: "book", priority: 10 },
  { phrase: "meet with doctor", action: "visit", priority: 6 }
];

// Specialization keywords to detect what type of doctor
// Order matters - more specific specializations first
const specializationKeywords = [
  { spec: "Dentist", keywords: ["tooth", "dental", "teeth", "dentist", "gum", "cavity", "oral health"] },
  { spec: "Cardiologist", keywords: ["heart", "cardiac", "cardio", "chest pain", "blood pressure", "hypertension", "cardiovascular"] },
  { spec: "Neurologist", keywords: ["brain", "migraine", "headache", "seizure", "stroke", "nerve", "neuro"] },
  { spec: "Dermatologist", keywords: ["skin", "derma", "acne", "rash", "eczema", "psoriasis", "hair loss"] },
  { spec: "Orthopedist", keywords: ["bone", "joint", "ortho", "fracture", "spine", "back pain", "knee", "hip"] },
  { spec: "Pediatrician", keywords: ["child", "kid", "baby", "infant", "pediatric", "children"] },
  { spec: "Gynecologist", keywords: ["pregnancy", "pregnant", "women", "menstrual", "gynec", "period", "fertility"] },
  { spec: "Psychologist", keywords: ["psychologist", "psychology", "counselor", "counsellor", "therapist", "therapy", "counselling"] },
  { spec: "Psychiatrist", keywords: ["mental", "depression", "anxiety", "stress", "psychiatric", "psychology", "mood"] },
  { spec: "Ophthalmologist", keywords: ["eye", "vision", "opthal", "glasses", "sight", "cataract", "glaucoma"] },
  { spec: "ENT Specialist", keywords: ["ear", "nose", "throat", "ent", "hearing", "sinus", "tonsil"] },
  { spec: "Gastroenterologist", keywords: ["stomach", "gastro", "digestion", "bowel", "liver", "abdomen", "intestine"] },
  { spec: "Pulmonologist", keywords: ["lung", "breathing", "respiratory", "asthma", "pulmon", "cough", "bronch"] },
  { spec: "Endocrinologist", keywords: ["diabetes", "thyroid", "hormone", "endocrine", "metabolism"] },
  { spec: "Urologist", keywords: ["urinary", "kidney", "bladder", "urology", "prostate"] },
  { spec: "Nephrologist", keywords: ["kidney", "nephro", "dialysis", "renal"] },
  { spec: "Oncologist", keywords: ["cancer", "tumor", "oncology", "chemotherapy"] },
  { spec: "Rheumatologist", keywords: ["arthritis", "rheumat", "autoimmune", "lupus", "fibromyalgia"] },
  { spec: "Allergist", keywords: ["allergy", "allergic", "allergist", "immunology"] },
  { spec: "General Medicine", keywords: ["general", "family doctor", "gp", "primary care", "general checkup"] }
];

/**
 * Detect appointment booking intent from user message
 */
export const detectAppointmentIntent = (text = "") => {
  const normalized = text.toLowerCase();
  
  // Find matching appointment phrases
  const matches = appointmentPhrases.filter(({ phrase }) => 
    normalized.includes(phrase)
  );

  // Catch natural-language variants and keep them inside My SmartHealth's
  // provider and appointment flow instead of sending users to another app.
  const mentalHealthBooking = /\b(book|schedule|arrange|find|search|connect|see|talk|speak)\b.{0,60}\b(psycholog(?:y|ist)|counsel(?:or|l?or)|therap(?:y|ist)|mental\s+health|psychiatr(?:ist|y))\b/i.test(normalized);
  if (mentalHealthBooking && !matches.some(match => match.action === 'book' || match.action === 'find')) {
    matches.push({ phrase: 'mental-health provider booking', action: 'book', priority: 10 });
  }
  
  if (!matches.length) {
    return {
      matched: false,
      action: null,
      specialization: null,
      matches: [],
      priority: 0
    };
  }
  
  // Sort by priority to get the strongest match
  matches.sort((a, b) => b.priority - a.priority);
  const primaryMatch = matches[0];
  
  // Detect specialization from context
  let detectedSpecialization = null;
  for (const { spec, keywords } of specializationKeywords) {
    const found = keywords.some(keyword => normalized.includes(keyword));
    if (found) {
      detectedSpecialization = spec;
      break;
    }
  }
  
  return {
    matched: true,
    action: primaryMatch.action,
    specialization: detectedSpecialization,
    matches: matches.map(m => m.phrase),
    priority: primaryMatch.priority
  };
};

/**
 * Check if a query is purely an appointment request (no medical symptoms)
 */
export const isAppointmentOnlyQuery = (text = "") => {
  const normalized = text.toLowerCase();
  
  // Medical symptom indicators
  const symptomIndicators = [
    "i have", "i feel", "i am experiencing", "suffering from",
    "my symptoms", "diagnosed with", "hurts", "pain", "ache",
    "fever", "cough", "vomit", "dizziness", "nausea", "bleeding"
  ];
  
  const hasSymptoms = symptomIndicators.some(s => normalized.includes(s));
  const hasAppointmentIntent = detectAppointmentIntent(text).matched;
  
  return hasAppointmentIntent && !hasSymptoms;
};

export default detectAppointmentIntent;
