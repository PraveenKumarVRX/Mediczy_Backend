import { jest } from '@jest/globals';

jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query: jest.fn(), connect: jest.fn() } }));
const { specs } = await import('../services/finance-gl-posting.service.js');
const { istDate, fiscalYearOf, fiscalMonths } = await import('../utils/ist-date.js');

const ACCOUNTS = { patientReceivable: 'AR', insuranceReceivable: 'INS', revenue: 'REV', gstPayable: 'GST', cash: 'CASH', bank: 'BANK', contractualAdjustment: 'ADJ', inputTax: 'ITC', expense: 'EXP', accountsPayable: 'AP' };
const pick = (role) => ACCOUNTS[role];
const has = (role) => role in ACCOUNTS;
const paise = (v) => Math.round(Number(v || 0) * 100);
const totals = (lines) => ({ d: lines.reduce((s, l) => s + paise(l.debit), 0), c: lines.reduce((s, l) => s + paise(l.credit), 0) });
const balanced = (spec) => { const t = totals(spec.lines(pick, has)); return t.d === t.c && t.d > 0; };
const byAccount = (spec) => Object.fromEntries(spec.lines(pick, has).map((l) => [l.accountId, l.debit ? { dr: l.debit } : { cr: l.credit }]));

describe('every posting adapter balances by construction (integer paise)', () => {
  it.each([
    ['invoice, no tax, no insurance', specs.invoice({ id: 1, bill_number: 'B1', total_amount: 1000 })],
    ['invoice with GST and an insurance share', specs.invoice({ id: 2, bill_number: 'B2', total_amount: 1180, tax_amount: 180, insurance_amount: 400 })],
    ['invoice whose stored patient_liability disagrees', specs.invoice({ id: 3, bill_number: 'B3', total_amount: 500, patient_liability: 480 })],
    ['invoice with awkward paise', specs.invoice({ id: 4, bill_number: 'B4', total_amount: 100.10, tax_amount: 0.10, insurance_amount: 33.33 })],
    ['cash payment', specs.payment({ id: 1, amount: 250.5, payment_method: 'cash' })],
    ['refund', specs.refund({ paymentId: 1, refundId: 9, amount: 99.99, paymentMethod: 'card' })],
    ['positive adjustment', specs.adjustment({ id: 1, invoiceId: 1, amount: 50 })],
    ['negative adjustment', specs.adjustment({ id: 2, invoiceId: 1, amount: -50 })],
    ['settlement', specs.insuranceSettlement({ id: 'R1', claimId: 'C1', paidAmount: 300 })],
    ['expense with input GST', specs.expense({ id: 1, category: 'x', amount: 500, tax_amount: 90 })],
  ])('%s', (_name, spec) => expect(balanced(spec)).toBe(true));
});

