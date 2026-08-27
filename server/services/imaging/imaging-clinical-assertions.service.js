/**
 * Clinical Assertion layer — the bridge between evaluateClinicalRules()'s
 * matched pathways and what the LLM is actually shown. This is the real
 * platform contract between clinical reasoning and language generation:
 *
 *   DICOM/model measurements -> atomic evidence -> deterministic rule ->
 *   Clinical Assertion -> allowed_claims -> generation-safe RAG ->
 *   LLM renderer -> fact checker -> QA gate
 *
 * The bug this exists to fix: the old prompt (formatClinicalRulesForPrompt)
 * showed the LLM the pathway's raw differentials-to-consider list AND a
 * "DO NOT conclude X" list in the same block — for ventricular_asymmetry,
 * the differentials text literally contains the phrases "mass effect from
 * an adjacent lesion" and "obstructive hydrocephalus", right next to an
 * instruction not to conclude them. BiMediX2-8B ignored the negation and
 * echoed the differentials verbatim into the IMPRESSION (captured live,
 * now the negative case in imaging-golden-brain-mri-ventricle.test.js).
 *
 * The fix is architectural, not a stronger warning: don't show the model a
 * block-list of risky phrases at all. Show it only an allow-list — a
 * small, pre-curated set of clinically safe things it may say for THIS
 * specific, already-established finding — and never mention the
 * prohibited terms in the generation prompt in the first place. The QA
 * gate (_gateProhibitedInference) still independently checks the final
 * text against prohibited_claims regardless of what the prompt said —
 * that defense-in-depth layer is unchanged; this only removes the priming
 * risk from the generation step itself.
 *
 * Deliberately scoped to the pathways this pipeline has REAL evidence
 * for — ventricular_asymmetry (mri_unest_adapter.py bilateral comparison)
 * and tumor_flag (mri_brats_adapter.py subregion segmentation) — the same
 * two, and only two, real evidence patterns imaging-clinical-rules.
 * service.js's own RULES array covers.
 *
 * Explicitly NOT covered here yet, and not fabricated: midline shift and
 * hydrocephalus/ventricular-enlargement as standalone findings. Checked
 * directly against both adapters before deciding this — mri_unest_adapter.
 * py's only "midline" concept is an unverified grid-midpoint approximation
 * used internally to pair left/right structures (its own docstring says so
 * explicitly), not a measured anatomic midline-shift distance; neither
 * adapter computes one. Hydrocephalus/enlargement would need a validated
 * normal-ventricular-volume-by-age reference range this session has not
 * sourced (PATH-BRAIN-VENTRICULAR-ASYMMETRY's own content notes no
 * universally agreed threshold was found even for the asymmetry RATIO,
 * let alone an absolute-volume "enlarged" cutoff). Building assertion
 * coverage for either now would be exactly the manufactured-coverage
 * pattern this whole session has been built against — real coverage here
 * needs new Python-side geometry (midline shift) or sourced clinical
 * reference thresholds (enlargement), not a prompt-layer addition. A
 * pathway with no entry below simply falls back to the existing
 * differentials-based prompt untouched.
 */
import { formatClinicalRulesForPrompt } from './imaging-clinical-rules.service.js';

const ALLOWED_CLAIMS = {
  ventricular_asymmetry: [
    'ventricular asymmetry',
    'recommend comparison with prior imaging',
    'clinical correlation where appropriate',
  ],
  // BraTS subregion segmentation flags a region — it does not characterize
  // tissue type, so the allow-list stays deliberately generic; naming a
  // tumor type (glioma, metastasis, meningioma...) would be exactly the
  // over-claim MRI-BRAIN-TUMOR-001's prohibited_claims guards against,
  // same class of risk as ventricular_asymmetry's differentials leak.
  tumor_flag: [
    'a tumor subregion has been flagged by automated segmentation',
    'radiologist review and characterization is required',
    'recommend correlation with clinical history and additional imaging as indicated',
  ],
};

