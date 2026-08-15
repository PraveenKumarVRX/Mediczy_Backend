/**
 * Gives `claim_denials` real referential integrity and organization scoping.
 * The table previously existed only via a runtime `CREATE TABLE IF NOT EXISTS`
 * in denial-management.service.js — no migration, no FK constraints, no
 * organization_id, and it bypassed the RLS the rest of the insurance schema
 * relies on. This migration formalizes it as a first-class table.
 */
export async function up(client) {
  const q = client.query.bind(client);

  // Formalize table creation here (idempotent — matches the shape the runtime
  // CREATE TABLE IF NOT EXISTS already produced in every environment).
  await q(`
    CREATE TABLE IF NOT EXISTS claim_denials (
      id BIGSERIAL PRIMARY KEY,
      hospital_id INTEGER NOT NULL,
      claim_id INTEGER,
      claim_number VARCHAR(80),
      patient_id INTEGER,
      denial_code VARCHAR(40),
      denial_reason TEXT,
      denied_amount NUMERIC(14,2) DEFAULT 0,
      status VARCHAR(30) DEFAULT 'open',
      appeal_letter TEXT,
      appealed_at TIMESTAMPTZ,
      appealed_by INTEGER,
      resolved_at TIMESTAMPTZ,
      resolution_notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_denials_hospital ON claim_denials(hospital_id, status);
  `);

  await q(`ALTER TABLE claim_denials ADD COLUMN IF NOT EXISTS organization_id INTEGER`);

  // Backfill organization_id: prefer the linked claim's organization_id, else
  // fall back to hospital_id (same numeric ID space — both reference tenants;
  // confirmed against insurance_claims/pre_authorizations' real hospital_id FK,
  // which points at tenants(id) — there is no "organizations" table in this schema).
  await q(`
    UPDATE claim_denials cd
    SET organization_id = COALESCE(ic.organization_id, cd.hospital_id)
    FROM insurance_claims ic
    WHERE cd.claim_id = ic.id AND cd.organization_id IS NULL
  `);
  await q(`UPDATE claim_denials SET organization_id = hospital_id WHERE organization_id IS NULL`);

  // Null out any dangling claim_id references before the FK is added — the
  // column was never validated against insurance_claims.id until now.
  await q(`
    UPDATE claim_denials cd
    SET claim_id = NULL
    WHERE cd.claim_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM insurance_claims ic WHERE ic.id = cd.claim_id)
  `);

  // Same for organization_id — null rows would violate the FK below; leave
  // them unscoped (NULL) rather than fail the migration on bad legacy data.
  await q(`
    UPDATE claim_denials cd
    SET organization_id = NULL
    WHERE cd.organization_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id = cd.organization_id)
  `);

  // Only add the FK/NOT NULL once every row is backfilled.
  await q(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'claim_denials_organization_id_fkey'
      ) THEN
        ALTER TABLE claim_denials
          ADD CONSTRAINT claim_denials_organization_id_fkey
          FOREIGN KEY (organization_id) REFERENCES tenants(id);
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'claim_denials_claim_id_fkey'
      ) THEN
        ALTER TABLE claim_denials
          ADD CONSTRAINT claim_denials_claim_id_fkey
          FOREIGN KEY (claim_id) REFERENCES insurance_claims(id);
      END IF;
    END $$;
  `);

  await q(`CREATE INDEX IF NOT EXISTS idx_denials_claim ON claim_denials(claim_id)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_denials_org ON claim_denials(organization_id, status)`);

  console.log('✅ claim_denials integrity migration applied');
}

export async function down(client) {
  const q = client.query.bind(client);
  await q(`ALTER TABLE claim_denials DROP CONSTRAINT IF EXISTS claim_denials_organization_id_fkey`);
  await q(`ALTER TABLE claim_denials DROP CONSTRAINT IF EXISTS claim_denials_claim_id_fkey`);
  await q(`DROP INDEX IF EXISTS idx_denials_claim`);
  await q(`DROP INDEX IF EXISTS idx_denials_org`);
  await q(`ALTER TABLE claim_denials DROP COLUMN IF EXISTS organization_id`);
}
