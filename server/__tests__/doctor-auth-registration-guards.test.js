import { jest } from '@jest/globals';

const mockValidationResult = jest.fn();
const mockDoctorFindOne = jest.fn();
const mockDoctorCreate = jest.fn();
const mockUserFindOne = jest.fn();
const mockAuditLoginAttempt = jest.fn();
const mockVerifyRegistrationTicket = jest.fn();
const mockIssuePortalTokenPair = jest.fn();

jest.unstable_mockModule('express-validator', () => ({
  validationResult: mockValidationResult,
}));

jest.unstable_mockModule('../models/doctor.model.intelligent.js', () => ({
  default: {
    findOne: mockDoctorFindOne,
    create: mockDoctorCreate,
  },
}));

jest.unstable_mockModule('../models/user.model.intelligent.js', () => ({
  User: {
    findOne: mockUserFindOne,
  },
}));

jest.unstable_mockModule('../utils/intelligentDbClient.js', () => ({
  default: {
    ingest: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.unstable_mockModule('../middleware/audit.middleware.js', () => ({
  auditLoginAttempt: mockAuditLoginAttempt,
}));

jest.unstable_mockModule('../routes/shared/registrationHelpers.js', () => ({
  verifyRegistrationVerificationTicket: mockVerifyRegistrationTicket,
}));

jest.unstable_mockModule('../services/token-revocation.service.js', () => ({
  issuePortalTokenPair: mockIssuePortalTokenPair,
}));

jest.unstable_mockModule('nodemailer', () => ({
  default: {
    createTransport: () => ({
      sendMail: jest.fn().mockResolvedValue({ messageId: 'mock-message-id' }),
    }),
  },
}));

const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('Doctor Auth + Registration Guards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockValidationResult.mockReturnValue({
      isEmpty: () => true,
      array: () => [],
    });

    global.fetch = jest.fn().mockRejectedValue(new Error('fetch mocked in tests'));
  });

  it('blocks registration when email verification ticket is invalid', async () => {
    const { registerDoctor } = await import('../controller/doctor.controller.js');

    mockVerifyRegistrationTicket.mockImplementation(({ type }) => {
      if (type === 'email') {
        return { success: false, message: 'invalid email ticket' };
      }
      return { success: true };
    });

    const req = {
      body: {
        email: 'doctor@example.com',
        phoneNumber: '9876543210',
        documents: {
          verifications: {
            emailVerificationTicket: 'bad-ticket',
            phoneVerificationTicket: 'good-ticket',
          },
        },
      },
    };
    const res = makeRes();

    await registerDoctor(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Email verification is required before registration.',
    }));
    expect(mockDoctorCreate).not.toHaveBeenCalled();
  });

  it('allows doctor login with phone identifier when credentials are valid', async () => {
    const { signInDoctor } = await import('../controller/doctor.controller.js');

    const doctorRecord = {
      id: 42,
      email: 'doctor@example.com',
      firstName: 'Asha',
      lastName: 'K',
      specialization: 'General Practitioner',
      experience: 6,
      status: 'active',
      isActive: true,
      isVerified: true,
      isOnline: false,
      lastActivityAt: null,
      lastLoginAt: null,
      comparePassword: jest.fn().mockResolvedValue(true),
      update: jest.fn().mockResolvedValue(undefined),
    };

    mockDoctorFindOne.mockResolvedValue(doctorRecord);
    mockUserFindOne.mockResolvedValue(null);
    mockIssuePortalTokenPair.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    const req = {
      body: {
        email: '9876543210',
        password: 'Valid@123',
      },
      headers: {},
    };
    const res = makeRes();

    await signInDoctor(req, res);

    expect(mockDoctorFindOne).toHaveBeenCalled();
    expect(mockDoctorFindOne.mock.calls[0][0]).toEqual(expect.objectContaining({
      where: { phoneNumber: '9876543210' },
    }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Login successful',
      token: 'access-token',
      refreshToken: 'refresh-token',
    }));
  });

  it('allows an active doctor login even when a patient row with the same email is inactive', async () => {
    const { signInDoctor } = await import('../controller/doctor.controller.js');

    const doctorRecord = {
      id: 77,
      email: 'doctor@example.com',
      firstName: 'Ramya',
      lastName: 'S',
      specialization: 'General Practitioner',
      experience: 8,
      status: 'active',
      isActive: true,
      isVerified: true,
      isOnline: false,
      lastActivityAt: null,
      lastLoginAt: null,
      comparePassword: jest.fn().mockResolvedValue(true),
      update: jest.fn().mockResolvedValue(undefined),
    };

    mockDoctorFindOne.mockResolvedValue(doctorRecord);
    mockUserFindOne.mockResolvedValue({ id: 200, status: 'inactive', role: 'patient' });
    mockIssuePortalTokenPair.mockResolvedValue({
      accessToken: 'doctor-access-token',
      refreshToken: 'doctor-refresh-token',
    });

    const req = {
      body: {
        email: 'doctor@example.com',
        password: 'Valid@123',
      },
      headers: {},
    };
    const res = makeRes();

    await signInDoctor(req, res);

    expect(mockDoctorFindOne).toHaveBeenCalledWith(expect.objectContaining({
      where: { email: 'doctor@example.com' },
    }));
    expect(mockUserFindOne).not.toHaveBeenCalled();
    expect(doctorRecord.comparePassword).toHaveBeenCalledWith('Valid@123');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Login successful',
      token: 'doctor-access-token',
      refreshToken: 'doctor-refresh-token',
    }));
  });
});
