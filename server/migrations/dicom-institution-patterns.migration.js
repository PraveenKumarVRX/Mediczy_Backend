/**
 * Migration: dicom_institution_patterns
 *
 * Curated, exact-substring-match table for routing an Orthanc-ingested
 * study to its owning lab by DICOM InstitutionName, when RemoteAET is
 * missing or generic (e.g. studies relayed through an intermediary rather
 * than received via direct DICOM C-STORE, where Orthanc records its own
 * AE title instead of the originating modality's).
 *
 * Deliberately exact-match only (ILIKE '%pattern%'), never a fuzzy/
 * heuristic guess — a wrong match here silently attributes a real
 * patient's study to the wrong lab. New patterns must be added
 * deliberately, from a verified real DICOM InstitutionName value, the
 * same way dicom_modalities' AE-title mappings are curated.
 *
 * See resolveLabIdForOrthancIngest() in
 * services/imaging/imaging-ris-auto-ingest.service.js for how this is used
 * — checked after dicom_modalities (AE title), before the
 * ORTHANC_DEFAULT_LAB_ID single-tenant last-resort fallback.
 */

import pool from '../db/pgPool.js';

export async function runDicomInstitutionPatternsMigration() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS dicom_institution_patterns (
        id          SERIAL PRIMARY KEY,
        pattern     VARCHAR(255) NOT NULL,
        tenant_id   INTEGER      NOT NULL,
        status      VARCHAR(20)  NOT NULL DEFAULT 'active',
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dicom_institution_patterns_status
        ON dicom_institution_patterns (status)
    `);

    // Verified against a real DICOM study's InstitutionName tag
    // ("TNMSC MRI SCAN, ICH, EGMORE CH-8.") on 2026-09-01 — see the
    // Orthanc→RIS auto-ingest lab-attribution fix from the same date.
    await client.query(`
      INSERT INTO dicom_institution_patterns (pattern, tenant_id)
      SELECT 'ICH, EGMORE', 2433
      WHERE NOT EXISTS (
        SELECT 1 FROM dicom_institution_patterns WHERE pattern = 'ICH, EGMORE'
      )
    `);

    await client.query('COMMIT');
    console.log('✅ dicom_institution_patterns migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ dicom_institution_patterns migration failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}
