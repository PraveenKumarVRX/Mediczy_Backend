import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrganizationUidService } from '../services/organization-uid.service.js';

// An in-memory stand-in for the tables the helper reads and writes.
function svc({ column = true, corporates = [], tenants = [], users = {} } = {}) {
  const writes = [];
  const query = async (sql, p) => {
    if (/information_schema/.test(sql)) return column ? [{ x: 1 }] : [];
    if (/FROM corporates WHERE id/.test(sql)) return corporates.filter((c) => c.id === p.id).map((c) => ({ unique_id: c.unique_id }));
    if (/FROM corporates WHERE tenant_id/.test(sql)) return corporates.filter((c) => c.tenant_id === p.t && /^active$/i.test(c.status)).map((c) => ({ unique_id: c.unique_id }));
    if (/FROM tenants WHERE id/.test(sql)) return tenants.filter((t) => t.id === p.id).map((t) => ({ unique_id: t.unique_id }));
    if (/SELECT organization_uid FROM users/.test(sql)) return users[p.id] ? [{ organization_uid: users[p.id] }] : [];
    if (/UPDATE users SET organization_uid/.test(sql)) {
      writes.push(p);
      if (users[p.id] === p.uid) return [];
      users[p.id] = p.uid; return [{ id: p.id }];
    }
    throw new Error('unexpected: ' + sql);
  };
  return { s: createOrganizationUidService({ query }), writes, users };
}
const CORPS = [
  { id: 49, unique_id: 'CMR4ET', tenant_id: 58, status: 'Active' },
  { id: 45, unique_id: 'CC9FL6', tenant_id: 57, status: 'Active' },
  { id: 52, unique_id: 'CXDTDQ', tenant_id: null, status: 'Inactive' },
  { id: 9, unique_id: 'CTWO11', tenant_id: 70, status: 'Active' },
  { id: 10, unique_id: 'CTWO22', tenant_id: 70, status: 'Active' },
];

test('corporateUid resolves a corporates id', async () => {
  const { s } = svc({ corporates: CORPS });
  assert.equal(await s.corporateUid(49), 'CMR4ET');
  assert.equal(await s.corporateUid(999), null);
  assert.equal(await s.corporateUid(null), null);
});

test('corporateUidForTenant returns the single Active corporate, never a guess', async () => {
  const { s } = svc({ corporates: CORPS });
  assert.equal(await s.corporateUidForTenant(58), 'CMR4ET');
  assert.equal(await s.corporateUidForTenant(57), 'CC9FL6');
  assert.equal(await s.corporateUidForTenant(70), null, 'two Active corporates on one tenant: ambiguous, so null');
  assert.equal(await s.corporateUidForTenant(12345), null);
});

test('userBelongsToCorporate: by uid when both sides have one (the integers are irrelevant)', async () => {
  const { s } = svc({ corporates: CORPS, users: { 6993: 'CMR4ET', 7233: 'CMR4ET', 7026: 'CC9FL6' } });
  // anjali carries tenant id 58, somya the corporates id 49 -- both belong to Ninjacart (#49)
  assert.equal(await s.userBelongsToCorporate({ id: 6993, organization_id: 58 }, 49), true);
  assert.equal(await s.userBelongsToCorporate({ id: 7233, organization_id: 49 }, 49), true);
  assert.equal(await s.userBelongsToCorporate({ id: 7026, organization_id: 57 }, 49), false, 'Dairy Day is not Ninjacart');
});

test('userBelongsToCorporate falls back to the legacy integer ONLY when the user has no uid', async () => {
  const { s } = svc({ corporates: CORPS, users: {} });
  assert.equal(await s.userBelongsToCorporate({ id: 1, organization_id: 49 }, 49), true);
  assert.equal(await s.userBelongsToCorporate({ id: 1, organization_id: 58 }, 49), false);
});

test('without the column everything degrades to the legacy behaviour and nothing throws', async () => {
  const { s, writes } = svc({ column: false, corporates: CORPS });
  assert.equal(await s.hasColumn(), false);
  assert.equal(await s.userOrganizationUid(6993), null);
  assert.equal(await s.setUserOrganizationUid(6993, 'CMR4ET'), false);
  assert.equal(writes.length, 0, 'no UPDATE was attempted against a missing column');
  assert.equal(await s.userBelongsToCorporate({ id: 6993, organization_id: 49 }, 49), true);
});

test('setUserOrganizationUid is authoritative: it overwrites a derived value, and is a no-op when equal', async () => {
  const { s, users } = svc({ corporates: CORPS, users: { 5: 'CWRONG' } });
  assert.equal(await s.setUserOrganizationUid(5, 'CMR4ET'), true);
  assert.equal(users[5], 'CMR4ET');
  assert.equal(await s.setUserOrganizationUid(5, 'CMR4ET'), false, 'already correct: nothing changes');
  assert.equal(await s.setUserOrganizationUid(5, null), false, 'no uid, no write');
});

test('a missing-column error from the UPDATE is swallowed, any other error is not', async () => {
  const mk = (code) => createOrganizationUidService({ query: async (sql) => {
    if (/information_schema/.test(sql)) return [{ x: 1 }];
    const e = new Error('boom'); e.original = { code }; throw e;
  } });
  assert.equal(await mk('42703').setUserOrganizationUid(1, 'CMR4ET'), false);
  await assert.rejects(() => mk('23505').setUserOrganizationUid(1, 'CMR4ET'));
});
