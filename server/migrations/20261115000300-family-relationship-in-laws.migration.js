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
 */
import pool from '../db/pgPool.js';

const VALUES = ['father_in_law', 'mother_in_law'];

export async function up(db = pool) {
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
