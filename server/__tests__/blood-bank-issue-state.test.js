import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const rawQuery = jest.fn();
const connectPostgres = jest.fn();
const scopeEnsure = jest.fn();
const scopeDb = jest.fn();

jest.unstable_mockModule('../db/postgres.js', () => ({ connectPostgres }));
jest.unstable_mockModule('../controllers/dept/bloodBank.controller.js', () => ({ loginBloodBank: jest.fn() }));
jest.unstable_mockModule('../config/auth.config.js', () => ({ JWT_CONFIG: { SECRET: 'blood-bank-test-secret' } }));
jest.unstable_mockModule('../utils/safeRouter.js', () => ({ safeRouter: (router) => router }));
// Issue and cross-match are gated on the HRMS qualification decision. That gate
// is covered by clinical-privilege-route-coverage; this suite is about the
// issue state machine, so it runs with the privilege already granted.
jest.unstable_mockModule('../middleware/hrms-privilege.middleware.js', () => ({
  requireStaffPrivilege: () => (_req, _res, next) => next(),
  default: { requireStaffPrivilege: () => (_req, _res, next) => next() },
}));
jest.unstable_mockModule('../services/dept-tenant-scope.service.js', () => ({
  bloodBankScope: { ensure: scopeEnsure, scopedDb: scopeDb },
}));
jest.unstable_mockModule('../services/tenant-scope.service.js', () => ({
  orgFromToken: (user) => Number(user?.organization_id) || null,
  orgRequiredResponse: { success: false, code: 'ORG_REQUIRED' },
}));
jest.unstable_mockModule('../services/ai-brain/llm-provider.js', () => ({ default: { chat: jest.fn() } }));

let app;
let requisitionStatus;
let unitUpdates;

beforeAll(async () => {
  const { default: bloodBankRouter } = await import('../routes/dept/bloodBank.route.js');
  app = express();
  app.use(express.json());
  app.use('/api/blood-bank', bloodBankRouter);
});

beforeEach(() => {
  requisitionStatus = 'pending';
  unitUpdates = 0;
  rawQuery.mockReset();
  rawQuery.mockResolvedValue({ rows: [] });
  connectPostgres.mockReset();
  connectPostgres.mockResolvedValue({ query: rawQuery });
  scopeEnsure.mockReset();
  scopeEnsure.mockResolvedValue();
  scopeDb.mockReset();

  const client = {
    query: jest.fn(async (sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('SELECT * FROM blood_bank_requisitions')) {
        return { rows: [{ id: 71, status: requisitionStatus, blood_group: 'O+', component: 'rbc', units_requested: 1 }] };
      }
      if (sql.includes('SELECT id FROM blood_bank_units')) return { rows: [{ id: 501 }] };
      if (sql.includes("UPDATE blood_bank_units SET status='issued'")) {
        unitUpdates += 1;
        return { rows: [] };
      }
      if (sql.includes("UPDATE blood_bank_requisitions SET status='issued'")) {
        requisitionStatus = 'issued';
        return { rows: [{ id: 71, status: 'issued', issued_unit_ids: [501] }] };
      }
      return { rows: [] };
    }),
    release: jest.fn(),
  };
  scopeDb.mockReturnValue({ connect: jest.fn(async () => client), release: jest.fn() });
});

const authorization = () => ({
  Authorization: `Bearer ${jwt.sign({ organization_id: 3, name: 'Blood Bank Test' }, 'blood-bank-test-secret')}`,
});

describe('blood-bank requisition issue state', () => {
  it('issues a pending requisition once and blocks a repeated allocation', async () => {
    const first = await request(app).post('/api/blood-bank/requisitions/71/issue').set(authorization());
    const retry = await request(app).post('/api/blood-bank/requisitions/71/issue').set(authorization());

    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({ id: 71, status: 'issued', issued_unit_ids: [501] });
    expect(retry.status).toBe(409);
    expect(retry.body).toMatchObject({ success: false, code: 'REQUISITION_NOT_ISSUABLE' });
    expect(unitUpdates).toBe(1);
  });
});
