import {
  compileClinicalFactModel,
  validateClinicalFactModel,
  formatClinicalFactModelForPrompt,
  computeAnalysisStatus,
  renderAbstainReportBody,
  splitReportSections,
  buildDeterministicTechnique,
} from '../services/imaging/imaging-report-compiler.service.js';

describe('imaging-report-compiler.service', () => {
  const study = { modality: 'MR', body_part: 'brain' };

  test('compiles measurements into facts with stable fact_ids', () => {
    const findings = {
      items: [],
      measurements: [
        { structure: 'left_lateral_ventricle', kind: 'structure', volume_mm3: 641.2, state: 'UNCERTAIN', confidence: 0.56, state_reason: 'low confidence' },
        { structure: 'right_lateral_ventricle', kind: 'structure', volume_mm3: 3977.9, state: 'UNCERTAIN', confidence: 0.56, state_reason: 'low confidence' },
      ],
    };
    const model = compileClinicalFactModel({ study, findings, priorComparison: null });
    expect(model.findings).toHaveLength(2);
    expect(model.findings[0].fact_id).toBe('F-1');
    expect(model.findings[0].certainty).toBe('UNCERTAIN');
  });

  test('detects bilateral asymmetry deterministically, without an LLM', () => {
    const findings = {
      measurements: [
        { structure: 'left_lateral_ventricle', kind: 'structure', volume_mm3: 641.2, state: 'UNCERTAIN' },
        { structure: 'right_lateral_ventricle', kind: 'structure', volume_mm3: 3977.9, state: 'UNCERTAIN' },
      ],
    };
    const model = compileClinicalFactModel({ study, findings, priorComparison: null });
    expect(model.comparisons).toHaveLength(1);
    expect(model.comparisons[0].asymmetric).toBe(true);
    expect(model.comparisons[0].ratio).toBeCloseTo(6.2, 1);
    expect(model.impression).toHaveLength(1);
    expect(model.impression[0].statement_type).toBe('asymmetry');
  });

  test('impression certainty is bounded by the weaker of the two paired sides', () => {
    const findings = {
      measurements: [
        { structure: 'left_lateral_ventricle', kind: 'structure', volume_mm3: 641.2, state: 'POSITIVE' },
        { structure: 'right_lateral_ventricle', kind: 'structure', volume_mm3: 3977.9, state: 'ABSTAIN' },
      ],
    };
    const model = compileClinicalFactModel({ study, findings, priorComparison: null });
    expect(model.impression[0].certainty).toBe('ABSTAIN');
  });

  test('below-threshold ratio produces no asymmetry statement', () => {
    const findings = {
      measurements: [
        { structure: 'left_lateral_ventricle', kind: 'structure', volume_mm3: 600, state: 'POSITIVE' },
        { structure: 'right_lateral_ventricle', kind: 'structure', volume_mm3: 700, state: 'POSITIVE' },
      ],
    };
    const model = compileClinicalFactModel({ study, findings, priorComparison: null });
    expect(model.comparisons[0].asymmetric).toBe(false);
    expect(model.impression).toHaveLength(0);
  });

  test('lesion findings (not NEGATIVE) produce an impression statement', () => {
    const findings = {
      measurements: [
        { structure: 'segmented_whole_tumor', kind: 'lesion', volume_mm3: 120, state: 'UNCERTAIN' },
      ],
    };
    const model = compileClinicalFactModel({ study, findings, priorComparison: null });
    expect(model.impression).toHaveLength(1);
    expect(model.impression[0].statement_type).toBe('finding');
  });

  test('NEGATIVE lesion findings produce no impression statement', () => {
    const findings = {
      measurements: [
        { structure: 'segmented_whole_tumor', kind: 'lesion', volume_mm3: 0, state: 'NEGATIVE' },
      ],
    };
    const model = compileClinicalFactModel({ study, findings, priorComparison: null });
    expect(model.impression).toHaveLength(0);
  });

  test('measurements with no state field are marked NOT_ASSESSED, not fabricated as POSITIVE', () => {
    const findings = { measurements: [{ structure: 'spleen', kind: 'structure', volume_mm3: 150 }] };
    const model = compileClinicalFactModel({ study, findings, priorComparison: null });
    expect(model.findings[0].certainty).toBe('NOT_ASSESSED');
  });

  test('validateClinicalFactModel passes on a well-formed compiled model', () => {
    const findings = {
      measurements: [
        { structure: 'left_lateral_ventricle', kind: 'structure', volume_mm3: 641.2, state: 'UNCERTAIN' },
        { structure: 'right_lateral_ventricle', kind: 'structure', volume_mm3: 3977.9, state: 'UNCERTAIN' },
      ],
    };
    const model = compileClinicalFactModel({ study, findings, priorComparison: null });
    const result = validateClinicalFactModel(model);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('validateClinicalFactModel catches a dangling evidence_id (regression guard)', () => {
    const model = compileClinicalFactModel({ study, findings: { measurements: [] }, priorComparison: null });
    model.impression.push({ statement_id: 'I-fake', statement_type: 'finding', subject: 'x', certainty: 'POSITIVE', evidence_ids: ['F-999'] });
    const result = validateClinicalFactModel(model);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/unknown fact_id/);
  });

  test('formatClinicalFactModelForPrompt renders real values, no placeholder text', () => {
    const findings = {
      measurements: [
        { structure: 'left_lateral_ventricle', kind: 'structure', volume_mm3: 641.2, state: 'UNCERTAIN', confidence: 0.56, state_reason: 'low confidence' },
        { structure: 'right_lateral_ventricle', kind: 'structure', volume_mm3: 3977.9, state: 'UNCERTAIN', confidence: 0.56, state_reason: 'low confidence' },
      ],
    };
    const model = compileClinicalFactModel({ study, findings, priorComparison: null });
    const text = formatClinicalFactModelForPrompt(model);
    expect(text).toContain('641.2 mm3');
    expect(text).toContain('3977.9 mm3');
    expect(text).toContain('6.2x');
    expect(text).toContain('certainty=UNCERTAIN');
  });

  test('formatClinicalFactModelForPrompt tells the LLM explicitly when there is no impression', () => {
    const findings = { measurements: [{ structure: 'spleen', kind: 'structure', volume_mm3: 150, state: 'POSITIVE' }] };
    const model = compileClinicalFactModel({ study, findings, priorComparison: null });
    const text = formatClinicalFactModelForPrompt(model);
    expect(text).toContain('No impression statements were compiled');
  });
});

describe('imaging-report-compiler.service — study-level ABSTAIN (AJITHA regression)', () => {
  test('computeAnalysisStatus is ANALYZED when a real backend produced findings', () => {
    const status = computeAnalysisStatus({ inference_backend: 'monai-unest-whole-brain' });
    expect(status.status).toBe('ANALYZED');
  });

  test('computeAnalysisStatus is GOVERNANCE_LOCK (IDHEERA case) when a real applicable model exists but is locked', () => {
    // Real case: brain MRI — both backends cover this anatomy
    // (anatomy_applicable: true) but neither is CLINICAL yet.
    const findings = {
      inference_backend: 'heuristic',
      applicability: {
        backend_status: [
          { backend: 'brats_tumor', available: false, capability_status: 'RESEARCH_ONLY', anatomy_applicable: true, reason: "CAPABILITY_STATUS is 'RESEARCH_ONLY'..." },
          { backend: 'unest_whole_brain', available: false, capability_status: 'RESEARCH_ONLY', anatomy_applicable: true, reason: "CAPABILITY_STATUS is 'RESEARCH_ONLY'..." },
        ],
      },
    };
    const status = computeAnalysisStatus(findings);
    expect(status.status).toBe('ABSTAIN');
    expect(status.reason_code).toBe('GOVERNANCE_LOCK');
    expect(status.reason).toBe('AI model is not currently enabled for clinical interpretation.');
    expect(status.reason_detail).toHaveLength(2);
    expect(status.available_models).toHaveLength(0);
  });

  test('computeAnalysisStatus is NO_APPLICABLE_MODEL (AJITHA case) when no backend covers this anatomy, regardless of lock state', () => {
    // Real case: neck MRI — both backends are brain-only, so neither
    // applies here no matter what CAPABILITY_STATUS says.
    const findings = {
      inference_backend: 'heuristic',
      applicability: {
        backend_status: [
          { backend: 'brats_tumor', available: false, capability_status: 'RESEARCH_ONLY', anatomy_applicable: false, reason: "Not applicable to body region 'NECK'..." },
          { backend: 'unest_whole_brain', available: false, capability_status: 'RESEARCH_ONLY', anatomy_applicable: false, reason: "Not applicable to body region 'NECK'..." },
        ],
      },
    };
    const status = computeAnalysisStatus(findings);
    expect(status.status).toBe('ABSTAIN');
    expect(status.reason_code).toBe('NO_APPLICABLE_MODEL');
    expect(status.reason).toBe('No validated AI model is available for this examination type.');
  });

  test('computeAnalysisStatus does not silently downgrade to NO_APPLICABLE_MODEL when anatomy_applicable is unknown (older/non-MR caller)', () => {
    const findings = {
      inference_backend: 'heuristic',
      applicability: {
        backend_status: [
          { backend: 'brats_tumor', available: false, capability_status: 'RESEARCH_ONLY', reason: "CAPABILITY_STATUS is 'RESEARCH_ONLY'..." },
          { backend: 'unest_whole_brain', available: false, capability_status: 'RESEARCH_ONLY', reason: "CAPABILITY_STATUS is 'RESEARCH_ONLY'..." },
        ],
      },
    };
    const status = computeAnalysisStatus(findings);
    expect(status.reason_code).toBe('GOVERNANCE_LOCK');
  });

  test('compileClinicalFactModel exposes analysis_status on the compiled model', () => {
    const model = compileClinicalFactModel({
      study: { modality: 'MR', study_description: 'NECK' },
      findings: { inference_backend: 'heuristic', measurements: [], items: [], applicability: { backend_status: [] } },
      priorComparison: null,
    });
    expect(model.analysis_status.status).toBe('ABSTAIN');
    expect(model.study.body_region).toBe('NECK');
  });

  test('renderAbstainReportBody produces the safe fixed output — never inflates a heuristic checklist reminder into a finding', () => {
    // Reproduces the exact real bug: AJITHA 12Y/F (NECK MRI, no applicable
    // brain model) — the only "evidence" was heuristic.py's static
    // MODALITY_HINTS reminder ("Signal abnormality review... compare with
    // prior"), which the old LLM-driven path rendered as "the image
    // demonstrates signal abnormalities". This must never appear again.
    const model = compileClinicalFactModel({
      study: { modality: 'MR', study_description: 'NECK' },
      findings: {
        inference_backend: 'heuristic',
        measurements: [],
        items: [{ label: 'Signal abnormality review', severity: 'low', note: 'Compare with prior if available.', present: true }],
        applicability: {
          backend_status: [
            { backend: 'brats_tumor', available: false, capability_status: 'RESEARCH_ONLY', reason: "CAPABILITY_STATUS is 'RESEARCH_ONLY', not 'CLINICAL'" },
            { backend: 'unest_whole_brain', available: false, capability_status: 'RESEARCH_ONLY', reason: "CAPABILITY_STATUS is 'RESEARCH_ONLY', not 'CLINICAL'" },
          ],
        },
      },
      priorComparison: null,
    });
    const text = renderAbstainReportBody(model);
    expect(text).toContain('MRI NECK');
    expect(text).toContain('neck');
    expect(text).toContain('AI interpretation unavailable. Radiologist assessment required.');
    // The specific sentence that was the real, observed bug must never appear.
    expect(text).not.toMatch(/demonstrates|signal abnormalit(y|ies) (is|are|was|were)?\s*present/i);
    // This is patient/radiologist-facing text, not an engineering log — the
    // real abstention reason (governance-lock strings, internal adapter
    // names like "brats_tumor"/"unest_whole_brain") must never leak into it.
    // That detail still exists — model.analysis_status.reason_detail below —
    // it just belongs to the audit/provenance view now, not the report body.
    expect(text).not.toMatch(/CAPABILITY_STATUS|RESEARCH_ONLY|brats_tumor|unest_whole_brain/);
    expect(model.analysis_status.reason_detail.join(' ')).toContain("CAPABILITY_STATUS is 'RESEARCH_ONLY'");
  });

  test('renderAbstainReportBody has no body-region line when none is known', () => {
    const model = compileClinicalFactModel({
      study: { modality: 'CT' },
      findings: { inference_backend: 'heuristic', measurements: [], items: [], applicability: { backend_status: [] } },
      priorComparison: null,
    });
    const text = renderAbstainReportBody(model);
    expect(text.split('\n')[0]).toBe('CT');
    expect(text).toContain('Automated image interpretation was not available for this examination.');
  });

  test('splitReportSections extracts technique/findings/impression from the ABSTAIN template', () => {
    const model = compileClinicalFactModel({
      study: { modality: 'MR', study_description: 'BRAIN' },
      findings: { inference_backend: 'heuristic', measurements: [], items: [], applicability: { backend_status: [] } },
      priorComparison: null,
    });
    const text = renderAbstainReportBody(model);
    const sections = splitReportSections(text);
    expect(sections.technique).toBe('MRI examination of the brain. Sequence details available in PACS.');
    expect(sections.findings).toBe('Automated image interpretation was not available for this examination.');
    expect(sections.impression).toBe('AI interpretation unavailable. Radiologist assessment required.');
  });

  test('splitReportSections returns null (not fabricated text) for a section the input never had', () => {
    const sections = splitReportSections('FINDINGS:\nsomething.\n\nIMPRESSION:\nsomething else.');
    expect(sections.technique).toBeNull();
    expect(sections.findings).toBe('something.');
    expect(sections.impression).toBe('something else.');
  });

  describe('buildDeterministicTechnique — hard invariant: real metadata in, never a manufactured fact', () => {
    // Real, live-captured failure this exists to fix: asked to write
    // TECHNIQUE freely, BiMediX2-8B produced "repetition time = 4000
    // milliseconds, echo time = 90 milliseconds, field strength = 1
    // Tesla" — a fully plausible-sounding, fully fabricated set of scan
    // parameters that exist nowhere in this study's real metadata.
    const FABRICATED_PARAMETER_PATTERN = /\d+(\.\d+)?\s*(ms|millisecond|tesla|t\b|mm slice|slice thickness)/i;

    test('with real modality + body region, states only those two real facts', () => {
      const text = buildDeterministicTechnique({ modality: 'MR', bodyRegion: 'BRAIN' });
      expect(text).toBe('MRI examination of the brain. Sequence details available in PACS.');
      expect(text).not.toMatch(FABRICATED_PARAMETER_PATTERN);
    });

    test('deliberately incomplete metadata (no body region at all) never invents one to fill the gap', () => {
      const text = buildDeterministicTechnique({ modality: 'MR', bodyRegion: null });
      expect(text).toBe('MRI examination. Sequence details available in PACS.');
      expect(text).not.toContain('of the');
      expect(text).not.toMatch(FABRICATED_PARAMETER_PATTERN);
    });

    test('deliberately incomplete metadata (no modality either) falls back to a generic, still-honest label, never a guessed modality', () => {
      const text = buildDeterministicTechnique({ modality: null, bodyRegion: null });
      expect(text).toBe('MRI examination. Sequence details available in PACS.');
      expect(text).not.toMatch(FABRICATED_PARAMETER_PATTERN);
    });

    test('never contains a numeric technical parameter (TR/TE/field strength/slice thickness) for any input — the deterministic function has no such data to draw from, so none can leak in', () => {
      const cases = [
        { modality: 'MR', bodyRegion: 'BRAIN' },
        { modality: 'MR', bodyRegion: 'NECK' },
        { modality: 'CT', bodyRegion: null },
        { modality: null, bodyRegion: 'ABDOMEN' },
      ];
      for (const c of cases) {
        expect(buildDeterministicTechnique(c)).not.toMatch(FABRICATED_PARAMETER_PATTERN);
      }
    });
  });
});