// The real KB canonical_id(s) each pathway's assertion should cite — not a
// separate namespace, the same ids imaging-knowledge-base.service.js's
// SEED_ROWS already define, so this can never point at a reference that
// doesn't exist.
const KNOWLEDGE_REFS = {
  ventricular_asymmetry: ['PATH-BRAIN-VENTRICULAR-ASYMMETRY'],
  tumor_flag: ['PATH-BRAIN-TUMOR-BRATS-SUBREGIONS'],
};

const CERTAINTY_TO_STATUS = {
  POSITIVE: 'SUPPORTED',
  UNCERTAIN: 'UNCERTAIN',
  NEGATIVE: 'NOT_PRESENT',
  NOT_ASSESSED: 'UNCERTAIN',
};

/** Pathways this layer covers — matchedRules for any other pathway keep
 * using the old differentials-based prompt untouched. */
export const ASSERTION_COVERED_PATHWAYS = new Set(Object.keys(ALLOWED_CLAIMS));

function buildVentricularAssertions(clinicalFactModel, ventRules) {
  const assertions = [];
  const counters = {};
  for (const stmt of clinicalFactModel.impression) {
    if (stmt.statement_type !== 'asymmetry' || stmt.certainty === 'ABSTAIN') continue;

    const comparisonId = stmt.statement_id.replace(/^I-/, '');
    const comparison = clinicalFactModel.comparisons.find((c) => c.comparison_id === comparisonId);
    if (!comparison || comparison.base_structure !== 'lateral_ventricle') continue;

    const rule = ventRules.find((r) => r.triggeredBy.includes(comparisonId));
    if (!rule) continue;

    counters[rule.ruleId] = (counters[rule.ruleId] || 0) + 1;
    assertions.push({
      assertion_id: `${rule.ruleId}-A${counters[rule.ruleId]}`,
      finding: 'lateral ventricular asymmetry',
      anatomy: comparison.base_structure,
      status: CERTAINTY_TO_STATUS[stmt.certainty] || 'UNCERTAIN',
      evidence: [
        { id: comparison.right.fact_id, type: 'measurement', structure: `right_${comparison.base_structure}`, value: comparison.right.value, unit: 'mm3' },
        { id: comparison.left.fact_id, type: 'measurement', structure: `left_${comparison.base_structure}`, value: comparison.left.value, unit: 'mm3' },
      ],
      ratio: comparison.ratio,
      rules: [rule.ruleId],
      allowed_claims: ALLOWED_CLAIMS[rule.pathway],
      // Kept on the object for QA/fact-checker/audit use — deliberately
      // NOT rendered into the generation prompt below (see file docstring).
      // The real source of truth for what the QA gate enforces is still
      // imaging-clinical-rules.service.js's RULES[].prohibitedInferences —
      // this is that same real list, not a separately-authored copy.
      prohibited_claims: rule.prohibitedInferences,
      knowledge_refs: KNOWLEDGE_REFS[rule.pathway] || [],
    });
  }
  return assertions;
}

function buildTumorAssertions(clinicalFactModel, tumorRules) {
  const assertions = [];
  const counters = {};
  for (const stmt of clinicalFactModel.impression) {
    if (stmt.statement_type !== 'finding' || stmt.certainty === 'ABSTAIN') continue;

    const factId = stmt.statement_id.replace(/^I-/, '');
    const finding = clinicalFactModel.findings.find((f) => f.fact_id === factId);
    if (!finding || finding.kind !== 'lesion' || !String(finding.structure).includes('tumor')) continue;

    const rule = tumorRules.find((r) => r.triggeredBy.includes(factId));
    if (!rule) continue;

    const evidenceItem = finding.volume_mm3 != null
      ? { id: factId, type: 'measurement', structure: finding.structure, value: finding.volume_mm3, unit: 'mm3' }
      : finding.size_mm != null
        ? { id: factId, type: 'measurement', structure: finding.structure, value: finding.size_mm, unit: 'mm' }
        : { id: factId, type: 'detection', structure: finding.structure };

    counters[rule.ruleId] = (counters[rule.ruleId] || 0) + 1;
    assertions.push({
      assertion_id: `${rule.ruleId}-A${counters[rule.ruleId]}`,
      finding: `${String(finding.structure).replace(/_/g, ' ')} flagged`,
      anatomy: finding.structure,
      status: CERTAINTY_TO_STATUS[stmt.certainty] || 'UNCERTAIN',
      evidence: [evidenceItem],
      rules: [rule.ruleId],
      allowed_claims: ALLOWED_CLAIMS[rule.pathway],
      prohibited_claims: rule.prohibitedInferences,
      knowledge_refs: KNOWLEDGE_REFS[rule.pathway] || [],
    });
  }
  return assertions;
}

