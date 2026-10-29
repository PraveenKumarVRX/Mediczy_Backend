import { jest } from '@jest/globals';

const query = jest.fn();
const postEraRemittance = jest.fn();

jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query } }));
jest.unstable_mockModule('../middleware/rls-context.middleware.js', () => ({
  withRlsTransaction: jest.fn(),
}));
jest.unstable_mockModule('../services/hospital-era.service.js', () => ({
  default: { postEraRemittance },
}));

const { importEraBatch, upsertDenialReasonCode } = await import('../services/insurance-rcm-governance.service.js');

describe('Insurance RCM governance', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects an incomplete denial-code master record before writing', async () => {
    await expect(upsertDenialReasonCode({ code: 'CO-97' })).rejects.toThrow('valid denial code and description');
    expect(query).not.toHaveBeenCalled();
  });

  it('writes import lineage and posts each ERA row exactly once', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 22, hospital_id: 7, status: 'processing' }] }) // batch
      .mockResolvedValueOnce({ rows: [] }) // raw import row
      .mockResolvedValueOnce({ rows: [] }) // row marked posted
      .mockResolvedValueOnce({ rows: [{ id: 22, status: 'processed', posted_count: 1, failed_count: 0 }] }); // batch closed
    postEraRemittance.mockResolvedValue({ eraId: 91, claimId: 12, invoiceId: 42, insurancePaid: 5000 });

    const out = await importEraBatch(7, [{ claimNumber: 'CLM-01', paidAmount: 5000 }], {
      sourceName: '835', actor: { id: 3, name: 'RCM User' },
    });

    expect(out.duplicate).toBe(false);
    expect(out.batch).toMatchObject({ id: 22, status: 'processed', posted_count: 1 });
    expect(out.results).toEqual([expect.objectContaining({ rowNumber: 1, success: true, eraId: 91 })]);
    expect(postEraRemittance).toHaveBeenCalledWith(7, { claimNumber: 'CLM-01', paidAmount: 5000 }, { id: 3, name: 'RCM User' });
  });

  it('does not repost a duplicate import batch', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 22, status: 'processed' }] });

    const out = await importEraBatch(7, [{ claimNumber: 'CLM-01', paidAmount: 5000 }], { actor: { id: 3 } });

    expect(out).toMatchObject({ duplicate: true, batch: { id: 22 }, results: [] });
    expect(postEraRemittance).not.toHaveBeenCalled();
  });
});
