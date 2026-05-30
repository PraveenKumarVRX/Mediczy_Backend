import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

const mockAppointmentFindAll = jest.fn();

jest.unstable_mockModule('../middleware/auth.middleware.js', () => ({
  authUser: (req, _res, next) => {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (token === 'regular-token') {
      req.user = { id: 20, role: 'user', email: 'regular.user@example.com' };
      req.userRole = 'user';
      return next();
    }

    req.user = { id: 19, role: 'user', email: 'user@mediczy.com' };
    req.userRole = 'user';
    return next();
  }
}));

jest.unstable_mockModule('../models/index.js', () => ({
  Appointment: {
    findAll: mockAppointmentFindAll
  },
  Doctor: {
    findAll: jest.fn(),
    findByPk: jest.fn()
  }
}));

jest.unstable_mockModule('../models/postgres/membershipPlan.model.postgres.js', () => ({
  UserPlan: {
    findOne: jest.fn()
  }
}));

jest.unstable_mockModule('../models/user.model.intelligent.js', () => ({
  default: {
    findByPk: jest.fn(),
    findAll: jest.fn()
  }
}));

jest.unstable_mockModule('../services/payment.service.js', () => ({
  default: {
    createOrder: jest.fn(),
    verifyPayment: jest.fn()
  }
}));

jest.unstable_mockModule('../services/notification.service.js', () => ({
  default: {
    notifyConsultationStarting: jest.fn()
  }
}));

jest.unstable_mockModule('../services/health-coins.service.js', () => ({
  default: {
    processConsultationPayment: jest.fn()
  }
}));

jest.unstable_mockModule('../utils/videoProvider.js', () => ({
  buildLiveKitJoinData: jest.fn(),
  createMeetingInfo: jest.fn(),
  ensureMeetingInfo: jest.fn(() => ({
    meetingId: 'apt-777-room',
    meetingLink: 'https://app.mediqzy.com/video/apt-777-room',
    meetingDetails: {},
    provider: 'livekit',
    needsUpdate: false
  })),
  getProviderLabel: jest.fn(() => 'LiveKit')
}));

let app;

const buildConfirmedPendingAppointment = () => ({
  id: 777,
  userId: 19,
  doctorId: 70,
  doctorName: 'Dr Demo',
  specialization: 'General Medicine',
  appointmentDate: '2099-12-31',
  appointmentTime: '10:00:00',
  consultationType: 'online',
  status: 'confirmed',
  paymentStatus: 'pending',
  consultationFee: 500,
  paymentAmount: '500.00',
  createdAt: new Date('2026-05-29T00:00:00.000Z')
});

describe('Consultation Membership Exemption Regression', () => {
  beforeAll(async () => {
    const { default: consultationRouter } = await import('../routes/online-consultation.route.js');
    app = express();
    app.use(express.json());
    app.use('/api/consultation', consultationRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockAppointmentFindAll.mockResolvedValue([buildConfirmedPendingAppointment()]);
  });

  it('marks exempt user appointments as video-join eligible even when payment is pending', async () => {
    const res = await request(app)
      .get('/api/consultation/my-appointments')
      .set('Authorization', 'Bearer exempt-token');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const grouped = res.body.appointments || {};
    const all = [
      ...(grouped.pending || []),
      ...(grouped.accepted || []),
      ...(grouped.confirmed || []),
      ...(grouped.upcoming || []),
      ...(grouped.past || []),
      ...(grouped.cancelled || [])
    ];

    const apt = all.find((entry) => entry.id === 777);
    expect(apt).toBeDefined();
    expect(apt.isMembershipRenewalExemptUser).toBe(true);
    expect(apt.paymentStatus).toBe('pending');
    expect(apt.paymentStatusEffective).toBe('credit');
    expect(apt.canJoinVideo).toBe(true);
  });

  it('keeps non-exempt user blocked on pending-payment video appointment', async () => {
    const res = await request(app)
      .get('/api/consultation/my-appointments')
      .set('Authorization', 'Bearer regular-token');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const grouped = res.body.appointments || {};
    const all = [
      ...(grouped.pending || []),
      ...(grouped.accepted || []),
      ...(grouped.confirmed || []),
      ...(grouped.upcoming || []),
      ...(grouped.past || []),
      ...(grouped.cancelled || [])
    ];

    const apt = all.find((entry) => entry.id === 777);
    expect(apt).toBeDefined();
    expect(apt.isMembershipRenewalExemptUser).toBe(false);
    expect(apt.paymentStatus).toBe('pending');
    expect(apt.paymentStatusEffective).toBe('pending');
    expect(apt.canJoinVideo).toBe(false);
  });
});
