/**
 * OT Consumables & Implants Service — Phase 3
 *
 * Tracks per-procedure consumable usage (scan-to-consume),
 * implant records with lot/serial tracing, and family
 * notification events for patient-status updates.
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';

import { schemaVerifier } from '../utils/schema-guard.js';
const SCHEMA_TABLES = ['procedure_consumables', 'implant_records', 'family_notifications'];

// Schema is owned by the migration, not created here. A missing table
// fails closed with SCHEMA_NOT_MIGRATED naming what to apply, instead of
// this service quietly building a table the migration never shaped.
const ensureTables = schemaVerifier({
  sequelize: sequelize,
  tables: SCHEMA_TABLES,
  code: 'SCHEMA_NOT_MIGRATED',
  message: 'Apply migration 20261015003200-ot-consumables-governance before using OT consumables',
});

// ── Consumable scanning ───────────────────────────────────────────────────────

export async function scanConsumable(data) {
  await ensureTables();
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
  await ensureTables();
  return sequelize.query(
    `SELECT * FROM procedure_consumables WHERE ot_booking_id = :bookingId ORDER BY scanned_at`,
    { replacements: { bookingId: otBookingId }, type: QueryTypes.SELECT }
  );
}

// ── Implant records ───────────────────────────────────────────────────────────

export async function recordImplant(data) {
  await ensureTables();
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
  await ensureTables();
  return sequelize.query(
    `SELECT * FROM implant_records WHERE ot_booking_id = :bookingId ORDER BY created_at`,
    { replacements: { bookingId: otBookingId }, type: QueryTypes.SELECT }
  );
}

// ── Family notifications ──────────────────────────────────────────────────────

export async function sendFamilyNotification(data) {
  await ensureTables();
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
  await ensureTables();
  return sequelize.query(
    `SELECT * FROM family_notifications WHERE ot_booking_id = :bookingId ORDER BY sent_at`,
    { replacements: { bookingId: otBookingId }, type: QueryTypes.SELECT }
  );
}

// ── Operative note (summary for billing) ─────────────────────────────────────

export async function getOperativeSummary(otBookingId) {
  await ensureTables();
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
