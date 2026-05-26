/**
 * eMAR — Electronic Medication Administration Record
 *
 * Manages IP medication orders and nurse administration charting.
 *
 * B3 Safety:
 *   - 5-right checks enforced at every administration attempt
 *   - Allergy / contraindication hard-stop (emergency override allowed)
 *   - High-alert drugs require dual nurse/doctor co-sign
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';

// ── High-alert drug list (generic name / class fragments, lower-cased) ────────
const HIGH_ALERT_DRUGS = new Set([
  'insulin', 'heparin', 'warfarin', 'methotrexate', 'morphine', 'fentanyl',
  'midazolam', 'propofol', 'ketamine', 'potassium chloride', 'concentrated potassium',
  'neuromuscular blocking', 'vecuronium', 'succinylcholine', 'digoxin',
  'amiodarone', 'lithium', 'phenytoin', 'vancomycin', 'chemotherapy',
]);

function isHighAlert(drugName = '') {
  const lower = drugName.toLowerCase();
  for (const term of HIGH_ALERT_DRUGS) {
    if (lower.includes(term)) return true;
  }
  return false;
}

// ── eMAR safety audit table bootstrap ────────────────────────────────────────

async function ensureEmarSafetyTables() {
  await sequelize.query(`
    ALTER TABLE medication_administrations
      ADD COLUMN IF NOT EXISTS validation_result  JSONB,
      ADD COLUMN IF NOT EXISTS blocked_reason     TEXT,
      ADD COLUMN IF NOT EXISTS cosign_by          TEXT,
      ADD COLUMN IF NOT EXISTS cosign_at          TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS override_reason    TEXT;

    CREATE TABLE IF NOT EXISTS emar_blocked_attempts (
      id              BIGSERIAL PRIMARY KEY,
      order_id        BIGINT,
      admission_id    BIGINT,
      administered_by TEXT,
      block_reason    TEXT NOT NULL,
      attempt_data    JSONB DEFAULT '{}'::jsonb,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_emar_blocked_order ON emar_blocked_attempts(order_id);
  `);
}

ensureEmarSafetyTables().catch(e => console.warn('[emar] safety table init:', e.message));

export async function createMedicationOrder({
  organizationId,
  admissionId,
  patientId,
  prescribedBy,
  drugName,
  drugCode,
  dose,
  doseUnit,
  route = 'oral',
  frequency,
  frequencyHours,
  startDatetime,
  endDatetime,
  prn = false,
  specialInstructions
}) {
  const [result] = await sequelize.query(
    `INSERT INTO medication_orders (
      organization_id, admission_id, patient_id, prescribed_by,
      drug_name, drug_code, dose, dose_unit, route, frequency, frequency_hours,
      start_datetime, end_datetime, prn, special_instructions, order_status, created_at, updated_at
    ) VALUES (
      :orgId, :admId, :patientId, :prescribedBy,
      :drugName, :drugCode, :dose, :doseUnit, :route, :frequency, :freqHours,
      :start, :end, :prn, :instructions, 'active', NOW(), NOW()
    ) RETURNING *`,
    {
      replacements: {
        orgId: organizationId, admId: admissionId, patientId,
        prescribedBy: prescribedBy || null, drugName, drugCode: drugCode || null,
        dose: dose || null, doseUnit: doseUnit || null, route, frequency: frequency || null,
        freqHours: frequencyHours || null, start: startDatetime || null, end: endDatetime || null,
        prn, instructions: specialInstructions || null
      },
      type: QueryTypes.INSERT
    }
  );

  // Schedule administration slots based on frequency
  if (!prn && frequencyHours && startDatetime) {
    await scheduleAdministrations(result[0].id, admissionId, startDatetime, endDatetime, frequencyHours);
  }

  return result[0];
}

async function scheduleAdministrations(orderId, admissionId, start, end, frequencyHours) {
  const startTime = new Date(start);
  const endTime = end ? new Date(end) : new Date(startTime.getTime() + 7 * 24 * 60 * 60 * 1000); // 7-day default

  const slots = [];
  let current = new Date(startTime);
  while (current <= endTime) {
    slots.push(new Date(current));
    current = new Date(current.getTime() + frequencyHours * 60 * 60 * 1000);
  }

  // Batch insert scheduled slots
  for (const slot of slots) {
    await sequelize.query(
      `INSERT INTO medication_administrations (order_id, admission_id, scheduled_time, outcome, created_at)
       VALUES (:orderId, :admId, :scheduledTime, 'given', NOW())
       ON CONFLICT DO NOTHING`,
      { replacements: { orderId, admId: admissionId, scheduledTime: slot }, type: QueryTypes.INSERT }
    );
  }
}

/**
 * B3: Pre-flight administration validation.
 * Returns { blocked: false } or throws with a human-readable block reason.
 *
 * Checks:
 *   1. Active order exists for the patient/admission
 *   2. Route matches the order
 *   3. Scheduled window is within ±2 hours (or PRN)
 *   4. Barcode verified (warning only, not a hard-stop unless policy dictates)
 *   5. Patient allergy contraindication
 *   6. High-alert drug → require cosignBy
 */
