/**
 * Data Export Pipeline Service
 * -----------------------------
 * Implements DPDPA §12 "Right of Access and Portability" and DPDPA §13 "Right to Correction".
 * Also handles DPDPA §14 "Right to Erasure" (data deletion).
 *
 * Export format: JSON (structured) + PDF (human-readable)
 * Storage: AWS S3 (signed URL, 48-hour expiry)
 * Notification: email + in-app notification when export is ready
 *
 * Triggered by:
 *   POST /api/users/data-export        → request export
 *   GET  /api/users/data-export/status → check status
 *   GET  /api/users/data-export/download → download (signed URL)
 */

import { getPool as pgPool } from '../db/postgres.js';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import { addJob, QUEUE_NAMES } from '../config/queues.js';
import { maskPhi } from '../utils/phi-masker.js';
import crypto from 'crypto';

// ─── Queue the export job ─────────────────────────────────────────────────────

export async function requestDataExport(userId, requestType = 'portability', orgId = null) {
  const pool = pgPool();
  const client = await pool.connect();

  try {
    // Create deletion/export request record
    const { rows } = await client.query(
      `INSERT INTO data_deletion_requests
         (user_id, organization_id, request_type, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING id, deadline_at`,
      [userId, orgId, requestType]
    );

    const requestId  = rows[0].id;
    const deadlineAt = rows[0].deadline_at;

    // Queue the export job
    await addJob(QUEUE_NAMES.DATA_EXPORT, 'generate-user-export', {
      requestId,
      userId,
      orgId,
      requestType,
      requestedAt: new Date().toISOString(),
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });

    return { requestId, status: 'pending', deadlineAt };
  } finally {
    client.release();
  }
}

/**
 * Process a data export request (called by the BullMQ worker).
 * Collects all user data, packages it, uploads to S3.
 */
