import { jest } from '@jest/globals';

const mockQuery = jest.fn();
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query: mockQuery } }));

const { compareFactsWithPriorStudy } = await import('../services/imaging/imaging-temporal-comparison.service.js');

describe('imaging-temporal-comparison.service', () => {
  beforeEach(() => mockQuery.mockReset());

  test('returns empty array with no priorStudyId', async () => {
    const result = await compareFactsWithPriorStudy({ currentFacts: [{ structure: 'x', volume_mm3: 1 }], priorStudyId: null });
    expect(result).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('returns empty array when the prior study has no persisted facts', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const result = await compareFactsWithPriorStudy({ currentFacts: [{ structure: 'x', volume_mm3: 1 }], priorStudyId: 5 });
    expect(result).toEqual([]);
  });

  test('classifies a real >15% increase as INCREASED', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ structure: 'right_lateral_ventricle', volume_mm3: 3000, size_mm: null, certainty: 'UNCERTAIN', created_at: new Date() }] });
    const result = await compareFactsWithPriorStudy({
      currentFacts: [{ fact_id: 'F-2', structure: 'right_lateral_ventricle', volume_mm3: 3977.9, certainty: 'UNCERTAIN' }],
      priorStudyId: 5,
    });
    expect(result).toHaveLength(1);
    expect(result[0].trend).toBe('INCREASED');
    expect(result[0].ratio).toBeCloseTo(1.33, 1);
  });

  test('classifies a small change as STABLE, not a fabricated trend', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ structure: 'left_lateral_ventricle', volume_mm3: 630, size_mm: null, certainty: 'POSITIVE', created_at: new Date() }] });
    const result = await compareFactsWithPriorStudy({
      currentFacts: [{ fact_id: 'F-1', structure: 'left_lateral_ventricle', volume_mm3: 641.2, certainty: 'POSITIVE' }],
      priorStudyId: 5,
    });
    expect(result[0].trend).toBe('STABLE');
  });

  test('classifies a real decrease as DECREASED', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ structure: 'segmented_whole_tumor', volume_mm3: 500, size_mm: null, certainty: 'POSITIVE', created_at: new Date() }] });
    const result = await compareFactsWithPriorStudy({
      currentFacts: [{ fact_id: 'F-1', structure: 'segmented_whole_tumor', volume_mm3: 100, certainty: 'POSITIVE' }],
      priorStudyId: 5,
    });
    expect(result[0].trend).toBe('DECREASED');
  });

  test('skips a current fact with no matching prior structure — no fabricated comparison', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ structure: 'left_lateral_ventricle', volume_mm3: 630, size_mm: null, certainty: 'POSITIVE', created_at: new Date() }] });
    const result = await compareFactsWithPriorStudy({
      currentFacts: [{ fact_id: 'F-1', structure: 'segmented_whole_tumor', volume_mm3: 50, certainty: 'POSITIVE' }],
      priorStudyId: 5,
    });
    expect(result).toEqual([]);
  });

  test('uses only the most recent prior draft per structure when multiple exist', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { structure: 'left_lateral_ventricle', volume_mm3: 600, size_mm: null, certainty: 'POSITIVE', created_at: new Date('2026-08-20') },
        { structure: 'left_lateral_ventricle', volume_mm3: 400, size_mm: null, certainty: 'POSITIVE', created_at: new Date('2026-08-10') },
      ],
    });
    const result = await compareFactsWithPriorStudy({
      currentFacts: [{ fact_id: 'F-1', structure: 'left_lateral_ventricle', volume_mm3: 641.2, certainty: 'POSITIVE' }],
      priorStudyId: 5,
    });
    // ORDER BY created_at DESC means the query itself returns most-recent
    // first — the function trusts that ordering rather than re-sorting.
    expect(result[0].prior_value).toBe(600);
  });

  test('carries both current and prior certainty for downstream trust-weighting', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ structure: 'left_lateral_ventricle', volume_mm3: 600, size_mm: null, certainty: 'ABSTAIN', created_at: new Date() }] });
    const result = await compareFactsWithPriorStudy({
      currentFacts: [{ fact_id: 'F-1', structure: 'left_lateral_ventricle', volume_mm3: 641.2, certainty: 'UNCERTAIN' }],
      priorStudyId: 5,
    });
    expect(result[0].current_certainty).toBe('UNCERTAIN');
    expect(result[0].prior_certainty).toBe('ABSTAIN');
  });
});
