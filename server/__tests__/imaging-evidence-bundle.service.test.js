import { compileClinicalFactModel } from '../services/imaging/imaging-report-compiler.service.js';
import { routeEvidence } from '../services/imaging/imaging-knowledge-router.service.js';
import { evaluateClinicalRules } from '../services/imaging/imaging-clinical-rules.service.js';
import { buildEvidenceBundle } from '../services/imaging/imaging-evidence-bundle.service.js';

const study = { modality: 'MR', body_part: 'brain' };

function ventricleModel() {
  return compileClinicalFactModel({
    study,
    findings: {
      inference_backend: 'monai-unest-whole-brain',
      measurements: [
        { structure: 'left_lateral_ventricle', kind: 'structure', volume_mm3: 641.2, state: 'UNCERTAIN', confidence: 0.56 },
        { structure: 'right_lateral_ventricle', kind: 'structure', volume_mm3: 3977.9, state: 'UNCERTAIN', confidence: 0.56 },
      ],
      items: [{ label: 'Signal abnormality review', present: true, severity: 'low' }],
    },
    priorComparison: null,
  });
}

describe('imaging-evidence-bundle.service', () => {
  test('produces every field the roadmap contract names, even when empty', () => {
    const model = compileClinicalFactModel({ study, findings: { measurements: [] }, priorComparison: null });
    const bundle = buildEvidenceBundle({ clinicalFactModel: model, routingDecision: routeEvidence({}), knowledgeRows: [], matchedRules: [] });
    for (const key of ['study_context', 'anatomy', 'findings', 'measurements', 'comparisons', 'knowledge_evidence', 'guidelines', 'uncertainties', 'prohibited_inferences']) {
      expect(bundle).toHaveProperty(key);
    }
  });

  test('study_context carries real modality/body_region/analysis_status', () => {
    const model = ventricleModel();
    const bundle = buildEvidenceBundle({ clinicalFactModel: model, routingDecision: routeEvidence({}), knowledgeRows: [], matchedRules: [] });
    expect(bundle.study_context.modality).toBe('MR');
    expect(bundle.study_context.body_region).toBe('brain');
    expect(bundle.study_context.analysis_status).toBe('ANALYZED');
  });

  test('measurements carry real values, units, and certainty — not fabricated', () => {
    const model = ventricleModel();
    const bundle = buildEvidenceBundle({ clinicalFactModel: model, routingDecision: routeEvidence({}), knowledgeRows: [], matchedRules: [] });
    const left = bundle.measurements.find((m) => m.structure === 'left_lateral_ventricle');
    expect(left.value).toBe(641.2);
    expect(left.unit).toBe('mm3');
    expect(left.certainty).toBe('UNCERTAIN');
  });

  test('P8: a matched pathway with a real guideline gets the real versioned object, not the informal reference string', () => {
    const model = ventricleModel();
    const matchedRules = [{ pathway: 'tumor_flag', ruleId: 'MRI-BRAIN-TUMOR-001', guideline: 'See knowledge base PATH-BRAIN-TUMOR-BRATS-SUBREGIONS', prohibitedInferences: [] }];
    const realGuidelines = [{ pathway: 'tumor_flag', guideline_id: 'ACR-AC-BRAIN-TUMORS-2025', title: 'ACR Appropriateness Criteria® Brain Tumors', organization: 'American College of Radiology', version: '2025', publication_date: '2025-01-01', review_status: 'current', source_url: 'https://www.jacr.org/article/S1546-1440(25)00142-5/fulltext', summary: 'real summary text' }];
    const bundle = buildEvidenceBundle({ clinicalFactModel: model, routingDecision: routeEvidence({}), knowledgeRows: [], matchedRules, realGuidelines });
    expect(bundle.guidelines).toHaveLength(1);
    expect(bundle.guidelines[0].guideline_id).toBe('ACR-AC-BRAIN-TUMORS-2025');
    expect(bundle.guidelines[0].organization).toBe('American College of Radiology');
    expect(bundle.guidelines[0].reference).toBeUndefined();
  });

  test('P8: a matched pathway with no real guideline falls back to the rule\'s informal reference, not empty', () => {
    const model = ventricleModel();
    const matchedRules = [{ pathway: 'ventricular_asymmetry', ruleId: 'MRI-BRAIN-VENT-001', guideline: 'See knowledge base PATH-BRAIN-VENTRICULAR-ASYMMETRY', prohibitedInferences: [] }];
    const bundle = buildEvidenceBundle({ clinicalFactModel: model, routingDecision: routeEvidence({}), knowledgeRows: [], matchedRules, realGuidelines: [] });
    expect(bundle.guidelines).toHaveLength(1);
    expect(bundle.guidelines[0].reference).toContain('PATH-BRAIN-VENTRICULAR-ASYMMETRY');
  });

  test('uncertainties collects every non-confident finding and impression statement', () => {
    const model = ventricleModel();
    const bundle = buildEvidenceBundle({ clinicalFactModel: model, routingDecision: routeEvidence({}), knowledgeRows: [], matchedRules: [] });
    expect(bundle.uncertainties.length).toBeGreaterThan(0);
    expect(bundle.uncertainties.some((u) => u.subject === 'left_lateral_ventricle')).toBe(true);
  });

  test('prohibited_inferences flattens every matched rule\'s terms with pathway context', () => {
    const model = ventricleModel();
    const matchedRules = evaluateClinicalRules(model);
    const bundle = buildEvidenceBundle({ clinicalFactModel: model, routingDecision: routeEvidence({}), knowledgeRows: [], matchedRules });
    expect(bundle.prohibited_inferences.some((p) => p.term === 'hydrocephalus' && p.pathway === 'ventricular_asymmetry')).toBe(true);
  });

  test('guidelines carries the matched rule\'s reference, not a fabricated citation', () => {
    const model = ventricleModel();
    const matchedRules = evaluateClinicalRules(model);
    const bundle = buildEvidenceBundle({ clinicalFactModel: model, routingDecision: routeEvidence({}), knowledgeRows: [], matchedRules });
    expect(bundle.guidelines[0].reference).toContain('PATH-BRAIN-VENTRICULAR-ASYMMETRY');
  });

  test('knowledge_evidence carries real retrieval_score when present, null when not', () => {
    const model = ventricleModel();
    const bundleWithScore = buildEvidenceBundle({
      clinicalFactModel: model, routingDecision: routeEvidence({}),
      knowledgeRows: [{ canonical_id: 'X', kind: 'anatomy', preferred_name: 'X', source_title: 'T', source_url: 'U', source_type: 'S', retrieved_at: '2026-01-01', merged_score: 0.87 }],
      matchedRules: [],
    });
    expect(bundleWithScore.knowledge_evidence[0].retrieval_score).toBe(0.87);

    const bundleNoScore = buildEvidenceBundle({
      clinicalFactModel: model, routingDecision: routeEvidence({}),
      knowledgeRows: [{ canonical_id: 'X', kind: 'anatomy', preferred_name: 'X', source_title: 'T', source_url: 'U', source_type: 'S', retrieved_at: '2026-01-01' }],
      matchedRules: [],
    });
    expect(bundleNoScore.knowledge_evidence[0].retrieval_score).toBeNull();
  });

  test('findings includes both metadata narrative items and pixel-derived routed findings, labeled by evidence_type', () => {
    const model = ventricleModel();
    const routingDecision = routeEvidence({ measurements: model.findings, comparisons: model.comparisons });
    const bundle = buildEvidenceBundle({ clinicalFactModel: model, routingDecision, knowledgeRows: [], matchedRules: [] });
    expect(bundle.findings.some((f) => f.evidence_type === 'metadata')).toBe(true);
    expect(bundle.findings.some((f) => f.evidence_type === 'pixel_analysis')).toBe(true);
  });
});
