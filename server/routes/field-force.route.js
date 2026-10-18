/**
 * Smart Force — Field Force API
 * Mounted at /api/field (see app.js)
 * Auth: authTeam + requirePermission('Field Force')
 *
 * Endpoints:
 *   Attendance:    POST /attendance/clock-in  PATCH /attendance/clock-out
 *                  GET  /attendance/today     GET   /attendance/history
 *                  POST /attendance/exception
 *   Visits:        POST /visits   PATCH /visits/:id/check-in
 *                  PATCH /visits/:id/check-out   PUT /visits/:id
 *                  GET  /visits   GET /visits/:id
 *   Daily reports: POST /daily-report   GET /daily-report/today
 *   Manager:       GET  /team/attendance  GET /team/visits  (manager view)
 */

import { Router } from 'express';
import sharedPool from '../db/pgPool.js';
import { authTeam, requirePermission } from '../middleware/team.middleware.js';

const router = Router();
const FF = requirePermission('Field Force');

// ─── helpers ─────────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD in server TZ
}

function tenantId(req) {
  return req.user?.tenantId || req.user?.tenant_id || req.user?.organizationId || 1;
}

// ─── ATTENDANCE ───────────────────────────────────────────────────────────────

// POST /attendance/clock-in
router.post('/attendance/clock-in', authTeam, FF, async (req, res) => {
  const { lat, lng, accuracy_m, address, exception_type, exception_reason } = req.body;
  const uid = req.user.id;
  const tid = tenantId(req);
  const d = today();

  try {
    // prevent double clock-in on same day
    const existing = await sharedPool.query(
      `SELECT id, clock_in_at FROM field_attendance WHERE user_id = $1 AND date = $2`,
      [uid, d]
    );
    if (existing.rows.length && existing.rows[0].clock_in_at) {
      return res.status(409).json({ error: 'Already clocked in today', record: existing.rows[0] });
    }

    const isException = !!(exception_type || exception_reason);
    const status = isException ? 'exception' : 'present';

    const { rows } = await sharedPool.query(
      `INSERT INTO field_attendance
         (user_id, date, clock_in_at, clock_in_lat, clock_in_lng, clock_in_accuracy_m,
          clock_in_address, status, exception_type, exception_reason, tenant_id)
       VALUES ($1,$2,NOW(),$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (user_id, date)
       DO UPDATE SET
         clock_in_at          = EXCLUDED.clock_in_at,
         clock_in_lat         = EXCLUDED.clock_in_lat,
         clock_in_lng         = EXCLUDED.clock_in_lng,
         clock_in_accuracy_m  = EXCLUDED.clock_in_accuracy_m,
         clock_in_address     = EXCLUDED.clock_in_address,
         status               = EXCLUDED.status,
         exception_type       = EXCLUDED.exception_type,
         exception_reason     = EXCLUDED.exception_reason,
         updated_at           = NOW()
       RETURNING *`,
      [uid, d, lat || null, lng || null, accuracy_m || null, address || null,
       status, exception_type || null, exception_reason || null, tid]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('field clock-in error', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /attendance/clock-out
router.patch('/attendance/clock-out', authTeam, FF, async (req, res) => {
  const { lat, lng, accuracy_m } = req.body;
  const uid = req.user.id;
  const d = today();

  try {
    const { rows } = await sharedPool.query(
      `UPDATE field_attendance
       SET clock_out_at         = NOW(),
           clock_out_lat        = $3,
           clock_out_lng        = $4,
           clock_out_accuracy_m = $5,
           updated_at           = NOW()
       WHERE user_id = $1 AND date = $2
       RETURNING *`,
      [uid, d, lat || null, lng || null, accuracy_m || null]
    );
    if (!rows.length) return res.status(404).json({ error: 'No clock-in record found for today' });
    res.json(rows[0]);
  } catch (err) {
    console.error('field clock-out error', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /attendance/today
router.get('/attendance/today', authTeam, FF, async (req, res) => {
  try {
    const { rows } = await sharedPool.query(
      `SELECT a.*,
         EXTRACT(EPOCH FROM (COALESCE(a.clock_out_at, NOW()) - a.clock_in_at))/3600 AS hours_so_far,
         (SELECT COUNT(*) FROM field_visits WHERE user_id = a.user_id
            AND DATE(planned_at) = a.date AND status = 'completed') AS visits_completed,
         (SELECT COUNT(*) FROM field_visits WHERE user_id = a.user_id
            AND DATE(planned_at) = a.date AND status = 'planned') AS visits_planned
       FROM field_attendance a
       WHERE a.user_id = $1 AND a.date = $2`,
      [req.user.id, today()]
    );
    res.json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /attendance/history?month=YYYY-MM&page=1&limit=31
router.get('/attendance/history', authTeam, FF, async (req, res) => {
  const { month, page = 1, limit = 31 } = req.query;
  const uid = req.user.id;
  const offset = (page - 1) * limit;

  let where = `WHERE user_id = $1`;
  const params = [uid];
  if (month) {
    params.push(month + '-01');
    where += ` AND date >= $${params.length}`;
    params.push(month + '-31');
    where += ` AND date <= $${params.length}`;
  }

  try {
    const [data, count] = await Promise.all([
      sharedPool.query(
        `SELECT *, EXTRACT(EPOCH FROM (clock_out_at - clock_in_at))/3600 AS hours_worked
         FROM field_attendance ${where} ORDER BY date DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,
        [...params, limit, offset]
      ),
      sharedPool.query(`SELECT COUNT(*) FROM field_attendance ${where}`, params),
    ]);
    res.json({ records: data.rows, total: parseInt(count.rows[0].count), page: +page, limit: +limit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /attendance/exception  — request regularisation
router.post('/attendance/exception', authTeam, FF, async (req, res) => {
  const { date, exception_type, exception_reason } = req.body;
  if (!date || !exception_type || !exception_reason) {
    return res.status(400).json({ error: 'date, exception_type and exception_reason are required' });
  }
  const uid = req.user.id;
  const tid = tenantId(req);
  try {
    const { rows } = await sharedPool.query(
      `INSERT INTO field_attendance
         (user_id, date, status, exception_type, exception_reason, tenant_id)
       VALUES ($1,$2,'exception',$3,$4,$5)
       ON CONFLICT (user_id, date)
       DO UPDATE SET status='exception', exception_type=$3, exception_reason=$4, updated_at=NOW()
       RETURNING *`,
      [uid, date, exception_type, exception_reason, tid]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── VISITS ───────────────────────────────────────────────────────────────────

// POST /visits  — create a planned visit
router.post('/visits', authTeam, FF, async (req, res) => {
  const {
    entity_type, entity_uid, entity_id, entity_name,
    purpose, planned_at, notes_planned,
  } = req.body;
  if (!entity_name || !purpose) {
    return res.status(400).json({ error: 'entity_name and purpose are required' });
  }
  const uid = req.user.id;
  const tid = tenantId(req);

  // attach to today's attendance if one exists
  const att = await sharedPool.query(
    `SELECT id FROM field_attendance WHERE user_id = $1 AND date = $2`,
    [uid, today()]
  ).catch(() => ({ rows: [] }));

  try {
    const { rows } = await sharedPool.query(
      `INSERT INTO field_visits
         (user_id, attendance_id, entity_type, entity_uid, entity_id, entity_name,
          purpose, planned_at, notes_planned, status, tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'planned',$10)
       RETURNING *`,
      [uid, att.rows[0]?.id || null, entity_type || null, entity_uid || null,
       entity_id || null, entity_name, purpose, planned_at || null,
       notes_planned || null, tid]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /visits/:id/check-in
router.patch('/visits/:id/check-in', authTeam, FF, async (req, res) => {
  const { lat, lng, accuracy_m, address } = req.body;
  try {
    const { rows } = await sharedPool.query(
      `UPDATE field_visits
       SET check_in_at = NOW(), check_in_lat=$3, check_in_lng=$4,
           check_in_accuracy_m=$5, check_in_address=$6,
           status='checked_in', updated_at=NOW()
       WHERE id=$1 AND user_id=$2 AND status='planned'
       RETURNING *`,
      [req.params.id, req.user.id, lat || null, lng || null, accuracy_m || null, address || null]
    );
    if (!rows.length) return res.status(404).json({ error: 'Visit not found or already checked in' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /visits/:id/check-out  — also captures meeting outcome
router.patch('/visits/:id/check-out', authTeam, FF, async (req, res) => {
  const {
    lat, lng, accuracy_m,
    met_person, met_designation, outcome,
    services_discussed, materials_shared,
    next_action, follow_up_date,
  } = req.body;
  try {
    const { rows } = await sharedPool.query(
      `UPDATE field_visits
       SET check_out_at         = NOW(),
           check_out_lat        = $3,
           check_out_lng        = $4,
           check_out_accuracy_m = $5,
           met_person           = $6,
           met_designation      = $7,
           outcome              = $8,
           services_discussed   = $9,
           materials_shared     = $10,
           next_action          = $11,
           follow_up_date       = $12,
           status               = 'completed',
           updated_at           = NOW()
       WHERE id=$1 AND user_id=$2 AND status='checked_in'
       RETURNING *`,
      [
        req.params.id, req.user.id,
        lat || null, lng || null, accuracy_m || null,
        met_person || null, met_designation || null, outcome || null,
        services_discussed || null, materials_shared || null,
        next_action || null, follow_up_date || null,
      ]
    );
    if (!rows.length) return res.status(404).json({ error: 'Visit not found or not in checked_in state' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /visits/:id  — update a planned visit (edit details before check-in)
router.put('/visits/:id', authTeam, FF, async (req, res) => {
  const {
    entity_type, entity_uid, entity_id, entity_name,
    purpose, planned_at, notes_planned, status,
  } = req.body;
  try {
    const { rows } = await sharedPool.query(
      `UPDATE field_visits
       SET entity_type  = COALESCE($3, entity_type),
           entity_uid   = COALESCE($4, entity_uid),
           entity_id    = COALESCE($5, entity_id),
           entity_name  = COALESCE($6, entity_name),
           purpose      = COALESCE($7, purpose),
           planned_at   = COALESCE($8, planned_at),
           notes_planned= COALESCE($9, notes_planned),
           status       = COALESCE($10, status),
           updated_at   = NOW()
       WHERE id=$1 AND user_id=$2
       RETURNING *`,
      [
        req.params.id, req.user.id,
        entity_type, entity_uid, entity_id, entity_name,
        purpose, planned_at, notes_planned,
        status && ['planned','cancelled'].includes(status) ? status : null,
      ]
    );
    if (!rows.length) return res.status(404).json({ error: 'Visit not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /visits?date=YYYY-MM-DD&status=planned&page=1&limit=20
router.get('/visits', authTeam, FF, async (req, res) => {
  const { date, status, entity_type, page = 1, limit = 20 } = req.query;
  const uid = req.user.id;
  const offset = (page - 1) * limit;

  const params = [uid];
  const conds = [`user_id = $1`];

  if (date) { params.push(date); conds.push(`DATE(planned_at) = $${params.length}`); }
  if (status) { params.push(status); conds.push(`status = $${params.length}`); }
  if (entity_type) { params.push(entity_type); conds.push(`entity_type = $${params.length}`); }

  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

  try {
    const [data, count] = await Promise.all([
      sharedPool.query(
        `SELECT * FROM field_visits ${where}
         ORDER BY COALESCE(planned_at, created_at) ASC
         LIMIT $${params.length+1} OFFSET $${params.length+2}`,
        [...params, limit, offset]
      ),
      sharedPool.query(`SELECT COUNT(*) FROM field_visits ${where}`, params),
    ]);
    res.json({ visits: data.rows, total: parseInt(count.rows[0].count), page: +page, limit: +limit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /visits/:id
router.get('/visits/:id', authTeam, FF, async (req, res) => {
  try {
    const { rows } = await sharedPool.query(
      `SELECT * FROM field_visits WHERE id=$1 AND user_id=$2`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Visit not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DAILY REPORTS ────────────────────────────────────────────────────────────

// POST /daily-report
router.post('/daily-report', authTeam, FF, async (req, res) => {
  const {
    planned_visits, completed_visits, missed_visits,
    leads_generated, follow_ups_done,
    key_achievements, challenges, next_day_plan,
  } = req.body;
  const uid = req.user.id;
  const tid = tenantId(req);
  const d = today();

  const att = await sharedPool.query(
    `SELECT id FROM field_attendance WHERE user_id=$1 AND date=$2`, [uid, d]
  ).catch(() => ({ rows: [] }));

  try {
    const { rows } = await sharedPool.query(
      `INSERT INTO daily_field_reports
         (user_id, report_date, attendance_id,
          planned_visits, completed_visits, missed_visits,
          leads_generated, follow_ups_done,
          key_achievements, challenges, next_day_plan,
          submitted_at, tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),$12)
       ON CONFLICT (user_id, report_date)
       DO UPDATE SET
         planned_visits  = EXCLUDED.planned_visits,
         completed_visits= EXCLUDED.completed_visits,
         missed_visits   = EXCLUDED.missed_visits,
         leads_generated = EXCLUDED.leads_generated,
         follow_ups_done = EXCLUDED.follow_ups_done,
         key_achievements= EXCLUDED.key_achievements,
         challenges      = EXCLUDED.challenges,
         next_day_plan   = EXCLUDED.next_day_plan,
         submitted_at    = NOW(),
         updated_at      = NOW()
       RETURNING *`,
      [
        uid, d, att.rows[0]?.id || null,
        planned_visits || 0, completed_visits || 0, missed_visits || 0,
        leads_generated || 0, follow_ups_done || 0,
        key_achievements || null, challenges || null, next_day_plan || null,
        tid,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /daily-report/today
router.get('/daily-report/today', authTeam, FF, async (req, res) => {
  try {
    const { rows } = await sharedPool.query(
      `SELECT * FROM daily_field_reports WHERE user_id=$1 AND report_date=$2`,
      [req.user.id, today()]
    );
    res.json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── MANAGER VIEWS ────────────────────────────────────────────────────────────
// Team lead / regional manager can view their team's attendance and visits.
// Requires 'Field Force Manager' permission (or admin).

const FFM = requirePermission('Field Force Manager');

// GET /team/attendance?date=YYYY-MM-DD&tenant_id=X
router.get('/team/attendance', authTeam, FFM, async (req, res) => {
  const { date = today() } = req.query;
  const tid = tenantId(req);
  try {
    const { rows } = await sharedPool.query(
      `SELECT a.*, u.name AS exec_name, u.email AS exec_email
       FROM field_attendance a
       JOIN users u ON u.id = a.user_id
       WHERE a.tenant_id = $1 AND a.date = $2
       ORDER BY u.name`,
      [tid, date]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /team/visits?date=YYYY-MM-DD
router.get('/team/visits', authTeam, FFM, async (req, res) => {
  const { date = today() } = req.query;
  const tid = tenantId(req);
  try {
    const { rows } = await sharedPool.query(
      `SELECT v.*, u.name AS exec_name
       FROM field_visits v
       JOIN users u ON u.id = v.user_id
       WHERE v.tenant_id = $1 AND DATE(COALESCE(v.planned_at, v.created_at)) = $2
       ORDER BY v.planned_at, u.name`,
      [tid, date]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