/**
 * Deterministic, no LLM. Turns each matched rule and its triggering
 * evidence into the approved assertion object for its pathway. A rule
 * match with no correspondingly reliable impression statement (e.g.
 * ABSTAIN certainty — nothing the pipeline can actually stand behind)
 * produces no assertion: the deterministic layer has nothing to authorize
 * there, so none is fabricated.
 */
export function buildClinicalAssertions(clinicalFactModel, matchedRules) {
  const ventRules = matchedRules.filter((r) => r.pathway === 'ventricular_asymmetry');
  const tumorRules = matchedRules.filter((r) => r.pathway === 'tumor_flag');
  return [
    ...(ventRules.length ? buildVentricularAssertions(clinicalFactModel, ventRules) : []),
    ...(tumorRules.length ? buildTumorAssertions(clinicalFactModel, tumorRules) : []),
  ];
}

function formatEvidence(evidence) {
  return evidence.map((e) => (
    e.value != null ? `${e.structure}=${e.value}${e.unit || ''}` : `${e.structure} (detected)`
  )).join(', ');
}

/** Allow-list-only prompt block. No prohibited term is ever named here —
 * the instruction is "here is everything you may say", not "here is what
 * to avoid saying", which is the actual fix (see file docstring). */
export function formatAssertionsForPrompt(assertions) {
  if (!assertions.length) return '';
  const lines = [
    '',
    'APPROVED CLINICAL ASSERTIONS (the deterministic clinical-rules layer already determined what may be said ' +
      'about these findings — render ONLY the language listed below for each; do not introduce any diagnosis, ' +
      'causal mechanism, or interpretation beyond what is explicitly listed as allowed, even if it seems ' +
      'clinically plausible):',
  ];
  for (const a of assertions) {
    lines.push(
      `- [${a.assertion_id}] Finding: ${a.finding} (${a.anatomy}). Evidence: ${formatEvidence(a.evidence)}` +
        `${a.ratio != null ? `, ratio=${a.ratio}x` : ''}. Status: ${a.status}.`,
      `  You may express ONLY: ${a.allowed_claims.join('; ')}.`,
    );
  }
  return lines.join('\n');
}

/** What the LLM prompt actually renders for matched rules: a pathway with
 * a built assertion uses ONLY the safe allow-list text above; every other
 * pathway keeps using the existing differentials-based prompt unchanged. */
export function formatClinicalGuidanceForPrompt(matchedRules, assertions) {
  const uncovered = matchedRules.filter((r) => !ASSERTION_COVERED_PATHWAYS.has(r.pathway));
  return formatClinicalRulesForPrompt(uncovered) + formatAssertionsForPrompt(assertions);
}

/**
 * True only when the assertion layer accounts for EVERY real, non-ABSTAIN
 * clinical statement this study has — no narrative/heuristic checklist
 * items present, and no impression statement left without a matching
 * assertion (an uncovered pathway, or a rule that didn't match). This is
 * the gate for the assertion-only renderer below: it may see ONLY
 * assertions and nothing else, so it can only be used when assertions are
 * genuinely the whole clinical picture, not a partial one that would leave
 * real findings unreported. buildClinicalAssertions() adds exactly one
 * assertion per qualifying statement it can build for, so an equal count
 * means 1:1 coverage — not a coincidence, a property of how it's built.
 */
