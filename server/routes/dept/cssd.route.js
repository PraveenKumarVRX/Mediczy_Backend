import express from 'express';
import jwt from 'jsonwebtoken';
import { loginCSSD } from '../../controllers/dept/cssd.controller.js';
import { JWT_CONFIG } from '../../config/auth.config.js';
import { connectPostgres } from '../../db/postgres.js';
import { actorFrom, decideOperationsApproval, ensureOperationsGovernanceTables, listOperationsApprovals, listOperationsAudit, recordOperationsAudit, requestOperationsApproval } from '../../services/operations-governance.service.js';

const router = express.Router();

const authCSSD = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, message: 'CSSD token required' });
  try {
    req.cssdUser = jwt.verify(token, JWT_CONFIG.SECRET);
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid CSSD token' });
  }
};

const ensureTables = async () => {
  const db = await connectPostgres();
  await db.query(`
    CREATE TABLE IF NOT EXISTS cssd_sets (
      id SERIAL PRIMARY KEY,
      set_code VARCHAR(80) UNIQUE NOT NULL,
      name VARCHAR(160) NOT NULL,
      service_line VARCHAR(120),
      status VARCHAR(40) NOT NULL DEFAULT 'available',
      sterile_until TIMESTAMP,
      current_location VARCHAR(160),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS cssd_cycles (
      id SERIAL PRIMARY KEY,
      autoclave_id VARCHAR(80) NOT NULL,
      cycle_number VARCHAR(80) NOT NULL,
      temperature NUMERIC(5,2),
      pressure NUMERIC(5,2),
      duration_minutes INTEGER,
      biological_indicator VARCHAR(40),
      status VARCHAR(40) NOT NULL DEFAULT 'in_progress',
      started_at TIMESTAMP NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMP,
      released_by VARCHAR(160),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS cssd_jobs (
      id SERIAL PRIMARY KEY,
      job_number VARCHAR(80) UNIQUE NOT NULL,
      set_id INTEGER REFERENCES cssd_sets(id) ON DELETE SET NULL,
      source_department VARCHAR(120),
      requested_by VARCHAR(160),
      status VARCHAR(40) NOT NULL DEFAULT 'received',
      cycle_id INTEGER REFERENCES cssd_cycles(id) ON DELETE SET NULL,
      notes TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS cssd_set_usage (
      id SERIAL PRIMARY KEY,
      set_id INTEGER NOT NULL REFERENCES cssd_sets(id),
      ot_booking_id INTEGER NOT NULL,
      used_at TIMESTAMP NOT NULL DEFAULT NOW(),
      recorded_by VARCHAR(160)
    );
  `);
  await ensureOperationsGovernanceTables(db);
  return db;
};

router.post('/login', (req, res, next) => { req.skipAuth = true; next(); }, loginCSSD);

