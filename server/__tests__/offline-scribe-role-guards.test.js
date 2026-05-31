import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

jest.unstable_mockModule('../middleware/auth.middleware.js', () => ({
  authUser: (req, _res, next) => {
    req.user = { id: 301, role: 'assistant' };
    req.userRole = 'assistant';
    next();
  },
  requireRole: () => (_req, _res, next) => next(),
}));

jest.unstable_mockModule('../config/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.unstable_mockModule('../services/ai-brain/llm-provider.js', () => ({
  default: {
    generate: jest.fn(),
    transcribe: jest.fn(),
  },
}));

let app;

describe('Offline Scribe Doctor-Only Prescription Guard', () => {
  beforeAll(async () => {
    const { default: router } = await import('../routes/offline-scribe.route.js');
    app = express();
    app.use(express.json());
    app.use('/api/offline-scribe', router);
  });

  it('returns 403 when non-doctor requests prescription generation', async () => {
    const res = await request(app)
      .post('/api/offline-scribe/prescription')
      .set('Authorization', 'Bearer test-token')
      .send({ dictation: 'Tab paracetamol 500 mg twice daily for 3 days' });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      success: false,
      code: 'DOCTOR_ONLY_DOCUMENT_TYPE',
    });
  });
});
