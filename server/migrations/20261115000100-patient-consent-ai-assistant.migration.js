/**
 * Adds AI_ASSISTANT to patient_consents.consent_type (audit M22).
 *
 * Using the AI health assistant sends the member's questions — health data —
 * to AI providers, which is a purpose of its own under the DPDP Act and needs
 * its own consent, separate from AI_TRAINING (using data to train models).
 * services/patient-consent.service.js records it; the assistant is gated on it
 * once AI_CONSENT_REQUIRED=true.
 *
 * Widening a CHECK list: existing rows all satisfy the new constraint, so the
 * swap is safe in one transaction.
 */
import pool from '../db/pgPool.js';

const TYPES = ['DATA_PROCESSING', 'SENSITIVE_DATA', 'TELEMEDICINE', 'RESEARCH', 'MARKETING',
  'DATA_SHARING', 'AI_TRAINING', 'ABHA_LINKING', 'EMERGENCY_OVERRIDE'];

const check = (types) => `CHECK (consent_type::text = ANY (ARRAY[${types.map((t) => `'${t}'`).join(', ')}]))`;

export async function up(db = pool) {
  await db.query(`
    ALTER TABLE patient_consents DROP CONSTRAINT IF EXISTS patient_consents_consent_type_check;
    ALTER TABLE patient_consents ADD CONSTRAINT patient_consents_consent_type_check ${check([...TYPES, 'AI_ASSISTANT'])};
  `);
}

export async function down(db = pool) {
  await db.query(`
    DELETE FROM patient_consents WHERE consent_type = 'AI_ASSISTANT';
    ALTER TABLE patient_consents DROP CONSTRAINT IF EXISTS patient_consents_consent_type_check;
    ALTER TABLE patient_consents ADD CONSTRAINT patient_consents_consent_type_check ${check(TYPES)};
  `);
}

export default { up, down };
