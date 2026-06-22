/**
 * GAP-IPD-004 — eMAR administration → pharmacy dispense queue
 */
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';

export async function enqueueFromAdministration({
  organizationId,
  admissionId,
  patientId,
  medicationOrderId,
  administrationId,
  drugName,
  dose,
  route,
}) {
  const [row] = await sequelize.query(
    `INSERT INTO pharmacy_dispense_queue (
      organization_id, admission_id, patient_id, medication_order_id, administration_id,
      drug_name, dose, route, status, created_at, updated_at
    ) VALUES (
      :orgId, :admId, :patientId, :orderId, :adminId,
      :drug, :dose, :route, 'pending', NOW(), NOW()
    ) RETURNING *`,
    {
      replacements: {
        orgId: organizationId,
        admId: admissionId,
        patientId,
        orderId: medicationOrderId || null,
        adminId: administrationId || null,
        drug: drugName,
        dose: dose || null,
        route: route || null,
      },
      type: QueryTypes.INSERT,
    },
  );
  return row;
}

export async function listPendingDispense(organizationId, { wardId } = {}) {
  let sql = `SELECT pdq.*, ia.ward_id FROM pharmacy_dispense_queue pdq
    JOIN ip_admissions ia ON ia.id = pdq.admission_id
    WHERE pdq.organization_id = :orgId AND pdq.status = 'pending'`;
  const replacements = { orgId: organizationId };
  if (wardId) {
    sql += ' AND ia.ward_id = :wardId';
    replacements.wardId = wardId;
  }
  sql += ' ORDER BY pdq.created_at ASC';
  return sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
}

export async function markDispensed(id, organizationId, dispensedBy) {
  const [row] = await sequelize.query(
    `UPDATE pharmacy_dispense_queue SET status = 'dispensed', dispensed_by = :by, dispensed_at = NOW(), updated_at = NOW()
     WHERE id = :id AND organization_id = :orgId RETURNING *`,
    { replacements: { id, orgId: organizationId, by: dispensedBy }, type: QueryTypes.UPDATE },
  );
  return row;
}
