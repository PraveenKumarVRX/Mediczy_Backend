/**
 * One member account per phone number (owner decision 2026-11-20).
 *
 * users.phoneNumber had only a plain index, so the same number collected 2-3 member accounts
 * (bulk uploads, the old WhatsApp bot) and phone sign-in picked one at random. The 847
 * same-person duplicates were merged on 2026-11-20 (backup_phone_dup_merge_20261120).
 *
 * The rule covers member app accounts (role 'user'): a new one, or a phone change on one, is
 * refused when another live member account already has the same last 10 digits. Staff logins
 * (team, doctors, pharmacy, hospital staff) and hospital patient records (role 'patient') may
 * share a person's number and are not checked. Blank and all-zero numbers are exempt.
 *
 * It is a trigger, not a unique index, because 25 numbers are legitimately shared today
 * (different people, or a staff login) and must stay; they are not touched unless re-numbered.
 *
 * Run: node scripts/ssm-env-loader.mjs scripts/run-one-migration.mjs migrations/20261120000500-users-one-member-account-per-phone.migration.js
 */
export async function up(client) {
  await client.query(`CREATE INDEX IF NOT EXISTS users_phone_last10_idx
    ON users ((right(regexp_replace(COALESCE("phoneNumber", ''), '\\D', '', 'g'), 10)))`);
  await client.query(`
    CREATE OR REPLACE FUNCTION users_one_member_account_per_phone() RETURNS trigger
    LANGUAGE plpgsql AS $fn$
    DECLARE
      p text := right(regexp_replace(COALESCE(NEW."phoneNumber", ''), '\\D', '', 'g'), 10);
      other_id integer;
    BEGIN
      IF NEW.role IS DISTINCT FROM 'user' OR COALESCE(NEW."isTeam", false) OR COALESCE(NEW."isAdmin", false)
         OR NEW.status = 'deleted' OR length(p) < 10 OR p ~ '^0+$' THEN
        RETURN NEW;
      END IF;
      IF TG_OP = 'UPDATE' AND p = right(regexp_replace(COALESCE(OLD."phoneNumber", ''), '\\D', '', 'g'), 10)
         AND OLD.role IS NOT DISTINCT FROM NEW.role AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
        RETURN NEW;  -- number unchanged: grandfathered pairs keep working
      END IF;
      SELECT id INTO other_id FROM users
       WHERE right(regexp_replace(COALESCE("phoneNumber", ''), '\\D', '', 'g'), 10) = p
         AND id <> NEW.id AND role = 'user' AND status <> 'deleted'
         AND NOT COALESCE("isTeam", false) AND NOT COALESCE("isAdmin", false)
       LIMIT 1;
      IF other_id IS NOT NULL THEN
        RAISE EXCEPTION 'This phone number is already registered to another account'
          USING ERRCODE = 'unique_violation', CONSTRAINT = 'users_one_account_per_phone';
      END IF;
      RETURN NEW;
    END
    $fn$`);
  await client.query('DROP TRIGGER IF EXISTS trg_users_one_member_account_per_phone ON users');
  await client.query(`CREATE TRIGGER trg_users_one_member_account_per_phone
    BEFORE INSERT OR UPDATE OF "phoneNumber", role, status ON users
    FOR EACH ROW EXECUTE FUNCTION users_one_member_account_per_phone()`);
}

export async function down(client) {
  await client.query('DROP TRIGGER IF EXISTS trg_users_one_member_account_per_phone ON users');
  await client.query('DROP FUNCTION IF EXISTS users_one_member_account_per_phone()');
  await client.query('DROP INDEX IF EXISTS users_phone_last10_idx');
}
