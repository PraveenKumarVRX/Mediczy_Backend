/**
 * Clinical Coding Bridge — note sign → ICD/CPT → billing charges (fee-schedule aware)
 */
import pool from '../db/pgPool.js';
import { createCodingSuggestions } from './clinical-intelligence.service.js';
import feeSchedule from './fee-schedule-versioning.service.js';

export async function bridgeCodingToBilling(note, hospitalId) {
  if (!note?.patientId || !hospitalId) return { bridged: false };

  const suggestions = note.icd10Codes?.length
    ? note.icd10Codes
    : await createCodingSuggestions(note);

  if (!suggestions?.length) return { bridged: false, suggestions: [] };

  let chargesCreated = 0;
  for (const s of suggestions) {
    const code = s.code || s.icd10 || s.cpt;
    if (!code) continue;
    const exists = await pool.query(
      `SELECT 1 FROM hospital_billing_charges
       WHERE hospital_id = $1 AND patient_id = $2 AND source_type = 'clinical_coding'
         AND metadata->>'code' = $3 LIMIT 1`,
      [hospitalId, note.patientId, code]
    );
    if (exists.rowCount) continue;

    const feeRow = await feeSchedule.resolveCharge(hospitalId, code).catch(() => null);
    const amount = Number(feeRow?.unit_price ?? feeRow?.unitPrice ?? 0);
    const description = feeRow?.name
      ? `${feeRow.name} (${code})`
      : `ICD/CPT ${code} — ${s.description || ''}`.trim();

    await pool.query(
      `INSERT INTO hospital_billing_charges
         (hospital_id, patient_id, admission_id, charge_type, source_type, source_id, description, amount, status, metadata)
       VALUES ($1,$2,$3,'diagnosis','clinical_coding',$4,$5,$6,'pending',$7::jsonb)`,
      [
        hospitalId,
        note.patientId,
        note.admissionId || null,
        note.id,
        description,
        amount,
        JSON.stringify({
          code,
          noteId: note.id,
          confidence: s.confidence,
          source: s.source || 'unknown',
          evidence: s.evidence || null,
          reviewRequired: true, // never auto-billed without a human review step downstream
          versionId: feeRow?.version_id || null,
          feeScheduleMatched: Boolean(feeRow),
        }),
      ]
    ).catch(() => {});
    chargesCreated += 1;
  }

  return { bridged: chargesCreated > 0, suggestions, chargesCreated };
}

export default { bridgeCodingToBilling };
