import { jest } from '@jest/globals';

const checkStaffPrivilege = jest.fn();
jest.unstable_mockModule('../services/hrms-qualification.service.js', () => ({ checkStaffPrivilege }));
const { requireStaffPrivilege } = await import('../middleware/hrms-privilege.middleware.js');

const run = async (req) => {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  await requireStaffPrivilege('prescribe')(req, res, next);
  return { res, next };
};

describe('HRMS clinical privilege middleware', () => {
  beforeEach(() => jest.clearAllMocks());
  test('allows an active privilege and exposes the decision', async () => {
    checkStaffPrivilege.mockResolvedValueOnce({ allowed: true, privilege: { id: 9, privilegeCode: 'prescribe' } });
    const result = await run({ user: { id: 42, role: 'doctor', organization_id: 7 } });
    expect(checkStaffPrivilege).toHaveBeenCalledWith(7, 42, 'prescribe');
    expect(result.next).toHaveBeenCalled();
    expect(result.res.status).not.toHaveBeenCalled();
  });
  test('denies an expired or missing privilege', async () => {
    checkStaffPrivilege.mockResolvedValueOnce({ allowed: false, reason: 'missing_or_expired_qualification' });
    const result = await run({ user: { id: 42, role: 'doctor', organization_id: 7 } });
    expect(result.res.status).toHaveBeenCalledWith(403);
    expect(result.res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'CLINICAL_PRIVILEGE_REQUIRED' }));
    expect(result.next).not.toHaveBeenCalled();
  });
  test('fails closed when the privilege schema is unavailable', async () => {
    checkStaffPrivilege.mockRejectedValueOnce(Object.assign(new Error('not migrated'), { code: 'SCHEMA_NOT_MIGRATED', status: 503 }));
    const result = await run({ user: { id: 42, role: 'doctor', organization_id: 7 } });
    expect(result.res.status).toHaveBeenCalledWith(503);
    expect(result.res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'SCHEMA_NOT_MIGRATED' }));
  });
  test('does not let an administrator token impersonate a clinical privilege', async () => {
    const result = await run({ user: { id: 42, role: 'admin', organization_id: 7 } });
    expect(result.res.status).toHaveBeenCalledWith(403);
    expect(result.res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'CLINICAL_ROLE_REQUIRED' }));
    expect(checkStaffPrivilege).not.toHaveBeenCalled();
  });
});
