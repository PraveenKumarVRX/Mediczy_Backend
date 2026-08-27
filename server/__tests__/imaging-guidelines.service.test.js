import { jest } from '@jest/globals';

const mockQuery = jest.fn();
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query: mockQuery } }));

const { getGuidelinesForPathway } = await import('../services/imaging/imaging-guidelines.service.js');

describe('imaging-guidelines.service', () => {
  beforeEach(() => mockQuery.mockReset());

  test('getGuidelinesForPathway queries only current guidelines for the given pathway', async () => {
    mockQuery.mockResolvedValue({ rows: [{ guideline_id: 'ACR-AC-BRAIN-TUMORS-2025', pathway: 'tumor_flag' }] });
    const rows = await getGuidelinesForPathway('tumor_flag');
    expect(rows).toHaveLength(1);
    expect(mockQuery.mock.calls[0][1]).toEqual(['tumor_flag']);
    expect(mockQuery.mock.calls[0][0]).toMatch(/review_status = 'current'/);
  });

  test('a pathway with no matching real guideline returns an empty array, not fabricated content', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const rows = await getGuidelinesForPathway('ventricular_asymmetry');
    expect(rows).toEqual([]);
  });
});
