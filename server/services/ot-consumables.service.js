/**
 * OT Consumables & Implants Service — Phase 3
 *
 * Tracks per-procedure consumable usage (scan-to-consume),
 * implant records with lot/serial tracing, and family
 * notification events for patient-status updates.
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';

async function ensureTables() {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS procedure_consumables (
      id                BIGSERIAL PRIMARY KEY,
      organization_id   BIGINT,
      ot_booking_id     BIGINT NOT NULL,
      admission_id      BIGINT,
      scanned_by        TEXT,
      item_code         TEXT,
      item_name         TEXT NOT NULL,
      category          TEXT,   -- suture | drape | syringe | electrosurgical | other
      quantity          NUMERIC(10,3) NOT NULL DEFAULT 1,
      unit              TEXT DEFAULT 'piece',
      unit_cost         NUMERIC(12,2),
      lot_number        TEXT,
      expiry_date       DATE,
      is_billable       BOOLEAN DEFAULT TRUE,
      notes             TEXT,
      scanned_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_consumables_booking ON procedure_consumables(ot_booking_id);

    CREATE TABLE IF NOT EXISTS implant_records (
      id                BIGSERIAL PRIMARY KEY,
      organization_id   BIGINT,
      ot_booking_id     BIGINT NOT NULL,
      admission_id      BIGINT,
      patient_id        BIGINT,
      recorded_by       TEXT,
      implant_name      TEXT NOT NULL,
      manufacturer      TEXT,
      model_number      TEXT,
      serial_number     TEXT,
      lot_number        TEXT,
      size_details      TEXT,
      implant_date      DATE,
      body_location     TEXT,
      unit_cost         NUMERIC(12,2),
      is_billable       BOOLEAN DEFAULT TRUE,
      notes             TEXT,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_implants_booking ON implant_records(ot_booking_id);
    CREATE INDEX IF NOT EXISTS idx_implants_patient ON implant_records(patient_id);

    CREATE TABLE IF NOT EXISTS family_notifications (
      id                BIGSERIAL PRIMARY KEY,
      organization_id   BIGINT,
      ot_booking_id     BIGINT NOT NULL,
      patient_id        BIGINT,
      notification_type TEXT NOT NULL,  -- patient_in | surgery_started | patient_out | recovery
      message           TEXT,
      sent_by           TEXT,
      channel           TEXT DEFAULT 'manual',  -- manual | sms | whatsapp | email
      sent_to           TEXT,
      sent_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_family_notif_booking ON family_notifications(ot_booking_id);
  `);
}
ensureTables().catch(e => console.warn('[ot-consumables] table init:', e.message));

// ── Consumable scanning ───────────────────────────────────────────────────────

export async function scanConsumable(data) {
  const {
    organizationId, otBookingId, admissionId, scannedBy,
    itemCode, itemName, category, quantity, unit, unitCost,
    lotNumber, expiryDate, isBillable, notes
  } = data;

  const [result] = await sequelize.query(
    `INSERT INTO procedure_consumables (
       organization_id, ot_booking_id, admission_id, scanned_by,
       item_code, item_name, category, quantity, unit, unit_cost,
       lot_number, expiry_date, is_billable, notes
     ) VALUES (
       :orgId, :bookingId, :admId, :by,
       :code, :name, :category, :qty, :unit, :cost,
       :lot, :expiry, :billable, :notes
     ) RETURNING *`,
    {
      replacements: {
        orgId: organizationId || null, bookingId: otBookingId, admId: admissionId || null,
        by: scannedBy || null, code: itemCode || null, name: itemName,
        category: category || null, qty: quantity || 1, unit: unit || 'piece',
        cost: unitCost || null, lot: lotNumber || null,
        expiry: expiryDate || null, billable: isBillable ?? true, notes: notes || null
      },
      type: QueryTypes.INSERT
    }
  );
  return result[0];
}

export async function getConsumablesByBooking(otBookingId) {
  return sequelize.query(
    `SELECT * FROM procedure_consumables WHERE ot_booking_id = :bookingId ORDER BY scanned_at`,
    { replacements: { bookingId: otBookingId }, type: QueryTypes.SELECT }
  );
}

// ── Implant records ───────────────────────────────────────────────────────────

export async function recordImplant(data) {
  const {
    organizationId, otBookingId, admissionId, patientId, recordedBy,
    implantName, manufacturer, modelNumber, serialNumber, lotNumber,
    sizeDetails, implantDate, bodyLocation, unitCost, isBillable, notes
  } = data;

  const [result] = await sequelize.query(
    `INSERT INTO implant_records (
       organization_id, ot_booking_id, admission_id, patient_id, recorded_by,
       implant_name, manufacturer, model_number, serial_number, lot_number,
       size_details, implant_date, body_location, unit_cost, is_billable, notes
     ) VALUES (
       :orgId, :bookingId, :admId, :patientId, :by,
       :name, :mfr, :model, :serial, :lot,
       :size, :date, :location, :cost, :billable, :notes
     ) RETURNING *`,
    {
      replacements: {
        orgId: organizationId || null, bookingId: otBookingId,
        admId: admissionId || null, patientId: patientId || null, by: recordedBy || null,
        name: implantName, mfr: manufacturer || null, model: modelNumber || null,
        serial: serialNumber || null, lot: lotNumber || null,
        size: sizeDetails || null, date: implantDate || null,
        location: bodyLocation || null, cost: unitCost || null,
        billable: isBillable ?? true, notes: notes || null
      },
      type: QueryTypes.INSERT
    }
  );
  return result[0];
}

export async function getImplantsByBooking(otBookingId) {
  return sequelize.query(
    `SELECT * FROM implant_records WHERE ot_booking_id = :bookingId ORDER BY created_at`,
    { replacements: { bookingId: otBookingId }, type: QueryTypes.SELECT }
  );
}

// ── Family notifications ──────────────────────────────────────────────────────

export async function sendFamilyNotification(data) {
  const {
    organizationId, otBookingId, patientId, notificationType,
    message, sentBy, channel, sentTo
  } = data;

  const [result] = await sequelize.query(
    `INSERT INTO family_notifications (
       organization_id, ot_booking_id, patient_id, notification_type,
       message, sent_by, channel, sent_to
     ) VALUES (
       :orgId, :bookingId, :patientId, :type,
       :msg, :by, :channel, :to
     ) RETURNING *`,
    {
      replacements: {
        orgId: organizationId || null, bookingId: otBookingId, patientId: patientId || null,
        type: notificationType, msg: message || null, by: sentBy || null,
        channel: channel || 'manual', to: sentTo || null
      },
      type: QueryTypes.INSERT
    }
  );
  return result[0];
}

export async function getFamilyNotifications(otBookingId) {
  return sequelize.query(
    `SELECT * FROM family_notifications WHERE ot_booking_id = :bookingId ORDER BY sent_at`,
    { replacements: { bookingId: otBookingId }, type: QueryTypes.SELECT }
  );
}

// ── Operative note (summary for billing) ─────────────────────────────────────

export async function getOperativeSummary(otBookingId) {
  const [booking] = await sequelize.query(
    `SELECT ob.*, p.first_name || ' ' || p.last_name as patient_name
     FROM ot_bookings ob
     LEFT JOIN patients p ON p.id = ob.patient_id
     WHERE ob.id = :bookingId LIMIT 1`,
    { replacements: { bookingId: otBookingId }, type: QueryTypes.SELECT }
  ).catch(() => [null]);

  const consumables = await getConsumablesByBooking(otBookingId);
  const implants = await getImplantsByBooking(otBookingId);
  const notifications = await getFamilyNotifications(otBookingId);

  const consumableTotal = consumables.reduce((sum, c) => sum + (parseFloat(c.unit_cost || 0) * parseFloat(c.quantity || 1)), 0);
  const implantTotal = implants.reduce((sum, i) => sum + parseFloat(i.unit_cost || 0), 0);

  return {
    booking: booking || null,
    consumables,
    consumableTotal,
    implants,
    implantTotal,
    estimatedCharges: consumableTotal + implantTotal,
    familyNotifications: notifications
  };
}
