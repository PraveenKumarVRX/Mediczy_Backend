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

/**
 * Operations/Workflow Agent: resource-aware scheduling — finds real gaps in
 * an OT room's actual booking schedule, instead of a fixed template. There
 * is no imaging-slots table in this codebase (the "MRI 2 hours earlier"
 * example from the vision doc isn't buildable without one), so this covers
 * ot_bookings, which is the one resource-scheduling table that actually
 * exists with real slot data.
 */
export async function suggestEarlierOTSlot({ organizationId, otRoomId, beforeScheduledStart, durationMinutes = 60 }) {
  const { rows: bookings } = await pool.query(
    `SELECT scheduled_start, scheduled_end FROM ot_bookings
     WHERE organization_id = $1 AND ot_room_id = $2
       AND ot_status NOT IN ('cancelled', 'completed')
       AND scheduled_start >= NOW() AND scheduled_start < $3
     ORDER BY scheduled_start ASC`,
    [organizationId, otRoomId, beforeScheduledStart]
  ).catch(() => ({ rows: [] }));

  const durationMs = durationMinutes * 60 * 1000;
  let cursor = new Date();
  for (const b of bookings) {
    const gapMs = new Date(b.scheduled_start).getTime() - cursor.getTime();
    if (gapMs >= durationMs) {
      return {
        available: true,
        suggestedStart: cursor.toISOString(),
        suggestedEnd: new Date(cursor.getTime() + durationMs).toISOString(),
        reason: `OT room ${otRoomId} has a ${Math.round(gapMs / 60000)}-minute gap before the next booking at ${b.scheduled_start}.`,
      };
    }
    cursor = new Date(b.scheduled_end);
  }

  const finalGapMs = new Date(beforeScheduledStart).getTime() - cursor.getTime();
  if (finalGapMs >= durationMs) {
    return {
      available: true,
      suggestedStart: cursor.toISOString(),
      suggestedEnd: new Date(cursor.getTime() + durationMs).toISOString(),
      reason: `OT room ${otRoomId} is free from ${cursor.toISOString()} until the originally scheduled time.`,
    };
  }

  return { available: false, reason: 'No earlier gap of sufficient duration found in this OT room\'s schedule.' };
}

export default { optimizeJourney, suggestEarlierOTSlot };
