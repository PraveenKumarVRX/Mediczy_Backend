/**
 * Discharge Workflow Service — Phase 5
 *
 * AI-assisted discharge summary draft → sign → send.
 * Stores discharge packets including: summary narrative,
 * signed status, and delivery receipts.
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';
import llmProvider from './ai-brain/llm-provider.js';
import { ensureClinicalNoteColumns } from './clinical-notes.service.js';

async function ensureTables() {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS discharge_packets (
      id                  BIGSERIAL PRIMARY KEY,
      organization_id     BIGINT,
      admission_id        BIGINT NOT NULL,
      patient_id          BIGINT,
      draft_content       TEXT,
      final_content       TEXT,
      diagnosis_summary   TEXT,
      procedure_summary   TEXT,
      medication_summary  TEXT,
      follow_up_summary   TEXT,
      diet_instructions   TEXT,
      activity_notes      TEXT,
      emergency_contacts  TEXT,
      ai_generated        BOOLEAN DEFAULT FALSE,
      ai_model            TEXT,
      signed_by           TEXT,
      signed_at           TIMESTAMPTZ,
      status              TEXT DEFAULT 'draft',   -- draft | signed | sent | delivered
      sent_at             TIMESTAMPTZ,
      delivery_channel    TEXT,   -- portal | whatsapp | email | print
      delivery_address    TEXT,
      delivery_receipt    JSONB DEFAULT '{}'::jsonb,
      packet_data         JSONB DEFAULT '{}'::jsonb,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_discharge_packet_admission ON discharge_packets(admission_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_discharge_packet_signed
      ON discharge_packets(admission_id) WHERE status IN ('signed','sent','delivered');
  `);
}
ensureTables().catch(e => console.warn('[discharge-workflow] table init:', e.message));

// ── Build AI draft context ────────────────────────────────────────────────────

async function buildDraftContext(admissionId) {
  await ensureClinicalNoteColumns();

  const [admission] = await sequelize.query(
    `SELECT a.*, p.first_name || ' ' || p.last_name as patient_name, p.date_of_birth, p.gender
     FROM ip_admissions a
     LEFT JOIN patients p ON p.id = a.patient_id
     WHERE a.id = :admId LIMIT 1`,
    { replacements: { admId: admissionId }, type: QueryTypes.SELECT }
  ).catch(() => [null]);

  // clinical_notes has mixed casing: note_type/admission_id are snake_case
  // (added via ALTER in ensureClinicalNoteColumns), chiefComplaint/assessment/
  // createdAt are camelCase (Sequelize model columns) — there is no
  // "diagnosis" column; "assessment" is the SOAP-note diagnosis-equivalent.
  const notes = await sequelize.query(
    `SELECT note_type, "chiefComplaint" AS chief_complaint, assessment AS diagnosis, plan, assessment, "createdAt" AS created_at
     FROM clinical_notes WHERE admission_id = :admId ORDER BY "createdAt" DESC LIMIT 10`,
    { replacements: { admId: admissionId }, type: QueryTypes.SELECT }
  ).catch(() => []);

  const meds = await sequelize.query(
    `SELECT drug_name, dose, route, frequency, start_datetime, end_datetime, special_instructions, order_status
     FROM medication_orders WHERE admission_id = :admId`,
    { replacements: { admId: admissionId }, type: QueryTypes.SELECT }
  ).catch(() => []);

  const labs = await sequelize.query(
    `SELECT test_name, result_value, result_unit, normal_range, abnormal_flag, collected_at
     FROM lab_results WHERE admission_id = :admId ORDER BY collected_at DESC LIMIT 20`,
    { replacements: { admId: admissionId }, type: QueryTypes.SELECT }
  ).catch(() => []);

  const otBooking = await sequelize.query(
    `SELECT procedure_name, scheduled_start, actual_start, actual_end, ot_status, surgeon_id
     FROM ot_bookings WHERE admission_id = :admId ORDER BY created_at DESC LIMIT 1`,
    { replacements: { admId: admissionId }, type: QueryTypes.SELECT }
  ).catch(() => []);

  const vitals = await sequelize.query(
    `SELECT * FROM vital_records WHERE admission_id = :admId ORDER BY recorded_at DESC LIMIT 3`,
    { replacements: { admId: admissionId }, type: QueryTypes.SELECT }
  ).catch(() => []);

  return { admission, notes, meds, labs, otBooking: otBooking[0] || null, vitals };
}

function buildDraftText(ctx) {
  const { admission, notes, meds, labs, otBooking, vitals } = ctx;
  if (!admission) return 'Discharge summary could not be generated — admission not found.';

  const dx = notes.find(n => n.diagnosis)?.diagnosis || 'As documented in clinical notes';
  const plan = notes.find(n => n.plan)?.plan || '';
  const activeMeds = meds.filter(m => m.order_status === 'active').map(m => `${m.drug_name} ${m.dose} ${m.route} ${m.frequency}`).join(', ') || 'None';
  const lastVital = vitals[0];
  const vitalsText = lastVital ? `BP ${lastVital.bp_systolic}/${lastVital.bp_diastolic}, HR ${lastVital.heart_rate}, SpO2 ${lastVital.spo2}%` : 'Not recorded';

  return [
    `DISCHARGE SUMMARY`,
    `Patient: ${admission.patient_name} | Admission #: ${admission.admission_number}`,
    `Admitted: ${admission.admission_datetime ? new Date(admission.admission_datetime).toDateString() : 'N/A'}`,
    ``,
    `DIAGNOSIS: ${dx}`,
    ``,
    otBooking ? `PROCEDURE: ${otBooking.procedure_name} (${otBooking.ot_status})` : '',
    ``,
    `CLINICAL SUMMARY: ${plan || 'Patient was managed as per standard protocol.'}`,
    ``,
    `DISCHARGE VITALS: ${vitalsText}`,
    ``,
    `MEDICATIONS AT DISCHARGE: ${activeMeds}`,
    ``,
    `FOLLOW-UP: Please follow up as instructed by your treating physician.`,
    ``,
    `This is a draft summary. Please review and sign before sharing with the patient.`
  ].filter(Boolean).join('\n');
}

// ── LLM-drafted discharge summary ─────────────────────────────────────────────
// Falls back to the deterministic template (buildDraftText) if the LLM cascade
// is unavailable — draft_content is never blank, but ai_generated/ai_model
// only claim AI authorship when an LLM actually produced the text. This is
// documentation with mandatory physician sign-off before it reaches a patient
// (see status: draft → signed → sent below), so it's NOT SaMD per the
// classification table in CLAUDE.md — no quality-gate/confidence-score
// plumbing needed, same as the SBAR shift-handover generator it mirrors.
async function buildDraftTextViaLLM(ctx) {
  const { admission, notes, meds, labs, otBooking, vitals } = ctx;
  if (!admission) return { text: buildDraftText(ctx), aiGenerated: false, model: null };

  try {
    const llm = await llmProvider.chat({
      messages: [
        {
          role: 'system',
          content: `You are drafting a hospital discharge summary for physician review — this is a DRAFT, not a final clinical document. Write clear, professional prose covering: diagnosis, hospital course, procedures, discharge medications, discharge vitals, and follow-up instructions. End with "This is a draft summary. Please review and sign before sharing with the patient." Do not invent facts not present in the provided data.`,
        },
        {
          role: 'user',
          content: `Patient: ${admission.patient_name || 'Unknown'} | Admission #: ${admission.admission_number}
Admitted: ${admission.admission_datetime ? new Date(admission.admission_datetime).toDateString() : 'N/A'}
Clinical notes: ${JSON.stringify(notes.slice(0, 5))}
Procedure: ${otBooking ? `${otBooking.procedure_name} (${otBooking.ot_status})` : 'None'}
Medications: ${JSON.stringify(meds)}
Recent labs: ${JSON.stringify(labs.slice(0, 10))}
Latest vitals: ${JSON.stringify(vitals[0] || {})}`,
        },
      ],
      temperature: 0.2,
      maxTokens: 900,
      skipCache: true,
    });
    const text = (llm.content || '').trim();
    if (!text) throw new Error('empty LLM response');
    return { text, aiGenerated: true, model: llm.model || llm.provider || 'llm' };
  } catch (err) {
    console.warn('[discharge-workflow] LLM draft failed, falling back to template:', err.message);
    return { text: buildDraftText(ctx), aiGenerated: false, model: null };
  }
}

// ── Draft creation ────────────────────────────────────────────────────────────

export async function createDischargeDraft({ organizationId, admissionId, patientId, preparedBy, aiAssisted = true }) {
  const ctx = await buildDraftContext(admissionId);
  const { text: draftContent, aiGenerated, model } = aiAssisted
    ? await buildDraftTextViaLLM(ctx)
    : { text: buildDraftText(ctx), aiGenerated: false, model: null };

  const [result] = await sequelize.query(
    `INSERT INTO discharge_packets (
       organization_id, admission_id, patient_id, draft_content,
       ai_generated, ai_model, status
     ) VALUES (
       :orgId, :admId, :patientId, :draft,
       :ai, :model, 'draft'
     )
     ON CONFLICT DO NOTHING
     RETURNING *`,
    {
      replacements: {
        orgId: organizationId || null, admId: admissionId, patientId: patientId || null,
        draft: draftContent, ai: aiGenerated, model
      },
      type: QueryTypes.INSERT
    }
  );

  if (!result[0]) {
    const [existing] = await sequelize.query(
      `SELECT * FROM discharge_packets WHERE admission_id = :admId AND status = 'draft' LIMIT 1`,
      { replacements: { admId: admissionId }, type: QueryTypes.SELECT }
    );
    return existing || null;
  }

  return result[0];
}

export async function getDraftByAdmission(admissionId) {
  const [row] = await sequelize.query(
    `SELECT * FROM discharge_packets WHERE admission_id = :admId ORDER BY created_at DESC LIMIT 1`,
    { replacements: { admId: admissionId }, type: QueryTypes.SELECT }
  );
  return row || null;
}

export async function updateDraftContent(packetId, { draftContent, diagnosisSummary, procedureSummary, medicationSummary, followUpSummary, dietInstructions, activityNotes }) {
  await sequelize.query(
    `UPDATE discharge_packets
     SET draft_content       = COALESCE(:draft, draft_content),
         diagnosis_summary   = COALESCE(:dx, diagnosis_summary),
         procedure_summary   = COALESCE(:proc, procedure_summary),
         medication_summary  = COALESCE(:meds, medication_summary),
         follow_up_summary   = COALESCE(:fu, follow_up_summary),
         diet_instructions   = COALESCE(:diet, diet_instructions),
         activity_notes      = COALESCE(:activity, activity_notes),
         updated_at = NOW()
     WHERE id = :id AND status = 'draft'`,
    {
      replacements: {
        id: packetId, draft: draftContent || null, dx: diagnosisSummary || null,
        proc: procedureSummary || null, meds: medicationSummary || null,
        fu: followUpSummary || null, diet: dietInstructions || null, activity: activityNotes || null
      },
      type: QueryTypes.UPDATE
    }
  );
  return { success: true };
}

// ── Sign ──────────────────────────────────────────────────────────────────────

export async function signDischargePacket(packetId, { signedBy, finalContent }) {
  await sequelize.query(
    `UPDATE discharge_packets
     SET status = 'signed', signed_by = :by, signed_at = NOW(),
         final_content = COALESCE(:final, draft_content), updated_at = NOW()
     WHERE id = :id AND status = 'draft'`,
    { replacements: { id: packetId, by: signedBy, final: finalContent || null }, type: QueryTypes.UPDATE }
  );
  return { success: true };
}

// ── Send ──────────────────────────────────────────────────────────────────────

export async function sendDischargePacket(packetId, { channel, deliveryAddress, sentBy }) {
  await sequelize.query(
    `UPDATE discharge_packets
     SET status = 'sent', sent_at = NOW(), delivery_channel = :channel,
         delivery_address = :address, updated_at = NOW()
     WHERE id = :id AND status = 'signed'`,
    { replacements: { id: packetId, channel, address: deliveryAddress || null }, type: QueryTypes.UPDATE }
  );
  return { success: true, channel, sentAt: new Date() };
}
