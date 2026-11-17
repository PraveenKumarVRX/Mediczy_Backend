/**
 * Nightly reset of the sales demo login (2026-11-17): the next prospect starts clean, can book the
 * check-up again and never sees the previous prospect's chats or bookings; nobody else is touched.
 */
import { jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const queries = [];
let demoRows = [];
const client = {
  query: jest.fn(async (sql, params) => {
    queries.push({ sql, params });
    if (/FROM users WHERE metadata->>'demoAccount'/.test(sql)) return { rows: demoRows, rowCount: demoRows.length };
    return { rows: [], rowCount: 0 };
  }),
};
const rlsCalls = [];
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query: jest.fn(async () => ({ rows: demoRows.map(({ id }) => ({ id })) })) } }));
jest.unstable_mockModule('../middleware/rls-context.middleware.js', () => ({
  withRlsTransaction: jest.fn(async (_pool, ctx, fn) => { rlsCalls.push(ctx); return fn(client); }), // rollback = the throw propagating
}));

const svc = await import('../services/demo-account-reset.service.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const baseline = { family: [{ id: 28, userId: 8513, firstName: 'Asha' }], wallet: { balance: 0, metadata: {} }, healthPackageIds: [20170] };

beforeEach(() => { queries.length = 0; rlsCalls.length = 0; });

describe('what the reset clears', () => {
  it('every delete is keyed on the demo account ($1), never on a bare guess', () => {
    for (const { table, where } of svc.DEMO_RESET_CLEARS) expect([table, where]).toEqual([table, expect.stringContaining('$1')]);
  });
  it('lab_orders only where patient_id is a user id (corporate check-ups), never hospital patients.id', () => {
    const lo = svc.DEMO_RESET_CLEARS.find((c) => c.table === 'lab_orders');
    expect(lo.where).toContain("test_category = 'corporate_health_checkup'");
  });
  it('shared id columns are limited to patient/user kinds (a doctor with the same id is untouched)', () => {
    for (const t of ['notifications', 'ai_brain_conversations', 'ai_user_memory', 'fcm_tokens']) {
      expect(svc.DEMO_RESET_CLEARS.find((c) => c.table === t).where).toMatch(/'patient','user'/);
    }
  });
  it('children are cleared before the rows they point at', () => {
    const order = svc.DEMO_RESET_CLEARS.map((c) => c.table);
    for (const [child, parent] of [['clinical_notes', 'appointments'], ['medical_records', 'appointments'], ['corporate_health_reports', 'lab_orders'],
      ['transactions', 'orders'], ['ai_tool_executions', 'ai_brain_conversations'], ['reports', 'lab_tests']]) {
      expect(order.indexOf(child)).toBeLessThan(order.indexOf(parent));
    }
  });
  it('never clears the roster, sponsorship, plan, entitlement, policies or logs', () => {
    const cleared = new Set(svc.DEMO_RESET_CLEARS.map((c) => c.table));
    for (const t of ['users', 'corporate_employees', 'user_associations', 'user_subscriptions', 'user_health_packages', 'policy_members', 'audit_logs', 'user_activity_logs']) {
      expect(cleared.has(t)).toBe(false);
      expect(svc.DEMO_RESET_KEEPS.has(t)).toBe(true);
    }
  });
});

describe('how it runs', () => {
  it('a dry run rolls back and reports what it would clear', async () => {
    demoRows = [{ id: 8513, metadata: { demoAccount: true, demoBaseline: baseline } }];
    const r = await svc.resetDemoAccounts();
    expect(r.applied).toBe(false);
    expect(r.accounts[0]).toMatchObject({ userId: 8513, family: { restored: 1 } });
    expect(rlsCalls[0]).toEqual({ orgId: 0, userId: 8513, isPlatformAdmin: true });
  });
  it('without a baseline it touches nothing', async () => {
    demoRows = [{ id: 8513, metadata: { demoAccount: true } }];
    const r = await svc.resetDemoAccounts({ apply: true });
    expect(r.accounts[0].skipped).toMatch(/no baseline/);
    expect(queries.some((q) => /^DELETE/.test(q.sql))).toBe(false);
  });
  it('only accounts flagged demoAccount are ever selected', () => {
    expect(read('services/demo-account-reset.service.js').match(/metadata->>'demoAccount' = 'true'/g).length).toBeGreaterThanOrEqual(2);
  });
  it('family returns with the same ids; the check-up is re-opened', async () => {
    demoRows = [{ id: 8513, metadata: { demoAccount: true, demoBaseline: baseline } }];
    await svc.resetDemoAccounts({ apply: true });
    expect(queries.find((q) => /jsonb_populate_recordset\(NULL::family_members/.test(q.sql)).params[0]).toBe(JSON.stringify(baseline.family));
    expect(queries.find((q) => /UPDATE user_health_packages SET "usedAt" = NULL/.test(q.sql)).params).toEqual([8513, [20170]]);
  });
  it('is scheduled nightly at 04:00 IST and registered', () => {
    expect(read('services/demo-account-reset-cron.service.js')).toContain("cron.schedule('30 22 * * *'");
    expect(read('utils/cronRegistry.js')).toContain("key: 'demo_account_reset'");
    expect(read('app.js')).toContain('demoAccountResetCronService.start()');
  });
});
