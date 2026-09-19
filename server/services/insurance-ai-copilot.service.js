/**
 * Insurance AI Co-Pilot
 * =====================
 * The AI layer for the claims workflow itself — Mediczy's LLM cascade already
 * powers the clinical scribe and voice assistant, but until now none of it
 * touched insurance-desk work. Two capabilities:
 *
 *  1. draftAppealLetter()      — turns a denial/query reason + the claim's own
 *                                 data into an editable appeal-letter draft.
 *  2. checkDocumentationGaps() — a semantic coherence pass across the claim's
 *                                 stated diagnosis/treatment and whatever
 *                                 insurance-document-ai.service.js already
 *                                 extracted from uploaded documents — the
 *                                 things a deterministic rules engine
 *                                 (claims-rules-engine.service.js) can't
 *                                 catch, like "diagnosis says cardiac surgery
 *                                 but no OT charges on the bill."
 *
 * Both are advisory only — administrative claims support, not a clinical
 * decision (see CLAUDE.md's SaMD table: documentation aids with mandatory
 * staff review are NOT SaMD). Nothing here is ever sent to an insurer or
 * written to a claim without a staff member explicitly reviewing and acting
 * on it through the existing /claims/:claimId/appeal endpoint.
 */

import llmProvider from './ai-brain/llm-provider.js';

