/**
 * Hospital OS — hyper-personalized patient journey optimizer
 */
import pool from '../../db/pgPool.js';
import { up as migrate } from '../../migrations/hospital-os-2035.migration.js';

export async function optimizeJourney({ patientId, organizationId, goals = [], tenantId = 'default' }) {
  await migrate();

  const steps = [
    { order: 1, type: 'registration', title: 'Arrival & registration', durationMin: 10, location: 'lobby' },
    { order: 2, type: 'triage', title: 'Triage / vitals', durationMin: 15, location: 'triage' },
    { order: 3, type: 'consultation', title: 'Physician consultation', durationMin: 20, location: 'opd' },
  ];

  let pendingLabs = 0;
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM lab_orders WHERE patient_id = $1 AND status IN ('pending','ordered','draft')`,
      [patientId]
    );
    pendingLabs = rows[0]?.c || 0;
  } catch {
    pendingLabs = 0;
  }

  if (pendingLabs > 0 || goals.includes('labs')) {
    steps.push({ order: 4, type: 'lab', title: 'Laboratory collection', durationMin: 25, location: 'lab' });
    steps.push({ order: 5, type: 'lab_results', title: 'Results review', durationMin: 10, location: 'opd', waitFor: 'lab' });
  }

  if (goals.includes('imaging')) {
    steps.push({ order: steps.length + 1, type: 'imaging', title: 'Diagnostic imaging', durationMin: 45, location: 'radiology' });
  }

  steps.push({
    order: steps.length + 1,
    type: 'checkout',
    title: 'Billing & follow-up scheduling',
    durationMin: 15,
    location: 'billing',
  });

  const totalMinutes = steps.reduce((s, x) => s + x.durationMin, 0);
  const plan = {
    patientId,
    steps,
    totalEstimatedMinutes: totalMinutes,
    optimizedSequence: steps.map((s) => s.type),
    reminders: [
      { type: 'medication', message: 'Take medications as prescribed' },
      { type: 'follow_up', message: 'Schedule follow-up within 7 days if symptoms persist' },
    ],
    generatedAt: new Date().toISOString(),
  };

  await pool.query(
    `INSERT INTO hospital_os_journey_plans (tenant_id, patient_id, plan, optimized_at)
     VALUES ($1, $2, $3::jsonb, NOW())
     ON CONFLICT DO NOTHING`,
    [tenantId, patientId, JSON.stringify(plan)]
  ).catch(() => {});

  return plan;
}

export default { optimizeJourney };
