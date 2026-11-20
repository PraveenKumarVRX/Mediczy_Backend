/**
 * user@mediczy.com and User@mediczy.com are two accounts. Login matches emails without
 * case and used findOne, so it signed in against whichever row Postgres returned first
 * and refused the correct password of the other. Login must try every case-insensitive
 * match and take the one the password fits.
 */
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../controller/user.controller.js', import.meta.url), 'utf8');
const signIn = source.slice(source.indexOf('export async function signInUser'), source.indexOf('const isPasswordValid = await user.comparePassword(password)'));

describe('password login with an email shared by two accounts', () => {
  test('looks up every case-insensitive match, not just the first row', () => {
    const emailBranch = signIn.slice(signIn.indexOf('if (email) {'), signIn.indexOf('} else if (phoneNumber) {'));
    expect(emailBranch).toContain('User.findAll(');
    expect(emailBranch).not.toContain('User.findOne(');
    expect(emailBranch).toContain('sequelizeWhere(fn("lower", col("email")), email)');
  });

  test('chooses the account the password fits, in a fixed order otherwise', () => {
    const emailBranch = signIn.slice(signIn.indexOf('if (email) {'), signIn.indexOf('} else if (phoneNumber) {'));
    expect(emailBranch).toMatch(/for \(const candidate of candidates\)[\s\S]*candidate\.comparePassword\(password\)/);
    expect(emailBranch).toContain('order: [["lastLoginAt", "DESC NULLS LAST"], ["id", "ASC"]]');
  });

  test('sign-up and OTP find an existing account whatever the email case', () => {
    const route = readFileSync(new URL('../routes/user.route.js', import.meta.url), 'utf8');
    expect(route).toContain('sequelizeWhere(fn("lower", col("email")), normalizeEmail(value))');
    expect(route).not.toMatch(/userModel\.findOne\(\{ where: \{ email(: identifier)? \} \}\)/);
  });

  test('the database refuses a second account for the same email in another case', async () => {
    const { up } = await import('../migrations/20261120000100-users-email-unique-ignoring-case.migration.js');
    const sql = [];
    const client = { query: async (q) => { sql.push(q); return { rows: sql.length === 1 ? [] : [] }; } };
    await up(client);
    expect(sql.at(-1)).toContain('CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key ON users (lower(email))');

    const blocked = { query: async () => ({ rows: [{ email: 'user@example.invalid', accounts: 2 }] }) };
    await expect(up(blocked)).rejects.toThrow('merge them first');
  });
});

