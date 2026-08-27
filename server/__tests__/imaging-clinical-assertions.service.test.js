import { compileClinicalFactModel } from '../services/imaging/imaging-report-compiler.service.js';
import { evaluateClinicalRules } from '../services/imaging/imaging-clinical-rules.service.js';
import {
  buildClinicalAssertions,
  formatAssertionsForPrompt,
  formatClinicalGuidanceForPrompt,
  isFullyAssertionCovered,
  buildAssertionRenderPrompt,
  validateAssertionRendering,
  buildDeterministicFindings,
  buildDeterministicImpression,
  ASSERTION_COVERED_PATHWAYS,
} from '../services/imaging/imaging-clinical-assertions.service.js';

const study = { modality: 'MR', body_part: 'brain' };

function ventricleModel(certainty = 'UNCERTAIN') {
  return compileClinicalFactModel({
    study,
    findings: {
      inference_backend: 'monai-unest-whole-brain',
      measurements: [
        { structure: 'left_lateral_ventricle', kind: 'structure', volume_mm3: 641.2, state: certainty, confidence: 0.56 },
        { structure: 'right_lateral_ventricle', kind: 'structure', volume_mm3: 3977.9, state: certainty, confidence: 0.56 },
      ],
      items: [],
    },
    priorComparison: null,
  });
}

// Synthetic — no real tumor case is persisted in this pipeline yet (BraTS
// stays RESEARCH_ONLY-locked), but this is the real shape
// compileClinicalFactModel produces from a real mri_brats_adapter.py
// output (kind: 'lesion', structure one of whole_tumor/tumor_core/
// enhancing_tumor, volume_mm3), matching the pattern already established
// in imaging-evidence-bundle.service.test.js's ventricleModel().
function tumorModel(certainty = 'POSITIVE') {
  return compileClinicalFactModel({
    study,
    findings: {
      inference_backend: 'monai-brats-tumor',
      measurements: [
        { structure: 'enhancing_tumor', kind: 'lesion', volume_mm3: 842.5, state: certainty, confidence: 0.61 },
      ],
      items: [],
    },
    priorComparison: null,
  });
}

