/**
 * Structured problem list (WP-1.1) on patient_conditions. Diagnoses recorded here feed the drug-condition and pregnancy
 * checks in prescription-safety.service. Runs in the patient's row-level-security context like allergy.service.
 */
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';
import { setRlsContext } from '../middleware/rls-context.middleware.js';
import { AllergyError, resolvePatientKey } from './allergy.service.js';

const STATUSES = ['ACTIVE', 'RESOLVED', 'REMISSION', 'MONITORING', 'UNKNOWN'];
const TYPES = ['chronic', 'acute', 'episodic', 'genetic', 'unknown'];

async function inPatientContext(patientId, organizationId, work) {
  const userId = resolvePatientKey(patientId);
  return sequelize.transaction(async (transaction) => {
    await setRlsContext(transaction, { orgId: organizationId || 0, userId, isPlatformAdmin: false });
    const q = (sql, replacements = {}) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT, transaction });
    return work({ q, userId });
  });
}

export const listProblems = (patientId, organizationId = null, { includeResolved = false } = {}) =>
  inPatientContext(patientId, organizationId, ({ q, userId }) =>
    q(`SELECT * FROM patient_conditions WHERE user_id = :userId ${includeResolved ? '' : `AND status IN ('ACTIVE','MONITORING','REMISSION','UNKNOWN')`} ORDER BY created_at DESC`, { userId }));

export async function addProblem({ patientId, organizationId = null, conditionName, icd10Code = null, snomedCode = null, conditionType = 'chronic', severity = null, onsetDate = null, notes = null, notedBy = null, encounterId = null }) {
  const name = String(conditionName ?? '').trim();
  if (!name) throw new AllergyError('conditionName is required');
  if (!TYPES.includes(conditionType)) throw new AllergyError(`conditionType must be one of: ${TYPES.join(', ')}`);
  return inPatientContext(patientId, organizationId, async ({ q, userId }) => {
    const dup = await q(`SELECT id FROM patient_conditions WHERE user_id = :userId AND lower(condition_name) = lower(:name) AND status IN ('ACTIVE','MONITORING')`, { userId, name });
    if (dup[0]) throw new AllergyError('That problem is already on the list', 409, 'PROBLEM_EXISTS');
    const [row] = await q(
      `INSERT INTO patient_conditions (user_id, organization_id, condition_name, icd10_code, snomed_code, condition_type, severity, onset_date, notes, noted_by, source_encounter_id, status, source)
       VALUES (:userId, :org, :name, :icd, :snomed, :type, :severity, :onset, :notes, :by, :enc, 'ACTIVE', 'clinician') RETURNING *`,
      { userId, org: organizationId, name: name.slice(0, 250), icd: icd10Code, snomed: snomedCode, type: conditionType, severity, onset: onsetDate, notes, by: notedBy, enc: encounterId });
    return row;
  });
}

export async function updateProblem({ patientId, organizationId = null, problemId, status, notes, severity }) {
  if (status && !STATUSES.includes(status)) throw new AllergyError(`status must be one of: ${STATUSES.join(', ')}`);
  return inPatientContext(patientId, organizationId, async ({ q, userId }) => {
    const rows = await q(
      `UPDATE patient_conditions SET status = COALESCE(:status, status), notes = COALESCE(:notes, notes), severity = COALESCE(:severity, severity),
              resolved_date = CASE WHEN :status = 'RESOLVED' THEN CURRENT_DATE ELSE resolved_date END, updated_at = NOW()
       WHERE id = :problemId AND user_id = :userId RETURNING *`,
      { status: status ?? null, notes: notes ?? null, severity: severity ?? null, problemId, userId });
    return rows[0];
  });
}
