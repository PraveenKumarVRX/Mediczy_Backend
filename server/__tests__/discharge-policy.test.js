import { DISCHARGE_OVERRIDE_ROLES, DISCHARGE_SIGN_ROLES, requireSessionRole, sessionOverride, sendRouteError } from '../utils/discharge-policy.js';

const res = () => { const r = { code: null, body: null }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };

describe('sessionOverride — the approver is the authenticated caller, never the request body', () => {
  it('ignores a forged approver in the body (the audit CLN-01 attack)', () => {
    const forged = { reasonCode: 'urgent', approverId: 1, approverRole: 'medical_director' };
    expect(sessionOverride({ id: 55, role: 'ms' }, forged)).toMatchObject({ approverId: 55, approverRole: 'ms' });
  });

  it('refuses a caller whose own role may not override, even if the body claims a permitted approver', () => {
    const forged = { reasonCode: 'urgent', approverId: 1, approverRole: 'medical_director' };
    expect(() => sessionOverride({ id: 9, role: 'nurse' }, forged)).toThrow(/not permitted/);
    try { sessionOverride({ id: 9, role: 'nurse' }, forged); } catch (e) { expect(e.status).toBe(403); }
  });

  it('requires a real reason', () => {
    expect(() => sessionOverride({ id: 5, role: 'ms' }, { reasonCode: ' ' })).toThrow(/reason/);
  });

  it('returns null when no override was requested', () => {
    expect(sessionOverride({ id: 5, role: 'ms' }, undefined)).toBeNull();
  });
});

describe('requireSessionRole', () => {
  it('lets a permitted role through and blocks the rest, including patients and unauthenticated callers', () => {
    const gate = requireSessionRole(DISCHARGE_SIGN_ROLES);
    let called = 0; const go = () => { called += 1; };
    gate({ user: { role: 'doctor' } }, res(), go);
    expect(called).toBe(1);
    const denied = res(); gate({ user: { role: 'patient' } }, denied, go);
    expect(denied.code).toBe(403);
    const anon = res(); gate({}, anon, go);
    expect(anon.code).toBe(401);
    expect(called).toBe(1);
  });

  it('keeps override authority narrower than signing authority', () => {
    expect(DISCHARGE_SIGN_ROLES.has('doctor')).toBe(true);
    expect(DISCHARGE_OVERRIDE_ROLES.has('doctor')).toBe(false);
    expect(DISCHARGE_OVERRIDE_ROLES.has('ms')).toBe(true);
    expect(DISCHARGE_SIGN_ROLES.has('receptionist')).toBe(false);
  });
});

describe('sendRouteError', () => {
  it('never leaks database error text', () => {
    const r = res(); sendRouteError(r, Object.assign(new Error('relation "x" does not exist'), { name: 'SequelizeDatabaseError' }));
    expect(r.code).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/relation/);
  });
  it('keeps the status and message of coded, caller-fixable errors', () => {
    const r = res(); sendRouteError(r, Object.assign(new Error('Discharge draft not found'), { status: 404, code: 'DISCHARGE_DRAFT_NOT_FOUND' }));
    expect(r.code).toBe(404); expect(r.body.code).toBe('DISCHARGE_DRAFT_NOT_FOUND');
  });
});