describe('audit FIN-06 accounting rules', () => {
  it('invoice: revenue is net of GST and GST is a liability', () => {
    const a = byAccount(specs.invoice({ id: 1, bill_number: 'B', total_amount: 1180, tax_amount: 180, insurance_amount: 400 }));
    expect(a).toMatchObject({ AR: { dr: 780 }, INS: { dr: 400 }, REV: { cr: 1000 }, GST: { cr: 180 } });
  });

  it('a positive adjustment reduces the receivable (it used to move revenue the wrong way and never touch A/R)', () => {
    expect(byAccount(specs.adjustment({ id: 1, invoiceId: 1, amount: 50 }))).toEqual({ ADJ: { dr: 50 }, AR: { cr: 50 } });
    expect(byAccount(specs.adjustment({ id: 2, invoiceId: 1, amount: -50 }))).toEqual({ AR: { dr: 50 }, ADJ: { cr: 50 } });
  });

  it('a refund reinstates the receivable and pays out from the right account', () => {
    expect(byAccount(specs.refund({ paymentId: 1, refundId: 1, amount: 100, paymentMethod: 'upi' }))).toEqual({ AR: { dr: 100 }, BANK: { cr: 100 } });
    expect(byAccount(specs.refund({ paymentId: 1, refundId: 2, amount: 100, paymentMethod: 'cash' }))).toEqual({ AR: { dr: 100 }, CASH: { cr: 100 } });
  });

  it('two equal partial refunds on one payment have different keys (the second used to be dropped as a replay)', () => {
    expect(specs.refund({ paymentId: 1, refundId: 1, amount: 100 }).source_id).not.toBe(specs.refund({ paymentId: 1, refundId: 2, amount: 100 }).source_id);
  });

  it('two remittances on one claim have different keys (the second used to be dropped)', () => {
    expect(specs.insuranceSettlement({ id: 'R-1', claimId: 'C', paidAmount: 100 }).source_id).not.toBe(specs.insuranceSettlement({ id: 'R-2', claimId: 'C', paidAmount: 100 }).source_id);
    expect(specs.insuranceSettlement({ claimId: 'C', checkNumber: '1', paidAmount: 100 }).source_id).not.toBe(specs.insuranceSettlement({ claimId: 'C', checkNumber: '2', paidAmount: 100 }).source_id);
  });

  it('a payment that settles an insurer claim credits the insurance receivable', () => {
    expect(byAccount(specs.payment({ id: 1, amount: 400, payment_method: 'neft', insurance_claim_id: 5 }))).toEqual({ BANK: { dr: 400 }, INS: { cr: 400 } });
    expect(byAccount(specs.payment({ id: 2, amount: 400, payment_method: 'cash' }))).toEqual({ CASH: { dr: 400 }, AR: { cr: 400 } });
  });

  it('input GST goes to its own asset account when the chart has one, else it is expensed', () => {
    const e = specs.expense({ id: 1, category: 'x', amount: 500, tax_amount: 90 });
    expect(byAccount(e)).toMatchObject({ EXP: { dr: 500 }, ITC: { dr: 90 }, AP: { cr: 590 } });
    const noItc = e.lines(pick, (r) => r !== 'inputTax').filter((l) => l.debit);
    expect(noItc.map((l) => l.accountId)).toEqual(['EXP', 'EXP']);
  });

  it('rejects impossible source documents instead of mis-posting them', () => {
    expect(() => specs.invoice({ id: 1, bill_number: 'B', total_amount: 100, tax_amount: 500 })).toThrow(/tax/);
    expect(() => specs.invoice({ id: 1, bill_number: 'B', total_amount: 100, insurance_amount: 200 })).toThrow(/Insurance/);
    expect(() => specs.invoice({ id: 1, bill_number: 'B', total_amount: 0 })).toThrow(/positive/);
    expect(() => specs.payment({ id: 1, amount: 0 })).toThrow(/positive/);
    expect(() => specs.refund({ paymentId: 1, amount: -5 })).toThrow(/positive/);
    expect(() => specs.adjustment({ id: 1, invoiceId: 1, amount: 0 })).toThrow(/non-zero/);
  });
});

describe('audit FIN-05 / FIN-04: IST business dates and the Indian fiscal year', () => {
  it('00:00–05:30 IST is still "today" locally even though UTC says yesterday', () => {
    expect(istDate(new Date('2026-09-25T20:00:00Z'))).toBe('2026-09-26');   // 01:30 IST on the 26th
    expect(istDate(new Date('2026-09-25T18:29:00Z'))).toBe('2026-09-25');   // 23:59 IST on the 25th
    expect(istDate(new Date('2026-09-25T18:30:00Z'))).toBe('2026-09-26');   // exactly IST midnight
  });

  it('month-end and year-end boundaries land on the right side', () => {
    expect(istDate(new Date('2026-03-31T19:00:00Z'))).toBe('2026-04-01');   // new fiscal year begins at IST midnight
    expect(istDate(new Date('2026-12-31T19:00:00Z'))).toBe('2027-01-01');
  });

  it('January–March belongs to the fiscal year that STARTED the previous April (the seed used the calendar year)', () => {
    expect(fiscalYearOf('2027-02-10')).toMatchObject({ startYear: 2026, start: '2026-04-01', end: '2027-03-31', label: 'FY2026-27' });
    expect(fiscalYearOf('2026-04-01').startYear).toBe(2026);
    expect(fiscalYearOf('2026-03-31').startYear).toBe(2025);
    expect(fiscalYearOf('2026-12-15').startYear).toBe(2026);
  });

  it('twelve contiguous monthly periods, April to March, with correct month lengths', () => {
    const m = fiscalMonths(2026);
    expect(m).toHaveLength(12);
    expect(m[0]).toEqual({ code: '2026-04', start: '2026-04-01', end: '2026-04-30' });
    expect(m[11]).toEqual({ code: '2027-03', start: '2027-03-01', end: '2027-03-31' });
    expect(m.find((x) => x.code === '2027-02').end).toBe('2027-02-28');
    expect(fiscalMonths(2027).find((x) => x.code === '2028-02').end).toBe('2028-02-29'); // leap year
    for (let i = 1; i < 12; i += 1) {
      const prevEnd = new Date(`${m[i - 1].end}T00:00:00Z`); prevEnd.setUTCDate(prevEnd.getUTCDate() + 1);
      expect(prevEnd.toISOString().slice(0, 10)).toBe(m[i].start);      // no gaps, no overlaps
    }
  });
});
