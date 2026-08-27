/**
 * Clinical Fact Model compiler (item 4 — "stop free-form LLM reporting").
 *
 * Old flow:   evidence -> LLM (invents findings/comparisons/impression from
 *             raw numbers) -> prose -> QA (pattern-matches the prose after
 *             the fact to catch what the LLM got wrong).
 *
 * New flow:   evidence -> compileClinicalFactModel() (deterministic,
 *             no LLM) -> validateClinicalFactModel() -> LLM renders THIS
 *             object into prose, one statement at a time, referencing
 *             fact_ids it isn't allowed to invent -> QA still runs, now
 *             checking prose against a structured object instead of raw
 *             numbers scattered through free text.
 *
 * The LLM's job shrinks from "notice the asymmetry, don't fabricate a norm,
 * remember every measurement" to "write English for facts and statements
 * that already exist" — the same demotion this whole session's QA gates
 * have been enforcing after the fact, moved earlier in the pipeline where
 * it's cheaper to guarantee.
 */

const CERTAINTY_RANK = { ABSTAIN: 0, UNCERTAIN: 1, NOT_ASSESSED: 1, NEGATIVE: 2, POSITIVE: 3 };
const ASYMMETRY_RATIO_THRESHOLD = 2;

function weakestCertainty(list) {
  const valid = list.filter(Boolean);
  if (!valid.length) return 'NOT_ASSESSED';
  return valid.reduce((weakest, c) =>
    (CERTAINTY_RANK[c] ?? 1) < (CERTAINTY_RANK[weakest] ?? 1) ? c : weakest, valid[0]);
}

function computeBilateralComparisons(compiledFindings) {
  const byBase = new Map();
  for (const f of compiledFindings) {
    const name = String(f.structure || '').toLowerCase();
    const value = f.volume_mm3 ?? f.size_mm;
    if (value == null) continue;
    const leftMatch = name.match(/^left[_\s](.+)/);
    const rightMatch = name.match(/^right[_\s](.+)/);
    if (leftMatch) {
      const e = byBase.get(leftMatch[1]) || {};
      e.left = { value, fact_id: f.fact_id, certainty: f.certainty };
      byBase.set(leftMatch[1], e);
    } else if (rightMatch) {
      const e = byBase.get(rightMatch[1]) || {};
      e.right = { value, fact_id: f.fact_id, certainty: f.certainty };
      byBase.set(rightMatch[1], e);
    }
  }
  const comparisons = [];
  for (const [base, pair] of byBase) {
    if (!pair.left || !pair.right || pair.left.value <= 0 || pair.right.value <= 0) continue;
    const ratio = Math.max(pair.left.value, pair.right.value) / Math.min(pair.left.value, pair.right.value);
    comparisons.push({
      comparison_id: `C-${base}`,
      type: 'contralateral',
      base_structure: base,
      left: pair.left,
      right: pair.right,
      ratio: Math.round(ratio * 10) / 10,
      asymmetric: ratio >= ASYMMETRY_RATIO_THRESHOLD,
    });
  }
  return comparisons;
}

function compileImpression(compiledFindings, comparisons) {
  const statements = [];
  for (const c of comparisons) {
    if (!c.asymmetric) continue;
    // The asymmetry claim's own certainty is bounded by the WEAKER of its
    // two paired observations — an asymmetry built from one UNCERTAIN side
    // is itself no more certain than that, regardless of how confident the
    // other side is.
    statements.push({
      statement_id: `I-${c.comparison_id}`,
      statement_type: 'asymmetry',
      subject: c.base_structure,
      certainty: weakestCertainty([c.left.certainty, c.right.certainty]),
      evidence_ids: [c.left.fact_id, c.right.fact_id],
    });
  }
  for (const f of compiledFindings) {
    if (f.kind !== 'lesion') continue;
    if (f.certainty === 'NEGATIVE') continue;
    statements.push({
      statement_id: `I-${f.fact_id}`,
      statement_type: 'finding',
      subject: f.structure,
      certainty: f.certainty,
      evidence_ids: [f.fact_id],
    });
  }
  return statements;
}

/** Human-readable sentence per abstention reason code — for the AI
 * Evidence panel, never the report body. The raw machine reason (backend
 * name + adapter's own `reason` string, e.g. "CAPABILITY_STATUS is
 * 'RESEARCH_ONLY'...") stays available underneath as `reason_detail`, for
 * audit — this map exists so a clinician-facing panel never has to show a
 * governance-state string to explain itself. */
