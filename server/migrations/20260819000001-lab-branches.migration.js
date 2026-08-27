/**
 * Lab branches — shared-login, branch-scoped views for multi-location lab accounts
 * (e.g. Rado Labs). One lab login (labs.id) owns any number of branches; devices
 * and studies tag which branch they belong to, so the portal can filter by branch
 * without needing a separate login per location.
 */
export async function up(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lab_branches (
      id BIGSERIAL PRIMARY KEY,
      lab_id INTEGER NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
      name VARCHAR(150) NOT NULL,
      code VARCHAR(40),
      address VARCHAR(255),
      city VARCHAR(100),
      state VARCHAR(100),
      phone VARCHAR(20),
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_lab_branches_lab_code
      ON lab_branches(lab_id, code) WHERE code IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_lab_branches_lab ON lab_branches(lab_id);

    ALTER TABLE dicom_modalities
      ADD COLUMN IF NOT EXISTS branch_id BIGINT REFERENCES lab_branches(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_dicom_modalities_branch ON dicom_modalities(branch_id);

    ALTER TABLE ris_studies
      ADD COLUMN IF NOT EXISTS branch_id BIGINT REFERENCES lab_branches(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_ris_studies_branch ON ris_studies(branch_id);
  `);
}

export async function down(pool) {
  await pool.query(`
    ALTER TABLE ris_studies DROP COLUMN IF EXISTS branch_id;
    ALTER TABLE dicom_modalities DROP COLUMN IF EXISTS branch_id;
    DROP TABLE IF EXISTS lab_branches;
  `);
}
