import { jest } from '@jest/globals';

// The gateway refund lifecycle: money must not move in the ledger until the GATEWAY says it did.
// Posting at request time would permanently overstate cash if the gateway later rejects.

const query = jest.fn();
const connect = jest.fn();

jest.unstable_mockModule('../db/pgPool.js', () => ({
  default: { query, connect, end: jest.fn() },
}));

const createRazorpayRefund = jest.fn();
jest.unstable_mockModule('../services/payment-gateway.service.js', () => ({
  default: { createRazorpayRefund },
}));

const postRefund = jest.fn(async () => ({ posted: true, journalEntryId: 99 }));
const postPayment = jest.fn(async () => ({ posted: true, journalEntryId: 98 }));
const postInvoice = jest.fn(async () => ({ posted: true, journalEntryId: 97 }));
const postAdjustment = jest.fn(async () => ({ posted: true, journalEntryId: 96 }));
jest.unstable_mockModule('../services/finance-gl-posting.service.js', () => ({
  postRefund, postPayment, postInvoice, postAdjustment,
  postInsuranceSettlement: jest.fn(), postExpense: jest.fn(), default: {},
}));

jest.unstable_mockModule('../services/hospital-bill-template.service.js', () => ({
  generateHospitalBillPdf: jest.fn(),
}));

const service = (await import('../services/hospital-billing.service.js')).default;

const HOSP = 7;
const rows = (...r) => ({ rows: r });

// SQL-driven rather than call-order driven: audit and DDL calls come and go, and a positional
// queue silently hands the refund lookup the wrong row when that happens.
const stub = (handlers) => query.mockImplementation(async (sql) => {
  if (/CREATE TABLE/i.test(sql)) return rows();
  for (const [pattern, result] of handlers) if (pattern.test(sql)) return result;
  return rows();
});

beforeEach(() => {
  jest.clearAllMocks();
  postRefund.mockResolvedValue({ posted: true, journalEntryId: 99 });
  createRazorpayRefund.mockResolvedValue({ refundId: 'rf_razor_1', amount: 500, status: 'pending' });
  stub([]);
});

describe('gateway refund lifecycle', () => {
  const seedRefund = (overrides = {}) => ({
    id: 42, hospital_id: HOSP, payment_id: 10, invoice_id: 20, amount: 500,
    gateway_payment_id: 'pay_1', gateway: 'razorpay',
    gateway_refund_id: 'rf_razor_1', status: 'requested', ...overrides,
  });

  it('does NOT post to the ledger until the gateway confirms', async () => {
    stub([
      [/FROM hospital_payment_refunds r JOIN/, rows(seedRefund({ status: 'pending_gateway' }))],
      [/UPDATE hospital_payment_refunds SET status = 'requested'/, rows({ ...seedRefund(), status: 'requested' })],
    ]);

    const requested = await service.requestGatewayRefund(HOSP, 42, { actorId: 1 });
    expect(createRazorpayRefund).toHaveBeenCalledWith('pay_1', 500, expect.objectContaining({ refundId: '42' }));
    expect(requested.status).toBe('requested');
    // Requesting is not confirmation: nothing may reach the ledger yet.
    expect(postRefund).not.toHaveBeenCalled();
  });

  it('a non-gateway payment is refused a gateway refund rather than silently accepted', async () => {
    stub([[/FROM hospital_payment_refunds r JOIN/, rows(seedRefund({ gateway_payment_id: null, status: 'pending_gateway' }))]]);
    await expect(service.requestGatewayRefund(HOSP, 42, {})).rejects.toThrow(/not taken through a gateway/);
    expect(createRazorpayRefund).not.toHaveBeenCalled();
  });

  it('posts the ledger exactly once when the gateway confirms', async () => {
    stub([
      [/SELECT \* FROM hospital_payment_refunds/, rows(seedRefund())],
      [/UPDATE hospital_payment_refunds SET status = \$3/, rows(seedRefund({ status: 'completed' }))],
      [/SELECT payment_method FROM hospital_payments/, rows({ payment_method: 'upi' })],
    ]);

    const res = await service.confirmGatewayRefund(HOSP, { gatewayRefundId: 'rf_razor_1', status: 'processed' }, {});
    expect(res).toMatchObject({ applied: true, posted: true });
    expect(postRefund).toHaveBeenCalledTimes(1);
    expect(postRefund.mock.calls[0][1]).toMatchObject({ refundId: 42, paymentId: 10, amount: 500, paymentMethod: 'upi' });
  });

  it('a redelivered confirmation neither re-posts nor errors', async () => {
    stub([[/SELECT \* FROM hospital_payment_refunds/, rows(seedRefund({ status: 'completed' }))]]);
    const res = await service.confirmGatewayRefund(HOSP, { gatewayRefundId: 'rf_razor_1' }, {});
    expect(res).toMatchObject({ applied: false, reason: 'already_completed' });
    expect(postRefund).not.toHaveBeenCalled();
  });

  it('a FAILED gateway refund reverses the invoice and never posts cash out', async () => {
    stub([
      [/SELECT \* FROM hospital_payment_refunds/, rows(seedRefund())],
      [/UPDATE hospital_payment_refunds SET status = \$3/, rows(seedRefund({ status: 'failed' }))],
    ]);

    const res = await service.confirmGatewayRefund(HOSP, { gatewayRefundId: 'rf_razor_1', status: 'failed' }, {});
    expect(res).toMatchObject({ applied: true, posted: false, status: 'failed' });
    expect(postRefund).not.toHaveBeenCalled();
    // The invoice must be put back the way it was — the money never left.
    const invoiceSql = query.mock.calls.find(([sql]) => /UPDATE hospital_invoices/.test(sql));
    expect(invoiceSql).toBeDefined();
    expect(invoiceSql[1]).toEqual([20, 500, HOSP]);
  });

  it('an unmatched refund id is ignored, not guessed at', async () => {
    stub([[/SELECT \* FROM hospital_payment_refunds/, rows()]]);
    const res = await service.confirmGatewayRefund(HOSP, { gatewayRefundId: 'rf_unknown' }, {});
    expect(res).toMatchObject({ applied: false, reason: 'no_matching_refund' });
    expect(postRefund).not.toHaveBeenCalled();
  });
});