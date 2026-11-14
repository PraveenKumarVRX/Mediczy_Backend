import { jest, it, expect, afterAll } from '@jest/globals';
const saved = { ...process.env };
process.env.NODE_ENV = 'production';
process.env.ABDM_AADHAAR_ENROL_MOCK = 'true';
delete process.env.ABDM_BASE_URL;
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query: jest.fn(async () => ({ rows: [] })) } }));
jest.unstable_mockModule('../config/redis.js', () => ({ default: null }));
jest.unstable_mockModule('../services/abdm-client.service.js', () => ({ getAccessToken: async () => 'SANDBOX_MOCK_TOKEN', ensureAbdmTables: async () => {} }));
const { initiateAadhaarAbhaEnrol } = await import('../services/abdm-aadhaar-enrol.service.js');
afterAll(() => { process.env = saved; });
it('cannot create a fabricated enrolment in production even with mock flags and a sandbox token', async () => {
  await expect(initiateAadhaarAbhaEnrol({ aadhaarNumber: '999941057058', mobile: '9000000001' })).rejects.toThrow('not configured for live enrolment');
});
