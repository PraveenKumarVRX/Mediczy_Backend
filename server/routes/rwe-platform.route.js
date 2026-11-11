/**
 * Real-World Evidence platform scaffold — Wave 4
 */
import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import pool from '../db/pgPool.js';

import { schemaVerifier } from '../utils/schema-guard.js';

const ENSURERWESCHEMA_TABLES = ['rwe_export_requests'];

const ensureRweSchema = schemaVerifier({
  pool: pool,
  tables: ENSURERWESCHEMA_TABLES,
  code: 'SCHEMA_NOT_MIGRATED',
  message: 'Apply migration 20261015004800-rwe-export-governance before using RWE exports',
});

const router = express.Router();

router.use(authUser);

router.get('/cohorts', async (req, res) => {
  const hospitalId = req.user.hospital_id || req.user.tenant_id;
  res.json({
    success: true,
    cohorts: [
      { id: 'diabetes-active', name: 'Active diabetics', patients: 0, deidentified: true },
      { id: 'readmission-high', name: 'High readmission risk', patients: 0, deidentified: true },
    ],
    hospitalId,
  });
});

router.post('/export-request', async (req, res) => {
  const { cohortId, purpose } = req.body;
  // Schema is owned by the migration; this used to build the table on
  // the request path, taking an ACCESS EXCLUSIVE lock mid-request.
  await ensureRweSchema();
  const r = await pool.query(
    `INSERT INTO rwe_export_requests (hospital_id, cohort_id, purpose, requested_by)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [req.user.hospital_id || req.user.tenant_id, cohortId, purpose, req.user.id]
  );
  res.status(201).json({ success: true, request: r.rows[0] });
});

export default router;
