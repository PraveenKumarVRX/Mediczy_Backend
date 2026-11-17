/**
 * Nightly reset of the shared sales demo login(s) (users.metadata.demoAccount = true).
 *
 * Prospects book check-ups, consultations, lab tests and medicines, add family members, chat with the AI,
 * log activity and register their phones for push. Overnight all of that is cleared and the account goes
 * back to the baseline captured right after setup (scripts/demo/setup-corporate-demo-employee.mjs), so
 * the next prospect starts clean, can book the check-up again, and never sees the previous prospect's
 * chats, entries or bookings.
 *
 * Kept as set up (never cleared): corporate roster + sponsorship link, plan subscription, check-up
 * entitlement (re-opened), group policy membership, wallet (restored), audit and activity logs.
 *
 * Every delete is keyed on a column that holds a users.id (entity UID rule: an integer is private to its
 * own table). lab_orders.patient_id holds a users.id only for corporate check-ups; hospital paths store
 * patients.id there, so only that category is touched. notifications, AI and push rows are limited to
 * the patient/user kinds because their user id column is shared with doctors.
 *
 * All of one account's reset runs in one RLS transaction (platform-admin context, as family_members,
 * appointments and lab_orders FORCE row-level security): it either all applies or none of it does.
 * Dry run by default: the transaction is rolled back and the counts are what would have been cleared.
 */
import pool from '../db/pgPool.js';
import { withRlsTransaction } from '../middleware/rls-context.middleware.js';

const DEMO_APPT = `(SELECT id FROM appointments WHERE "userId" = $1)`;
const DEMO_CONV = `(SELECT id FROM ai_brain_conversations WHERE user_id = $1 AND user_type IN ('patient','user'))`;
const DEMO_ORDER = `(SELECT id FROM orders WHERE "userId" = $1)`;
const DEMO_LAB_ORDER = `(SELECT id FROM lab_orders WHERE patient_id = $1 AND test_category = 'corporate_health_checkup')`;

/** Cleared in this order (children before the rows their foreign keys point at). */
export const DEMO_RESET_CLEARS = [
  // Anything a doctor wrote against a demo appointment (hidden from doctors, but possible).
  { table: 'clinical_notes', where: `"appointmentId" IN ${DEMO_APPT}` },
  { table: 'patient_notes', where: `"appointmentId" IN ${DEMO_APPT}` },
  { table: 'medical_records', where: `appointment_id IN ${DEMO_APPT}` },
  { table: 'queue_entries', where: `"appointmentId" IN ${DEMO_APPT}` },
  { table: 'revenue_insights', where: `"appointmentId" IN ${DEMO_APPT}` },
  { table: 'appointments', where: `"userId" = $1` },
  // Check-ups, lab tests and their reports.
  { table: 'corporate_health_reports', where: `employee_id = $1 OR lab_order_id IN ${DEMO_LAB_ORDER}` },
  { table: 'lab_orders', where: `patient_id = $1 AND test_category = 'corporate_health_checkup'` },
  { table: 'reports', where: `"userId" = $1` },
  { table: 'lab_tests', where: `"userId" = $1` },
  { table: 'health_checkup_bookings', where: `user_id = $1` },
  // Medicine orders (invoices and payments cascade).
  { table: 'transactions', where: `"orderId" IN ${DEMO_ORDER}` },
  { table: 'orders', where: `"userId" = $1` },
  // What the previous prospect typed or logged.
  { table: 'ai_tool_executions', where: `conversation_id IN ${DEMO_CONV}` },
  { table: 'ai_brain_conversations', where: `user_id = $1 AND user_type IN ('patient','user')` },
  { table: 'ai_user_memory', where: `user_id = $1 AND user_type IN ('patient','user')` },
  { table: 'health_data', where: `user_id = $1` },
  { table: 'daily_activity', where: `user_id = $1` },
  { table: 'health_diary', where: `"userId" = $1` },
  { table: 'user_goal_progress', where: `user_id = $1` },
  { table: 'user_health_assessments', where: `user_id = $1` },
  { table: 'health_coins_transactions', where: `"userId" = $1` },
  { table: 'notifications', where: `"userId" = $1 AND "userType" IN ('patient','user')` },
  // Yesterday's prospects' phones stop receiving the demo account's pushes.
  { table: 'fcm_tokens', where: `"userId" = $1 AND COALESCE("userType", 'patient') IN ('patient','user')` },
];

/** Tables that point at users and are deliberately left as they are. */
export const DEMO_RESET_KEEPS = new Set([
  'users', 'corporate_employees', 'user_associations', 'user_subscriptions', 'user_health_packages',
  'user_wallets', 'policy_members', 'family_members', 'referral_codes',
  'audit_logs', 'user_activity_logs', 'ai_rag_query_logs', 'ai_doctor_metrics', 'notification_preferences',
]);

const FAMILY_SNAPSHOT_SQL = `SELECT * FROM family_members WHERE "userId" = $1 ORDER BY id`;

async function demoAccounts(client, onlyUserId) {
  const { rows } = await client.query(
    `SELECT id, metadata FROM users WHERE metadata->>'demoAccount' = 'true' ${onlyUserId ? 'AND id = $1' : ''} ORDER BY id`,
    onlyUserId ? [onlyUserId] : []
  );
  return rows;
}

