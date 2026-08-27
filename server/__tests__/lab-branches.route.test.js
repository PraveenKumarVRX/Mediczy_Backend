/**
 * Lab branch registry — real bug found while merging this feature: the
 * route originally used authLabOrClinicImaging (shared with DICOM/RIS,
 * where clinics legitimately participate), which lets a clinic JWT resolve
 * req.lab.id to a clinic's tenant id — not a real labs.id. lab_branches.
 * lab_id has an FK to labs(id), so a clinic token would hit an FK
 * violation caught only by the generic catch block -> 500, instead of a
 * clean 403. Branch management is genuinely lab-only, so this now uses
 * the real labs-only authLab middleware (DB-verified role==='lab').
 */
import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const mockQuery = jest.fn();
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query: mockQuery } }));

const mockAuthLab = jest.fn((req, res, next) => {
  req.lab = { id: 42, role: 'lab' };
  next();
});
jest.unstable_mockModule('../middleware/authLab.middleware.js', () => ({ authLab: mockAuthLab }));

const { default: branchesRouter } = await import('../routes/lab/branches.route.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/lab/branches', branchesRouter);
  return app;
}

describe('lab branches route', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockAuthLab.mockClear();
  });

  test('GET / scopes the query to the authenticated lab\'s id, never a client-supplied one', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Main Branch', lab_id: 42 }] });
    const res = await request(buildApp()).get('/api/lab/branches');
    expect(res.status).toBe(200);
    expect(res.body.branches).toHaveLength(1);
    expect(mockQuery.mock.calls[0][1]).toEqual([42]);
  });

  test('POST / requires a name and inserts scoped to req.lab.id', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 2, name: 'Second Branch', lab_id: 42, status: 'active' }] });
    const res = await request(buildApp()).post('/api/lab/branches').send({ name: 'Second Branch' });
    expect(res.status).toBe(201);
    expect(res.body.branch.name).toBe('Second Branch');
    expect(mockQuery.mock.calls[0][1][0]).toBe(42);
  });

  test('POST / rejects a missing name without touching the database', async () => {
    const res = await request(buildApp()).post('/api/lab/branches').send({});
    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('POST / returns a clean 409 on a duplicate branch code, not a raw 500', async () => {
    mockQuery.mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: '23505' }));
    const res = await request(buildApp()).post('/api/lab/branches').send({ name: 'Dup', code: 'DUP1' });
    expect(res.status).toBe(409);
  });

  test('GET /:id 404s when the branch belongs to a different lab (query returns nothing)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(buildApp()).get('/api/lab/branches/999');
    expect(res.status).toBe(404);
  });

  test('DELETE /:id scopes the delete to req.lab.id, not just the branch id', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 3 }] });
    const res = await request(buildApp()).delete('/api/lab/branches/3');
    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[0][1]).toEqual([42, '3']);
  });

  test('a request that fails authLab (non-lab role) never reaches the DB — the real edge case this fix closes', async () => {
    mockAuthLab.mockImplementationOnce((req, res) => {
      res.status(403).json({ success: false, message: 'Not a lab account' });
    });
    const res = await request(buildApp()).get('/api/lab/branches');
    expect(res.status).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
