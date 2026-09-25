/**
 * Audit remediation (2026-09-25) — additive and idempotent.
 *
 *  FIN-07  A journal entry must balance in the DATABASE, not only in application code. A deferred constraint
 *          trigger checks each touched entry at COMMIT, so multi-line inserts (which are unbalanced mid-transaction)
 *          work, and any writer — service, script, or a hand-run SQL — is held to the same rule.
 *  FIN-02  A reversal can never point at itself.
 *  SEC-03  Who revoked an entitlement, and when.
 *  OPS-03  A sequence for assigning UHIDs (assignment is explicit and opt-in; nothing is auto-assigned).
 *
 * NOTE: when launched through scripts/ssm-env-loader.mjs, process.argv[1] is the LOADER, so the self-run guard at the
 * bottom does not fire. Import `up()` from a wrapper instead, and verify with a query — see
 * docs/deployment/MEMORY_AND_OOM.md / the deploy-procedure memory notes.
 */
import pool from '../db/pgPool.js';

const SQL = `
ALTER TABLE tenant_entitlements ADD COLUMN IF NOT EXISTS revoked_by BIGINT;
ALTER TABLE tenant_entitlements ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION finance_assert_entry_balanced() RETURNS trigger AS $fn$
DECLARE
  eid BIGINT;
  d NUMERIC;
  c NUMERIC;
BEGIN
  eid := COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);
  -- The entry may have been deleted in the same transaction (ON DELETE CASCADE); nothing left to check.
  IF NOT EXISTS (SELECT 1 FROM finance_journal_entries WHERE id = eid) THEN
    RETURN NULL;
  END IF;
  SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0) INTO d, c
    FROM finance_journal_lines WHERE journal_entry_id = eid;
  IF d <> c OR d = 0 THEN
    RAISE EXCEPTION 'Journal entry % is not balanced (debit %, credit %)', eid, d, c USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_finance_lines_balanced ON finance_journal_lines;
CREATE CONSTRAINT TRIGGER trg_finance_lines_balanced
  AFTER INSERT OR UPDATE OR DELETE ON finance_journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION finance_assert_entry_balanced();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_finance_reversal_not_self') THEN
    ALTER TABLE finance_journal_entries
      ADD CONSTRAINT chk_finance_reversal_not_self CHECK (reversal_of IS NULL OR reversal_of <> id);
  END IF;
END $$;

CREATE SEQUENCE IF NOT EXISTS patient_uhid_seq START 1;
`;

export async function up() {
  await pool.query(SQL);
}

export async function down() {
  await pool.query(`
    DROP TRIGGER IF EXISTS trg_finance_lines_balanced ON finance_journal_lines;
    DROP FUNCTION IF EXISTS finance_assert_entry_balanced();
    ALTER TABLE finance_journal_entries DROP CONSTRAINT IF EXISTS chk_finance_reversal_not_self;
    ALTER TABLE tenant_entitlements DROP COLUMN IF EXISTS revoked_by, DROP COLUMN IF EXISTS revoked_at;
  `);
}

export default { up, down };

if (process.argv[1] && process.argv[1].includes('20260926000003-audit-remediation')) {
  up().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
}
