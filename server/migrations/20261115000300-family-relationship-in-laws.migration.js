/**
 * Adds father_in_law and mother_in_law to enum_family_members_relationship.
 *
 * Owner decision (2026-11-15): the top corporate coverage tier is
 * "employee + spouse + 2 children + 2 parents OR 2 parents-in-law", but the
 * relationship enum had no in-law values, so a parent-in-law could not be stored.
 *
 * Until this runs, routes/family-member.route.js refuses in-law adds with a clear
 * message (services/family-member-validation.service.js inLawRelationshipsStorable)
 * and GET /api/family-members/limits reports inLawsAvailable: false.
 *
 * ALTER TYPE ... ADD VALUE is idempotent with IF NOT EXISTS and must not run
 * inside an explicit transaction block that also uses the new value; each
 * statement is sent on its own.
 *
 * The type is owned by the RDS master (postgres), not the app user, so ALTER TYPE
 * needs the owner (same convention as add-diagnostic-centre-tenant-type):
 *   read -rs POSTGRES_OWNER_PASSWORD; export POSTGRES_OWNER_PASSWORD
 *   POSTGRES_OWNER_USER=postgres node scripts/ssm-env-loader.mjs \
 *     migrations/20261115000300-family-relationship-in-laws.migration.js
 */
import pg from 'pg';
import pool from '../db/pgPool.js';

const VALUES = ['father_in_law', 'mother_in_law'];

/** A connection as the type owner when POSTGRES_OWNER_USER/PASSWORD are set, else null. */
async function ownerClient() {
  const user = process.env.POSTGRES_OWNER_USER;
  const password = process.env.POSTGRES_OWNER_PASSWORD;
  if (!user || !password) return null;
  const client = new pg.Client({
    host: process.env.POSTGRES_OWNER_HOST || process.env.POSTGRES_PRIMARY_HOST || process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_OWNER_PORT || process.env.POSTGRES_PRIMARY_PORT || process.env.POSTGRES_PORT || 5432),
    database: process.env.POSTGRES_OWNER_DATABASE || process.env.POSTGRES_PRIMARY_DATABASE || process.env.POSTGRES_DATABASE,
    user,
    password,
    ssl: process.env.POSTGRES_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  console.log(`Using owner connection as ${user}`);
  return client;
}

export async function up(db = pool) {
  const owner = db === pool ? await ownerClient() : null;
  if (owner) {
    try { return await up(owner); } finally { await owner.end(); }
  }
  for (const value of VALUES) {
    await db.query(`ALTER TYPE enum_family_members_relationship ADD VALUE IF NOT EXISTS '${value}'`);
  }
}

export async function down(db = pool) {
  // PostgreSQL cannot drop a value from an enum without rebuilding the type, and
  // rows may already hold these values. Deliberately a no-op.
  await db.query('SELECT 1');
}

export default { up, down };

if (process.argv.slice(1).some((arg) => String(arg).includes('20261115000300-family-relationship-in-laws'))) {
  up().then(() => { console.log('family relationship in-law values applied'); process.exit(0); })
      .catch((error) => { console.error(error); process.exit(1); });
}
