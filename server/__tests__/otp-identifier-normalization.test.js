import { jest } from '@jest/globals';

const records = new Map();
const redis = {
  keys: jest.fn(async (pattern) => {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*');
    const matcher = new RegExp(`^${escaped}$`);
    return [...records.keys()].filter((key) => matcher.test(key));
  }),
  ttl: jest.fn(async () => 600),
};

const cache = {
  set: jest.fn(async (key, value) => records.set(key, value)),
  get: jest.fn(async (key) => records.get(key) || null),
  del: jest.fn(async (key) => records.delete(key)),
};

jest.unstable_mockModule('../db/redis.js', () => ({
  cache,
  connectRedis: jest.fn(async () => redis),
}));

const { default: OTP } = await import('../models/otp.model.intelligent.js');

describe('OTP identifier normalization', () => {
  beforeEach(() => {
    records.clear();
    jest.clearAllMocks();
  });

  it('verifies an email OTP despite case and whitespace differences', async () => {
    const generated = await OTP.generate({
      email: ' Patient@Example.COM ',
      purpose: 'password_reset',
      userId: 'user-42',
    });

    const result = await OTP.verify({
      email: 'patient@example.com',
      code: generated.code,
      purpose: 'password_reset',
    });

    expect(generated.email).toBe('patient@example.com');
    expect(result.success).toBe(true);
  });
});
