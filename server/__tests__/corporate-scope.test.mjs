import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCorporateScope, CORPORATE_SCOPE_REASONS as R } from '../services/corporate-scope.service.js';

// A tiny in-memory stand-in for the three tables the resolver reads.
function world({ users = {}, registry = {}, corporates = {}, tenants = {}, missingColumn = false } = {}) {
  return {
    query: async (sql, p) => {
      if (/FROM users/.test(sql)) {
        if (missingColumn) { const e = new Error('column "organization_uid" does not exist'); e.original = { code: '42703' }; throw e; }
        return users[p.id] ? [{ organization_uid: users[p.id] }] : [];
      }
      if (/FROM entity_registry/.test(sql)) return registry[p.uid] ? [registry[p.uid]] : [];
      if (/tenant_uid FROM corporates/.test(sql)) return corporates[p.id] ? [{ tenant_uid: corporates[p.id].tenant_uid }] : [];
      if (/unique_id FROM tenants/.test(sql)) return tenants[p.id] ? [{ unique_id: tenants[p.id] }] : [];
      throw new Error('unexpected query: ' + sql);
    },
    findCorporateById: async (id) => (corporates[id] ? { id, ...corporates[id] } : null),
  };
}

// The real shapes from prod: somya.pagare's organization_id is 49, which is a hospital in `tenants`
// and Ninjacart in `corporates`. By uid there is nothing to confuse.
const W = world({
  users: { 7233: 'CMR4ET', 6176: 'CMR4ET', 4878: 'H11XXX', 7071: 'CC9FL6', 7231: 'CAF030' },
  registry: {
    CMR4ET: { kind: 'corporate', source_table: 'corporates', source_id: 49 },
    CC9FL6: { kind: 'corporate', source_table: 'corporates', source_id: 45 },
    CAF030: { kind: 'corporate', source_table: 'corporates', source_id: 3 },
    H11XXX: { kind: 'hospital', source_table: 'tenants', source_id: 11 },
  },
  corporates: {
    49: { tenant_uid: 'C32Q8K' }, 45: { tenant_uid: 'CDAIRY' }, 3: { tenant_uid: null },
  },
  tenants: { 58: 'C32Q8K', 57: 'CDAIRY', 49: 'HMADRS', 11: 'H11XXX' },
});

test('somya.pagare is admitted on her own company host (ninjacart = tenant 58) despite organization_id=49', async () => {
  const r = await resolveCorporateScope(W, { id: 7233 }, { id: 58 });
  assert.equal(r.ok, true);
  assert.equal(r.corporate.id, 49);
});

test('…and is REJECTED on madras-medical-mission (tenant 49), where the old integer gate admitted her', async () => {
  const r = await resolveCorporateScope(W, { id: 7233 }, { id: 49 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, R.WRONG_TENANT);
});

test('on a generic host (no req.tenant) the subdomain gate does not apply', async () => {
  const r = await resolveCorporateScope(W, { id: 7233 }, null);
  assert.equal(r.ok, true);
});

test('dairyday HR resolves to the canonical corporate #45, deterministically', async () => {
  const r = await resolveCorporateScope(W, { id: 7071 }, { id: 57 });
  assert.equal(r.ok, true);
  assert.equal(r.corporate.id, 45);
});

test('a hospital HRMS user (hr_staff of Smart Hospital) is refused by the CORPORATE portal', async () => {
  // Same role string as ninjacart.hr; different module. The org kind, not the role, decides.
  const r = await resolveCorporateScope(W, { id: 4878 }, null);
  assert.equal(r.ok, false);
  assert.equal(r.reason, R.NOT_CORPORATE);
});

test('a corporate with no tenant has no subdomain: refused there, fine on the generic host', async () => {
  assert.equal((await resolveCorporateScope(W, { id: 7231 }, { id: 58 })).reason, R.WRONG_TENANT);
  assert.equal((await resolveCorporateScope(W, { id: 7231 }, null)).ok, true);
});

test('a user with no organization_uid stays on the legacy path', async () => {
  const r = await resolveCorporateScope(W, { id: 999 }, { id: 58 });
  assert.equal(r.ok, false);
  assert.equal(r.mode, 'legacy');
});

test('a retired / unregistered uid is refused, not guessed', async () => {
  const r = await resolveCorporateScope(world({ users: { 1: 'QQQQQQ' } }), { id: 1 }, null);
  assert.equal(r.reason, R.UNKNOWN_UID);
});

test('before the migration is applied (column missing) it degrades to legacy instead of throwing', async () => {
  const r = await resolveCorporateScope(world({ missingColumn: true }), { id: 7233 }, { id: 58 });
  assert.equal(r.ok, false);
  assert.equal(r.mode, 'legacy');
});

test('a corporate row that no longer exists is refused', async () => {
  const w = world({ users: { 1: 'CGONE1' }, registry: { CGONE1: { kind: 'corporate', source_table: 'corporates', source_id: 999 } } });
  assert.equal((await resolveCorporateScope(w, { id: 1 }, null)).reason, R.CORPORATE_MISSING);
});
