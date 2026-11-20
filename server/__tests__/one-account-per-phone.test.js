/**
 * One member account per phone number (owner decision 2026-11-20). The 847 same-person
 * duplicates were merged; a trigger refuses new ones for member accounts, staff logins and
 * hospital patient records are exempt, and the 25 legitimately shared numbers are grandfathered.
 */
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const migration = read('../migrations/20261120000500-users-one-member-account-per-phone.migration.js');

describe('database rule', () => {
  test('refuses a second live member account on the same last 10 digits', async () => {
    const { up } = await import('../migrations/20261120000500-users-one-member-account-per-phone.migration.js');
    const sql = [];
    await up({ query: async (q) => { sql.push(q); return { rows: [] }; } });
    const fn = sql.find((q) => q.includes('CREATE OR REPLACE FUNCTION users_one_member_account_per_phone'));
    expect(fn).toContain("CONSTRAINT = 'users_one_account_per_phone'");
    expect(fn).toContain("ERRCODE = 'unique_violation'");
    expect(fn).toContain("role IN ('user', 'patient') AND status <> 'deleted'");
    expect(sql.some((q) => q.includes('BEFORE INSERT OR UPDATE OF "phoneNumber", role, status ON users'))).toBe(true);
    expect(sql.some((q) => q.includes('CREATE INDEX IF NOT EXISTS users_phone_last10_idx'))).toBe(true);
  });

  test('covers members of both roles; staff, blank and all-zero numbers are not checked', () => {
    expect(migration).toContain("NEW.role NOT IN ('user', 'patient') OR COALESCE(NEW.\"isTeam\", false) OR COALESCE(NEW.\"isAdmin\", false)");
    expect(migration).toContain("length(p) < 10 OR p ~ '^0+$'");
  });

  test('a status flip on a grandfathered shared number is not re-checked (nightly sync)', () => {
    expect(migration).toContain("AND OLD.role IN ('user', 'patient') AND OLD.status IS DISTINCT FROM 'deleted' THEN");
  });
});

describe('application paths', () => {
  const route = read('../routes/user.route.js');
  const controller = read('../controller/user.controller.js');

  test('app sign-up refuses a number already on a member account with a clear 409', () => {
    expect(route).toContain('if (await findMemberByPhone(phoneNumber)) return res.status(409).json(PHONE_TAKEN);');
    expect(route).toContain('if (isPhoneTakenError(error)) return res.status(409).json(PHONE_TAKEN);');
    expect(route).toContain("code: 'PHONE_ALREADY_REGISTERED'");
  });

  test('web registration checks the same last-10-digit rule', () => {
    expect(controller).toMatch(/const digits = String\(phoneNumber\)\.replace\(\/\\D\/g, ''\)\.slice\(-10\);/);
  });

  test('phone sign-in matches the last 10 digits, so +91 numbers sign in', () => {
    expect(controller).toContain('fn("right", fn("regexp_replace", col("phoneNumber"), "[^0-9]", "", "g"), 10)');
  });

  test('phone sign-in picks the account the password fits when a number is shared', () => {
    const phoneBranch = controller.slice(controller.indexOf('} else if (phoneNumber) {'), controller.indexOf('} else if (corporateEmployeeUid) {'));
    expect(phoneBranch).toContain('User.findAll(');
    expect(phoneBranch).toMatch(/for \(const candidate of candidates\)[\s\S]*candidate\.comparePassword\(password\)/);
    expect(phoneBranch).not.toContain('User.findOne(');
  });
});