export async function processDataExport(jobData) {
  const { requestId, userId, requestType } = jobData;
  const pool = pgPool();
  const client = await pool.connect();

  try {
    await client.query(
      `UPDATE data_deletion_requests SET status = 'in_progress' WHERE id = $1`,
      [requestId]
    );

    // ── Collect all user data ─────────────────────────────────────────────────
    // Under the member's own RLS context: FORCED-RLS tables (family_members,
    // appointments, patient_consents, …) otherwise return no rows, and the
    // export silently leaves them out.
    let exportPackage;
    await client.query('BEGIN');
    try {
      await setUserRlsContext(client, userId);
      exportPackage = await _collectUserData(userId, client);
      await client.query('COMMIT');
    } catch (collectError) {
      await client.query('ROLLBACK').catch(() => {});
      throw collectError;
    }

    // ── Serialize ─────────────────────────────────────────────────────────────
    const exportJson = JSON.stringify(exportPackage, null, 2);
    const exportHash = crypto.createHash('sha256').update(exportJson).digest('hex');

    // ── Upload to S3 ──────────────────────────────────────────────────────────
    const s3Path = await _uploadToS3(userId, requestId, exportJson);

    // ── Mark complete ─────────────────────────────────────────────────────────
    const tablesAffected = Object.keys(exportPackage.data);
    const recordCount    = tablesAffected.reduce(
      (sum, t) => sum + (Array.isArray(exportPackage.data[t]) ? exportPackage.data[t].length : 1),
      0
    );

    await client.query(
      `UPDATE data_deletion_requests
       SET status = 'completed', completed_at = NOW(),
           tables_affected = $1, records_deleted = $2, export_path = $3
       WHERE id = $4`,
      [tablesAffected, recordCount, s3Path, requestId]
    );

    // Queue notification to user
    await addJob(QUEUE_NAMES.NOTIFICATIONS, 'data-export-ready', {
      userId,
      requestId,
      s3Path,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    });

    return { requestId, s3Path, recordCount, exportHash };
  } catch (err) {
    await client.query(
      `UPDATE data_deletion_requests SET status = 'rejected', rejection_reason = $1 WHERE id = $2`,
      [err.message, requestId]
    );
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Inside an open transaction: act as the member for row-level security
 * (app.current_user_id = the member; org from their account, else 0).
 */
async function setUserRlsContext(client, userId) {
  const { rows: [account] } = await client.query('SELECT organization_id FROM users WHERE id = $1', [userId]);
  const org = Number(account?.organization_id);
  await client.query(
    "SELECT set_config('app.current_org_id', $1, true), set_config('app.current_user_id', $2, true), set_config('app.is_platform_admin', 'false', true)",
    [String(Number.isSafeInteger(org) && org > 0 ? org : 0), String(userId)]
  );
}

// ── Data collection ────────────────────────────────────────────────────────────

async function _collectUserData(userId, client) {
  const [
    userRow,
    appointments,
    prescriptions,
    labOrders,
    vitalSigns,
    healthReadings,
    allergies,
    medications,
    conditions,
    consents,
    familyMembers,
    notifications,
    insurancePolicies,
    claims,
    womensHealthSettings,
    menstrualCycles,
  ] = await Promise.all([
    client.query(`SELECT * FROM users WHERE id = $1`, [userId]),
    client.query(`SELECT * FROM appointments WHERE "userId" = $1 ORDER BY "appointmentDate" DESC LIMIT 1000`, [userId]),
    client.query(`SELECT * FROM prescriptions WHERE "patientId" = $1 ORDER BY "createdAt" DESC LIMIT 500`, [userId]),
    client.query(`SELECT * FROM lab_orders WHERE "patientId" = $1 ORDER BY "createdAt" DESC LIMIT 500`, [userId]),
    client.query(`SELECT * FROM vital_signs WHERE "patientId" = $1 ORDER BY recorded_at DESC LIMIT 500`, [userId]),
    client.query(`SELECT * FROM health_readings WHERE "userId" = $1 ORDER BY recorded_at DESC LIMIT 1000`, [userId]),
    client.query(`SELECT allergen_name, allergen_type, severity, onset_date FROM patient_allergies WHERE user_id = $1`, [userId]),
    client.query(`SELECT drug_name, generic_name, dose, frequency, status FROM patient_medications WHERE user_id = $1`, [userId]),
    client.query(`SELECT condition_name, icd10_code, status, onset_date FROM patient_conditions WHERE user_id = $1`, [userId]),
    client.query(`SELECT consent_type, consented, consented_at, policy_version FROM patient_consents WHERE user_id = $1`, [userId]),
    client.query(`SELECT * FROM family_members WHERE "userId" = $1`, [userId]),
    client.query(`SELECT type, title, created_at FROM notifications WHERE "userId" = $1 ORDER BY created_at DESC LIMIT 200`, [userId]),
    client.query(`SELECT insurer_name, coverage_type, sum_insured, start_date, end_date FROM insurance_policies WHERE "userId" = $1`, [userId]),
    client.query(`SELECT claim_type, claim_amount, status, submitted_at FROM insurance_claims WHERE "patientId" = $1`, [userId]),
    client.query(`SELECT enabled, cycle_length_days, period_length_days, status, updated_at FROM womens_health_settings WHERE user_id = $1`, [userId]),
    client.query(`SELECT period_start, period_end, flow, symptoms, notes, created_at FROM menstrual_cycle_logs WHERE user_id = $1 ORDER BY period_start DESC`, [userId]),
  ]);

  const user = userRow.rows[0] || {};

  return {
    exportedAt:  new Date().toISOString(),
    exportedFor: { userId, email: user.email },
    format:      'DPDPA_PORTABILITY_V1',
    data: {
      profile:          maskPhi({ ...user, password: undefined }),
      appointments:     appointments.rows,
      prescriptions:    prescriptions.rows,
      labOrders:        labOrders.rows,
      vitalSigns:       vitalSigns.rows,
      healthReadings:   healthReadings.rows,
      allergies:        allergies.rows,
      medications:      medications.rows,
      conditions:       conditions.rows,
      consents:         consents.rows,
      familyMembers:    familyMembers.rows.map(r => ({ ...r })),
      notifications:    notifications.rows,
      insurancePolicies: insurancePolicies.rows,
      claims:           claims.rows,
      womensHealth:     { settings: womensHealthSettings.rows[0] || null, periods: menstrualCycles.rows },
    },
  };
}

// ── S3 upload ─────────────────────────────────────────────────────────────────

async function _uploadToS3(userId, requestId, content) {
  const bucket = process.env.DATA_EXPORT_BUCKET || process.env.S3_BUCKET || 'mediczy-data-exports';
  const key    = `exports/${userId}/${requestId}/${new Date().toISOString().split('T')[0]}.json`;

  try {
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const s3 = new S3Client({ region: process.env.AWS_REGION || 'ap-south-1' });

    await s3.send(new PutObjectCommand({
      Bucket:               bucket,
      Key:                  key,
      Body:                 content,
      ContentType:          'application/json',
      ServerSideEncryption: 'AES256',
      Metadata:             { userId: String(userId), requestId },
    }));

    return `s3://${bucket}/${key}`;
  } catch (err) {
    console.warn('[DataExport] S3 upload failed, saving locally:', err.message);
    const fs = await import('fs/promises');
    const localPath = `./exports/${userId}-${requestId}.json`;
    await fs.mkdir('./exports', { recursive: true });
    await fs.writeFile(localPath, content);
    return localPath;
  }
}

/**
 * Generate a signed S3 URL for downloading the export (48-hour expiry).
 */
export async function getExportDownloadUrl(requestId, userId) {
  const pool = pgPool();
  const { rows } = await pool.query(
    `SELECT export_path, status FROM data_deletion_requests
     WHERE id = $1 AND user_id = $2`,
    [requestId, userId]
  );

  if (!rows.length) throw new Error('Export request not found');
  if (rows[0].status !== 'completed') return { status: rows[0].status, url: null };

  const s3Path = rows[0].export_path;
  if (!s3Path?.startsWith('s3://')) return { status: 'completed', url: s3Path };

  const [, , bucket, ...keyParts] = s3Path.split('/');
  const key = keyParts.join('/');

  const { S3Client } = await import('@aws-sdk/client-s3');
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');

  const s3  = new S3Client({ region: process.env.AWS_REGION || 'ap-south-1' });
  const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: 48 * 60 * 60,
  });

  return { status: 'completed', url };
}