router.get('/overview', authCSSD, async (_req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'available')::int AS available_sets,
      COUNT(*) FILTER (WHERE status <> 'available')::int AS unavailable_sets,
      (SELECT COUNT(*)::int FROM cssd_jobs WHERE status <> 'released') AS open_jobs,
      (SELECT COUNT(*)::int FROM cssd_cycles WHERE status = 'in_progress') AS active_cycles
    FROM cssd_sets
  `);
  res.json({ success: true, data: rows[0] });
});

router.get('/sets', authCSSD, async (_req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query('SELECT * FROM cssd_sets ORDER BY updated_at DESC, name ASC');
  res.json({ success: true, data: rows });
});

router.post('/sets', authCSSD, async (req, res) => {
  const db = await ensureTables();
  const { setCode, name, serviceLine, currentLocation } = req.body;
  if (!setCode || !name) return res.status(400).json({ success: false, message: 'setCode and name are required' });
  const { rows } = await db.query(`
    INSERT INTO cssd_sets (set_code, name, service_line, current_location)
    VALUES ($1,$2,$3,$4)
    RETURNING *
  `, [setCode, name, serviceLine || null, currentLocation || 'CSSD']);
  res.status(201).json({ success: true, data: rows[0] });
});

router.get('/jobs', authCSSD, async (_req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query(`
    SELECT j.*, s.set_code, s.name AS set_name
    FROM cssd_jobs j LEFT JOIN cssd_sets s ON s.id = j.set_id
    ORDER BY j.created_at DESC
  `);
  res.json({ success: true, data: rows });
});

router.post('/jobs', authCSSD, async (req, res) => {
  const db = await ensureTables();
  const { setId, sourceDepartment, requestedBy, notes } = req.body;
  if (!setId) return res.status(400).json({ success: false, message: 'setId is required' });
  const { rows } = await db.query(`
    INSERT INTO cssd_jobs (job_number, set_id, source_department, requested_by, notes)
    VALUES ($1,$2,$3,$4,$5)
    RETURNING *
  `, [`JOB-${Date.now()}`, setId, sourceDepartment || null, requestedBy || null, notes || null]);
  await db.query(`UPDATE cssd_sets SET status = 'processing', updated_at = NOW() WHERE id = $1`, [setId]);
  await recordOperationsAudit(db, { module: 'cssd', entityType: 'job', entityId: rows[0].id, action: 'job_created', actor: actorFrom(req.cssdUser, requestedBy || 'CSSD'), details: { setId, sourceDepartment: sourceDepartment || null } });
  res.status(201).json({ success: true, data: rows[0] });
});

router.get('/cycles', authCSSD, async (_req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query('SELECT * FROM cssd_cycles ORDER BY created_at DESC');
  res.json({ success: true, data: rows });
});

router.post('/cycles', authCSSD, async (req, res) => {
  const db = await ensureTables();
  const { autoclaveId, cycleNumber, temperature, pressure, durationMinutes } = req.body;
  if (!autoclaveId || !cycleNumber) return res.status(400).json({ success: false, message: 'autoclaveId and cycleNumber are required' });
  const { rows } = await db.query(`
    INSERT INTO cssd_cycles (autoclave_id, cycle_number, temperature, pressure, duration_minutes)
    VALUES ($1,$2,$3,$4,$5)
    RETURNING *
  `, [autoclaveId, cycleNumber, temperature || null, pressure || null, durationMinutes || null]);
  res.status(201).json({ success: true, data: rows[0] });
});

router.post('/cycles/:id/release', authCSSD, async (req, res) => {
  const db = await ensureTables();
  const { biologicalIndicator = 'pass', releasedBy = 'CSSD' } = req.body;
  const { rows } = await db.query(`
    UPDATE cssd_cycles
    SET status = 'released', biological_indicator = $2, released_by = $3, completed_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [req.params.id, biologicalIndicator, releasedBy]);
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Cycle not found' });
  res.json({ success: true, data: rows[0] });
});

