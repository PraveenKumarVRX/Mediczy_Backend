/**
 * Real-World Evidence platform scaffold — Wave 4
 */
import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import pool from '../db/pgPool.js';

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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rwe_export_requests (
      id BIGSERIAL PRIMARY KEY,
      hospital_id INTEGER,
      cohort_id VARCHAR(80),
      purpose TEXT,
      status VARCHAR(20) DEFAULT 'pending',
      requested_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
  const r = await pool.query(
    `INSERT INTO rwe_export_requests (hospital_id, cohort_id, purpose, requested_by)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [req.user.hospital_id || req.user.tenant_id, cohortId, purpose, req.user.id]
  );
  res.status(201).json({ success: true, request: r.rows[0] });
});

export default router;
