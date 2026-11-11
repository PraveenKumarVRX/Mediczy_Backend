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
import { ensureClinicalNoteColumns } from './clinical-notes.service.js';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import leven from 'leven';

import { schemaVerifier } from '../utils/schema-guard.js';

const ENSUREDISCHARGEREFINEMENTSCHEMA_TABLES = ['doctor_note_refinements', 'discharge_packets'];

const ensureDischargeRefinementSchema = schemaVerifier({
  sequelize: sequelize,
  tables: ENSUREDISCHARGEREFINEMENTSCHEMA_TABLES,
  code: 'SCHEMA_NOT_MIGRATED',
  message: 'Apply the discharge workflow migration before refining discharge notes',
});

// ── Adaptive refinement (Phlox-comparison finding) ──────────────────────────
//
// When a doctor's signed finalContent differs substantially from the AI's
// original draft_content, synthesize a short, bounded list of standing style
// preferences from the diff and fold them into that doctor's future drafts.
// Modeled on notification-preferences.service.js's user-keyed JSONB table.
const REFINEMENT_CHANGE_THRESHOLD = 0.4;
const MAX_REFINEMENT_INSTRUCTIONS = 10;

async function ensureRefinementsTable() {
  // Schema is owned by the migration; this used to build the table on
  // the request path, taking an ACCESS EXCLUSIVE lock mid-request.
  await ensureDischargeRefinementSchema();
}
ensureRefinementsTable().catch((e) => console.warn('[discharge-workflow] refinements table init:', e.message));

async function getDoctorRefinements(doctorId) {
  const [row] = await sequelize.query(
    `SELECT instructions FROM doctor_note_refinements WHERE doctor_id = :doctorId`,
    { replacements: { doctorId }, type: QueryTypes.SELECT }
  ).catch(() => [null]);
  return row?.instructions || [];
}

function changeRatio(a, b) {
  const longest = Math.max(a.length, b.length, 1);
  return leven(a, b) / longest;
}

async function updateDoctorRefinements({ doctorId, draftContent, finalContent }) {
  try {
    const ratio = changeRatio(draftContent, finalContent);
    if (ratio < REFINEMENT_CHANGE_THRESHOLD) return;

    const existing = await getDoctorRefinements(doctorId);
    const llm = await llmProvider.chat({
      messages: [
        {
          role: 'system',
          content: `A physician edited an AI-drafted discharge summary. Compare the original draft and the final
edited version, and infer up to ${MAX_REFINEMENT_INSTRUCTIONS} short, standing style-preference instructions
this physician's future drafts should follow (tone, structure, phrasing, level of detail — not clinical facts).
Merge with their existing preferences below, de-duplicating and keeping the most useful ${MAX_REFINEMENT_INSTRUCTIONS}.
Existing preferences: ${JSON.stringify(existing)}
Output JSON: { "instructions": ["...", "..."] }`,
        },
        { role: 'user', content: `ORIGINAL DRAFT:\n${draftContent}\n\nFINAL EDITED VERSION:\n${finalContent}` },
      ],
      temperature: 0.2,
      maxTokens: 500,
      responseFormat: { type: 'json_object' },
      skipCache: true,
    });
    const parsed = JSON.parse(llm.content || '{}');
    const instructions = Array.isArray(parsed.instructions) ? parsed.instructions.slice(0, MAX_REFINEMENT_INSTRUCTIONS) : null;
    if (!instructions?.length) return;

    await sequelize.query(
      `INSERT INTO doctor_note_refinements (doctor_id, instructions, updated_at)
       VALUES (:doctorId, :instructions, NOW())
       ON CONFLICT (doctor_id) DO UPDATE SET instructions = :instructions, updated_at = NOW()`,
      { replacements: { doctorId, instructions: JSON.stringify(instructions) }, type: QueryTypes.INSERT }
    );
  } catch (err) {
    console.warn('[discharge-workflow] adaptive refinement update failed (non-fatal):', err.message);
  }
}

