import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import UserHealthAssessment from '../models/user-health-assessment.model.js';
import { User } from '../models/user.model.intelligent.js';
import { computeAllClinicalScores } from '../services/clinical-engines.service.js';

const router = express.Router();

/**
 * @route   GET /api/health-assessment/questions
 * @desc    Returns the standard health risk assessment questionnaire structure
 * @access  Private
 */
router.get('/questions', authUser, (req, res) => {
  res.json({
    success: true,
    version: '1.0',
    sections: [
      {
        id: 'measurements',
        title: 'Body Measurements',
        fields: [
          { id: 'age',    label: 'Age',    type: 'number', unit: 'years', required: true },
          { id: 'gender', label: 'Gender', type: 'select', options: ['male', 'female', 'other'], required: true },
          { id: 'height', label: 'Height', type: 'number', unit: 'cm',    required: true },
          { id: 'weight', label: 'Weight', type: 'number', unit: 'kg',    required: true },
          { id: 'waist',  label: 'Waist Circumference', type: 'number', unit: 'cm', required: false },
          { id: 'hip',    label: 'Hip Circumference',   type: 'number', unit: 'cm', required: false }
        ]
      },
      {
        id: 'lifestyle',
        title: 'Lifestyle',
        fields: [
          { id: 'smoking',           label: 'Smoking Status',      type: 'select', options: ['never', 'former', 'current'] },
          { id: 'alcohol',           label: 'Alcohol Consumption', type: 'select', options: ['none', 'occasionally', 'weekly', 'daily'] },
          { id: 'exercise_frequency',label: 'Exercise Frequency',  type: 'select', options: ['sedentary', 'light', 'moderate', 'active'] },
          { id: 'diet_quality',      label: 'Diet Quality',        type: 'select', options: ['poor', 'fair', 'good', 'excellent'] },
          { id: 'sleep_hours',       label: 'Average Sleep Hours', type: 'number', unit: 'hrs/night' },
          { id: 'stress_level',      label: 'Stress Level (1-10)', type: 'number', min: 1, max: 10 }
        ]
      },
      {
        id: 'medical_history',
        title: 'Medical History',
        fields: [
          { id: 'hypertension',   label: 'High Blood Pressure',   type: 'select', options: ['yes', 'no'] },
          { id: 'diabetes',       label: 'Diabetes',               type: 'select', options: ['yes', 'no'] },
          { id: 'heart_disease',  label: 'Heart Disease',          type: 'select', options: ['yes', 'no'] },
          { id: 'cholesterol',    label: 'High Cholesterol',       type: 'select', options: ['yes', 'no'] },
          { id: 'mental_health',  label: 'Mental Health Status',   type: 'select', options: ['normal', 'stressed', 'anxious', 'depressed'] }
        ]
      },
      {
        id: 'family_history',
        title: 'Family History',
        fields: [
          { id: 'family_heart_disease', label: 'Family Heart Disease', type: 'select', options: ['yes', 'no'] },
          { id: 'family_diabetes',      label: 'Family Diabetes',      type: 'select', options: ['yes', 'no'] },
          { id: 'family_cancer',        label: 'Family Cancer',        type: 'select', options: ['yes', 'no'] }
        ]
      }
    ]
  });
});

/**
 * @route   GET /api/health-assessment/my
 * @desc    Alias for GET /latest — returns the user's most recent health assessment
 * @access  Private
 */
router.get('/my', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessment = await UserHealthAssessment.findOne({
      where: { userId },
      order: [['assessed_at', 'DESC']]
    }).catch(() => null);

    if (!assessment) {
      return res.json({ success: true, assessment: null, hasAssessment: false, message: 'No health assessment found. Complete your first assessment to get started.' });
    }

    res.json({
      success: true,
      assessment: {
        id: assessment.id,
        userId,
        assessedAt: assessment.assessedAt,
        measurements: {
          age: assessment.age, height: assessment.height,
          weight: assessment.weight, bmi: assessment.bmi,
          waist: assessment.waist, hip: assessment.hip, whr: assessment.whr
        },
        riskAssessment: {
          score: assessment.riskScore,
          riskLevel: assessment.riskLevel,
          riskFactors: assessment.riskFactors,
          recommendations: generateRecommendations(assessment.riskLevel, assessment.riskFactors || [])
        }
      }
    });
  } catch (error) {
    console.error('❌ Health assessment /my error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve health assessment', error: error.message });
  }
});


