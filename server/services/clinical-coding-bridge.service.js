/**
 * Clinical Coding Bridge — note sign → ICD/CPT → billing charges
 */
import pool from '../db/pgPool.js';
import { createCodingSuggestions } from './clinical-intelligence.service.js';

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

    await pool.query(
      `INSERT INTO hospital_billing_charges
         (hospital_id, patient_id, admission_id, charge_type, source_type, source_id, description, amount, status, metadata)
       VALUES ($1,$2,$3,'diagnosis','clinical_coding',$4,$5,0,'pending',$6::jsonb)`,
      [
        hospitalId,
        note.patientId,
        note.admissionId || null,
        note.id,
        `ICD/CPT ${code} — ${s.description || ''}`.trim(),
        JSON.stringify({ code, noteId: note.id, confidence: s.confidence }),
      ]
    ).catch(() => {});
    chargesCreated += 1;
  }

  return { bridged: chargesCreated > 0, suggestions, chargesCreated };
}

export default { bridgeCodingToBilling };
