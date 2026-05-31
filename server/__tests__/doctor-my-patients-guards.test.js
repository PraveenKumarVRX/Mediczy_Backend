import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

const mockAppointmentCount = jest.fn();
const mockUserFindByPk = jest.fn();
const mockUserQuery = jest.fn();

jest.unstable_mockModule('../middleware/auth.middleware.js', () => ({
  authDoctor: (req, _res, next) => {
    req.doctor = { id: 11, firstName: 'Doc', lastName: 'Guard' };
    next();
  },
}));

jest.unstable_mockModule('../controller/doctor.controller.js', () => ({
  registerDoctor: (_req, res) => res.status(501).json({ success: false }),
  signInDoctor: (_req, res) => res.status(501).json({ success: false }),
  getDoctorProfile: (_req, res) => res.status(501).json({ success: false }),
  getAvailableDoctors: (_req, res) => res.status(501).json({ success: false }),
  updateDoctorStatus: (_req, res) => res.status(501).json({ success: false }),
}));

jest.unstable_mockModule('../controller/appointment.controller.js', () => ({
  getDoctorAppointments: (_req, res) => res.status(501).json({ success: false }),
}));

jest.unstable_mockModule('../middleware/rateLimiter.middleware.js', () => ({
  authLimiter: (_req, _res, next) => next(),
  otpLimiter: (_req, _res, next) => next(),
}));

jest.unstable_mockModule('../routes/shared/registrationHelpers.js', () => ({
  addOtpRoutes: () => {},
}));

jest.unstable_mockModule('../services/google-places.service.js', () => ({
  default: {
    autocomplete: jest.fn().mockResolvedValue([]),
  },
}));

jest.unstable_mockModule('../models/index.js', () => ({
  Doctor: { findByPk: jest.fn() },
  Appointment: { count: mockAppointmentCount, findAll: jest.fn(), findOne: jest.fn(), findByPk: jest.fn() },
  User: {
    findByPk: mockUserFindByPk,
    sequelize: {
      query: mockUserQuery,
      QueryTypes: { SELECT: 'SELECT' },
    },
  },
}));

jest.unstable_mockModule('../models/postgres/membershipPlan.model.postgres.js', () => ({
  UserPlan: { findOne: jest.fn() },
}));

jest.unstable_mockModule('../services/notification.service.js', () => ({
  Notification: { findAll: jest.fn().mockResolvedValue([]), update: jest.fn(), destroy: jest.fn(), count: jest.fn().mockResolvedValue(0) },
}));

jest.unstable_mockModule('../db/redis.js', () => ({
  cache: { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(true) },
}));

jest.unstable_mockModule('../services/clinical-intelligence.service.js', () => ({
  evaluateVitalsAndAlert: jest.fn().mockResolvedValue(null),
}));

jest.unstable_mockModule('../utils/videoProvider.js', () => ({
  buildLiveKitJoinData: jest.fn(),
  ensureMeetingInfo: jest.fn(),
  getProviderLabel: jest.fn(),
}));

let app;

describe('Doctor My-Patients Guard Regression', () => {
  beforeAll(async () => {
    const { default: router } = await import('../routes/doctor.route.js');
    app = express();
    app.use(express.json());
    app.use('/api/doctors', router);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 403 when doctor has no relationship with patient for history write', async () => {
    mockAppointmentCount.mockResolvedValue(0);
    mockUserFindByPk.mockResolvedValue({ id: 123, primaryDoctorId: 99 });

    const res = await request(app)
      .post('/api/doctors/my-patients/123/history')
      .set('Authorization', 'Bearer test-token')
      .send({ condition: 'HTN' });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      success: false,
      message: 'No appointment relationship with this patient',
    });
  });

  it('returns 503 when history table is missing even if relationship exists', async () => {
    mockAppointmentCount.mockResolvedValue(0);
    mockUserFindByPk.mockResolvedValue({ id: 123, primaryDoctorId: 11 });
    mockUserQuery.mockRejectedValue({ original: { code: '42P01' } });

    const res = await request(app)
      .post('/api/doctors/my-patients/123/history')
      .set('Authorization', 'Bearer test-token')
      .send({ condition: 'DM2' });

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      success: false,
      code: 'HISTORY_TABLE_NOT_READY',
    });
  });
});