const REASON_MESSAGES = {
  GOVERNANCE_LOCK: 'AI model is not currently enabled for clinical interpretation.',
  NO_APPLICABLE_MODEL: 'No validated AI model is available for this examination type.',
  MODEL_UNAVAILABLE: 'AI model was approved but could not run for this examination.',
  NO_PIXEL_ANALYSIS: 'No automated image analysis was available for this examination.',
};

/**
 * Study-level analysis status — ANALYZED vs ABSTAIN. Distinct from item 3's
 * per-measurement abstention (POSITIVE/NEGATIVE/UNCERTAIN/ABSTAIN on one
 * finding): this is "did any real pixel-level model run on this study at
 * all", using the applicability/backend_status data engine.py's
 * mr_backend_status() now emits.
 *
 * Built after a real bug: AJITHA 12Y/F's (a NECK MRI, no applicable brain
 * model, both backends RESEARCH_ONLY-locked) draft said "the image
 * demonstrates signal abnormalities" — but that sentence's only backing
 * evidence was inference/heuristic.py's static MODALITY_HINTS reminder
 * ("Signal abnormality review... Compare with prior if available"), a
 * process checklist item present on every single MR study regardless of
 * any actual finding, not a detected abnormality. The LLM rendered it
 * faithfully; the bug was upstream of the LLM — heuristic-only evidence
 * was never marked as anything other than a normal finding.
 *
 * Extended after a second real gap: IDHEERA (brain MRI, a real applicable
 * model exists but is governance-locked) and AJITHA (neck MRI, no model
 * covers this anatomy regardless of lock state) used to collapse to the
 * same reason. mr_backend_status() now reports `anatomy_applicable` per
 * backend (a real check against each adapter's APPLICABLE_BODY_REGIONS,
 * not guessed) — this reads that field to tell the two apart: GOVERNANCE_LOCK
 * means a real matching model exists and would run if unlocked;
 * NO_APPLICABLE_MODEL means no model covers this body region at all,
 * independent of lock state. A backend without the field (an older or
 * non-MR caller) is treated as applicable-unknown, never silently
 * downgraded to NO_APPLICABLE_MODEL.
 */
export function computeAnalysisStatus(findings) {
  const backend = findings?.inference_backend || 'heuristic';
  const backendStatusList = findings?.applicability?.backend_status || [];

  if (backend !== 'heuristic') {
    return {
      status: 'ANALYZED',
      reason: null,
      reason_code: null,
      reason_detail: [],
      available_models: backendStatusList.filter((b) => b.available).map((b) => b.backend),
    };
  }

  const unavailable = backendStatusList.filter((b) => !b.available);
  let reasonCode;
  if (!unavailable.length) {
    reasonCode = 'NO_PIXEL_ANALYSIS';
  } else if (unavailable.every((b) => b.anatomy_applicable === false)) {
    reasonCode = 'NO_APPLICABLE_MODEL';
  } else if (unavailable.some((b) => b.anatomy_applicable !== false && b.capability_status && b.capability_status !== 'CLINICAL')) {
    reasonCode = 'GOVERNANCE_LOCK';
  } else {
    reasonCode = 'MODEL_UNAVAILABLE';
  }

  return {
    status: 'ABSTAIN',
    reason: REASON_MESSAGES[reasonCode],
    reason_code: reasonCode,
    reason_detail: unavailable.map((b) => `${b.backend}: ${b.reason}`),
    available_models: [],
  };
}

/** Deterministic transform, no LLM involved — every field here is derived
 * directly from the Python pipeline's own output. */
export function compileClinicalFactModel({ study, findings, priorComparison }) {
  const measurements = Array.isArray(findings?.measurements) ? findings.measurements : [];
  const items = Array.isArray(findings?.items) ? findings.items : (Array.isArray(findings) ? findings : []);

  const compiledFindings = measurements.map((m, idx) => ({
    fact_id: `F-${idx + 1}`,
    structure: m.structure || m.lesion || 'unknown_structure',
    kind: m.kind || 'structure',
    location: m.location ?? null,
    volume_mm3: m.volume_mm3 ?? null,
    size_mm: m.size_mm ?? null,
    // NOT_ASSESSED (not one of item 3's four states) marks a measurement
    // from a backend not yet wired into inference.abstention — an honest
    // "no signal available" distinct from the pipeline actively abstaining.
    certainty: m.state || 'NOT_ASSESSED',
    confidence: m.confidence ?? null,
    certainty_reason: m.state_reason ?? null,
    // Item 9/QA-3 spatial evidence — real (z,y,x) voxel-space location,
    // not a validated attention/heatmap. Absent for measurements from
    // adapters not yet wired to emit it.
    centroid_voxel: m.centroid_voxel ?? null,
    bounding_box_voxel: m.bounding_box_voxel ?? null,
  }));

  const narrativeItems = items.map((it, idx) => ({
    fact_id: `N-${idx + 1}`,
    label: it.label || it.name || 'finding',
    present: it.present !== false,
    severity: it.severity || 'info',
    note: it.note || it.description || null,
  }));

  const comparisons = computeBilateralComparisons(compiledFindings);
  const impression = compileImpression(compiledFindings, comparisons);

  return {
    study: { modality: study?.modality ?? null, body_region: study?.body_part ?? study?.study_description ?? null },
    analysis_status: computeAnalysisStatus(findings),
    findings: compiledFindings,
    narrative_items: narrativeItems,
    comparisons,
    impression,
    prior_comparison_narrative: priorComparison?.narrative ?? null,
  };
}