const calculateHealthRiskScore = (assessment) => {
  let score = 0;
  let riskFactors = [];

  // Age-based scoring
  if (assessment.age) {
    if (assessment.age > 60) {
      score += 15;
      riskFactors.push('Age > 60');
    } else if (assessment.age > 50) {
      score += 10;
      riskFactors.push('Age 50-60');
    } else if (assessment.age > 40) {
      score += 5;
      riskFactors.push('Age 40-50');
    }
  }

  // BMI-based scoring
  if (assessment.bmi) {
    const bmi = assessment.bmi;
    if (bmi > 40) {
      score += 20;
      riskFactors.push('Severe Obesity (BMI > 40)');
    } else if (bmi > 35) {
      score += 15;
      riskFactors.push('Obesity (BMI 35-40)');
    } else if (bmi > 30) {
      score += 10;
      riskFactors.push('Overweight (BMI 30-35)');
    } else if (bmi < 18.5) {
      score += 5;
      riskFactors.push('Underweight (BMI < 18.5)');
    }
  }

  // Waist-to-Hip Ratio scoring
  if (assessment.whr) {
    const whr = assessment.whr;
    if (whr > 1.0) {
      score += 12;
      riskFactors.push('High Waist-to-Hip Ratio');
    } else if (whr > 0.9) {
      score += 8;
      riskFactors.push('Elevated Waist-to-Hip Ratio');
    }
  }

  // Lifestyle factors
  if (assessment.smoking) {
    if (assessment.smoking === 'current') {
      score += 20;
      riskFactors.push('Current Smoker');
    } else if (assessment.smoking === 'former') {
      score += 8;
      riskFactors.push('Former Smoker');
    }
  }

  if (assessment.alcohol) {
    if (assessment.alcohol === 'daily') {
      score += 15;
      riskFactors.push('Daily Alcohol Consumption');
    } else if (assessment.alcohol === 'weekly') {
      score += 8;
      riskFactors.push('Weekly Alcohol Consumption');
    }
  }

  if (assessment.exercise_frequency) {
    if (assessment.exercise_frequency === 'sedentary') {
      score += 15;
      riskFactors.push('Sedentary Lifestyle');
    } else if (assessment.exercise_frequency === 'light') {
      score += 5;
      riskFactors.push('Light Activity');
    }
  }

  // Medical history factors
  if (assessment.hypertension === 'yes') {
    score += 15;
    riskFactors.push('Hypertension');
  }

  if (assessment.diabetes === 'yes') {
    score += 20;
    riskFactors.push('Diabetes');
  }

  if (assessment.heart_disease === 'yes') {
    score += 25;
    riskFactors.push('Heart Disease');
  }

  if (assessment.cholesterol === 'yes') {
    score += 12;
    riskFactors.push('High Cholesterol');
  }

  if (assessment.mental_health) {
    if (assessment.mental_health === 'depressed' || assessment.mental_health === 'anxious') {
      score += 10;
      riskFactors.push('Mental Health Concerns');
    }
  }

  // Family history factors
  if (assessment.family_heart_disease === 'yes') {
    score += 8;
    riskFactors.push('Family History - Heart Disease');
  }

  if (assessment.family_diabetes === 'yes') {
    score += 8;
    riskFactors.push('Family History - Diabetes');
  }

  if (assessment.family_cancer === 'yes') {
    score += 6;
    riskFactors.push('Family History - Cancer');
  }

  // Cap at 100
  score = Math.min(score, 100);

  // Determine risk level
  let riskLevel = 'LOW';
  if (score >= 70) {
    riskLevel = 'VERY_HIGH';
  } else if (score >= 50) {
    riskLevel = 'HIGH';
  } else if (score >= 30) {
    riskLevel = 'MODERATE';
  } else if (score >= 15) {
    riskLevel = 'MILD';
  }

  return {
    score,
    riskLevel,
    riskFactors,
    maxScore: 100
  };
};