/** Records the account as it is now (family, wallet, entitlements) as the state every reset returns to. */
async function captureBaseline(client, user) {
  const family = (await client.query(FAMILY_SNAPSHOT_SQL, [user.id])).rows;
  const [wallet] = (await client.query(
    `SELECT balance, "totalEarned", "totalSpent", "totalPurchased", "streakDays", "lastActivityDate", metadata, "isActive"
       FROM user_wallets WHERE "userId" = $1`, [user.id])).rows;
  const packages = (await client.query(`SELECT id FROM user_health_packages WHERE "userId" = $1`, [user.id])).rows.map((r) => r.id);
  const baseline = { capturedAt: new Date().toISOString(), family, wallet: wallet || null, healthPackageIds: packages };
  await client.query(
    `UPDATE users SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('demoBaseline', $2::jsonb) WHERE id = $1`,
    [user.id, JSON.stringify(baseline)]
  );
  return { family: family.length, wallet: !!wallet, healthPackages: packages.length };
}

export async function resetOne(client, user) {
  const baseline = user.metadata?.demoBaseline;
  if (!baseline || !Array.isArray(baseline.family)) {
    return { userId: user.id, skipped: 'no baseline captured; run scripts/demo/reset-demo-account.mjs --capture-baseline --apply' };
  }
  const cleared = {};
  for (const { table, where } of DEMO_RESET_CLEARS) {
    const { rowCount } = await client.query(`DELETE FROM ${table} WHERE ${where}`, [user.id]);
    if (rowCount) cleared[table] = rowCount;
  }

  // Family back to exactly the baseline rows, same ids (anything keyed on a family member id stays valid).
  const { rowCount: familyRemoved } = await client.query(`DELETE FROM family_members WHERE "userId" = $1`, [user.id]);
  if (baseline.family.length) {
    await client.query(
      `INSERT INTO family_members SELECT * FROM jsonb_populate_recordset(NULL::family_members, $1::jsonb)`,
      [JSON.stringify(baseline.family)]
    );
  }

  // The check-up can be booked again; the wallet shows what it showed after setup.
  const { rowCount: packagesReopened } = await client.query(
    `UPDATE user_health_packages SET "usedAt" = NULL, status = 'active', "updatedAt" = NOW()
      WHERE "userId" = $1 AND id = ANY($2::int[]) AND ("usedAt" IS NOT NULL OR status <> 'active')`,
    [user.id, baseline.healthPackageIds || []]
  );
  if (baseline.wallet) {
    const w = baseline.wallet;
    await client.query(
      `UPDATE user_wallets SET balance = $2, "totalEarned" = $3, "totalSpent" = $4, "totalPurchased" = $5, "streakDays" = $6,
              "lastActivityDate" = $7, metadata = $8::jsonb, "isActive" = $9, "updatedAt" = NOW() WHERE "userId" = $1`,
      [user.id, w.balance, w.totalEarned, w.totalSpent, w.totalPurchased, w.streakDays, w.lastActivityDate,
        JSON.stringify(w.metadata ?? {}), w.isActive ?? true]
    );
  }
  return { userId: user.id, cleared, family: { removed: familyRemoved, restored: baseline.family.length }, packagesReopened };
}

/**
 * Tables with a foreign key to users that still hold rows for the account and that this reset neither
 * clears nor keeps on purpose: a feature added after this was written. Reported, never touched.
 */
async function unhandledTables(client, userId) {
  const handled = new Set([...DEMO_RESET_CLEARS.map((c) => c.table), ...DEMO_RESET_KEEPS]);
  const { rows: fks } = await client.query(
    `SELECT DISTINCT cl.relname AS t, a.attname AS col
       FROM pg_constraint con JOIN pg_class cl ON cl.oid = con.conrelid
       JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = con.conkey[1]
      WHERE con.contype = 'f' AND con.confrelid = 'public.users'::regclass AND array_length(con.conkey, 1) = 1
        AND cl.relkind = 'r' AND cl.relname NOT LIKE 'backup\\_%'`
  );
  const found = [];
  for (const { t, col } of fks) {
    if (handled.has(t)) continue;
    await client.query('SAVEPOINT demo_scan');
    try {
      const { rows } = await client.query(`SELECT EXISTS (SELECT 1 FROM "${t}" WHERE "${col}" = $1) AS hit`, [userId]);
      if (rows[0].hit) found.push(`${t}.${col}`);
      await client.query('RELEASE SAVEPOINT demo_scan');
    } catch {
      await client.query('ROLLBACK TO SAVEPOINT demo_scan');
    }
  }
  return found;
}

class DemoResetDryRun extends Error {
  constructor(result) { super('dry run'); this.result = result; }
}

/**
 * @param {{apply?: boolean, captureBaseline?: boolean, userId?: number}} options
 * @returns {Promise<{applied: boolean, accounts: object[]}>}
 */
export async function resetDemoAccounts({ apply = false, captureBaseline: capture = false, userId = null } = {}) {
  const ids = (await pool.query(
    `SELECT id FROM users WHERE metadata->>'demoAccount' = 'true' ${userId ? 'AND id = $1' : ''} ORDER BY id`,
    userId ? [userId] : []
  )).rows.map((r) => r.id);
  const accounts = [];
  for (const id of ids) {
    try {
      const result = await withRlsTransaction(pool, { orgId: 0, userId: id, isPlatformAdmin: true }, async (client) => {
        const [user] = await demoAccounts(client, id);
        if (!user) return { userId: id, skipped: 'not a demo account' };
        const out = capture
          ? { userId: id, baselineCaptured: await captureBaseline(client, user) }
          : { ...(await resetOne(client, user)), unhandled: await unhandledTables(client, id) };
        if (!apply) throw new DemoResetDryRun(out);
        return out;
      });
      accounts.push(result);
    } catch (error) {
      if (error instanceof DemoResetDryRun) accounts.push(error.result);
      else accounts.push({ userId: id, error: error.message });
    }
  }
  return { applied: apply, accounts };
}

export default { resetDemoAccounts };
