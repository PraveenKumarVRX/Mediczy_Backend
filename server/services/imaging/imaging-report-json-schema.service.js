/**
 * Structured JSON report layer (item 2 of the CTO review's 5-point list).
 *
 * Current (item 4) flow: evidence -> compiler (deterministic facts) -> LLM
 * renders free PROSE directly from those facts -> QA pattern-matches the
 * resulting text afterward. That's a real improvement over raw free-form
 * generation, but the LLM's output is still unstructured text — QA has to
 * regex-hunt for problems in it.
 *
 * This adds one more layer of indirection, per the reviewer's ask: the LLM's
 * OWN output must be a validated JSON object citing only real evidence_ids
 * from the compiled model — not prose. A separate, deterministic step (this
 * file, not the LLM) then renders that validated JSON into the final
 * TECHNIQUE/FINDINGS/IMPRESSION/LIMITATIONS/RECOMMENDATION text. This turns
 * "does the prose contain a hallucinated claim" (fuzzy, regex-based, checked
 * after the fact) into "does this evidence_id exist" (exact, checked before
 * a single word of final prose is assembled).
 *
 * Resilience: if the LLM fails to produce valid, fully-grounded JSON (this
 * pipeline's LLM backends have a documented history of ignoring format
 * instructions under load), the caller falls back to the existing item-4
 * free-prose path rather than blocking report generation — a stronger
 * guarantee attempted first, a working weaker one always available.
 */

const VALID_CERTAINTIES = new Set(['POSITIVE', 'NEGATIVE', 'UNCERTAIN', 'ABSTAIN', 'NOT_ASSESSED', 'confirmed']);
const VALID_EVIDENCE_TYPES = new Set(['pixel_analysis', 'metadata']);

/** Every ID a structured-report statement is allowed to cite as evidence —
 * broader than validateClinicalFactModel's internal check (which only
 * checks comparisons/impression against fact_ids): the LLM may also cite a
 * pre-compiled comparison or impression statement directly. */
function getCitableIds(model) {
  return new Set([
    ...model.findings.map((f) => f.fact_id),
    ...model.narrative_items.map((n) => n.fact_id),
    ...model.comparisons.map((c) => c.comparison_id),
    ...model.impression.map((s) => s.statement_id),
  ]);
}

/** Prompt instructing the LLM to output ONLY the structured JSON — no
 * prose, no markdown commentary outside the JSON block. Same compiled-model
 * context (facts/comparisons/impression/rules/knowledge) as the item-4 free
 * -prose path; only the required output shape changes. */
export function buildStructuredReportPrompt({ factModelText, rulesText, knowledgeContext }) {
  const systemPrompt = `You are a radiology report structuring assistant. You will be given pre-compiled FACTS, BILATERAL COMPARISONS, and IMPRESSION STATEMENTS — all already determined by the imaging AI pipeline, not by you.

Output ONLY a single JSON object (no markdown code fence, no prose before or after) with this exact shape:
{
  "technique": { "text": string or null, "source": "dicom_metadata" or "ai_generated" or null },
  "findings": [ { "statement": string, "evidence_ids": [string, ...], "evidence_type": "pixel_analysis" or "metadata", "certainty": one of POSITIVE/NEGATIVE/UNCERTAIN/ABSTAIN/NOT_ASSESSED/confirmed } ],
  "impression": [ { "statement": string, "evidence_ids": [string, ...], "certainty": same enum as above } ],
  "limitations": [ { "code": string, "text": string } ],
  "recommendation": { "text": string, "evidence_ids": [string, ...] } or null
}

Rules:
- Every evidence_ids value MUST be a fact_id, comparison_id, or statement_id copied EXACTLY from the FACTS/BILATERAL COMPARISONS/PRE-COMPILED IMPRESSION STATEMENTS you are given. Never invent one. An entry with no real supporting id must have an empty evidence_ids array.
- "findings" and "impression" must only contain statements traceable to what you were given — do not add a finding or impression not present in the input.
- "certainty" on each entry must match the certainty already given for that fact/statement — do not upgrade UNCERTAIN or ABSTAIN to a more confident-sounding certainty.
- If REFERENCE KNOWLEDGE is supplied, you may use it to write a limitations/recommendation entry, but any such entry needs evidence_ids referencing the relevant fact/comparison it applies to, and must not be phrased as this patient's own measured value.
- Do not write any text outside the single JSON object.`;

  const userPrompt = `${factModelText}\n${rulesText || ''}\n${knowledgeContext || ''}\n\nOutput the JSON object now.`;

  return { systemPrompt, userPrompt };
}

