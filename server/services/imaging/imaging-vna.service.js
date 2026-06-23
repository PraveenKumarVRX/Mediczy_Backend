/** Phase 4: VNA object lifecycle — hot (Orthanc) + warm (S3/MinIO) + archive metadata */
import pool from '../../db/pgPool.js';

export async function registerVnaObject({
  tenantId, studyInstanceUID, s3Key, orthancId, storageTier = 'hot', region = 'ap-south-1',
}) {
  const r = await pool.query(
    `INSERT INTO imaging_vna_objects
       (tenant_id, study_instance_uid, storage_tier, s3_key, orthanc_id, region, lifecycle_state)
     VALUES ($1,$2,$3,$4,$5,$6,'active')
     ON CONFLICT (study_instance_uid, tenant_id)
     DO UPDATE SET s3_key = COALESCE(EXCLUDED.s3_key, imaging_vna_objects.s3_key),
                   orthanc_id = COALESCE(EXCLUDED.orthanc_id, imaging_vna_objects.orthanc_id),
                   storage_tier = EXCLUDED.storage_tier
     RETURNING *`,
    [tenantId, studyInstanceUID, storageTier, s3Key, orthancId, region],
  );
  return r.rows[0];
}

export async function transitionToColdArchive(studyInstanceUID, tenantId) {
  const r = await pool.query(
    `UPDATE imaging_vna_objects SET storage_tier = 'cold', lifecycle_state = 'archived'
     WHERE study_instance_uid = $1 AND tenant_id = $2 RETURNING *`,
    [studyInstanceUID, tenantId],
  );
  return r.rows[0];
}

export async function listVnaByTenant(tenantId, tier = null) {
  const r = await pool.query(
    `SELECT * FROM imaging_vna_objects WHERE tenant_id = $1 AND ($2::text IS NULL OR storage_tier = $2)
     ORDER BY created_at DESC LIMIT 200`,
    [tenantId, tier],
  );
  return r.rows;
}

/** Promote VNA object to warm tier when S3 backup exists. */
export async function promoteToWarmTier(studyInstanceUID, tenantId) {
  const r = await pool.query(
    `UPDATE imaging_vna_objects SET storage_tier = 'warm', lifecycle_state = 'active'
     WHERE study_instance_uid = $1 AND tenant_id = $2 AND s3_key IS NOT NULL
     RETURNING *`,
    [studyInstanceUID, tenantId],
  );
  return r.rows[0];
}

/** Run lifecycle job — warm tier for studies older than N days with S3 key. */
export async function runVnaLifecycleJob(tenantId, olderThanDays = 90) {
  const r = await pool.query(
    `UPDATE imaging_vna_objects SET storage_tier = 'warm', lifecycle_state = 'migrating'
     WHERE tenant_id = $1 AND storage_tier = 'hot' AND s3_key IS NOT NULL
       AND created_at < NOW() - ($2::text || ' days')::interval
     RETURNING id`,
    [tenantId, String(olderThanDays)],
  );
  return { promoted: r.rowCount || r.rows.length };
}
