/**
 * Medical Terminology Service
 * Provides autocomplete suggestions for medical terms, diagnoses, symptoms, etc.
 */

// Medical terminology reference data
const medicalTerms = {
  diagnoses: [
    { term: 'Fever', category: 'Symptom', icd10: 'R50.9', description: 'Elevated body temperature' },
    { term: 'Cough', category: 'Symptom', icd10: 'R05.9', description: 'Respiratory symptom' },
    { term: 'Headache', category: 'Symptom', icd10: 'R51.9', description: 'Head pain' },
    { term: 'Migraine', category: 'Diagnosis', icd10: 'G43.9', description: 'Intense headache disorder' },
    { term: 'Hypertension', category: 'Diagnosis', icd10: 'I10', description: 'High blood pressure' },
    { term: 'Diabetes', category: 'Diagnosis', icd10: 'E11.9', description: 'Blood sugar disorder' },
    { term: 'Asthma', category: 'Diagnosis', icd10: 'J45.9', description: 'Chronic respiratory disease' },
    { term: 'Arthritis', category: 'Diagnosis', icd10: 'M19.90', description: 'Joint inflammation' },
    { term: 'Depression', category: 'Diagnosis', icd10: 'F32.9', description: 'Mood disorder' },
    { term: 'Anxiety', category: 'Diagnosis', icd10: 'F41.1', description: 'Anxiety disorder' },
    { term: 'Gastritis', category: 'Diagnosis', icd10: 'K29.70', description: 'Stomach inflammation' },
    { term: 'GERD', category: 'Diagnosis', icd10: 'K21.9', description: 'Acid reflux disease' },
    { term: 'Bronchitis', category: 'Diagnosis', icd10: 'J20.9', description: 'Airway inflammation' },
    { term: 'Pneumonia', category: 'Diagnosis', icd10: 'J18.9', description: 'Lung infection' },
    { term: 'Dermatitis', category: 'Diagnosis', icd10: 'L30.9', description: 'Skin inflammation' },
    { term: 'UTI', category: 'Diagnosis', icd10: 'N39.0', description: 'Urinary tract infection' },
    { term: 'Diarrhea', category: 'Symptom', icd10: 'K59.1', description: 'Loose stools' },
    { term: 'Constipation', category: 'Symptom', icd10: 'K59.1', description: 'Difficult bowel movements' },
    { term: 'Nausea', category: 'Symptom', icd10: 'R11.0', description: 'Sensation of sickness' },
    { term: 'Vomiting', category: 'Symptom', icd10: 'R11.10', description: 'Expulsion of stomach contents' },
  ],

  symptoms: [
    'Ache',
    'Blurred vision',
    'Chills',
    'Dizziness',
    'Fatigue',
    'Flushed face',
    'Itching',
    'Joint pain',
    'Muscle pain',
    'Numbness',
    'Rash',
    'Shortness of breath',
    'Sore throat',
    'Sweating',
    'Swelling',
    'Tingling',
    'Weakness',
  ],

  abbreviations: [
    { abbr: 'OD', full: 'Once daily', type: 'Frequency' },
    { abbr: 'BD', full: 'Twice daily', type: 'Frequency' },
    { abbr: 'TDS', full: 'Three times daily', type: 'Frequency' },
    { abbr: 'QID', full: 'Four times daily', type: 'Frequency' },
    { abbr: 'HS', full: 'At bedtime', type: 'Frequency' },
    { abbr: 'QH', full: 'Every hour', type: 'Frequency' },
    { abbr: 'Q4H', full: 'Every 4 hours', type: 'Frequency' },
    { abbr: 'PC', full: 'After meals', type: 'Timing' },
    { abbr: 'AC', full: 'Before meals', type: 'Timing' },
    { abbr: 'SOS', full: 'As needed', type: 'Timing' },
    { abbr: 'STAT', full: 'Immediately', type: 'Timing' },
    { abbr: 'PO', full: 'By mouth', type: 'Route' },
    { abbr: 'IV', full: 'Intravenous', type: 'Route' },
    { abbr: 'IM', full: 'Intramuscular', type: 'Route' },
    { abbr: 'SC', full: 'Subcutaneous', type: 'Route' },
    { abbr: 'PR', full: 'Rectal', type: 'Route' },
    { abbr: 'BP', full: 'Blood pressure', type: 'Assessment' },
    { abbr: 'HR', full: 'Heart rate', type: 'Assessment' },
    { abbr: 'RR', full: 'Respiratory rate', type: 'Assessment' },
    { abbr: 'Temp', full: 'Temperature', type: 'Assessment' },
    { abbr: 'CBC', full: 'Complete blood count', type: 'Test' },
    { abbr: 'CXR', full: 'Chest X-ray', type: 'Test' },
    { abbr: 'ECG', full: 'Electrocardiogram', type: 'Test' },
    { abbr: 'BP', full: 'Blood pressure', type: 'Test' },
    { abbr: 'TSH', full: 'Thyroid stimulating hormone', type: 'Test' },
    { abbr: 'FBS', full: 'Fasting blood sugar', type: 'Test' },
    { abbr: 'Hb', full: 'Hemoglobin', type: 'Test' },
    { abbr: 'RBC', full: 'Red blood cells', type: 'Test' },
    { abbr: 'WBC', full: 'White blood cells', type: 'Test' },
    { abbr: 'Plt', full: 'Platelets', type: 'Test' },
    { abbr: 'PT', full: 'Prothrombin time', type: 'Test' },
    { abbr: 'INR', full: 'International normalized ratio', type: 'Test' },
  ],

  labTests: [
    'Abdominal ultrasound',
    'Allergy test',
    'Biopsy',
    'Blood culture',
    'Blood glucose',
    'Blood pressure',
    'Bone marrow aspiration',
    'Chest X-ray',
    'CBC',
    'Colonoscopy',
    'CT scan',
    'Echocardiogram',
    'ECG',
    'EEG',
    'Endoscopy',
    'Fasting glucose',
    'Liver function test',
    'Lipid profile',
    'Mammography',
    'MRI',
    'Pap smear',
    'Prolactin test',
    'PSA',
    'Renal function test',
    'Semen analysis',
    'Skeletal survey',
    'Sputum test',
    'Thyroid function test',
    'Triglycerides',
    'Ultrasound',
    'Urinalysis',
    'Urine culture',
    'Viral serology',
    'X-ray',
  ],

  instructions: [
    'After meals',
    'Before meals',
    'At bedtime',
    'In morning',
    'In evening',
    'With water',
    'With milk',
    'On empty stomach',
    'Rest for 2-3 days',
    'Avoid dairy',
    'Avoid spicy food',
    'Avoid alcohol',
    'Drink plenty of water',
    'Keep wound dry',
    'Apply ice',
    'Apply heat',
    'Elevate affected area',
    'Use loose clothing',
    'Wear comfortable shoes',
  ],

  routes: [
    { route: 'PO', full: 'By mouth (oral)', category: 'Route' },
    { route: 'IV', full: 'Intravenous', category: 'Route' },
    { route: 'IM', full: 'Intramuscular', category: 'Route' },
    { route: 'SC', full: 'Subcutaneous', category: 'Route' },
    { route: 'PR', full: 'Per rectum', category: 'Route' },
    { route: 'PV', full: 'Per vaginum', category: 'Route' },
    { route: 'Topical', full: 'Applied to skin', category: 'Route' },
    { route: 'Inhalation', full: 'Breathed in', category: 'Route' },
    { route: 'Sublingual', full: 'Under tongue', category: 'Route' },
    { route: 'Intradermal', full: 'Into skin', category: 'Route' },
  ],

  dosages: [
    '250mg',
    '500mg',
    '1000mg',
    '1mg',
    '2mg',
    '5mg',
    '10mg',
    '20mg',
    '50mg',
    '100mg',
    '250mcg',
    '500mcg',
    '1mcg',
    '5ml',
    '10ml',
    '15ml',
    '30ml',
  ],
};