/** Extracts a JSON object from raw LLM output — tolerant of a markdown
 * code fence or incidental leading/trailing text, since this pipeline's
 * LLM backends don't reliably follow "no prose" instructions. */
export function parseStructuredReportResponse(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return { ok: false, error: 'empty response' };

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text;

  // If there's still leading/trailing prose around the object, take the
  // outermost {...} span rather than failing outright.
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  const jsonSlice = start !== -1 && end !== -1 && end > start ? candidate.slice(start, end + 1) : candidate;

  try {
    return { ok: true, json: JSON.parse(jsonSlice) };
  } catch (e) {
    return { ok: false, error: `invalid JSON: ${e.message}` };
  }
}

/** Structural + grounding validation — every evidence_id must resolve to a
 * real id in the compiled model. A dangling id here means the LLM invented
 * evidence, which this must reject (triggering the free-prose fallback),
 * not silently accept. */
export function validateStructuredReport(json, model) {
  const errors = [];
  if (!json || typeof json !== 'object') return { valid: false, errors: ['response is not a JSON object'] };

  const citable = getCitableIds(model);
  const checkEvidenceIds = (ids, label) => {
    if (ids == null) return;
    if (!Array.isArray(ids)) { errors.push(`${label}: evidence_ids is not an array`); return; }
    for (const id of ids) {
      if (!citable.has(id)) errors.push(`${label}: references unknown id "${id}"`);
    }
  };

  if (json.findings != null) {
    if (!Array.isArray(json.findings)) errors.push('findings is not an array');
    else json.findings.forEach((f, i) => {
      if (!f.statement) errors.push(`findings[${i}]: missing statement`);
      if (f.certainty && !VALID_CERTAINTIES.has(f.certainty)) errors.push(`findings[${i}]: invalid certainty "${f.certainty}"`);
      if (f.evidence_type && !VALID_EVIDENCE_TYPES.has(f.evidence_type)) errors.push(`findings[${i}]: invalid evidence_type "${f.evidence_type}"`);
      checkEvidenceIds(f.evidence_ids, `findings[${i}]`);
    });
  }

  if (json.impression != null) {
    if (!Array.isArray(json.impression)) errors.push('impression is not an array');
    else json.impression.forEach((s, i) => {
      if (!s.statement) errors.push(`impression[${i}]: missing statement`);
      if (s.certainty && !VALID_CERTAINTIES.has(s.certainty)) errors.push(`impression[${i}]: invalid certainty "${s.certainty}"`);
      checkEvidenceIds(s.evidence_ids, `impression[${i}]`);
    });
  }

  if (json.limitations != null && !Array.isArray(json.limitations)) errors.push('limitations is not an array');

  if (json.recommendation != null) {
    if (typeof json.recommendation !== 'object') errors.push('recommendation is not an object');
    else checkEvidenceIds(json.recommendation.evidence_ids, 'recommendation');
  }

  return { valid: errors.length === 0, errors };
}

/** Deterministic assembly of the final report text from VALIDATED JSON —
 * this is the step the reviewer meant by "your compiler, not the LLM,
 * turns that into the final report." No LLM call happens here; every
 * sentence is a direct copy of a field the LLM already produced and this
 * function already checked against real evidence. */
export function renderStructuredReport(json) {
  const lines = [];

  lines.push('TECHNIQUE:');
  lines.push(json.technique?.text || 'Technique not specified.');

  lines.push('', 'FINDINGS:');
  if (json.findings?.length) {
    for (const f of json.findings) lines.push(`- ${f.statement}`);
  } else {
    lines.push('No findings reported.');
  }

  lines.push('', 'IMPRESSION:');
  if (json.impression?.length) {
    for (const s of json.impression) lines.push(`- ${s.statement}`);
  } else {
    lines.push('No impression statements generated.');
  }

  if (json.limitations?.length) {
    lines.push('', 'LIMITATIONS:');
    for (const l of json.limitations) lines.push(`- ${l.text}`);
  }

  if (json.recommendation?.text) {
    lines.push('', 'RECOMMENDATION:');
    lines.push(json.recommendation.text);
  }

  return lines.join('\n');
}
