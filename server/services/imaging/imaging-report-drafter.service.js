/**
 * Phase A: AI-assisted radiology report drafting (Level 1).
 * Structured findings → LLM prose. Physician review mandatory.
 */
import pool from '../../db/pgPool.js';
import llmProvider from '../ai-brain/llm-provider.js';
import qualityGates from '../ai-quality-gates.service.js';
import { publishEvent, KAFKA_TOPICS } from '../../config/kafka.js';
import { getTriageForStudy } from './imaging-triage.service.js';
import { listTemplates } from './imaging-report-templates.service.js';
import { applyTemplate } from './imaging-template-macros.js';
import { compareWithPriorStudies } from './imaging-prior-comparison.service.js';
import { extractStructuredFindings } from './imaging-findings-extractor.service.js';
import { recordMetric } from './imaging-observability.service.js';
import { computeDraftConfidence } from './imaging-report-confidence.js';
import { transitionWorkflow, getWorkflowForStudy } from './imaging-workflow.service.js';
import { persistImagingInterpretation } from './imaging-interpretability.service.js';
import { assertStudyAccess } from './imaging-study-access.service.js';
import { hybridRetrieveKnowledge, formatKnowledgeForPrompt } from './imaging-knowledge-base.service.js';
import { recordProvenance } from './imaging-report-provenance.service.js';
import {
  compileClinicalFactModel,
  validateClinicalFactModel,
  formatClinicalFactModelForPrompt,
  renderAbstainReportBody,
  splitReportSections,
  buildDeterministicTechnique,
} from './imaging-report-compiler.service.js';
import { evaluateClinicalRules } from './imaging-clinical-rules.service.js';
import {
  buildClinicalAssertions,
  formatClinicalGuidanceForPrompt,
  isFullyAssertionCovered,
  buildAssertionRenderPrompt,
  validateAssertionRendering,
  buildDeterministicFindings,
  buildDeterministicImpression,
} from './imaging-clinical-assertions.service.js';
import { compareFactsWithPriorStudy } from './imaging-temporal-comparison.service.js';
import { routeEvidence } from './imaging-knowledge-router.service.js';
import { buildEvidenceBundle } from './imaging-evidence-bundle.service.js';
import { buildClinicalClaims, persistClinicalClaims } from './imaging-clinical-claims.service.js';
import { checkClaimsAgainstReport } from './imaging-fact-checker.service.js';
import { getGuidelinesForPathway } from './imaging-guidelines.service.js';
import {
  buildStructuredReportPrompt,
  parseStructuredReportResponse,
  validateStructuredReport,
  renderStructuredReport,
} from './imaging-report-json-schema.service.js';
import { persistEvidenceGraph } from './imaging-evidence-graph.service.js';

const MODEL_VERSION = 'imaging-report-drafter-v1';
const DISCLAIMER = 'AI-generated draft — radiologist review and sign-off required before clinical use.';

