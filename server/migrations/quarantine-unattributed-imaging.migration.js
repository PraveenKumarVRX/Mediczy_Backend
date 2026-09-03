/**
 * Migration: quarantine already-misattributed imaging studies at Rado Labs
 *
 * Background: resolveLabIdForOrthancIngest() used to fall back to a single
 * global ORTHANC_DEFAULT_LAB_ID whenever a study had no matching AE-title
 * or InstitutionName tag (fixed 2026-09-03, see
 * services/imaging/imaging-ris-auto-ingest.service.js). That bug caused
 * studies with zero real routing signal to be silently attributed to
 * whichever lab happened to be the env default.
 *
 * Reported by the customer: radolabs@mediqzy.com (lab_id 2368) was showing
 * pediatric brain/spine MRI studies that belong to a different facility,
 * instead of its own West Mambalam branch USG images. Rado Labs only has
 * a real, AE-title-matched modality for US (VERSANAB-000000 / West
 * Mambalam) — every non-US study on lab_id 2368 was verified to carry no
 * remoteAet and no institutionName tag at all, i.e. zero real signal, i.e.
 * a product of the env-default guess, not a real Rado Labs study.
 *
 * This migration moves exactly those confirmed-signal-less, non-US studies
 * off of lab_id 2368 into a dedicated, login-disabled quarantine lab
 * record, so they stop appearing in Rado Labs' account. Nothing is
 * deleted — the studies remain in the database, reassignable to their
 * real owning lab once that's identified. Real Rado Labs studies (US
 * modality, or any future CT/DX study that actually carries the
 * CT_SCANNER/XRAY_DR100 AE-title) are untouched.
 *
 * Idempotent: reruns only ever match rows still sitting at lab_id 2368,
 * so already-quarantined rows (now under the quarantine lab's id) are
 * never re-selected.
 */

import pool from '../db/pgPool.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const RADO_LABS_ID = 2368;
const QUARANTINE_LAB_SLUG = 'unattributed-imaging-quarantine';
const QUARANTINE_LAB_EMAIL = 'unattributed-imaging-quarantine@internal.mediqzy.local';

export async function runQuarantineUnattributedImagingMigration() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let { rows: existing } = await client.query(
      `SELECT id FROM labs WHERE slug = $1::varchar`,
      [QUARANTINE_LAB_SLUG],
    );

    let quarantineLabId;
    if (existing[0]) {
      quarantineLabId = existing[0].id;
    } else {
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const passwordHash = await bcrypt.hash(randomPassword, 10);
      const { rows: created } = await client.query(
        `INSERT INTO labs (name, email, password, "phoneNumber", status, slug, "createdAt", "updatedAt")
         VALUES ($1::varchar, $2::varchar, $3::varchar, $4::varchar, $5::varchar, $6::varchar, NOW(), NOW())
         RETURNING id`,
        [
          'Unattributed Imaging (Quarantine)',
          QUARANTINE_LAB_EMAIL,
          passwordHash,
          '0000000000',
          'suspended',
          QUARANTINE_LAB_SLUG,
        ],
      );
      quarantineLabId = created[0].id;
    }

    const { rowCount } = await client.query(
      `UPDATE ris_studies
          SET lab_id = $1::integer, updated_at = NOW()
        WHERE lab_id = $2::integer
          AND modality != 'US'
          AND COALESCE(dicom_tags->>'remoteAet', dicom_tags->>'RemoteAET') IS NULL
          AND COALESCE(dicom_tags->>'institutionName', dicom_tags->>'InstitutionName') IS NULL`,
      [quarantineLabId, RADO_LABS_ID],
    );

    await client.query('COMMIT');
    console.log(`✅ quarantine-unattributed-imaging migration complete — ${rowCount} misattributed studies moved off Rado Labs (lab_id ${RADO_LABS_ID}) into quarantine lab_id ${quarantineLabId}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ quarantine-unattributed-imaging migration failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}
