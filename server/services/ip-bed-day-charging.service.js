/**
 * GAP-BIL-002 — Automated bed-day charging (fixed schema + hospital_billing_charges)
 */
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';
import pool from '../db/pgPool.js';

async function ensureEstimate(admissionId, organizationId, patientId) {
  const [existing] = await sequelize.query(
    `SELECT id FROM billing_estimates WHERE admission_id = :admId ORDER BY created_at DESC LIMIT 1`,
    { replacements: { admId: admissionId }, type: QueryTypes.SELECT }
  );
  if (existing?.id) return existing.id;

  const [row] = await sequelize.query(
    `INSERT INTO billing_estimates (organization_id, admission_id, patient_id, estimate_type, room_charges, status, estimate_data)
     VALUES (:orgId, :admId, :patientId, 'mid_stay', 0, 'draft', '{}'::jsonb)
     RETURNING id`,
    { replacements: { orgId: organizationId, admId: admissionId, patientId }, type: QueryTypes.INSERT }
  );
  return row?.[0]?.id || row?.id;
}

export async function runBedDayCharging(organizationId) {
  const admissions = await sequelize.query(
    `SELECT ia.id AS admission_id, ia.patient_id, ia.ward_id, w.charge_per_day, w.name AS ward_name
     FROM ip_admissions ia
     JOIN wards w ON w.id = ia.ward_id
     WHERE ia.organization_id = :orgId AND ia.status = 'active'`,
    { replacements: { orgId: organizationId }, type: QueryTypes.SELECT }
  );

  let charged = 0;
  let skipped = 0;

  for (const adm of admissions) {
    const chargeCode = `BED-DAY-${adm.ward_id}`;
    const [cm] = await sequelize.query(
      `SELECT id, unit_price FROM charge_master
       WHERE organization_id = :orgId AND code = :code AND active = true LIMIT 1`,
      { replacements: { orgId: organizationId, code: chargeCode }, type: QueryTypes.SELECT }
    );
    const amount = Number(cm?.unit_price ?? adm.charge_per_day ?? 0);
    if (!amount) { skipped += 1; continue; }

    const estimateId = await ensureEstimate(adm.admission_id, organizationId, adm.patient_id);

    const [already] = await sequelize.query(
      `SELECT 1 FROM billing_estimates
       WHERE id = :estId AND estimate_data->>'last_bed_charge_date' = CURRENT_DATE::text
       LIMIT 1`,
      { replacements: { estId: estimateId }, type: QueryTypes.SELECT }
    );
    if (already) { skipped += 1; continue; }

    await sequelize.query(
      `UPDATE billing_estimates SET
        room_charges = COALESCE(room_charges, 0) + :amt,
        total_estimate = COALESCE(total_estimate, 0) + :amt,
        estimate_data = COALESCE(estimate_data, '{}'::jsonb) || jsonb_build_object(
          'last_bed_charge_date', CURRENT_DATE::text,
          'last_bed_charge', :amt::text,
          'ward_name', :wardName
        ),
        updated_at = NOW()
       WHERE id = :estId`,
      { replacements: { estId: estimateId, amt: amount, wardName: adm.ward_name || '' }, type: QueryTypes.UPDATE }
    );

    await pool.query(
      `INSERT INTO hospital_billing_charges
        (hospital_id, patient_id, admission_id, charge_type, source_type, source_id, description, amount, status, metadata)
       VALUES ($1, $2, $3, 'room', 'bed_day', $4, $5, $6, 'posted', $7::jsonb)`,
      [
        organizationId,
        adm.patient_id,
        adm.admission_id,
        estimateId,
        `Bed day — ${adm.ward_name || 'Ward'} (${new Date().toISOString().slice(0, 10)})`,
        amount,
        JSON.stringify({ wardId: adm.ward_id, chargeCode, date: new Date().toISOString().slice(0, 10) })
      ]
    ).catch((err) => console.warn('[bed-day] charge insert:', err.message));

    charged += 1;
  }

  return { admissions: admissions.length, charged, skipped };
}