/**
 * Execute data erasure for DPDPA Right to Erasure requests.
 * Soft-deletes user data, anonymizes identifying information.
 */
export async function executeErasure(userId, requestId) {
  const pool = pgPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    // The member's own RLS context, or every DELETE/UPDATE on a FORCED-RLS
    // table (family_members, appointments) matches 0 rows and the erasure
    // reports success while the data stays.
    await setUserRlsContext(client, userId);

    // 1. Anonymize user record (keep ID for referential integrity)
    const anonymizedEmail = `deleted_${userId}_${Date.now()}@mediczy.invalid`;
    await client.query(
      `UPDATE users SET
         email          = $1,
         "firstName"    = 'Deleted',
         "lastName"     = 'User',
         "phoneNumber"  = '0000000000',
         "dateOfBirth"  = '1900-01-01',
         "medicalHistory" = '{}',
         "familyHistory"  = '{}',
         "personalHistory"= '{}',
         "allergies"      = '{}',
         "medications"    = '{}',
         "chronicConditions" = '{}',
         "abhaHealthId"   = NULL,
         "profileImage"   = NULL,
         status           = 'deleted',
         metadata         = '{"erasure_requested": true}'
       WHERE id = $2`,
      [anonymizedEmail, userId]
    );

    // 2. Delete PHI from junction tables
    await client.query(`DELETE FROM patient_allergies  WHERE user_id = $1`, [userId]);
    await client.query(`DELETE FROM patient_medications WHERE user_id = $1`, [userId]);
    await client.query(`DELETE FROM patient_conditions  WHERE user_id = $1`, [userId]);
    await client.query(`DELETE FROM family_members      WHERE "userId" = $1`, [userId]);
    await client.query(`DELETE FROM menstrual_cycle_logs   WHERE user_id = $1`, [userId]);
    await client.query(`DELETE FROM womens_health_settings WHERE user_id = $1`, [userId]);

    // 3. Anonymize appointments (keep for clinical records but remove PII)
    await client.query(
      `UPDATE appointments SET
         "patientName"  = 'Deleted Patient',
         "patientEmail" = NULL,
         "patientPhone" = '0000000000',
         "patientDetails" = '{}'
       WHERE "userId" = $1`,
      [userId]
    );

    // 4. Mark request complete
    await client.query(
      `UPDATE data_deletion_requests
       SET status = 'completed', completed_at = NOW(),
           tables_affected = ARRAY['users','patient_allergies','patient_medications','patient_conditions','family_members','menstrual_cycle_logs','womens_health_settings','appointments'],
           records_deleted = 1
       WHERE id = $1`,
      [requestId]
    );

    await client.query('COMMIT');
    console.log(`[DataExport] Erasure completed for user ${userId}`);
    return { status: 'completed', userId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export default {
  requestDataExport,
  processDataExport,
  getExportDownloadUrl,
  executeErasure,
};