export async function generateReportDraft({
  studyId,
  tenantId: tenantIdIn,
  actorId,
  actorName,
  structuredFindings = null,
  includePriorComparison = true,
  req = null,
}) {
  let study;
  let tenantId = tenantIdIn;
  if (req) {
    const access = await assertStudyAccess(studyId, req);
    study = access.study;
    tenantId = access.tenantId;
  } else {
    const studyRes = await pool.query(
      `SELECT * FROM ris_studies WHERE id = $1 AND lab_id = $2`,
      [studyId, tenantId],
    );
    study = studyRes.rows[0];
    if (!study) throw new Error('Study not found');
  }

  const triage = await getTriageForStudy(study.study_instance_uid, tenantId);
  let findings = structuredFindings;
  if (!findings) {
    findings = await extractStructuredFindings({
      studyInstanceUID: study.study_instance_uid,
      modality: study.modality,
      orthancStudyId: study.orthanc_study_id,
      triageFindings: triage?.findings || [],
    });
  }

  let priorComparison = null;
  let priorNarrative = '';
  if (includePriorComparison) {
    priorComparison = await compareWithPriorStudies({ study, tenantId });
    priorNarrative = priorComparison?.narrative || '';
  }

  const templates = await listTemplates(tenantId, normalizeModality(study.modality));
  const template = templates.find((t) => t.is_default) || templates[0];

  const knowledgeRows = await hybridRetrieveKnowledge({
    measurements: findings?.measurements || [],
    findings: findings?.items || (Array.isArray(findings) ? findings : []),
  }).catch(() => []);

  // Item 4 — evidence is compiled into a deterministic structured object
  // (facts, bilateral comparisons, impression statements — all computed
  // here, not left for the LLM to notice or miss) BEFORE the LLM ever sees
  // it. A validation failure means the compiler itself produced a dangling
  // reference — a bug, not something the LLM caused — so it's logged and
  // the raw findings are used as a degraded fallback rather than blocking
  // report generation entirely.
  const clinicalFactModel = compileClinicalFactModel({ study, findings, priorComparison });
  const modelCheck = validateClinicalFactModel(clinicalFactModel);
  if (!modelCheck.valid) {
    console.error('[ImagingReportDrafter] Clinical Fact Model failed validation:', modelCheck.errors);
  }

  // Knowledge Router (P4) — the same routing decision hybridRetrieveKnowledge
  // makes internally, computed again explicitly here (using the compiled
  // model's comparisons for the richer "derived finding" signal) purely so
  // it's a real, inspectable, persisted artifact rather than a fact only
  // ever known transiently inside a retrieval call.
  const routingDecision = routeEvidence({
    modality: study.modality,
    bodyRegion: clinicalFactModel.study.body_region,
    measurements: findings?.measurements || [],
    findings: findings?.items || (Array.isArray(findings) ? findings : []),
    comparisons: clinicalFactModel.comparisons,
  });

  // Item 4 — real patient context for the reasoning engine: age (already
  // computed by the Python applicability gate, never previously used
  // anywhere else) and a genuine Evidence-Graph-backed prior-study
  // comparison (not an LLM narrative guess — see
  // imaging-temporal-comparison.service.js for why compareWithPriorStudies'
  // own narrative wasn't sufficient here).
  const ageYears = findings?.applicability?.age_years ?? null;
  const temporalComparisons = await compareFactsWithPriorStudy({
    currentFacts: clinicalFactModel.findings,
    priorStudyId: priorComparison?.structuredDiff?.priorStudyId ?? null,
  }).catch((e) => {
    console.error('[ImagingReportDrafter] temporal comparison failed:', e.message);
    return [];
  });

  // Item 5 — deterministic Clinical Reasoning Engine: matches the compiled
  // facts against known pathways (imaging-clinical-rules.service.js) BEFORE
  // the LLM runs, naming both differentials to consider and conclusions the
  // evidence alone does not support. Enforced twice: in the prompt (asked
  // nicely) and in the QA gate below (checked for real).
  const matchedRules = modelCheck.valid ? evaluateClinicalRules(clinicalFactModel, { ageYears, temporalComparisons }) : [];

  // Clinical Assertion layer — the bridge between a matched rule and what
  // the LLM is shown. Scoped to ventricular_asymmetry only for now (see
  // imaging-clinical-assertions.service.js); every other matched pathway
  // still uses the existing differentials-based prompt untouched.
  // Deliberately built even when a structured report is about to be
  // attempted — both prompt paths below route through
  // formatClinicalGuidanceForPrompt() so this applies regardless of which
  // one ends up producing the final draft.
  const clinicalAssertions = modelCheck.valid ? buildClinicalAssertions(clinicalFactModel, matchedRules) : [];

  // P2 — Evidence Bundle: the same data reshaped into the roadmap's named,
  // stable contract (study_context/anatomy/findings/measurements/
  // comparisons/knowledge_evidence/guidelines/uncertainties/
  // prohibited_inferences) — not a new capability, a real versioned shape
  // other consumers can depend on instead of the compiler's internal object.
  // P8 — real versioned guideline objects for any pathway one exists for.
  const realGuidelines = modelCheck.valid
    ? (await Promise.all(matchedRules.map((r) => getGuidelinesForPathway(r.pathway)))).flat()
    : [];

  const evidenceBundle = modelCheck.valid
    ? buildEvidenceBundle({ clinicalFactModel, routingDecision, knowledgeRows, matchedRules, realGuidelines })
    : null;

  // P3 — Clinical Claims: every real measurement as an atomic
  // subject-predicate-object triple, the normalized form a future Fact
  // Checker needs to verify a report sentence's claim against ground truth.
  const clinicalClaims = modelCheck.valid
    ? buildClinicalClaims(clinicalFactModel, { inferenceBackend: findings?.inference_backend })
    : [];

  // Study-level ABSTAIN (no real pixel-level model ran — governance lock,
  // wrong anatomy for the available backends, etc.) skips the LLM entirely
  // for FINDINGS/IMPRESSION. There is no real evidence to render prose
  // for, so there is nothing for an LLM to add except risk — this is the
  // direct fix for a real bug where heuristic-only checklist reminders
  // ("Signal abnormality review... compare with prior") got rendered as
  // "the image demonstrates signal abnormalities". The template renders
  // the same safe, honest text every time from real data.
  const isAbstain = modelCheck.valid && clinicalFactModel.analysis_status?.status === 'ABSTAIN';
  // The assertion layer is the sole source of truth ONLY when it accounts
  // for every real clinical statement this study has — a partial cover
  // would mean rendering from assertions alone silently drops a real
  // finding. When true, the renderer sees ONLY the approved assertions,
  // not the raw fact model — closing the second channel that kept
  // reintroducing prohibited vocabulary even after the prompt-level
  // allow-list fix: the old prompt showed the LLM the SAME numbers again,
  // directly, via formatClinicalFactModelForPrompt's raw FACTS/BILATERAL
  // COMPARISONS block, which the model was free to reason from on its own.
  const fullyAssertionCovered = modelCheck.valid && isFullyAssertionCovered(clinicalFactModel, clinicalAssertions);
  let draftResult;
  if (isAbstain) {
    draftResult = { text: renderAbstainReportBody(clinicalFactModel), model: null, provider: 'deterministic-abstain-template', renderPath: 'deterministic_abstain' };
  } else {
    if (fullyAssertionCovered) {
      draftResult = await llmDraftFromAssertions({ clinicalAssertions, study });
    }
    // Item 2 — structured JSON report layer: try it next. The LLM's own
    // output must be a validated JSON object citing only real evidence_ids
    // from the compiled model; a separate deterministic step (not the LLM)
    // then assembles the final text. Falls back to the existing item-4
    // free-prose path (still evidence-grounded, just checked after
    // generation via regex QA instead of before via exact-id validation)
    // when the LLM fails to produce valid, fully-grounded JSON — a known
    // real risk with this pipeline's LLM backends, not a hypothetical one.
    if (!draftResult) {
      draftResult = modelCheck.valid
        ? await llmDraftStructuredReport({ clinicalFactModel, matchedRules, clinicalAssertions, knowledgeRows })
        : null;
    }
    if (!draftResult) {
      draftResult = await llmDraftReport({
        study,
        findings,
        factModelText: modelCheck.valid
          ? formatClinicalFactModelForPrompt(clinicalFactModel) + formatClinicalGuidanceForPrompt(matchedRules, clinicalAssertions)
          : null,
        priorNarrative,
        templateBody: template?.body,
        knowledgeContext: formatKnowledgeForPrompt(knowledgeRows),
      });
    }
  }
  const draftBody = draftResult.text;

  const confidence = computeDraftConfidence(findings, triage, priorComparison);

  const gateResult = await qualityGates.checkImagingReport({
    studyId,
    modality: study.modality,
    draftText: draftBody,
    structuredFindings: findings,
    confidence,
    triageStatus: triage?.status,
    matchedRules,
  });

  // P9 — Claim Fact Checker: checks the draft against P3's real persisted
  // atomic claims, not the raw findings again. Catches exactly what the
  // master architecture doc's own worked example names (§33) and the
  // existing QA gates verifiably do not: a value/side correctly mentioned
  // somewhere in the evidence but re-stated on the WRONG side or with the
  // WRONG number in the actual report sentence.
  const factCheckResult = checkClaimsAgainstReport(draftBody, clinicalClaims);
  if (factCheckResult.status === 'BLOCK') {
    for (const issue of factCheckResult.issues) {
      gateResult.blockers.push({ code: issue.code, message: issue.message, action: 'Correct the claim before signing — verify against the original evidence' });
    }
    // Mirrors ai-quality-gates.service.js's own _finalize() so a
    // post-hoc addition here can't leave the result's derived fields
    // (severity/hasBlockers/blockingCount) inconsistent with its blockers.
    gateResult.blockingCount = gateResult.blockers.length;
    gateResult.passed = false;
    gateResult.hasBlockers = true;
    gateResult.severity = 'blocked';
  }

  await qualityGates.logGateResult(gateResult, {
    source: 'imaging_report_drafter',
    studyId,
    studyInstanceUID: study.study_instance_uid,
    tenantId,
  });

  const r = await pool.query(
    `INSERT INTO imaging_ai_report_drafts
       (study_id, study_instance_uid, tenant_id, draft_text, structured_findings,
        prior_comparison, confidence_score, model_version, gate_result, created_by, created_by_name)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9::jsonb,$10,$11)
     RETURNING *`,
    [
      studyId,
      study.study_instance_uid,
      tenantId,
      draftBody,
      JSON.stringify(findings),
      priorNarrative || null,
      confidence,
      MODEL_VERSION,
      JSON.stringify(gateResult),
      actorId,
      actorName,
    ],
  );

  const provenance = await recordProvenance({
    draftId: r.rows[0].id,
    studyId,
    studyInstanceUID: study.study_instance_uid,
    tenantId,
    findings,
    knowledgeRows,
    reportDrafterVersion: MODEL_VERSION,
    templateId: template?.id,
    llmModel: draftResult.model,
    llmProviderName: draftResult.provider,
    gateResult,
    confidence,
    routingDecision,
  }).catch((e) => {
    console.error('[ImagingReportDrafter] provenance record failed:', e.message);
    return null;
  });

  if (modelCheck.valid) {
    await persistEvidenceGraph({
      draftId: r.rows[0].id,
      studyId,
      tenantId,
      model: clinicalFactModel,
      matchedRules,
    }).catch((e) => console.error('[ImagingReportDrafter] evidence graph persist failed:', e.message));

    if (clinicalClaims.length) {
      await persistClinicalClaims({
        draftId: r.rows[0].id,
        studyId,
        tenantId,
        claims: clinicalClaims,
      }).catch((e) => console.error('[ImagingReportDrafter] clinical claims persist failed:', e.message));
    }
  }

  const wf = await getWorkflowForStudy(studyId);
  if (wf?.id && wf.state === 'assigned') {
    await transitionWorkflow(wf.id, 'drafting', { id: actorId, name: actorName }).catch(() => {});
  }

  await pool.query(
    `UPDATE ris_studies SET report_text = $2, report_status = 'Draft', workflow_state = 'drafting' WHERE id = $1`,
    [studyId, draftBody],
  ).catch(() => {});

  await publishEvent(KAFKA_TOPICS.IMAGING_REPORT_DRAFTED, {
    studyId,
    studyInstanceUID: study.study_instance_uid,
    tenantId,
    draftId: r.rows[0].id,
    confidence,
    gatePassed: gateResult.passed,
  }).catch(() => {});

  await recordMetric('imaging_report_draft_generated', 1, { modality: study.modality, tenantId });

  const interpretability = await persistImagingInterpretation({
    studyId: study.id,
    studyInstanceUID: study.study_instance_uid,
    tenantId,
    source: MODEL_VERSION,
    structuredFindings: findings,
    triage,
    priorComparison,
    gateResult,
    draftText: draftBody,
  });

  // Two named, stable output shapes (as opposed to the historical
  // draft/gateResult/findings/... grab-bag above, kept for existing
  // callers): `clinical_report` is exactly what a radiologist should see —
  // the TECHNIQUE/FINDINGS/IMPRESSION text plus the one-line disclaimer,
  // nothing else. `ai_explanation` is everything else — analysis status,
  // model/provider, confidence, QA gate result, fact-check result, matched
  // clinical pathways, knowledge sources, the full evidence bundle, and
  // clinical claims — the "why did AI say this" data an AI Evidence panel
  // renders on demand. Same underlying data as the legacy fields; this is
  // just the contract a UI should actually depend on.
  const aiExplanation = {
    analysis_status: clinicalFactModel.analysis_status,
    inference_backend: findings?.inference_backend || 'heuristic',
    llm_called: !isAbstain,
    // Which of the four report-generation paths actually produced this
    // draft — 'assertion_only' is the strictest (LLM saw ONLY approved
    // assertions, no raw fact model), 'structured_json'/'free_prose' are
    // the pre-existing fallbacks, 'deterministic_abstain'/'template_fallback'
    // involve no free LLM generation at all.
    render_path: draftResult.renderPath || null,
    model: draftResult.model || null,
    provider: draftResult.provider || null,
    confidence,
    gate: {
      passed: gateResult.passed,
      severity: gateResult.severity,
      blockers: gateResult.blockers,
    },
    fact_check: factCheckResult,
    matched_pathways: matchedRules.map((r) => ({ pathway: r.pathway, ruleId: r.ruleId })),
    clinical_assertions: clinicalAssertions,
    knowledge_sources: knowledgeRows.map((k) => ({
      canonical_id: k.canonical_id,
      preferred_name: k.preferred_name,
      source_title: k.source_title,
      source_url: k.source_url,
    })),
    evidence_bundle: evidenceBundle,
    clinical_claims: clinicalClaims,
  };

  // technique/findings/impression are parsed out of draftBody (all three
  // renderers already emit "SECTION:\ncontent" blocks) — `text` is kept
  // alongside them as the single editable string the report textarea
  // actually saves/signs; the radiologist edits one document, not three
  // separate boxes.
  const reportSections = splitReportSections(draftBody);

  return {
    draft: r.rows[0],
    disclaimer: DISCLAIMER,
    clinical_report: { ...reportSections, text: draftBody, disclaimer: DISCLAIMER },
    ai_explanation: aiExplanation,
    gateResult,
    findings,
    priorComparison,
    interpretability,
    provenance,
    evidenceBundle,
    clinicalClaims,
  };
}

