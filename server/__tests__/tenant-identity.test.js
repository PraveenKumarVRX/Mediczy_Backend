import { resolveTenantId, requireTenant } from '../utils/tenant-identity.js';

describe('resolveTenantId — regression for audit SEC-01', () => {
  it('reads organization_id, which is what department logins mint', () => {
    expect(resolveTenantId({ id: 6300, role: 'accounts_staff', organization_id: 4 })).toBe(4);
  });

  it('never turns a staff member\'s own user id into a tenant', () => {
    expect(resolveTenantId({ id: 6203, role: 'ceo' })).toBeNull();
    expect(resolveTenantId({ id: 95, role: 'doctor' })).toBeNull();
    expect(resolveTenantId({ id: 6644, role: 'patient' })).toBeNull();
  });

  it('still honours the legacy hospital account, where the row id IS the hospital id', () => {
    expect(resolveTenantId({ id: 11, role: 'hospital' })).toBe(11);
  });

  it('prefers explicit hospital/tenant claims in the original order', () => {
    expect(resolveTenantId({ hospital_id: 3, tenant_id: 9, organization_id: 4, id: 1, role: 'nurse' })).toBe(3);
    expect(resolveTenantId({ tenant_id: 9, organization_id: 4 })).toBe(9);
    expect(resolveTenantId({ hospitalId: 8 })).toBe(8);
  });

  it('requireTenant answers 403 TENANT_CONTEXT_REQUIRED and returns null when there is no tenant', () => {
    let code; let body; const res = { status: (c) => { code = c; return res; }, json: (b) => { body = b; return res; } };
    expect(requireTenant({ user: { id: 1, role: 'ms' } }, res)).toBeNull();
    expect(code).toBe(403); expect(body.code).toBe('TENANT_CONTEXT_REQUIRED');
    expect(requireTenant({ user: { id: 1, role: 'ms', organization_id: 7 } }, { status: () => { throw new Error('should not respond'); } })).toBe(7);
  });
});

import { resolveImagingTenantId } from '../utils/tenant-identity.js';

describe('resolveImagingTenantId — imaging tenants are lab/imaging-centre ids, never a staff or doctor id', () => {
  it('accepts an explicit tenantId claim', () => {
    expect(resolveImagingTenantId({ id: 70, role: 'doctor', tenantId: 2368 })).toBe(2368);
  });

  it('accepts the account id only for a LAB account (the only role validated against the labs table)', () => {
    expect(resolveImagingTenantId({ id: 2433, role: 'lab' })).toBe(2433);
  });

  it('REFUSES hospital / clinic / doctor / admin / patient whose own id equals an imaging tenant id', () => {
    // hospitals, labs and users share ids 70, 2368, 2429, 2433 in production; doctor 70 = tenant 70 today
    for (const role of ['hospital', 'clinic', 'doctor', 'admin', 'patient', 'user', 'nurse', 'super-admin']) {
      for (const id of [70, 2368, 2429, 2433]) expect(resolveImagingTenantId({ id, role })).toBeNull();
    }
  });

  it('returns null for empty / invalid input instead of a fallback', () => {
    expect(resolveImagingTenantId()).toBeNull();
    expect(resolveImagingTenantId({ id: 0, role: 'lab' })).toBeNull();
    expect(resolveImagingTenantId({ id: 'abc', role: 'lab' })).toBeNull();
    expect(resolveImagingTenantId({ tenantId: -3, role: 'doctor', id: 5 })).toBeNull();
  });
});
