import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { scmPermissionForPath } from '../middleware/scm-rbac.middleware.js';

const getScopedScmDb = jest.fn();
const unifiedPoStatus = jest.fn();
const ensureOperationsGovernanceTables = jest.fn();
const requestOperationsApproval = jest.fn();
const recordOperationsAudit = jest.fn();

jest.unstable_mockModule('../controllers/dept/scm.controller.js', () => ({ loginScm: jest.fn() }));
jest.unstable_mockModule('../config/auth.config.js', () => ({ JWT_CONFIG: { SECRET: 'scm-test-secret' } }));
jest.unstable_mockModule('../utils/safeRouter.js', () => ({ safeRouter: (router) => router }));
jest.unstable_mockModule('../services/ai-brain/llm-provider.js', () => ({ default: { chat: jest.fn() } }));
jest.unstable_mockModule('../services/scm-unified.service.js', () => ({
  getScopedScmDb, poStatusAfterReceipt: unifiedPoStatus, scmOverviewMetrics: jest.fn(),
}));
jest.unstable_mockModule('../services/operations-governance.service.js', () => ({
  actorFrom: (user, fallback) => user?.name || fallback,
  decideOperationsApproval: jest.fn(),
  ensureOperationsGovernanceTables,
  listOperationsApprovals: jest.fn(),
  listOperationsAudit: jest.fn(),
  recordOperationsAudit,
  requestOperationsApproval,
}));

let app;
let clientQuery;
let clientRelease;

beforeAll(async () => {
  const { default: scmRouter } = await import('../routes/scm.route.js');
  app = express();
  app.use(express.json());
  app.use('/api/scm', scmRouter);
});

beforeEach(() => {
  clientQuery = jest.fn();
  clientRelease = jest.fn();
  ensureOperationsGovernanceTables.mockReset();
  ensureOperationsGovernanceTables.mockResolvedValue();
  requestOperationsApproval.mockReset();
  requestOperationsApproval.mockResolvedValue({ id: 5 });
  recordOperationsAudit.mockReset();
  recordOperationsAudit.mockResolvedValue();
  unifiedPoStatus.mockReset();
  unifiedPoStatus.mockResolvedValue('partial_receipt');
  getScopedScmDb.mockReset();
  getScopedScmDb.mockResolvedValue({
    orgId: 7,
    connect: jest.fn(async () => ({ query: clientQuery, release: clientRelease })),
    release: jest.fn(),
  });
});

const authorization = () => ({
  Authorization: `Bearer ${jwt.sign({ organization_id: 7, role: 'admin', name: 'SCM test' }, 'scm-test-secret')}`,
});

describe('SCM receipt integrity', () => {
  it('assigns the GRN receiver permission before the broader purchase-order route match', () => {
    expect(scmPermissionForPath('POST', '/orders/91/grn')).toBe('grn');
  });

  it('rejects a receipt above the remaining PO quantity and rolls back before creating a GRN', async () => {
    clientQuery.mockImplementation(async (sql) => {
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('FROM scm_purchase_orders')) return { rows: [{ id: 91, status: 'approved' }] };
      if (sql.includes('FROM scm_po_lines')) return { rows: [{ id: 12, item_id: 3, quantity: 5, received_quantity: 4 }] };
      return { rows: [] };
    });

    const response = await request(app).post('/api/scm/orders/91/grn').set(authorization()).send({
      lines: [{ lineId: 12, itemId: 3, receivedQuantity: 2 }],
    });

    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/exceeds/);
    expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO scm_grns'))).toBe(false);
  });

  it('makes an already complete GRN post safe to retry without adding a second ledger row', async () => {
    clientQuery.mockImplementation(async (sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
      if (sql.includes('FROM scm_grns')) return { rows: [{ id: 41, grn_number: 'GRN-41' }] };
      if (sql.includes('FROM operations_approvals')) return { rows: [{ status: 'approved' }] };
      if (sql.includes('FROM scm_grn_lines')) return { rows: [{ id: 88, item_id: 9, quantity: 2 }] };
      if (sql.includes('FROM scm_inventory_ledger')) return { rows: [{ grn_line_id: 88 }] };
      return { rows: [] };
    });

    const response = await request(app).patch('/api/scm/grns/41/post').set(authorization());

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ posted: true, idempotent: true, lineCount: 1 });
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO scm_inventory_ledger'))).toBe(false);
  });

  it('fails controlled-drug requests with a signed or unsupported movement before stock is touched', async () => {
    const response = await request(app).post('/api/scm/controlled-substances').set(authorization()).send({
      itemId: 3, txnType: 'issue', quantity: -1, witnessName: 'Witness', referenceType: 'manual', referenceId: 1,
    });

    expect(response.status).toBe(400);
    expect(clientQuery).not.toHaveBeenCalled();
  });
});
