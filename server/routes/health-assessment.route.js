import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import UserHealthAssessment from '../models/user-health-assessment.model.js';
import { User } from '../models/user.model.intelligent.js';

const router = express.Router();

/**
 * Calculate risk score based on assessment responses
 */
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

  // Determine risk level
  let riskLevel = 'LOW';
  if (score >= 60) {
    riskLevel = 'VERY_HIGH';
  } else if (score >= 45) {
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

    // Calculate risk score
    const riskAssessment = calculateHealthRiskScore(assessmentData);

    // Save to database or update existing assessment
    const assessment = await UserHealthAssessment.findOne({ where: { userId } })
      .then(existing => {
        if (existing) {
          return existing.update({
            ...assessmentData,
            riskScore: riskAssessment.score,
            riskLevel: riskAssessment.riskLevel,
            riskFactors: riskAssessment.riskFactors,
            allResponses: responses,
            assessedAt: new Date()
          });
        }
        
        return UserHealthAssessment.create({
          userId,
          ...assessmentData,
          riskScore: riskAssessment.score,
          riskLevel: riskAssessment.riskLevel,
          riskFactors: riskAssessment.riskFactors,
          allResponses: responses,
          assessedAt: new Date()
        });
      })
      .catch(err => {
        console.warn('⚠️ Database save error (non-blocking):', err.message);
        // Continue without database persistence if model doesn't exist
        return {
          id: 'temp-' + userId,
          userId,
          ...assessmentData,
          riskScore: riskAssessment.score,
          riskLevel: riskAssessment.riskLevel,
          riskFactors: riskAssessment.riskFactors
        };
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
        recommendations: generateRecommendations(riskAssessment.riskLevel, riskAssessment.riskFactors)
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
