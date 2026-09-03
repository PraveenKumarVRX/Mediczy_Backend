/**
 * Retroactive change-control registration for the five Track B AI prompts
 * shipped in commit 970c3e08 (2026-09-03) without first going through
 * governanceService.proposeChange(), despite CLAUDE.md requiring it for
 * every prompt/model change.
 *
 * This does not fix that after the fact — it can't. What it does is create
 * the real pending_review record each prompt should have had before ship,
 * so a medical director has an actual, reviewable entry in
 * GET /api/ai-governance/changes/pending for each one, with the exact live
 * prompt text attached as newConfig. proposeChange() is already idempotent
 * (skips if a pending_review row exists for the same component+changeType),
 * so this is safe to run on every server start.
 *
 * Deliberately does NOT call approveChange() — that is a medical-director
 * action, not something this code does on their behalf. Until approved,
 * these prompts are running in production ahead of formal review; that is
 * an honest statement about the current state, not something to hide by
 * skipping registration.
 */
import governanceService from '../services/ai-model-governance.service.js';

const CHANGE_TYPE = 'prompt_baseline_registration';

const proposals = [
  {
    component: 'discharge-summary-synthesis-llm',
    description: 'Baseline registration of the discharge-summary synthesis prompt (discharge-workflow.service.js:buildAiDraftText) — replaced a fixed-template generator with real LLM synthesis over the admission record.',
    newConfig: {
      file: 'server/services/discharge-workflow.service.js',
      function: 'buildAiDraftText',
      systemPrompt: `You are drafting a discharge summary for physician review — a DRAFT ONLY, never sent to a patient without physician sign-off.
Review the admission, diagnoses, procedures, medications, labs, and vitals provided and produce a discharge summary.
Do not invent findings, medications, or instructions not supported by the provided data.
Output JSON: {
  "diagnosisSummary", "procedureSummary", "medicationSummary", "followUpSummary",
  "dietInstructions", "activityNotes", "fullNarrative",
  "confidence": 0-1, "missingDataFlags": ["..."]
}`,
    },
    rationale: 'Retroactive registration — this prompt is already live in production. Flagged here so it receives the review it should have had before ship.',
    riskAssessment: 'moderate',
  },
  {
    component: 'ambient-note-synthesis-llm',
    description: 'Baseline registration of the ambient-documentation synthesis prompt (ambient-documentation.service.js:synthesizeAmbientNote) — transcript to structured SOAP note + draft orders.',
    newConfig: {
      file: 'server/services/hospital-os/ambient-documentation.service.js',
      function: 'synthesizeAmbientNote',
      systemPrompt: `You are drafting a structured clinical note from a physician's dictated transcript.
Produce a SOAP-format note plus any orders the dictation implies (labs, medications, imaging).
Do not invent findings, medications, or orders not stated or clearly implied in the transcript.
Output JSON: {
  "soap": { "subjective", "objective", "assessment", "plan" },
  "fullNote": "<the complete formatted note as one string, for the physician to review>",
  "draftOrders": [{ "type": "lab|medication|imaging|referral", "description", "rationale" }],
  "confidence": 0-1
}`,
    },
    rationale: 'Retroactive registration — this prompt is already live in production. Flagged here so it receives the review it should have had before ship.',
    riskAssessment: 'moderate',
  },
  {
    component: 'clinical-coding-suggestion-llm',
    description: 'Baseline registration of the LLM coding-suggestion prompt (clinical-intelligence.service.js:llmCodingSuggestions) — replaced a 5-entry regex table with fixed confidence 0.72 for every match.',
    newConfig: {
      file: 'server/services/clinical-intelligence.service.js',
      function: 'llmCodingSuggestions',
      systemPrompt: `You are a clinical coding assistant suggesting ICD-10 and CPT codes from a clinical note.
Only suggest codes genuinely supported by the note text — do not guess or pad the list.
Output JSON: { "suggestions": [{ "code", "description", "codeSystem": "icd10|cpt", "confidence": 0-1, "evidence" }] }`,
    },
    rationale: 'Retroactive registration — this prompt is already live in production. Flagged here so it receives the review it should have had before ship.',
    riskAssessment: 'low',
  },
  {
    component: 'ai-rcm-claim-scrub-shadow',
    description: 'Baseline registration of the shadow-mode claim-scrub prompt (ai-revenue-intelligence.service.js:runClaimScrubShadow) — coding-vs-documentation comparison, not yet surfaced to coding staff.',
    newConfig: {
      file: 'server/services/ai-revenue-intelligence.service.js',
      function: 'runClaimScrubShadow',
      systemPrompt: `You are a medical coding auditor comparing a submitted diagnosis code against the actual clinical documentation.
Identify specific defects only if genuinely supported by the documentation provided — do not guess.
Output JSON: {
  "defects": [{ "type": "coding_documentation_mismatch|missing_modifier|medical_necessity_concern", "description", "evidence" }],
  "confidence": 0-1
}`,
    },
    rationale: 'Retroactive registration — this prompt is already live in production in shadow mode only (no route surfaces its output to coding staff). Flagged here so it receives the review it should have had before ship, and so exiting shadow mode has a real reviewed baseline to compare future changes against.',
    riskAssessment: 'low',
  },
  {
    component: 'patient-copilot-rag',
    description: 'Baseline registration of the patient-facing record Q&A prompt (routes/patient-copilot.route.js POST /ask) — patientId-scoped RAG over the patient\'s own record, with citations.',
    newConfig: {
      file: 'server/routes/patient-copilot.route.js',
      function: 'POST /ask',
      systemPrompt: `You are a patient's personal health record assistant.
Answer ONLY using the provided context, which belongs exclusively to this one patient.
Never state or imply information about any other patient, even hypothetically.
If the context doesn't answer the question, say so plainly — do not guess or extrapolate.
Cite every factual claim with the source label shown in the context.
If the question is actually a request to book/schedule an appointment (not just asking about
one), include a suggestedAction — you are proposing this for the patient to confirm, you are
never booking it yourself.
Output JSON: {
  "answer", "citations": [{ "source", "excerpt" }], "confidence": 0-1,
  "suggestedAction": null | { "type": "schedule_appointment", "reason", "suggestedConsultationType": "video|audio|chat|in-person|follow-up" }
}`,
    },
    rationale: 'Retroactive registration — this prompt is already live in production. Shipped alongside a fix to rag-pipeline.js\'s search(), which previously had no patient filter on sib_embeddings at all. Flagged here so both the prompt and that fix receive the review they should have had before ship.',
    riskAssessment: 'moderate',
  },
];

export async function registerTrackBPromptGovernance() {
  const registeredIds = [];
  for (const proposal of proposals) {
    try {
      const changeId = await governanceService.proposeChange({
        component: proposal.component,
        changeType: CHANGE_TYPE,
        description: proposal.description,
        previousConfig: null,
        newConfig: proposal.newConfig,
        rationale: proposal.rationale,
        riskAssessment: proposal.riskAssessment,
      });
      registeredIds.push({ component: proposal.component, changeId });
    } catch (err) {
      console.error(`[Governance] Failed to register baseline for ${proposal.component}:`, err.message);
    }
  }
  console.log(`✅ Track B prompt governance baseline registered: ${registeredIds.length}/${proposals.length} components`);
  return registeredIds;
}