export function isFullyAssertionCovered(clinicalFactModel, assertions) {
  if (clinicalFactModel.narrative_items?.some((n) => n.present)) return false;
  const relevantStatements = (clinicalFactModel.impression || []).filter((s) => s.certainty !== 'ABSTAIN');
  if (!relevantStatements.length) return false;
  return relevantStatements.length === assertions.length;
}

/**
 * Deterministic evidence realization: the exact sentence stating an
 * assertion's measured values, composed here — never left to the LLM to
 * reliably reproduce. Real, observed failure: across 4 live runs of the
 * assertion-only renderer, BiMediX2-8B produced zero prohibited-claim or
 * fabricated-number violations, but 2/4 times wrote only "ventricular
 * asymmetry is observed" without restating either measured value, tripping
 * _gateEvidenceCoverage (correctly — a report with no numbers can't be
 * verified against the images). That gate stays exactly as strict; this
 * makes it always pass for assertion-covered findings by construction
 * instead of by hoping an 8B model follows a "state every value"
 * instruction. The LLM's role shrinks further: it never touches a number
 * for these findings at all, only the TECHNIQUE/IMPRESSION prose around
 * this sentence.
 */
function formatEvidenceSentence(a) {
  const readable = (s) => String(s).replace(/_/g, ' ');
  // Bilateral pair (ratio present) — the shape both real pathways so far
  // that carry more than one evidence item happen to use.
  if (a.ratio != null && a.evidence.length === 2) {
    const right = a.evidence.find((e) => e.structure.startsWith('right_')) || a.evidence[0];
    const left = a.evidence.find((e) => e.structure.startsWith('left_')) || a.evidence[1];
    return `There is ${a.finding}, with the ${readable(right.structure)} measuring ${right.value}${right.unit} ` +
      `and the ${readable(left.structure)} measuring ${left.value}${left.unit} (ratio ${a.ratio}x).`;
  }
  // Single-evidence finding (e.g. one tumor subregion).
  const e = a.evidence[0];
  if (e && e.value != null) {
    return `A ${readable(e.structure)} measuring ${e.value}${e.unit || ''} has been flagged by automated segmentation.`;
  }
  return `${a.finding.charAt(0).toUpperCase()}${a.finding.slice(1)}.`;
}

/** Deterministically composes the entire FINDINGS section from the
 * assertions' own evidence — one sentence per assertion, joined. Not a
 * template the LLM fills in; this never calls an LLM at all. */
export function buildDeterministicFindings(assertions) {
  return assertions.map(formatEvidenceSentence).join(' ');
}

/** Deterministic fallback IMPRESSION — used only if the LLM's own
 * IMPRESSION is empty or unparseable, so the renderer never has to fully
 * fail just because the model dropped one section. Plain restatement of
 * the allow-listed claims, nothing invented. */
export function buildDeterministicImpression(assertions) {
  const claims = [...new Set(assertions.flatMap((a) => a.allowed_claims))];
  return claims.length ? `${claims.join('. ')}.` : 'Findings as above. Radiologist review required.';
}

/**
 * The assertion-only renderer's prompt: deliberately built from
 * formatAssertionsForPrompt() alone — no formatClinicalFactModelForPrompt()
 * raw FACTS/BILATERAL COMPARISONS/PRE-COMPILED IMPRESSION STATEMENTS block.
 * That raw block is a real, previously-unnoticed second channel to the
 * same numbers: even with an allow-list assertion shown, the old prompt
 * ALSO showed the LLM the same measurements directly via the fact model
 * text, which the model could (and did, across several captured real runs)
 * reason freely about instead of just rendering the assertion. This
 * prompt's user content is exclusively the assertion block — there is
 * nothing else in it to reason from.
 *
 * The LLM is now asked for IMPRESSION only — FINDINGS is deterministic
 * (buildDeterministicFindings above) and TECHNIQUE is deterministic
 * (buildDeterministicTechnique in imaging-report-compiler.service.js),
 * both assembled by the caller, neither requested here at all. The model
 * never has an opportunity to mis-state, round, or omit a measured value,
 * or invent a scan parameter that isn't in this study's real metadata,
 * because it's never asked to produce either.
 */
