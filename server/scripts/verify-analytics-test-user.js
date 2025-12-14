import { connectToDb } from '../db/mariadb.js';

const EMAIL = 'analytics.patient@mediczy.com';

async function main() {
  const db = await connectToDb();
  console.log('✅ Connected (or fallback) to Intelligent DB proxy');

  // Attempt a patient-context fetch (Python service path) then fallback
  try {
    const ctx = await db.query('users', { id: 'all' });
    console.log('📦 Patient context (sample):', JSON.stringify(ctx).slice(0, 400) + '...');
  } catch (err) {
    console.warn('⚠️  Patient-context fetch unavailable:', err.message);
  }

  // Intelligent adapters (fallback) summaries
  const user = await db.User.findOne({ where: { email: EMAIL } })
    .catch(() => null);
  console.log('👤 User lookup:', user ? { id: user.id, email: user.email, gender: user.gender } : 'not found');

  const vitals = await db.VitalsRecord.findAll({ where: { userId: user?.id } })
    .catch(() => []);
  const latestVitals = Array.isArray(vitals) && vitals.length ? vitals[vitals.length - 1] : null;
  console.log('🩺 Latest vitals:', latestVitals ? {
    heartRate: latestVitals.heartRate,
    systolicBP: latestVitals.systolicBP,
    diastolicBP: latestVitals.diastolicBP,
    spo2: latestVitals.spo2,
    steps: latestVitals.steps,
    timestamp: latestVitals.timestamp
  } : 'none');

  const risks = await db.HealthRiskAssessment.findAll({ where: { userId: user?.id } })
    .catch(() => []);
  const latestRisk = Array.isArray(risks) && risks.length ? risks[risks.length - 1] : null;
  console.log('📊 Latest risk assessment:', latestRisk ? {
    type: latestRisk.assessmentType,
    riskScore: latestRisk.riskScore,
    riskLevel: latestRisk.riskLevel,
    assessmentDate: latestRisk.assessmentDate
  } : 'none');

  console.log('\n✅ Verification complete.');
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ Verification failed:', e);
  process.exit(1);
});
