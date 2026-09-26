/**
 * Admin access to consultation recordings (PHI) is tenant-scoped. The listing accepted ?organizationId= and ignored it,
 * and the by-id routes never compared the recording's hospital to the caller's.
 */
import { jest } from '@jest/globals';

let currentUser;
jest.unstable_mockModule('../middleware/auth.middleware.js', () => ({
  authUser: (req, _res, next) => { req.user = currentUser; next(); },
  authDoctor: (_req, _res, next) => next(),
  requireRole: () => (_req, _res, next) => next(),
}));
jest.unstable_mockModule('../services/ai-brain/llm-provider.js', () => ({ default: {} }));
jest.unstable_mockModule('../services/minio-upload.service.js', () => ({ uploadToMinio: jest.fn() }));
const CR = { findAll: jest.fn(), findByPk: jest.fn() };
jest.unstable_mockModule('../models/consultationRecording.model.intelligent.js', () => ({ default: CR }));

const { default: request } = await import('supertest');
const { default: express } = await import('express');
const { default: router } = await import('../routes/consultation-recording.route.js');
const app = express(); app.use(express.json()); app.use('/cr', router);

const rec = (id, org) => ({ id, appointmentId: id, doctorId: 1, patientId: 2, accessLog: [], appointment: { organization_id: org }, logAccess: jest.fn().mockResolvedValue(undefined) });
beforeEach(() => { CR.findAll.mockReset().mockResolvedValue([]); CR.findByPk.mockReset(); });

describe('GET /admin/all', () => {
  it('a hospital admin is filtered to THEIR hospital via the appointment include (required join)', async () => {
    currentUser = { id: 5, role: 'hospital_admin', organization_id: 4 };
    const res = await request(app).get('/cr/admin/all?organizationId=99');            // asking for another hospital changes nothing
    expect(res.status).toBe(200);
    const inc = CR.findAll.mock.calls[0][0].include[0];
    expect(inc.where).toEqual({ organization_id: 4 });
    expect(inc.required).toBe(true);
  });
  it('a hospital admin with NO tenant is refused', async () => {
    currentUser = { id: 5, role: 'hospital_admin' };
    const res = await request(app).get('/cr/admin/all');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TENANT_CONTEXT_REQUIRED');
    expect(CR.findAll).not.toHaveBeenCalled();
  });
  it('a platform admin sees everything, or one hospital when they ask (?organizationId= is now honoured)', async () => {
    currentUser = { id: 1, role: 'admin' };
    await request(app).get('/cr/admin/all');
    expect(CR.findAll.mock.calls[0][0].include[0].where).toBeUndefined();
    await request(app).get('/cr/admin/all?organizationId=7');
    expect(CR.findAll.mock.calls[1][0].include[0]).toMatchObject({ where: { organization_id: 7 }, required: true });
  });
  it('a non-admin role is refused', async () => {
    currentUser = { id: 5, role: 'nurse', organization_id: 4 };
    expect((await request(app).get('/cr/admin/all')).status).toBe(403);
  });
  it('a failure returns a generic message, not the internal error text', async () => {
    currentUser = { id: 1, role: 'admin' };
    jest.spyOn(console, 'error').mockImplementation(() => {});
    CR.findAll.mockRejectedValue(new Error('relation "consultation_recordings" does not exist'));
    const res = await request(app).get('/cr/admin/all');
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/relation|consultation_recordings/);
    console.error.mockRestore?.();
  });
});

describe('GET /admin/:id and /admin/:id/access-log', () => {
  it.each(['/cr/admin/3', '/cr/admin/3/access-log'])('%s: another hospital\'s recording is a 404 for a hospital admin', async (path) => {
    currentUser = { id: 5, role: 'hospital_admin', tenant_id: 4 };
    CR.findByPk.mockResolvedValue(rec(3, 9));
    expect((await request(app).get(path)).status).toBe(404);
  });
  it.each(['/cr/admin/3', '/cr/admin/3/access-log'])('%s: their own hospital\'s recording is returned', async (path) => {
    currentUser = { id: 5, role: 'hospital_admin', tenant_id: 4 };
    CR.findByPk.mockResolvedValue(rec(3, 4));
    expect((await request(app).get(path)).status).toBe(200);
  });
  it.each(['/cr/admin/3', '/cr/admin/3/access-log'])('%s: a platform admin can read any hospital\'s', async (path) => {
    currentUser = { id: 1, role: 'super_admin' };
    CR.findByPk.mockResolvedValue(rec(3, 9));
    expect((await request(app).get(path)).status).toBe(200);
  });
  it('a viewed recording is access-logged (audit trail preserved)', async () => {
    currentUser = { id: 5, role: 'hospital_admin', tenant_id: 4 };
    const r = rec(3, 4); CR.findByPk.mockResolvedValue(r);
    await request(app).get('/cr/admin/3');
    expect(r.logAccess).toHaveBeenCalled();
  });
});
