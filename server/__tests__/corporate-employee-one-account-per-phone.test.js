/**
 * One person, one employee account per corporate (2026-11-16).
 *
 * Dairy Day had 176 employee accounts for 162 people: the Team/Admin upload (22 Mar) and HR's roster upload
 * (25 Sep) each created an account for the same 14 people, because account lookup matched on email alone.
 * Every path that links an employee now goes through findExistingEmployeeAccount, and the database refuses a
 * second active employee account with the same phone in one corporate.
 */
import { jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({
  postgresSequelize: { query: jest.fn(async () => []), QueryTypes: { SELECT: 'SELECT' } },
}));
const { isOneAccountPerPhoneViolation, ONE_ACCOUNT_PER_PHONE } = await import('../services/corporate-employee-identity.service.js');
const migration = await import('../migrations/20261116000500-corporate-employee-one-account-per-phone.migration.js');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
/** The source of one route handler: from its declaration to the next top-level router call. */
const handler = (file, signature) => {
  const source = read(file);
  const start = source.indexOf(signature);
  expect(start).toBeGreaterThan(-1);
  const next = source.indexOf('\nrouter.', start + signature.length);
  return source.slice(start, next === -1 ? undefined : next);
};

describe('every path that links an employee looks for the existing account first', () => {
  it.each([
    ['routes/admin.route.js', "router.post('/corporate-employees'"],
    ['routes/corporate.route.js', "router.post('/employees'"],
    ['routes/corporate.route.js', "router.post('/employees/bulk-upload'"],
  ])('%s %s uses the shared matcher, not an email-only lookup', (file, signature) => {
    const body = handler(file, signature);
    expect(body).toContain('findExistingEmployeeAccount(');
    expect(body).toMatch(/identity\.ambiguous/);
    expect(body).not.toMatch(/SELECT id FROM users WHERE (lower\()?email\)? = :email/);
  });
});

describe('the one-account-per-phone database rule', () => {
  const run = async () => {
    const client = { query: jest.fn(async () => ({ rows: [] })) };
    await migration.up(client);
    return client.query.mock.calls.map(([sql]) => sql.replace(/\s+/g, ' ').trim());
  };

  it('runs inside the caller\'s transaction', async () => {
    expect((await run()).some((sql) => /^(BEGIN|COMMIT)/.test(sql))).toBe(false);
  });

  it('checks only links that become active employee links, so existing pairs can still be edited or merged', async () => {
    const sql = (await run()).join('\n');
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE OF status, role, "entityType", "entityId", "userId" ON user_associations/);
    expect(sql).toMatch(/IF TG_OP = 'UPDATE' AND OLD.status = 'active'.*RETURN NEW; -- already an active link/);
    expect(sql).toMatch(/NEW.status IS DISTINCT FROM 'active' THEN RETURN NEW/);
  });

  it('compares the last 10 digits within the same corporate and skips placeholder numbers', async () => {
    const sql = (await run()).join('\n');
    expect(sql).toContain('ua."entityId" = NEW."entityId"');
    expect(sql).toContain("right(regexp_replace(COALESCE(u.\"phoneNumber\", ''), '\\D', '', 'g'), 10) = phone");
    expect(sql).toContain("phone ~ '^(\\d)\\1{9}$'");
  });

  it('raises a unique violation the routes can recognise', async () => {
    const sql = (await run()).join('\n');
    expect(sql).toContain(`USING ERRCODE = 'unique_violation', CONSTRAINT = '${ONE_ACCOUNT_PER_PHONE}'`);
  });
});

describe('recognising the rule\'s error', () => {
  const pg = { code: '23505', constraint: 'one_employee_account_per_phone', message: 'Phone number ending 1553 already belongs to employee account 7204' };
  it.each([
    ['raw pg error', pg],
    ['Sequelize error (original)', { name: 'SequelizeUniqueConstraintError', original: pg }],
    ['Sequelize error (parent)', { parent: pg }],
  ])('recognises the %s', (_label, error) => expect(isOneAccountPerPhoneViolation(error)).toBe(true));

  it('does not confuse it with the employee-ID unique index', () => {
    expect(isOneAccountPerPhoneViolation({ original: { code: '23505', constraint: 'unique_corporate_employee' } })).toBe(false);
    expect(isOneAccountPerPhoneViolation(null)).toBe(false);
  });
});
