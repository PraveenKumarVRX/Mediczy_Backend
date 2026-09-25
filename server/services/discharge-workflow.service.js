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
import qualityGates from './ai-quality-gates.service.js';

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
  const [admission] = await sequelize.query(
    `SELECT a.*, p.first_name || ' ' || p.last_name as patient_name, p.date_of_birth, p.gender, p.allergies
     FROM ip_admissions a
     LEFT JOIN patients p ON p.id = a.patient_id
     WHERE a.id = :admId LIMIT 1`,
    { replacements: { admId: admissionId }, type: QueryTypes.SELECT }
  ).catch(() => [null]);

  const notes = await sequelize.query(
    `SELECT note_type, chief_complaint, diagnosis, plan, assessment, created_at
     FROM clinical_notes WHERE admission_id = :admId ORDER BY created_at DESC LIMIT 10`,
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

// ── AI synthesis (Upgrade Plan Track B, Phase B3) ───────────────────────────
//
// buildDraftText() above is a fixed-shape template — real reasoning over
// the admission (diagnoses, procedures, meds, labs, pending items) never
// happened despite ai_model being recorded as 'internal-template'. This
// reviews the same context through the LLM and produces the sections the
// table already has columns for. Falls back to the template on any
// failure — a discharge draft must never simply not appear.
async function buildAiDraftText(ctx) {
  const { admission, notes, meds, labs, otBooking, vitals } = ctx;
  if (!admission) return null;

  const systemPrompt = `You are drafting a discharge summary for physician review — a DRAFT ONLY, never sent to a patient without physician sign-off.
Review the admission, diagnoses, procedures, medications, labs, and vitals provided and produce a discharge summary.
Do not invent findings, medications, or instructions not supported by the provided data.
Output JSON: {
  "diagnosisSummary", "procedureSummary", "medicationSummary", "followUpSummary",
  "dietInstructions", "activityNotes", "fullNarrative",
  "confidence": 0-1, "missingDataFlags": ["..."]
}`;

  const llm = await llmProvider.chat({
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: JSON.stringify({
          admission: { patientName: admission.patient_name, admissionNumber: admission.admission_number, admittedAt: admission.admission_datetime },
          recentClinicalNotes: notes,
          medications: meds,
          recentLabs: labs,
          procedure: otBooking,
          recentVitals: vitals,
        }),
      },
    ],
    temperature: 0.1,
    maxTokens: 1800,
    responseFormat: { type: 'json_object' },
    skipCache: true,
  });

  let parsed;
  try {
    parsed = JSON.parse(llm.content || '{}');
  } catch {
    return null;
  }
  if (!parsed.fullNarrative) return null;

  return { ...parsed, provider: llm.provider };
}

// ── Draft creation ────────────────────────────────────────────────────────────

