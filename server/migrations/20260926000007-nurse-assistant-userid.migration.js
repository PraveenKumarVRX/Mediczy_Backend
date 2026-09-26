/**
 * nurses / doctor_assistants: the optional 1:1 link to users.
 *
 * models/userHierarchy.associations.js declares Nurse.belongsTo(User, { foreignKey: 'userId' }) and the same for
 * DoctorAssistant, which makes Sequelize SELECT "userId" on every Nurse / DoctorAssistant query — but neither production
 * table had the column. Every nurse / assistant authentication therefore failed its primary-model lookup
 * ("[auth] Primary model lookup failed: column "userId" does not exist") and worked only through the fallback model.
 *
 * Additive and idempotent: a nullable column (the link is optional) and an index. No data changes, no default, no lock
 * beyond the momentary ALTER.
 */
import pool from '../db/pgPool.js';

export const TABLES = ['nurses', 'doctor_assistants'];

export async function up() {
  for (const t of TABLES) {
    if (!(await pool.query('SELECT to_regclass($1) AS r', [`public.${t}`])).rows[0].r) continue;
    await pool.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS "userId" INTEGER`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_${t}_user_id ON ${t} ("userId")`);
  }
}

export async function down() {
  for (const t of TABLES) {
    await pool.query(`DROP INDEX IF EXISTS idx_${t}_user_id`);
    await pool.query(`ALTER TABLE ${t} DROP COLUMN IF EXISTS "userId"`);
  }
}

export default { up, down, TABLES };