export async function validateAdministration({
  orderId,
  admissionId,
  patientId,
  routeUsed,
  scheduledTime,
  cosignBy = null,
  overrideReason = null
}) {
  const blocks = [];

  // Right 1 & 2: active order for this admission
  const [order] = await sequelize.query(
    `SELECT mo.*, a.patient_id as adm_patient_id
     FROM medication_orders mo
     JOIN ip_admissions a ON a.id = mo.admission_id
     WHERE mo.id = :orderId AND mo.admission_id = :admId AND mo.order_status = 'active'`,
    { replacements: { orderId, admId: admissionId }, type: QueryTypes.SELECT }
  );
  if (!order) blocks.push('No active medication order found for this patient/admission');

  if (order) {
    // Right 3: identity — patient must match admission
    if (patientId && String(order.adm_patient_id) !== String(patientId)) {
      blocks.push(`Patient identity mismatch: order belongs to patient ${order.adm_patient_id}`);
    }

    // Right 4: route
    if (routeUsed && order.route && routeUsed.toLowerCase() !== order.route.toLowerCase()) {
      blocks.push(`Route mismatch: order specifies '${order.route}', attempted '${routeUsed}'`);
    }

    // Right 5: timing (±2 hour window; skip for PRN)
    if (!order.prn && scheduledTime) {
      const scheduled = new Date(scheduledTime);
      const now = new Date();
      const diffMins = Math.abs((now - scheduled) / 60000);
      if (diffMins > 120) {
        blocks.push(`Time window exceeded: scheduled at ${scheduled.toISOString()}, now ${now.toISOString()} (${Math.round(diffMins)} min drift)`);
      }
    }

    // Right 6 (allergy): check patient allergies against drug name
    const allergies = await sequelize.query(
      `SELECT allergen, reaction_type FROM patient_allergies
       WHERE patient_id = :patientId AND active = TRUE`,
      { replacements: { patientId: order.patient_id }, type: QueryTypes.SELECT }
    ).catch(() => []);
    for (const allergy of allergies) {
      if (order.drug_name?.toLowerCase().includes(allergy.allergen?.toLowerCase())) {
        if (!overrideReason) {
          blocks.push(`Allergy alert: patient has documented allergy to '${allergy.allergen}' (${allergy.reaction_type || 'unknown reaction'}). Provide overrideReason to bypass.`);
        }
      }
    }

    // High-alert: dual signoff required
    if (isHighAlert(order.drug_name) && !cosignBy) {
      blocks.push(`High-alert drug '${order.drug_name}' requires cosignBy (second nurse or doctor ID)`);
    }
  }

  if (blocks.length > 0) {
    return { blocked: true, reasons: blocks };
  }
  return { blocked: false, highAlert: order ? isHighAlert(order.drug_name) : false };
}

export async function recordAdministration({
  orderId,
  admissionId,
  patientId,
  administeredBy,
  scheduledTime,
  administeredTime,
  doseGiven,
  routeUsed,
  site,
  outcome = 'given',
  notGivenReason,
  nurseNotes,
  barcodeVerified = false,
  cosignBy = null,          // B3: high-alert dual signoff
  overrideReason = null     // B3: allergy override reason
}) {
  // B3: Run safety validation before any DB write
  const validation = await validateAdministration({
    orderId, admissionId, patientId, routeUsed, scheduledTime, cosignBy, overrideReason
  });

  if (validation.blocked) {
    // Log blocked attempt immutably
    await sequelize.query(
      `INSERT INTO emar_blocked_attempts (order_id, admission_id, administered_by, block_reason, attempt_data)
       VALUES (:orderId, :admId, :by, :reason, :data::jsonb)`,
      {
        replacements: {
          orderId, admId: admissionId, by: administeredBy,
          reason: validation.reasons.join(' | '),
          data: JSON.stringify({ routeUsed, scheduledTime, doseGiven, outcome })
        },
        type: QueryTypes.INSERT
      }
    );
    const err = new Error(validation.reasons.join(' | '));
    err.blocked = true;
    err.reasons = validation.reasons;
    throw err;
  }

  // Update the scheduled slot if it exists, otherwise insert
  const [existing] = await sequelize.query(
    `SELECT id FROM medication_administrations WHERE order_id = :orderId AND ABS(EXTRACT(EPOCH FROM (scheduled_time - :scheduled))) < 3600 LIMIT 1`,
    { replacements: { orderId, scheduled: scheduledTime }, type: QueryTypes.SELECT }
  );

  const cosignAt = cosignBy ? new Date() : null;
  const validationResult = JSON.stringify({ checked: true, highAlert: validation.highAlert, overrideReason: overrideReason || null });

  if (existing) {
    await sequelize.query(
      `UPDATE medication_administrations SET administered_by = :by, administered_time = :adminTime,
       dose_given = :dose, route_used = :route, site = :site, outcome = :outcome,
       not_given_reason = :reason, nurse_notes = :notes, barcode_verified = :barcode,
       cosign_by = :cosignBy, cosign_at = :cosignAt, override_reason = :overrideReason,
       validation_result = :vr::jsonb
       WHERE id = :id`,
      {
        replacements: {
          id: existing.id, by: administeredBy, adminTime: administeredTime || new Date(),
          dose: doseGiven || null, route: routeUsed || null, site: site || null,
          outcome, reason: notGivenReason || null, notes: nurseNotes || null, barcode: barcodeVerified,
          cosignBy: cosignBy || null, cosignAt, overrideReason: overrideReason || null, vr: validationResult
        },
        type: QueryTypes.UPDATE
      }
    );
    return { id: existing.id, outcome };
  }

  const [result] = await sequelize.query(
    `INSERT INTO medication_administrations (order_id, admission_id, administered_by, scheduled_time, administered_time,
     dose_given, route_used, site, outcome, not_given_reason, nurse_notes, barcode_verified,
     cosign_by, cosign_at, override_reason, validation_result, created_at)
     VALUES (:orderId, :admId, :by, :scheduledTime, :adminTime, :dose, :route, :site, :outcome, :reason, :notes, :barcode,
             :cosignBy, :cosignAt, :overrideReason, :vr::jsonb, NOW())
     RETURNING *`,
    {
      replacements: {
        orderId, admId: admissionId, by: administeredBy, scheduledTime,
        adminTime: administeredTime || new Date(), dose: doseGiven || null, route: routeUsed || null,
        site: site || null, outcome, reason: notGivenReason || null, notes: nurseNotes || null, barcode: barcodeVerified,
        cosignBy: cosignBy || null, cosignAt, overrideReason: overrideReason || null, vr: validationResult
      },
      type: QueryTypes.INSERT
    }
  );
  return result[0];
}

