import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The app-facing API contract (server/openapi/) is the source of truth the
 * My SmartHealth app and partners build against. These tests keep it honest:
 * valid OpenAPI, the committed artifact current, and the spec and the code
 * agreeing in both directions for every router the contract fully covers.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { buildAppSpec, APP_SPEC_VERSION } = await import('../openapi/index.js');
const { operationsFromSource, operationsFromSpec, compareOperations, validateAgainst, checkResponse } = await import('../openapi/contract.js');

const spec = buildAppSpec();
const src = (file) => readFileSync(join(ROOT, file), 'utf8');

/** Routers whose every route must be in the contract, and nothing more. */
const FULLY_DOCUMENTED = [
  { file: 'routes/employee-network.route.js', mount: '/api/employee' },
  { file: 'routes/employee-insurance.route.js', mount: '/api/employee' },
  { file: 'routes/admin-integrations.route.js', mount: '/api/admin/integrations' },
  { file: 'routes/openapi.route.js', mount: '/api/admin/openapi' },
  { file: 'routes/mental-health.route.js', mount: '/api/mental-health' },
];
/** Routers only partly in the contract: whatever is documented must exist. */
const PARTLY_DOCUMENTED = [{ file: 'routes/address.route.js', mount: '/api/addresses' }, { file: 'routes/oauth.route.js', mount: '/api/auth' },
  { file: 'routes/call-notification.route.js', mount: '/api/call-notification' }, { file: 'routes/reports.route.js', mount: '/api/reports' },
  { file: 'routes/family-member.route.js', mount: '/api/family-members' }];

describe('the spec itself', () => {
  it('is valid OpenAPI 3.0', async () => {
    const SwaggerParser = require('@apidevtools/swagger-parser');
    await expect(SwaggerParser.validate(buildAppSpec())).resolves.toBeTruthy();
  });

  it('has a version and requires a bearer token by default', () => {
    expect(spec.info.version).toBe(APP_SPEC_VERSION);
    expect(spec.security).toEqual([{ bearerAuth: [] }]);
  });

  it('matches the committed artifact (run npm run openapi:export after a change)', () => {
    const committed = JSON.parse(src('openapi/dist/app.openapi.json'));
    expect(committed).toEqual(spec);
  });

  it('every operation documents 401 and at least one success response', () => {
    for (const { method, path } of operationsFromSpec(spec)) {
      const responses = spec.paths[path][method].responses;
      // Sign-in endpoints are called before there is a token to reject.
      if (spec.paths[path][method].security?.length !== 0) expect([path, method, Boolean(responses['401'])]).toEqual([path, method, true]);
      expect([path, method, Object.keys(responses).some((s) => /^2\d\d$/.test(s))]).toEqual([path, method, true]);
    }
  });

  it('every {param} in a path is declared as a path parameter', () => {
    for (const { method, path } of operationsFromSpec(spec)) {
      const declared = (spec.paths[path][method].parameters || []).filter((p) => p.in === 'path').map((p) => p.name).sort();
      const inPath = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]).sort();
      expect([path, method, declared]).toEqual([path, method, inPath]);
    }
  });
});

describe('the spec and the code agree', () => {
  it.each(FULLY_DOCUMENTED)('$file: every route it serves is documented', ({ file, mount }) => {
    const routerOps = operationsFromSource(src(file), mount);
    expect(routerOps.length).toBeGreaterThan(0);
    expect(compareOperations(operationsFromSpec(spec, mount), routerOps).servedNotDocumented).toEqual([]);
  });

  it.each(FULLY_DOCUMENTED.filter((d) => d.mount !== '/api/employee'))('$file: every documented route under its mount is served', ({ file, mount }) => {
    expect(compareOperations(operationsFromSpec(spec, mount), operationsFromSource(src(file), mount)).documentedNotServed).toEqual([]);
  });

  it('nothing under /api/employee is documented that neither employee router serves', () => {
    const served = [...operationsFromSource(src('routes/employee-network.route.js'), '/api/employee'), ...operationsFromSource(src('routes/employee-insurance.route.js'), '/api/employee')];
    expect(compareOperations(operationsFromSpec(spec, '/api/employee'), served)).toEqual({ documentedNotServed: [], servedNotDocumented: [] });
  });

  it.each(PARTLY_DOCUMENTED)('$file: every documented route is served', ({ file, mount }) => {
    const { documentedNotServed } = compareOperations(operationsFromSpec(spec, mount), file === 'routes/oauth.route.js' ? [...operationsFromSource(src(file), mount), ...operationsFromSource(src('routes/auth.login.route.js'), mount), ...operationsFromSource(src('routes/auth.token.route.js'), mount)] : operationsFromSource(src(file), mount));
    expect(documentedNotServed).toEqual([]);
  });

  it('the documented routers are mounted where the spec says', () => {
    const app = src('app.js');
    expect(app).toMatch(/app\.use\("\/api\/employee", employeeInsuranceRouter\)/);
    expect(app).toMatch(/app\.use\("\/api\/employee", employeeNetworkRouter\)/);
    expect(app).toMatch(/app\.use\('\/api\/admin\/integrations', adminIntegrationsRouter\)/);
    expect(app).toMatch(/app\.use\('\/api\/admin\/openapi', openapiRouter\)/);
    expect(app).toMatch(/app\.use\("\/api\/mental-health", mentalHealthRouter\)/);
  });
});

describe('the validator catches real contract breaks', () => {
  const walletSchema = { $ref: '#/components/schemas/PolicyWallet' };
  const policy = {
    id: '8', source: 'insurance_policies', name: 'GHI', status: 'active', members: [], missing: [],
    enrolment: { from: null, to: null, open: false, status: 'not_set', mode: 'off', webUrl: null, submission: null, requestId: null },
  };
  const wallet = { success: true, policies: [policy], groups: [], summary: {}, ladders: [], insurance: { linked: false } };

  it('accepts a conforming wallet', () => {
    expect(validateAgainst(spec, walletSchema, wallet)).toEqual([]);
  });

  it('flags a removed required field, a wrong enum and a wrong type', () => {
    const broken = { ...wallet, policies: [{ ...policy, enrolment: { ...policy.enrolment, mode: 'maybe' }, members: 'none' }] };
    delete broken.insurance;
    const errors = validateAgainst(spec, walletSchema, broken);
    expect(errors.join('\n')).toMatch(/insurance: required but missing/);
    expect(errors.join('\n')).toMatch(/enrolment\.mode: "maybe" not in/);
    expect(errors.join('\n')).toMatch(/members: expected array/);
  });

  it('checks a response by operation and status', () => {
    expect(checkResponse(spec, 'get', '/api/employee/policies', 200, wallet)).toEqual({ documented: true, errors: [] });
    expect(checkResponse(spec, 'get', '/api/employee/policies', 418, {}).documented).toBe(false);
    const integrationError = { success: false, code: 'INTEGRATION_NOT_CONFIGURED', message: 'Google Places & Geocoding is not configured.', retryable: false };
    expect(checkResponse(spec, 'get', '/api/addresses/autocomplete', 503, integrationError).errors).toEqual([]);
  });
});
