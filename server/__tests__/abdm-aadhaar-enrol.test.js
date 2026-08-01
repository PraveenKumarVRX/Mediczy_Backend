process.env.NODE_ENV = 'test';
process.env.ABDM_AADHAAR_ENROL_MOCK = 'true';

import crypto from 'crypto';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const poolQuery = jest.fn().mockResolvedValue({ rows: [] });

jest.unstable_mockModule('../db/pgPool.js', () => ({
  default: { query: (...args) => poolQuery(...args) },
}));

jest.unstable_mockModule('../config/redis.js', () => ({
  default: null,
  redisClient: null,
}));

jest.unstable_mockModule('../services/abdm-client.service.js', () => ({
  getAccessToken: async () => 'SANDBOX_MOCK_TOKEN',
  ensureAbdmTables: async () => {},
}));

const {
  encryptForAbdm,
  initiateAadhaarAbhaEnrol,
  verifyAadhaarAbhaEnrol,
} = await import('../services/abdm-aadhaar-enrol.service.js');

describe('encryptForAbdm', () => {
  it('produces decryptable OAEP SHA-1 ciphertext', () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = publicKey.export({ type: 'spki', format: 'pem' });
    const cipher = encryptForAbdm('123456789012', pem);
    expect(cipher).toBeTruthy();
    const plain = crypto.privateDecrypt(
      {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha1',
      },
      Buffer.from(cipher, 'base64')
    );
    expect(plain.toString('utf8')).toBe('123456789012');
  });
});

describe('mock Aadhaar ABHA enrol flow', () => {
  beforeEach(() => {
    poolQuery.mockReset();
    poolQuery.mockResolvedValue({ rows: [] });
  });

  it('rejects invalid aadhaar on init', async () => {
    await expect(
      initiateAadhaarAbhaEnrol({ aadhaarNumber: '1234', mobile: '9884089921' })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('init → verify with OTP 123456 returns ABHA', async () => {
    const init = await initiateAadhaarAbhaEnrol({
      aadhaarNumber: '999941057058',
      mobile: '9884089921',
      inviteTokenHash: 'abc',
      tenantId: 7,
      name: 'Test Patient',
    });
    expect(init.txnId).toBeTruthy();
    expect(init.mock).toBe(true);

    const verified = await verifyAadhaarAbhaEnrol({
      txnId: init.txnId,
      otp: '123456',
      mobile: '9884089921',
      inviteTokenHash: 'abc',
      firstName: 'Test',
      lastName: 'Patient',
    });
    expect(verified.verified).toBe(true);
    expect(verified.abhaNumber).toMatch(/^\d{2}-\d{4}-\d{4}-\d{4}$/);
    expect(verified.aadhaarLast4).toBe('7058');
  });

  it('rejects wrong OTP in mock', async () => {
    const init = await initiateAadhaarAbhaEnrol({
      aadhaarNumber: '999941057058',
      mobile: '9884089921',
    });
    await expect(
      verifyAadhaarAbhaEnrol({ txnId: init.txnId, otp: '000000' })
    ).rejects.toMatchObject({ status: 400 });
  });
});