/**
 * Assertion-only renderer — the strictest path, tried first whenever the
 * assertion layer fully covers the study (isFullyAssertionCovered()). The
 * prompt contains ONLY the approved assertions (buildAssertionRenderPrompt),
 * never the raw compiled fact model, so there is no second channel back to
 * the underlying numbers for the model to reason from independently of the
 * assertion's own allow-list.
 *
 * Deterministic evidence realization: FINDINGS is never requested from the
 * LLM at all — buildDeterministicFindings() composes it directly from the
 * assertions' own evidence, guaranteeing every measured value is present
 * by construction. This is the direct fix for a real, observed gap: across
 * 4 live runs, the model never introduced a prohibited claim or a
 * fabricated number, but 2/4 times it wrote only "ventricular asymmetry is
 * observed" without restating either measured value, correctly tripping
 * _gateEvidenceCoverage (a real, unweakened gate) even though the render
 * itself was otherwise safe. The LLM now only ever supplies TECHNIQUE and
 * IMPRESSION prose around a FINDINGS sentence it never touches — with a
 * deterministic fallback for either section if the LLM's own output is
 * empty or unparseable, so this renderer never has to fully fail just
 * because one section came back malformed.
 *
 * Deterministic TECHNIQUE realization, same principle, same reason:
 * TECHNIQUE was still free LLM text, and a live run fabricated specific
 * scan parameters — "repetition time = 4000 milliseconds, echo time = 90
 * milliseconds, field strength = 1 Tesla" — none of which exist in this
 * study's real metadata. buildDeterministicTechnique() (imaging-report-
 * compiler.service.js) states only real study.modality/body_region and
 * says plainly that sequence detail is in PACS; the LLM is no longer
 * asked to write TECHNIQUE at all, so there's nothing for it to invent.
 * Real per-sequence metadata (T1/T2/FLAIR series_description) is computed
 * on the Python side for an analyzed study but not yet forwarded to Node —
 * a real, separate gap; this does not pretend to use data it doesn't have.
 *
 * validateAssertionRendering() still checks the FULL assembled text (not
 * just the LLM's own output) — not just logs a warning — if it contains a
 * prohibited claim or a measurement that doesn't trace back to an
 * assertion's own evidence; returns null (not a thrown error) on any
 * failure so the caller falls back to the existing structured-JSON, then
 * free-prose, paths.
 */
