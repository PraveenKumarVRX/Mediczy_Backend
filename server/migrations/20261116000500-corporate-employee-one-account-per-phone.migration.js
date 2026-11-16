/**
 * One active employee account per phone number, per corporate.
 *
 * Dairy Day had 176 employee accounts for 162 people: an upload on 22 Mar 2026
 * and HR's roster upload on 25 Sep 2026 each created an account for the same
 * 14 people, because the second upload matched existing accounts by email
 * alone and the people arrived under a different (placeholder) address. The
 * Team portal showed them twice. The upload code now matches by email, staff
 * code and phone (services/corporate-employee-identity.service.js); this rule
 * is the backstop for any path that still skips that matcher.
 *
 * The check runs only when a link to a corporate *becomes* an active employee
 * link (insert, or update that activates it or moves it to another person or
 * corporate). Existing duplicates — Equitas still has 402 shared-phone pairs
 * awaiting a merge — therefore do not block ordinary edits, and deactivating
 * one side of a pair (the merge) is always allowed. Blank, short and
 * single-digit placeholder numbers (0000000000, 9999999999) are not checked.
 *
 * Raised as SQLSTATE 23505 with CONSTRAINT one_employee_account_per_phone, so
 * routes can tell it apart from other unique violations
 * (isOneAccountPerPhoneViolation in the identity service).
 *
 * Run: node scripts/ssm-env-loader.mjs scripts/run-one-migration.mjs \
 *        migrations/20261116000500-corporate-employee-one-account-per-phone.migration.js
 */
import { fileURLToPath } from 'node:url';

export async function up(client) {
  await client.query(`
    CREATE OR REPLACE FUNCTION enforce_one_employee_account_per_phone() RETURNS trigger
    LANGUAGE plpgsql AS $fn$
    DECLARE
      phone text;
      other_user integer;
    BEGIN
      IF NEW."entityType" IS DISTINCT FROM 'corporate' OR NEW.role IS DISTINCT FROM 'employee'
         OR NEW.status IS DISTINCT FROM 'active' THEN
        RETURN NEW;
      END IF;
      IF TG_OP = 'UPDATE' AND OLD.status = 'active' AND OLD."entityType" = NEW."entityType"
         AND OLD.role = NEW.role AND OLD."entityId" = NEW."entityId" AND OLD."userId" = NEW."userId" THEN
        RETURN NEW;  -- already an active link; editing it is not a new account
      END IF;

      SELECT right(regexp_replace(COALESCE("phoneNumber", ''), '\\D', '', 'g'), 10) INTO phone
        FROM users WHERE id = NEW."userId";
      IF phone IS NULL OR length(phone) < 10 OR phone ~ '^(\\d)\\1{9}$' THEN
        RETURN NEW;
      END IF;

      -- Serialise concurrent links of the same number into the same corporate.
      PERFORM pg_advisory_xact_lock(hashtext('one_employee_account_per_phone:' || NEW."entityId" || ':' || phone));

      SELECT ua."userId" INTO other_user
        FROM user_associations ua JOIN users u ON u.id = ua."userId"
       WHERE ua."entityType" = 'corporate' AND ua."entityId" = NEW."entityId"
         AND ua.role = 'employee' AND ua.status = 'active' AND ua."userId" <> NEW."userId"
         AND right(regexp_replace(COALESCE(u."phoneNumber", ''), '\\D', '', 'g'), 10) = phone
       LIMIT 1;
      IF other_user IS NOT NULL THEN
        RAISE EXCEPTION 'Phone number ending % already belongs to employee account % in this corporate; link that account instead of creating a second one',
          right(phone, 4), other_user
          USING ERRCODE = 'unique_violation', CONSTRAINT = 'one_employee_account_per_phone';
      END IF;
      RETURN NEW;
    END
    $fn$`);
  await client.query('DROP TRIGGER IF EXISTS trg_one_employee_account_per_phone ON user_associations');
  await client.query(`
    CREATE TRIGGER trg_one_employee_account_per_phone
      BEFORE INSERT OR UPDATE OF status, role, "entityType", "entityId", "userId" ON user_associations
      FOR EACH ROW EXECUTE FUNCTION enforce_one_employee_account_per_phone()`);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_user_associations_active_corporate_employee
      ON user_associations ("entityId") WHERE "entityType" = 'corporate' AND role = 'employee' AND status = 'active'`);
}

export async function down(client) {
  await client.query('DROP TRIGGER IF EXISTS trg_one_employee_account_per_phone ON user_associations');
  await client.query('DROP FUNCTION IF EXISTS enforce_one_employee_account_per_phone()');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { default: pool } = await import('../db/pgPool.js');
  const client = await pool.connect();
  try { await client.query('BEGIN'); await up(client); await client.query('COMMIT'); console.log('one-account-per-phone rule installed'); }
  catch (error) { await client.query('ROLLBACK').catch(() => {}); console.error(error.message); process.exitCode = 1; }
  finally { client.release(); await pool.end(); }
}
