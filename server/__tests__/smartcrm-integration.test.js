import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * SmartCRM integration (ADR-001), Mediqzy side. SmartCRM is never called:
 * every partner response here comes from a fake fetch, and the database is a
 * scripted fake. What these tests pin down is what makes the integration safe
 * to switch on — not that it works against SmartCRM, which needs SmartCRM's
 * staging and its write endpoints, neither of which exists yet.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── a scripted database ─────────────────────────────────────────────────────
const calls = [];
let handlers = [];
const run = async (sql, params = []) => {
  const flat = String(sql).replace(/\s+/g, ' ').trim();
  calls.push({ sql: flat, params });
  for (const [pattern, fn] of handlers) {
    if (pattern.test(flat)) {
      const out = await fn(params, flat);
      if (out instanceof Error) throw out;
      return { rows: out?.rows ?? out ?? [], rowCount: out?.rowCount ?? (out?.rows ?? out ?? []).length };
    }
  }
  return { rows: [], rowCount: 0 };
};
const fakeDb = {
  query: run,
  connect: async () => ({ query: run, release: () => {} }),
};
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: fakeDb }));

const config = await import('../services/smartcrm/config.js');
const client = await import('../services/smartcrm/partner-client.js');
const { mapSummary } = await import('../services/smartcrm/summary-mapper.js');
const links = await import('../services/smartcrm/member-link.service.js');
const enrolment = await import('../services/smartcrm/enrolment.service.js');
const { windowStatus } = await import('../services/smartcrm/wallet-overlay.js');

const BINDING = {
  id: 1, corporate_id: 5, tenant_slug: 'insurecorrect', smartcrm_corporate: 'EQUITAS',
  api_key_env: 'SMARTCRM_KEY_EQUITAS', read_enabled: true, enrolment_mode: 'in_app',
  web_enrolment_url: 'https://enrol.example.invalid/equitas',
};
const LINK = {
  id: 9, user_id: 7646, corporate_id: 5, source_system: 'smartcrm', source_tenant: 'insurecorrect',
  source_corporate: 'EQUITAS', emp_id: 'EQ1234', source_member_id: 'M-1', status: 'active',
  consent_id: '00000000-0000-0000-0000-000000000001', last_synced_at: null,
};
const SUMMARY = {
  member: { id: 'M-1' },
  policies: [{
    id: 'P-1', policy_type: 'GHI', policy_name: 'Group Health', policy_number: 'GHI/2026/1',
    insurer: 'Star Health', sum_insured: 500000, start_date: '2026-04-01', end_date: '2027-03-31',
    members: [
      { id: 'M-1', relationship: 'Self', name: 'Test Employee' },
      { id: 'D-1', relationship: 'Wife', name: 'Test Spouse', date_of_birth: '1990-02-03' },
    ],
  }],
};

const fetchReturning = (...responses) => {
  const fn = jest.fn();
  for (const r of responses) {
    fn.mockImplementationOnce(async () => ({
      status: r.status ?? 200,
      text: async () => (r.body === undefined ? '' : JSON.stringify(r.body)),
    }));
  }
  return fn;
};

/** Default schema: tables exist, binding + link as above. */
const baseHandlers = (over = {}) => [
  [/to_regclass/, () => [{ b: true, l: true, r: true }]],
  [/FROM smartcrm_corporate_bindings WHERE corporate_id/, () => [over.binding === undefined ? BINDING : over.binding].filter(Boolean)],
  [/FROM insurance_member_links WHERE user_id = \$1 AND source_system/, () => [over.link === undefined ? LINK : over.link].filter(Boolean)],
  [/INSERT INTO careos_federation_audit_log/, () => []],
];

beforeEach(() => {
  calls.length = 0;
  handlers = baseHandlers();
  process.env.SMARTCRM_INTEGRATION_ENABLED = 'true';
  process.env.SMARTCRM_PARTNER_BASE_URL = 'https://crm.example.invalid';
  process.env.SMARTCRM_KEY_EQUITAS = 'secret-key-equitas';
  client._resetBreakers();
  links._resetRefreshThrottle();
  enrolment._resetWindowCache();
  config._resetSchemaProbe();
});

const audited = () => calls.filter((c) => c.sql.startsWith('INSERT INTO careos_federation_audit_log')).map((c) => c.params[1]);

