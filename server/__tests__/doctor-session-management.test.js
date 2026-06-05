import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

const mockListActivePortalSessions = jest.fn();
const mockRevokePortalSessionForUser = jest.fn();
const mockRevokeOtherPortalSessions = jest.fn();

jest.unstable_mockModule('../middleware/auth.middleware.js', () => ({
  authUser: (req, _res, next) => {
    req.user = { id: 1748, role: 'doctor' };
    req.userRole = 'doctor';
    next();
  },
  requireRole: () => (_req, _res, next) => next(),
}));

jest.unstable_mockModule('../middleware/rateLimiter.middleware.js', () => ({
  authLimiter: (_req, _res, next) => next(),
}));

jest.unstable_mockModule('../middleware/audit.middleware.js', () => ({
  auditLoginAttempt: jest.fn(),
}));

jest.unstable_mockModule('../services/token-revocation.service.js', () => ({
  issuePortalTokenPair: jest.fn(),
  rotatePortalRefreshToken: jest.fn(),
  listActivePortalSessions: mockListActivePortalSessions,
  revokePortalSessionForUser: mockRevokePortalSessionForUser,
  revokeOtherPortalSessions: mockRevokeOtherPortalSessions,
}));

jest.unstable_mockModule('../models/doctor.model.intelligent.js', () => ({
  default: {
    findOne: jest.fn(),
    findByPk: jest.fn(),
  },
}));

jest.unstable_mockModule('../models/index.js', () => ({
  Doctor: {
    findByPk: jest.fn(),
    findAll: jest.fn(),
  },
  User: {
    findOne: jest.fn(),
    findByPk: jest.fn(),
  },
}));

jest.unstable_mockModule('../services/tenant-partner.service.js', () => ({
  default: {
    listPartnerDoctors: jest.fn().mockResolvedValue([]),
  },
}));

let app;

describe('Doctor session management endpoints', () => {
  beforeAll(async () => {
    const { default: router } = await import('../routes/doctor.enhanced.route.js');
    app = express();
    app.use(express.json());
    app.use('/api/doctors', router);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists active sessions for doctor', async () => {
    mockListActivePortalSessions.mockResolvedValue([
      {
        jti: '11111111-1111-4111-8111-111111111111',
        device_fp: 'android-abc',
        created_at: '2026-06-05T09:12:13.000Z',
        expires_at: '2026-07-05T09:12:13.000Z',
      },
      {
        jti: '22222222-2222-4222-8222-222222222222',
        device_fp: 'ios-def',
        created_at: '2026-06-04T09:12:13.000Z',
        expires_at: '2026-07-04T09:12:13.000Z',
      },
    ]);

    const res = await request(app)
      .get('/api/doctors/sessions')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.sessions).toHaveLength(2);
    expect(res.body.sessions[0]).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      deviceFingerprint: 'android-abc',
    });
    expect(mockListActivePortalSessions).toHaveBeenCalledWith(1748, 'doctor');
  });

  it('revokes a selected doctor session', async () => {
    mockRevokePortalSessionForUser.mockResolvedValue(true);

    const res = await request(app)
      .delete('/api/doctors/sessions/33333333-3333-4333-8333-333333333333')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      message: 'Session logged out successfully',
    });
    expect(mockRevokePortalSessionForUser).toHaveBeenCalledWith(
      1748,
      'doctor',
      '33333333-3333-4333-8333-333333333333'
    );
  });

  it('returns 404 when selected session is not found', async () => {
    mockRevokePortalSessionForUser.mockResolvedValue(false);

    const res = await request(app)
      .delete('/api/doctors/sessions/44444444-4444-4444-8444-444444444444')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      success: false,
      message: 'Session not found',
    });
  });

  it('logs out other sessions and keeps current one', async () => {
    mockRevokeOtherPortalSessions.mockResolvedValue(3);

    const res = await request(app)
      .post('/api/doctors/sessions/logout-others')
      .set('Authorization', 'Bearer test-token')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      message: 'Logged out from other devices',
      revokedCount: 3,
    });
    expect(mockRevokeOtherPortalSessions).toHaveBeenCalledWith(1748, 'doctor', null);
  });
});
