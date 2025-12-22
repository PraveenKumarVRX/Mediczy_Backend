import intelligence from '../db/intelligence.js';
import { connectToDb as connectMariaDB } from '../db/mariadb.js';
import userModel from '../models/user.model.intelligent.js';
import healthRiskAssessmentModel from '../models/healthRiskAssessment.model.intelligent.js';
import vitalsRecordModel from '../models/vitalsRecord.model.intelligent.js';
import { connectToDb } from '../db/mariadb.js';

const ANALYTICS_TEST_EMAIL = 'analytics.patient@mediczy.com';

async function ensureTestUser() {
  const existing = await userModel.findOne({ where: { email: ANALYTICS_TEST_EMAIL } });
  if (existing) {
    console.log('ℹ️  Test user already exists:', existing.email);
    return existing;
  }

  const user = await userModel.create({
    firstName: 'Aditi',
    lastName: 'Rao',
    email: ANALYTICS_TEST_EMAIL,
    password: 'Health@123',
    dateOfBirth: new Date('1992-08-14'),
    gender: 'Female',
    phoneNumber: '+91-9000000009',
    address_street: '17 Wellness Park',
    address_city: 'Bengaluru',
    address_state: 'KA',
    address_zipCode: '560102',
    address_country: 'India',
    emergencyContact_name: 'Rohan Rao',
    emergencyContact_phone: '+91-9000008880',
    emergencyContact_relationship: 'Spouse',
    insurance_provider: 'CareFirst Platinum',
    insurance_policyNumber: 'PLAT-928377',
    insurance_groupNumber: 'CF-GRP-55',
    medical_allergies: 'Penicillin',
    medical_medications: 'Metformin, Atorvastatin',
    medical_conditions: 'Type 2 Diabetes, Hypertension',
    medical_bloodType: 'B+',
    isEmailVerified: true,
    isPhoneVerified: true,
    role: 'user'
  });

  console.log('✅ Created analytics test user:', user.email);
  return user;
}

async function seedHealthArtifacts(user) {
  const latestVitals = await vitalsRecordModel.create({
    userId: user.id,
    source: 'wearable',
    heartRate: 78,
    systolicBP: 128,
    diastolicBP: 82,
    spo2: 97,
    respiratoryRate: 16,
    temperature: 36.7,
    glucoseLevel: 112,
    steps: 8650,
    sleepHours: 7.4,
    stressScore: 42,
    timestamp: new Date()
  });

  const riskAssessment = await healthRiskAssessmentModel.create({
    userId: user.id,
    assessmentType: 'Metabolic Syndrome Risk',
    riskScore: 0.68,
    riskLevel: 'moderate',
    recommendations: [
      'Increase cardio workouts to 150 mins/week',
      'Adopt DASH diet meal plan',
      'Schedule follow-up lipid panel in 3 months'
    ],
    biomarkers: {
      hba1c: 6.8,
      ldl: 142,
      hdl: 42,
      triglycerides: 210
    },
    lifestyleFactors: {
      sleepQuality: 'fair',
      stressLevel: 'moderate',
      activityScore: 68
    },
    assessmentDate: new Date()
  });

  console.log('🩺 Stored latest vitals record:', latestVitals.id);
  console.log('📊 Stored health risk assessment:', riskAssessment.id);
  return { latestVitals, riskAssessment };
}

async function pushAnalyticsSnapshot(user, contextData) {
  const holisticSnapshot = {
    userId: user.id,
    demographicProfile: {
      age: 33,
      gender: user.gender,
      occupation: 'Product Manager',
      maritalStatus: 'Married',
      address: {
        city: user.address_city,
        state: user.address_state,
        country: user.address_country
      }
    },
    medicalHistory: {
      chronicConditions: user.medical_conditions,
      medications: user.medical_medications,
      allergies: user.medical_allergies,
      familyHistory: ['Maternal type 2 diabetes', 'Paternal hypertension']
    },
    wearableInsights: {
      avgRestingHeartRate: 74,
      avgHRV: 46,
      avgDailySteps: 9200,
      sleepEfficiency: 0.86,
      stressTrendScore: 38
    },
    recentReports: [
      {
        type: 'Lipid Panel',
        lab: 'Mediczy Diagnostics - Koramangala',
        collectedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 21),
        results: {
          totalCholesterol: 218,
          ldl: 142,
          hdl: 42,
          triglycerides: 210,
          nonHdl: 176
        }
      },
      {
        type: 'Continuous Glucose Monitoring',
        provider: 'Mediczy CGM Program',
        durationDays: 14,
        timeInRange: 0.71,
        gmi: 6.7,
        glycemicVariability: 17
      }
    ],
    carePlan: {
      primaryGoal: 'Improve metabolic health and reduce cardiovascular risk',
      nextReview: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      assignedCareTeam: {
        careManager: 'nurse_1502',
        cardiologist: 'dr_cardio_331',
        diabetesEducator: 'coach_077'
      }
    }
  };

  const metadata = {
    type: 'holistic_health_snapshot',
    userId: user.id,
    analyticsRequired: true,
    vectorize: true,
    tags: ['demographics', 'wearables', 'labs', 'care_plan'],
    ...contextData
  };

  const result = await intelligence.collectAndStore(holisticSnapshot, metadata);
  console.log('📦 Intelligence collectAndStore result:', result);
}

async function verifyIntelligenceMetrics() {
  const metrics = intelligence.getMetrics();
  console.log('📈 Intelligence metrics summary:', {
    totalQueries: metrics.totalQueries,
    bayesianInferences: metrics.bayesianInferences,
    kafkaEventsPublished: metrics.kafkaEventsPublished,
    queueJobsCreated: metrics.queueJobsCreated
  });
}

async function main() {
  try {
    console.log('🚀 Initializing leader MariaDB connection (orchestrator)...');
    try {
      await connectMariaDB();
      console.log('✅ Leader MariaDB initialized');
    } catch (e) {
      console.warn('⚠️  Leader MariaDB init failed:', e.message);
    }
    console.log('🚀 Connecting to Intelligent DB proxy...');
    await connectToDb();

    const user = await ensureTestUser();
    const contextData = await seedHealthArtifacts(user);
    await pushAnalyticsSnapshot(user, contextData);
    await verifyIntelligenceMetrics();

    console.log('\n✅ Analytics test user seeded successfully.');
    console.log('   Email:', ANALYTICS_TEST_EMAIL);
    console.log('   Password:', 'Health@123');
  } catch (error) {
    console.error('❌ Failed to seed analytics test user:', error);
  } finally {
    process.exit(0);
  }
}

main();
