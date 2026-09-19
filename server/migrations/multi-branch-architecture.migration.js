/**
 * Migration: Multi-Branch Architecture (Phase 1 — schema only)
 * ================================================================
 * Design source: docs discussion 2026-09-18 (UX/UI/CTO/Market design pass +
 * implementation plan Workstream 5). Phased, backward-compatible rollout:
 *
 *   Phase 1 (this migration): additive schema only. Nullable branch_id
 *     columns, one auto-created "Main" branch per existing tenant. Zero
 *     behavior change for single-location customers.
 *   Phase 2 (future): backfill branch_id on existing rows.
 *   Phase 3 (future): make branch_id required + app-level filtering.
 *
 * Key architectural decision: patient and staff IDENTITY stay
 * organization-level (reusing the existing UserAssociation pattern already
 * proven for patients) — only encounter-level tables (appointments,
 * admissions, billing, inventory, queue) get a branch_id. Staff-to-branch
 * assignment is a NEW dedicated table rather than extending the existing
 * user_associations enum, to avoid altering a shared production table's
 * constraints as part of this rollout.
 *
 * Safe to run multiple times (IF NOT EXISTS / conditional ALTERs).
 */

import pool from '../db/pgPool.js';

const ENCOUNTER_TABLES = ['appointments', 'ip_admissions', 'beds', 'hospital_queue_entries'];

export async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS hospital_branch (
        id               SERIAL PRIMARY KEY,
        organization_id  INTEGER NOT NULL,
        name             TEXT NOT NULL,
        address          TEXT,
        is_active        BOOLEAN NOT NULL DEFAULT true,
        is_main          BOOLEAN NOT NULL DEFAULT false,
        created_at       TIMESTAMPTZ DEFAULT NOW(),
        updated_at       TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (organization_id, name)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_hospital_branch_org ON hospital_branch (organization_id)`);
    console.log('✅ hospital_branch: created');

    await client.query(`
      CREATE TABLE IF NOT EXISTS staff_branch_assignment (
        id           SERIAL PRIMARY KEY,
        user_id      INTEGER NOT NULL,
        branch_id    INTEGER NOT NULL REFERENCES hospital_branch(id),
        role         TEXT NOT NULL,
        is_active    BOOLEAN NOT NULL DEFAULT true,
        created_at   TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (user_id, branch_id)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_staff_branch_user ON staff_branch_assignment (user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_staff_branch_branch ON staff_branch_assignment (branch_id)`);
    console.log('✅ staff_branch_assignment: created');

    // charge_master_id stored loosely (no FK) since this migration doesn't
    // assume charge_master's exact primary-key column name — matches the
    // soft-reference pattern already used elsewhere in this codebase
    // (clinical_knowledge_rules.governance_change_id).
    await client.query(`
      CREATE TABLE IF NOT EXISTS charge_master_branch_override (
        id               SERIAL PRIMARY KEY,
        branch_id        INTEGER NOT NULL REFERENCES hospital_branch(id),
        charge_master_id INTEGER NOT NULL,
        override_price   NUMERIC(12,2) NOT NULL,
        effective_date   DATE NOT NULL DEFAULT CURRENT_DATE,
        created_at       TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (branch_id, charge_master_id)
      )
    `);
    console.log('✅ charge_master_branch_override: created');

    // Phase 1: add a nullable branch_id to encounter-level tables that exist
    // in this environment. Conditional on table existence so this migration
    // never fails in an environment missing one of these tables.
    for (const table of ENCOUNTER_TABLES) {
      await client.query(`
        DO $$
        BEGIN
          IF to_regclass('public.${table}') IS NOT NULL THEN
            ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS branch_id INTEGER;
          END IF;
        END $$;
      `);
    }
    console.log(`✅ branch_id column added (where table exists) to: ${ENCOUNTER_TABLES.join(', ')}`);

    await client.query('COMMIT');
    console.log('✅ Multi-branch architecture Phase 1 migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function down() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const table of ENCOUNTER_TABLES) {
      await client.query(`
        DO $$
        BEGIN
          IF to_regclass('public.${table}') IS NOT NULL THEN
            ALTER TABLE ${table} DROP COLUMN IF EXISTS branch_id;
          END IF;
        END $$;
      `);
    }
    await client.query('DROP TABLE IF EXISTS charge_master_branch_override');
    await client.query('DROP TABLE IF EXISTS staff_branch_assignment');
    await client.query('DROP TABLE IF EXISTS hospital_branch');
    await client.query('COMMIT');
    console.log('✅ Multi-branch architecture migration rolled back');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Run as standalone: node multi-branch-architecture.migration.js
if (process.argv[1] && process.argv[1].includes('multi-branch-architecture')) {
  up().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
}
