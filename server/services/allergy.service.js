/**
 * Allergy service (WP-1.1) — the ONE place allergies are read and written.
 *
 * Status of a patient's allergies is one of:
 *   known               at least one active allergy is recorded
 *   no_known_allergy    a clinician explicitly recorded "no known allergy" (and nothing active contradicts it)
 *   unknown             nothing recorded: NEVER treated as safe
 * A failed lookup throws; callers must treat that as "unknown / cannot check", never as "no allergies".
 *
 * patient_allergies is protected by FORCE row-level security (organization OR own user). Every call here runs in a
 * transaction that sets that context first; without it the application role sees zero rows.
 *
 * Identity: allergies are keyed by users.id. Admissions and medication orders carry the user id as patient_id in
 * production (verified against ip_admissions), so resolvePatientKey() is the single place that mapping lives; if a second
 * id space has to be bridged later it is bridged here and nowhere else.
 */
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';
import { setRlsContext } from '../middleware/rls-context.middleware.js';

export class AllergyError extends Error {
  constructor(message, status = 400, code = 'ALLERGY_ERROR') { super(message); this.status = status; this.code = code; }
}

const ALLERGEN_TYPES = ['drug', 'food', 'environmental', 'latex', 'contrast', 'other'];
const SEVERITIES = ['MILD', 'MODERATE', 'SEVERE', 'LIFE_THREATENING', 'UNKNOWN'];

export function resolvePatientKey(patientId) {
  const n = Number(patientId);
  if (!Number.isInteger(n) || n <= 0) throw new AllergyError('A valid patient id is required');
  return n;
}

async function inPatientContext(patientId, organizationId, work) {
  const userId = resolvePatientKey(patientId);
  return sequelize.transaction(async (transaction) => {
    await setRlsContext(transaction, { orgId: organizationId || 0, userId, isPlatformAdmin: false });
    const q = (sql, replacements = {}) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT, transaction });
    const exec = (sql, replacements = {}) => sequelize.query(sql, { replacements, transaction });
    return work({ q, exec, userId });
  });
}

/** Summarise raw rows into a status and the list of active allergies (pure; exported for tests). */
export function summariseAllergies(rows) {
  const live = rows.filter((r) => r.status !== 'entered_in_error');
  const active = live.filter((r) => (r.status || 'active') === 'active');
  if (active.length) return { status: 'known', allergies: active, noKnownAllergy: false };
  const nka = live.find((r) => r.status === 'no_known_allergy');
  if (nka) return { status: 'no_known_allergy', allergies: [], noKnownAllergy: true, recordedAt: nka.created_at };
  return { status: 'unknown', allergies: [], noKnownAllergy: false };
}

export async function getAllergyStatus(patientId, organizationId = null) {
  const rows = await inPatientContext(patientId, organizationId, ({ q, userId }) =>
    q(`SELECT id, allergen_name, allergen_type, allergen_code, drug_class, reaction_type, severity, verified, status, source, created_at
         FROM patient_allergies WHERE user_id = :userId ORDER BY created_at`, { userId }));
  return summariseAllergies(rows);
}

export async function listAllergies(patientId, organizationId = null, { includeInactive = false } = {}) {
  return inPatientContext(patientId, organizationId, ({ q, userId }) =>
    q(`SELECT * FROM patient_allergies WHERE user_id = :userId ${includeInactive ? '' : `AND status IN ('active','no_known_allergy')`} ORDER BY created_at DESC`, { userId }));
}

export async function addAllergy({ patientId, organizationId = null, allergenName, allergenType = 'drug', drugClass = null, severity = 'UNKNOWN', reaction = null, notes = null, enteredBy = null, verified = false, source = 'clinician' }) {
  const name = String(allergenName ?? '').trim();
  if (!name) throw new AllergyError('allergenName is required');
  if (!ALLERGEN_TYPES.includes(allergenType)) throw new AllergyError(`allergenType must be one of: ${ALLERGEN_TYPES.join(', ')}`);
  const sev = String(severity || 'UNKNOWN').toUpperCase();
  if (!SEVERITIES.includes(sev)) throw new AllergyError(`severity must be one of: ${SEVERITIES.join(', ')}`);
  return inPatientContext(patientId, organizationId, async ({ q, exec, userId }) => {
    const dup = await q(`SELECT id FROM patient_allergies WHERE user_id = :userId AND lower(allergen_name) = lower(:name) AND status = 'active'`, { userId, name });
    if (dup[0]) throw new AllergyError('That allergy is already recorded', 409, 'ALLERGY_EXISTS');
    // A recorded allergy contradicts an earlier "no known allergy": retire it so the status reads 'known'.
    await exec(`UPDATE patient_allergies SET status = 'inactive', updated_at = NOW() WHERE user_id = :userId AND status = 'no_known_allergy'`, { userId });
    const [row] = await q(
      `INSERT INTO patient_allergies (user_id, organization_id, allergen_name, allergen_type, drug_class, severity, reaction_type, notes, entered_by, verified, verified_at, source, status)
       VALUES (:userId, :org, :name, :type, :drugClass, :sev, :reaction, :notes, :by, :verified, CASE WHEN :verified THEN NOW() END, :source, 'active') RETURNING *`,
      { userId, org: organizationId, name: name.slice(0, 200), type: allergenType, drugClass, sev, reaction, notes, by: enteredBy, verified: Boolean(verified), source });
    return row;
  });
}

/** Explicit "no known allergy". Refused while an active allergy exists. */
export async function recordNoKnownAllergy({ patientId, organizationId = null, enteredBy = null }) {
  return inPatientContext(patientId, organizationId, async ({ q, userId }) => {
    const active = await q(`SELECT 1 FROM patient_allergies WHERE user_id = :userId AND status = 'active' LIMIT 1`, { userId });
    if (active[0]) throw new AllergyError('The patient has active allergies; they cannot also have no known allergy', 409, 'ALLERGY_EXISTS');
    const existing = await q(`SELECT * FROM patient_allergies WHERE user_id = :userId AND status = 'no_known_allergy' LIMIT 1`, { userId });
    if (existing[0]) return existing[0];
    const [row] = await q(
      `INSERT INTO patient_allergies (user_id, organization_id, allergen_name, allergen_type, severity, entered_by, verified, verified_at, source, status)
       VALUES (:userId, :org, 'No known allergy', 'other', 'UNKNOWN', :by, true, NOW(), 'clinician', 'no_known_allergy') RETURNING *`,
      { userId, org: organizationId, by: enteredBy });
    return row;
  });
}

export async function setAllergyStatus({ patientId, organizationId = null, allergyId, status, reason = null, by = null }) {
  if (!['inactive', 'entered_in_error', 'active'].includes(status)) throw new AllergyError('status must be inactive, entered_in_error or active');
  return inPatientContext(patientId, organizationId, async ({ q, userId }) => {
    const rows = await q(
      `UPDATE patient_allergies SET status = :status, notes = CASE WHEN :reason::text IS NULL THEN notes ELSE COALESCE(notes || E'\\n', '') || :reason END, updated_at = NOW()
       WHERE id = :allergyId AND user_id = :userId RETURNING *`,
      { status, reason: reason ? `[${status} by ${by ?? 'unknown'}] ${reason}` : null, allergyId, userId });
    return rows[0];
  });
}
