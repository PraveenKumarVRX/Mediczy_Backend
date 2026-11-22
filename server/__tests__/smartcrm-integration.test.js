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
const await_mapper = await import('../services/smartcrm/summary-mapper.js');
const { mapSummary } = await_mapper;
const documents = await import('../services/smartcrm/member-documents.service.js');
const links = await import('../services/smartcrm/member-link.service.js');
const enrolment = await import('../services/smartcrm/enrolment.service.js');
const await_overlay = await import('../services/smartcrm/wallet-overlay.js');
const { windowStatus } = await_overlay;

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
// SmartCRM's real summary shape (partner_mediqzy_views.py, commit db971d1).
const POLICY_GHI = {
  policyNo: 'GHI/2026/1', productName: 'Group Health', policyType: 'GHI', corporate: 'EQUITAS', payer: 'Medi Assist',
  status: 'Active', effectiveFrom: '2026-04-01', effectiveTo: '2027-03-31', isPrimary: true, isActive: true,
  employeeSumInsured: '5,00,000', cardNo: 'MA-100',
};
const SPOUSE = {
  id: 77, InsuredName: 'Test Spouse', RELATIONTXT: 'Wife', DOB: '1990-02-03', CardNo: 'MA-101',
  Suminsured: '500000', BalanceSumInsured: '450000', PolicyNumber: 'GHI/2026/1', InsuranceCo: 'Star Health',
  ValidFrom: '2026-04-01', ValidTo: '2027-03-31',
};
const summaryBody = ({ member = { id: 'M-1', Name: 'Test Employee', DOB: '1988-05-06' }, policy = POLICY_GHI, policies = [POLICY_GHI], dependents = [SPOUSE] } = {}) => ({
  success: true,
  data: { member, policy, policies, ecard: { cardNo: policy?.cardNo, insuranceCo: 'Star Health' }, dependents },
});
const SUMMARY = summaryBody();

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
    expect(sql).toMatch(/CHECK \(api_key_env IS NULL OR api_key_env ~ '\^SMARTCRM_KEY_/);
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

  it('claims and e-card are read-only operations; the dependants path SmartCRM never had is gone', async () => {
    expect(client.PARTNER_PATHS.claims).toEqual({ path: 'insurance/claims/', methods: ['GET'] });
    expect(client.PARTNER_PATHS.ecard).toMatchObject({ path: 'insurance/ecard/', methods: ['GET'] });
    expect(client.PARTNER_PATHS.ecard.maxBodyBytes).toBeGreaterThan(1024 * 1024);
    expect(client.PARTNER_PATHS.dependents).toBeUndefined();
    await expect(client.partnerRequest(BINDING, LINK, { op: 'claims', method: 'POST', userId: 1, fetchImpl: jest.fn() }))
      .rejects.toMatchObject({ code: 'UNSUPPORTED_OPERATION' });
    await expect(client.partnerRequest(BINDING, LINK, { op: 'dependents', method: 'POST', userId: 1, fetchImpl: jest.fn() }))
      .rejects.toMatchObject({ code: 'UNSUPPORTED_OPERATION' });
  });

  it('sends the consent id when given one', async () => {
    const fetchImpl = fetchReturning({ body: {} });
    await client.partnerRequest(BINDING, LINK, { op: 'window', userId: 7646, consentId: LINK.consent_id, fetchImpl });
    expect(fetchImpl.mock.calls[0][1].headers['X-Mediqzy-Consent-Id']).toBe(LINK.consent_id);
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
describe('summary mapper (SmartCRM db971d1 contract, fails closed)', () => {
  const { policyTypeOf, money, policiesNeedingDetail } = await_mapper;

  it('maps a real summary: employee from member + policies[], dependants with balance', () => {
    const m = mapSummary(SUMMARY);
    expect(m.ok).toBe(true);
    expect(m.memberId).toBe('M-1');
    const [p] = m.policies;
    expect(p).toMatchObject({ id: 'GHI20261', policyNumber: 'GHI/2026/1', policyType: 'GHI', sumInsured: 500000, status: 'active', insurer: 'Star Health', tpa: 'Medi Assist' });
    expect(p.members.map((x) => [x.id, x.relationship, x.name, x.cardNumber])).toEqual([
      ['self', 'self', 'Test Employee', 'MA-100'],
      ['dep-77', 'spouse', 'Test Spouse', 'MA-101'],
    ]);
    expect(p.members[1]).toMatchObject({ sumInsured: 500000, sumInsuredRemaining: 450000, sumInsuredUsed: 50000, dateOfBirth: '1990-02-03' });
  });

  it('reads free-text policy types and sums insured', () => {
    expect(policyTypeOf('GMC', 'Group Mediclaim')).toBe('GHI');
    expect(policyTypeOf('Rollover-Floater', '')).toBe('GHI');
    expect(policyTypeOf('GHI', 'Parents Top Up')).toBe('PARENTS_TOPUP');
    expect(policyTypeOf('', 'Super Top-up 10L')).toBe('GHI_TOPUP');
    expect(policyTypeOf('GPA', '')).toBe('GPA');
    expect(policyTypeOf('', 'Group Term Life')).toBe('GTLI');
    expect(policyTypeOf('Something else', '')).toBeNull();
    expect(money('₹ 5,00,000.00')).toBe(500000);
    expect(money('')).toBeNull();
    expect(money('NA')).toBeNull();
  });

  it('asks for each other active policy, never an expired one or the primary again', () => {
    const topUp = { ...POLICY_GHI, policyNo: 'TOP-9', productName: 'Top Up', isPrimary: false };
    const old = { ...POLICY_GHI, policyNo: 'GHI/2025/1', isPrimary: false, isActive: false };
    expect(policiesNeedingDetail(summaryBody({ policies: [POLICY_GHI, topUp, old] }))).toEqual([{ key: 'TOP9', policyNo: 'TOP-9' }]);
  });

  it.each([
    ['success false', { ...SUMMARY, success: false }],
    ['no member id', summaryBody({ member: { Name: 'X' } })],
    ['policies not a list', summaryBody({ policies: {} })],
    ['a dependant with no name', summaryBody({ dependents: [{ ...SPOUSE, InsuredName: '' }] })],
    ['a dependant of another policy', summaryBody({ dependents: [{ ...SPOUSE, PolicyNumber: 'OTHER-1' }] })],
    ['an active policy whose dependants were not read', summaryBody({ policies: [POLICY_GHI, { ...POLICY_GHI, policyNo: 'TOP-9', isPrimary: false }] })],
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
    const body = summaryBody({ member: { id: 'M-OTHER', Name: 'Someone' } });
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

  it('reads each other active policy with policy_no and projects every policy\'s family', async () => {
    let policyId = 100;
    handlers.push(
      [/INSERT INTO insurance_policies/, () => [{ id: ++policyId }]],
      [/INSERT INTO policy_members/, () => [{ id: 201 }]],
    );
    const topUp = { ...POLICY_GHI, policyNo: 'TOP-9', productName: 'Super Top Up', isPrimary: false, employeeSumInsured: '1000000' };
    const primary = summaryBody({ policies: [POLICY_GHI, topUp] });
    const detail = summaryBody({ policy: topUp, policies: [POLICY_GHI, topUp], dependents: [{ ...SPOUSE, id: 78, PolicyNumber: 'TOP-9' }] });
    const fetchImpl = fetchReturning({ body: primary }, { body: detail });
    const out = await links.refreshMember({ userId: 7646, fetchImpl }, fakeDb);
    expect(out).toMatchObject({ refreshed: true, policies: 2, members: 4 });
    expect(new URL(fetchImpl.mock.calls[1][0]).searchParams.get('policy_no')).toBe('TOP-9');
    const types = calls.filter((c) => c.sql.startsWith('INSERT INTO insurance_policies')).map((c) => c.params[1]);
    expect(types).toEqual(['GHI', 'GHI_TOPUP']);
  });

  it('fails the whole refresh if a per-policy read fails, writing nothing', async () => {
    const topUp = { ...POLICY_GHI, policyNo: 'TOP-9', isPrimary: false };
    const fetchImpl = fetchReturning({ body: summaryBody({ policies: [POLICY_GHI, topUp] }) }, { status: 404, body: { success: false } });
    await expect(links.refreshMember({ userId: 7646, fetchImpl }, fakeDb)).rejects.toMatchObject({ code: 'UPSTREAM_REJECTED' });
    expect(calls.some((c) => /^INSERT INTO (insurance_policies|policy_members)/.test(c.sql))).toBe(false);
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
  const OPEN = { status: 200, body: { success: true, data: { isOpen: true, state: 'open' } } };

  it('is refused unless the employer is on in-app enrolment, and says where to go instead', async () => {
    handlers = baseHandlers({ binding: { ...BINDING, enrolment_mode: 'web' } });
    await expect(enrolment.runOperation('window', { userId: 7646, fetchImpl: jest.fn() }, fakeDb))
      .rejects.toMatchObject({ code: 'ENROLMENT_NOT_IN_APP', details: { mode: 'web', webUrl: BINDING.web_enrolment_url } });
  });

  it('refuses a submit while the window is closed, without calling submit', async () => {
    handlers.push([/INSERT INTO insurance_enrolment_requests/, () => [{ id: 1 }]]);
    const fetchImpl = fetchReturning({ body: { success: true, data: { isOpen: false, state: 'expired', message: 'expired' } } });
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

  it('requires an idempotency key for submit and payment; there is no dependants operation', async () => {
    for (const op of ['submit', 'paymentInitiate']) {
      await expect(enrolment.runOperation(op, { userId: 7646, body: {}, fetchImpl: jest.fn() }, fakeDb))
        .rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
    }
    await expect(enrolment.runOperation('dependents', { userId: 7646, body: {}, fetchImpl: jest.fn() }, fakeDb))
      .rejects.toMatchObject({ code: 'UNSUPPORTED_OPERATION' });
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
    // SmartCRM refuses every enrolment call without the member's consent id.
    expect(fetchImpl.mock.calls[0][1].headers['X-Mediqzy-Consent-Id']).toBe(LINK.consent_id);
    expect(init.headers['X-Mediqzy-Consent-Id']).toBe(LINK.consent_id);
    const stored = calls.find((c) => c.sql.startsWith('UPDATE insurance_enrolment_requests SET state = $2'));
    expect(stored.params.slice(0, 3)).toEqual([77, 'done', 202]);
  });

  it("translates the app's quote to SmartCRM's and the reply back (price from optionalPremiumTotal)", async () => {
    const fetchImpl = fetchReturning(OPEN, { status: 200, body: { success: true, data: { optionalPremiumTotal: 53846, currency: 'INR', paymentRequired: true, options: [{ id: 'opt-4', name: 'Option IV' }] } } });
    const out = await enrolment.runOperation('quote', { userId: 7646, body: { policyId: '1', sessionId: 's', selection: { selectedPolicyOptionIds: ['opt-4'] } }, fetchImpl }, fakeDb);
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({ selected_policy_options: [{ id: 'opt-4' }] });
    expect(out.status).toBe(200);
    expect(out.body.data).toMatchObject({ total: 53846, gstIncluded: false, collectionMode: 'online', lines: [{ id: 'opt-4', name: 'Option IV' }] });
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
  it('never takes a user, corporate or employee id from the request', () => {
    expect(src).not.toMatch(/req\.(params|query|body)\.(userId|user_id|emp_id|empId|corporateId|corporate_id)/);
    expect(src).not.toMatch(/router\.\w+\(\s*'[^']*:/); // no path params at all
    // The only ids taken are the wallet's own policy/member row ids, for the
    // e-card, and the service checks them against the caller's family.
    expect(src.match(/req\.query\.memberId/g)).toHaveLength(1);
    const svc = readFileSync(join(ROOT, 'services/smartcrm/member-documents.service.js'), 'utf8');
    expect(svc).toContain('AND pm."primaryMemberUserId" = $3');
  });
  it('is mounted under /api/employee, which ring-fencing already allows', () => {
    const app = readFileSync(join(ROOT, 'app.js'), 'utf8');
    expect(app).toMatch(/app\.use\("\/api\/employee", employeeInsuranceRouter\)/);
    const rf = readFileSync(join(ROOT, 'middleware/ringFencing.js'), 'utf8');
    expect(rf).toContain("'/api/employee'");
  });
});

describe('wallet overlay — web enrolment for an employer on Mediqzy data', () => {
  const { applyEnrolmentOverlay } = await_overlay;
  const native = (id) => ({ id, source: 'insurance_policies', enrolment: { from: '2020-01-01', to: '2099-01-01', open: true } });

  it('gives a native policy web mode and the portal URL from a key-less web binding', async () => {
    const webOnly = { corporate_id: 5, tenant_slug: null, smartcrm_corporate: null, api_key_env: null, read_enabled: false, enrolment_mode: 'web', web_enrolment_url: 'https://enrol.example.invalid/x' };
    handlers = baseHandlers({ link: null });
    handlers.unshift([/FROM smartcrm_corporate_bindings WHERE corporate_id = ANY/, () => [webOnly]]);
    const policies = [native('1'), native('2')];
    await applyEnrolmentOverlay(19, policies, new Map([['1', 5], ['2', 6]]));
    expect(policies[0].enrolment).toMatchObject({ mode: 'web', webUrl: webOnly.web_enrolment_url, status: 'open' });
    // Another employer's policy is untouched by this employer's binding.
    expect(policies[1].enrolment).toMatchObject({ mode: 'off', webUrl: null });
  });

  it('never gives a native policy in_app mode — that flow exists only through SmartCRM', async () => {
    handlers = baseHandlers({ link: null });
    handlers.unshift([/FROM smartcrm_corporate_bindings WHERE corporate_id = ANY/, () => [{ ...BINDING }]]);
    const policies = [native('1')];
    await applyEnrolmentOverlay(19, policies, new Map([['1', 5]]));
    expect(policies[0].enrolment.mode).toBe('off');
  });

  it('a SmartCRM-projected policy takes the binding mode and the last submission', async () => {
    handlers.unshift(
      [/FROM smartcrm_corporate_bindings WHERE corporate_id = ANY/, () => [{ ...BINDING }]],
      [/FROM insurance_enrolment_requests WHERE user_id = \$1 AND operation = 'submit'/, () => [{ status_code: 202, response: { request_id: 'HR-9' }, completed_at: null }]],
    );
    const policies = [{ id: '3', source: 'smartcrm', enrolment: { from: null, to: null, open: false } }];
    const insurance = await applyEnrolmentOverlay(7646, policies, new Map([['3', 5]]));
    expect(policies[0].enrolment).toMatchObject({ mode: 'in_app', status: 'live_check', requestId: 'HR-9' });
    expect(insurance.linked).toBe(true);
  });

  it('the migration lets a web binding exist without SmartCRM keys, but not a read or in-app one', () => {
    const sql = readFileSync(join(ROOT, 'migrations/20261113000200-smartcrm-integration.migration.js'), 'utf8');
    expect(sql).toMatch(/smartcrm_bindings_api_needs_source CHECK/);
    expect(sql).toMatch(/smartcrm_bindings_web_needs_url CHECK/);
  });
});

describe('member claims and e-cards from SmartCRM', () => {
  const CLAIM = {
    id: 5, Employee_ID: 'EQ1234', Claim_Number: 'CL-1', Name_of_the_Patient: 'Test Spouse', Relation: 'Spouse',
    Name_of_Hospital: 'City Hospital', Ailment: 'Fever', Date_of_Admission: '2026-08-01', Date_of_Discharge: '2026-08-03',
    Claim_Type: 'Cashless', Total_Bill_Amount: '42,000', Paid_Amount: '40000', Primary_Claim_Status: 'Settled',
    Sum_Insured: '500000', POLICY_NUMBER: 'GHI/2026/1',
  };

  it('lists the linked member\'s claims, mapped and audited', async () => {
    const fetchImpl = fetchReturning({ body: { success: true, data: { claims: [CLAIM] } } });
    const claims = await documents.listMemberClaims({ userId: 7646, fetchImpl }, fakeDb);
    expect(new URL(fetchImpl.mock.calls[0][0]).pathname).toBe('/api/v2/partner/mediqzy/insurance/claims/');
    expect(claims).toEqual([expect.objectContaining({
      claimNumber: 'CL-1', patientName: 'Test Spouse', hospital: 'City Hospital', billedAmount: 42000, paidAmount: 40000,
      status: 'Settled', admissionDate: '2026-08-01', source: 'smartcrm',
    })]);
    expect(audited()).toContain('smartcrm.claims.read');
  });

  it('refuses without a link and reads nothing', async () => {
    handlers = baseHandlers({ link: null });
    const fetchImpl = jest.fn();
    await expect(documents.listMemberClaims({ userId: 7646, fetchImpl }, fakeDb)).rejects.toMatchObject({ code: 'NOT_LINKED' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  const pdf = Buffer.from('%PDF-1.4 test card').toString('base64');
  const ecardRow = (over = {}) => [/FROM policy_members pm JOIN insurance_policies p/, (params) => {
    calls.at(-1).ecardParams = params;
    return [{ relationship: 'spouse', card_no: 'MA-101', name: 'Test Spouse', policy_no: 'GHI/2026/1', ...over }];
  }];

  it('a dependant\'s card is asked for by the card number on the caller\'s own row', async () => {
    handlers.push(ecardRow());
    const fetchImpl = fetchReturning({ body: { success: true, data: { source: 'uploaded', filename: 'MA 101.pdf', documentBase64: pdf } } });
    const file = await documents.getMemberEcard({ userId: 7646, policyId: '101', memberId: '201', fetchImpl }, fakeDb);
    const ownership = calls.find((c) => c.sql.includes('FROM policy_members pm JOIN insurance_policies p'));
    expect(ownership.params).toEqual([201, 101, 7646, 'smartcrm']);
    const u = new URL(fetchImpl.mock.calls[0][0]);
    expect(u.pathname).toBe('/api/v2/partner/mediqzy/insurance/ecard/');
    expect(u.searchParams.get('policy_no')).toBe('GHI/2026/1');
    expect(u.searchParams.get('card_no')).toBe('MA-101');
    expect(u.searchParams.get('emp_id')).toBe('EQ1234');
    expect(file).toMatchObject({ mimeType: 'application/pdf', filename: 'MA-101.pdf' });
    expect(file.buffer.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('the employee\'s own card sends no card number (SmartCRM picks the employee row)', async () => {
    handlers.push(ecardRow({ relationship: 'self', card_no: 'MA-100' }));
    const fetchImpl = fetchReturning({ body: { success: true, data: { documentBase64: pdf } } });
    await documents.getMemberEcard({ userId: 7646, policyId: 101, memberId: 200, fetchImpl }, fakeDb);
    expect(new URL(fetchImpl.mock.calls[0][0]).searchParams.has('card_no')).toBe(false);
  });

  it('another family\'s row, a native policy or a bad id is not found, and SmartCRM is never asked', async () => {
    handlers.push([/FROM policy_members pm JOIN insurance_policies p/, () => []]);
    const fetchImpl = jest.fn();
    await expect(documents.getMemberEcard({ userId: 7646, policyId: 1, memberId: 2, fetchImpl }, fakeDb)).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
    await expect(documents.getMemberEcard({ userId: 7646, policyId: 'x', memberId: 2, fetchImpl }, fakeDb)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('only a real document is passed on; an insurer https link is a redirect; anything else is refused', async () => {
    handlers.push(ecardRow());
    const notADoc = fetchReturning({ body: { success: true, data: { documentBase64: Buffer.from('<html>').toString('base64') } } });
    await expect(documents.getMemberEcard({ userId: 7646, policyId: 1, memberId: 2, fetchImpl: notADoc }, fakeDb)).rejects.toMatchObject({ code: 'BAD_UPSTREAM_PAYLOAD' });
    const link = fetchReturning({ body: { success: true, data: { documentUrl: 'https://insurer.example/card/1.pdf' } } });
    await expect(documents.getMemberEcard({ userId: 7646, policyId: 1, memberId: 2, fetchImpl: link }, fakeDb)).resolves.toMatchObject({ url: 'https://insurer.example/card/1.pdf' });
    const plainHttp = fetchReturning({ body: { success: true, data: { documentUrl: 'http://insurer.example/card/1.pdf' } } });
    await expect(documents.getMemberEcard({ userId: 7646, policyId: 1, memberId: 2, fetchImpl: plainHttp }, fakeDb)).rejects.toMatchObject({ code: 'ECARD_NOT_AVAILABLE' });
  });

  it('SmartCRM\'s "not issued" is shown as that, not as an error', async () => {
    handlers.push(ecardRow());
    const fetchImpl = fetchReturning({ status: 404, body: { success: false, error: { code: 'ECARD_NOT_AVAILABLE', message: 'x' } } });
    await expect(documents.getMemberEcard({ userId: 7646, policyId: 1, memberId: 2, fetchImpl }, fakeDb)).rejects.toMatchObject({ code: 'ECARD_NOT_AVAILABLE', status: 404 });
  });
});
