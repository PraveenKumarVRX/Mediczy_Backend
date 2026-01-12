import { DataTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';

/**
 * UserHealthAssessment Model
 * Stores user health assessments with risk calculations
 */
const UserHealthAssessment = sequelize.define('UserHealthAssessment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'user_id',
    references: {
      model: 'users',
      key: 'id'
    }
  },
  
  // Basic Information
  age: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  gender: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  
  // Physical Measurements
  height: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    comment: 'Height in cm'
  },
  weight: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    comment: 'Weight in kg'
  },
  waistCircumference: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    field: 'waist_circumference',
    comment: 'Waist circumference in cm'
  },
  hipCircumference: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    field: 'hip_circumference',
    comment: 'Hip circumference in cm'
  },
  
  // Calculated Metrics
  bmi: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    comment: 'Body Mass Index'
  },
  waistHipRatio: {
    type: DataTypes.DECIMAL(5, 3),
    allowNull: true,
    field: 'waist_hip_ratio',
    comment: 'Waist-to-Hip Ratio'
  },
  bodyFatPercentage: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    field: 'body_fat_percentage',
    comment: 'Estimated body fat percentage'
  },
  
  // Lifestyle Factors
  smokingStatus: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'smoking_status',
    comment: 'never, former, current'
  },
  alcoholConsumption: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'alcohol_consumption',
    comment: 'none, moderate, heavy'
  },
  exerciseFrequency: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'exercise_frequency',
    comment: 'sedentary, light, moderate, active, very_active'
  },
  sleepHours: {
    type: DataTypes.DECIMAL(3, 1),
    allowNull: true,
    field: 'sleep_hours',
    comment: 'Average hours of sleep per night'
  },
  stressLevel: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'stress_level',
    comment: 'low, moderate, high'
  },
  
  // Medical History
  chronicConditions: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
    defaultValue: [],
    field: 'chronic_conditions',
    comment: 'Array of chronic conditions'
  },
  familyHistory: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'family_history',
    comment: 'Family medical history'
  },
  currentMedications: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
    defaultValue: [],
    field: 'current_medications',
    comment: 'List of current medications'
  },
  
  // Vital Signs
  bloodPressureSystolic: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'blood_pressure_systolic'
  },
  bloodPressureDiastolic: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'blood_pressure_diastolic'
  },
  heartRate: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'heart_rate'
  },
  bloodGlucose: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    field: 'blood_glucose',
    comment: 'Fasting blood glucose in mg/dL'
  },
  cholesterolTotal: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    field: 'cholesterol_total',
    comment: 'Total cholesterol in mg/dL'
  },
  cholesterolLDL: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    field: 'cholesterol_ldl',
    comment: 'LDL cholesterol in mg/dL'
  },
  cholesterolHDL: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    field: 'cholesterol_hdl',
    comment: 'HDL cholesterol in mg/dL'
  },
  
  // Risk Assessment
  riskScore: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    field: 'risk_score',
    comment: 'Overall health risk score (0-100)'
  },
  riskLevel: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'risk_level',
    comment: 'LOW, MILD, MODERATE, HIGH, VERY_HIGH'
  },
  riskFactors: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
    defaultValue: [],
    field: 'risk_factors',
    comment: 'Identified risk factors'
  },
  recommendations: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Personalized health recommendations'
  },
  
  // Metadata
  assessmentDate: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'assessment_date'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Additional notes or observations'
  }
}, {
  tableName: 'user_health_assessments',
  timestamps: true,
  createdAt: 'assessmentDate',
  updatedAt: 'updatedAt',
  indexes: [
    {
      fields: ['user_id']
    },
    {
      fields: ['assessment_date']
    },
    {
      fields: ['risk_level']
    }
  ]
});

export default UserHealthAssessment;