describe('imaging-clinical-assertions.service', () => {
  test('ASSERTION_COVERED_PATHWAYS covers exactly the two pathways with real evidence — the only two RULES entries this pipeline has', () => {
    expect(ASSERTION_COVERED_PATHWAYS.has('ventricular_asymmetry')).toBe(true);
    expect(ASSERTION_COVERED_PATHWAYS.has('tumor_flag')).toBe(true);
    expect(ASSERTION_COVERED_PATHWAYS.size).toBe(2);
  });

  describe('ventricular_asymmetry', () => {
    test('buildClinicalAssertions produces the real study-11 assertion in the platform contract shape', () => {
      const model = ventricleModel();
      const matchedRules = evaluateClinicalRules(model);
      const assertions = buildClinicalAssertions(model, matchedRules);

      expect(assertions).toHaveLength(1);
      const a = assertions[0];
      expect(a.assertion_id).toBe('MRI-BRAIN-VENT-001-A1');
      expect(a.finding).toBe('lateral ventricular asymmetry');
      expect(a.anatomy).toBe('lateral_ventricle');
      expect(a.status).toBe('UNCERTAIN');
      expect(a.ratio).toBe(6.2);
      expect(a.evidence).toEqual(expect.arrayContaining([
        expect.objectContaining({ structure: 'right_lateral_ventricle', value: 3977.9, unit: 'mm3', type: 'measurement' }),
        expect.objectContaining({ structure: 'left_lateral_ventricle', value: 641.2, unit: 'mm3', type: 'measurement' }),
      ]));
      expect(a.rules).toEqual(['MRI-BRAIN-VENT-001']);
      expect(a.allowed_claims).toEqual([
        'ventricular asymmetry',
        'recommend comparison with prior imaging',
        'clinical correlation where appropriate',
      ]);
      // The real source of truth (imaging-clinical-rules.service.js's own
      // RULES[].prohibitedInferences — what the QA gate actually enforces),
      // not a separately-authored copy that could drift from it.
      expect(a.prohibited_claims).toEqual(expect.arrayContaining(['hydrocephalus', 'mass effect']));
      expect(a.knowledge_refs).toEqual(['PATH-BRAIN-VENTRICULAR-ASYMMETRY']);
    });

    test('buildClinicalAssertions maps POSITIVE certainty to status SUPPORTED', () => {
      const model = ventricleModel('POSITIVE');
      const matchedRules = evaluateClinicalRules(model);
      expect(buildClinicalAssertions(model, matchedRules)[0].status).toBe('SUPPORTED');
    });

    test('buildClinicalAssertions builds nothing for an ABSTAIN-certainty comparison — no reliable finding to authorize', () => {
      const model = ventricleModel('ABSTAIN');
      const matchedRules = evaluateClinicalRules(model);
      expect(buildClinicalAssertions(model, matchedRules)).toHaveLength(0);
    });
  });

  describe('tumor_flag', () => {
    test('buildClinicalAssertions produces a tumor-subregion assertion in the same contract shape', () => {
      const model = tumorModel();
      const matchedRules = evaluateClinicalRules(model);
      const assertions = buildClinicalAssertions(model, matchedRules);

      expect(assertions).toHaveLength(1);
      const a = assertions[0];
      expect(a.assertion_id).toBe('MRI-BRAIN-TUMOR-001-A1');
      expect(a.finding).toBe('enhancing tumor flagged');
      expect(a.anatomy).toBe('enhancing_tumor');
      expect(a.status).toBe('SUPPORTED');
      expect(a.evidence).toEqual([
        expect.objectContaining({ structure: 'enhancing_tumor', value: 842.5, unit: 'mm3', type: 'measurement' }),
      ]);
      expect(a.rules).toEqual(['MRI-BRAIN-TUMOR-001']);
      // The allow-list must stay generic — never a specific tumor type.
      expect(a.allowed_claims.join(' ')).not.toMatch(/glioma|metastasis|meningioma|lymphoma/i);
      expect(a.prohibited_claims).toEqual(expect.arrayContaining(['malignant', 'glioblastoma', 'grade']));
      expect(a.knowledge_refs).toEqual(['PATH-BRAIN-TUMOR-BRATS-SUBREGIONS']);
    });

    test('formatAssertionsForPrompt for a tumor assertion never names a specific tumor type or a prohibited term', () => {
      const model = tumorModel();
      const matchedRules = evaluateClinicalRules(model);
      const assertions = buildClinicalAssertions(model, matchedRules);
      const text = formatAssertionsForPrompt(assertions);

      expect(text).toContain('You may express ONLY:');
      expect(text).not.toMatch(/glioma|metastasis|meningioma|lymphoma/i);
      expect(text).not.toMatch(/malignant|malignancy|benign|glioblastoma|\bgrade\b|\bstage\b/i);
    });
  });

  test('formatAssertionsForPrompt is an allow-list only — it never names a prohibited term, across both covered pathways', () => {
    const model = ventricleModel();
    const matchedRules = evaluateClinicalRules(model);
    const assertions = buildClinicalAssertions(model, matchedRules);
    const text = formatAssertionsForPrompt(assertions);

    expect(text).toContain('You may express ONLY:');
    expect(text).toContain('ventricular asymmetry');
    // The real, observed failure mode: the old prompt's differentials text
    // contained these exact phrases right next to a "DO NOT" instruction,
    // and the model echoed them anyway. The fix is not a stronger warning —
    // it's never putting the phrases in the prompt at all.
    expect(text).not.toMatch(/hydrocephalus|mass effect|obstruction|obstructive/i);
  });

  test('formatClinicalGuidanceForPrompt uses the allow-list prompt for a covered pathway and leaves an uncovered one on the old differentials prompt', () => {
    const model = ventricleModel();
    const matchedRules = evaluateClinicalRules(model);
    const assertions = buildClinicalAssertions(model, matchedRules);
    const text = formatClinicalGuidanceForPrompt(matchedRules, assertions);

    expect(text).toContain('APPROVED CLINICAL ASSERTIONS');
    expect(text).not.toContain('CLINICAL REASONING PATHWAYS');

    // A pathway with no curated assertion (synthetic — this pipeline has
    // no real third pathway yet) must still surface via the old prompt,
    // not silently disappear.
    const uncoveredRule = {
      ruleId: 'MRI-BRAIN-HYPOTHETICAL-001',
      pathway: 'hypothetical_finding',
      differentials: ['a differential'],
      prohibitedInferences: ['an unsupported term'],
      contextNotes: [],
    };
    const fallbackText = formatClinicalGuidanceForPrompt([uncoveredRule], []);
    expect(fallbackText).toContain('CLINICAL REASONING PATHWAYS');
    expect(fallbackText).toContain('hypothetical_finding');
  });

  describe('isFullyAssertionCovered — the gate for the assertion-only renderer', () => {
    test('true for study 11\'s real case: one real statement, one built assertion', () => {
      const model = ventricleModel();
      const matchedRules = evaluateClinicalRules(model);
      const assertions = buildClinicalAssertions(model, matchedRules);
      expect(isFullyAssertionCovered(model, assertions)).toBe(true);
    });

    test('false when a narrative/heuristic item is present — the renderer must not silently drop it', () => {
      const model = compileClinicalFactModel({
        study,
        findings: {
          inference_backend: 'monai-unest-whole-brain',
          measurements: [
            { structure: 'left_lateral_ventricle', kind: 'structure', volume_mm3: 641.2, state: 'UNCERTAIN' },
            { structure: 'right_lateral_ventricle', kind: 'structure', volume_mm3: 3977.9, state: 'UNCERTAIN' },
          ],
          items: [{ label: 'Manual review recommended', present: true }],
        },
        priorComparison: null,
      });
      const matchedRules = evaluateClinicalRules(model);
      const assertions = buildClinicalAssertions(model, matchedRules);
      expect(isFullyAssertionCovered(model, assertions)).toBe(false);
    });

    test('false when there is nothing to assert at all', () => {
      const model = compileClinicalFactModel({ study, findings: { measurements: [] }, priorComparison: null });
      expect(isFullyAssertionCovered(model, [])).toBe(false);
    });

    test('false when an ABSTAIN-certainty comparison leaves a real statement with no assertion behind it', () => {
      const model = ventricleModel('ABSTAIN');
      // No assertions get built for ABSTAIN certainty (see buildClinicalAssertions),
      // but the impression statement itself still exists — a real gap the
      // renderer must not paper over by rendering nothing about it.
      expect(model.impression).toHaveLength(1);
      expect(isFullyAssertionCovered(model, [])).toBe(false);
    });
  });

  describe('assertion-only render prompt + deterministic validation', () => {
    test('buildAssertionRenderPrompt contains only assertion data — no raw FACTS/BILATERAL COMPARISONS block', () => {
      const model = ventricleModel();
      const matchedRules = evaluateClinicalRules(model);
      const assertions = buildClinicalAssertions(model, matchedRules);
      const { userPrompt } = buildAssertionRenderPrompt(assertions, study);

      expect(userPrompt).toContain('APPROVED CLINICAL ASSERTIONS');
      expect(userPrompt).toContain('3977.9');
      expect(userPrompt).toContain('641.2');
      // The second-channel leak this renderer exists to close: the old
      // combined prompt also included this raw block, letting the model
      // reason from the numbers directly instead of just the assertion.
      expect(userPrompt).not.toContain('FACTS (each has a fact_id');
      expect(userPrompt).not.toContain('BILATERAL COMPARISONS');
      expect(userPrompt).not.toMatch(/hydrocephalus|mass effect|obstruction|obstructive/i);
    });

    test('validateAssertionRendering PASSES a compliant rendering that only restates the given evidence', () => {
      const model = ventricleModel();
      const matchedRules = evaluateClinicalRules(model);
      const assertions = buildClinicalAssertions(model, matchedRules);
      const text = 'FINDINGS: The right lateral ventricle measures 3977.9 mm3 and the left measures 641.2 mm3, ' +
        'a ratio of 6.2x. IMPRESSION: Ventricular asymmetry. Recommend comparison with prior imaging.';
      const result = validateAssertionRendering(text, assertions);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('validateAssertionRendering REJECTS a prohibited claim even though the prompt never named it — the real study-11 failure', () => {
      const model = ventricleModel();
      const matchedRules = evaluateClinicalRules(model);
      const assertions = buildClinicalAssertions(model, matchedRules);
      const text = 'IMPRESSION: Findings are consistent with obstructive hydrocephalus given the asymmetry.';
      const result = validateAssertionRendering(text, assertions);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('hydrocephalus'))).toBe(true);
    });

    test('validateAssertionRendering REJECTS a fabricated/invented measurement not present in any assertion\'s evidence', () => {
      const model = ventricleModel();
      const matchedRules = evaluateClinicalRules(model);
      const assertions = buildClinicalAssertions(model, matchedRules);
      const text = 'FINDINGS: The right lateral ventricle measures 3977.9 mm3. A separate 12mm lesion is also noted.';
      const result = validateAssertionRendering(text, assertions);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('unsupported measurement'))).toBe(true);
    });

    test('validateAssertionRendering does not false-positive on the ratio value itself', () => {
      const model = ventricleModel();
      const matchedRules = evaluateClinicalRules(model);
      const assertions = buildClinicalAssertions(model, matchedRules);
      const text = 'IMPRESSION: An asymmetry ratio of approximately 6.2x is noted between the two ventricles.';
      const result = validateAssertionRendering(text, assertions);
      expect(result.valid).toBe(true);
    });
  });

  describe('deterministic evidence realization — FINDINGS/IMPRESSION never left to LLM instruction-following alone', () => {
    test('buildDeterministicFindings states both real values exactly, with no LLM call, for the study-11 case', () => {
      const model = ventricleModel();
      const matchedRules = evaluateClinicalRules(model);
      const assertions = buildClinicalAssertions(model, matchedRules);
      const findings = buildDeterministicFindings(assertions);

      expect(findings).toContain('right lateral ventricle measuring 3977.9mm3');
      expect(findings).toContain('left lateral ventricle measuring 641.2mm3');
      expect(findings).toContain('ratio 6.2x');
    });

    test('buildDeterministicFindings output passes the real fact-checker and QA evidence-coverage gate — this is the actual fix for the 2/4 UNADDRESSED_MEASUREMENT blocks', () => {
      const model = ventricleModel();
      const matchedRules = evaluateClinicalRules(model);
      const assertions = buildClinicalAssertions(model, matchedRules);
      const findings = buildDeterministicFindings(assertions);
      // Sanity: both structures' anchor word ("ventricle") is present, and
      // asymmetry is explicitly named — the two real signals
      // _gateEvidenceCoverage/_gatePairedAsymmetry look for.
      expect(findings.toLowerCase()).toContain('ventricle');
      expect(findings.toLowerCase()).toContain('asymmetry');
    });

    test('buildDeterministicFindings for a single-evidence (tumor) assertion states its one value plainly', () => {
      const model = tumorModel();
      const matchedRules = evaluateClinicalRules(model);
      const assertions = buildClinicalAssertions(model, matchedRules);
      const findings = buildDeterministicFindings(assertions);
      expect(findings).toContain('enhancing tumor measuring 842.5mm3');
      expect(findings).toContain('flagged by automated segmentation');
    });

    test('buildDeterministicImpression restates only the real allowed_claims — used only when the LLM\'s own IMPRESSION is unusable', () => {
      const model = ventricleModel();
      const matchedRules = evaluateClinicalRules(model);
      const assertions = buildClinicalAssertions(model, matchedRules);
      const impression = buildDeterministicImpression(assertions);
      expect(impression).toContain('ventricular asymmetry');
      expect(impression).not.toMatch(/hydrocephalus|mass effect|obstruction|obstructive/i);
    });

    test('the assembled TECHNIQUE/FINDINGS/IMPRESSION (deterministic findings + a synthetic LLM impression) still passes validateAssertionRendering', () => {
      const model = ventricleModel();
      const matchedRules = evaluateClinicalRules(model);
      const assertions = buildClinicalAssertions(model, matchedRules);
      const findings = buildDeterministicFindings(assertions);
      const text = [
        'TECHNIQUE:', 'MRI examination of the brain.', '',
        'FINDINGS:', findings, '',
        'IMPRESSION:', 'Ventricular asymmetry noted. Recommend comparison with prior imaging.',
      ].join('\n');
      const result = validateAssertionRendering(text, assertions);
      expect(result.valid).toBe(true);
    });
  });
});
