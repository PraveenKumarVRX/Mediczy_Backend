/**
 * Operative Notes Service — Phase 3 gap
 *
 * Structured operative note attached to an OT booking.
 * Stores narrative, procedure steps, findings, complications,
 * implants summary, and surgeon attestation.
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';

import { schemaVerifier } from '../utils/schema-guard.js';
const SCHEMA_TABLES = ['operative_notes'];

// Owned by the migration, verified here. Creating these on demand would let a
// skipped migration look healthy on tables without its indexes and constraints.
const ensureTables = schemaVerifier({
  sequelize,
  tables: SCHEMA_TABLES,
  code: 'SCHEMA_NOT_MIGRATED',
  message: 'Apply migration 20261015003000-operative-notes-governance before using operative notes',
});

export async function createOperativeNote(data) {
  await ensureTables();
  const {
    organizationId, otBookingId, admissionId, patientId, surgeonId,
    assistantSurgeon, scrubNurse, anesthetistId, procedureName, incisionType,
    positionUsed, anesthesiaType, preopDiagnosis, postopDiagnosis, findings,
    procedureSteps, specimensSent, drainsPlaced, closureDetails, bloodLossMl,
    fluidsGiven, complications, implantsUsed, specialInstructions, followUpPlan,
    dictationSource, draftContent, noteData
  } = data;

  const [result] = await sequelize.query(
    `INSERT INTO operative_notes (
       organization_id, ot_booking_id, admission_id, patient_id, surgeon_id,
       assistant_surgeon, scrub_nurse, anesthetist_id, procedure_name, incision_type,
       position_used, anesthesia_type, preop_diagnosis, postop_diagnosis, findings,
       procedure_steps, specimens_sent, drains_placed, closure_details, blood_loss_ml,
       fluids_given, complications, implants_used, special_instructions, follow_up_plan,
       dictation_source, draft_content, note_data
     ) VALUES (
       :orgId, :bookingId, :admId, :patientId, :surgeonId,
       :assistant, :scrub, :anesthId, :procedure, :incision,
       :position, :anesthesia, :preop, :postop, :findings,
       :steps, :specimens, :drains, :closure, :bloodLoss,
       :fluids, :complications, :implants, :instructions, :followUp,
       :source, :draft, :data::jsonb
     ) RETURNING *`,
    {
      replacements: {
        orgId: organizationId || null, bookingId: otBookingId,
        admId: admissionId || null, patientId: patientId || null,
        surgeonId: surgeonId || null, assistant: assistantSurgeon || null,
        scrub: scrubNurse || null, anesthId: anesthetistId || null,
        procedure: procedureName, incision: incisionType || null,
        position: positionUsed || null, anesthesia: anesthesiaType || null,
        preop: preopDiagnosis || null, postop: postopDiagnosis || null,
        findings: findings || null, steps: procedureSteps || null,
        specimens: specimensSent || null, drains: drainsPlaced || null,
        closure: closureDetails || null, bloodLoss: bloodLossMl || null,
        fluids: fluidsGiven || null, complications: complications || null,
        implants: implantsUsed || null, instructions: specialInstructions || null,
        followUp: followUpPlan || null, source: dictationSource || 'manual',
        draft: draftContent || null, data: JSON.stringify(noteData || {})
      },
      type: QueryTypes.INSERT
    }
  );
  return result[0];
}

export async function getOperativeNoteByBooking(otBookingId) {
  await ensureTables();
  const [row] = await sequelize.query(
    `SELECT on2.*, p.first_name || ' ' || p.last_name as patient_name
     FROM operative_notes on2
     LEFT JOIN patients p ON p.id = on2.patient_id
     WHERE on2.ot_booking_id = :bookingId
     ORDER BY on2.created_at DESC LIMIT 1`,
    { replacements: { bookingId: otBookingId }, type: QueryTypes.SELECT }
  );
  return row || null;
}

export async function updateOperativeNote(noteId, updates) {
  await ensureTables();
  const allowed = [
    'findings', 'procedure_steps', 'postop_diagnosis', 'specimens_sent',
    'drains_placed', 'closure_details', 'blood_loss_ml', 'fluids_given',
    'complications', 'implants_used', 'special_instructions', 'follow_up_plan',
    'draft_content', 'assistant_surgeon', 'scrub_nurse'
  ];
  const sets = [];
  const replacements = { noteId };
  for (const [k, v] of Object.entries(updates)) {
    if (!allowed.includes(k)) continue;
    sets.push(`${k} = :${k}`);
    replacements[k] = v;
  }
  if (!sets.length) return { success: true };
  sets.push('updated_at = NOW()');
  await sequelize.query(
    `UPDATE operative_notes SET ${sets.join(', ')} WHERE id = :noteId AND status = 'draft'`,
    { replacements, type: QueryTypes.UPDATE }
  );
  return { success: true };
}

export async function signOperativeNote(noteId, { signedBy, finalContent }) {
  await ensureTables();
  await sequelize.query(
    `UPDATE operative_notes
     SET status = 'signed', signed_by = :by, signed_at = NOW(),
         final_content = COALESCE(:final, draft_content), updated_at = NOW()
     WHERE id = :noteId AND status = 'draft'`,
    { replacements: { noteId, by: signedBy, final: finalContent || null }, type: QueryTypes.UPDATE }
  );
  return { success: true };
}
