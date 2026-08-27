import { compileClinicalFactModel } from '../services/imaging/imaging-report-compiler.service.js';
import { evaluateClinicalRules, formatClinicalRulesForPrompt } from '../services/imaging/imaging-clinical-rules.service.js';

describe('imaging-clinical-rules.service', () => {
  const study = { modality: 'MR', body_part: 'brain' };

  test('ventricular asymmetry matches MRI-BRAIN-VENT-001', () => {
    const model = compileClinicalFactModel({
      study,
      findings: {
        measurements: [
          { structure: 'left_lateral_ventricle', kind: 'structure', volume_mm3: 641.2, state: 'UNCERTAIN' },
          { structure: 'right_lateral_ventricle', kind: 'structure', volume_mm3: 3977.9, state: 'UNCERTAIN' },
        ],
      },
      priorComparison: null,
    });
    const matched = evaluateClinicalRules(model);
    expect(matched).toHaveLength(1);
    expect(matched[0].ruleId).toBe('MRI-BRAIN-VENT-001');
    expect(matched[0].prohibitedInferences).toContain('hydrocephalus');
  });

  test('no asymmetry -> no rule match', () => {
    const model = compileClinicalFactModel({
      study,
      findings: {
        measurements: [
          { structure: 'left_lateral_ventricle', kind: 'structure', volume_mm3: 600, state: 'POSITIVE' },
          { structure: 'right_lateral_ventricle', kind: 'structure', volume_mm3: 650, state: 'POSITIVE' },
        ],
      },
      priorComparison: null,
    });
    expect(evaluateClinicalRules(model)).toHaveLength(0);
  });

  test('tumor subregion flagged matches MRI-BRAIN-TUMOR-001', () => {
    const model = compileClinicalFactModel({
      study,
      findings: { measurements: [{ structure: 'segmented_whole_tumor', kind: 'lesion', volume_mm3: 120, state: 'UNCERTAIN' }] },
      priorComparison: null,
    });
    const matched = evaluateClinicalRules(model);
    expect(matched.map((m) => m.ruleId)).toContain('MRI-BRAIN-TUMOR-001');
    expect(matched.find((m) => m.ruleId === 'MRI-BRAIN-TUMOR-001').prohibitedInferences).toContain('malignant');
  });

  test('NEGATIVE tumor finding does not match the tumor rule', () => {
    const model = compileClinicalFactModel({
      study,
      findings: { measurements: [{ structure: 'segmented_whole_tumor', kind: 'lesion', volume_mm3: 0, state: 'NEGATIVE' }] },
      priorComparison: null,
    });
    expect(evaluateClinicalRules(model).map((m) => m.ruleId)).not.toContain('MRI-BRAIN-TUMOR-001');
  });

  test('formatClinicalRulesForPrompt names both differentials and prohibited terms', () => {
    const model = compileClinicalFactModel({
      study,
      findings: {
        measurements: [
          { structure: 'left_lateral_ventricle', kind: 'structure', volume_mm3: 641.2, state: 'UNCERTAIN' },
          { structure: 'right_lateral_ventricle', kind: 'structure', volume_mm3: 3977.9, state: 'UNCERTAIN' },
        ],
      },
      priorComparison: null,
    });
    const text = formatClinicalRulesForPrompt(evaluateClinicalRules(model));
    expect(text).toContain('ventricular_asymmetry');
    expect(text).toContain('normal anatomic variation');
    expect(text).toContain('DO NOT conclude');
    expect(text).toContain('hydrocephalus');
  });

  test('formatClinicalRulesForPrompt returns empty string for no matches', () => {
    expect(formatClinicalRulesForPrompt([])).toBe('');
  });
});

describe('imaging-clinical-rules.service — context-aware reasoning (item 4)', () => {
  const study = { modality: 'MR', body_part: 'brain' };
  const asymmetryFindings = {
    measurements: [
      { structure: 'left_lateral_ventricle', kind: 'structure', volume_mm3: 641.2, state: 'UNCERTAIN' },
      { structure: 'right_lateral_ventricle', kind: 'structure', volume_mm3: 3977.9, state: 'UNCERTAIN' },
    ],
  };

  test('pediatric age produces a real context note, not a fabricated one', () => {
    const model = compileClinicalFactModel({ study, findings: asymmetryFindings, priorComparison: null });
    const matched = evaluateClinicalRules(model, { ageYears: 5.6 });
    expect(matched[0].contextNotes).toHaveLength(1);
    expect(matched[0].contextNotes[0]).toContain('pediatric');
    expect(matched[0].contextNotes[0]).toContain('unverified');
  });

  test('adult age produces no pediatric context note', () => {
    const model = compileClinicalFactModel({ study, findings: asymmetryFindings, priorComparison: null });
    const matched = evaluateClinicalRules(model, { ageYears: 45 });
    expect(matched[0].contextNotes).toHaveLength(0);
  });

  test('no age provided produces no pediatric context note (data gap, not assumed adult)', () => {
    const model = compileClinicalFactModel({ study, findings: asymmetryFindings, priorComparison: null });
    const matched = evaluateClinicalRules(model, {});
    expect(matched[0].contextNotes).toHaveLength(0);
  });

  test('a relevant temporal comparison produces a real, grounded context note', () => {
    const model = compileClinicalFactModel({ study, findings: asymmetryFindings, priorComparison: null });
    const temporalComparisons = [
      { fact_id: 'F-2', structure: 'right_lateral_ventricle', prior_value: 3000, current_value: 3977.9, ratio: 1.33, trend: 'INCREASED', prior_certainty: 'POSITIVE' },
    ];
    const matched = evaluateClinicalRules(model, { temporalComparisons });
    expect(matched[0].contextNotes).toHaveLength(1);
    expect(matched[0].contextNotes[0]).toContain('INCREASED');
    expect(matched[0].contextNotes[0]).toContain('3977.9');
    expect(matched[0].contextNotes[0]).toContain('not a diagnosis'); // framing, never presented as a conclusion
  });

  test('a temporal comparison for an unrelated structure is not attached to this rule', () => {
    const model = compileClinicalFactModel({ study, findings: asymmetryFindings, priorComparison: null });
    const temporalComparisons = [
      { fact_id: 'F-99', structure: 'segmented_whole_tumor', prior_value: 10, current_value: 500, ratio: 50, trend: 'INCREASED', prior_certainty: 'POSITIVE' },
    ];
    const matched = evaluateClinicalRules(model, { temporalComparisons });
    expect(matched[0].contextNotes).toHaveLength(0);
  });

  test('formatClinicalRulesForPrompt renders context notes under their pathway', () => {
    const model = compileClinicalFactModel({ study, findings: asymmetryFindings, priorComparison: null });
    const matched = evaluateClinicalRules(model, { ageYears: 5.6 });
    const text = formatClinicalRulesForPrompt(matched);
    expect(text).toContain('CONTEXT:');
    expect(text).toContain('pediatric');
  });

  test('evaluateClinicalRules with no context argument still works (backward compatible)', () => {
    const model = compileClinicalFactModel({ study, findings: asymmetryFindings, priorComparison: null });
    expect(() => evaluateClinicalRules(model)).not.toThrow();
  });
});
