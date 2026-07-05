/**
 * HealthOS Stage 2 — Pharmacy connector (ePrescription + fulfillment)
 */
import pool from '../../db/pgPool.js';
import { up as migrate } from '../../migrations/healthos-phases-2-4.migration.js';
import { appendClinicalEvent } from './clinical-timeline.service.js';

let ready = false;
async function ensure() { if (!ready) { await migrate(); ready = true; } }

export async function createPharmacyOrder({ organizationId, patientId, drugName, dose, prescriptionId, pharmacyName }) {
  await ensure();
  const { rows } = await pool.query(
    `INSERT INTO healthos_pharmacy_orders
      (organization_id, patient_id, prescription_id, drug_name, dose, pharmacy_name)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [organizationId, patientId, prescriptionId, drugName, dose, pharmacyName]
  );
  await appendClinicalEvent({
    organizationId, patientId,
    eventType: 'pharmacy_order',
    title: `Prescription sent: ${drugName}`,
    body: pharmacyName ? `Pharmacy: ${pharmacyName}` : null,
    actorType: 'system', actorName: 'Pharmacy Hub',
    severity: 'info',
  });
  return rows[0];
}

export async function updatePharmacyStatus(orderId, status, fulfillmentNotes) {
  await ensure();
  const { rows } = await pool.query(
    `UPDATE healthos_pharmacy_orders
     SET status = $2, fulfillment_notes = $3, fulfilled_at = CASE WHEN $2 = 'fulfilled' THEN NOW() ELSE fulfilled_at END
     WHERE id = $1 RETURNING *`,
    [orderId, status, fulfillmentNotes]
  );
  const order = rows[0];
  if (order) {
    await appendClinicalEvent({
      organizationId: order.organization_id,
      patientId: order.patient_id,
      eventType: 'pharmacy_order',
      title: `${order.drug_name} — ${status}`,
      body: fulfillmentNotes,
      actorType: 'system', actorName: 'Pharmacy Hub',
      severity: 'info',
    });
  }
  return order;
}

export async function listPharmacyOrders(patientId, organizationId) {
  await ensure();
  const { rows } = await pool.query(
    `SELECT * FROM healthos_pharmacy_orders WHERE patient_id = $1 AND ($2::bigint IS NULL OR organization_id = $2)
     ORDER BY ordered_at DESC LIMIT 50`,
    [patientId, organizationId || null]
  );
  return rows;
}

export default { createPharmacyOrder, updatePharmacyStatus, listPharmacyOrders };
