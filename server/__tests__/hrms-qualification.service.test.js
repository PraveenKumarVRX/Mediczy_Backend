import { jest } from '@jest/globals';

const pool = { query: jest.fn() };
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: pool }));

const service = await import('../services/hrms-qualification.service.js');

describe('HRMS qualification and privilege governance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    service.resetHrmsQualificationReadinessForTests();
  });

  test('fails closed when qualification migration is missing', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ table_name: 'hr_staff_qualifications' }] });
    await expect(service.listStaffQualifications(7)).rejects.toMatchObject({ code: 'SCHEMA_NOT_MIGRATED', status: 503 });
  });

  test('creates a verified qualification with expiry', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ table_name: 'hr_staff_qualifications' }, { table_name: 'hr_staff_privileges' }] })
      .mockResolvedValueOnce({ rows: [{ id: 12, qualification_code: 'BLS', status: 'active', verification_status: 'verified' }] });
    await expect(service.createStaffQualification(7, {
      staffUserId: 42, qualificationCode: 'BLS', qualificationName: 'Basic Life Support',
      expiresAt: '2027-01-31', verificationStatus: 'verified',
    }, 9)).resolves.toMatchObject({ id: 12, status: 'active' });
    expect(pool.query.mock.calls[1][0]).toContain('INSERT INTO hr_staff_qualifications');
  });

  test('allows a privilege only when its linked qualification is valid', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ table_name: 'hr_staff_qualifications' }, { table_name: 'hr_staff_privileges' }] })
      .mockResolvedValueOnce({ rows: [{ id: 4, privilegeCode: 'prescribe', qualificationCode: 'MBBS' }] });
    await expect(service.checkStaffPrivilege(7, 42, 'prescribe', '2026-10-14'))
      .resolves.toMatchObject({ allowed: true, privilege: { id: 4 } });
  });

  test('returns a denied decision when the qualification has expired', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ table_name: 'hr_staff_qualifications' }, { table_name: 'hr_staff_privileges' }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(service.checkStaffPrivilege(7, 42, 'prescribe', '2026-10-14'))
      .resolves.toMatchObject({ allowed: false, reason: 'missing_or_expired_qualification' });
  });
});
