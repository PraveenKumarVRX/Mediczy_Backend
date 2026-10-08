import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

let role = 'doctor';
jest.unstable_mockModule('../middleware/auth.middleware.js', () => ({
  authUser: (req, _res, next) => { req.user = { id: 1, role }; req.userRole = role; next(); },
  requireRole: (r) => (req, res, next) => (req.userRole === r ? next() : res.status(403).json({ success: false })),
}));
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query: jest.fn().mockResolvedValue({ rows: [] }) } }));

describe('GET /api/ai/gpu/metrics', () => {
  let app;
  beforeAll(async () => {
    const { default: router } = await import('../routes/ai-gpu-metrics.route.js');
    app = express();
    app.use('/api/ai/gpu', router);
  });

  it('is superadmin only', async () => {
    role = 'doctor';
    expect((await request(app).get('/api/ai/gpu/metrics')).status).toBe(403);
  });

  it('reports scheduler state per GPU for a superadmin', async () => {
    role = 'superadmin';
    const res = await request(app).get('/api/ai/gpu/metrics');
    expect(res.status).toBe(200);
    expect(res.body.schedulerEnabled).toBe(false);
    expect(Object.keys(res.body.gpus)).toEqual(expect.arrayContaining(['gpu3090', 'gpu3060', 'cpu']));
    expect(res.body.status).toBe('healthy');
  });
});