export function buildAssertionRenderPrompt(assertions, study) {
  const systemPrompt = `You are a radiology report rendering assistant. You will be given one or more APPROVED CLINICAL ASSERTIONS — a deterministic clinical-rules layer has already determined the finding, its evidence, and exactly what may be said about it. TECHNIQUE and FINDINGS (with all measured values) are generated separately and deterministically — you do not need to write either. Your only job is to produce the IMPRESSION section.

Rules:
- Produce exactly one section: IMPRESSION. Do NOT produce a TECHNIQUE or FINDINGS section.
- Express ONLY language consistent with each assertion's allowed_claims — never a diagnosis, differential, causal mechanism, measurement, or anatomy beyond what is given, even if it seems clinically plausible.
- Do not restate a specific numeric measurement — refer to the finding qualitatively (e.g. "the noted asymmetry," "this finding") since the exact values are already stated in FINDINGS.
- Do not introduce any finding, structure, or measurement not present in the assertions below.
- This is a DRAFT for radiologist review — not a final diagnosis. Do NOT include patient-identifying information beyond what is given.`;

  const userPrompt = `Modality: ${study?.modality || 'not specified'}
Body part: ${study?.body_part || 'not specified'}
${formatAssertionsForPrompt(assertions)}

Generate only the IMPRESSION section text, using only the assertions above.`;

  return { systemPrompt, userPrompt };
}

const MEASUREMENT_NUMBER = /(\d+(?:\.\d+)?)\s*(mm3|mm|cm3|cm|x)\b/gi;

/**
 * The deterministic validator the CTO review asked for: reject anything
 * outside the assertion contract, not just check the prompt asked nicely.
 * Two checks, both against the rendered text directly:
 *  - PROHIBITED_CLAIM: any assertion's own prohibited_claims term appears —
 *    duplicates _gateProhibitedInference's later check, deliberately; this
 *    runs immediately after generation, closer to the failure, rather than
 *    only at the end of the full QA pipeline.
 *  - UNSUPPORTED_MEASUREMENT: any mm/mm3/cm/cm3/x number in the text that
 *    doesn't match (within 5% tolerance) some assertion's own evidence
 *    value or ratio — a number the model invented or altered, the same
 *    class of failure as the LLM literally omitting a value (caught by the
 *    fact-checker) but at the opposite end: adding one that isn't real.
 */
export function validateAssertionRendering(text, assertions) {
  const errors = [];
  const rawText = String(text || '');
  const lowerText = rawText.toLowerCase();

  for (const a of assertions) {
    for (const term of a.prohibited_claims || []) {
      if (lowerText.includes(term.toLowerCase())) {
        errors.push(`prohibited claim "${term}" appears in the rendered text (assertion ${a.assertion_id})`);
      }
    }
  }

  const knownValues = [];
  for (const a of assertions) {
    for (const e of a.evidence || []) {
      if (e.value != null) knownValues.push(Number(e.value));
    }
    if (a.ratio != null) knownValues.push(Number(a.ratio));
  }

  let m;
  MEASUREMENT_NUMBER.lastIndex = 0;
  while ((m = MEASUREMENT_NUMBER.exec(rawText))) {
    const n = parseFloat(m[1]);
    const matchesKnown = knownValues.some((k) => Math.abs(n - k) < 0.05 * Math.max(k, 1));
    if (!matchesKnown) errors.push(`unsupported measurement "${m[0].trim()}" does not match any assertion's evidence or ratio`);
  }

  return { valid: errors.length === 0, errors };
}
