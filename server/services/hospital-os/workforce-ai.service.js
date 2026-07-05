/**
 * Hospital OS — AI workforce management (shift gap analysis Wave 1)
 */
import pool from '../../db/pgPool.js';

export async function analyzeWorkforce({ organizationId, department = 'nursing' }) {
  let credentialGaps = [];
  let openShifts = 0;

  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS expiring
       FROM staff_credentials
       WHERE organization_id = $1 AND expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'`,
      [organizationId]
    );
    credentialGaps = rows[0]?.expiring || 0;
  } catch {
    credentialGaps = 0;
  }

  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM staff_shifts
       WHERE organization_id = $1 AND shift_date >= CURRENT_DATE AND status = 'open'`,
      [organizationId]
    );
    openShifts = rows[0]?.c || 0;
  } catch {
    openShifts = 0;
  }

  const recommendations = [];
  if (openShifts > 0) {
    recommendations.push({
      action: `Fill ${openShifts} open shift(s) in ${department}`,
      priority: openShifts >= 3 ? 'high' : 'medium',
      tier: 'T1',
    });
  }
  if (credentialGaps > 0) {
    recommendations.push({
      action: `${credentialGaps} credential(s) expiring within 30 days`,
      priority: 'medium',
      tier: 'T0',
    });
  }
  if (recommendations.length === 0) {
    recommendations.push({ action: 'No immediate workforce gaps detected', priority: 'low', tier: 'T0' });
  }

  return {
    department,
    openShifts,
    credentialGaps,
    overtimeRisk: openShifts >= 4 ? 'elevated' : 'normal',
    recommendations,
    model: 'rules_v1',
  };
}

export default { analyzeWorkforce };
