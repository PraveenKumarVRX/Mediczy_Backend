/**
 * Hospital OS — ambient documentation pipeline status + approval routing
 */
import { createApproval } from './approval-inbox.service.js';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';
import llmProvider from '../ai-brain/llm-provider.js';
import qualityGates from '../ai-quality-gates.service.js';

export async function routeAmbientDocument({
  documentType,
  title,
  content,
  patientId,
  requestedBy,
  metadata = {},
  tenantId = 'default',
}) {
  const riskTier = documentType === 'prescription' || documentType === 'discharge' ? 'T1' : 'T1';
  const approval = await createApproval({
    tenantId,
    approvalType: `ambient_${documentType}`,
    title: title || `Ambient ${documentType}`,
    summary: (content || '').slice(0, 500),
    draftPayload: { documentType, content, metadata },
    patientId,
    requestedBy,
    riskTier,
    source: 'ambient-scribe',
  });

  return {
    approvalId: approval.id,
    status: 'pending_review',
    message: 'Document routed to clinician approval inbox',
    tier: riskTier,
  };
}

// ── Transcript → structured note + draft orders (Upgrade Plan Phase B3) ────
//
// routeAmbientDocument() above always assumed the caller already had
// finished, structured content to route — nothing server-side actually
// turned a raw transcript into that content. This closes that gap: takes
// the raw dictation, produces a SOAP-format note and draft order
// suggestions, runs the note through the same quality gate as any other
// AI-generated clinical text, and returns a result the caller can route
// into the approval inbox via routeAmbientDocument() — it does not
// auto-route itself, so a clinician sees and can edit the draft first.
export async function synthesizeAmbientNote({ transcript, patientId = null, specialtyTemplate = null }) {
  if (!transcript?.trim()) throw new Error('transcript is required');

  let allergies = [];
  let activeMedNames = [];
  if (patientId) {
    const [patient] = await sequelize.query(
      `SELECT allergies FROM patients WHERE id = :patientId LIMIT 1`,
      { replacements: { patientId }, type: QueryTypes.SELECT }
    ).catch(() => [null]);
    allergies = patient?.allergies || [];
  }

  const systemPrompt = `You are drafting a structured clinical note from a physician's dictated transcript.
Produce a SOAP-format note plus any orders the dictation implies (labs, medications, imaging).
Do not invent findings, medications, or orders not stated or clearly implied in the transcript.
Output JSON: {
  "soap": { "subjective", "objective", "assessment", "plan" },
  "fullNote": "<the complete formatted note as one string, for the physician to review>",
  "draftOrders": [{ "type": "lab|medication|imaging|referral", "description", "rationale" }],
  "confidence": 0-1
}`;

  const llm = await llmProvider.chat({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: transcript },
    ],
    temperature: 0.1,
    maxTokens: 1600,
    responseFormat: { type: 'json_object' },
    skipCache: true,
  });

  let parsed;
  try {
    parsed = JSON.parse(llm.content || '{}');
  } catch {
    throw new Error('AI note synthesis returned an unparseable result');
  }
  if (!parsed.fullNote) throw new Error('AI note synthesis did not produce a note');

  const gateResult = await qualityGates.checkScribeOutput({
    noteText: parsed.fullNote,
    patientAllergies: allergies,
    patientMedications: activeMedNames,
    specialtyTemplate,
  });
  await qualityGates.logGateResult(gateResult, { patientId, source: 'ambient-documentation.synthesizeAmbientNote' });

  return {
    soap: parsed.soap || {},
    fullNote: parsed.fullNote,
    draftOrders: parsed.draftOrders || [],
    confidence: parsed.confidence ?? null,
    provider: llm.provider,
    qualityGate: { passed: gateResult.passed, severity: gateResult.severity, warnings: gateResult.warnings, requiredActions: gateResult.requiredActions },
  };
}

export function getAmbientPipelineStatus() {
  return {
    components: {
      offlineScribe: { status: 'operational', path: '/api/offline-scribe' },
      scribeStream: { status: 'operational', path: '/api/scribe/stream' },
      approvalInbox: { status: 'operational', path: '/api/v3/hospital-os/approvals' },
    },
    humanFinalRequired: true,
  };
}

export default { routeAmbientDocument, synthesizeAmbientNote, getAmbientPipelineStatus };
