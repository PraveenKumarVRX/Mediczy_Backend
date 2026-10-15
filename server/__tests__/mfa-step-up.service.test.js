import { generateTotpSecret, totpCode, verifyTotp } from '../services/mfa-step-up.service.js';

describe('MFA step-up TOTP primitives', () => {
  test('generates a stable six digit code and accepts small clock drift', () => {
    const secret = generateTotpSecret();
    const now = Date.UTC(2026, 9, 14, 10, 0, 0);
    const code = totpCode(secret, now);
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotp(secret, code, now)).toBe(true);
    expect(verifyTotp(secret, code, now + 30_000)).toBe(true);
    expect(verifyTotp(secret, code, now + 120_000)).toBe(false);
  });

  test('rejects malformed and incorrect codes', () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, 'abc123')).toBe(false);
    expect(verifyTotp(secret, '000000', Date.UTC(2026, 9, 14))).toBe(false);
  });
});
