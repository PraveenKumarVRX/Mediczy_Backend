/**
 * Corporate employee account activation — fixes "Account is inactive" at login
 * for HR-onboarded employees whose users.status was never set to active.
 */
import pool from '../db/pgPool.js';

/**
 * Returns true if user is an active corporate employee (HR roster / association).
 */
export async function hasActiveCorporateEmployment(userId) {
  if (!userId) return false;
  const { rows } = await pool.query(
    `SELECT 1
       FROM user_associations ua
       JOIN corporates c ON c.id = ua."entityId" AND LOWER(c.status) = 'active'
      WHERE ua."userId" = $1
        AND ua."entityType" = 'corporate'
        AND ua.role = 'employee'
        AND ua.status = 'active'
      LIMIT 1`,
    [userId]
  );
  return rows.length > 0;
}

/**
 * Idempotent activation: users.status, association, corporate_employees, corporate subscription.
 */
export async function reactivateCorporateEmployeeAccount(userId, { client = null } = {}) {
  if (!userId) {
    return { success: false, reason: 'missing_user_id' };
  }

  const q = client
    ? (text, params) => client.query(text, params)
    : (text, params) => pool.query(text, params);

  const { rows: links } = await q(
    `SELECT ua."entityId" AS corporate_id
       FROM user_associations ua
       JOIN corporates c ON c.id = ua."entityId" AND LOWER(c.status) = 'active'
      WHERE ua."userId" = $1
        AND ua."entityType" = 'corporate'
        AND ua.role = 'employee'
        AND ua.status = 'active'
      ORDER BY ua."createdAt" DESC
      LIMIT 1`,
    [userId]
  );

  if (!links.length) {
    return { success: false, reason: 'not_active_corporate_employee' };
  }

  const corporateId = links[0].corporate_id;

  await q(
    `UPDATE users
        SET status = 'active',
            "isCorporate" = true,
            "isVerified" = COALESCE("isVerified", true),
            "updatedAt" = NOW()
      WHERE id = $1`,
    [userId]
  );

  await q(
    `UPDATE user_associations
        SET status = 'active', "updatedAt" = NOW()
      WHERE "userId" = $1 AND "entityType" = 'corporate' AND role = 'employee'`,
    [userId]
  );

  await q(
    `UPDATE corporate_employees
        SET "isActive" = true, "updatedAt" = NOW()
      WHERE "userId" = $1 AND corporate_id = $2`,
    [userId, corporateId]
  );

  await q(
    `UPDATE user_subscriptions us
        SET status = 'ACTIVE', updated_at = NOW()
      WHERE us.user_id = $1
        AND us.id = (
          SELECT us2.id
            FROM user_subscriptions us2
            JOIN subscription_plans sp ON sp.id = us2.plan_id
           WHERE us2.user_id = $1
             AND sp.type = 'CORPORATE'
             AND (sp.metadata->>'corporateId')::int = $2
           ORDER BY us2.updated_at DESC NULLS LAST
           LIMIT 1
        )`,
    [userId, corporateId]
  );

  const { rows: after } = await q(
    `SELECT id, email, status, "isCorporate" FROM users WHERE id = $1`,
    [userId]
  );

  return {
    success: true,
    reason: 'activated',
    corporateId,
    user: after[0] || null,
  };
}

/**
 * Before login inactive guard — auto-fix HR-onboarded corporate employees.
 */
export async function tryAutoActivateCorporateEmployeeForLogin(user) {
  if (!user?.id) return { activated: false };
  if (user.status === 'active') return { activated: false, alreadyActive: true };

  const isCorporate = user.isCorporate === true || await hasActiveCorporateEmployment(user.id);
  if (!isCorporate) return { activated: false, reason: 'not_corporate' };

  const result = await reactivateCorporateEmployeeAccount(user.id);
  if (result.success) {
    user.status = 'active';
    user.isCorporate = true;
    return { activated: true, corporateId: result.corporateId };
  }
  return { activated: false, reason: result.reason };
}

/**
 * Lookup user by email or corporate employee ID and reactivate.
 */
export async function reactivateCorporateEmployeeByIdentifier({ email, employeeId, corporateId } = {}) {
  let userRow = null;

  if (email) {
    const { rows } = await pool.query(
      `SELECT id, email, status FROM users WHERE lower(email) = lower($1) LIMIT 1`,
      [String(email).trim()]
    );
    userRow = rows[0] || null;
  }

  if (!userRow && employeeId) {
    const params = [String(employeeId).trim()];
    let corpFilter = '';
    if (corporateId) {
      corpFilter = ' AND ua."entityId" = $2';
      params.push(corporateId);
    }
    const { rows } = await pool.query(
      `SELECT DISTINCT u.id, u.email, u.status
         FROM users u
         LEFT JOIN corporate_employees ce ON ce."userId" = u.id
         LEFT JOIN user_associations ua ON ua."userId" = u.id AND ua."entityType" = 'corporate'
        WHERE lower(coalesce(u.employee_id, '')) = lower($1)
           OR lower(coalesce(ce."employeeId", '')) = lower($1)
           OR lower(coalesce(ua.metadata->>'employeeId', '')) = lower($1)
           ${corpFilter}
        LIMIT 2`,
      params
    );
    if (rows.length > 1) {
      return { success: false, reason: 'ambiguous_employee_id', matches: rows };
    }
    userRow = rows[0] || null;
  }

  if (!userRow) {
    return { success: false, reason: 'user_not_found' };
  }

  const result = await reactivateCorporateEmployeeAccount(userRow.id);
  return { ...result, lookedUp: { email: userRow.email, previousStatus: userRow.status } };
}

export default {
  hasActiveCorporateEmployment,
  reactivateCorporateEmployeeAccount,
  tryAutoActivateCorporateEmployeeForLogin,
  reactivateCorporateEmployeeByIdentifier,
};
