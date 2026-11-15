/**
 * Per-lab test price lists (owner decision 2026-11-15: "labs set their own
 * test lists and prices").
 *
 * Until now every lab listed the same 116 tests at the same prices: lab
 * booking priced from `api_lab_tests`, one platform-wide "Standard"
 * catalogue. `labs."testCatalog"` JSON exists on 37 labs, but it is two seeded
 * templates whose codes mostly match nothing in the catalogue, so it was never
 * a price list booking could honour.
 *
 * `lab_test_prices` says which catalogue tests a lab offers and at what price.
 * services/lab-booking-pricing.service.js reads it: a lab with at least one
 * active row offers ONLY those tests at THOSE prices (priceSource 'lab'); a lab
 * with none still books from the Standard catalogue (priceSource 'standard').
 * The catalogue stays the definition of what a test is; a lab only chooses
 * which of them it performs and its price.
 *
 * Entity UID rule (CLAUDE.md): the lab reference carries its uid twin from day
 * one. attach_uid_reference() adds lab_uid, registers the pair and installs the
 * trigger that fills it from lab_id (and refuses a write where the two
 * disagree). The catalogue test is referenced by its own natural key
 * (api_lab_tests.test_id); a catalogue row is not an entity and has no uid.
 * Who last changed a row is kept as a uid (a lab or a user), never a bare id.
 *
 * Nothing is seeded: a lab's prices come from the lab or an admin, not from
 * here.
 *
 * NOT APPLIED automatically. Apply with:
 *   node scripts/ssm-env-loader.mjs migrations/20261115000200-lab-test-prices.migration.js
 * The pricing service treats a missing table as "no lab has a price list", so
 * the code can be deployed before or after this runs.
 */
import pool from '../db/pgPool.js';

export async function up(db = pool) {
  const client = typeof db.connect === 'function' ? await db.connect() : db;
  const release = () => { if (client !== db && typeof client.release === 'function') client.release(); };
  try {
    await client.query('BEGIN');

    const { rows: [rule] } = await client.query(
      "SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'attach_uid_reference') AS present"
    );
    if (!rule?.present) {
      // A new cross-entity reference is not finished without its uid twin.
      throw new Error('attach_uid_reference() is missing: apply the entity-uid rule migrations first');
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS lab_test_prices (
        id              BIGSERIAL PRIMARY KEY,
        lab_id          INTEGER NOT NULL REFERENCES labs (id) ON DELETE CASCADE,
        test_id         VARCHAR(50) NOT NULL REFERENCES api_lab_tests (test_id) ON UPDATE CASCADE,
        price           NUMERIC(10,2) NOT NULL,
        currency        VARCHAR(3) NOT NULL DEFAULT 'INR',
        is_active       BOOLEAN NOT NULL DEFAULT TRUE,
        updated_by_uid  TEXT REFERENCES entity_registry (uid),
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT lab_test_prices_price_positive CHECK (price > 0),
        CONSTRAINT lab_test_prices_currency_inr CHECK (currency = 'INR'),
        CONSTRAINT lab_test_prices_lab_test_unique UNIQUE (lab_id, test_id)
      )
    `);

    await client.query(`SELECT attach_uid_reference('lab_test_prices', 'lab_id', 'lab_uid', 'labs')`);
    // Every row has a lab, so its uid twin is never empty. The table is new
    // (or was filled by the trigger), so this cannot fail on old rows.
    await client.query('ALTER TABLE lab_test_prices ALTER COLUMN lab_uid SET NOT NULL');

    // "Does this lab have an active price list?" is asked on every listing,
    // cart re-price and booking.
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_lab_test_prices_active_lab
        ON lab_test_prices (lab_id) WHERE is_active
    `);

    await client.query(`
      COMMENT ON TABLE lab_test_prices IS
        'Per-lab price list over api_lab_tests. A lab with an active row offers only its active rows; a lab with none books from the Standard catalogue.'
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    release();
  }
}

export async function down(db = pool) {
  await db.query(`
    DELETE FROM entity_uid_references WHERE table_name = 'lab_test_prices';
    DROP TABLE IF EXISTS lab_test_prices;
  `);
}

// Also when started through scripts/ssm-env-loader.mjs, where argv[1] is the loader.
if (process.argv.slice(1).some((arg) => String(arg).includes('20261115000200-lab-test-prices'))) {
  up().then(() => { console.log('lab_test_prices applied'); process.exit(0); })
      .catch((error) => { console.error(error); process.exit(1); });
}
