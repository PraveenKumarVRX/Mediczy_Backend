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
import HealthCamp from '../models/postgres/health-camp.model.postgres.js';

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

// ─── TRAVEL REQUESTS ─────────────────────────────────────────────────────────

// POST /travel
router.post('/travel', authTeam, FF, async (req, res) => {
  const {
    travel_date, from_location, to_location, purpose,
    mode_of_transport, estimated_km, estimated_amount, advance_requested,
    linked_visit_ids, camp_id, notes,
  } = req.body;
  if (!travel_date || !from_location || !to_location || !purpose)
    return res.status(400).json({ error: 'travel_date, from_location, to_location and purpose are required' });
  const uid = req.user.id;
  const tid = tenantId(req);
  try {
    const { rows } = await sharedPool.query(
      `INSERT INTO field_travel_requests
         (user_id, travel_date, from_location, to_location, purpose,
          mode_of_transport, estimated_km, estimated_amount, advance_requested,
          linked_visit_ids, camp_id, notes, tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [uid, travel_date, from_location, to_location, purpose,
       mode_of_transport || null, estimated_km || null, estimated_amount || null,
       advance_requested || 0, linked_visit_ids || null, camp_id || null, notes || null, tid]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /travel?month=YYYY-MM&status=pending
router.get('/travel', authTeam, FF, async (req, res) => {
  const { month, status } = req.query;
  const uid = req.user.id;
  const params = [uid];
  const conds = ['user_id = $1'];
  if (month) { params.push(month + '-01'); conds.push(`travel_date >= $${params.length}`);
    params.push(month + '-31'); conds.push(`travel_date <= $${params.length}`); }
  if (status) { params.push(status); conds.push(`status = $${params.length}`); }
  try {
    const { rows } = await sharedPool.query(
      `SELECT * FROM field_travel_requests WHERE ${conds.join(' AND ')} ORDER BY travel_date DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── EXPENSE CLAIMS ───────────────────────────────────────────────────────────

// POST /expenses  — create a claim
router.post('/expenses', authTeam, FF, async (req, res) => {
  const { travel_request_id, claim_month, title, notes } = req.body;
  if (!claim_month || !title)
    return res.status(400).json({ error: 'claim_month and title are required' });
  const uid = req.user.id;
  const tid = tenantId(req);
  try {
    const { rows } = await sharedPool.query(
      `INSERT INTO field_expense_claims (user_id, travel_request_id, claim_month, title, notes, tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [uid, travel_request_id || null, claim_month, title, notes || null, tid]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /expenses?month=YYYY-MM
router.get('/expenses', authTeam, FF, async (req, res) => {
  const { month } = req.query;
  const uid = req.user.id;
  const params = [uid];
  const conds = ['c.user_id = $1'];
  if (month) { params.push(month); conds.push(`c.claim_month = $${params.length}`); }
  try {
    const { rows } = await sharedPool.query(
      `SELECT c.*,
         COALESCE((SELECT SUM(amount) FROM field_expense_items WHERE claim_id = c.id), 0) AS item_total,
         (SELECT COUNT(*) FROM field_expense_items WHERE claim_id = c.id) AS item_count
       FROM field_expense_claims c
       WHERE ${conds.join(' AND ')}
       ORDER BY c.claim_month DESC, c.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /expenses/:id  — claim detail with items
router.get('/expenses/:id', authTeam, FF, async (req, res) => {
  try {
    const [claim, items] = await Promise.all([
      sharedPool.query(
        `SELECT * FROM field_expense_claims WHERE id=$1 AND user_id=$2`,
        [req.params.id, req.user.id]
      ),
      sharedPool.query(
        `SELECT * FROM field_expense_items WHERE claim_id=$1 ORDER BY expense_date, id`,
        [req.params.id]
      ),
    ]);
    if (!claim.rows.length) return res.status(404).json({ error: 'Claim not found' });
    res.json({ ...claim.rows[0], items: items.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /expenses/:id/items  — add a line item
router.post('/expenses/:id/items', authTeam, FF, async (req, res) => {
  const { expense_date, category, description, amount, km_travelled, receipt_url } = req.body;
  if (!expense_date || !category || !amount)
    return res.status(400).json({ error: 'expense_date, category and amount are required' });
  try {
    const claim = await sharedPool.query(
      `SELECT id FROM field_expense_claims WHERE id=$1 AND user_id=$2 AND status IN ('draft','under_review')`,
      [req.params.id, req.user.id]
    );
    if (!claim.rows.length) return res.status(404).json({ error: 'Claim not found or not editable' });

    const { rows } = await sharedPool.query(
      `INSERT INTO field_expense_items (claim_id, expense_date, category, description, amount, km_travelled, receipt_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.id, expense_date, category, description || null, amount, km_travelled || null, receipt_url || null]
    );
    // update total on claim
    await sharedPool.query(
      `UPDATE field_expense_claims
       SET total_amount = (SELECT COALESCE(SUM(amount),0) FROM field_expense_items WHERE claim_id=$1),
           updated_at = NOW()
       WHERE id=$1`,
      [req.params.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /expenses/:id/items/:itemId
router.delete('/expenses/:id/items/:itemId', authTeam, FF, async (req, res) => {
  try {
    const claim = await sharedPool.query(
      `SELECT id FROM field_expense_claims WHERE id=$1 AND user_id=$2 AND status='draft'`,
      [req.params.id, req.user.id]
    );
    if (!claim.rows.length) return res.status(404).json({ error: 'Claim not found or not in draft' });
    await sharedPool.query(`DELETE FROM field_expense_items WHERE id=$1 AND claim_id=$2`, [req.params.itemId, req.params.id]);
    await sharedPool.query(
      `UPDATE field_expense_claims SET total_amount=(SELECT COALESCE(SUM(amount),0) FROM field_expense_items WHERE claim_id=$1), updated_at=NOW() WHERE id=$1`,
      [req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /expenses/:id/submit
router.patch('/expenses/:id/submit', authTeam, FF, async (req, res) => {
  try {
    const { rows } = await sharedPool.query(
      `UPDATE field_expense_claims SET status='submitted', submitted_at=NOW(), updated_at=NOW()
       WHERE id=$1 AND user_id=$2 AND status='draft' RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Claim not found or already submitted' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CAMPS (proxy for field execs using team auth) ────────────────────────────

// GET /camps  — list camps for this tenant
router.get('/camps', authTeam, FF, async (req, res) => {
  const { status } = req.query;
  const tid = tenantId(req);
  try {
    const where = { tenant_id: tid };
    if (status) where.status = status;
    const camps = await HealthCamp.findAll({ where, order: [['start_date', 'DESC']], limit: 50 });
    res.json(camps);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /camps/:id
router.get('/camps/:id', authTeam, FF, async (req, res) => {
  try {
    const camp = await HealthCamp.findByPk(req.params.id);
    if (!camp) return res.status(404).json({ error: 'Camp not found' });
    res.json(camp);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /camps  — propose a new camp (status=planned, needs ops approval to activate)
router.post('/camps', authTeam, FF, async (req, res) => {
  const {
    camp_name, camp_type, location, address,
    start_date, end_date, start_time, end_time,
    organized_by, expected_patients, services_offered,
  } = req.body;
  if (!camp_name || !start_date)
    return res.status(400).json({ error: 'camp_name and start_date are required' });
  const tid = tenantId(req);
  try {
    const camp = await HealthCamp.create({
      camp_name, camp_type, location, address,
      start_date, end_date, start_time, end_time,
      organized_by, expected_patients, services_offered,
      tenant_id: tid, status: 'planned',
    });
    res.status(201).json({ success: true, camp });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── EMPANELMENT APPLICATIONS ─────────────────────────────────────────────────

// POST /empanelment
router.post('/empanelment', authTeam, FF, async (req, res) => {
  const {
    insurer_name, insurer_type, contact_person, contact_phone, contact_email,
    panel_type, target_date, notes, assigned_to,
  } = req.body;
  if (!insurer_name) return res.status(400).json({ error: 'insurer_name is required' });
  const uid = req.user.id;
  const tid = tenantId(req);
  try {
    const { rows } = await sharedPool.query(
      `INSERT INTO field_empanelment_applications
         (insurer_name, insurer_type, contact_person, contact_phone, contact_email,
          panel_type, target_date, notes, assigned_to, created_by, tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [insurer_name, insurer_type || null, contact_person || null, contact_phone || null,
       contact_email || null, panel_type || 'cashless', target_date || null,
       notes || null, assigned_to || uid, uid, tid]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /empanelment?status=identified
router.get('/empanelment', authTeam, FF, async (req, res) => {
  const { status } = req.query;
  const tid = tenantId(req);
  const params = [tid];
  const conds = ['tenant_id = $1'];
  if (status) { params.push(status); conds.push(`status = $${params.length}`); }
  try {
    const { rows } = await sharedPool.query(
      `SELECT a.*,
         (SELECT json_agg(m ORDER BY m.created_at) FROM field_empanelment_milestones m WHERE m.application_id = a.id) AS milestones
       FROM field_empanelment_applications a
       WHERE ${conds.join(' AND ')} ORDER BY a.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /empanelment/:id  — update status / details
router.patch('/empanelment/:id', authTeam, FF, async (req, res) => {
  const {
    status, contact_person, contact_phone, contact_email,
    panel_type, target_date, empanelled_date, expiry_date,
    panel_code, tariff_agreed, mou_signed, notes, assigned_to,
  } = req.body;
  const tid = tenantId(req);
  try {
    const { rows } = await sharedPool.query(
      `UPDATE field_empanelment_applications SET
         status          = COALESCE($3, status),
         contact_person  = COALESCE($4, contact_person),
         contact_phone   = COALESCE($5, contact_phone),
         contact_email   = COALESCE($6, contact_email),
         panel_type      = COALESCE($7, panel_type),
         target_date     = COALESCE($8::date, target_date),
         empanelled_date = COALESCE($9::date, empanelled_date),
         expiry_date     = COALESCE($10::date, expiry_date),
         panel_code      = COALESCE($11, panel_code),
         tariff_agreed   = COALESCE($12, tariff_agreed),
         mou_signed      = COALESCE($13, mou_signed),
         notes           = COALESCE($14, notes),
         assigned_to     = COALESCE($15, assigned_to),
         updated_at      = NOW()
       WHERE id=$1 AND tenant_id=$2 RETURNING *`,
      [req.params.id, tid, status || null, contact_person || null, contact_phone || null,
       contact_email || null, panel_type || null, target_date || null,
       empanelled_date || null, expiry_date || null, panel_code || null,
       tariff_agreed ?? null, mou_signed ?? null, notes || null, assigned_to || null]
    );
    if (!rows.length) return res.status(404).json({ error: 'Application not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /empanelment/:id/milestone
router.post('/empanelment/:id/milestone', authTeam, FF, async (req, res) => {
  const { milestone, status, due_date, notes } = req.body;
  if (!milestone) return res.status(400).json({ error: 'milestone is required' });
  const uid = req.user.id;
  try {
    const { rows } = await sharedPool.query(
      `INSERT INTO field_empanelment_milestones
         (application_id, milestone, status, due_date, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, milestone, status || 'pending', due_date || null, notes || null, uid]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /empanelment/:id/milestone/:mid
router.patch('/empanelment/:id/milestone/:mid', authTeam, FF, async (req, res) => {
  const { status, notes } = req.body;
  try {
    const { rows } = await sharedPool.query(
      `UPDATE field_empanelment_milestones
       SET status=$3, notes=COALESCE($4,notes),
           completed_at = CASE WHEN $3='done' THEN NOW() ELSE completed_at END
       WHERE id=$1 AND application_id=$2 RETURNING *`,
      [req.params.mid, req.params.id, status || 'done', notes || null]
    );
    if (!rows.length) return res.status(404).json({ error: 'Milestone not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── OUTREACH ACCOUNTS ────────────────────────────────────────────────────────

// POST /outreach
router.post('/outreach', authTeam, FF, async (req, res) => {
  const {
    name, type, address, area, city, pin_code,
    primary_contact, contact_phone, contact_email, designation,
    population_served, notes, tags,
  } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'name and type are required' });
  const uid = req.user.id;
  const tid = tenantId(req);
  try {
    const { rows } = await sharedPool.query(
      `INSERT INTO outreach_accounts
         (name, type, address, area, city, pin_code, primary_contact, contact_phone,
          contact_email, designation, population_served, notes, tags, created_by, tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [name, type, address || null, area || null, city || null, pin_code || null,
       primary_contact || null, contact_phone || null, contact_email || null,
       designation || null, population_served || null, notes || null,
       tags || null, uid, tid]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /outreach?type=ngo&status=active_partner
router.get('/outreach', authTeam, FF, async (req, res) => {
  const { type, relationship_status, search } = req.query;
  const tid = tenantId(req);
  const params = [tid];
  const conds = ['tenant_id = $1'];
  if (type) { params.push(type); conds.push(`type = $${params.length}`); }
  if (relationship_status) { params.push(relationship_status); conds.push(`relationship_status = $${params.length}`); }
  if (search) { params.push(`%${search}%`); conds.push(`(name ILIKE $${params.length} OR area ILIKE $${params.length})`); }
  try {
    const { rows } = await sharedPool.query(
      `SELECT * FROM outreach_accounts WHERE ${conds.join(' AND ')} ORDER BY name`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /outreach/:id
router.patch('/outreach/:id', authTeam, FF, async (req, res) => {
  const {
    primary_contact, contact_phone, contact_email, designation,
    relationship_status, last_camp_date, next_followup_date, notes, tags, population_served,
  } = req.body;
  const tid = tenantId(req);
  try {
    const { rows } = await sharedPool.query(
      `UPDATE outreach_accounts SET
         primary_contact     = COALESCE($3, primary_contact),
         contact_phone       = COALESCE($4, contact_phone),
         contact_email       = COALESCE($5, contact_email),
         designation         = COALESCE($6, designation),
         relationship_status = COALESCE($7, relationship_status),
         last_camp_date      = COALESCE($8::date, last_camp_date),
         next_followup_date  = COALESCE($9::date, next_followup_date),
         notes               = COALESCE($10, notes),
         tags                = COALESCE($11, tags),
         population_served   = COALESCE($12, population_served),
         updated_at          = NOW()
       WHERE id=$1 AND tenant_id=$2 RETURNING *`,
      [req.params.id, tid, primary_contact || null, contact_phone || null,
       contact_email || null, designation || null, relationship_status || null,
       last_camp_date || null, next_followup_date || null,
       notes || null, tags || null, population_served || null]
    );
    if (!rows.length) return res.status(404).json({ error: 'Account not found' });
    res.json(rows[0]);
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
