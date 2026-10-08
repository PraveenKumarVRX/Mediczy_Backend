import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

let currentUser = { id: 401, role: 'doctor' };
const query = jest.fn().mockRejectedValue(new Error('relation "operations_audit_log" does not exist'));

jest.unstable_mockModule('../middleware/auth.middleware.js', () => ({
  authUser: (req, _res, next) => { req.user = currentUser; req.userRole = currentUser.role; next(); },
  requireRole: () => (_req, _res, next) => next(),
}));
jest.unstable_mockModule('../config/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.unstable_mockModule('../services/ai-brain/llm-provider.js', () => ({
  default: { generate: jest.fn(), transcribe: jest.fn() },
}));
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query } }));

let app;

describe('Offline Scribe ambient sessions: consent and discard', () => {
  beforeAll(async () => {
    const { default: router } = await import('../routes/offline-scribe.route.js');
    app = express();
    app.use(express.json());
    app.use('/api/offline-scribe', router);
  });

  it('refuses to start a session without consent', async () => {
    const res = await request(app).post('/api/offline-scribe/sessions').send({ document_type: 'opd-notes' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CONSENT_REQUIRED');
  });

  it('starts with consent even when the audit table is missing, and audits to the pool', async () => {
    const res = await request(app).post('/api/offline-scribe/sessions')
      .send({ document_type: 'opd-notes', consent_granted: true, consent_method: 'verbal' });
    expect(res.status).toBe(201);
    expect(res.body.sessionId).toBeTruthy();
    expect(query).toHaveBeenCalled();
    expect(query.mock.calls[0][1][1]).toBe('start');
  });

  it('lets only the owner discard a session, once', async () => {
    const { body } = await request(app).post('/api/offline-scribe/sessions')
      .send({ document_type: 'opd-notes', consent_granted: 'true' });
    const id = body.sessionId;

    currentUser = { id: 402, role: 'doctor' };
    expect((await request(app).post(`/api/offline-scribe/sessions/${id}/discard`).send({})).status).toBe(404);

    currentUser = { id: 401, role: 'doctor' };
    const ok = await request(app).post(`/api/offline-scribe/sessions/${id}/discard`).send({ reason: 'patient withdrew' });
    expect(ok.status).toBe(200);
    expect(ok.body.discarded).toBe(true);
    expect((await request(app).post(`/api/offline-scribe/sessions/${id}/discard`).send({})).status).toBe(404);
  });
});
