/**
 * Diet sync (owner decision 2026-11-20): the member's diet goals and food log are saved to the
 * account, and foods can be searched.
 *
 * - food_items: the food catalogue (per-serving and per-100 g nutrients). Loaded by
 *   scripts/import-indb-foods.mjs from the Indian Nutrient Databank (INDB, 2024) once the owner
 *   approves its use; members can always log a custom food meanwhile. Not personal data.
 * - diet_goals, food_log_entries, diet_days (water per date): personal health data, FORCED
 *   row-level security to the member
 *   (app.current_user_id), uid twins, removed with the account and by DPDP erasure.
 *
 * Run: node scripts/ssm-env-loader.mjs scripts/run-one-migration.mjs migrations/20261120000600-diet-sync.migration.js
 */
const OWN_ROW = `user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
  OR current_setting('app.is_platform_admin', true) = 'true'`;

export const MEALS = ['breakfast', 'midMorningSnack', 'lunch', 'eveningSnack', 'dinner', 'other'];

export async function up(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS food_items (
      id               serial PRIMARY KEY,
      source           text NOT NULL,
      source_code      text NOT NULL,
      name             text NOT NULL,
      serving_unit     text,
      serving_kcal     numeric(8,2),
      serving_carb_g   numeric(8,2),
      serving_protein_g numeric(8,2),
      serving_fat_g    numeric(8,2),
      serving_fibre_g  numeric(8,2),
      serving_sugar_g  numeric(8,2),
      serving_sodium_mg numeric(9,2),
      per100_kcal      numeric(8,2),
      per100_carb_g    numeric(8,2),
      per100_protein_g numeric(8,2),
      per100_fat_g     numeric(8,2),
      attribution      text,
      reviewed         boolean NOT NULL DEFAULT false,
      is_active        boolean NOT NULL DEFAULT true,
      created_at       timestamptz NOT NULL DEFAULT now(),
      updated_at       timestamptz NOT NULL DEFAULT now(),
      UNIQUE (source, source_code)
    )`);
  await client.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
        CREATE INDEX IF NOT EXISTS food_items_name_trgm ON food_items USING gin (lower(name) gin_trgm_ops);
      ELSE
        CREATE INDEX IF NOT EXISTS food_items_name_lower ON food_items (lower(name));
      END IF;
    END $$;`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS diet_goals (
      user_id            integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      user_uid           varchar(6),
      target_kcal        integer CHECK (target_kcal IS NULL OR target_kcal BETWEEN 800 AND 6000),
      protein_g          integer CHECK (protein_g IS NULL OR protein_g BETWEEN 0 AND 500),
      carbs_g            integer CHECK (carbs_g IS NULL OR carbs_g BETWEEN 0 AND 1000),
      fat_g              integer CHECK (fat_g IS NULL OR fat_g BETWEEN 0 AND 400),
      water_ml           integer CHECK (water_ml IS NULL OR water_ml BETWEEN 500 AND 8000),
      goal               text CHECK (goal IS NULL OR goal IN ('weight_loss', 'maintenance', 'weight_gain', 'muscle_gain', 'general_health')),
      activity_level     text CHECK (activity_level IS NULL OR activity_level IN ('sedentary', 'light', 'moderate', 'active', 'very_active')),
      dietary_preference text CHECK (dietary_preference IS NULL OR dietary_preference IN ('vegetarian', 'non_vegetarian', 'eggetarian', 'vegan', 'jain')),
      cuisine_region     text,
      created_at         timestamptz NOT NULL DEFAULT now(),
      updated_at         timestamptz NOT NULL DEFAULT now()
    )`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS food_log_entries (
      id            bigserial PRIMARY KEY,
      user_id       integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_uid      varchar(6),
      log_date      date NOT NULL,
      meal          text NOT NULL CHECK (meal IN (${MEALS.map((m) => `'${m}'`).join(', ')})),
      food_item_id  integer REFERENCES food_items(id) ON DELETE SET NULL,
      name          varchar(160) NOT NULL,
      servings      numeric(6,2) NOT NULL DEFAULT 1 CHECK (servings > 0 AND servings <= 50),
      serving_unit  text,
      kcal          numeric(8,2) NOT NULL CHECK (kcal >= 0 AND kcal <= 10000),
      carb_g        numeric(8,2) CHECK (carb_g IS NULL OR carb_g >= 0),
      protein_g     numeric(8,2) CHECK (protein_g IS NULL OR protein_g >= 0),
      fat_g         numeric(8,2) CHECK (fat_g IS NULL OR fat_g >= 0),
      fibre_g       numeric(8,2) CHECK (fibre_g IS NULL OR fibre_g >= 0),
      source        text NOT NULL CHECK (source IN ('catalogue', 'custom', 'plan')),
      created_at    timestamptz NOT NULL DEFAULT now(),
      updated_at    timestamptz NOT NULL DEFAULT now()
    )`);
  await client.query('CREATE INDEX IF NOT EXISTS food_log_entries_user_date ON food_log_entries (user_id, log_date DESC)');

  // One row per member and date: water, and the day's sync stamp (the app syncs a whole day).
  await client.query(`
    CREATE TABLE IF NOT EXISTS diet_days (
      user_id    integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_uid   varchar(6),
      log_date   date NOT NULL,
      water_ml   integer CHECK (water_ml IS NULL OR water_ml BETWEEN 0 AND 20000),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, log_date)
    )`);

  for (const table of ['diet_goals', 'food_log_entries', 'diet_days']) {
    await client.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    await client.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
    await client.query(`DROP POLICY IF EXISTS ${table}_own_rows ON ${table}`);
    await client.query(`CREATE POLICY ${table}_own_rows ON ${table} USING (${OWN_ROW}) WITH CHECK (${OWN_ROW})`);
  }

  await client.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'attach_uid_reference') THEN
        PERFORM attach_uid_reference('diet_goals', 'user_id', 'user_uid', 'users');
        PERFORM attach_uid_reference('food_log_entries', 'user_id', 'user_uid', 'users');
        PERFORM attach_uid_reference('diet_days', 'user_id', 'user_uid', 'users');
      END IF;
    END
    $$;`);
}

export async function down(client) {
  await client.query('DROP TABLE IF EXISTS diet_days');
  await client.query('DROP TABLE IF EXISTS food_log_entries');
  await client.query('DROP TABLE IF EXISTS diet_goals');
  await client.query('DROP TABLE IF EXISTS food_items');
}