/**
 * @route   POST /api/health-assessment/save
 * @desc    Save health risk assessment
 * @access  Private (Authenticated user)
 * @body    {
 *   age: number,
 *   gender: 'male' | 'female' | 'other',
 *   height: number (cm),
 *   weight: number (kg),
 *   waist: number (cm),
 *   hip: number (cm),
 *   bmi: number,
 *   whr: number,
 *   smoking: 'never' | 'former' | 'current',
 *   alcohol: 'none' | 'occasionally' | 'weekly' | 'daily',
 *   exercise_frequency: 'sedentary' | 'light' | 'moderate' | 'active',
 *   hypertension: 'yes' | 'no',
 *   diabetes: 'yes' | 'no',
 *   heart_disease: 'yes' | 'no',
 *   cholesterol: 'yes' | 'no',
 *   mental_health: 'normal' | 'stressed' | 'anxious' | 'depressed',
 *   family_heart_disease: 'yes' | 'no',
 *   family_diabetes: 'yes' | 'no',
 *   family_cancer: 'yes' | 'no',
 *   stress_level: 1-10,
 *   sleep_hours: number,
 *   diet_quality: 'poor' | 'fair' | 'good' | 'excellent',
 *   responses: object (all assessment responses)
 * }
 */
router.post('/save', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const {
      age,
      gender,
      height,
      weight,
      waist,
      hip,
      bmi,
      whr,
      smoking,
      alcohol,
      exercise_frequency,
      hypertension,
      diabetes,
      heart_disease,
      cholesterol,
      mental_health,
      family_heart_disease,
      family_diabetes,
      family_cancer,
      stress_level,
      sleep_hours,
      diet_quality,
      responses = {}
    } = req.body;

    // Validate required fields
    if (!age || !gender || !height || !weight) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: age, gender, height, weight'
      });
    }

    // Validate numeric fields
    if (isNaN(age) || isNaN(height) || isNaN(weight)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid values for age, height, or weight'
      });
    }

    // Calculate risk assessment
    const assessmentData = {
      age: parseInt(age),
      gender,
      height: parseFloat(height),
      weight: parseFloat(weight),
      waist: waist ? parseFloat(waist) : null,
      hip: hip ? parseFloat(hip) : null,
      bmi: bmi ? parseFloat(bmi) : null,
      whr: whr ? parseFloat(whr) : null,
      smoking: smoking || 'never',
      alcohol: alcohol || 'none',
      exercise_frequency: exercise_frequency || 'sedentary',
      hypertension: hypertension || 'no',
      diabetes: diabetes || 'no',
      heart_disease: heart_disease || 'no',
      cholesterol: cholesterol || 'no',
      mental_health: mental_health || 'normal',
      family_heart_disease: family_heart_disease || 'no',
      family_diabetes: family_diabetes || 'no',
      family_cancer: family_cancer || 'no',
      stress_level: stress_level ? parseInt(stress_level) : 5,
      sleep_hours: sleep_hours ? parseFloat(sleep_hours) : 7,
      diet_quality: diet_quality || 'fair'
    };

    // Calculate legacy risk score (kept for backwards compat)
    const riskAssessment = calculateHealthRiskScore(assessmentData);

    // Compute validated clinical scores (QRISK3-SA, FINDRISC, STOP-BANG, CKD-EPI)
    const clinicalScores = computeAllClinicalScores({
      age: assessmentData.age,
      sex: assessmentData.gender === 'male' ? 'male' : 'female',
      ethnicity: req.body.ethnicity || 'south_asian',
      bmi: assessmentData.bmi || null,
      waistCm: assessmentData.waist || null,
      neckCircumferenceCm: req.body.neck_cm ? parseFloat(req.body.neck_cm) : null,
      sbp: req.body.sbp ? parseFloat(req.body.sbp) : null,
      bpTreated: assessmentData.hypertension === 'yes',
      smoking: (() => {
        switch (assessmentData.smoking) {
          case 'current': return 'heavy';
          case 'former':  return 'ex';
          default:        return 'never';
        }
      })(),
      diabetes: assessmentData.diabetes === 'yes' ? 'type2' : 'none',
      hypertension: assessmentData.hypertension === 'yes',
      atrialFibrillation: req.body.af === 'yes',
      familyHistoryPrematureCVD: req.body.family_heart_disease === 'yes',
      familyDiabetes: req.body.family_diabetes === 'yes' ? 'first_degree' : 'none',
      physicalActivityMinPerDay: (() => {
        switch (assessmentData.exercise_frequency) {
          case 'active':   return 60;
          case 'moderate': return 30;
          case 'light':    return 15;
          default:         return 0;
        }
      })(),
      eatsVegetablesFruitsDaily: assessmentData.diet_quality === 'good' || assessmentData.diet_quality === 'excellent',
      bpMedication: assessmentData.hypertension === 'yes',
      historyHighGlucose: assessmentData.diabetes === 'yes',
      snoresLoudly:     req.body.snores_loudly === 'yes',
      daytimeSleepiness: req.body.daytime_sleepiness === 'yes',
      observedApneas:   req.body.observed_apneas === 'yes',
      hba1c_percent:    req.body.hba1c ? parseFloat(req.body.hba1c) : null,
      totalCholesterol_mmol: req.body.total_chol_mmol ? parseFloat(req.body.total_chol_mmol) : null,
      hdlCholesterol_mmol: req.body.hdl_mmol ? parseFloat(req.body.hdl_mmol) : null,
      serumCreatinine_mgdL: req.body.creatinine_mgdl ? parseFloat(req.body.creatinine_mgdl) : null,
      urineACR_mgmmol: req.body.urine_acr ? parseFloat(req.body.urine_acr) : null,
    });

    // Always create a new assessment row (keep full history)
    const assessment = await UserHealthAssessment.create({
      userId,
      ...assessmentData,
      riskScore: riskAssessment.score,
      riskLevel: riskAssessment.riskLevel,
      riskFactors: riskAssessment.riskFactors,
      allResponses: { ...responses, _clinicalScores: clinicalScores },
      assessedAt: new Date()
    });

    // Update user profile with health data
    try {
      await User.update(
        {
          height: parseFloat(height),
          weight: parseFloat(weight),
          age: parseInt(age),
          gender: gender
        },
        { where: { id: userId } }
      );
    } catch (err) {
      console.warn('⚠️ User profile update error (non-blocking):', err.message);
    }

    // Return comprehensive response
    res.status(201).json({
      success: true,
      message: 'Health assessment saved successfully',
      assessment: {
        id: assessment.id,
        userId,
        assessedAt: assessment.assessedAt || new Date(),
        measurements: {
          age: assessmentData.age,
          height: assessmentData.height,
          weight: assessmentData.weight,
          bmi: assessmentData.bmi,
          waist: assessmentData.waist,
          hip: assessmentData.hip,
          whr: assessmentData.whr
        },
        lifestyle: {
          smoking: assessmentData.smoking,
          alcohol: assessmentData.alcohol,
          exercise_frequency: assessmentData.exercise_frequency,
          sleep_hours: assessmentData.sleep_hours,
          diet_quality: assessmentData.diet_quality
        },
        medical: {
          hypertension: assessmentData.hypertension,
          diabetes: assessmentData.diabetes,
          heart_disease: assessmentData.heart_disease,
          cholesterol: assessmentData.cholesterol,
          mental_health: assessmentData.mental_health
        },
        family_history: {
          heart_disease: assessmentData.family_heart_disease,
          diabetes: assessmentData.family_diabetes,
          cancer: assessmentData.family_cancer
        }
      },
      riskAssessment: {
        score: riskAssessment.score,
        maxScore: riskAssessment.maxScore,
        riskLevel: riskAssessment.riskLevel,
        riskFactors: riskAssessment.riskFactors,
        recommendations: generateRecommendations(riskAssessment.riskLevel, riskAssessment.riskFactors),
        clinicalScores
      }
    });

  } catch (error) {
    console.error('❌ Health assessment save error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save health assessment',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/health-assessment
 * @desc    Get user's latest health assessment
 * @access  Private
 */
router.get('/', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const assessment = await UserHealthAssessment.findOne({
      where: { userId },
      order: [['assessed_at', 'DESC']]
    }).catch(() => null);

    if (!assessment) {
      return res.status(404).json({
        success: false,
        message: 'No health assessment found'
      });
    }

    res.json({
      success: true,
      assessment: {
        id: assessment.id,
        userId,
        assessedAt: assessment.assessedAt,
        measurements: {
          age: assessment.age,
          height: assessment.height,
          weight: assessment.weight,
          bmi: assessment.bmi,
          waist: assessment.waist,
          hip: assessment.hip,
          whr: assessment.whr
        },
        riskAssessment: {
          score: assessment.riskScore,
          riskLevel: assessment.riskLevel,
          riskFactors: assessment.riskFactors
        }
      }
    });
  } catch (error) {
    console.error('❌ Health assessment retrieval error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve health assessment',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/health-assessment/latest
 * @desc    Alias for GET / — returns latest health assessment
 * @access  Private
 */
router.get('/latest', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const assessment = await UserHealthAssessment.findOne({
      where: { userId },
      order: [['assessed_at', 'DESC']]
    }).catch(() => null);

    if (!assessment) {
      return res.status(404).json({ success: false, message: 'No health assessment found' });
    }

    res.json({
      success: true,
      assessment: {
        id: assessment.id,
        userId,
        assessedAt: assessment.assessedAt,
        measurements: { age: assessment.age, height: assessment.height, weight: assessment.weight, bmi: assessment.bmi, waist: assessment.waist, hip: assessment.hip, whr: assessment.whr },
        riskAssessment: { score: assessment.riskScore, riskLevel: assessment.riskLevel, riskFactors: assessment.riskFactors }
      }
    });
  } catch (error) {
    console.error('❌ Health assessment retrieval error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve health assessment', error: error.message });
  }
});

/**
 * @route   GET /api/health-assessment/history
 * @desc    Get all assessment history with period-based grouping
 * @access  Private
 */
router.get('/history', authUser, async (req, res) => {
  try {
    const userId = req.user.id;

    const limit = Math.max(1, Math.min(200, parseInt(req.query.limit ?? '50', 10)));
    const offset = Math.max(0, parseInt(req.query.offset ?? '0', 10));

    // Fetch assessments with pagination
    const { rows: assessmentRows, count: totalCount } = await UserHealthAssessment.findAndCountAll({
      where: { userId },
      order: [['assessed_at', 'DESC']],
      limit,
      offset,
      attributes: ['id', 'riskScore', 'riskLevel', 'riskFactors', 'assessedAt', 'age', 'bmi', 'whr', 'allResponses']
    });
    const assessments = assessmentRows;

    // Get user DOB for birthday-based annual calculation
    const user = await User.findByPk(userId, { attributes: ['dateOfBirth'] }).catch(() => null);
    const dob = user?.dateOfBirth ? new Date(user.dateOfBirth) : null;

    const now = new Date();

    // ── Daily cycle: 9 PM to 9 PM (IST 21:00 = UTC 15:30) ──
    // Find the most recent 9PM boundary
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // +5:30 IST
    const nowIST = new Date(now.getTime() + IST_OFFSET_MS);
    const todayIST = new Date(nowIST.getFullYear(), nowIST.getMonth(), nowIST.getDate());
    // If IST time is before 21:00, the daily cycle started at yesterday 21:00 IST
    const istHour = nowIST.getHours();
    let dailyCycleStartIST;
    if (istHour >= 21) {
      dailyCycleStartIST = new Date(todayIST.getFullYear(), todayIST.getMonth(), todayIST.getDate(), 21, 0, 0);
    } else {
      dailyCycleStartIST = new Date(todayIST.getFullYear(), todayIST.getMonth(), todayIST.getDate() - 1, 21, 0, 0);
    }
    // Convert back to UTC
    const dailyCycleStart = new Date(dailyCycleStartIST.getTime() - IST_OFFSET_MS);
    const dailyCycleEnd = new Date(dailyCycleStart.getTime() + 24 * 60 * 60 * 1000);

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Helper: start of ISO week (Monday)
    const weekStart = new Date(todayStart);
    const dayOfWeek = weekStart.getDay() || 7; // Sun=7, Mon=1 etc
    weekStart.setDate(weekStart.getDate() - (dayOfWeek - 1));

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
    const quarterStart = new Date(now.getFullYear(), quarterMonth, 1);
    const halfStart = now.getMonth() < 6
      ? new Date(now.getFullYear(), 0, 1)
      : new Date(now.getFullYear(), 6, 1);

    // ── Birthday-based annual period: from last birthday to next birthday ──
    let annualStart = null;
    let annualEnd = null;
    let nextBirthday = null;
    let daysUntilBirthday = null;
    let birthdayMonths = []; // 12 monthly buckets from birthday
    if (dob) {
      const bdayThisYear = new Date(now.getFullYear(), dob.getMonth(), dob.getDate());
      if (bdayThisYear > now) {
        // Birthday hasn't happened yet this year
        annualStart = new Date(now.getFullYear() - 1, dob.getMonth(), dob.getDate());
        annualEnd = bdayThisYear;
      } else {
        annualStart = bdayThisYear;
        annualEnd = new Date(now.getFullYear() + 1, dob.getMonth(), dob.getDate());
      }
      nextBirthday = annualEnd > now ? annualEnd : new Date(now.getFullYear() + 1, dob.getMonth(), dob.getDate());
      daysUntilBirthday = Math.ceil((nextBirthday - now) / (1000 * 60 * 60 * 24));

      // Build 12 birthday-month buckets (birthday+0m, birthday+1m, ..., birthday+11m)
      for (let m = 0; m < 12; m++) {
        const bucketStart = new Date(annualStart.getFullYear(), annualStart.getMonth() + m, annualStart.getDate());
        const bucketEnd = new Date(annualStart.getFullYear(), annualStart.getMonth() + m + 1, annualStart.getDate());
        birthdayMonths.push({
          month: m + 1,
          label: bucketStart.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
          start: bucketStart.toISOString(),
          end: bucketEnd.toISOString(),
          isCurrent: now >= bucketStart && now < bucketEnd,
        });
      }
    }

    // Classify each assessment into periods
    const mapped = assessments.map(a => {
      const d = new Date(a.assessedAt || a.created_at);
      const storedClinical = a.allResponses?._clinicalScores ?? null;
      return {
        id: a.id,
        score: parseFloat(a.riskScore) || 0,
        riskLevel: a.riskLevel,
        riskFactors: a.riskFactors,
        assessedAt: d.toISOString(),
        age: a.age,
        bmi: a.bmi ? parseFloat(a.bmi) : null,
        whr: a.whr ? parseFloat(a.whr) : null,
        clinicalScores: storedClinical,
        periods: {
          daily: d >= dailyCycleStart && d < dailyCycleEnd,
          weekly: d >= weekStart,
          monthly: d >= monthStart,
          quarterly: d >= quarterStart,
          halfYearly: d >= halfStart,
          annual: annualStart ? (d >= annualStart && d < annualEnd) : false,
        },
        // Tag which birthday-month bucket this falls into (0-indexed, -1 if none)
        birthdayMonth: (() => {
          if (!annualStart) return -1;
          for (let m = 0; m < 12; m++) {
            const bStart = new Date(annualStart.getFullYear(), annualStart.getMonth() + m, annualStart.getDate());
            const bEnd = new Date(annualStart.getFullYear(), annualStart.getMonth() + m + 1, annualStart.getDate());
            if (d >= bStart && d < bEnd) return m;
          }
          return -1;
        })()
      };
    });

    // Compute period summaries
    const periodNames = ['daily', 'weekly', 'monthly', 'quarterly', 'halfYearly', 'annual'];
    const summaries = {};
    for (const p of periodNames) {
      const items = mapped.filter(a => a.periods[p]);
      if (items.length === 0) {
        summaries[p] = { count: 0, avgScore: null, latestScore: null, latestLevel: null, trend: null };
      } else {
        const scores = items.map(i => i.score);
        const avgScore = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);
        const latestScore = scores[0]; // already sorted DESC
        const latestLevel = items[0].riskLevel;
        // Trend: compare first half to second half of period items
        let trend = 'stable';
        if (items.length >= 2) {
          const mid = Math.floor(items.length / 2);
          const recentAvg = scores.slice(0, mid).reduce((s, v) => s + v, 0) / mid;
          const olderAvg = scores.slice(mid).reduce((s, v) => s + v, 0) / (items.length - mid);
          if (recentAvg < olderAvg - 3) trend = 'improving';
          else if (recentAvg > olderAvg + 3) trend = 'worsening';
        }
        summaries[p] = { count: items.length, avgScore, latestScore, latestLevel, trend };
      }
    }

    // Attach per-birthday-month scores
    const birthdayMonthSummaries = birthdayMonths.map((bucket, idx) => {
      const items = mapped.filter(a => a.birthdayMonth === idx);
      if (items.length === 0) return { ...bucket, count: 0, avgScore: null };
      const scores = items.map(i => i.score);
      const avgScore = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);
      return { ...bucket, count: items.length, avgScore };
    });

    res.json({
      success: true,
      total: totalCount,
      limit,
      offset,
      hasMore: offset + assessments.length < totalCount,
      assessments: mapped,
      periodSummaries: summaries,
      dailyCycle: {
        start: dailyCycleStart.toISOString(),
        end: dailyCycleEnd.toISOString(),
        label: '9 PM – 9 PM IST'
      },
      birthday: dob ? {
        date: dob.toISOString(),
        nextBirthday: nextBirthday?.toISOString() || null,
        daysUntilBirthday,
        annualPeriodStart: annualStart?.toISOString() || null,
        annualPeriodEnd: annualEnd?.toISOString() || null,
        monthlyMonitoring: birthdayMonthSummaries
      } : null
    });
  } catch (error) {
    console.error('❌ Health assessment history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve assessment history',
      error: error.message
    });
  }
});

