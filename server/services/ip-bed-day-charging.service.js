/**
 * GAP-BIL-002 — Automated bed-day charging
 */
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';

export async function runBedDayCharging(organizationId) {
  const admissions = await sequelize.query(
    `SELECT ia.id AS admission_id, ia.patient_id, ia.ward_id, w.charge_per_day, w.name AS ward_name
     FROM ip_admissions ia
     JOIN wards w ON w.id = ia.ward_id
     WHERE ia.organization_id = :orgId AND ia.status = 'active'`,
    { replacements: { orgId: organizationId }, type: QueryTypes.SELECT },
  );

  let charged = 0;
  for (const adm of admissions) {
    const chargeCode = `BED-DAY-${adm.ward_id}`;
    const [cm] = await sequelize.query(
      `SELECT id, unit_price FROM charge_master
       WHERE organization_id = :orgId AND code = :code AND active = true LIMIT 1`,
      { replacements: { orgId: organizationId, code: chargeCode }, type: QueryTypes.SELECT },
    );
    const amount = cm?.unit_price ?? adm.charge_per_day ?? 0;
    if (!amount) continue;

    const exists = await sequelize.query(
      `SELECT 1 FROM billing_estimates be
       JOIN ip_admissions ia ON ia.id = be.admission_id
       WHERE be.admission_id = :admId AND be.metadata->>'last_bed_charge_date' = CURRENT_DATE::text
       LIMIT 1`,
      { replacements: { admId: adm.admission_id }, type: QueryTypes.SELECT },
    );
    if (exists.length) continue;

    await sequelize.query(
      `UPDATE billing_estimates SET
        total_amount = COALESCE(total_amount, 0) + :amt,
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('last_bed_charge_date', CURRENT_DATE::text, 'last_bed_charge', :amt),
        updated_at = NOW()
       WHERE admission_id = :admId`,
      { replacements: { admId: adm.admission_id, amt: amount }, type: QueryTypes.UPDATE },
    ).catch(() => null);
    charged += 1;
  }
  return { admissions: admissions.length, charged };
}
