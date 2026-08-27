import { jest } from '@jest/globals';

const mockQuery = jest.fn();
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query: mockQuery } }));

const { compileClinicalFactModel } = await import('../services/imaging/imaging-report-compiler.service.js');
const { buildClinicalClaims, persistClinicalClaims, getClaimsForSubject } = await import('../services/imaging/imaging-clinical-claims.service.js');

const study = { modality: 'MR', body_part: 'brain' };

describe('imaging-clinical-claims.service — buildClinicalClaims (pure transform)', () => {
  test('produces one atomic subject-predicate-object claim per real measurement', () => {
    const model = compileClinicalFactModel({
      study,
      findings: {
        measurements: [
          { structure: 'left_lateral_ventricle', kind: 'structure', volume_mm3: 641.2, state: 'UNCERTAIN', confidence: 0.56 },
          { structure: 'right_lateral_ventricle', kind: 'structure', volume_mm3: 3977.9, state: 'POSITIVE', confidence: 0.9 },
        ],
      },
      priorComparison: null,
    });
    const claims = buildClinicalClaims(model, { inferenceBackend: 'monai-unest-whole-brain' });
    expect(claims).toHaveLength(2);
    expect(claims[0]).toMatchObject({
      claim_id: 'CLM-F-1',
      subject: 'left_lateral_ventricle',
      predicate: 'volume',
      object: { value: 641.2, unit: 'mm3' },
      source: 'monai-unest-whole-brain',
      confidence: 0.56,
      status: 'uncertain',
    });
  });

  test('maps each real certainty state to the correct claim status', () => {
    const model = compileClinicalFactModel({
      study,
      findings: {
        measurements: [
          { structure: 'a', volume_mm3: 1, state: 'POSITIVE' },
          { structure: 'b', volume_mm3: 1, state: 'NEGATIVE' },
          { structure: 'c', volume_mm3: 1, state: 'ABSTAIN' },
          { structure: 'd', volume_mm3: 1 }, // no state field at all
        ],
      },
      priorComparison: null,
    });
    const claims = buildClinicalClaims(model);
    expect(claims.find((c) => c.subject === 'a').status).toBe('validated');
    expect(claims.find((c) => c.subject === 'b').status).toBe('validated');
    expect(claims.find((c) => c.subject === 'c').status).toBe('abstained');
    expect(claims.find((c) => c.subject === 'd').status).toBe('not_assessed');
  });

  test('a finding with neither volume_mm3 nor size_mm produces no claim — no fabricated object value', () => {
    const model = compileClinicalFactModel({
      study,
      findings: { measurements: [{ structure: 'x', state: 'POSITIVE' }] },
      priorComparison: null,
    });
    expect(buildClinicalClaims(model)).toHaveLength(0);
  });

  test('uses size_mm as the object with unit mm when volume_mm3 is absent', () => {
    const model = compileClinicalFactModel({
      study,
      findings: { measurements: [{ structure: 'nodule', size_mm: 8, state: 'POSITIVE' }] },
      priorComparison: null,
    });
    const claims = buildClinicalClaims(model);
    expect(claims[0].predicate).toBe('size');
    expect(claims[0].object).toEqual({ value: 8, unit: 'mm' });
  });
});

describe('imaging-clinical-claims.service — persistence', () => {
  beforeEach(() => mockQuery.mockReset());

  test('persistClinicalClaims inserts one row per claim with real values', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const claims = [{
      claim_id: 'CLM-F-1', fact_id: 'F-1', subject: 'left_lateral_ventricle', predicate: 'volume',
      object: { value: 641.2, unit: 'mm3' }, source: 'monai-unest-whole-brain', confidence: 0.56, status: 'uncertain',
    }];
    await persistClinicalClaims({ draftId: 5, studyId: 11, tenantId: 2433, claims });
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO imaging_clinical_claims/);
    expect(params).toEqual([5, 11, 2433, 'CLM-F-1', 'F-1', 'left_lateral_ventricle', 'volume', 641.2, 'mm3', 'monai-unest-whole-brain', 0.56, 'uncertain']);
  });

  test('getClaimsForSubject queries by draft and subject', async () => {
    mockQuery.mockResolvedValue({ rows: [{ subject: 'left_lateral_ventricle' }] });
    const rows = await getClaimsForSubject(5, 'left_lateral_ventricle');
    expect(rows).toHaveLength(1);
    expect(mockQuery.mock.calls[0][1]).toEqual([5, 'left_lateral_ventricle']);
  });
});
