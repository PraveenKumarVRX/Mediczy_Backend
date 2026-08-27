import { compileClinicalFactModel } from '../services/imaging/imaging-report-compiler.service.js';
import {
  parseStructuredReportResponse,
  validateStructuredReport,
  renderStructuredReport,
} from '../services/imaging/imaging-report-json-schema.service.js';

const study = { modality: 'MR', body_part: 'brain' };

function ventricleModel() {
  return compileClinicalFactModel({
    study,
    findings: {
      inference_backend: 'monai-unest-whole-brain',
      measurements: [
        { structure: 'left_lateral_ventricle', kind: 'structure', volume_mm3: 641.2, state: 'UNCERTAIN' },
        { structure: 'right_lateral_ventricle', kind: 'structure', volume_mm3: 3977.9, state: 'UNCERTAIN' },
      ],
    },
    priorComparison: null,
  });
}

describe('imaging-report-json-schema.service — parsing', () => {
  test('parses a clean JSON object', () => {
    const r = parseStructuredReportResponse('{"findings": []}');
    expect(r.ok).toBe(true);
    expect(r.json.findings).toEqual([]);
  });

  test('parses JSON wrapped in a markdown code fence', () => {
    const r = parseStructuredReportResponse('```json\n{"findings": []}\n```');
    expect(r.ok).toBe(true);
  });

  test('parses JSON with incidental leading/trailing prose', () => {
    const r = parseStructuredReportResponse('Here is the report:\n{"findings": []}\nLet me know if you need changes.');
    expect(r.ok).toBe(true);
  });

  test('fails cleanly on empty response', () => {
    expect(parseStructuredReportResponse('').ok).toBe(false);
  });

  test('fails cleanly on malformed JSON', () => {
    expect(parseStructuredReportResponse('{findings: [}').ok).toBe(false);
  });
});

describe('imaging-report-json-schema.service — validation (grounding)', () => {
  test('accepts a finding citing a real fact_id', () => {
    const model = ventricleModel();
    const json = {
      findings: [{ statement: 'Left ventricle 641.2 mm3, uncertain.', evidence_ids: ['F-1'], certainty: 'UNCERTAIN' }],
      impression: [],
    };
    const result = validateStructuredReport(json, model);
    expect(result.valid).toBe(true);
  });

  test('accepts an impression statement citing the pre-compiled comparison_id', () => {
    const model = ventricleModel();
    const json = {
      findings: [],
      impression: [{ statement: '6.2x asymmetry, uncertain.', evidence_ids: [model.comparisons[0].comparison_id], certainty: 'UNCERTAIN' }],
    };
    expect(validateStructuredReport(json, model).valid).toBe(true);
  });

  test('rejects a finding with a hallucinated evidence_id — the core grounding guarantee', () => {
    const model = ventricleModel();
    const json = {
      findings: [{ statement: 'Mass effect present.', evidence_ids: ['F-999'], certainty: 'POSITIVE' }],
    };
    const result = validateStructuredReport(json, model);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/unknown id/);
  });

  test('rejects an invalid certainty value', () => {
    const model = ventricleModel();
    const result = validateStructuredReport({ findings: [{ statement: 'x', evidence_ids: [], certainty: 'DEFINITELY' }] }, model);
    expect(result.valid).toBe(false);
  });

  test('rejects a non-object response', () => {
    expect(validateStructuredReport(null, ventricleModel()).valid).toBe(false);
    expect(validateStructuredReport('a string', ventricleModel()).valid).toBe(false);
  });

  test('rejects a recommendation citing an unknown id', () => {
    const model = ventricleModel();
    const result = validateStructuredReport({ recommendation: { text: 'Correlate clinically.', evidence_ids: ['F-999'] } }, model);
    expect(result.valid).toBe(false);
  });

  test('empty findings/impression with no evidence is valid (the AJITHA-style abstain case)', () => {
    const model = ventricleModel();
    const result = validateStructuredReport({ findings: [], impression: [], limitations: [{ code: 'X', text: 'y' }] }, model);
    expect(result.valid).toBe(true);
  });
});

describe('imaging-report-json-schema.service — deterministic rendering', () => {
  test('renders findings/impression/limitations/recommendation from validated JSON, no LLM call', () => {
    const json = {
      technique: { text: 'MRI brain, standard protocol.' },
      findings: [{ statement: 'Left ventricle 641.2 mm3.' }, { statement: 'Right ventricle 3977.9 mm3.' }],
      impression: [{ statement: '6.2x asymmetry, uncertain — recommend correlation.' }],
      limitations: [{ code: 'LOW_CONFIDENCE', text: 'Segmentation confidence 0.56.' }],
      recommendation: { text: 'Clinical correlation recommended.' },
    };
    const text = renderStructuredReport(json);
    expect(text).toContain('641.2 mm3');
    expect(text).toContain('3977.9 mm3');
    expect(text).toContain('6.2x asymmetry');
    expect(text).toContain('Segmentation confidence 0.56');
    expect(text).toContain('Clinical correlation recommended');
  });

  test('renders honest placeholders when a section is empty', () => {
    const text = renderStructuredReport({ findings: [], impression: [] });
    expect(text).toContain('No findings reported.');
    expect(text).toContain('No impression statements generated.');
  });
});