/**
 * Deterministic (no LLM) report body for the ABSTAIN case.
 *
 * This is patient/radiologist-facing text, not an engineering log — it
 * must read like the metadata-only preliminary report a radiologist is
 * used to seeing, never like a system diagnostic. Earlier versions of this
 * function put the real abstention reason (e.g. "CAPABILITY_STATUS is
 * 'RESEARCH_ONLY', not 'CLINICAL'") directly into a LIMITATIONS section of
 * the report body — technically honest, but wrong audience: a radiologist
 * reading a report should never have to parse internal governance-state
 * strings to find TECHNIQUE/FINDINGS/IMPRESSION. That detail is not lost —
 * `model.analysis_status` (status/reason/reason_detail/available_models)
 * is still returned by compileClinicalFactModel() and still persisted via
 * recordProvenance()'s `applicability` column — it now belongs exclusively
 * to the audit/"AI Details" view, not the report the radiologist reads.
 */
const MODALITY_DISPLAY_NAMES = { MR: 'MRI' };

export function formatModalityDisplay(rawModality) {
  const modality = rawModality || 'MRI';
  return MODALITY_DISPLAY_NAMES[modality] || modality;
}

/**
 * Deterministic TECHNIQUE line — real study.modality/body_region only,
 * never LLM-generated. This is the same principle just proven for
 * FINDINGS (buildDeterministicFindings in imaging-clinical-assertions.
 * service.js), applied here after a real, live-captured failure: asked to
 * write TECHNIQUE freely, BiMediX2-8B fabricated specific scan parameters
 * ("repetition time = 4000 milliseconds, echo time = 90 milliseconds,
 * field strength = 1 Tesla") that exist nowhere in this study's real
 * metadata — plausible-sounding, invented. Real per-sequence metadata
 * (series_description for T1/T2/FLAIR) is computed on the Python side for
 * an analyzed study but not yet forwarded to Node (imaging-findings-
 * extractor.service.js drops it) — a real, separate gap, not fabricated
 * here to look supported. Until it is, this can only ever honestly state
 * modality and body region, and says so plainly rather than inventing
 * technical detail to fill the gap.
 */
export function buildDeterministicTechnique({ modality, bodyRegion }) {
  const displayModality = formatModalityDisplay(modality);
  const region = bodyRegion ? String(bodyRegion).toLowerCase() : null;
  return `${displayModality} examination${region ? ` of the ${region}` : ''}. Sequence details available in PACS.`;
}

export function renderAbstainReportBody(model) {
  const modality = formatModalityDisplay(model.study.modality);
  const bodyRegion = model.study.body_region ? String(model.study.body_region).toLowerCase() : null;
  const header = bodyRegion ? `${modality} ${bodyRegion.toUpperCase()}` : modality;

  return [
    header,
    '',
    'TECHNIQUE:',
    buildDeterministicTechnique({ modality: model.study.modality, bodyRegion: model.study.body_region }),
    '',
    'FINDINGS:',
    'Automated image interpretation was not available for this examination.',
    '',
    'IMPRESSION:',
    'AI interpretation unavailable. Radiologist assessment required.',
  ].join('\n');
}

const SECTION_HEADERS = ['TECHNIQUE', 'FINDINGS', 'IMPRESSION', 'LIMITATIONS', 'RECOMMENDATION'];

/** Splits a rendered report body (from renderAbstainReportBody,
 * renderStructuredReport, or the free-prose LLM path — all three already
 * emit "SECTION:\ncontent" blocks) into named fields for the
 * clinical_report API contract: `{technique, findings, impression}`. Pure
 * string parsing, no LLM call — the three renderers already agree on the
 * section-header convention, this just exposes the pieces separately
 * instead of only the joined text. A section not found (e.g. the free-prose
 * path never emits TECHNIQUE) is null, not fabricated placeholder text. */
