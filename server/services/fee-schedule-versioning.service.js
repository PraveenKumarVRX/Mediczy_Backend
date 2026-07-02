/**
 * Fee schedule versioning — resolve charge_master prices by version + effective date
 */
import pool from '../db/pgPool.js';

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS charge_master_versions (
      id BIGSERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      version_code VARCHAR(40) NOT NULL,
      effective_from DATE NOT NULL,
      effective_to DATE,
      status VARCHAR(20) DEFAULT 'active',
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (organization_id, version_code)
    );
    ALTER TABLE charge_master ADD COLUMN IF NOT EXISTS version_id BIGINT;
    ALTER TABLE charge_master ADD COLUMN IF NOT EXISTS effective_from DATE;
    ALTER TABLE charge_master ADD COLUMN IF NOT EXISTS effective_to DATE;
    CREATE INDEX IF NOT EXISTS idx_cm_version ON charge_master(organization_id, version_id);
  `);
}

export async function listVersions(organizationId) {
  await ensureTables();
  const { rows } = await pool.query(
    `SELECT * FROM charge_master_versions WHERE organization_id = $1 ORDER BY effective_from DESC`,
    [organizationId]
  );
  return rows;
}

export async function createVersion(organizationId, { versionCode, effectiveFrom, effectiveTo, createdBy }) {
  await ensureTables();
  const { rows } = await pool.query(
    `INSERT INTO charge_master_versions (organization_id, version_code, effective_from, effective_to, status, created_by)
     VALUES ($1,$2,$3,$4,'active',$5) RETURNING *`,
    [organizationId, versionCode, effectiveFrom, effectiveTo || null, createdBy || null]
  );
  return rows[0];
}

export async function getActiveVersion(organizationId, asOfDate = new Date()) {
  await ensureTables();
  const date = asOfDate instanceof Date ? asOfDate.toISOString().slice(0, 10) : String(asOfDate).slice(0, 10);
  const { rows } = await pool.query(
    `SELECT * FROM charge_master_versions
     WHERE organization_id = $1 AND status = 'active'
       AND effective_from <= $2::date
       AND (effective_to IS NULL OR effective_to >= $2::date)
     ORDER BY effective_from DESC LIMIT 1`,
    [organizationId, date]
  );
  return rows[0] || null;
}

export async function resolveCharge(organizationId, code, asOfDate = new Date()) {
  await ensureTables();
  if (!organizationId || !code) return null;

  const version = await getActiveVersion(organizationId, asOfDate);
  const date = asOfDate instanceof Date ? asOfDate.toISOString().slice(0, 10) : String(asOfDate).slice(0, 10);

  const params = [organizationId, String(code).trim()];
  let versionClause = '';
  if (version?.id) {
    params.push(version.id);
    versionClause = ` AND (version_id = $${params.length} OR version_id IS NULL)`;
  }
  params.push(date);
  const dateParam = params.length;

  const { rows } = await pool.query(
    `SELECT * FROM charge_master
     WHERE organization_id = $1 AND UPPER(code) = UPPER($2) AND active IS NOT FALSE
       ${versionClause}
       AND (effective_from IS NULL OR effective_from <= $${dateParam}::date)
       AND (effective_to IS NULL OR effective_to >= $${dateParam}::date)
     ORDER BY version_id DESC NULLS LAST, unit_price DESC NULLS LAST
     LIMIT 1`,
    params
  );
  return rows[0] || null;
}

export default { listVersions, createVersion, getActiveVersion, resolveCharge };
