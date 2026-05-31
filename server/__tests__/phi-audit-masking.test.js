import { maskPhi } from '../utils/phi-masker.js';
import { sanitizeForAudit } from '../middleware/audit.middleware.js';

describe('PHI masking integration', () => {
  it('maskPhi redacts known PHI fields', () => {
    const input = {
      medicalHistory: { diagnosis: 'hypertension' },
      bloodType: 'O+',
      phoneNumber: '+91-9999999999',
      safe: 'ok',
    };

    const out = maskPhi(input);
    expect(out.medicalHistory).toBe('[REDACTED-OBJ]');
    expect(out.bloodType).toMatch(/\[REDACTED-/);
    expect(out.phoneNumber).toMatch(/\[REDACTED-/);
    expect(out.safe).toBe('ok');
  });

  it('sanitizeForAudit removes secrets and masks PHI', () => {
    const before = {
      password: 'plain',
      token: 'jwt-token',
      secretKey: 'sekret',
      medicalHistory: { notes: 'sensitive' },
      allergies: ['penicillin'],
      unchanged: 123,
    };

    const out = sanitizeForAudit(before);
    expect(out.password).toBeUndefined();
    expect(out.token).toBeUndefined();
    expect(out.secretKey).toBeUndefined();
    expect(out.medicalHistory).toBe('[REDACTED-OBJ]');
    expect(out.allergies).toMatch(/\[REDACTED-ARRAY/);
    expect(out.unchanged).toBe(123);
  });
});