class MedicalTerminologyService {
  constructor() {
    this.allTerms = this.buildSearchIndex();
  }

  buildSearchIndex() {
    const index = [];

    // Add diagnoses
    medicalTerms.diagnoses.forEach(item => {
      index.push({
        text: item.term,
        category: `Diagnosis (${item.category})`,
        full: `${item.term} - ${item.description}`,
        icd10: item.icd10,
        type: 'diagnosis',
      });
    });

    // Add symptoms
    medicalTerms.symptoms.forEach(symptom => {
      index.push({
        text: symptom,
        category: 'Symptom',
        full: symptom,
        type: 'symptom',
      });
    });

    // Add abbreviations
    medicalTerms.abbreviations.forEach(item => {
      index.push({
        text: item.abbr,
        category: `Abbreviation (${item.type})`,
        full: `${item.abbr} = ${item.full}`,
        type: 'abbreviation',
      });
    });

    // Add lab tests
    medicalTerms.labTests.forEach(test => {
      index.push({
        text: test,
        category: 'Lab Test',
        full: test,
        type: 'labtest',
      });
    });

    // Add instructions
    medicalTerms.instructions.forEach(instruction => {
      index.push({
        text: instruction,
        category: 'Instruction',
        full: instruction,
        type: 'instruction',
      });
    });

    // Add dosages
    medicalTerms.dosages.forEach(dosage => {
      index.push({
        text: dosage,
        category: 'Dosage',
        full: dosage,
        type: 'dosage',
      });
    });

    return index;
  }

  /**
   * Search for autocomplete suggestions
   * @param query - Search query (partial text)
   * @param limit - Maximum results to return
   * @returns Array of suggestions
   */
  search(query, limit = 5) {
    if (!query || query.length < 2) {
      return [];
    }

    const queryLower = query.toLowerCase();

    // Filter matching terms
    const matches = this.allTerms
      .filter(item => item.text.toLowerCase().includes(queryLower))
      .sort((a, b) => {
        // Prioritize exact prefix matches
        const aStartsWith = a.text.toLowerCase().startsWith(queryLower);
        const bStartsWith = b.text.toLowerCase().startsWith(queryLower);
        if (aStartsWith && !bStartsWith) return -1;
        if (!aStartsWith && bStartsWith) return 1;
        // Then by length (shorter = more relevant)
        return a.text.length - b.text.length;
      })
      .slice(0, limit);

    return matches;
  }

  /**
   * Get all medical terms of a specific type
   * @param type - 'diagnosis', 'symptom', 'abbreviation', 'labtest', 'instruction', 'dosage'
   * @returns Array of matching terms
   */
  getByType(type) {
    return this.allTerms.filter(item => item.type === type);
  }

  /**
   * Get suggestion for a term
   * @param query - Term to look up
   * @returns Detailed suggestion or null
   */
  getSuggestion(query) {
    return this.allTerms.find(item => item.text.toLowerCase() === query.toLowerCase()) || null;
  }

  /**
   * Get all abbreviations with their full forms
   */
  getAbbreviations() {
    return medicalTerms.abbreviations;
  }

  /**
   * Get all diagnoses with ICD-10 codes
   */
  getDiagnoses() {
    return medicalTerms.diagnoses;
  }

  /**
   * Get common dosages
   */
  getDosages() {
    return medicalTerms.dosages;
  }

  /**
   * Get lab tests
   */
  getLabTests() {
    return medicalTerms.labTests;
  }
}

export default new MedicalTerminologyService();
