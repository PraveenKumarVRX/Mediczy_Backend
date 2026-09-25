import { jest } from '@jest/globals';

const query = jest.fn();
const connect = jest.fn();
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query, connect } }));

const finance = await import('../services/finance-ledger.service.js');

beforeEach(() => {
  query.mockReset();
  connect.mockReset();
});

describe('finance journal invariants', () => {
  it('rejects an unbalanced journal before opening a database transaction', async () => {
    await expect(finance.postJournalEntry(7, { description: 'bad', lines: [{ accountId: 1, debit: 100 }, { accountId: 2, credit: 90 }] })).rejects.toThrow(/must balance/i);
    expect(connect).not.toHaveBeenCalled();
  });

  it('rejects a line with both debit and credit', async () => {
    await expect(finance.postJournalEntry(7, { description: 'bad', lines: [{ accountId: 1, debit: 100, credit: 100 }, { accountId: 2, credit: 100 }] })).rejects.toThrow(/exactly one positive debit or credit/i);
    expect(connect).not.toHaveBeenCalled();
  });

  it('requires at least two lines and a description', async () => {
    await expect(finance.postJournalEntry(7, { description: 'bad', lines: [{ accountId: 1, debit: 100 }] })).rejects.toThrow(/at least two/i);
  });
});
