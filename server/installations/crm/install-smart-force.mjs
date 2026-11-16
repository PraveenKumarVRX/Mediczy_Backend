/** Installs the Smart-Force field-force schema into this dedicated CRM database. Idempotent.
 *
 * Runs the upstream field-force migrations (all CREATE ... IF NOT EXISTS) as the database owner,
 * because the runtime role (medstar_app) has no CREATE on schema public, then grants the runtime
 * role DML on the new tables. Also creates the two shared-platform tables the field routes read
 * that a CRM-only install lacks: health_camps (Sequelize model HealthCamp) and coupons.
 *
 *   docker compose run --rm --no-deps \
 *     -v /mnt/medstar/secrets/owner-password:/run/bootstrap/owner-password:ro \
 *     api node installations/crm/install-smart-force.mjs
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ownerPassword = readFileSync(process.env.CRM_OWNER_PASSWORD_FILE || '/run/bootstrap/owner-password', 'utf8').trim();
process.env.POSTGRES_USER = 'medstar_owner';
process.env.POSTGRES_PASSWORD = ownerPassword;
if (process.env.CRM_TENANT_UID !== 'H98VG4') throw new Error('Wrong installation');

const { default: pool } = await import('../../db/pgPool.js');
const RUNTIME_ROLE = 'medstar_app';

// Shapes follow the shared platform (models/postgres/health-camp.model.postgres.js and the coupons
// columns the field routes select), so upstream code works unchanged.
const PREREQUISITES = `
DO $$ BEGIN
  CREATE TYPE enum_health_camps_camp_type AS ENUM ('general','diabetes','cardiac','eye','dental','women_health','pediatric','vaccination');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE enum_health_camps_status AS ENUM ('planned','active','completed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS health_camps (
  id SERIAL PRIMARY KEY,
  camp_name VARCHAR(200) NOT NULL,
  camp_type enum_health_camps_camp_type DEFAULT 'general',
  tenant_id INTEGER REFERENCES tenants(id),
  organized_by VARCHAR(200),
  location JSONB NOT NULL,
  address TEXT,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  start_time TIME,
  end_time TIME,
  status enum_health_camps_status DEFAULT 'planned',
  expected_patients INTEGER DEFAULT 0,
  registered_patients INTEGER DEFAULT 0,
  tested_patients INTEGER DEFAULT 0,
  doctors JSONB DEFAULT '[]', nurses JSONB DEFAULT '[]', devices JSONB DEFAULT '[]',
  services_offered JSONB DEFAULT '[]', reports JSONB DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS health_camps_tenant_start ON health_camps (tenant_id, start_date DESC);
CREATE TABLE IF NOT EXISTS coupons (
  id SERIAL PRIMARY KEY,
  code VARCHAR(64) NOT NULL UNIQUE,
  type VARCHAR(32) NOT NULL DEFAULT 'percentage',
  value NUMERIC(12,2) NOT NULL DEFAULT 0,
  description TEXT,
  "validFrom" TIMESTAMPTZ,
  "validUntil" TIMESTAMPTZ,
  "maxUsage" INTEGER,
  "usageCount" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);`;

// Upstream order: phase 1, CRM bridge, then phases 2-6, then the visit_type column.
const MIGRATIONS = [
  'field-force.migration.js', 'field-force-crm.migration.js', 'field-force-phase2.migration.js',
  'field-force-phase3.migration.js', 'field-force-phase5.migration.js', 'field-force-phase6.migration.js',
  'field-force-visit-type.migration.js',
];

try {
  const before = new Set((await pool.query(`SELECT tablename FROM pg_tables WHERE schemaname='public'`)).rows.map(r => r.tablename));
  await pool.query(PREREQUISITES);
  // Each upstream migration is a script that runs on load and may call process.exit(), so run each
  // in its own process with the owner credentials inherited from this one.
  for (const file of MIGRATIONS) {
    const path = fileURLToPath(new URL(`../../migrations/${file}`, import.meta.url));
    const run = spawnSync(process.execPath, [path], { env: process.env, encoding: 'utf8', timeout: 120000 });
    if (run.status !== 0) throw new Error(`${file} failed (${run.status}): ${(run.stderr || run.stdout || '').trim().split('\n').slice(-3).join(' | ')}`);
    console.log(`applied ${file}`);
  }
  const after = (await pool.query(`SELECT tablename FROM pg_tables WHERE schemaname='public'`)).rows.map(r => r.tablename);
  const fieldTables = after.filter(t => t.startsWith('field_') || ['daily_field_reports', 'outreach_accounts', 'health_camps', 'coupons'].includes(t));
  for (const t of fieldTables) {
    await pool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${JSON.stringify(t)} TO ${RUNTIME_ROLE}`);
  }
  const { rows: seqs } = await pool.query(
    `SELECT DISTINCT pg_get_serial_sequence(quote_ident(c.table_name), c.column_name) AS seq
       FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = ANY($1) AND pg_get_serial_sequence(quote_ident(c.table_name), c.column_name) IS NOT NULL`,
    [fieldTables]);
  for (const { seq } of seqs) await pool.query(`GRANT USAGE, SELECT ON SEQUENCE ${seq} TO ${RUNTIME_ROLE}`);
  console.log(JSON.stringify({ created: after.filter(t => !before.has(t)).sort(), granted: fieldTables.length }));
} finally {
  await pool.end();
}