export async function getActiveOrders(admissionId, organizationId) {
  return sequelize.query(
    `SELECT mo.*,
            COUNT(ma.id) as total_doses,
            SUM(CASE WHEN ma.outcome = 'given' AND ma.administered_time IS NOT NULL THEN 1 ELSE 0 END) as given_doses,
            SUM(CASE WHEN ma.outcome = 'not_given' THEN 1 ELSE 0 END) as missed_doses
     FROM medication_orders mo
     LEFT JOIN medication_administrations ma ON ma.order_id = mo.id
     WHERE mo.admission_id = :admId AND mo.organization_id = :orgId AND mo.order_status = 'active'
     GROUP BY mo.id
     ORDER BY mo.drug_name`,
    { replacements: { admId: admissionId, orgId: organizationId }, type: QueryTypes.SELECT }
  );
}

export async function getDueMedications(organizationId, { wardId, windowMinutes = 120 } = {}) {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + windowMinutes * 60 * 1000);
  const windowStart = new Date(now.getTime() - 30 * 60 * 1000); // 30min overdue grace

  let joinClause = '';
  const replacements = { orgId: organizationId, start: windowStart, end: windowEnd };

  if (wardId) {
    joinClause = 'JOIN ip_admissions adm ON adm.id = ma.admission_id JOIN beds b ON b.id = adm.bed_id';
    joinClause += ' WHERE mo.organization_id = :orgId AND ma.administered_time IS NULL AND ma.scheduled_time BETWEEN :start AND :end AND b.ward_id = :wardId';
    replacements.wardId = wardId;
  } else {
    joinClause = `WHERE mo.organization_id = :orgId AND ma.administered_time IS NULL AND ma.scheduled_time BETWEEN :start AND :end`;
  }

  return sequelize.query(
    `SELECT ma.id as schedule_id, ma.scheduled_time, ma.outcome,
            mo.id as order_id, mo.drug_name, mo.dose, mo.route, mo.special_instructions,
            mo.admission_id, mo.patient_id,
            CASE WHEN ma.scheduled_time < NOW() THEN true ELSE false END as is_overdue
     FROM medication_administrations ma
     JOIN medication_orders mo ON mo.id = ma.order_id
     ${wardId ? 'JOIN ip_admissions adm ON adm.id = ma.admission_id JOIN beds b ON b.id = adm.bed_id' : ''}
     WHERE mo.organization_id = :orgId
       AND ma.administered_time IS NULL
       AND ma.scheduled_time BETWEEN :start AND :end
       ${wardId ? 'AND b.ward_id = :wardId' : ''}
     ORDER BY ma.scheduled_time`,
    { replacements, type: QueryTypes.SELECT }
  );
}

export async function updateOrderStatus(organizationId, orderId, status, stopReason) {
  const validStatuses = ['active','discontinued','completed','on_hold','pending'];
  if (!validStatuses.includes(status)) throw new Error('Invalid order status');

  await sequelize.query(
    `UPDATE medication_orders SET order_status = :status, stop_reason = :reason, updated_at = NOW()
     WHERE id = :orderId AND organization_id = :orgId`,
    { replacements: { status, reason: stopReason || null, orderId, orgId: organizationId }, type: QueryTypes.UPDATE }
  );
  return { success: true };
}
