/**
 * Find the account a corporate employee already has, before creating another.
 *
 * The bulk upload matched on email alone. Equitas changed its mail domain from
 * @equitasbank.com to @equitas.bank.in, and many of its older accounts carry a
 * placeholder address with the staff code inside it
 * (`pending+E12346@equitasbank.com`, `e60072@equitasbank.com`), so every
 * returning employee looked brand new: one upload created 367 second accounts
 * for people who already had one, 402 of them sharing a phone number with it.
 *
 * The employer's staff code is the authoritative key, so it is tried before the
 * address. An ambiguous match is REFUSED, never guessed — two accounts under
 * one code means a human must decide which survives, and picking wrongly
 * attaches a benefit to the account the employee cannot sign in to.
 */
import { postgresSequelize as db } from '../db/postgres-sequelize.js';

const select = (sql, replacements) => db.query(sql, { replacements, type: db.QueryTypes.SELECT });
const digits = (v) => String(v || '').replace(/\D/g, '');

export const MATCHED_BY = Object.freeze({
  EMAIL: 'email',
  EMPLOYEE_CODE: 'employee_code',
  CODE_IN_EMAIL: 'employee_code_in_email',
  PHONE: 'phone',
  NONE: null,
});

/**
 * @returns {Promise<{userId: number|null, matchedBy: string|null, candidates?: number[], ambiguous?: boolean}>}
 */
export async function findExistingEmployeeAccount({ corporateId, email, employeeCode, phone }) {
  const normalizedEmail = email ? String(email).trim().toLowerCase() : null;
  const code = employeeCode ? String(employeeCode).trim().toUpperCase() : null;
  const phoneDigits = digits(phone).slice(-10);

  // 1. Exact address — unchanged, and still the strongest signal when present.
  if (normalizedEmail) {
    const [hit] = await select(
      `SELECT id FROM users WHERE lower(email) = :email
       ORDER BY ("lastLoginAt" IS NOT NULL) DESC, id ASC LIMIT 1`, { email: normalizedEmail });
    if (hit) return { userId: hit.id, matchedBy: MATCHED_BY.EMAIL };
  }

  // 2. The staff code already on this corporate's roster, linked to an account.
  if (code && corporateId) {
    const rows = await select(
      `SELECT DISTINCT ce."userId" AS id FROM corporate_employees ce
        WHERE ce.corporate_id = :corporateId AND upper(btrim(ce."employeeId")) = :code AND ce."userId" IS NOT NULL`,
      { corporateId, code });
    if (rows.length === 1) return { userId: rows[0].id, matchedBy: MATCHED_BY.EMPLOYEE_CODE };
    if (rows.length > 1) return { userId: null, matchedBy: null, ambiguous: true, candidates: rows.map(r => r.id) };
  }

  // 3. The staff code inside an older placeholder address, among this
  //    corporate's own people — `pending+E12346@…` or `e60072@…`.
  if (code && corporateId) {
    const rows = await select(
      `SELECT DISTINCT u.id, (u."lastLoginAt" IS NOT NULL) AS has_logged_in FROM users u
         JOIN user_associations ua ON ua."userId" = u.id AND ua."entityType" = 'corporate'
          AND ua."entityId" = :corporateId AND ua.role = 'employee'
        WHERE u.email IS NOT NULL
          AND upper(regexp_replace(split_part(lower(u.email), '@', 1), '^pending\\+', '')) = :code
        ORDER BY has_logged_in DESC, u.id ASC`,
      { corporateId, code });
    if (rows.length === 1) return { userId: rows[0].id, matchedBy: MATCHED_BY.CODE_IN_EMAIL };
    if (rows.length > 1) return { userId: null, matchedBy: null, ambiguous: true, candidates: rows.map(r => r.id) };
  }

  // 4. Phone, among this corporate's own people only. Never across the whole
  //    user table — a shared family number would link the wrong person.
  if (phoneDigits.length === 10 && corporateId) {
    const rows = await select(
      `SELECT DISTINCT u.id FROM users u
         JOIN user_associations ua ON ua."userId" = u.id AND ua."entityType" = 'corporate'
          AND ua."entityId" = :corporateId AND ua.role = 'employee'
        WHERE right(regexp_replace(COALESCE(u."phoneNumber", ''), '\\D', '', 'g'), 10) = :phone`,
      { corporateId, phone: phoneDigits });
    if (rows.length === 1) return { userId: rows[0].id, matchedBy: MATCHED_BY.PHONE };
    if (rows.length > 1) return { userId: null, matchedBy: null, ambiguous: true, candidates: rows.map(r => r.id) };
  }

  return { userId: null, matchedBy: MATCHED_BY.NONE };
}

export default { findExistingEmployeeAccount, MATCHED_BY };
