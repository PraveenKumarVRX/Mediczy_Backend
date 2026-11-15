/**
 * Corporate family coverage tiers (owner decision 2026-11-15): where the tier is
 * read from on a plan, how plan editors' input is validated, and the family
 * notification lookup that used non-existent columns and ignored RLS.
 */
import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (file) => readFileSync(join(ROOT, file), 'utf8');

const query = jest.fn(async () => []);
const tx = { commit: jest.fn(async () => {}), rollback: jest.fn(async () => {}) };
const transaction = jest.fn(async () => tx);
const setRlsContext = jest.fn(async () => {});
jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({
  postgresSequelize: { query, transaction },
  default: { query, transaction },
}));
jest.unstable_mockModule('../middleware/rls-context.middleware.js', () => ({ setRlsContext }));

const {
  FAMILY_COVERAGE_VALUES,
  normalizeFamilyCoverage,
  familyCoverageOf,
  familyCoverageFromPlanBody,
  withFamilyCoverage,
  withoutFamilyCoverage,
} = await import('../utils/familyCoverage.js');
const { getFamilyContacts } = await import('../services/family-notification.service.js');

beforeEach(() => jest.clearAllMocks());

describe('coverage tier values', () => {
  test('the three tiers from the owner decision', () => {
    expect(FAMILY_COVERAGE_VALUES).toEqual(['employee', 'employee_spouse_children', 'employee_spouse_children_parents']);
  });

  test.each([
    ['employee', 'employee'],
    [' Employee_Spouse_Children ', 'employee_spouse_children'],
    ['employee spouse children parents', 'employee_spouse_children_parents'],
    ['', null],
    [null, null],
    ['family', undefined],
    [6, undefined],
  ])('%j -> %j', (input, expected) => {
    expect(normalizeFamilyCoverage(input)).toBe(expected);
  });
});

describe('reading the tier from a plan', () => {
  test('metadata.familyCoverage is canonical', () => {
    expect(familyCoverageOf({ metadata: { familyCoverage: 'employee_spouse_children' }, features: ['OPD'] })).toBe('employee_spouse_children');
  });

  test('features.familyCoverage is read when features is an object', () => {
    expect(familyCoverageOf({ metadata: {}, features: { familyCoverage: 'employee', opd: true } })).toBe('employee');
  });

  test('array features, a count, or an invalid value mean no tier', () => {
    expect(familyCoverageOf({ metadata: {}, features: ['OPD'] })).toBeNull();
    expect(familyCoverageOf({ metadata: {}, features: { familyMembers: 6 } })).toBeNull();
    expect(familyCoverageOf({ metadata: { familyCoverage: 'family-of-four' } })).toBeNull();
    expect(familyCoverageOf(null)).toBeNull();
  });

  test('JSON-string metadata (raw rows) is parsed', () => {
    expect(familyCoverageOf({ metadata: JSON.stringify({ familyCoverage: 'employee' }) })).toBe('employee');
  });
});

describe('plan editor input', () => {
  test('absent means "keep what is stored"', () => {
    expect(familyCoverageFromPlanBody({ planName: 'X', features: { opd: true } })).toEqual({ present: false });
  });

  test('top-level, metadata or features are accepted', () => {
    expect(familyCoverageFromPlanBody({ familyCoverage: 'employee' })).toEqual({ present: true, value: 'employee' });
    expect(familyCoverageFromPlanBody({ metadata: { familyCoverage: 'employee_spouse_children' } })).toEqual({ present: true, value: 'employee_spouse_children' });
    expect(familyCoverageFromPlanBody({ features: { familyCoverage: '' } })).toEqual({ present: true, value: null });
  });

  test('an unknown tier or conflicting values are refused', () => {
    expect(familyCoverageFromPlanBody({ familyCoverage: 'unlimited' }).error).toMatch(/familyCoverage must be one of/);
    expect(familyCoverageFromPlanBody({ familyCoverage: 'employee', metadata: { familyCoverage: 'employee_spouse_children' } }).error).toMatch(/conflicting/);
  });

  test('the tier is kept in metadata only', () => {
    expect(withFamilyCoverage({ a: 1 }, 'employee')).toEqual({ a: 1, familyCoverage: 'employee' });
    expect(withFamilyCoverage({ a: 1, familyCoverage: 'employee' }, null)).toEqual({ a: 1 });
    expect(withoutFamilyCoverage({ opd: true, familyCoverage: 'employee' })).toEqual({ opd: true });
    expect(withoutFamilyCoverage(['OPD'])).toEqual(['OPD']);
  });

  test('every plan create/edit route validates the tier', () => {
    const membership = src('routes/membership.route.js');
    const admin = src('routes/admin.route.js');
    expect(membership.match(/familyCoverageFromPlanBody\(req\.body\)/g)).toHaveLength(2);
    expect(admin.match(/familyCoverageFromPlanBody\(req\.body\)/g)).toHaveLength(2);
  });
});

describe('family notification contacts', () => {
  test('reads the real columns under the member RLS context', async () => {
    query.mockResolvedValueOnce([{ phone: '9876543210', name: 'Asha Rao', relationship: 'mother' }]);
    const rows = await getFamilyContacts(7646);

    expect(rows).toEqual([{ phone: '9876543210', name: 'Asha Rao', relationship: 'mother' }]);
    expect(setRlsContext).toHaveBeenCalledWith(tx, { orgId: 0, userId: 7646 });
    const [sql, opts] = query.mock.calls[0];
    expect(sql).toContain('"phoneNumber" AS phone');
    expect(sql).toContain('"userId" = :userId');
    expect(sql).toContain('"isActive" = true');
    expect(sql).not.toMatch(/\buser_id\b/);
    expect(opts).toMatchObject({ replacements: { userId: 7646 }, transaction: tx });
    expect(tx.commit).toHaveBeenCalledTimes(1);
  });

  test('no member id (unregistered ER patient) reads nothing', async () => {
    expect(await getFamilyContacts(0)).toEqual([]);
    expect(transaction).not.toHaveBeenCalled();
  });
});
