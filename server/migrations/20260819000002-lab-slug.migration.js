/**
 * Lab entity slug — opt-in subdomain identity for the labs table, which has no
 * link to the tenants table and so falls outside extractTenant's reach entirely.
 * Nullable: only labs actually given a dedicated subdomain (e.g. Rado Labs)
 * get one set. Every other lab keeps using the generic /lab/login unchanged.
 */
export async function up(pool) {
  await pool.query(`
    ALTER TABLE labs ADD COLUMN IF NOT EXISTS slug VARCHAR(80);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_labs_slug ON labs(slug) WHERE slug IS NOT NULL;
  `);
}

export async function down(pool) {
  await pool.query(`
    DROP INDEX IF EXISTS idx_labs_slug;
    ALTER TABLE labs DROP COLUMN IF EXISTS slug;
  `);
}