export async function createDischargeDraft({ organizationId, admissionId, patientId, preparedBy, aiAssisted = true }) {
  const ctx = await buildDraftContext(admissionId);

  let aiDraft = null;
  if (aiAssisted) {
    aiDraft = await buildAiDraftText(ctx).catch((err) => {
      console.error('[DischargeWorkflow] AI synthesis failed, falling back to template:', err.message);
      return null;
    });
  }

  const draftContent = aiDraft?.fullNarrative || buildDraftText(ctx);
  const usedAi = Boolean(aiDraft);

  // Quality-gate check (CLAUDE.md §2: every AI output influencing a clinical
  // decision must pass a quality gate and be logged) — reuses the scribe
  // gate since a discharge draft is the same class of risk as an AI clinical
  // note: dosage hallucination, allergy omission, missing physician review.
  let gateResult = null;
  if (usedAi) {
    const activeMedNames = (ctx.meds || []).filter((m) => m.order_status === 'active').map((m) => m.drug_name);
    gateResult = await qualityGates.checkScribeOutput({
      noteText: draftContent,
      patientAllergies: ctx.admission?.allergies || [],
      patientMedications: activeMedNames,
    });
    await qualityGates.logGateResult(gateResult, { admissionId, patientId, source: 'discharge-workflow' });
  }

  const [result] = await sequelize.query(
    `INSERT INTO discharge_packets (
       organization_id, admission_id, patient_id, draft_content,
       diagnosis_summary, procedure_summary, medication_summary,
       follow_up_summary, diet_instructions, activity_notes,
       ai_generated, ai_model, status, packet_data
     ) VALUES (
       :orgId, :admId, :patientId, :draft,
       :dx, :proc, :meds, :fu, :diet, :activity,
       :ai, :model, 'draft', :packetData
     )
     ON CONFLICT DO NOTHING
     RETURNING *`,
    {
      replacements: {
        orgId: organizationId || null, admId: admissionId, patientId: patientId || null,
        draft: draftContent,
        dx: aiDraft?.diagnosisSummary || null,
        proc: aiDraft?.procedureSummary || null,
        meds: aiDraft?.medicationSummary || null,
        fu: aiDraft?.followUpSummary || null,
        diet: aiDraft?.dietInstructions || null,
        activity: aiDraft?.activityNotes || null,
        ai: usedAi, model: usedAi ? aiDraft.provider || 'llm' : (aiAssisted ? 'internal-template' : null),
        packetData: JSON.stringify({
          qualityGate: gateResult ? { passed: gateResult.passed, severity: gateResult.severity, blockerCount: gateResult.blockers?.length || 0, warningCount: gateResult.warnings?.length || 0 } : null,
          aiConfidence: aiDraft?.confidence ?? null,
          missingDataFlags: aiDraft?.missingDataFlags || [],
        }),
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

export async function signDischargePacket(packetId, { signedBy, finalContent, organizationId, override = null }) {
  const { getDischargeReadiness } = await import('./adt.service.js');
  const [packetRows] = await sequelize.query(
    `SELECT admission_id AS "admissionId" FROM discharge_packets WHERE id = :id LIMIT 1`,
    { replacements: { id: packetId }, type: QueryTypes.SELECT }
  );
  const admissionId = packetRows[0]?.admissionId;
  if (!admissionId) {
    const error = new Error('Discharge draft not found');
    error.code = 'DISCHARGE_DRAFT_NOT_FOUND';
    error.status = 404;
    throw error;
  }
  const readiness = await getDischargeReadiness(admissionId, organizationId);
  if (!readiness.ready) {
    const pending = readiness.mandatoryPending || [];
    if (!override?.reasonCode || !override?.approverId || !['admin', 'super_admin', 'medical_director', 'discharge_officer'].includes(override.approverRole)) {
      const error = new Error(`Discharge packet cannot be signed until mandatory readiness items are complete: ${pending.map(i => i.label).join('; ')}`);
      error.code = 'DISCHARGE_READINESS_BLOCKED';
      error.status = 409;
      error.mandatoryPending = pending;
      throw error;
    }
    await sequelize.query(
      `INSERT INTO discharge_overrides (admission_id, organization_id, missing_items, reason_code, approver_id, approver_role)
       VALUES (:admissionId, :orgId, :items::jsonb, :reason, :approver, :role)`,
      { replacements: { admissionId, orgId: organizationId || null, items: JSON.stringify(pending), reason: override.reasonCode, approver: override.approverId, role: override.approverRole }, type: QueryTypes.INSERT }
    );
  }

  const [rows] = await sequelize.query(
    `UPDATE discharge_packets
     SET status = 'signed', signed_by = :by, signed_at = NOW(),
         final_content = COALESCE(:final, draft_content), updated_at = NOW()
     WHERE id = :id AND status = 'draft'
     RETURNING id, admission_id AS "admissionId", status, signed_by AS "signedBy", signed_at AS "signedAt"`,
    { replacements: { id: packetId, by: signedBy, final: finalContent || null }, type: QueryTypes.UPDATE }
  );
  if (!rows.length) throw new Error('Discharge draft not found or already signed');
  return { success: true, data: rows[0] };
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