// ── switches and configuration ──────────────────────────────────────────────
describe('switches', () => {
  it('the global kill switch stops every partner call', async () => {
    process.env.SMARTCRM_INTEGRATION_ENABLED = 'false';
    const fetchImpl = fetchReturning({ body: SUMMARY });
    await expect(client.partnerRequest(BINDING, LINK, { op: 'summary', userId: 1, fetchImpl }))
      .rejects.toMatchObject({ code: 'DISABLED' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a plain-http or path-bearing base URL', () => {
    process.env.SMARTCRM_PARTNER_BASE_URL = 'http://crm.example.invalid';
    expect(config.partnerBaseUrl()).toBeNull();
    process.env.SMARTCRM_PARTNER_BASE_URL = 'https://crm.example.invalid/api';
    expect(config.partnerBaseUrl()).toBeNull();
  });

  it('reads the key only from an env var the binding names, never a pasted key', () => {
    expect(config.apiKeyFor(BINDING)).toBe('secret-key-equitas');
    expect(config.apiKeyFor({ api_key_env: 'secret-key-equitas' })).toBeNull();
    expect(config.apiKeyFor({ api_key_env: 'PATH' })).toBeNull();
  });

  it('in-app enrolment is downgraded to off when the kill switch is off; web needs a URL', () => {
    expect(config.effectiveEnrolmentMode(BINDING)).toBe('in_app');
    process.env.SMARTCRM_INTEGRATION_ENABLED = 'false';
    expect(config.effectiveEnrolmentMode(BINDING)).toBe('off');
    expect(config.effectiveEnrolmentMode({ enrolment_mode: 'web', web_enrolment_url: null })).toBe('off');
    expect(config.effectiveEnrolmentMode({ enrolment_mode: 'web', web_enrolment_url: 'https://x.invalid' })).toBe('web');
  });

  it('the migration stores a key NAME, constrained so a key cannot be pasted in', () => {
    const sql = readFileSync(join(ROOT, 'migrations/20261113000200-smartcrm-integration.migration.js'), 'utf8');
    expect(sql).toMatch(/api_key_env\s+TEXT NOT NULL\s+CHECK \(api_key_env ~ '\^SMARTCRM_KEY_/);
    expect(sql).toMatch(/read_enabled\s+BOOLEAN NOT NULL DEFAULT FALSE/);
    expect(sql).toMatch(/enrolment_mode\s+TEXT NOT NULL DEFAULT 'off'/);
    expect(sql).toMatch(/uniq_member_link_user_per_tenant/);
    expect(sql).toMatch(/uniq_member_link_source_member/);
  });
});

// ── partner client ──────────────────────────────────────────────────────────
describe('partner client', () => {
  it('sends the key, the acting Mediqzy user, and identity params a caller cannot override', async () => {
    const fetchImpl = fetchReturning({ body: SUMMARY });
    await client.partnerRequest(BINDING, LINK, {
      op: 'summary', userId: 7646, query: { emp_id: 'SOMEONE_ELSE', corporate: 'OTHER' }, fetchImpl,
    });
    const [url, init] = fetchImpl.mock.calls[0];
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe('https://crm.example.invalid/api/v2/partner/mediqzy/insurance/summary/');
    expect(u.searchParams.get('emp_id')).toBe('EQ1234');
    expect(u.searchParams.get('corporate')).toBe('EQUITAS');
    expect(u.searchParams.get('tenant_slug')).toBe('insurecorrect');
    expect(init.headers['X-API-Key']).toBe('secret-key-equitas');
    expect(init.headers['X-Mediqzy-User-Id']).toBe('7646');
    expect(init.redirect).toBe('error');
  });

  it('has no claims operation until SmartCRM deploys its P0 fix', async () => {
    expect(client.PARTNER_PATHS.claims).toBeUndefined();
    await expect(client.partnerRequest(BINDING, LINK, { op: 'claims', userId: 1, fetchImpl: jest.fn() }))
      .rejects.toMatchObject({ code: 'UNSUPPORTED_OPERATION' });
  });

  it('refuses a call with no acting user', async () => {
    await expect(client.partnerRequest(BINDING, LINK, { op: 'summary', fetchImpl: jest.fn() }))
      .rejects.toMatchObject({ code: 'NO_ACTOR' });
  });

  it('opens one tenant\'s breaker after repeated 5xx without affecting another tenant', async () => {
    const failing = jest.fn(async () => ({ status: 503, text: async () => '' }));
    for (let i = 0; i < 5; i += 1) {
      await expect(client.partnerRequest(BINDING, LINK, { op: 'summary', userId: 1, fetchImpl: failing }))
        .rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
    }
    await expect(client.partnerRequest(BINDING, LINK, { op: 'summary', userId: 1, fetchImpl: failing }))
      .rejects.toMatchObject({ code: 'CIRCUIT_OPEN' });
    expect(failing).toHaveBeenCalledTimes(5);

    const other = { ...BINDING, tenant_slug: 'otherbroker' };
    const ok = fetchReturning({ body: SUMMARY });
    await expect(client.partnerRequest(other, LINK, { op: 'summary', userId: 1, fetchImpl: ok }))
      .resolves.toMatchObject({ status: 200 });
  });

  it('a 4xx is SmartCRM\'s answer, returned and not counted against the breaker', async () => {
    const notFound = jest.fn(async () => ({ status: 404, text: async () => '{"detail":"no"}' }));
    for (let i = 0; i < 8; i += 1) {
      await expect(client.partnerRequest(BINDING, LINK, { op: 'summary', userId: 1, fetchImpl: notFound }))
        .resolves.toMatchObject({ status: 404 });
    }
    expect(client.breakerFor('insurecorrect').state).toBe('CLOSED');
  });
});

// ── the payload mapper ──────────────────────────────────────────────────────
describe('summary mapper (provisional contract, fails closed)', () => {
  it('maps a well-formed summary', () => {
    const m = mapSummary(SUMMARY);
    expect(m.ok).toBe(true);
    expect(m.memberId).toBe('M-1');
    expect(m.policies[0].members.map((x) => x.relationship)).toEqual(['self', 'spouse']);
    expect(m.policies[0].policyType).toBe('GHI');
  });

  it.each([
    ['no member id', { ...SUMMARY, member: {} }],
    ['policies not a list', { member: { id: 'M-1' }, policies: {} }],
    ['a dependant with no name', { member: { id: 'M-1' }, policies: [{ ...SUMMARY.policies[0], members: [{ id: 'M-1', relationship: 'self' }, { id: 'D', relationship: 'son' }] }] }],
    ['a policy with no self member', { member: { id: 'M-1' }, policies: [{ ...SUMMARY.policies[0], members: [{ id: 'D', relationship: 'son', name: 'X' }] }] }],
    ['a policy with no type', { member: { id: 'M-1' }, policies: [{ ...SUMMARY.policies[0], policy_type: '' }] }],
  ])('projects nothing for %s', (_label, body) => {
    expect(mapSummary(body).ok).toBe(false);
  });
});

// ── refresh ─────────────────────────────────────────────────────────────────
describe('refresh', () => {
  it('projects a good summary and audits it', async () => {
    handlers.push(
      [/INSERT INTO insurance_policies/, () => [{ id: 101 }]],
      [/INSERT INTO policy_members/, () => [{ id: 201 }]],
      [/UPDATE policy_members SET "isActive" = FALSE/, () => ({ rows: [], rowCount: 0 })],
    );
    const result = await links.refreshMember({ userId: 7646, fetchImpl: fetchReturning({ body: SUMMARY }) }, fakeDb);
    expect(result).toMatchObject({ refreshed: true, policies: 1, members: 2 });
    const memberInserts = calls.filter((c) => c.sql.startsWith('INSERT INTO policy_members'));
    // Every projected member belongs to the caller's family; only self carries the userId.
    expect(memberInserts.map((c) => c.params[2])).toEqual([7646, 7646]);
    expect(memberInserts.map((c) => c.params[1])).toEqual([7646, null]);
    expect(memberInserts[0].sql).toContain('WHERE policy_members."primaryMemberUserId" = EXCLUDED."primaryMemberUserId"');
    expect(audited()).toContain('smartcrm.summary.projected');
  });

  it('refuses and hides everything when SmartCRM returns a different member id', async () => {
    handlers.push([/UPDATE policy_members SET "isActive" = FALSE/, () => ({ rows: [], rowCount: 2 })]);
    const body = { ...SUMMARY, member: { id: 'M-OTHER' } };
    await expect(links.refreshMember({ userId: 7646, fetchImpl: fetchReturning({ body }) }, fakeDb))
      .rejects.toMatchObject({ code: 'MEMBER_MISMATCH', status: 409 });
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO policy_members'))).toBe(false);
    expect(calls.some((c) => c.sql.startsWith('UPDATE policy_members SET "isActive" = FALSE'))).toBe(true);
    expect(calls.find((c) => c.sql.includes('UPDATE insurance_member_links SET status')).params).toContain('mismatch');
    expect(audited()).toContain('smartcrm.summary.member_mismatch');
  });

  it('hides projected cover when SmartCRM no longer has the member', async () => {
    handlers.push([/UPDATE policy_members SET "isActive" = FALSE/, () => ({ rows: [], rowCount: 1 })]);
    await expect(links.refreshMember({ userId: 7646, fetchImpl: fetchReturning({ status: 404, body: { detail: 'x' } }) }, fakeDb))
      .rejects.toMatchObject({ code: 'MEMBER_NOT_FOUND' });
    expect(calls.some((c) => c.sql.startsWith('UPDATE policy_members SET "isActive" = FALSE'))).toBe(true);
  });

  it('keeps the last good projection but writes nothing for an unrecognised payload', async () => {
    await expect(links.refreshMember({ userId: 7646, fetchImpl: fetchReturning({ body: { members: [] } }) }, fakeDb))
      .rejects.toMatchObject({ code: 'BAD_UPSTREAM_PAYLOAD' });
    expect(calls.some((c) => /^(INSERT INTO|UPDATE) policy_members/.test(c.sql))).toBe(false);
    expect(audited()).toContain('smartcrm.summary.bad_payload');
  });

  it('a 401 from SmartCRM is a configuration fault, not the member\'s', async () => {
    await expect(links.refreshMember({ userId: 7646, fetchImpl: fetchReturning({ status: 401, body: {} }) }, fakeDb))
      .rejects.toMatchObject({ code: 'NOT_CONFIGURED', status: 503 });
  });

  it('is throttled per member', async () => {
    handlers.push([/INSERT INTO insurance_policies/, () => [{ id: 101 }]], [/INSERT INTO policy_members/, () => [{ id: 201 }]]);
    const fetchImpl = fetchReturning({ body: SUMMARY }, { body: SUMMARY });
    await links.refreshMember({ userId: 7646, fetchImpl }, fakeDb);
    const second = await links.refreshMember({ userId: 7646, fetchImpl }, fakeDb);
    expect(second.throttled).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('refuses when the binding no longer matches the link', async () => {
    handlers = baseHandlers({ binding: { ...BINDING, smartcrm_corporate: 'MOVED' } });
    await expect(links.refreshMember({ userId: 7646, fetchImpl: jest.fn() }, fakeDb))
      .rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
  });
});

// ── linking ─────────────────────────────────────────────────────────────────
describe('linking', () => {
  const policyVersion = links.CONSENT_POLICY_VERSION;

  it('requires explicit, current consent', async () => {
    handlers = baseHandlers({ link: null });
    await expect(links.linkMember({ userId: 7646, consent: 'yes', policyVersion }, fakeDb))
      .rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });
    await expect(links.linkMember({ userId: 7646, consent: true, policyVersion: 'old' }, fakeDb))
      .rejects.toMatchObject({ code: 'CONSENT_OUTDATED' });
  });

  it('takes emp_id from the roster, records consent, then the link', async () => {
    handlers = baseHandlers({ link: null });
    handlers.unshift(
      [/FROM corporate_employees ce JOIN smartcrm_corporate_bindings/, () => [{ corporate_id: 5, emp_id: 'EQ1234' }]],
      [/INSERT INTO patient_consents/, () => [{ id: 'c-1' }]],
      [/INSERT INTO insurance_member_links/, (p) => [{ ...LINK, source_member_id: null, emp_id: p[5], consent_id: p[6] }]],
    );
    const { link, created } = await links.linkMember({ userId: 7646, consent: true, policyVersion }, fakeDb);
    expect(created).toBe(true);
    expect(link.emp_id).toBe('EQ1234');
    const consent = calls.find((c) => c.sql.startsWith('INSERT INTO patient_consents'));
    expect(consent.sql).toContain("'DATA_SHARING', 'explicit', TRUE");
    // Never a corporates id in an organisation column (entity uid rule).
    expect(consent.sql).not.toContain('organization_id');
    expect(calls.filter((c) => c.sql.startsWith('INSERT INTO careos_federation_audit_log'))
      .every((c) => !c.sql.includes('actor_org_id'))).toBe(true);
    expect(audited()).toContain('smartcrm.link.created');
  });

  it('refuses to choose between two roster rows', async () => {
    handlers = baseHandlers({ link: null });
    handlers.unshift([/FROM corporate_employees ce JOIN smartcrm_corporate_bindings/, () => [
      { corporate_id: 5, emp_id: 'EQ1' }, { corporate_id: 6, emp_id: 'NC9' },
    ]]);
    await expect(links.linkMember({ userId: 7646, consent: true, policyVersion }, fakeDb))
      .rejects.toMatchObject({ code: 'AMBIGUOUS_ROSTER' });
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO insurance_member_links'))).toBe(false);
  });

  it('refuses an employee record another account has already linked', async () => {
    handlers = baseHandlers({ link: null });
    const dup = Object.assign(new Error('dup'), { code: '23505', constraint: 'uniq_member_link_emp' });
    handlers.unshift(
      [/FROM corporate_employees ce JOIN smartcrm_corporate_bindings/, () => [{ corporate_id: 5, emp_id: 'EQ1234' }]],
      [/INSERT INTO patient_consents/, () => [{ id: 'c-1' }]],
      [/INSERT INTO insurance_member_links/, () => dup],
    );
    await expect(links.linkMember({ userId: 7646, consent: true, policyVersion }, fakeDb))
      .rejects.toMatchObject({ code: 'ALREADY_LINKED', status: 409 });
    expect(calls.some((c) => c.sql === 'ROLLBACK')).toBe(true);
  });

  it('unlinking withdraws consent and hides projected rows', async () => {
    handlers.push([/UPDATE policy_members SET "isActive" = FALSE/, () => ({ rows: [], rowCount: 3 })]);
    const result = await links.unlinkMember({ userId: 7646 }, fakeDb);
    expect(result).toEqual({ unlinked: true, membersHidden: 3 });
    expect(calls.some((c) => c.sql.startsWith('UPDATE patient_consents SET consented = FALSE, withdrawn_at = NOW()'))).toBe(true);
  });
});

// ── enrolment pass-through ──────────────────────────────────────────────────
describe('enrolment', () => {
  const OPEN = { status: 200, body: { state: 'open' } };

  it('is refused unless the employer is on in-app enrolment, and says where to go instead', async () => {
    handlers = baseHandlers({ binding: { ...BINDING, enrolment_mode: 'web' } });
    await expect(enrolment.runOperation('window', { userId: 7646, fetchImpl: jest.fn() }, fakeDb))
      .rejects.toMatchObject({ code: 'ENROLMENT_NOT_IN_APP', details: { mode: 'web', webUrl: BINDING.web_enrolment_url } });
  });

  it('refuses a submit while the window is closed, without calling submit', async () => {
    handlers.push([/INSERT INTO insurance_enrolment_requests/, () => [{ id: 1 }]]);
    const fetchImpl = fetchReturning({ body: { state: 'closed', reason: 'expired' } });
    await expect(enrolment.runOperation('submit', { userId: 7646, body: { a: 1 }, idempotencyKey: 'key-12345678', fetchImpl }, fakeDb))
      .rejects.toMatchObject({ code: 'ENROLMENT_CLOSED', details: { reason: 'expired' } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toContain('/enrollment/window/');
  });

  it('treats an unknown window shape as closed', async () => {
    handlers.push([/INSERT INTO insurance_enrolment_requests/, () => [{ id: 1 }]]);
    const fetchImpl = fetchReturning({ body: { is_open: true } });
    await expect(enrolment.runOperation('quote', { userId: 7646, body: {}, fetchImpl }, fakeDb))
      .rejects.toMatchObject({ code: 'ENROLMENT_CLOSED' });
  });

  it('requires an idempotency key for submit, payment and dependants', async () => {
    for (const op of ['submit', 'paymentInitiate', 'dependents']) {
      await expect(enrolment.runOperation(op, { userId: 7646, body: {}, fetchImpl: jest.fn() }, fakeDb))
        .rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
    }
  });

  it('passes SmartCRM\'s status through and stores it against the key', async () => {
    handlers.push(
      [/INSERT INTO insurance_enrolment_requests/, () => [{ id: 77 }]],
      [/UPDATE insurance_enrolment_requests SET state = \$2/, () => []],
    );
    const fetchImpl = fetchReturning(OPEN, { status: 202, body: { request_id: 'HR-55' } });
    const out = await enrolment.runOperation('submit', { userId: 7646, body: { plan: 'x' }, idempotencyKey: 'key-12345678', fetchImpl }, fakeDb);
    expect(out).toEqual({ status: 202, body: { request_id: 'HR-55' } });
    const [, init] = fetchImpl.mock.calls[1];
    expect(init.headers['Idempotency-Key']).toBe('key-12345678');
    const stored = calls.find((c) => c.sql.startsWith('UPDATE insurance_enrolment_requests SET state = $2'));
    expect(stored.params.slice(0, 3)).toEqual([77, 'done', 202]);
  });

  it('replays a completed request without calling SmartCRM again', async () => {
    const { createHash } = await import('node:crypto');
    const hash = createHash('sha256').update('{"body":{"plan":"x"},"query":null}').digest('hex');
    handlers.push(
      [/INSERT INTO insurance_enrolment_requests/, () => []],
      [/SELECT id, request_hash, state, status_code, response FROM insurance_enrolment_requests/, () => [
        { id: 77, request_hash: hash, state: 'done', status_code: 201, response: { ok: true } },
      ]],
    );
    const fetchImpl = jest.fn();
    const out = await enrolment.runOperation('submit', { userId: 7646, body: { plan: 'x' }, idempotencyKey: 'key-12345678', fetchImpl }, fakeDb);
    expect(out).toEqual({ status: 201, body: { ok: true }, replayed: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a key reused for a different request', async () => {
    handlers.push(
      [/INSERT INTO insurance_enrolment_requests/, () => []],
      [/SELECT id, request_hash, state, status_code, response FROM insurance_enrolment_requests/, () => [
        { id: 77, request_hash: 'other', state: 'done', status_code: 201, response: {} },
      ]],
    );
    await expect(enrolment.runOperation('submit', { userId: 7646, body: { plan: 'y' }, idempotencyKey: 'key-12345678', fetchImpl: jest.fn() }, fakeDb))
      .rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED', status: 422 });
  });

  it('maps the last submit to the wallet\'s submission state', async () => {
    handlers.push([/FROM insurance_enrolment_requests WHERE user_id = \$1 AND operation = 'submit'/, () => [
      { status_code: 202, response: { request_id: 'HR-55' }, completed_at: '2026-11-13T10:00:00Z' },
    ]]);
    expect(await enrolment.lastSubmission(7646, fakeDb)).toMatchObject({ state: 'pending_hr', requestId: 'HR-55' });
  });
});

describe('wallet window status', () => {
  it('distinguishes not set, upcoming, open and closed', () => {
    expect(windowStatus({ from: null, to: null, open: false })).toBe('not_set');
    expect(windowStatus({ from: '2099-01-01', to: '2099-02-01', open: false })).toBe('upcoming');
    expect(windowStatus({ from: '2020-01-01', to: '2020-02-01', open: false })).toBe('closed');
    expect(windowStatus({ from: '2020-01-01', to: '2099-02-01', open: true })).toBe('open');
  });
});

describe('route', () => {
  const src = readFileSync(join(ROOT, 'routes/employee-insurance.route.js'), 'utf8');
  it('never takes a user, member, corporate or employee id from the request', () => {
    expect(src).not.toMatch(/req\.(params|query|body)\.(userId|user_id|emp_id|empId|memberId|corporateId|corporate_id)/);
    expect(src).not.toMatch(/router\.\w+\(\s*'[^']*:/); // no path params at all
  });
  it('is mounted under /api/employee, which ring-fencing already allows', () => {
    const app = readFileSync(join(ROOT, 'app.js'), 'utf8');
    expect(app).toMatch(/app\.use\("\/api\/employee", employeeInsuranceRouter\)/);
    const rf = readFileSync(join(ROOT, 'middleware/ringFencing.js'), 'utf8');
    expect(rf).toContain("'/api/employee'");
  });
});
