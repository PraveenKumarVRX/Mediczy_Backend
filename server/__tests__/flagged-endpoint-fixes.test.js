import { describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

/**
 * A QA pass reported "Mind & Mood: 403 for patients — open /mental-health/* to
 * patients" and "insurance e-card: 404". Both diagnoses were wrong, and both
 * were wrong because of the same thing: ring-fencing runs before routing, so a
 * path no router serves is refused with "Access denied - insufficient
 * privileges", identical to a real permission refusal. Opening
 * /api/mental-health/* would have changed nothing — there is no such router.
 * The mental-wellness backend exists under /api/programs, exactly as its own
 * plan specified ("0 new API prefixes").
 */
describe('a denial says which kind of denial it is', () => {
  const middleware = read('middleware/ringFencing.js');

  it('answers not-found for a path no router serves', () => {
    expect(middleware).toContain("code: 'ENDPOINT_NOT_FOUND'");
    expect(middleware).toContain('const mounted = isPathMounted(req.app, requestPath, req.method)');
  });

  it('still refuses a real endpoint the caller may not use', () => {
    expect(middleware).toContain("code: 'ACCESS_DENIED'");
    // The not-found answer must come first, or every missing path keeps
    // reading as a permissions problem.
    expect(middleware.indexOf("code: 'ENDPOINT_NOT_FOUND'"))
      .toBeLessThan(middleware.lastIndexOf("code: 'ACCESS_DENIED'"));
  });

  it('decides after authentication, so it tells nothing to an anonymous caller', () => {
    const gate = middleware.indexOf('const mounted = isPathMounted');
    // The 401 for a missing or bad token is issued earlier in the same
    // middleware, so an unauthenticated probe never reaches this branch.
    expect(middleware.lastIndexOf('status(401)', gate)).toBeGreaterThan(-1);
  });
});

describe('isPathMounted', () => {
  let isPathMounted;
  beforeAll(async () => {
    jest.resetModules();
    ({ isPathMounted } = await import('../middleware/ringFencing.js'));
  });

  // Mounted routers carry a route each. A router with no routes at all is
  // treated as serving whatever matches its prefix — it is middleware-only and
  // may answer anything, and a wrong 404 that hides a working endpoint is
  // worse than the 403 this replaces.
  const mountLayer = (prefix, routePaths) => ({
    regexp: {
      fast_slash: false,
      test: (p) => p === prefix || p.startsWith(`${prefix}/`),
      exec: (p) => (p === prefix || p.startsWith(`${prefix}/`) ? [prefix] : null),
    },
    handle: {
      stack: routePaths.map((routePath) => ({
        route: { path: routePath, methods: { get: true } },
        regexp: { test: (rest) => rest === routePath, fast_slash: false },
      })),
    },
  });

  const appWith = (...mounts) => ({
    _router: {
      stack: [
        // root-level middleware: matches everything, must not count
        { regexp: { fast_slash: true, test: () => true }, handle: {} },
        ...mounts.map((prefix) => mountLayer(prefix, ['/', '/dashboard', '/instruments'])),
      ],
    },
  });

  it('finds a mounted prefix', () => {
    const app = appWith('/api/programs', '/api/wellness');
    expect(isPathMounted(app, '/api/programs/instruments')).toBe(true);
    expect(isPathMounted(app, '/api/wellness/dashboard')).toBe(true);
    // a path under a mounted prefix that no route declares is still absent
    expect(isPathMounted(app, '/api/programs/not-a-route')).toBe(false);
  });

  it('does not find a prefix nothing mounts', () => {
    const app = appWith('/api/programs');
    expect(isPathMounted(app, '/api/mental-health/moods')).toBe(false);
    expect(isPathMounted(app, '/api/sos-contacts')).toBe(false);
  });

  it('ignores root-level middleware, which would make every path look mounted', () => {
    expect(isPathMounted({ _router: { stack: [{ regexp: { fast_slash: true, test: () => true }, handle: {} }] } }, '/api/anything')).toBe(false);
  });

  it('ignores a matching layer that is neither a route nor a router', () => {
    const app = { _router: { stack: [{ regexp: { fast_slash: false, test: () => true }, handle: {} }] } };
    expect(isPathMounted(app, '/api/anything')).toBe(false);
  });

  it('treats a router that declares no routes as serving whatever it mounts', () => {
    // It is middleware-only and may answer anything. A wrong 404 hides a
    // working endpoint; the 403 it would otherwise give is merely unhelpful.
    const app = { _router: { stack: [{
      regexp: { fast_slash: false, test: () => true, exec: () => ['/api/opaque'] },
      handle: { stack: [{ regexp: { test: () => false }, handle: () => {} }] },
    }] } };
    expect(isPathMounted(app, '/api/opaque/anything')).toBe(true);
  });

  it('ignores a wildcard route registered for another method', () => {
    // app.options('*') is registered for CORS preflight and matches every
    // path. Counting it made every path look served, which is why the first
    // version of this check never fired at all.
    const preflight = {
      route: { path: '*', methods: { options: true } },
      regexp: { test: () => true },
    };
    const real = {
      route: { path: '/api/thing', methods: { get: true } },
      regexp: { test: (p) => p === '/api/thing' },
    };
    const app = { _router: { stack: [preflight, real] } };
    expect(isPathMounted(app, '/api/nowhere', 'GET')).toBe(false);
    expect(isPathMounted(app, '/api/nowhere', 'OPTIONS')).toBe(true);
    expect(isPathMounted(app, '/api/thing', 'GET')).toBe(true);
    expect(isPathMounted(app, '/api/thing', 'DELETE')).toBe(false);
  });

  it('serves HEAD wherever GET is declared', () => {
    const app = { _router: { stack: [{
      route: { path: '/api/thing', methods: { get: true } },
      regexp: { test: (p) => p === '/api/thing' },
    }] } };
    expect(isPathMounted(app, '/api/thing', 'HEAD')).toBe(true);
  });

  it('honours a route declared for all methods', () => {
    const app = { _router: { stack: [{
      route: { path: '/api/thing', methods: { _all: true } },
      regexp: { test: (p) => p === '/api/thing' },
    }] } };
    expect(isPathMounted(app, '/api/thing', 'PATCH')).toBe(true);
  });

  it('passes the request method through from the middleware', () => {
    const middleware = read('middleware/ringFencing.js');
    expect(middleware).toContain('isPathMounted(req.app, requestPath, req.method)');
  });

  it('descends into a router rather than stopping at its mount', () => {
    // Two routers are mounted at bare '/api', so matching mount prefixes alone
    // claimed every path this middleware guards and the check never fired.
    const api = {
      regexp: { fast_slash: false, test: (p) => p.startsWith('/api'), exec: () => ['/api'] },
      handle: { stack: [{ route: { path: '/hospitals', methods: { get: true } }, regexp: { test: (rest) => rest === '/hospitals' } }] },
    };
    const app = { _router: { stack: [api] } };
    expect(isPathMounted(app, '/api/hospitals')).toBe(true);
    expect(isPathMounted(app, '/api/mental-health/moods')).toBe(false);
  });

  it('errs towards mounted when the stack cannot be read', () => {
    // A wrong 403 is the old behaviour; a wrong 404 would hide a real endpoint.
    expect(isPathMounted({}, '/api/programs')).toBe(true);
    expect(isPathMounted({ _router: { stack: 'not an array' } }, '/api/programs')).toBe(true);
    expect(isPathMounted({ _router: { stack: [{ regexp: { fast_slash: false, test: () => { throw new Error('x'); } }, handle: { stack: [] } }] } }, '/api/x')).toBe(true);
  });
});

describe('the health score the mobile app calls', () => {
  const middleware = read('middleware/ringFencing.js');
  const app = read('app.js');

  it('is mounted', () => {
    expect(app).toMatch(/app\.use\("\/api\/health-score", healthScoreRouter\)/);
  });

  it('is allow-listed for both a user and a patient, so it stops answering 403', () => {
    // Live traffic: /api/health-score/today was being refused for every caller.
    expect((middleware.match(/'\/api\/health-score'/g) || []).length).toBe(2);
  });
});

describe('the Ayushman router', () => {
  const app = read('app.js');
  const middleware = read('middleware/ringFencing.js');

  it('is mounted at the prefix the allow-list and every caller use', () => {
    expect(app).toContain('app.use("/api/ayushman", ayushmanRouter)');
    expect(middleware).toContain("'/api/ayushman'");
  });

  it('keeps the old prefix working', () => {
    expect(app).toContain('app.use("/api/ahunground", ayushmanRouter)');
  });

  it('mounts the real name first, so it is the one that answers', () => {
    expect(app.indexOf('app.use("/api/ayushman"')).toBeLessThan(app.indexOf('app.use("/api/ahunground"'));
  });
});

describe('the e-card answers from wherever the cover actually is', () => {
  const load = async (handlers = {}) => {
    jest.resetModules();
    const calls = [];
    const query = jest.fn(async (sql, options) => {
      const flat = sql.replace(/\s+/g, ' ').trim();
      const shape = /FROM policy_members/.test(flat) ? 'policy'
        : /FROM tpa_member_enrollments/.test(flat) ? 'pending'
        : 'other';
      calls.push({ shape, sql: flat, replacements: options?.replacements });
      const handler = handlers[shape];
      if (typeof handler === 'function') return handler();
      return handler ?? [];
    });
    jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({
      postgresSequelize: { query, transaction: jest.fn() },
    }));
    jest.unstable_mockModule('../services/tpa-claims-lifecycle.service.js', () => ({
      tpaClaimsLifecycleService: { getECardForUser: handlers.tpa || (async () => null) },
      default: { getECardForUser: handlers.tpa || (async () => null) },
    }));
    const mod = await import('../services/member-ecard.service.js');
    return { ...mod, calls, query };
  };

  const policyRow = (over = {}) => ({
    memberRowId: 12, relationship: 'self', sumInsured: '500000.00', used: '25000.00',
    remaining: '475000.00', validFrom: '2026-04-01', validTill: '2027-03-31',
    policyNumber: 'GRP-2026-0001', planName: 'Group Health', policyType: 'group',
    policySumInsured: '500000.00', insurer: 'Star Health', policyType: 'GHI', ...over,
  });

  it('prefers the TPA membership, which is the administrator\'s own record', async () => {
    const { resolveMemberCard, calls } = await load({
      tpa: async () => ({ success: true, ecard: { cardNumber: 'ECARD-X' } }),
      policy: [policyRow()],
    });
    const result = await resolveMemberCard(19);
    expect(result.ecard.cardNumber).toBe('ECARD-X');
    expect(result.source).toBe('tpa_membership');
    expect(calls.some((c) => c.shape === 'policy')).toBe(false);
  });

  it('falls back to the policy roster, which was a card nobody was being shown', async () => {
    const { resolveMemberCard } = await load({ policy: [policyRow()] });
    const result = await resolveMemberCard(19);
    expect(result.source).toBe('policy_roster');
    expect(result.ecard).toMatchObject({
      policyNumber: 'GRP-2026-0001', insurer: 'Star Health',
      coverageAmount: 500000, availableBalance: 475000,
    });
  });

  it('only ever offers a policy a hospital can use the card for', async () => {
    const { resolveMemberCard, calls } = await load({ policy: [] });
    await resolveMemberCard(19);
    const sql = calls.find((c) => c.shape === 'policy').sql;
    // Ordered by coverage end date alone, the fallback handed back whichever
    // policy came first — in practice an outpatient one, so "my insurance
    // card" showed a ₹25,000 OPD balance instead of ₹5,00,000 of hospital
    // cover. An accident or life policy would be worse: no card exists.
    expect(sql).toContain('= ANY(ARRAY[:cardTypes]::text[])');
    expect(sql).toContain('array_position(ARRAY[:rank]::text[]');
  });

  it('asks for exactly the types the wallet says have cards', async () => {
    const { resolveMemberCard, calls } = await load({ policy: [] });
    await resolveMemberCard(19);
    const { cardTypes, rank } = calls.find((c) => c.shape === 'policy').replacements;
    expect(new Set(cardTypes)).toEqual(new Set(['GHI', 'GHI_TOPUP', 'PARENTS_GHI', 'PARENTS_TOPUP']));
    for (const noCard of ['GPA', 'GTLI', 'OPD']) expect(cardTypes).not.toContain(noCard);
    // Base cover before its top-up, the member's own before their parents'.
    expect(rank[0]).toBe('GHI');
    expect(rank.indexOf('GHI')).toBeLessThan(rank.indexOf('GHI_TOPUP'));
  });

  it('reports which type the card belongs to', async () => {
    const { resolveMemberCard } = await load({ policy: [policyRow({ policyType: 'GHI' })] });
    expect((await resolveMemberCard(19)).ecard.policyType).toBe('GHI');
  });

  it('computes the balance itself when the stored remaining is null', async () => {
    const { resolveMemberCard } = await load({ policy: [policyRow({ remaining: null })] });
    const result = await resolveMemberCard(19);
    expect(result.ecard.availableBalance).toBe(475000);
  });

  it('never shows a negative balance', async () => {
    const { resolveMemberCard } = await load({
      policy: [policyRow({ remaining: null, used: '900000.00' })],
    });
    expect((await resolveMemberCard(19)).ecard.availableBalance).toBe(0);
  });

  it('carries no QR code on a policy card', async () => {
    // The TPA card's QR verifies through /api/tpa/ecard/verify, which reads
    // tpa_members. A code pointing at a row that is not there would fail at
    // the hospital desk, which is worse than showing none.
    const { resolveMemberCard } = await load({ policy: [policyRow()] });
    const { ecard } = await resolveMemberCard(19);
    expect(ecard.qrPayload).toBeNull();
    expect(ecard.verifyUrl).toBeNull();
  });

  it('only counts active membership of a live policy', async () => {
    const { resolveMemberCard, calls } = await load({ policy: [] });
    await resolveMemberCard(19);
    const sql = calls.find((c) => c.shape === 'policy').sql;
    expect(sql).toContain('m."isActive" = true');
    expect(sql).toContain("IN ('active', 'in_force')");
    expect(sql).toContain('m."coverageEndDate" >= CURRENT_DATE');
  });

  it('resolves by account id and by nothing else', async () => {
    const { resolveMemberCard, calls } = await load({ policy: [] });
    await resolveMemberCard(19);
    const sql = calls.find((c) => c.shape === 'policy').sql;
    expect(sql).toContain('m."userId" = :userId');
    for (const column of ['employee_name', 'phone', 'name =']) expect(sql).not.toContain(column);
  });

  it('reports a submitted enrolment as waiting, not as an error', async () => {
    const { resolveMemberCard, ECARD_REASON } = await load({
      policy: [],
      pending: [{ enrollmentNumber: 'ENR-C49-EQ-4821', status: 'submitted', corporate: 'Equitas' }],
    });
    const result = await resolveMemberCard(19);
    expect(result.reason).toBe(ECARD_REASON.PENDING_APPROVAL);
    expect(result.message).toMatch(/has not confirmed it yet/);
    expect(result.enrolment.enrollmentNumber).toBe('ENR-C49-EQ-4821');
  });

  it('says what a raised query means, which is different from waiting', async () => {
    const { resolveMemberCard } = await load({
      policy: [],
      pending: [{ enrollmentNumber: 'ENR-1', status: 'query_raised' }],
    });
    expect((await resolveMemberCard(19)).message).toMatch(/raised a query/);
  });

  it('tells an uncovered member what would fix it', async () => {
    const { resolveMemberCard, ECARD_REASON } = await load({ policy: [], pending: [] });
    const result = await resolveMemberCard(19);
    expect(result.reason).toBe(ECARD_REASON.NOT_LINKED);
    expect(result.message).toMatch(/HR team/);
  });

  it('refuses a bad account id without touching the database', async () => {
    const { resolveMemberCard, query } = await load();
    for (const bad of [null, undefined, 0, -1, 'abc', 1.5]) {
      await expect(resolveMemberCard(bad)).resolves.toMatchObject({ reason: 'ECARD_NO_INSURANCE' });
    }
    expect(query).not.toHaveBeenCalled();
  });

  it('treats an unmigrated table as no cover of that kind, not an error', async () => {
    const missing = () => {
      const error = new Error('relation "policy_members" does not exist');
      error.original = { code: '42P01' };
      throw error;
    };
    const { resolveMemberCard } = await load({ policy: missing, pending: missing });
    await expect(resolveMemberCard(19)).resolves.toMatchObject({ reason: 'ECARD_NOT_LINKED' });
  });

  it('lets an unrelated database error surface', async () => {
    const { resolveMemberCard } = await load({
      policy: () => {
        const error = new Error('connection terminated');
        error.original = { code: '08006' };
        throw error;
      },
    });
    await expect(resolveMemberCard(19)).rejects.toThrow('connection terminated');
  });
});

describe('the e-card endpoint', () => {
  const route = read('routes/membership.route.js');
  const handler = route.slice(route.indexOf("router.get('/e-card'"), route.indexOf("router.get('/my/current'"));

  it('uses the resolver rather than one source', () => {
    expect(handler).toContain('resolveMemberCard(req.user.id)');
  });

  it('stays scoped to the caller', () => {
    expect(handler).not.toMatch(/req\.(params|query|body)/);
  });

  it('passes the reason through so the app can tell the states apart', () => {
    expect(handler).toContain("code: result?.reason || 'ECARD_NOT_LINKED'");
    expect(handler).toContain('result?.message');
  });

  it('does not put the database error in the response', () => {
    expect(handler).toContain('Could not load your e-card');
    expect(handler).not.toMatch(/error:\s*error\.message/);
  });
});
