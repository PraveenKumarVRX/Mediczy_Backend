import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const otpVerify = jest.fn();
const userFindOne = jest.fn();
const userUpdate = jest.fn();
const model = () => ({ findOne: jest.fn(), update: jest.fn(), rawAttributes: {} });

jest.unstable_mockModule('../models/otp.model.intelligent.js', () => ({ default: { verify: otpVerify } }));
jest.unstable_mockModule('../models/user.model.intelligent.js', () => ({
  default: { findOne: userFindOne, update: userUpdate, rawAttributes: { metadata: {} } },
}));
jest.unstable_mockModule('../models/doctor.model.intelligent.js', () => ({ default: model() }));
jest.unstable_mockModule('../models/hospital.model.intelligent.js', () => ({ default: model() }));
jest.unstable_mockModule('../models/nurse.model.intelligent.js', () => ({ default: model() }));
jest.unstable_mockModule('../models/postgres/pharmacy.model.postgres.js', () => ({ default: model() }));
jest.unstable_mockModule('../models/postgres/corporate.model.postgres.js', () => ({ default: model() }));
jest.unstable_mockModule('../services/gupshup-whatsapp.service.js', () => ({ default: {}, whatsappProvider: () => null }));
jest.unstable_mockModule('../services/welcome-email.service.js', () => ({ sendTransactionalEmail: jest.fn() }));
jest.unstable_mockModule('../services/sms.service.js', () => ({ SMSService: class {}, SMSTemplateManager: class {} }));
jest.unstable_mockModule('../services/emailService.js', () => ({ default: {} }));
jest.unstable_mockModule('../services/notification.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../integrations/twilio.js', () => ({ default: () => ({}) }));

const { default: service } = await import('../services/password-reset.service.js');
const { default: router } = await import('../routes/password-reset.route.js');

const app = express();
app.use(express.json());
app.use('/api/password-reset', router);

const EMAIL = 'nethaji.example@example.invalid';
let account;
let storedTokenHash;

beforeEach(() => {
  otpVerify.mockReset().mockResolvedValue({ success: true });
  userUpdate.mockReset().mockImplementation(async (values) => { storedTokenHash = values.passwordResetToken; });
  account = {
    id: 7649, email: EMAIL, status: 'active', isActive: true,
    metadata: { requirePasswordChange: true, source: 'welcome' },
    save: jest.fn(),
  };
  userFindOne.mockReset().mockImplementation(async ({ where }) => {
    if (where?.passwordResetToken) {
      if (where.passwordResetToken !== storedTokenHash) return null;
      return Object.assign(account, { passwordResetExpires: new Date(Date.now() + 60000) });
    }
    return account;
  });
});

describe('forgot password from the My SmartHealth app', () => {
  it('accepts the code sent as `otp`, then resets with email and code and clears the forced change', async () => {
    const verified = await request(app).post('/api/password-reset/verify-otp').send({ email: EMAIL, otp: '482913' });
    expect(verified.body.success).toBe(true);
    expect(otpVerify).toHaveBeenCalledWith(expect.objectContaining({ code: '482913', email: EMAIL }));

    const reset = await request(app).post('/api/password-reset/reset').send({ email: EMAIL, otp: '482913', newPassword: 'NewPass#2026' });
    expect(reset.body).toMatchObject({ success: true });
    expect(account.password).toBe('NewPass#2026');
    expect(account.metadata).toEqual({ requirePasswordChange: false, source: 'welcome' });
    expect(account.passwordResetToken).toBeNull();
  });

  it('refuses a reset with a code that was not the one verified', async () => {
    await request(app).post('/api/password-reset/verify-otp').send({ email: EMAIL, otp: '482913' });
    const reset = await request(app).post('/api/password-reset/reset').send({ email: EMAIL, otp: '111111', newPassword: 'NewPass#2026' });
    expect(reset.body.success).toBe(false);
    expect(reset.body.message).toMatch(/invalid or has expired/);
    expect(account.save).not.toHaveBeenCalled();
  });

  it('still serves the web flow with code and resetToken', async () => {
    const verified = await request(app).post('/api/password-reset/verify-otp').send({ email: EMAIL, code: '482913' });
    const reset = await request(app).post('/api/password-reset/reset')
      .send({ resetToken: verified.body.data.resetToken, newPassword: 'NewPass#2026' });
    expect(reset.body.success).toBe(true);
  });

  it('asks for a code or token when neither is sent', async () => {
    const res = await request(app).post('/api/password-reset/reset').send({ email: EMAIL, newPassword: 'NewPass#2026' });
    expect(res.status).toBe(400);
    expect(typeof service.resetPasswordWithOtp).toBe('function');
  });
});
