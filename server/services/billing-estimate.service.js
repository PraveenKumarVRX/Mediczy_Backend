/**
 * Billing Estimate Service — Phase 4
 *
 * Generates pre-admission or mid-stay cost estimates;
 * tracks non-payable (write-off) items; syncs consumable
 * charges from OT.
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';

async function ensureTables() {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS billing_estimates (
      id                  BIGSERIAL PRIMARY KEY,
      organization_id     BIGINT,
      admission_id        BIGINT,
      patient_id          BIGINT,
      estimate_type       TEXT DEFAULT 'pre_admission',  -- pre_admission | mid_stay | final
      procedure_name      TEXT,
      room_charges        NUMERIC(12,2) DEFAULT 0,
      ot_charges          NUMERIC(12,2) DEFAULT 0,
      anesthesia_charges  NUMERIC(12,2) DEFAULT 0,
      consumable_charges  NUMERIC(12,2) DEFAULT 0,
      implant_charges     NUMERIC(12,2) DEFAULT 0,
      pharmacy_charges    NUMERIC(12,2) DEFAULT 0,
      lab_charges         NUMERIC(12,2) DEFAULT 0,
      imaging_charges     NUMERIC(12,2) DEFAULT 0,
      professional_fees   NUMERIC(12,2) DEFAULT 0,
      misc_charges        NUMERIC(12,2) DEFAULT 0,
      subtotal            NUMERIC(12,2) GENERATED ALWAYS AS (
        room_charges + ot_charges + anesthesia_charges + consumable_charges +
        implant_charges + pharmacy_charges + lab_charges + imaging_charges +
        professional_fees + misc_charges
      ) STORED,
      discount_amount     NUMERIC(12,2) DEFAULT 0,
      tax_amount          NUMERIC(12,2) DEFAULT 0,
      total_estimate      NUMERIC(12,2) DEFAULT 0,
      currency            TEXT DEFAULT 'INR',
      insurance_covered   NUMERIC(12,2) DEFAULT 0,
      patient_liability   NUMERIC(12,2) DEFAULT 0,
      notes               TEXT,
      prepared_by         TEXT,
      valid_until         DATE,
      status              TEXT DEFAULT 'draft',   -- draft | shared | accepted | superseded
      estimate_data       JSONB DEFAULT '{}'::jsonb,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_billing_estimate_admission ON billing_estimates(admission_id);
    CREATE INDEX IF NOT EXISTS idx_billing_estimate_patient   ON billing_estimates(patient_id);

    CREATE TABLE IF NOT EXISTS non_payable_items (
      id                BIGSERIAL PRIMARY KEY,
      organization_id   BIGINT,
      admission_id      BIGINT NOT NULL,
      item_category     TEXT,
      item_description  TEXT NOT NULL,
      amount            NUMERIC(12,2) NOT NULL,
      reason_code       TEXT,   -- charity | insurance_exclusion | write_off | hospital_error | other
      approved_by       TEXT,
      notes             TEXT,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_non_payable_admission ON non_payable_items(admission_id);
  `);
}
ensureTables().catch(e => console.warn('[billing-estimate] table init:', e.message));

// ── Estimate generation ───────────────────────────────────────────────────────

export async function createEstimate(data) {
  const {
    organizationId, admissionId, patientId, estimateType, procedureName,
    roomCharges, otCharges, anesthesiaCharges, consumableCharges, implantCharges,
    pharmacyCharges, labCharges, imagingCharges, professionalFees, miscCharges,
    discountAmount, taxAmount, insuranceCovered, notes, preparedBy, validUntil, estimateData
  } = data;

  const subtotal = [
    roomCharges, otCharges, anesthesiaCharges, consumableCharges, implantCharges,
    pharmacyCharges, labCharges, imagingCharges, professionalFees, miscCharges
  ].reduce((s, v) => s + parseFloat(v || 0), 0);

  const totalEstimate = subtotal - parseFloat(discountAmount || 0) + parseFloat(taxAmount || 0);
  const patientLiability = totalEstimate - parseFloat(insuranceCovered || 0);

  const [result] = await sequelize.query(
    `INSERT INTO billing_estimates (
       organization_id, admission_id, patient_id, estimate_type, procedure_name,
       room_charges, ot_charges, anesthesia_charges, consumable_charges, implant_charges,
       pharmacy_charges, lab_charges, imaging_charges, professional_fees, misc_charges,
       discount_amount, tax_amount, total_estimate, insurance_covered, patient_liability,
       notes, prepared_by, valid_until, estimate_data
     ) VALUES (
       :orgId, :admId, :patientId, :type, :procedure,
       :room, :ot, :anesthesia, :consumable, :implant,
       :pharmacy, :lab, :imaging, :professional, :misc,
       :discount, :tax, :total, :insurance, :liability,
       :notes, :by, :validUntil, :data::jsonb
     ) RETURNING *`,
    {
      replacements: {
        orgId: organizationId || null, admId: admissionId || null, patientId: patientId || null,
        type: estimateType || 'pre_admission', procedure: procedureName || null,
        room: roomCharges || 0, ot: otCharges || 0, anesthesia: anesthesiaCharges || 0,
        consumable: consumableCharges || 0, implant: implantCharges || 0,
        pharmacy: pharmacyCharges || 0, lab: labCharges || 0, imaging: imagingCharges || 0,
        professional: professionalFees || 0, misc: miscCharges || 0,
        discount: discountAmount || 0, tax: taxAmount || 0,
        total: totalEstimate, insurance: insuranceCovered || 0, liability: patientLiability,
        notes: notes || null, by: preparedBy || null, validUntil: validUntil || null,
        data: JSON.stringify(estimateData || {})
      },
      type: QueryTypes.INSERT
    }
  );
  return result[0];
}

export async function getEstimatesByAdmission(admissionId) {
  return sequelize.query(
    `SELECT * FROM billing_estimates WHERE admission_id = :admId ORDER BY created_at DESC`,
    { replacements: { admId: admissionId }, type: QueryTypes.SELECT }
  );
}

export async function updateEstimateStatus(estimateId, status) {
  await sequelize.query(
    `UPDATE billing_estimates SET status = :status, updated_at = NOW() WHERE id = :id`,
    { replacements: { id: estimateId, status }, type: QueryTypes.UPDATE }
  );
  return { success: true };
}

// ── Non-payable items ─────────────────────────────────────────────────────────

export async function addNonPayableItem({ organizationId, admissionId, itemCategory, itemDescription, amount, reasonCode, approvedBy, notes }) {
  const [result] = await sequelize.query(
    `INSERT INTO non_payable_items (organization_id, admission_id, item_category, item_description, amount, reason_code, approved_by, notes)
     VALUES (:orgId, :admId, :category, :desc, :amount, :reason, :by, :notes)
     RETURNING *`,
    {
      replacements: {
        orgId: organizationId || null, admId: admissionId,
        category: itemCategory || null, desc: itemDescription,
        amount, reason: reasonCode || null, by: approvedBy || null, notes: notes || null
      },
      type: QueryTypes.INSERT
    }
  );
  return result[0];
}

export async function getNonPayableItems(admissionId) {
  return sequelize.query(
    `SELECT * FROM non_payable_items WHERE admission_id = :admId ORDER BY created_at DESC`,
    { replacements: { admId: admissionId }, type: QueryTypes.SELECT }
  );
}

// ── Sync OT consumables into estimate ────────────────────────────────────────

export async function syncOtConsumablesToEstimate(admissionId, estimateId, organizationId) {
  const [otBooking] = await sequelize.query(
    `SELECT id FROM ot_bookings WHERE admission_id = :admId ORDER BY created_at DESC LIMIT 1`,
    { replacements: { admId: admissionId }, type: QueryTypes.SELECT }
  ).catch(() => [null]);

  if (!otBooking) return { synced: false, reason: 'no_ot_booking' };

  const [row] = await sequelize.query(
    `SELECT
       COALESCE(SUM(unit_cost * quantity) FILTER (WHERE is_billable = TRUE AND item_code NOT LIKE 'IMP%'), 0) as consumable_total,
       COALESCE(SUM(unit_cost * quantity) FILTER (WHERE is_billable = TRUE AND item_code LIKE 'IMP%'), 0) as implant_total
     FROM procedure_consumables
     WHERE ot_booking_id = :bookingId`,
    { replacements: { bookingId: otBooking.id }, type: QueryTypes.SELECT }
  ).catch(() => [{ consumable_total: 0, implant_total: 0 }]);

  const implants = await sequelize.query(
    `SELECT COALESCE(SUM(unit_cost), 0) as implant_total FROM implant_records WHERE ot_booking_id = :bookingId AND is_billable = TRUE`,
    { replacements: { bookingId: otBooking.id }, type: QueryTypes.SELECT }
  ).catch(() => [{ implant_total: 0 }]);

  await sequelize.query(
    `UPDATE billing_estimates
     SET consumable_charges = :consumable, implant_charges = :implant, updated_at = NOW()
     WHERE id = :estId`,
    {
      replacements: {
        estId: estimateId,
        consumable: parseFloat(row?.consumable_total || 0),
        implant: parseFloat(row?.implant_total || 0) + parseFloat(implants[0]?.implant_total || 0)
      },
      type: QueryTypes.UPDATE
    }
  );

  return { synced: true, otBookingId: otBooking.id };
}
