/**
 * Operative Notes Service — Phase 3 gap
 *
 * Structured operative note attached to an OT booking.
 * Stores narrative, procedure steps, findings, complications,
 * implants summary, and surgeon attestation.
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';

async function ensureTables() {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS operative_notes (
      id                  BIGSERIAL PRIMARY KEY,
      organization_id     BIGINT,
      ot_booking_id       BIGINT NOT NULL,
      admission_id        BIGINT,
      patient_id          BIGINT,
      surgeon_id          TEXT,
      assistant_surgeon   TEXT,
      scrub_nurse         TEXT,
      anesthetist_id      TEXT,
      procedure_name      TEXT NOT NULL,
      incision_type       TEXT,
      position_used       TEXT,
      anesthesia_type     TEXT,
      preop_diagnosis     TEXT,
      postop_diagnosis    TEXT,
      findings            TEXT,
      procedure_steps     TEXT,
      specimens_sent      TEXT,
      drains_placed       TEXT,
      closure_details     TEXT,
      blood_loss_ml       INTEGER,
      fluids_given        TEXT,
      complications       TEXT,
      implants_used       TEXT,
      special_instructions TEXT,
      follow_up_plan      TEXT,
      dictation_source    TEXT DEFAULT 'manual',  -- manual | voice | ai_draft
      draft_content       TEXT,
      final_content       TEXT,
      signed_by           TEXT,
      signed_at           TIMESTAMPTZ,
      status              TEXT DEFAULT 'draft',   -- draft | signed
      note_data           JSONB DEFAULT '{}'::jsonb,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_op_note_booking
      ON operative_notes(ot_booking_id) WHERE status = 'signed';
    CREATE INDEX IF NOT EXISTS idx_op_note_booking_all ON operative_notes(ot_booking_id);
    CREATE INDEX IF NOT EXISTS idx_op_note_patient     ON operative_notes(patient_id);
  `);
}
ensureTables().catch(e => console.warn('[operative-notes] table init:', e.message));

export async function createOperativeNote(data) {
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
  await sequelize.query(
    `UPDATE operative_notes
     SET status = 'signed', signed_by = :by, signed_at = NOW(),
         final_content = COALESCE(:final, draft_content), updated_at = NOW()
     WHERE id = :noteId AND status = 'draft'`,
    { replacements: { noteId, by: signedBy, final: finalContent || null }, type: QueryTypes.UPDATE }
  );
  return { success: true };
}
