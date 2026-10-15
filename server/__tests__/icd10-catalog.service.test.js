import { jest } from '@jest/globals';

const query = jest.fn();
jest.unstable_mockModule('../db/postgres.js', () => ({ connectPostgres: jest.fn().mockResolvedValue({ query }) }));

const { searchIcd10, validateIcd10Codes, normaliseIcd10Code } = await import('../services/icd10-catalog.service.js');

describe('ICD-10 catalog service', () => {
  beforeEach(() => query.mockReset());

  it('normalises codes without changing their clinical meaning', () => {
    expect(normaliseIcd10Code('  e11.9 ')).toBe('E119');
  });

  it('searches the catalog with a bounded limit', async () => {
    query.mockResolvedValue({ rows: [{ code: 'E11.9', description: 'Type 2 diabetes mellitus without complications', category: 'E00-E89' }] });
    const rows = await searchIcd10({ query: 'diabetes', limit: 1000 });
    expect(rows).toHaveLength(1);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('LIMIT $4'), ['diabetes', 'diabetes%', '%diabetes%', 100]);
  });

  it('returns canonical valid codes and explicitly lists invalid codes', async () => {
    query.mockResolvedValue({ rows: [{ code: 'E11.9', description: 'Type 2 diabetes mellitus without complications', category: 'E00-E89' }] });
    await expect(validateIcd10Codes([' e119 ', 'Z99.99', 'E11.9'])).resolves.toEqual({
      valid: [{ code: 'E11.9', description: 'Type 2 diabetes mellitus without complications', category: 'E00-E89' }],
      invalid: ['Z99.99'],
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('ANY($1::text[])'), [['E119', 'Z9999']]);
  });
});