router.post('/jobs/:id/release', authCSSD, async (req, res) => {
  const db = await ensureTables();
  const actor = actorFrom(req.cssdUser, 'CSSD');
  const approval = await requestOperationsApproval(db, { module: 'cssd', entityType: 'job', entityId: Number(req.params.id), action: 'release_job', requestedBy: actor });
  if (approval.status === 'pending') await decideOperationsApproval(db, { id: approval.id, status: 'approved', decidedBy: actor });
  const sterileUntil = req.body.sterileUntil || null;
  const { rows } = await db.query(`
    UPDATE cssd_jobs SET status = 'released', updated_at = NOW() WHERE id = $1 RETURNING *
  `, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Job not found' });
  if (rows[0].set_id) {
    await db.query(`UPDATE cssd_sets SET status = 'available', sterile_until = $2, updated_at = NOW() WHERE id = $1`, [rows[0].set_id, sterileUntil]);
  }
  await recordOperationsAudit(db, { module: 'cssd', entityType: 'job', entityId: rows[0].id, action: 'job_released', actor, details: { sterileUntil } });
  res.json({ success: true, data: rows[0] });
});

router.get('/approvals', authCSSD, async (_req, res) => {
  const db = await ensureTables();
  res.json({ success: true, data: await listOperationsApprovals(db, 'cssd') });
});

router.get('/audit', authCSSD, async (_req, res) => {
  const db = await ensureTables();
  res.json({ success: true, data: await listOperationsAudit(db, 'cssd') });
});

// ── OT-case traceability (added 2026-09-18) ───────────────────────────────────
// Per the audit finding: no link existed between a sterilized set and the
// specific OT case/patient it was used on — standard CSSD-OT integration.
// A set is usable only when it is sterile and available: status = 'available'
// (set by job release) and, when an expiry was recorded, sterile_until not past.
// The status flip and the usage row happen in one transaction, and the flip is
// conditional, so a set can never be issued twice or without a usage row.
router.post('/sets/:id/usage', authCSSD, async (req, res) => {
  try {
    const setId = Number(req.params.id);
    if (!Number.isInteger(setId) || setId <= 0) return res.status(400).json({ success: false, message: 'Invalid set id' });
    const rawBooking = req.body?.otBookingId;
    const otBookingId = typeof rawBooking === 'number' || (typeof rawBooking === 'string' && /^\d+$/.test(rawBooking.trim()))
      ? Number(rawBooking) : NaN;
    if (!Number.isInteger(otBookingId) || otBookingId <= 0 || otBookingId > 2147483647) {
      return res.status(400).json({ success: false, message: 'otBookingId must be a positive integer' });
    }
    const pool = await ensureTables();
    const actor = actorFrom(req.cssdUser, 'CSSD');
    const client = await pool.connect();
    let usage = null;
    let failure = null;
    try {
      await client.query('BEGIN');
      const flipped = await client.query(
        `UPDATE cssd_sets SET status = 'in_use', updated_at = NOW()
         WHERE id = $1 AND status = 'available' AND (sterile_until IS NULL OR sterile_until > NOW())
         RETURNING id`,
        [setId]
      );
      if (flipped.rows[0]) {
        const ins = await client.query(
          'INSERT INTO cssd_set_usage (set_id, ot_booking_id, recorded_by) VALUES ($1, $2, $3) RETURNING *',
          [setId, otBookingId, actor]
        );
        usage = ins.rows[0];
        await client.query('COMMIT');
      } else {
        const { rows } = await client.query(
          'SELECT status, sterile_until, (sterile_until IS NOT NULL AND sterile_until <= NOW()) AS expired FROM cssd_sets WHERE id = $1',
          [setId]
        );
        await client.query('ROLLBACK');
        const cur = rows[0];
        if (!cur) failure = { code: 404, message: 'Set not found' };
        else if (cur.status === 'in_use') failure = { code: 409, message: 'Set is already in use and must be reprocessed before it can be used again' };
        else if (cur.status === 'processing') failure = { code: 409, message: 'Set is still being processed and is not yet sterile' };
        else if (cur.status === 'available' && cur.expired) failure = { code: 409, message: 'Set sterility has expired and it must be reprocessed' };
        else failure = { code: 409, message: `Set is not sterile and available (status: ${cur.status})` };
      }
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
    if (failure) return res.status(failure.code).json({ success: false, message: failure.message });
    // Usage is already committed; an audit-log failure must not turn it into an error response.
    await recordOperationsAudit(pool, { module: 'cssd', entityType: 'set', entityId: setId, action: 'set_used_in_ot_case', actor, details: { otBookingId } })
      .catch((e) => console.error('[cssd] set usage audit failed:', e.message));
    res.status(201).json({ success: true, data: usage });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Full traceability: given an OT case, which sterilized sets were used?
router.get('/ot-bookings/:otBookingId/sets', authCSSD, async (req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query(
    `SELECT u.*, s.set_code, s.name AS set_name, s.sterile_until
     FROM cssd_set_usage u JOIN cssd_sets s ON s.id = u.set_id
     WHERE u.ot_booking_id = $1 ORDER BY u.used_at`,
    [req.params.otBookingId]
  );
  res.json({ success: true, data: rows });
});

// Reverse traceability: given a sterilized set, which OT cases has it been used in?
router.get('/sets/:id/usage-history', authCSSD, async (req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query(
    'SELECT * FROM cssd_set_usage WHERE set_id = $1 ORDER BY used_at DESC',
    [req.params.id]
  );
  res.json({ success: true, data: rows });
});

export default router;
