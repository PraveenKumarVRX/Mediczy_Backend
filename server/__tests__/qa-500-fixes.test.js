import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

/**
 * Three endpoints a QA pass reported as 500. All three were the same fault
 * this codebase keeps producing: code written against column names the live
 * table does not have.
 */
describe('insurance providers', () => {
  const route = read('routes/insurance.route.js');
  const handler = route.slice(route.indexOf("router.get('/providers'"), route.indexOf("router.get('/policies/:providerId'"));

  it('asks for the columns insurance_providers actually has', () => {
    // It asked for "logo" and "supportedServices". The column is logoUrl and
    // there is no supportedServices at all, so every call answered 500.
    expect(handler).not.toMatch(/'logo'/);
    expect(handler).not.toMatch(/'supportedServices'/);
    expect(handler).toContain("'logoUrl'");
  });

  it('still answers under the names the clients already read', () => {
    expect(handler).toContain('logo: row.logoUrl');
    expect(handler).toContain('supportedServices:');
  });
});

describe('payment history', () => {
  const controller = read('controller/payment.controller.js');
  // Comments stripped: the handler's own notes name the old adapter and the
  // withheld columns, which is the point of them.
  const handler = controller
    .slice(controller.indexOf('async getTransactions('), controller.indexOf('Get a single transaction by ID'))
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('reads the table that exists', () => {
    // db.PaymentTransaction is an in-memory adapter whose backing map was
    // never initialised, and there is no payment_transactions table.
    expect(handler).toContain('FROM payments p');
    expect(handler).not.toContain('db.PaymentTransaction');
  });

  it('shows a member only their own payments', () => {
    // The crash was the only thing keeping this private: the route is gated by
    // authUser alone and the old handler filtered by nothing, so any logged-in
    // patient would have received every payment in the system.
    expect(handler).toContain('p."userId" = :userId');
    expect(handler).toMatch(/isAdmin/);
    expect(handler).toMatch(/if \(!isAdmin\) \{ filters\.push\('p\."userId" = :userId'\)/);
  });

  it('withholds the gateway signature and the raw gateway payload', () => {
    expect(handler).not.toContain('gatewaySignature');
    expect(handler).not.toContain('gatewayResponse');
  });

  it('bounds the page size', () => {
    expect(handler).toMatch(/Math\.min\(Math\.max\(parseInt\(req\.query\.limit, 10\) \|\| 100, 1\), 200\)/);
  });

  it('does not put the database error in the response', () => {
    expect(handler).toContain('Could not load payment history');
    expect(handler).not.toMatch(/error:\s*error\.message/);
  });
});

describe('hospital detail and the list fallback', () => {
  const route = read('routes/hospital.route.js');

  it('selects the columns the hospitals table really has', () => {
    // name / phone / mobile / entity_type / google_place_id / is_spn / active
    // do not exist; they are hospital_name, phone_number, network_type and
    // status. GET /api/hospitals/:id answered 500 for every integer id.
    // Four queries read this table: the detail route, the list's legacy
    // fallback, the place lookup and the SPN list. All four were wrong.
    expect((route.match(/hospital_name AS name/g) || []).length).toBe(4);
    expect(route).toContain('phone_number AS phone');
    expect(route).not.toMatch(/^\s+name,$/m);
    expect(route).not.toMatch(/^\s+(phone|mobile|entity_type|is_spn|active),$/m);
  });

  it('derives is_spn and active rather than selecting columns that are not there', () => {
    expect(route).toMatch(/network_type IS NOT NULL AND lower\(network_type\) <> 'none'/);
    expect(route).toMatch(/lower\(COALESCE\(status, 'active'\)\) = 'active'/);
  });

  it('searches and orders on real columns too', () => {
    expect(route).toContain('hospital_name ILIKE :search');
    expect(route).toContain('ORDER BY hospital_name');
    expect(route).not.toContain("AND is_spn = true'");
    expect(route).not.toMatch(/WHERE is_spn = true AND active = true/);
  });

  it('stops asking for a google_place_id column that is not there', () => {
    expect(route).not.toMatch(/WHERE google_place_id = :placeId/);
    expect(route).toContain("metadata->>'googlePlaceId' = :placeId");
  });
});

describe('the test-policy seed, borrowing an existing account', () => {
  const script = read('scripts/seed-test-group-policies.mjs');

  it('can attach to an account that already exists', () => {
    expect(script).toMatch(/arg\('employee'\)/);
    expect(script).toContain('using existing account');
  });

  it('refuses an account that is not on that corporate\'s roster', () => {
    // Attaching a family's insurance to an account off the roster would show
    // one company's cover inside another's.
    expect(script).toMatch(/is not an active employee of corporate/);
    expect(script).toContain("ua.role = 'employee' AND ua.status = 'active'");
  });

  it('leaves a borrowed account alone on --remove', () => {
    expect(script).toMatch(/metadata->>'seededBy' = :marker LIMIT 1/);
    expect(script).toMatch(/belongs\s*\n?\s*\/\/ to somebody else and must survive --remove/);
  });

  it('namespaces policy numbers by corporate, so two can hold a set at once', () => {
    expect(script).toMatch(/policyNumber: `TEST-C\$\{corporateId\}-GHI-001`/);
    expect(script).toMatch(/employeeCodeFor = \(corporateId\)/);
  });

  it('scopes the already-seeded guard and --remove by corporate', () => {
    expect(script).toContain('const findSeeded = async (corporateId = null)');
    expect(script).toContain('(:corporateId IS NULL OR "corporateId" = :corporateId)');
  });

  it('keeps the shared test insurer until no seeded policy points at it', () => {
    expect(script).toMatch(/if \(!stillUsed\) await exec\('DELETE FROM insurance_companies/);
  });
});
