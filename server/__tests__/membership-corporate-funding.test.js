/**
 * syncUserStatusWithMembership — who keeps their account overnight.
 *
 * Policy: every account needs a membership to use the app, and a corporate
 * employee's membership IS their employer's corporate plan.
 *
 * The nightly sync (membership-cron.service.js, 0 2 * * *) writes users.status,
 * which patient login filters on (status='active'). It only ever looked at
 * user_plans, so 864 funded corporate employees were flipped to 'inactive' and
 * could no longer log in — while validateMembership() in the same file had
 * always honoured corporate funding. These tests pin the two sources of
 * membership against each other.
 */
import { jest } from '@jest/globals';

const planFindOne = jest.fn();
const userFindOne = jest.fn();
const userUpdate = jest.fn();
const sequelizeQuery = jest.fn();
const auditAccountStatusTransition = jest.fn();

jest.unstable_mockModule('../models/postgres/membershipPlan.model.postgres.js', () => ({
  UserPlan: { findOne: planFindOne },
  MembershipPlan: {},
}));
jest.unstable_mockModule('../models/user.model.intelligent.js', () => ({
  default: { findOne: userFindOne, update: userUpdate },
}));
jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({
  postgresSequelize: { query: sequelizeQuery, QueryTypes: { SELECT: 'SELECT' } },
}));
jest.unstable_mockModule('../middleware/audit.middleware.js', () => ({
  auditAccountStatusTransition,
  auditLoginAttempt: jest.fn(),
}));

const { syncUserStatusWithMembership } = await import('../middleware/membership.middleware.js');

/** `activeCorporateEmployee` returns truthy when the roster query finds a row. */
const corporateRoster = (found) => sequelizeQuery.mockResolvedValue(found ? [{ '?column?': 1 }] : []);

beforeEach(() => {
  planFindOne.mockReset();
  userFindOne.mockReset().mockResolvedValue({ status: 'inactive', email: 'u@example.com', metadata: {} });
  userUpdate.mockReset().mockResolvedValue([1]);
  sequelizeQuery.mockReset();
  auditAccountStatusTransition.mockReset();
});

describe('membership sync: who stays active', () => {
  test('an individual with a paid plan stays active', async () => {
    planFindOne.mockResolvedValue({ id: 1 });
    corporateRoster(false);
    const result = await syncUserStatusWithMembership(42);
    expect(result).toMatchObject({ status: 'active', hasActivePlan: true });
    expect(userUpdate).toHaveBeenCalledWith({ status: 'active' }, { where: { id: 42 } });
  });

  test('a corporate employee with NO individual plan stays active — the employer funds them', async () => {
    planFindOne.mockResolvedValue(null);
    corporateRoster(true);
    const result = await syncUserStatusWithMembership(6456);
    expect(result).toMatchObject({ status: 'active', corporateFunded: true });
    expect(userUpdate).toHaveBeenCalledWith({ status: 'active' }, { where: { id: 6456 } });
  });

  test('the corporate activation is audited as CORPORATE_PLAN, not a personal membership', async () => {
    planFindOne.mockResolvedValue(null);
    corporateRoster(true);
    await syncUserStatusWithMembership(6456);
    expect(auditAccountStatusTransition).toHaveBeenCalled();
    const [, detail] = auditAccountStatusTransition.mock.calls[0];
    expect(detail.reasonCode).toBe('CORPORATE_PLAN');
    expect(detail.toStatus).toBe('active');
  });

  test('an individual with no plan and no employer is deactivated — the policy still applies', async () => {
    planFindOne.mockResolvedValue(null);
    corporateRoster(false);
    const result = await syncUserStatusWithMembership(99);
    expect(result).toMatchObject({ status: 'inactive', hasActivePlan: false });
    expect(userUpdate).toHaveBeenCalledWith({ status: 'inactive' }, { where: { id: 99 } });
  });

  test('an individual plan short-circuits the corporate lookup — no wasted roster query', async () => {
    planFindOne.mockResolvedValue({ id: 1 });
    corporateRoster(true);
    await syncUserStatusWithMembership(7);
    expect(sequelizeQuery).not.toHaveBeenCalled();
  });

  test('a managed service account survives with neither plan nor employer', async () => {
    // The app-store reviewer login holds no membership by design.
    userFindOne.mockResolvedValue({ status: 'inactive', email: 'play.reviewer@mysmarthealth.in', metadata: { purpose: 'app-store-review', doNotDelete: true } });
    planFindOne.mockResolvedValue(null);
    corporateRoster(false);
    const result = await syncUserStatusWithMembership(7639);
    expect(result).toMatchObject({ status: 'active', renewalExempt: true });
    expect(planFindOne).not.toHaveBeenCalled();
  });
});

/**
 * The roster join, pinned at the SQL level.
 *
 * `activeCorporateEmployee` once INNER JOINed corporate_employees on top of the
 * employee association. corporate_employees is the HR roster and is populated
 * inconsistently: Equitas Bank Ltd had 3,840 active employee associations and
 * zero roster rows, so every one of its employees failed the check and the
 * nightly sync flipped 3,839 of them to 'inactive' — locked out of login
 * entirely. Across all corporates the inner join denied 3,858 of 5,489 real
 * employees.
 *
 * The roster must therefore only ever EXCLUDE (HR explicitly marked the
 * employee inactive), never be required to include. These assert the query
 * shape because that is precisely what regressed; the mock above cannot
 * exercise join semantics.
 */
describe('the corporate roster is consulted only to exclude', () => {
  const rosterQuery = async () => {
    planFindOne.mockResolvedValue(null);
    sequelizeQuery.mockReset().mockResolvedValue([]);
    await syncUserStatusWithMembership(1234);
    expect(sequelizeQuery).toHaveBeenCalled();
    return String(sequelizeQuery.mock.calls[0][0]);
  };

  test('corporate_employees is LEFT JOINed, never INNER JOINed', async () => {
    const sql = await rosterQuery();
    expect(sql).toMatch(/LEFT JOIN\s+corporate_employees/i);
    expect(sql).not.toMatch(/(?<!LEFT )\bJOIN\s+corporate_employees/i);
  });

  test('a corporate with no roster row still counts as sponsored', async () => {
    // COALESCE(ce."isActive", true) is what makes a missing roster row pass.
    const sql = await rosterQuery();
    expect(sql).toMatch(/COALESCE\(\s*ce\."isActive"\s*,\s*true\s*\)\s*=\s*true/i);
  });

  test('the employee association is still the required signal', async () => {
    const sql = await rosterQuery();
    expect(sql).toMatch(/ua\."entityType"\s*=\s*'corporate'/i);
    expect(sql).toMatch(/ua\.role\s*=\s*'employee'/i);
    expect(sql).toMatch(/ua\.status\s*=\s*'active'/i);
    // ...against a corporate that is itself active.
    expect(sql).toMatch(/LOWER\(c\.status\)\s*=\s*'active'/i);
  });
});
