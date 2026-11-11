/**
 * Consent Enforcement Service — B7
 *
 * Checks that signed, valid consent exists before allowing
 * pathway-critical actions: OT booking, OT incision, high-alert
 * medication administration, and discharge summary signing.
 *
 * Returns { allowed: true } or throws a descriptive error that
 * calling routes can surface as 403.
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';

import { schemaVerifier } from '../utils/schema-guard.js';

const SCHEMA_TABLES = ['consent_enforcement_log', 'consents'];

// A consent gate must not fail open. If the table is absent the service says
// so with SCHEMA_NOT_MIGRATED rather than erroring in a way a caller might
// mistake for "no consent restriction recorded".
const ensureTables = schemaVerifier({
  sequelize,
  tables: SCHEMA_TABLES,
  code: 'SCHEMA_NOT_MIGRATED',
  message: 'Apply migration 20260526000001-create-hmis-phase3-5-tables before enforcing consent',
});
// Roles that can override consent checks (emergency/clinical authority)
const CONSENT_OVERRIDE_ROLES = new Set([
  'admin', 'super_admin', 'medical_director', 'surgeon', 'anesthetist', 'ot_head'
]);

// Schema is provisioned by the consent-enforcement migration.


async function logCheck({ organizationId, patientId, action, consentType, consentId, status, overrideBy, overrideRole, overrideReason, context }) {
  await sequelize.query(
    `INSERT INTO consent_enforcement_log
       (organization_id, patient_id, action, consent_type, consent_id, status, override_by, override_role, override_reason, context)
     VALUES
       (:orgId, :patientId, :action, :type, :consentId, :status, :by, :role, :reason, :ctx::jsonb)`,
    {
      replacements: {
        orgId: organizationId || null, patientId, action, type: consentType,
        consentId: consentId || null, status,
        by: overrideBy || null, role: overrideRole || null, reason: overrideReason || null,
        ctx: JSON.stringify(context || {})
      },
      type: QueryTypes.INSERT
    }
  ).catch(() => {}); // non-blocking audit log
}

async function findActiveConsent(patientId, consentType, extra = {}) {
  let where = `patient_id = :patientId AND consent_type = :type AND status = 'signed' AND (expires_at IS NULL OR expires_at > NOW())`;
  const replacements = { patientId, type: consentType };

  if (extra.procedureName) {
    where += ` AND (procedure_name IS NULL OR LOWER(procedure_name) = LOWER(:procedure))`;
    replacements.procedure = extra.procedureName;
  }

  const [row] = await sequelize.query(
    `SELECT id, consent_type, signed_at, expires_at FROM consents WHERE ${where} ORDER BY signed_at DESC LIMIT 1`,
    { replacements, type: QueryTypes.SELECT }
  ).catch(() => [null]);

  return row || null;
}

// ── Core enforcement function ─────────────────────────────────────────────────

async function enforceConsent({ organizationId, patientId, action, consentType, procedureName, override }) {
  const consent = await findActiveConsent(patientId, consentType, { procedureName });

  if (consent) {
    await logCheck({ organizationId, patientId, action, consentType, consentId: consent.id, status: 'allowed' });
    return { allowed: true, consentId: consent.id };
  }

  // No signed consent found — check for override
  if (override) {
    const { approverId, approverRole, reason } = override;
    if (!CONSENT_OVERRIDE_ROLES.has(approverRole)) {
      await logCheck({ organizationId, patientId, action, consentType, status: 'blocked', context: { reason: 'unauthorized_override_role', approverRole } });
      throw Object.assign(
        new Error(`Consent check failed for ${action}: no signed ${consentType} consent. Override role '${approverRole}' is not authorized.`),
        { consentBlocked: true, consentType, action }
      );
    }
    await logCheck({
      organizationId, patientId, action, consentType, status: 'override',
      overrideBy: approverId, overrideRole: approverRole, overrideReason: reason,
      context: { procedureName }
    });
    return { allowed: true, overrideApplied: true, approverRole };
  }

  await logCheck({ organizationId, patientId, action, consentType, status: 'blocked', context: { procedureName } });
  throw Object.assign(
    new Error(`Consent check failed: no signed '${consentType}' consent found for patient ${patientId}. Action '${action}' is blocked.`),
    { consentBlocked: true, consentType, action }
  );
}

// ── Public enforcement checkpoints ────────────────────────────────────────────

/**
 * OT booking — requires signed 'treatment' consent.
 * Skip for emergency bookings.
 */
export async function enforceOTBookingConsent({ organizationId, patientId, procedureName, admissionType, override }) {
  await ensureTables();
  if (admissionType === 'emergency') return { allowed: true, skipped: 'emergency' };
  return enforceConsent({ organizationId, patientId, action: 'ot_booking', consentType: 'treatment', procedureName, override });
}

/**
 * OT incision — requires signed 'procedure_specific' or 'treatment' consent.
 * Skip for emergency OT.
 */
export async function enforceOTIncisionConsent({ organizationId, patientId, procedureName, isEmergency, override }) {
  await ensureTables();
  if (isEmergency) return { allowed: true, skipped: 'emergency' };
  // Try procedure_specific first, fall back to treatment
  const specific = await findActiveConsent(patientId, 'procedure_specific', { procedureName });
  if (specific) {
    await logCheck({ organizationId, patientId, action: 'ot_incision', consentType: 'procedure_specific', consentId: specific.id, status: 'allowed' });
    return { allowed: true, consentId: specific.id };
  }
  return enforceConsent({ organizationId, patientId, action: 'ot_incision', consentType: 'treatment', procedureName, override });
}

/**
 * Anesthesia — requires signed 'anesthesia' consent.
 * Skip for emergency.
 */
export async function enforceAnesthesiaConsent({ organizationId, patientId, isEmergency, override }) {
  await ensureTables();
  if (isEmergency) return { allowed: true, skipped: 'emergency' };
  return enforceConsent({ organizationId, patientId, action: 'anesthesia_start', consentType: 'anesthesia', override });
}

/**
 * High-alert medication — requires signed 'treatment' consent.
 */
export async function enforceHighAlertMedConsent({ organizationId, patientId, drugName, override }) {
  await ensureTables();
  return enforceConsent({
    organizationId, patientId,
    action: `high_alert_medication:${drugName}`,
    consentType: 'treatment',
    override
  });
}

/**
 * Discharge summary signing — requires signed 'treatment' consent.
 */
export async function enforceDischargeSignConsent({ organizationId, patientId, override }) {
  await ensureTables();
  return enforceConsent({ organizationId, patientId, action: 'discharge_sign', consentType: 'treatment', override });
}

// ── Audit query ───────────────────────────────────────────────────────────────

export async function getConsentEnforcementLog(patientId, { limit = 50 } = {}) {
  await ensureTables();
  return sequelize.query(
    `SELECT * FROM consent_enforcement_log WHERE patient_id = :patientId ORDER BY checked_at DESC LIMIT :limit`,
    { replacements: { patientId, limit }, type: QueryTypes.SELECT }
  );
}

// Named export for generic use by routes
export { enforceConsent };
