/**
 * DICOM modality device registry — scanner peers for Orthanc C-STORE / MWL.
 */
export async function up(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dicom_modalities (
      id BIGSERIAL PRIMARY KEY,
      tenant_id BIGINT NOT NULL,
      name VARCHAR(80) NOT NULL,
      ae_title VARCHAR(16) NOT NULL,
      host VARCHAR(255) NOT NULL,
      port INTEGER NOT NULL,
      modality_type VARCHAR(10) NOT NULL,
      manufacturer VARCHAR(120),
      model VARCHAR(120),
      location VARCHAR(200),
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      orthanc_synced BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_dicom_modalities_tenant_name
      ON dicom_modalities(tenant_id, name);
    CREATE INDEX IF NOT EXISTS idx_dicom_modalities_tenant
      ON dicom_modalities(tenant_id);
  `);
}

export async function down(pool) {
  await pool.query(`DROP TABLE IF EXISTS dicom_modalities;`);
}
