/**
 * Explicit PHI access audit for imaging read paths (RIS / doctor imaging / WADO-RS).
 * HIPAA §164.312(b) — audit controls for access to ePHI.
 */
import pool from '../../db/pgPool.js';
import logger from '../../config/logger.js';

export async function logImagingPhiAccess({
  actorId = null,
  actorRole = null,
  actorEmail = null,
  resourceType,
  resourceId = null,
  studyInstanceUid = null,
  seriesInstanceUid = null,
  sopInstanceUid = null,
  path = null,
  ipAddress = null,
  userAgent = null,
}) {
  if (!resourceType) return;
  try {
    await pool.query(
      `INSERT INTO imaging_phi_access_log
         (actor_id, actor_role, actor_email, resource_type, resource_id,
          study_instance_uid, series_instance_uid, sop_instance_uid,
          path, ip_address, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        actorId != null ? String(actorId) : null,
        actorRole,
        actorEmail,
        resourceType,
        resourceId != null ? String(resourceId) : null,
        studyInstanceUid,
        seriesInstanceUid,
        sopInstanceUid,
        path,
        ipAddress,
        userAgent ? String(userAgent).slice(0, 512) : null,
      ],
    );
  } catch (err) {
    // Never break clinical reads if audit table is missing / down
    logger.warn('[ImagingPHI] access log failed', { error: err.message, resourceType });
  }
}
