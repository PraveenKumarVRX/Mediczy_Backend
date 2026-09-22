import { jest } from '@jest/globals';

// A system-level Patient/$export returns every patient across every organization — this test guards the
// authorization fix (it was previously reachable by any logged-in patient, a full cross-tenant PHI leak).
let currentUser = { id: 1, role: 'user', isAdmin: false };

jest.unstable_mockModule('../middleware/auth.middleware.js', () => ({
  authUser: (req, _res, next) => { req.user = currentUser; req.userRole = currentUser.role; next(); },
  requireRole: (role) => (req, res, next) => {
    const allowed = Array.isArray(role) ? role : [role];
    const hasRole = allowed.includes(req.userRole) || (allowed.includes('admin') && req.user?.isAdmin);
    if (!hasRole) return res.status(403).json({ message: 'Forbidden: insufficient role' });
    next();
  },
}));
jest.unstable_mockModule('../services/fhir-bulk-export.service.js', () => ({
  startExport: jest.fn().mockResolvedValue({ jobId: 'job-1' }),
  getExportStatus: jest.fn().mockResolvedValue({ status: 'completed' }),
}));
jest.unstable_mockModule('../db/postgres.js', () => ({ connectPostgres: jest.fn().mockResolvedValue({ query: jest.fn().mockResolvedValue({ rows: [] }) }) }));
jest.unstable_mockModule('../config/redis.js', () => ({ default: { get: jest.fn(), set: jest.fn() } }));
jest.unstable_mockModule('../services/fhir-mapper.service.js', () => ({ default: {} }));

const { default: request } = await import('supertest');
const { default: express } = await import('express');
const { default: router } = await import('../routes/fhir.route.js');

const app = express();
app.use(express.json());
app.use('/api/fhir/r4', router);

describe('GET /Patient/$export — admin-only (population-level export)', () => {
  it('a regular patient user is refused (403), not handed a jobId', async () => {
    currentUser = { id: 42, role: 'user', isAdmin: false };
    const res = await request(app).get('/api/fhir/r4/Patient/$export');
    expect(res.status).toBe(403);
    expect(res.body.jobId).toBeUndefined();
  });

  it('an admin can start the export', async () => {
    currentUser = { id: 1, role: 'admin', isAdmin: true };
    const res = await request(app).get('/api/fhir/r4/Patient/$export');
    expect(res.status).toBe(202);
    expect(res.body.jobId).toBe('job-1');
  });
});

describe('GET /bulkstatus/:jobId and /bulkdata/:jobId/:filename — admin-only', () => {
  it('a regular patient user cannot poll export status', async () => {
    currentUser = { id: 42, role: 'user', isAdmin: false };
    const res = await request(app).get('/api/fhir/r4/bulkstatus/job-1');
    expect(res.status).toBe(403);
  });
  it('a regular patient user cannot download an export file', async () => {
    currentUser = { id: 42, role: 'user', isAdmin: false };
    const res = await request(app).get('/api/fhir/r4/bulkdata/job-1/Patient.ndjson');
    expect(res.status).toBe(403);
  });
  it('an admin can poll export status', async () => {
    currentUser = { id: 1, role: 'admin', isAdmin: true };
    const res = await request(app).get('/api/fhir/r4/bulkstatus/job-1');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
  });
});
