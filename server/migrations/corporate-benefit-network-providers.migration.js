/**
 * Cashless network provider directory for corporate benefit wallet
 * categories (dental, vision, OPD/consultation, vaccination, etc.) —
 * closes the "no provider network" gap identified against SEIT's OPD
 * wallet quote (2026-09-06).
 *
 * A provider row with corporate_id = NULL is part of the shared/global
 * Mediqzy network, visible to every corporate. A row with corporate_id
 * set is a corporate-specific preferred provider (e.g. an on-site OHC or
 * a provider that corporate has separately negotiated). Deliberately a
 * plain directory, not a live eligibility/tariff engine — that's a much
 * larger build (see the Medi Assist gap-analysis doc) and isn't needed to
 * service a reimbursement-style OPD wallet.
 */

import pool from '../db/pgPool.js';

export async function runCorporateBenefitNetworkProvidersMigration() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS corporate_benefit_network_providers (
        id                BIGSERIAL PRIMARY KEY,
        corporate_id      BIGINT REFERENCES corporates(id) ON DELETE CASCADE,
        category          corporate_benefit_category NOT NULL,
        name              VARCHAR(255) NOT NULL,
        provider_type     VARCHAR(60),
        address           TEXT,
        city              VARCHAR(120),
        phone             VARCHAR(30),
        email             VARCHAR(255),
        is_cashless       BOOLEAN NOT NULL DEFAULT false,
        rate_card         JSONB NOT NULL DEFAULT '{}'::jsonb,
        status            VARCHAR(20) NOT NULL DEFAULT 'active',
        notes             TEXT,
        created_by        BIGINT,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_corp_benefit_network_providers_lookup
        ON corporate_benefit_network_providers (category, status, corporate_id)
    `);

    // Optional link from an authorization to a real network provider —
    // additive alongside the existing free-text provider_name/provider_type
    // (reimbursement-style requests where the employee just types where
    // they went keep working unchanged).
    await client.query(`
      ALTER TABLE corporate_benefit_authorizations
        ADD COLUMN IF NOT EXISTS network_provider_id BIGINT
          REFERENCES corporate_benefit_network_providers(id) ON DELETE SET NULL
    `);

    await client.query('COMMIT');
    console.log('✅ corporate-benefit-network-providers migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ corporate-benefit-network-providers migration failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}