async function llmDraftFromAssertions({ clinicalAssertions, study }) {
  const { systemPrompt, userPrompt } = buildAssertionRenderPrompt(clinicalAssertions, study);

  let resp;
  try {
    resp = await llmProvider.chat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      maxTokens: 500,
      temperature: 0.1,
    });
  } catch (e) {
    console.error('[ImagingReportDrafter] assertion-only render LLM call failed:', e.message);
    return null;
  }

  // Only IMPRESSION was requested — parse leniently rather than requiring
  // splitReportSections' multi-header pattern (which expects OTHER known
  // headers to anchor against): strip a leading "IMPRESSION:" label if the
  // model included one anyway, otherwise take the response as-is.
  const rawImpression = String(resp.content || '').trim().replace(/^impression:?\s*/i, '').trim();
  const technique = buildDeterministicTechnique({ modality: study?.modality, bodyRegion: study?.body_part });
  const impression = rawImpression || buildDeterministicImpression(clinicalAssertions);
  const findings = buildDeterministicFindings(clinicalAssertions);
  const assembledText = ['TECHNIQUE:', technique, '', 'FINDINGS:', findings, '', 'IMPRESSION:', impression].join('\n');

  const validation = validateAssertionRendering(assembledText, clinicalAssertions);
  if (!validation.valid) {
    console.error('[ImagingReportDrafter] assertion-only render failed contract validation:', validation.errors);
    return null;
  }

  return { text: assembledText, model: resp.model || null, provider: resp.provider || null, renderPath: 'assertion_only' };
}