/**
 * Generate health recommendations based on risk level
 */
const generateRecommendations = (riskLevel, riskFactors) => {
  const recommendations = {
    VERY_HIGH: [
      'Schedule urgent consultation with cardiologist',
      'Start medication as prescribed by doctor',
      'Monitor vital signs daily',
      'Reduce salt and sugar intake',
      'Implement daily exercise routine (30 min)',
      'Manage stress through meditation/yoga',
      'Regular health checkups every 3 months'
    ],
    HIGH: [
      'Schedule consultation with health professional',
      'Start regular exercise routine',
      'Monitor weight and blood pressure weekly',
      'Reduce processed foods',
      'Limit alcohol consumption',
      'Get adequate sleep (7-8 hours)',
      'Health checkup every 6 months'
    ],
    MODERATE: [
      'Increase daily physical activity',
      'Improve diet quality',
      'Monitor weight monthly',
      'Reduce stress',
      'Annual health checkup',
      'Consider lifestyle modifications'
    ],
    MILD: [
      'Maintain current health habits',
      'Continue regular exercise',
      'Annual health checkup',
      'Healthy diet and lifestyle'
    ],
    LOW: [
      'Continue healthy lifestyle',
      'Annual health checkup',
      'Stay physically active',
      'Maintain balanced diet'
    ]
  };

  return recommendations[riskLevel] || recommendations.LOW;
};

export default router;
