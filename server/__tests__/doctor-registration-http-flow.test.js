import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

const mockOtpGenerate = jest.fn();
const mockOtpVerify = jest.fn();
const mockDoctorFindOne = jest.fn();
const mockDoctorCreate = jest.fn();
const mockEmailLogCreate = jest.fn();
const mockEmailLogFindOne = jest.fn();
const mockIngest = jest.fn();

jest.unstable_mockModule('../models/otp.model.intelligent.js', () => ({
  default: {
    generate: mockOtpGenerate,
    verify: mockOtpVerify,
  },
}));

jest.unstable_mockModule('../models/doctor.model.intelligent.js', () => ({
  default: {
    findOne: mockDoctorFindOne,
    create: mockDoctorCreate,
  },
}));

jest.unstable_mockModule('../models/user.model.intelligent.js', () => ({
  User: { findOne: jest.fn() },
}));

jest.unstable_mockModule('../utils/intelligentDbClient.js', () => ({
  default: { ingest: mockIngest },
}));

jest.unstable_mockModule('../middleware/audit.middleware.js', () => ({
  auditLoginAttempt: jest.fn(),
}));

jest.unstable_mockModule('../services/emailService.js', () => ({
  default: {
    getDefaultConfig: jest.fn().mockResolvedValue(null),
    getTransporter: jest.fn(),
  },
}));

jest.unstable_mockModule('../models/email.model.js', () => ({
  EmailLog: {
    create: mockEmailLogCreate,
    findOne: mockEmailLogFindOne,
  },
}));

jest.unstable_mockModule('../middleware/rateLimiter.middleware.js', () => ({
  authLimiter: (_req, _res, next) => next(),
}));

jest.unstable_mockModule('../integrations/nodemailer.js', () => ({
  default: {
    createTransport: jest.fn(() => ({
      sendMail: jest.fn().mockResolvedValue({ messageId: 'm-1', response: 'ok' }),
    })),
  },
}));

jest.unstable_mockModule('../integrations/twilio.js', () => ({
  default: jest.fn(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({ sid: 'wa-1', status: 'sent' }),
    },
  })),
}));

let app;

describe('Doctor Registration HTTP Flow (OTP verify + register)', () => {
  beforeAll(async () => {
    const { addOtpRoutes } = await import('../routes/shared/registrationHelpers.js');
    const { registerDoctor } = await import('../controller/doctor.controller.js');

    const router = express.Router();
    addOtpRoutes(router, 'Doctor');
    router.post('/register', registerDoctor);

    app = express();
    app.use(express.json());
    app.use('/api/doctors', router);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockRejectedValue(new Error('fetch disabled in tests'));

    mockOtpGenerate.mockResolvedValue({ id: 'otp-1', code: '123456', expiresAt: new Date(Date.now() + 10 * 60 * 1000) });
    mockOtpVerify.mockImplementation(async ({ email, phone, code }) => {
      if (email && code === '111111') return { success: true };
      if (phone && code === '222222') return { success: true };
      return { success: false, message: 'Invalid OTP' };
    });

    mockEmailLogCreate.mockResolvedValue({
      id: 1,
      metadata: {},
      update: jest.fn().mockResolvedValue(undefined),
    });
    mockEmailLogFindOne.mockResolvedValue(null);

    mockDoctorFindOne.mockResolvedValue(null);
    mockDoctorCreate.mockResolvedValue({
      id: 901,
      prefix: 'Dr.',
      firstName: 'Anita',
      lastName: 'Rao',
      email: 'anita@example.com',
      phoneNumber: '9876543210',
      specialization: 'General Medicine',
      experience: 8,
      isVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockIngest.mockResolvedValue(undefined);
  });

  it('completes OTP verification and doctor registration with valid tickets', async () => {
    const sendEmailRes = await request(app)
      .post('/api/doctors/send-email-otp')
      .send({ email: 'anita@example.com' });
    expect(sendEmailRes.status).toBe(200);
    expect(sendEmailRes.body.success).toBe(true);

    const verifyEmailRes = await request(app)
      .post('/api/doctors/verify-email-otp')
      .send({ email: 'anita@example.com', code: '111111' });
    expect(verifyEmailRes.status).toBe(200);
    expect(verifyEmailRes.body.success).toBe(true);
    expect(verifyEmailRes.body.verificationTicket).toBeTruthy();

    const sendPhoneRes = await request(app)
      .post('/api/doctors/send-phone-otp')
      .send({ phone: '9876543210' });
    expect(sendPhoneRes.status).toBe(200);
    expect(sendPhoneRes.body.success).toBe(true);

    const verifyPhoneRes = await request(app)
      .post('/api/doctors/verify-phone-otp')
      .send({ phone: '9876543210', code: '222222' });
    expect(verifyPhoneRes.status).toBe(200);
    expect(verifyPhoneRes.body.success).toBe(true);
    expect(verifyPhoneRes.body.verificationTicket).toBeTruthy();

    const registerRes = await request(app)
      .post('/api/doctors/register')
      .send({
        email: 'anita@example.com',
        password: 'StrongPass123!',
        firstName: 'Anita',
        lastName: 'Rao',
        phoneNumber: '9876543210',
        specialization: 'General Medicine',
        experience: 8,
        documents: {
          verifications: {
            emailVerificationTicket: verifyEmailRes.body.verificationTicket,
            phoneVerificationTicket: verifyPhoneRes.body.verificationTicket,
          },
        },
      });

    expect(registerRes.status).toBe(201);
    expect(registerRes.body).toMatchObject({
      pendingActivation: true,
      doctor: {
        id: 901,
        email: 'anita@example.com',
      },
    });

    expect(mockDoctorFindOne).toHaveBeenCalled();
    expect(mockDoctorCreate).toHaveBeenCalled();
    expect(mockOtpGenerate).toHaveBeenCalledTimes(2);
    expect(mockOtpVerify).toHaveBeenCalledTimes(2);
  });
});