// Only the Groq leg of the LLM cascade actually honours `response_format` — SIB (the real
// primary provider) and iSHA-direct both silently drop it before the request goes on the
// wire (confirmed by reading llm-provider.js directly), so this schema tightens Groq only.
// The `.safeParse()` below this, not the request-side schema, is what actually protects
// against a malformed shape from SIB/iSHA, since both still return JSON per the prompt's
// instructions without the API-level guarantee.
const DischargeDraftSchema = z.object({
  diagnosisSummary: z.string().nullable(),
  procedureSummary: z.string().nullable(),
  medicationSummary: z.string().nullable(),
  followUpSummary: z.string().nullable(),
  dietInstructions: z.string().nullable(),
  activityNotes: z.string().nullable(),
  fullNarrative: z.string(),
  confidence: z.number().min(0).max(1).nullable(),
  missingDataFlags: z.array(z.string()),
});
const DISCHARGE_DRAFT_RESPONSE_FORMAT = zodResponseFormat(DischargeDraftSchema, 'discharge_draft');

async function ensureTables() {
  // Schema is owned by the migration; this used to build the table on
  // the request path, taking an ACCESS EXCLUSIVE lock mid-request.
  await ensureDischargeRefinementSchema();
}
ensureTables().catch(e => console.warn('[discharge-workflow] table init:', e.message));

// ── Build AI draft context ────────────────────────────────────────────────────

async function buildDraftContext(admissionId) {
  await ensureClinicalNoteColumns();

  // ip_admissions.patient_id references users.id directly, not patients.id — the demographic
  // columns this query used to select (p.first_name/last_name/date_of_birth/gender) don't
  // exist on `patients` at all (confirmed live: it's a thin medical-metadata table keyed by
  // "userId", not a demographics table), so this join matched nothing for any admission and
  // buildAiDraftText() always failed silently (caught by the .catch() below) straight through
  // to the static-template fallback. Allergies genuinely do live on `patients`, keyed by
  // "userId" — hence the second join.
  const [admission] = await sequelize.query(
    `SELECT a.*, u."firstName" || ' ' || u."lastName" as patient_name, u."dateOfBirth" as date_of_birth, u.gender, p.allergies
     FROM ip_admissions a
     LEFT JOIN users u ON u.id = a.patient_id
     LEFT JOIN patients p ON p."userId" = a.patient_id
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

// ── AI synthesis (Upgrade Plan Track B, Phase B3) ───────────────────────────
//
// buildDraftText() above is a fixed-shape template — real reasoning over
// the admission (diagnoses, procedures, meds, labs, pending items) never
// happened despite ai_model being recorded as 'internal-template'. This
// reviews the same context through the LLM and produces the sections the
// table already has columns for. Falls back to the template on any
// failure — a discharge draft must never simply not appear.
async function buildAiDraftText(ctx, doctorId = null) {
  const { admission, notes, meds, labs, otBooking, vitals } = ctx;
  if (!admission) return null;

  const refinements = doctorId ? await getDoctorRefinements(doctorId) : [];

  const systemPrompt = [
    `You are drafting a discharge summary for physician review — a DRAFT ONLY, never sent to a patient without physician sign-off.`,
    `Review the admission, diagnoses, procedures, medications, labs, and vitals provided and produce a discharge summary.`,
    `Do not invent findings, medications, or instructions not supported by the provided data.`,
    refinements.length ? `## This doctor's standing preferences, learned from past edits\n${refinements.map((i) => `- ${i}`).join('\n')}` : '',
    `Output JSON: {\n  "diagnosisSummary", "procedureSummary", "medicationSummary", "followUpSummary",\n  "dietInstructions", "activityNotes", "fullNarrative",\n  "confidence": 0-1, "missingDataFlags": ["..."]\n}`,
  ].filter(Boolean).join('\n\n');

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
    responseFormat: DISCHARGE_DRAFT_RESPONSE_FORMAT,
    skipCache: true,
  });

  let parsed;
  try {
    parsed = JSON.parse(llm.content || '{}');
  } catch {
    return null;
  }
  // Catches a malformed shape SIB/iSHA can still produce even though neither honours the
  // `response_format` schema above — the real protection for those two providers.
  const validated = DischargeDraftSchema.safeParse(parsed);
  if (!validated.success) {
    console.warn('[DischargeWorkflow] AI draft failed schema validation:', validated.error.message);
    return null;
  }
  if (!validated.data.fullNarrative) return null;

  return { ...validated.data, provider: llm.provider };
}

