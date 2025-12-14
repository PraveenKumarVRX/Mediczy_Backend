// Shared health risk assessment schema mirrored from the admin frontend
// Provides scoring metadata so backend can validate and persist assessments consistently

export const RISK_SCORE_BANDS = [
  { label: 'Low Risk', min: 0, max: 50, color: 'text-emerald-500', description: 'Maintain current lifestyle and monitoring cadence.' },
  { label: 'Moderate Risk', min: 51, max: 100, color: 'text-amber-500', description: 'Flag for quarterly follow-ups and coaching nudges.' },
  { label: 'High Risk', min: 101, max: 150, color: 'text-orange-500', description: 'Escalate to care team for targeted intervention.' },
  { label: 'Severe Risk', min: 151, max: 999, color: 'text-red-600', description: 'Immediate medical review and escalation protocol.' },
];

export const MAX_THEORETICAL_SCORE = 300;

export const healthRiskSections = [
  {
    id: 'demographics',
    title: 'Demographics',
    subtitle: 'Age and gender baselines',
    weight: 1,
    questions: [
      { id: 'age', title: 'Age', options: [
        { id: '18_29', label: '18-29', score: 0 },
        { id: '30_39', label: '30-39', score: 2 },
        { id: '40_49', label: '40-49', score: 4 },
        { id: '50_59', label: '50-59', score: 6 },
        { id: '60_69', label: '60-69', score: 8 },
        { id: '70_79', label: '70-79', score: 10 },
        { id: '80_plus', label: '80+', score: 12 }
      ]},
      { id: 'gender', title: 'Gender', helper: 'Use the dominant sex-based clinical baseline', options: [
        { id: 'male', label: 'Male', score: 2 },
        { id: 'female', label: 'Female', score: 1 },
        { id: 'other', label: 'Other / Diverse', score: 1 }
      ]}
    ]
  },
  {
    id: 'lifestyle',
    title: 'Lifestyle',
    subtitle: 'Daily habits & routines',
    weight: 1.1,
    questions: [
      { id: 'smoking', title: 'Smoking Habits', options: [
        { id: 'never', label: 'Never smoked', score: 0 },
        { id: 'occasional', label: 'Occasional smoker', score: 2 },
        { id: 'regular_lt10', label: 'Regular (<10/day)', score: 4 },
        { id: 'heavy_gte10', label: 'Heavy (>=10/day)', score: 8 }
      ]},
      { id: 'alcohol', title: 'Alcohol Consumption', options: [
        { id: 'none', label: 'No alcohol', score: 0 },
        { id: 'occasional', label: 'Occasional (1-2x/week)', score: 2 },
        { id: 'moderate', label: 'Moderate (3-5x/week)', score: 4 },
        { id: 'heavy_daily', label: 'Heavy (daily)', score: 8 },
        { id: 'binge', label: 'Binge (5+ drinks/session)', score: 10 }
      ]},
      { id: 'food', title: 'Food Habits', options: [
        { id: 'balanced', label: 'Balanced diet', score: 0 },
        { id: 'fastfood_1_2', label: 'Processed 1-2x/week', score: 2 },
        { id: 'fastfood_3_5', label: 'Processed 3-5x/week', score: 4 },
        { id: 'junk_daily', label: 'Daily processed/junk', score: 6 },
        { id: 'high_sugar_salt', label: 'High fat/sugar/salt', score: 8 }
      ]},
      { id: 'activity', title: 'Physical Activity (weekly)', options: [
        { id: '150_mod', label: '>=150 mins moderate', score: 0 },
        { id: '75_150_mod', label: '75-150 mins moderate', score: 2 },
        { id: 'lt75', label: '<75 mins moderate', score: 4 },
        { id: 'none', label: 'No activity', score: 6 }
      ]},
      { id: 'sleep', title: 'Sleep Duration (nightly)', options: [
        { id: '7_8', label: '7-8 hours', score: 0 },
        { id: '5_6', label: '5-6 hours', score: 2 },
        { id: 'lt5_gt9', label: '<5 or >9 hours', score: 4 }
      ]},
      { id: 'snoring', title: 'Snoring', options: [
        { id: 'none', label: 'No snoring', score: 0 },
        { id: 'occasional', label: 'Occasional snoring', score: 2 },
        { id: 'regular', label: 'Regular snoring', score: 4 },
        { id: 'apnea', label: 'Severe / sleep apnea', score: 8 }
      ]},
      { id: 'stress', title: 'Stress level (self-reported)', options: [
        { id: 'low', label: 'Low', score: 1 },
        { id: 'moderate', label: 'Moderate', score: 3 },
        { id: 'high', label: 'High', score: 6 }
      ]},
      { id: 'hydration', title: 'Hydration per day', options: [
        { id: '2l', label: '>=2 liters', score: 0 },
        { id: '1_2l', label: '1-2 liters', score: 2 },
        { id: 'lt1l', label: '<1 liter', score: 4 }
      ]}
    ]
  },
  {
    id: 'physical',
    title: 'Physical Indicators',
    subtitle: 'Body composition & vitals',
    weight: 1.2,
    questions: [
      { id: 'bmi', title: 'BMI', options: [
        { id: 'normal', label: '18.5-24.9', score: 0 },
        { id: 'overweight', label: '25-29.9', score: 3 },
        { id: 'obese', label: '30-34.9', score: 6 },
        { id: 'severe_obese', label: '35-39.9', score: 8 },
        { id: 'morbid_obese', label: '>=40', score: 12 }
      ]},
      { id: 'whr', title: 'Waist-to-Hip Ratio', options: [
        { id: 'ideal', label: 'Men <0.90 / Women <0.85', score: 0 },
        { id: 'elevated', label: 'Men 0.90-0.99 / Women 0.85-0.89', score: 3 },
        { id: 'high', label: 'Men >=1.00 / Women >=0.90', score: 6 }
      ]},
      { id: 'neck', title: 'Neck Girth', options: [
        { id: 'ideal', label: 'Men <16" / Women <14"', score: 0 },
        { id: 'borderline', label: 'Men 16-17" / Women 14-15"', score: 2 },
        { id: 'high', label: 'Men >17" / Women >15"', score: 5 }
      ]},
      { id: 'body_fat', title: 'Body Fat %', options: [
        { id: 'normal', label: 'Men <20% / Women <30%', score: 0 },
        { id: 'overweight', label: 'Men 20-24% / Women 30-34%', score: 3 },
        { id: 'obese', label: 'Men >24% / Women >34%', score: 6 }
      ]},
      { id: 'bp', title: 'Blood Pressure', options: [
        { id: 'normal', label: '<120/80', score: 0 },
        { id: 'pre', label: '120-139 / 80-89', score: 3 },
        { id: 'hypertension', label: '>=140/90', score: 6 }
      ]},
      { id: 'resting_hr', title: 'Resting Heart Rate', options: [
        { id: 'normal', label: '60-80 bpm', score: 0 },
        { id: 'elevated', label: '80-100 bpm', score: 2 },
        { id: 'high', label: '>100 bpm', score: 5 }
      ]},
      { id: 'spo2', title: 'Oxygen Saturation (SpO2)', options: [
        { id: 'normal', label: '>=95%', score: 0 },
        { id: 'low', label: '90-94%', score: 3 },
        { id: 'very_low', label: '<90%', score: 6 }
      ]}
    ]
  },
  {
    id: 'medical',
    title: 'Medical History',
    subtitle: 'Existing chronic conditions',
    weight: 1.3,
    questions: [
      { id: 'hx_hypertension', title: 'Hypertension', options: [
        { id: 'none', label: 'No', score: 0 },
        { id: 'controlled', label: 'Yes (controlled)', score: 3 },
        { id: 'uncontrolled', label: 'Yes (uncontrolled)', score: 6 }
      ]},
      { id: 'hx_diabetes', title: 'Diabetes', options: [
        { id: 'none', label: 'No', score: 0 },
        { id: 'controlled', label: 'Yes (controlled)', score: 3 },
        { id: 'uncontrolled', label: 'Yes (uncontrolled)', score: 6 }
      ]},
      { id: 'hx_cholesterol', title: 'High Cholesterol', options: [
        { id: 'none', label: 'No', score: 0 },
        { id: 'controlled', label: 'Yes (controlled)', score: 3 },
        { id: 'uncontrolled', label: 'Yes (uncontrolled)', score: 6 }
      ]},
      { id: 'hx_heart', title: 'Heart Disease', options: [
        { id: 'none', label: 'No', score: 0 },
        { id: 'controlled', label: 'Yes (controlled)', score: 4 },
        { id: 'uncontrolled', label: 'Yes (uncontrolled)', score: 8 }
      ]},
      { id: 'hx_respiratory', title: 'Respiratory Issues (Asthma, COPD)', options: [
        { id: 'none', label: 'No', score: 0 },
        { id: 'managed', label: 'Yes (controlled)', score: 3 },
        { id: 'severe', label: 'Yes (uncontrolled)', score: 6 }
      ]},
      { id: 'hx_kidney', title: 'Kidney Disease', options: [
        { id: 'none', label: 'No', score: 0 },
        { id: 'stage_1_2', label: 'Stage 1-2', score: 3 },
        { id: 'stage_3_plus', label: 'Stage 3+', score: 6 }
      ]},
      { id: 'hx_liver', title: 'Liver Disease', options: [
        { id: 'none', label: 'No', score: 0 },
        { id: 'mild', label: 'Mild', score: 2 },
        { id: 'severe', label: 'Severe', score: 6 }
      ]},
      { id: 'hx_cancer', title: 'Cancer', options: [
        { id: 'none', label: 'No', score: 0 },
        { id: 'remission', label: 'In remission', score: 4 },
        { id: 'active', label: 'Active cancer', score: 8 }
      ]}
    ]
  },
  {
    id: 'family',
    title: 'Family History',
    subtitle: 'Hereditary risk factors',
    weight: 1,
    questions: [
      { id: 'fh_diabetes', title: 'Family Diabetes', options: [
        { id: 'no', label: 'No', score: 0 },
        { id: 'yes', label: 'Yes', score: 3 }
      ]},
      { id: 'fh_hypertension', title: 'Family Hypertension', options: [
        { id: 'no', label: 'No', score: 0 },
        { id: 'yes', label: 'Yes', score: 3 }
      ]},
      { id: 'fh_heart', title: 'Family Heart Disease', options: [
        { id: 'no', label: 'No', score: 0 },
        { id: 'yes', label: 'Yes', score: 4 }
      ]},
      { id: 'fh_cancer', title: 'Family Cancer', options: [
        { id: 'no', label: 'No', score: 0 },
        { id: 'yes', label: 'Yes', score: 5 }
      ]}
    ]
  },
  {
    id: 'occupational',
    title: 'Occupational Hazards',
    subtitle: 'Workplace risk exposure',
    weight: 1,
    questions: [
      { id: 'hazard_exposure', title: 'Exposure to hazardous materials', options: [
        { id: 'no', label: 'No', score: 0 },
        { id: 'occasional', label: 'Occasionally', score: 2 },
        { id: 'frequent', label: 'Frequently', score: 5 }
      ]},
      { id: 'sedentary_work', title: 'Sedentary work environment', options: [
        { id: 'no', label: 'No', score: 0 },
        { id: 'yes', label: 'Yes', score: 3 }
      ]},
      { id: 'repetitive_stress', title: 'Repetitive stress / physical labor', options: [
        { id: 'no', label: 'No', score: 0 },
        { id: 'yes', label: 'Yes', score: 4 }
      ]}
    ]
  },
  {
    id: 'mental',
    title: 'Mental Health',
    subtitle: 'Behavioural health indicators',
    weight: 1.1,
    questions: [
      { id: 'mental_depression', title: 'Depression / Anxiety diagnosis', options: [
        { id: 'no', label: 'No', score: 0 },
        { id: 'managed', label: 'Yes (managed)', score: 3 },
        { id: 'unmanaged', label: 'Yes (unmanaged)', score: 6 }
      ]},
      { id: 'cognitive', title: 'Cognitive issues', options: [
        { id: 'no', label: 'No', score: 0 },
        { id: 'mild', label: 'Mild', score: 3 },
        { id: 'severe', label: 'Severe', score: 6 }
      ]}
    ]
  },
  {
    id: 'examination',
    title: 'Medical Examination',
    subtitle: 'Lab / diagnostic findings',
    weight: 1.2,
    questions: [
      { id: 'lab_blood_sugar', title: 'Blood Sugar (fasting)', options: [
        { id: 'normal', label: '<100 mg/dL', score: 0 },
        { id: 'prediabetes', label: '100-125 mg/dL', score: 3 },
        { id: 'diabetes', label: '>=126 mg/dL', score: 6 }
      ]},
      { id: 'lab_cholesterol', title: 'Cholesterol (total)', options: [
        { id: 'normal', label: '<200 mg/dL', score: 0 },
        { id: 'borderline', label: '200-239 mg/dL', score: 3 },
        { id: 'high', label: '>=240 mg/dL', score: 6 }
      ]},
      { id: 'ecg', title: 'ECG abnormalities', options: [
        { id: 'no', label: 'No', score: 0 },
        { id: 'yes', label: 'Yes', score: 5 }
      ]},
      { id: 'sleep_apnea', title: 'Sleep apnea (report)', options: [
        { id: 'no', label: 'No', score: 0 },
        { id: 'mild', label: 'Mild', score: 3 },
        { id: 'severe', label: 'Severe', score: 6 }
      ]}
    ]
  },
  {
    id: 'substance',
    title: 'Substance Use',
    subtitle: 'Drug and abuse markers',
    weight: 1.4,
    questions: [
      { id: 'recreational_drugs', title: 'Recreational drug use', options: [
        { id: 'never', label: 'Never used', score: 0 },
        { id: 'occasional', label: 'Occasionally', score: 4 },
        { id: 'regular', label: 'Regular use', score: 8 }
      ]},
      { id: 'chronic_abuse', title: 'Chronic drug abuse', options: [
        { id: 'no', label: 'No', score: 0 },
        { id: 'yes', label: 'Yes', score: 12 }
      ]}
    ]
  }
];

