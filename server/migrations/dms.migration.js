/**
 * Migration: Document Management System (DMS) — core schema
 * ================================================================
 * Small, real DMS module for hospital operations: policies, SOPs,
 * consent forms, NABH documents, HR documents, circulars, etc.
 *
 * dms_document          — current state of a document (one row per document)
 * dms_document_version  — append-only version history (one row per upload)
 *
 * Additive only — never touches any other table. Safe to run multiple
 * times (IF NOT EXISTS).
 */

import pool from '../db/pgPool.js';

export async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS dms_document (
        id               SERIAL PRIMARY KEY,
        organization_id  INTEGER NOT NULL,
        category         TEXT NOT NULL,
        title            TEXT NOT NULL,
        description      TEXT,
        current_version  INTEGER NOT NULL DEFAULT 1,
        status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
        file_url         TEXT,
        file_key         TEXT,
        file_name        TEXT,
        mime_type        TEXT,
        size_bytes       INTEGER,
        uploaded_by      INTEGER,
        created_at       TIMESTAMPTZ DEFAULT NOW(),
        updated_at       TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_dms_document_org_category ON dms_document (organization_id, category)`);
    console.log('✅ dms_document: created');

    await client.query(`
      CREATE TABLE IF NOT EXISTS dms_document_version (
        id           SERIAL PRIMARY KEY,
        document_id  INTEGER NOT NULL REFERENCES dms_document(id),
        version_no   INTEGER NOT NULL,
        file_url     TEXT,
        file_key     TEXT,
        file_name    TEXT,
        mime_type    TEXT,
        size_bytes   INTEGER,
        uploaded_by  INTEGER,
        change_note  TEXT,
        uploaded_at  TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (document_id, version_no)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_dms_document_version_document ON dms_document_version (document_id)`);
    console.log('✅ dms_document_version: created');

    await client.query('COMMIT');
    console.log('✅ DMS migration complete');
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
    await client.query('DROP TABLE IF EXISTS dms_document_version');
    await client.query('DROP TABLE IF EXISTS dms_document');
    await client.query('COMMIT');
    console.log('✅ DMS migration rolled back');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Run as standalone: node dms.migration.js
if (process.argv[1] && process.argv[1].includes('dms.migration')) {
  up().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
}
