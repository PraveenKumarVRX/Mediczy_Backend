import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';
import { verifyHospitalToken } from '../middleware/hospitalAuth.middleware.js';

// Real signed tokens in the shapes the login controllers mint (audit SEC-01).
const run = (claims) => {
  const req = { headers: { authorization: `Bearer ${jwt.sign(claims, JWT_CONFIG.SECRET, { expiresIn: '5m' })}` } };
  const out = { code: null, body: null, nexted: false };
  const res = { status: (c) => { out.code = c; return res; }, json: (b) => { out.body = b; return res; } };
  verifyHospitalToken(req, res, () => { out.nexted = true; });
  return { req, out };
};

describe('verifyHospitalToken tenant resolution', () => {
  it('department login ({ id, role, organization_id }) resolves to the ORGANIZATION, not the user id', () => {
    const { req, out } = run({ id: 6300, role: 'accounts_staff', organization_id: 4 });
    expect(out.nexted).toBe(true);
    expect(req.hospitalId).toBe(4);
    expect(req.tenantId).toBe(4);
  });

  it('a staff token with no tenant claim is refused instead of using its user id as a tenant', () => {
    for (const claims of [{ id: 6203, role: 'ceo' }, { id: 95, role: 'doctor' }, { id: 100, role: 'nurse' }]) {
      const { out } = run(claims);
      expect(out.nexted).toBe(false);
      expect(out.code).toBe(403);
      expect(out.body.code).toBe('TENANT_CONTEXT_REQUIRED');
    }
  });

  it('the legacy hospital account still works: its row id IS the hospital id', () => {
    const { req, out } = run({ id: 11, role: 'hospital', email: 'h@x.in' });
    expect(out.nexted).toBe(true);
    expect(req.hospitalId).toBe(11);
  });

  it('explicit hospital/tenant claims win, in the original order', () => {
    expect(run({ id: 1, role: 'nurse', hospital_id: 3, organization_id: 9 }).req.hospitalId).toBe(3);
    expect(run({ id: 1, role: 'nurse', tenant_id: 8 }).req.hospitalId).toBe(8);
  });

  it('non-hospital roles are still refused', () => {
    expect(run({ id: 5, role: 'patient', organization_id: 1 }).out.code).toBe(403);
  });
});
