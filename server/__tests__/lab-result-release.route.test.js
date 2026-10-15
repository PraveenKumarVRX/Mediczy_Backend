import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const mockConnect = jest.fn();
const mockClientQuery = jest.fn();
const mockRelease = jest.fn();
const mockFinalizeBilling = jest.fn(async () => null);

jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { connect: mockConnect, query: jest.fn() } }));
jest.unstable_mockModule('../middleware/authLab.middleware.js', () => ({
  authLab: (req, _res, next) => { req.lab = { id: 7, email: 'lab@example.test' }; next(); },
}));
jest.unstable_mockModule('../services/emr-order-router.service.js', () => ({
  default: { finalizeLabOrderBilling: mockFinalizeBilling },
}));

const { default: ordersRouter } = await import('../routes/lab/orders.route.js');

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use('/api/lab/orders', ordersRouter);
  return instance;
}

describe('lab result release governance', () => {
  beforeEach(() => {
    mockClientQuery.mockReset();
    mockConnect.mockReset();
    mockRelease.mockReset();
    mockFinalizeBilling.mockClear();
    mockConnect.mockResolvedValue({ query: mockClientQuery, release: mockRelease });
  });

  test('blocks completion when the linked QC material is locked', async () => {
    mockClientQuery
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 11, results: [{ value: 1 }], release_status: 'draft', result_version: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 3, release_status: 'locked' }] })
      .mockResolvedValueOnce({});

    const res = await request(app()).patch('/api/lab/orders/11/status').send({
      status: 'completed', results: [{ value: 2 }], qcMaterialId: 3,
    });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('qc_not_released');
    expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(mockFinalizeBilling).not.toHaveBeenCalled();
  });

  test('records a released result version after a released QC run', async () => {
    mockClientQuery
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 11, results: [{ value: 1 }], release_status: 'draft', result_version: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 3, release_status: 'released' }] })
      .mockResolvedValueOnce({ rows: [{ id: 4 }] })
      .mockResolvedValueOnce({ rows: [{ id: 11, release_status: 'released', result_version: 2 }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const res = await request(app()).patch('/api/lab/orders/11/status').send({
      status: 'completed', results: [{ value: 2 }], qcMaterialId: 3, qcRunId: 4,
    });

    expect(res.status).toBe(200);
    expect(res.body.order.result_version).toBe(2);
    expect(res.body.order.release_status).toBe('released');
    expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
    expect(mockFinalizeBilling).toHaveBeenCalledWith(11, { amount: undefined });
  });
});
