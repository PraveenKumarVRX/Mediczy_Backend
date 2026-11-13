import { jest } from '@jest/globals';

const dbQuery = jest.fn();
jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({
  postgresSequelize: { query: dbQuery, QueryTypes: { SELECT: 'SELECT' } },
}));
const { findExistingEmployeeAccount, MATCHED_BY } = await import('../services/corporate-employee-identity.service.js');

const CORP = 5;
/** Answer each lookup in order: email, roster code, code-in-email, phone. */
const arm = (...responses) => {
  dbQuery.mockReset();
  for (const r of responses) dbQuery.mockImplementationOnce(async () => r);
  dbQuery.mockImplementation(async () => []);
};

describe('finding the account an employee already has', () => {
  it('matches an exact address first', async () => {
    arm([{ id: 42 }]);
    expect(await findExistingEmployeeAccount({ corporateId: CORP, email: 'A.B@Equitas.Bank.In', employeeCode: 'E1' }))
      .toEqual({ userId: 42, matchedBy: MATCHED_BY.EMAIL });
    expect(dbQuery.mock.calls[0][1].replacements.email).toBe('a.b@equitas.bank.in');
  });

  it('falls back to the staff code on the roster', async () => {
    arm([], [{ id: 77 }]);
    expect(await findExistingEmployeeAccount({ corporateId: CORP, email: 'new@equitas.bank.in', employeeCode: 'e12346' }))
      .toEqual({ userId: 77, matchedBy: MATCHED_BY.EMPLOYEE_CODE });
    expect(dbQuery.mock.calls[1][1].replacements.code).toBe('E12346');
  });

  it('finds the staff code inside an older placeholder address', async () => {
    // This is the case that was missed: pending+E12346@equitasbank.com and
    // e60072@equitasbank.com, after the employer changed mail domain.
    arm([], [], [{ id: 423, has_logged_in: false }]);
    expect(await findExistingEmployeeAccount({ corporateId: CORP, email: 'abhishekjbr@equitas.bank.in', employeeCode: 'E12346' }))
      .toEqual({ userId: 423, matchedBy: MATCHED_BY.CODE_IN_EMAIL });
    const [sql] = dbQuery.mock.calls[2];
    expect(sql).toContain('pending');
    expect(sql).toContain("ua.\"entityId\" = :corporateId");
  });

  it('falls back to phone, scoped to this corporate only', async () => {
    arm([], [], [{ id: 900 }]);
    const r = await findExistingEmployeeAccount({ corporateId: CORP, email: null, employeeCode: 'E9', phone: '+91 98843 61137' });
    expect(r).toEqual({ userId: 900, matchedBy: MATCHED_BY.PHONE });
    const phoneCall = dbQuery.mock.calls.find(([sql]) => /right\(regexp_replace/.test(sql));
    expect(phoneCall[1].replacements.phone).toBe('9884361137');
    // Never the whole users table: a shared family number would link the wrong person.
    expect(phoneCall[0]).toContain('user_associations');
  });

  it('refuses an ambiguous staff code rather than guessing a survivor', async () => {
    arm([], [{ id: 1 }, { id: 2 }]);
    expect(await findExistingEmployeeAccount({ corporateId: CORP, employeeCode: 'E1' }))
      .toEqual({ userId: null, matchedBy: null, ambiguous: true, candidates: [1, 2] });
  });

  it('refuses an ambiguous placeholder match too', async () => {
    arm([], [{ id: 848 }, { id: 1734 }]);
    const r = await findExistingEmployeeAccount({ corporateId: CORP, employeeCode: 'E65681' });
    expect(r.ambiguous).toBe(true);
    expect(r.candidates).toEqual([848, 1734]);
  });

  it('reports no match rather than inventing one', async () => {
    arm([], [], [], []);
    expect(await findExistingEmployeeAccount({ corporateId: CORP, email: 'brand.new@equitas.bank.in', employeeCode: 'E999', phone: '9000000001' }))
      .toEqual({ userId: null, matchedBy: null });
  });

  it('ignores a phone that is not 10 digits', async () => {
    arm([], []);
    await findExistingEmployeeAccount({ corporateId: CORP, employeeCode: 'E1', phone: '12345' });
    // roster code + code-in-email only; no email given and the phone is too short
    expect(dbQuery.mock.calls).toHaveLength(2);
    expect(dbQuery.mock.calls.some(([sql]) => /right\(regexp_replace/.test(sql))).toBe(false);
  });

  it('does nothing dangerous without a corporate id', async () => {
    arm([]);
    const r = await findExistingEmployeeAccount({ email: 'x@y.com', employeeCode: 'E1', phone: '9000000001' });
    expect(r.userId).toBeNull();
    // only the email lookup may run; code and phone lookups are corporate-scoped
    expect(dbQuery.mock.calls).toHaveLength(1);
  });
});