/**
 * Item 2 — structured JSON report layer. Returns null (not a thrown error)
 * on any failure — malformed JSON, a hallucinated evidence_id, an LLM
 * outage — so the caller falls back to the free-prose path rather than
 * blocking report generation on the stricter path's failure.
 */
async function llmDraftStructuredReport({ clinicalFactModel, matchedRules, clinicalAssertions = [], knowledgeRows }) {
  const factModelText = formatClinicalFactModelForPrompt(clinicalFactModel);
  const rulesText = formatClinicalGuidanceForPrompt(matchedRules, clinicalAssertions);
  const knowledgeContext = formatKnowledgeForPrompt(knowledgeRows);
  const { systemPrompt, userPrompt } = buildStructuredReportPrompt({ factModelText, rulesText, knowledgeContext });

  let resp;
  try {
    // responseFormat activates llm-provider.js's own JSON-mode handling:
    // it validates the response is real JSON and, if not, cascades to the
    // next provider in the fallback chain — instead of accepting whatever
    // the first provider returned and only discovering it's malformed here.
    // This call previously never set it at all, so that existing safety
    // net never engaged; found by diagnosing 5 real, distinct malformed-JSON
    // failures from bi-medix2 (unquoted enum values, findings arrays
    // flattened instead of wrapped in objects, one case of the model's own
    // self-correction narration leaking into a string value, one fabricated
    // ICD-10 code appearing nowhere in the input).
    resp = await llmProvider.chat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      maxTokens: 1200,
      temperature: 0.1,
      responseFormat: { type: 'json_object' },
    });
  } catch (e) {
    console.error('[ImagingReportDrafter] structured report LLM call failed:', e.message);
    return null;
  }

  const parsed = parseStructuredReportResponse(resp.content);
  if (!parsed.ok) {
    console.error('[ImagingReportDrafter] structured report parse failed:', parsed.error);
    return null;
  }

  const validation = validateStructuredReport(parsed.json, clinicalFactModel);
  if (!validation.valid) {
    console.error('[ImagingReportDrafter] structured report failed grounding validation:', validation.errors);
    return null;
  }

  return {
    text: renderStructuredReport(parsed.json),
    model: resp.model || null,
    provider: resp.provider || null,
    structuredJson: parsed.json,
    renderPath: 'structured_json',
  };
}