function parseJson(responseText) {
  if (!responseText) return null;
  const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function money(n) {
  return `Rs. ${(Number(n) || 0).toLocaleString('en-IN')}`;
}

// ─── Appeal letter drafting ─────────────────────────────────────────────

const APPEAL_PROMPT = `You are an experienced hospital insurance-desk claims officer drafting a formal appeal letter to a health insurer/TPA contesting a claim denial or query.

RULES:
1. Use ONLY the facts provided below — never invent policy clauses, IRDAI regulations, dates, or amounts not given to you.
2. Be firm, professional, and specific — reference the exact denial reason and rebut it with the facts given.
3. If the denial reason references a specific ground (e.g. "pre-existing disease", "non-disclosure", "room rent capping", "documentation incomplete"), address that ground specifically, not generically.
4. Keep it to 3-5 paragraphs: (a) claim identification, (b) the denial reason as stated by the insurer, (c) rebuttal using the facts provided, (d) requested action.
5. Do not fabricate medical opinions beyond what's in the diagnosis/treatment fields given.

Return ONLY valid JSON (no markdown fences):
{
  "subject": "string — appeal letter subject line",
  "body": "string — the full letter body, plain text with paragraph breaks as \\n\\n",
  "keyPointsAddressed": ["short phrases naming which denial grounds this letter rebuts"],
  "confidence": 0.0
}`;

/**
 * @param {object} claim - InsuranceClaim instance or plain object
 * @param {object} [options]
 * @param {string} [options.rejectionReason] - overrides claim.rejectionReason if the
 *        insurer's stated reason isn't yet stored on the claim
 * @param {string} [options.additionalContext] - staff-supplied extra facts
 * @returns {object} { subject, body, keyPointsAddressed, confidence, provider }
 */
export async function draftAppealLetter(claim, options = {}) {
  const c = claim?.toJSON ? claim.toJSON() : claim;
  const reason = options.rejectionReason || c.rejectionReason;
  if (!reason || !String(reason).trim()) {
    throw Object.assign(new Error('No denial/query reason available to draft an appeal against — provide one.'), { statusCode: 400 });
  }

  const facts = [
    `Claim number: ${c.claimNumber}`,
    `Policy number: ${c.policyNumber || 'not on file'}`,
    `Insurer/TPA: ${c.insuranceProvider || 'not on file'}`,
    `Claim amount: ${money(c.claimAmount)}`,
    c.approvedAmount != null ? `Approved amount: ${money(c.approvedAmount)}` : null,
    `Diagnosis: ${c.diagnosis || 'not on file'}`,
    c.hospitalizationDetails?.admissionDate ? `Admission date: ${c.hospitalizationDetails.admissionDate}` : null,
    c.hospitalizationDetails?.dischargeDate ? `Discharge date: ${c.hospitalizationDetails.dischargeDate}` : null,
    c.hospitalizationDetails?.roomCategory ? `Room category: ${c.hospitalizationDetails.roomCategory}` : null,
    c.treatmentDetails?.procedureCode ? `Procedure: ${c.treatmentDetails.procedureCode}` : null,
    `Denial/query reason stated by insurer: "${reason}"`,
    options.additionalContext ? `Additional context from hospital staff: ${options.additionalContext}` : null,
  ].filter(Boolean).join('\n');

  const result = await llmProvider.chat({
    messages: [
      { role: 'system', content: APPEAL_PROMPT },
      { role: 'user', content: `Claim facts:\n${facts}` },
    ],
    temperature: 0.3,
    maxTokens: 1500,
  });

  const parsed = parseJson(result.content);
  // reviewRequired: true on every path, matching the existing convention in
  // ai-model-governance.service.js's clinical-coding-suggestion-llm card
  // ("every billing charge created from a suggestion carries reviewRequired:
  // true"). This is administrative/financial AI (NOT SaMD per CLAUDE.md),
  // but per the audit finding, nothing previously marked this draft as
  // requiring human sign-off before submission to an insurer.
  if (!parsed) {
    return {
      subject: `Appeal — Claim ${c.claimNumber}`,
      body: result.content?.slice(0, 3000) || 'Draft generation failed — please write manually.',
      keyPointsAddressed: [],
      confidence: 0.3,
      provider: result.provider,
      structuredParseFailed: true,
      reviewRequired: true,
      status: 'draft',
    };
  }

  return { ...parsed, provider: result.provider, reviewRequired: true, status: 'draft' };
}

// ─── Documentation coherence check ──────────────────────────────────────

const COHERENCE_PROMPT = `You are a hospital insurance-desk documentation reviewer. You will be given a claim's stated diagnosis/treatment details and the AI-extracted content of whatever discharge summary and bill documents were uploaded against it.

Your job: flag SEMANTIC inconsistencies or gaps that a simple "is this field filled in" check would miss — for example:
- The claim diagnosis doesn't match what the discharge summary says
- The bill has no charges consistent with the stated procedure (e.g. a surgery diagnosis with no OT/anesthesia line items)
- Dates that don't line up (bill date before admission date, etc.)
- A claim type/diagnosis combination that commonly triggers insurer scrutiny (e.g. maternity within a typical waiting period, a named-ailment diagnosis soon after policy start) — flag it for staff to verify against the ACTUAL policy terms, do not assume waiting periods apply or don't.

RULES:
1. Only flag things actually inconsistent in the data given — do not invent facts.
2. If nothing looks wrong, say so — do not manufacture a gap to seem useful.
3. This is a documentation review, not a clinical or coverage determination — always phrase flags as "verify" not "this will be rejected."

Return ONLY valid JSON (no markdown fences):
{
  "coherent": true,
  "gaps": [
    { "severity": "high|medium|low", "description": "string" }
  ],
  "confidence": 0.0
}`;

/**
 * @param {object} claim - InsuranceClaim instance or plain object (documents[] with .extraction expected)
 * @returns {object} { coherent, gaps, confidence, provider }
 */
export async function checkDocumentationGaps(claim) {
  const c = claim?.toJSON ? claim.toJSON() : claim;
  const extractions = (c.documents || [])
    .filter((d) => d.extraction && !d.extraction.extractionFailed)
    .map((d) => ({ type: d.type, extraction: d.extraction }));

  if (extractions.length === 0) {
    return {
      coherent: null,
      gaps: [],
      confidence: 0,
      provider: null,
      skipped: true,
      reason: 'No AI-extracted document content available yet — upload a discharge summary or bill first.',
    };
  }

  const context = [
    `Claim diagnosis: ${c.diagnosis || 'not on file'}`,
    `Claim amount: ${money(c.claimAmount)}`,
    `Hospitalization details: ${JSON.stringify(c.hospitalizationDetails || {})}`,
    `Treatment details: ${JSON.stringify(c.treatmentDetails || {})}`,
    `Extracted document content:\n${JSON.stringify(extractions, null, 2)}`,
  ].join('\n\n');

  const result = await llmProvider.chat({
    messages: [
      { role: 'system', content: COHERENCE_PROMPT },
      { role: 'user', content: context },
    ],
    temperature: 0.1,
    maxTokens: 1200,
  });

  const parsed = parseJson(result.content);
  if (!parsed) {
    return { coherent: null, gaps: [], confidence: 0, provider: result.provider, parseFailed: true };
  }
  return { ...parsed, provider: result.provider };
}

export default { draftAppealLetter, checkDocumentationGaps };