export function splitReportSections(text) {
  const raw = String(text || '');
  const pattern = new RegExp(`(^|\\n)(${SECTION_HEADERS.join('|')}):\\s*\\n`, 'g');
  const matches = [...raw.matchAll(pattern)];
  const sections = {};
  for (let i = 0; i < matches.length; i++) {
    const name = matches[i][2].toLowerCase();
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : raw.length;
    sections[name] = raw.slice(start, end).trim() || null;
  }
  return {
    technique: sections.technique ?? null,
    findings: sections.findings ?? null,
    impression: sections.impression ?? null,
  };
}

/** Deterministic checks on the compiled object BEFORE any LLM sees it —
 * every evidence_id referenced by a comparison/impression statement must
 * resolve to a real fact_id/narrative fact_id that actually exists. A
 * dangling reference here is a bug in the compiler itself, not something
 * the LLM could have caused (it hasn't run yet), so this is a hard error,
 * not a QA warning. */
export function validateClinicalFactModel(model) {
  const errors = [];
  const knownIds = new Set([
    ...model.findings.map(f => f.fact_id),
    ...model.narrative_items.map(n => n.fact_id),
  ]);
  for (const c of model.comparisons) {
    if (!knownIds.has(c.left?.fact_id)) errors.push(`Comparison ${c.comparison_id} references unknown fact_id ${c.left?.fact_id}`);
    if (!knownIds.has(c.right?.fact_id)) errors.push(`Comparison ${c.comparison_id} references unknown fact_id ${c.right?.fact_id}`);
  }
  for (const s of model.impression) {
    for (const id of s.evidence_ids || []) {
      if (!knownIds.has(id)) errors.push(`Impression statement ${s.statement_id} references unknown fact_id ${id}`);
    }
  }
  for (const f of model.findings) {
    if (!f.structure) errors.push(`Finding ${f.fact_id} has no structure name`);
  }
  return { valid: errors.length === 0, errors };
}

/** Renders the compiled model into the plain-text block the LLM prompt
 * embeds — the LLM sees exactly this, not the raw Python findings JSON, so
 * it's rendering pre-computed facts/statements rather than deriving them
 * itself from numbers. */
export function formatClinicalFactModelForPrompt(model) {
  const lines = [];
  lines.push(`Study: ${model.study.modality || 'unknown modality'}, ${model.study.body_region || 'body region not specified'}`);

  if (model.findings.length) {
    lines.push('', 'FACTS (each has a fact_id — cite facts, do not restate numbers you were not given):');
    for (const f of model.findings) {
      const value = f.volume_mm3 != null ? `${f.volume_mm3} mm3` : (f.size_mm != null ? `${f.size_mm} mm` : 'no measured value');
      lines.push(`- [${f.fact_id}] ${f.structure} (${f.kind}): ${value}, certainty=${f.certainty}${f.certainty_reason ? ` (${f.certainty_reason})` : ''}`);
    }
  }

  if (model.narrative_items.length) {
    lines.push('', 'ADDITIONAL AI OBSERVATIONS:');
    for (const n of model.narrative_items) {
      lines.push(`- [${n.fact_id}] ${n.label}: ${n.present ? 'present' : 'not present'}${n.note ? ` — ${n.note}` : ''}`);
    }
  }

  if (model.comparisons.length) {
    lines.push('', 'BILATERAL COMPARISONS (pre-computed — do not recompute or restate ratios differently):');
    for (const c of model.comparisons) {
      lines.push(`- [${c.comparison_id}] ${c.base_structure}: left=${c.left.value}, right=${c.right.value}, ratio=${c.ratio}x, asymmetric=${c.asymmetric}`);
    }
  }

  if (model.impression.length) {
    lines.push('', 'PRE-COMPILED IMPRESSION STATEMENTS (render each of these into a sentence — do not add statements not listed here, do not drop any):');
    for (const s of model.impression) {
      lines.push(`- [${s.statement_id}] ${s.statement_type}: ${s.subject}, certainty=${s.certainty}, evidence=[${(s.evidence_ids || []).join(', ')}]`);
    }
  } else if (model.findings.length) {
    lines.push('', 'No impression statements were compiled from the evidence (no asymmetries above threshold, no positive lesion findings) — state that the assessed structures show no flagged abnormality per the facts above.');
  }

  if (model.prior_comparison_narrative) {
    lines.push('', `PRIOR STUDY COMPARISON: ${model.prior_comparison_narrative}`);
  }

  return lines.join('\n');
}