async function llmDraftReport({ study, findings, factModelText, priorNarrative, templateBody, knowledgeContext = '' }) {
  // With a valid compiled Clinical Fact Model, the LLM's job is rendering —
  // every fact, bilateral comparison, and impression statement was already
  // computed deterministically (imaging-report-compiler.service.js). It
  // isn't asked to notice asymmetry or decide what counts as a finding
  // anymore, only to write English for what it's given. factModelText is
  // null only if compilation validation failed (a compiler bug) — the
  // legacy raw-JSON path below is a degraded fallback for that case, not
  // the normal path.
  const systemPrompt = factModelText
    ? `You are a radiology report rendering assistant. You will be given a pre-compiled set of FACTS, BILATERAL COMPARISONS, and IMPRESSION STATEMENTS — all already determined by the imaging AI pipeline, not by you. Render them into a structured radiology report with FINDINGS and IMPRESSION sections.
Rules:
- Render ONLY what is given. Do not add a finding, comparison, or impression statement that isn't listed. Do not omit one that is listed.
- Do not recompute or restate a ratio/value differently than given — copy the numbers exactly.
- Every FINDINGS sentence should correspond to a specific fact_id or comparison_id from the input; every IMPRESSION sentence should correspond to a specific statement_id.
- A fact/statement with certainty=POSITIVE may be stated plainly. certainty=UNCERTAIN must be hedged ("possible", "low confidence", "recommend correlation"). certainty=ABSTAIN must be stated as "not reliably assessed by AI" — never as present or absent. certainty=NOT_ASSESSED means no AI confidence signal exists for this specific measurement — state it plainly but do not claim a confidence level for it. certainty=NEGATIVE means the AI found no signal — this is a real result, phrase it as such.
- NEVER say a value is "normal", "within normal limits", or cite an institution/reference norm unless the REFERENCE KNOWLEDGE section below is present — and even then it is general background, not a patient-specific normal range.
- If REFERENCE KNOWLEDGE is provided, use it only to explain what a finding could mean or what should be excluded/considered — never present it as this patient's own measured value.
- This is a DRAFT for radiologist review — not a final diagnosis. Do NOT include patient-identifying information beyond what is given.`
    : `You are a radiology report drafting assistant. Generate a structured radiology report with FINDINGS and IMPRESSION sections.
Rules:
- Use only the structured findings provided — do not invent pathology.
- If prior comparison is provided, include relevant interval change in findings.
- Be concise, professional, and use standard radiology language.
- This is a DRAFT for radiologist review — not a final diagnosis.
- Do NOT include patient-identifying information beyond what is given.
- State every measurement given in the structured findings explicitly. If two measurements are a left/right pair, note any large (>=2x) difference between them explicitly using the word "asymmetry" or "asymmetric".
- NEVER say a value is "normal", "within normal limits", or cite an institution/reference norm unless one was explicitly supplied to you — none is unless the REFERENCE KNOWLEDGE section below is present, and even then it is general background, not a patient-specific normal range.
- If REFERENCE KNOWLEDGE is provided below, you may use it to explain what a finding could mean or what should be excluded/considered — but do not present it as this patient's own measured value, and do not omit the uncertainty it describes.`;

  const userPrompt = `Modality: ${study.modality}
Body part: ${study.body_part || 'not specified'}
Study description: ${study.study_description || 'not specified'}
Patient: ${study.patient_name}

${factModelText ? factModelText : `Structured findings JSON:\n${JSON.stringify(findings, null, 2)}`}

${priorNarrative ? `Prior study comparison:\n${priorNarrative}\n` : ''}
${templateBody ? `Use this template structure as guide:\n${templateBody}` : ''}
${knowledgeContext || ''}

Generate the draft report text with FINDINGS and IMPRESSION sections.`;

  const resp = await llmProvider.chat({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    maxTokens: 1200,
    temperature: 0.15,
  });

  const content = (resp.content || '').trim();
  if (content) {
    return { text: content, model: resp.model || null, provider: resp.provider || null, renderPath: 'free_prose' };
  }
  return {
    text: applyTemplate(templateBody || 'FINDINGS:\n{{findings}}\n\nIMPRESSION:\n{{impression}}', {
      technique: `${study.modality} — standard protocol`,
      findings: formatFindingsAsText(findings),
      impression: 'Pending radiologist review.',
    }),
    model: null,
    provider: 'template-fallback',
    renderPath: 'template_fallback',
  };
}

function formatFindingsAsText(findings) {
  if (!findings) return 'See structured findings.';
  if (Array.isArray(findings.items)) {
    return findings.items.map((f) => `- ${f.label || f.name}: ${f.note || f.description || ''}`).join('\n');
  }
  if (Array.isArray(findings)) {
    return findings.map((f) => `- ${f.label}: ${f.note || ''}`).join('\n');
  }
  return JSON.stringify(findings);
}

function normalizeModality(m) {
  const u = (m || 'OT').toUpperCase();
  if (u === 'X-RAY') return 'XR';
  return u;
}

export async function getLatestDraft(studyId, tenantId) {
  const r = await pool.query(
    `SELECT * FROM imaging_ai_report_drafts WHERE study_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1`,
    [studyId, tenantId],
  );
  return r.rows[0] || null;
}

export async function approveDraft(draftId, reviewerId, editedText = null) {
  const r = await pool.query(
    `UPDATE imaging_ai_report_drafts
     SET status = 'approved', reviewed_by = $2, reviewed_at = NOW(),
         draft_text = COALESCE($3, draft_text)
     WHERE id = $1 RETURNING *`,
    [draftId, reviewerId, editedText],
  );
  return r.rows[0];
}
