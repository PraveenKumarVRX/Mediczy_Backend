import { createCorporateEmployee, EmployeeConflictError } from '../services/corporate-employee-create.service.js';

const input = { corporateId: 7, employeeId: ' 12 ', name: 'latha k', email: 'Latha@Example.com', department: 'HR' };

/** Fake DB: `active` = rows already active, `inactive` = removed rows, with the ON CONFLICT ... WHERE isActive=false semantics. */
function fakeDb({ active = [], inactive = [] } = {}) {
  const calls = [];
  const query = async (sql, r) => {
    calls.push({ sql, r });
    if (/^\s*SELECT/i.test(sql)) {
      const hit = active.find((e) => e.email && e.email.toLowerCase() === r.email && e.employeeId !== r.employeeId);
      return [hit ? [{ employeeId: hit.employeeId }] : [], hit ? 1 : 0];
    }
    if (active.some((e) => e.employeeId === r.employeeId)) return [[], 0]; // conflict, WHERE false
    return [[{ employeeId: r.employeeId }], 1];
  };
  return { query, calls };
}

describe('createCorporateEmployee', () => {
  it('creates a new employee, trimming the id and lower-casing the email', async () => {
    const db = fakeDb();
    const e = await createCorporateEmployee(db.query, input);
    expect(e).toMatchObject({ employeeId: '12', email: 'latha@example.com', appStatus: 'not_invited' });
    expect(db.calls[1].r.employeeId).toBe('12');
  });

  it('refuses an employee ID that is already active (no silent overwrite)', async () => {
    const db = fakeDb({ active: [{ employeeId: '12', email: 'x@y.z' }] });
    await expect(createCorporateEmployee(db.query, input)).rejects.toMatchObject({ code: 'EMPLOYEE_EXISTS', statusCode: 409 });
  });

  it('refuses the same email on a different active employee', async () => {
    const db = fakeDb({ active: [{ employeeId: '5', email: 'latha@example.com' }] });
    const err = await createCorporateEmployee(db.query, input).catch((e) => e);
    expect(err).toBeInstanceOf(EmployeeConflictError);
    expect(err.code).toBe('EMPLOYEE_EMAIL_EXISTS');
    expect(err.message).toMatch(/ID 5/);
    expect(db.calls.length).toBe(1); // stopped before the insert
  });

  it('only updates an existing row when it was removed (guard is in the SQL)', async () => {
    const db = fakeDb({ inactive: [{ employeeId: '12' }] });
    await createCorporateEmployee(db.query, input);
    const insert = db.calls.find((c) => /INSERT INTO corporate_employees/.test(c.sql)).sql;
    expect(insert).toMatch(/WHERE corporate_employees\."isActive" = false/);
    expect(insert).toMatch(/RETURNING "employeeId"/);
  });

  it('skips the email check when no email is given', async () => {
    const db = fakeDb();
    await createCorporateEmployee(db.query, { ...input, email: '' });
    expect(db.calls.length).toBe(1);
  });
});
