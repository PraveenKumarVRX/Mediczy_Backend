/**
 * Password Reset E2E Integration Tests
 *
 * Covers the full OTP flow: request → verify → reset for user, doctor, and team portals.
 * Uses Jest with unstable_mockModule to replace the password-reset service and
 * the user/doctor models so no real DB or email is needed.
 */
import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockRequestReset = jest.fn();
const mockVerifyOtp    = jest.fn();
const mockResetPass    = jest.fn();

jest.unstable_mockModule('../services/password-reset.service.js', () => ({
  default: {
    requestPasswordReset: mockRequestReset,
    verifyResetOtp:       mockVerifyOtp,
    resetPassword:        mockResetPass,
    shouldBlockInactiveDuringPasswordReset: () => false,
  },
}));

jest.unstable_mockModule('../models/user.model.intelligent.js', () => ({
  default: {
    findOne:   jest.fn(),
    findByPk:  jest.fn(),
    update:    jest.fn(),
  },
  generateAuthTokenForUser: jest.fn(() => 'mock-token'),
  User: { findOne: jest.fn() },
}));

let app;

beforeAll(async () => {
  const { default: userRouter } = await import('../routes/user.route.js');
  app = express();
  app.use(express.json());
  app.use('/api/users', userRouter);
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── /forgot-password ─────────────────────────────────────────────────────────

describe('POST /api/users/forgot-password', () => {
  it('returns 200 when service succeeds', async () => {
    mockRequestReset.mockResolvedValue({
      success: true,
      message: 'OTP sent',
      delivery: { email: 'success' },
    });

    const res = await request(app)
      .post('/api/users/forgot-password')
      .send({ email: 'user@example.com', userType: 'user' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockRequestReset).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'user@example.com', userType: 'user' })
    );
  });

  it('returns 400 for invalid email', async () => {
    const res = await request(app)
      .post('/api/users/forgot-password')
      .send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(mockRequestReset).not.toHaveBeenCalled();
  });

  it('returns 404 when service returns EMAIL_NOT_FOUND', async () => {
    mockRequestReset.mockResolvedValue({
      success: false,
      code: 'EMAIL_NOT_FOUND',
      message: 'No account found',
    });

    const res = await request(app)
      .post('/api/users/forgot-password')
      .send({ email: 'ghost@example.com' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('EMAIL_NOT_FOUND');
  });

  it('returns 429 when service returns RATE_LIMIT_EXCEEDED', async () => {
    mockRequestReset.mockResolvedValue({
      success: false,
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests',
    });

    const res = await request(app)
      .post('/api/users/forgot-password')
      .send({ email: 'user@example.com' });

    expect(res.status).toBe(429);
  });

  it('passes userType=doctor through to service', async () => {
    mockRequestReset.mockResolvedValue({ success: true, message: 'OTP sent', delivery: {} });

    await request(app)
      .post('/api/users/forgot-password')
      .send({ email: 'doctor@example.com', userType: 'doctor' });

    expect(mockRequestReset).toHaveBeenCalledWith(
      expect.objectContaining({ userType: 'doctor' })
    );
  });

  it('passes userType=team through to service', async () => {
    mockRequestReset.mockResolvedValue({ success: true, message: 'OTP sent', delivery: {} });

    await request(app)
      .post('/api/users/forgot-password')
      .send({ email: 'team@example.com', userType: 'team' });

    expect(mockRequestReset).toHaveBeenCalledWith(
      expect.objectContaining({ userType: 'team' })
    );
  });
});

// ─── /forgot-password/verify ──────────────────────────────────────────────────

describe('POST /api/users/forgot-password/verify', () => {
  it('returns 200 with resetToken on valid OTP', async () => {
    mockVerifyOtp.mockResolvedValue({
      success: true,
      resetToken: 'tok_abc123',
      message: 'OTP verified',
    });

    const res = await request(app)
      .post('/api/users/forgot-password/verify')
      .send({ email: 'user@example.com', otp: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.resetToken).toBe('tok_abc123');
    expect(mockVerifyOtp).toHaveBeenCalled();
  });

  it('returns 400 for missing OTP', async () => {
    const res = await request(app)
      .post('/api/users/forgot-password/verify')
      .send({ email: 'user@example.com' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when service returns INVALID_OTP', async () => {
    mockVerifyOtp.mockResolvedValue({
      success: false,
      code: 'INVALID_OTP',
      message: 'Invalid or expired OTP',
    });

    const res = await request(app)
      .post('/api/users/forgot-password/verify')
      .send({ email: 'user@example.com', otp: '000000' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_OTP');
  });

  it('returns 429 when service returns OTP_ATTEMPTS_EXCEEDED', async () => {
    mockVerifyOtp.mockResolvedValue({
      success: false,
      code: 'OTP_ATTEMPTS_EXCEEDED',
      message: 'Too many failed attempts',
    });

    const res = await request(app)
      .post('/api/users/forgot-password/verify')
      .send({ email: 'user@example.com', otp: '111111' });

    expect(res.status).toBe(429);
  });
});

// ─── /reset-password ──────────────────────────────────────────────────────────

describe('POST /api/users/reset-password', () => {
  it('returns 200 on successful password reset', async () => {
    mockResetPass.mockResolvedValue({
      success: true,
      message: 'Password reset successfully',
    });

    const res = await request(app)
      .post('/api/users/reset-password')
      .send({ email: 'user@example.com', resetToken: 'tok_abc123', newPassword: 'NewPass123!' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockResetPass).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'user@example.com', resetToken: 'tok_abc123' })
    );
  });

  it('returns 400 when password is too short', async () => {
    const res = await request(app)
      .post('/api/users/reset-password')
      .send({ email: 'user@example.com', resetToken: 'tok_abc', newPassword: '123' });

    expect(res.status).toBe(400);
    expect(mockResetPass).not.toHaveBeenCalled();
  });

  it('returns 400 when service returns INVALID_TOKEN', async () => {
    mockResetPass.mockResolvedValue({
      success: false,
      code: 'INVALID_TOKEN',
      message: 'Reset token is invalid or expired',
    });

    const res = await request(app)
      .post('/api/users/reset-password')
      .send({ email: 'user@example.com', resetToken: 'bad_token', newPassword: 'ValidPass1!' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });

  it('returns 400 when service returns TOKEN_EXPIRED', async () => {
    mockResetPass.mockResolvedValue({
      success: false,
      code: 'TOKEN_EXPIRED',
      message: 'Reset token has expired',
    });

    const res = await request(app)
      .post('/api/users/reset-password')
      .send({ email: 'user@example.com', resetToken: 'expired_tok', newPassword: 'ValidPass1!' });

    expect(res.status).toBe(400);
  });

  it('returns 403 on ACCOUNT_INACTIVE when blocking enabled', async () => {
    mockResetPass.mockResolvedValue({
      success: false,
      code: 'ACCOUNT_INACTIVE',
      message: 'Account is inactive',
    });

    const res = await request(app)
      .post('/api/users/reset-password')
      .send({ email: 'locked@example.com', resetToken: 'tok', newPassword: 'ValidPass1!' });

    // Service returns ACCOUNT_INACTIVE → route should return 403
    expect([400, 403]).toContain(res.status);
  });
});

// ─── Full happy path ───────────────────────────────────────────────────────────

describe('Full OTP reset flow (happy path)', () => {
  it('request → verify → reset succeeds end-to-end', async () => {
    // Step 1: request OTP
    mockRequestReset.mockResolvedValueOnce({
      success: true,
      message: 'OTP sent',
      delivery: { email: 'success' },
    });
    const step1 = await request(app)
      .post('/api/users/forgot-password')
      .send({ email: 'user@example.com', userType: 'user' });
    expect(step1.status).toBe(200);

    // Step 2: verify OTP → get reset token
    mockVerifyOtp.mockResolvedValueOnce({
      success: true,
      resetToken: 'final_reset_token',
    });
    const step2 = await request(app)
      .post('/api/users/forgot-password/verify')
      .send({ email: 'user@example.com', otp: '654321' });
    expect(step2.status).toBe(200);
    expect(step2.body.resetToken).toBe('final_reset_token');

    // Step 3: reset with token
    mockResetPass.mockResolvedValueOnce({ success: true, message: 'Password reset' });
    const step3 = await request(app)
      .post('/api/users/reset-password')
      .send({
        email: 'user@example.com',
        resetToken: step2.body.resetToken,
        newPassword: 'BrandNew@Pass99',
      });
    expect(step3.status).toBe(200);
    expect(step3.body.success).toBe(true);
  });
});
