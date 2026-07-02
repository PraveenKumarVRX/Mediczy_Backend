/**
 * Billing Ledger Bridge — mirrors legacy patient orders into hospital_billing_charges
 * and exposes unified patient account reads from the hospital RCM ledger.
 */
import pool from '../db/pgPool.js';
import { aggregatePatientAccount } from './hospital-billing.service.js';

async function ensureChargeTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hospital_billing_charges (
      id BIGSERIAL PRIMARY KEY,
      hospital_id INTEGER NOT NULL,
      patient_id INTEGER,
      admission_id BIGINT,
      charge_type VARCHAR(40) DEFAULT 'service',
      source_type VARCHAR(40),
      source_id VARCHAR(80),
      description TEXT,
      amount NUMERIC(14,2) DEFAULT 0,
      status VARCHAR(20) DEFAULT 'pending',
      invoice_id BIGINT,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_hbc_patient ON hospital_billing_charges(hospital_id, patient_id);
  `);
}

export function resolveHospitalIdFromUser(user) {
  if (!user) return null;
  return user.hospitalId || user.hospital_id || user.organizationId || user.organization_id || user.tenant_id || null;
}

/**
 * Mirror a legacy Sequelize order into hospital_billing_charges (idempotent).
 */
export async function mirrorLegacyOrderToHospitalCharge(order, hospitalId, patientId) {
  if (!hospitalId || !patientId || !order?.id) return null;
  await ensureChargeTable();

  const sourceId = String(order.id);
  const exists = await pool.query(
    `SELECT id FROM hospital_billing_charges
     WHERE hospital_id = $1 AND patient_id = $2 AND source_type = 'legacy_order' AND source_id = $3 LIMIT 1`,
    [hospitalId, patientId, sourceId]
  );
  if (exists.rowCount) return exists.rows[0];

  const amount = Number(order.total ?? order.subtotal ?? 0);
  const { rows } = await pool.query(
    `INSERT INTO hospital_billing_charges
       (hospital_id, patient_id, charge_type, source_type, source_id, description, amount, status, metadata)
     VALUES ($1,$2,'service','legacy_order',$3,$4,$5,'pending',$6::jsonb)
     RETURNING *`,
    [
      hospitalId,
      patientId,
      sourceId,
      `Legacy order ${order.orderNumber || sourceId} (${order.orderType || 'order'})`,
      amount,
      JSON.stringify({
        orderNumber: order.orderNumber,
        orderType: order.orderType,
        legacyOrderId: order.id,
        currency: order.currency || 'INR',
      }),
    ]
  );
  return rows[0];
}

/**
 * Unified patient ledger — hospital RCM is canonical; legacy orders mirrored when possible.
 */
export async function getUnifiedPatientLedger(hospitalId, patientId, admissionId = null) {
  const account = await aggregatePatientAccount(hospitalId, { patientId, admissionId });
  return {
    ledger: 'hospital',
    canonicalEndpoint: '/api/hospital/billing',
    deprecatedLegacyEndpoint: '/api/billing',
    account,
  };
}

export default { mirrorLegacyOrderToHospitalCharge, getUnifiedPatientLedger, resolveHospitalIdFromUser };