export const TOTAL_QUESTIONS = healthRiskSections.reduce((sum, section) => sum + section.questions.length, 0);

export const resolveScoreBand = (score) => RISK_SCORE_BANDS.find((band) => score >= band.min && score <= band.max) || RISK_SCORE_BANDS[RISK_SCORE_BANDS.length - 1];

export const buildSectionBreakdown = (responses = {}) => {
  return healthRiskSections.map((section) => {
    const rawScore = section.questions.reduce((sum, question) => {
      const chosen = responses[question.id];
      if (!chosen) return sum;
      const option = question.options.find((opt) => opt.id === chosen);
      return option ? sum + option.score : sum;
    }, 0);

    const maxRawScore = section.questions.reduce((sum, question) => {
      const maxOption = Math.max(...question.options.map((opt) => opt.score));
      return sum + maxOption;
    }, 0);

    const answered = section.questions.filter((question) => responses[question.id]).length;

    return {
      id: section.id,
      title: section.title,
      subtitle: section.subtitle,
      weight: section.weight,
      rawScore,
      weightedScore: Math.round(rawScore * section.weight),
      maxScore: Math.round(maxRawScore * section.weight),
      answered,
      total: section.questions.length
    };
  });
};

export const calculateRiskScore = (responses = {}) => {
  const sectionBreakdown = buildSectionBreakdown(responses);
  const totalScore = sectionBreakdown.reduce((sum, section) => sum + section.weightedScore, 0);
  const answered = sectionBreakdown.reduce((sum, section) => sum + section.answered, 0);
  const completionPct = Math.round((answered / Math.max(1, TOTAL_QUESTIONS)) * 100);
  const band = resolveScoreBand(totalScore);

  return {
    totalScore: Math.round(totalScore),
    completionPct,
    band,
    sectionBreakdown
  };
};