// ── Draft creation ────────────────────────────────────────────────────────────

export async function createDischargeDraft({ organizationId, admissionId, patientId, preparedBy, aiAssisted = true }) {
  const ctx = await buildDraftContext(admissionId);

  let aiDraft = null;
  if (aiAssisted) {
    aiDraft = await buildAiDraftText(ctx, preparedBy).catch((err) => {
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
       ai_generated, ai_model, status, packet_data, prepared_by
     ) VALUES (
       :orgId, :admId, :patientId, :draft,
       :dx, :proc, :meds, :fu, :diet, :activity,
       :ai, :model, 'draft', :packetData, :preparedBy
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
        preparedBy: preparedBy || null,
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

export async function getDraftByAdmission(admissionId, organizationId) {
  const [row] = await sequelize.query(
    `SELECT * FROM discharge_packets WHERE admission_id = :admId AND organization_id = :orgId ORDER BY created_at DESC LIMIT 1`,
    { replacements: { admId: admissionId, orgId: organizationId }, type: QueryTypes.SELECT }
  );
  return row || null;
}

/** The admission and patient a packet belongs to, only if it belongs to this organization. */
export async function getPacketScope(packetId, organizationId) {
  const [row] = await sequelize.query(
    `SELECT admission_id AS "admissionId", patient_id AS "patientId", status
       FROM discharge_packets WHERE id = :id AND organization_id = :orgId LIMIT 1`,
    { replacements: { id: packetId, orgId: organizationId }, type: QueryTypes.SELECT }
  );
  return row || null;
}

export async function updateDraftContent(packetId, { draftContent, diagnosisSummary, procedureSummary, medicationSummary, followUpSummary, dietInstructions, activityNotes }, organizationId) {
  const [, meta] = await sequelize.query(
    `UPDATE discharge_packets
     SET draft_content       = COALESCE(:draft, draft_content),
         diagnosis_summary   = COALESCE(:dx, diagnosis_summary),
         procedure_summary   = COALESCE(:proc, procedure_summary),
         medication_summary  = COALESCE(:meds, medication_summary),
         follow_up_summary   = COALESCE(:fu, follow_up_summary),
         diet_instructions   = COALESCE(:diet, diet_instructions),
         activity_notes      = COALESCE(:activity, activity_notes),
         updated_at = NOW()
     WHERE id = :id AND organization_id = :orgId AND status = 'draft'`,
    {
      replacements: {
        id: packetId, orgId: organizationId, draft: draftContent || null, dx: diagnosisSummary || null,
        proc: procedureSummary || null, meds: medicationSummary || null,
        fu: followUpSummary || null, diet: dietInstructions || null, activity: activityNotes || null
      },
      type: QueryTypes.UPDATE
    }
  );
  if (!(meta?.rowCount ?? meta)) {
    throw Object.assign(new Error('Discharge draft not found or already signed'), { status: 404, code: 'DISCHARGE_DRAFT_NOT_FOUND' });
  }
  return { success: true };
}

// ── Sign ─────────────────────────────────────────────────────────────────────

/**
 * Signs a discharge packet.
 *
 * `override` is built by the ROUTE from the authenticated caller (see utils/discharge-policy.js) — it is never
 * taken from the request body, so `approverId`/`approverRole` are trustworthy here. The packet is looked up and
 * updated only within `organizationId`. Override rows are written in the SAME transaction as the signature, so
 * a failed sign leaves no override behind.
 */
export async function signDischargePacket(packetId, { signedBy, finalContent, organizationId, override = null }) {
  const { getDischargeReadiness } = await import('./adt.service.js');
  const { hasSignedReconciliation } = await import('./med-reconciliation.service.js');
  const { reconciliationRequired } = await import('./prescription-safety.service.js');
  const { DISCHARGE_OVERRIDE_ROLES } = await import('../utils/discharge-policy.js');

  const scope = await getPacketScope(packetId, organizationId);
  if (!scope) {
    throw Object.assign(new Error('Discharge draft not found'), { status: 404, code: 'DISCHARGE_DRAFT_NOT_FOUND' });
  }
  const { admissionId, patientId } = scope;
  const overrideAllowed = Boolean(override?.reasonCode && override?.approverId && DISCHARGE_OVERRIDE_ROLES.has(override.approverRole));
  const overridesToRecord = [];

  // Signing the packet is the last clinical gate before a patient receives medication instructions, so a signed
  // discharge reconciliation is required here too — a readiness checklist item must not stand in for it.
  if (await reconciliationRequired(organizationId)) {
    const reconciled = await hasSignedReconciliation({ organizationId, patientId, admissionId, type: 'discharge' });
    if (!reconciled) {
      if (!overrideAllowed) {
        throw Object.assign(new Error('Discharge packet cannot be signed until medication reconciliation is signed'), { code: 'RECONCILIATION_REQUIRED', status: 409 });
      }
      overridesToRecord.push([{ dimension: 'medication_reconciliation' }]);
    }
  }

  const readiness = await getDischargeReadiness(admissionId, organizationId);
  if (!readiness.ready) {
    const pending = readiness.mandatoryPending || [];
    if (!overrideAllowed) {
      const error = new Error(`Discharge packet cannot be signed until mandatory readiness items are complete: ${pending.map(i => i.label).join('; ')}`);
      error.code = 'DISCHARGE_READINESS_BLOCKED';
      error.status = 409;
      error.mandatoryPending = pending;
      throw error;
    }
    overridesToRecord.push(pending);
  }

  const result = await sequelize.transaction(async (transaction) => {
    const [rows] = await sequelize.query(
      `UPDATE discharge_packets
       SET status = 'signed', signed_by = :by, signed_at = NOW(),
           final_content = COALESCE(:final, draft_content), updated_at = NOW()
       WHERE id = :id AND organization_id = :orgId AND status = 'draft'
       RETURNING id, admission_id AS "admissionId", status, signed_by AS "signedBy", signed_at AS "signedAt",
                 draft_content AS "draftContent", final_content AS "finalContent", prepared_by AS "preparedBy"`,
      { replacements: { id: packetId, orgId: organizationId, by: signedBy, final: finalContent || null }, type: QueryTypes.UPDATE, transaction }
    );
    if (!rows.length) {
      throw Object.assign(new Error('Discharge draft not found or already signed'), { status: 409, code: 'DISCHARGE_ALREADY_SIGNED' });
    }
    for (const items of overridesToRecord) {
      await sequelize.query(
        `INSERT INTO discharge_overrides (admission_id, organization_id, missing_items, reason_code, approver_id, approver_role)
         VALUES (:admissionId, :orgId, :items::jsonb, :reason, :approver, :role)`,
        { replacements: { admissionId, orgId: organizationId, items: JSON.stringify(items), reason: override.reasonCode, approver: override.approverId, role: override.approverRole }, type: QueryTypes.INSERT, transaction }
      );
    }
    return { success: true, data: rows[0] };
  });

  // Fire-and-forget — never block the sign response on this. Only meaningful when the
  // draft was AI-assisted (has a preparer) and the physician actually edited it.
  const signed = result.data;
  if (signed.preparedBy && signed.draftContent && signed.finalContent) {
    updateDoctorRefinements({
      doctorId: signed.preparedBy,
      draftContent: signed.draftContent,
      finalContent: signed.finalContent,
    }).catch((err) => console.warn('[discharge-workflow] adaptive refinement (fire-and-forget) failed:', err.message));
  }

  return result;
}

// ── Send ─────────────────────────────────────────────────────────────────────

export async function sendDischargePacket(packetId, { channel, deliveryAddress, sentBy, organizationId }) {
  const [rows] = await sequelize.query(
    `UPDATE discharge_packets
     SET status = 'sent', sent_at = NOW(), delivery_channel = :channel,
         delivery_address = :address, updated_at = NOW()
     WHERE id = :id AND organization_id = :orgId AND status = 'signed'
     RETURNING id`,
    { replacements: { id: packetId, orgId: organizationId, channel, address: deliveryAddress || null }, type: QueryTypes.UPDATE }
  );
  if (!rows?.length) {
    throw Object.assign(new Error('No signed discharge packet found to send'), { status: 404, code: 'DISCHARGE_PACKET_NOT_SENDABLE' });
  }
  return { success: true, channel, sentAt: new Date() };
}
