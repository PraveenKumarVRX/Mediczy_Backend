import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

describe('RingFencing public doctor auth endpoints', () => {
  let app;

  beforeAll(async () => {
    const { default: ringFencingMiddleware } = await import('../middleware/ringFencing.js');

    app = express();
    app.use(express.json());
    app.use(ringFencingMiddleware);

    app.get('/api/auth/doctor/oauth/status', (_req, res) => {
      res.status(200).json({ ok: true });
    });

    app.post('/api/doctors/refresh', (_req, res) => {
      res.status(400).json({ errorCode: 'REFRESH_TOKEN_REQUIRED' });
    });

    app.post('/api/doctors/session/bootstrap', (_req, res) => {
      res.status(400).json({ errorCode: 'REFRESH_TOKEN_REQUIRED' });
    });

    app.post('/api/doctors/private-only', (_req, res) => {
      res.status(200).json({ ok: true });
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows doctor oauth status without auth token', async () => {
    const res = await request(app).get('/api/auth/doctor/oauth/status');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('allows doctor refresh endpoint without auth token (route validates body)', async () => {
    const res = await request(app)
      .post('/api/doctors/refresh')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ errorCode: 'REFRESH_TOKEN_REQUIRED' });
  });

  it('allows doctor bootstrap endpoint without auth token (route validates body)', async () => {
    const res = await request(app)
      .post('/api/doctors/session/bootstrap')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ errorCode: 'REFRESH_TOKEN_REQUIRED' });
  });

  it('still protects non-public doctor endpoints', async () => {
    const res = await request(app).post('/api/doctors/private-only').send({});

    expect(res.status).toBe(401);
  });
});
