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
    purpose, visit_type, planned_at, notes_planned,
    is_unplanned, planned_sequence,
  } = req.body;
  // `purpose` is this table's original categorisation; `visit_type` is the doc's documented
  // field (regular|followup|sample_drop|cme_invite) — accept either, default purpose from
  // visit_type's first segment so existing purpose-based reporting keeps working.
  const resolvedPurpose = purpose || (visit_type === 'followup' ? 'follow_up' : visit_type === 'cme_invite' ? 'meeting' : 'other');
  if (!entity_name || !(purpose || visit_type)) {
    return res.status(400).json({ error: 'entity_name and purpose (or visit_type) are required' });
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
          purpose, visit_type, planned_at, notes_planned, is_unplanned, planned_sequence, status, tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'planned',$13)
       RETURNING *`,
      [uid, att.rows[0]?.id || null, entity_type || null, entity_uid || null,
       entity_id || null, entity_name, resolvedPurpose, visit_type || 'regular', planned_at || null,
       notes_planned || null, !!is_unplanned, planned_sequence || null, tid]
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
    met_person, met_designation, outcome, notes_actual,
    services_discussed, materials_shared,
    next_action, follow_up_date,
  } = req.body;
  // The doc documents notes_actual as the narrative field; this table's real column is
  // `outcome` — accept either so a client following the doc still writes real data.
  const resolvedOutcome = outcome || notes_actual || null;
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
        met_person || null, met_designation || null, resolvedOutcome,
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
    mode, estimated_cost, // doc-documented aliases for mode_of_transport / estimated_amount
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
       mode_of_transport || mode || null, estimated_km || null, estimated_amount || estimated_cost || null,
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
  // Accept both this table's native fields (claim_month/title) and the doc's documented
  // ones (claim_date/claim_type/total_amount) so a client built against either works.
  const { travel_request_id, claim_month, title, notes, claim_date, claim_type, total_amount } = req.body;
  const resolvedMonth = claim_month || (claim_date ? claim_date.slice(0, 7) + '-01' : null);
  const resolvedTitle = title || (claim_type ? `${claim_type} claim` : null);
  if (!resolvedMonth || !resolvedTitle)
    return res.status(400).json({ error: 'claim_month (or claim_date) and title (or claim_type) are required' });
  const uid = req.user.id;
  const tid = tenantId(req);
  try {
    const { rows } = await sharedPool.query(
      `INSERT INTO field_expense_claims (user_id, travel_request_id, claim_month, title, total_amount, notes, tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [uid, travel_request_id || null, resolvedMonth, resolvedTitle, total_amount || null, notes || null, tid]
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
  // expense_type/description are the doc's names; category/description are this table's —
  // category is free text (no CHECK constraint), so accepting either is safe.
  const { expense_date, category, expense_type, description, amount, km_travelled, receipt_url } = req.body;
  const resolvedCategory = category || expense_type;
  const resolvedDate = expense_date || new Date().toISOString().slice(0, 10);
  if (!resolvedCategory || !amount)
    return res.status(400).json({ error: 'category (or expense_type) and amount are required' });
  try {
    const claim = await sharedPool.query(
      `SELECT id FROM field_expense_claims WHERE id=$1 AND user_id=$2 AND status IN ('draft','under_review')`,
      [req.params.id, req.user.id]
    );
    if (!claim.rows.length) return res.status(404).json({ error: 'Claim not found or not editable' });

    const { rows } = await sharedPool.query(
      `INSERT INTO field_expense_items (claim_id, expense_date, category, description, amount, km_travelled, receipt_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.id, resolvedDate, resolvedCategory, description || null, amount, km_travelled || null, receipt_url || null]
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
  const { status, campaign_type } = req.query;
  const tid = tenantId(req);
  try {
    const where = { tenant_id: tid };
    if (status) where.status = status;
    if (campaign_type) where.campaign_type = campaign_type;
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
      `SELECT a.*, (u."firstName" || ' ' || u."lastName") AS exec_name, u.email AS exec_email
       FROM field_attendance a
       JOIN users u ON u.id = a.user_id
       WHERE a.tenant_id = $1 AND a.date = $2
       ORDER BY (u."firstName" || ' ' || u."lastName")`,
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
      `SELECT v.*, (u."firstName" || ' ' || u."lastName") AS exec_name
       FROM field_visits v
       JOIN users u ON u.id = v.user_id
       WHERE v.tenant_id = $1 AND DATE(COALESCE(v.planned_at, v.created_at)) = $2
       ORDER BY v.planned_at, (u."firstName" || ' ' || u."lastName")`,
      [tid, date]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PHASE 5: GAP COMPLETIONS ────────────────────────────────────────────────

// ── exec self-view targets ───────────────────────────────────────────────────

// GET /my/targets
// field_targets is month-based (visits_target/doctors_target/etc per calendar month),
// not the generic target_type/target_value/period_start/period_end shape this endpoint's
// response documents — expand each month's row into one entry per non-null target type.
router.get('/my/targets', authTeam, FF, async (req, res) => {
  const uid = req.user.id;
  const tid = tenantId(req);
  try {
    // field_targets.month is a 'YYYY-MM' VARCHAR(7), not a date column — convert via
    // (month || '-01')::date rather than month::date, which would truncate/error.
    const { rows } = await sharedPool.query(
      `SELECT t.*,
         (t.month || '-01')::date AS period_start,
         ((t.month || '-01')::date + INTERVAL '1 month' - INTERVAL '1 day')::date AS period_end,
         COALESCE(
           (SELECT COUNT(*) FROM field_visits v
            WHERE v.user_id = $1 AND DATE(v.created_at) BETWEEN (t.month || '-01')::date AND ((t.month || '-01')::date + INTERVAL '1 month' - INTERVAL '1 day')::date),0
         ) AS visits_done,
         COALESCE(
           (SELECT COUNT(*) FROM field_leads l
            WHERE l.user_id = $1 AND l.pipeline_stage = 'closed_won'
            AND DATE(l.closed_at) BETWEEN (t.month || '-01')::date AND ((t.month || '-01')::date + INTERVAL '1 month' - INTERVAL '1 day')::date),0
         ) AS leads_closed
       FROM field_targets t
       WHERE t.user_id = $1 AND t.tenant_id = $2
       ORDER BY t.month DESC LIMIT 12`,
      [uid, tid]
    );
    const TARGET_TYPES = [
      ['visits', 'visits_target'], ['doctors', 'doctors_target'], ['corporates', 'corporates_target'],
      ['camps', 'camps_target'], ['leads', 'leads_target'], ['empanelment', 'empanelment_target'],
      ['revenue', 'revenue_target'],
    ];
    const expanded = rows.flatMap((row) =>
      TARGET_TYPES.filter(([, col]) => row[col] != null).map(([target_type, col]) => ({
        id: row.id,
        target_type,
        target_value: row[col],
        period_start: row.period_start,
        period_end: row.period_end,
        visits_done: row.visits_done,
        leads_closed: row.leads_closed,
      }))
    );
    res.json(expanded);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /my/scorecard
router.get('/my/scorecard', authTeam, FF, async (req, res) => {
  const uid = req.user.id;
  const tid = tenantId(req);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  try {
    const [visits, att, expenses, leads, targets] = await Promise.all([
      sharedPool.query(
        `SELECT COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status='completed') AS completed
         FROM field_visits WHERE user_id=$1 AND tenant_id=$2
         AND DATE(created_at) BETWEEN $3 AND $4`,
        [uid, tid, monthStart, monthEnd]
      ),
      sharedPool.query(
        `SELECT COUNT(*) AS present_days FROM field_attendance
         WHERE user_id=$1 AND tenant_id=$2 AND date BETWEEN $3 AND $4
         AND status IN ('present','late','exception')`,
        [uid, tid, monthStart, monthEnd]
      ),
      sharedPool.query(
        `SELECT COUNT(*) AS claims,
           SUM(total_amount) AS total_claimed,
           SUM(CASE WHEN status='approved' THEN total_amount ELSE 0 END) AS approved_amount
         FROM field_expense_claims WHERE user_id=$1 AND tenant_id=$2
         AND DATE(created_at) BETWEEN $3 AND $4`,
        [uid, tid, monthStart, monthEnd]
      ),
      sharedPool.query(
        `SELECT COUNT(*) AS total,
           COUNT(*) FILTER (WHERE pipeline_stage='closed_won') AS won,
           COUNT(*) FILTER (WHERE pipeline_stage='closed_lost') AS lost
         FROM field_leads WHERE user_id=$1 AND tenant_id=$2
         AND DATE(created_at) BETWEEN $3 AND $4`,
        [uid, tid, monthStart, monthEnd]
      ),
      // field_targets.month is a 'YYYY-MM' string — compare against the same format
      sharedPool.query(
        `SELECT * FROM field_targets WHERE user_id=$1 AND tenant_id=$2
         AND month = to_char($3::date, 'YYYY-MM') ORDER BY created_at DESC LIMIT 1`,
        [uid, tid, monthStart]
      ),
    ]);
    const targetRow = targets.rows[0] || null;
    res.json({
      period: { start: monthStart, end: monthEnd },
      visits:   visits.rows[0],
      attendance: att.rows[0],
      expenses: expenses.rows[0],
      leads:    leads.rows[0],
      target:   targetRow ? { target_type: 'visits', target_value: targetRow.visits_target, ...targetRow } : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── out-of-beat exceptions ────────────────────────────────────────────────────

// POST /visits/:id/exception  — submit an out-of-beat exception request
router.post('/visits/:id/exception', authTeam, FF, async (req, res) => {
  const { beat_territory_id, distance_breach_km, reason } = req.body;
  const uid = req.user.id;
  const tid = tenantId(req);
  if (!reason) return res.status(400).json({ error: 'reason is required' });
  try {
    const { rows } = await sharedPool.query(
      `INSERT INTO field_visit_exceptions
         (visit_id, user_id, tenant_id, beat_territory_id, distance_breach_km, reason)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [req.params.id, uid, tid, beat_territory_id || null, distance_breach_km || null, reason]
    );
    res.status(201).json(rows[0] || { message: 'Exception already submitted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /visits/:id/exception
router.get('/visits/:id/exception', authTeam, FF, async (req, res) => {
  const uid = req.user.id;
  try {
    const { rows } = await sharedPool.query(
      `SELECT e.*, (u."firstName" || ' ' || u."lastName") AS reviewed_by_name
       FROM field_visit_exceptions e
       LEFT JOIN users u ON u.id = e.reviewed_by
       WHERE e.visit_id = $1 AND e.user_id = $2`,
      [req.params.id, uid]
    );
    res.json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /my/exceptions?status=pending
router.get('/my/exceptions', authTeam, FF, async (req, res) => {
  const { status } = req.query;
  const uid = req.user.id;
  const tid = tenantId(req);
  const params = [uid, tid];
  const conds = ['e.user_id=$1', 'e.tenant_id=$2'];
  if (status) { params.push(status); conds.push(`e.status=$${params.length}`); }
  try {
    const { rows } = await sharedPool.query(
      `SELECT e.*, v.entity_name, v.visit_type, (u."firstName" || ' ' || u."lastName") AS reviewed_by_name
       FROM field_visit_exceptions e
       LEFT JOIN field_visits v ON v.id = e.visit_id
       LEFT JOIN users u ON u.id = e.reviewed_by
       WHERE ${conds.join(' AND ')} ORDER BY e.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── monthly tour plans ────────────────────────────────────────────────────────

// GET /tour-plans
router.get('/tour-plans', authTeam, FF, async (req, res) => {
  const uid = req.user.id;
  const tid = tenantId(req);
  try {
    const { rows } = await sharedPool.query(
      `SELECT * FROM field_tour_plans WHERE user_id=$1 AND tenant_id=$2
       ORDER BY month DESC LIMIT 12`,
      [uid, tid]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /tour-plans — create or update draft for a month
router.post('/tour-plans', authTeam, FF, async (req, res) => {
  const { month, beat_dates, notes } = req.body;
  const uid = req.user.id;
  const tid = tenantId(req);
  if (!month) return res.status(400).json({ error: 'month (YYYY-MM-01) is required' });
  try {
    const { rows } = await sharedPool.query(
      `INSERT INTO field_tour_plans (user_id, tenant_id, month, beat_dates, notes)
       VALUES ($1,$2,$3::date,$4,$5)
       ON CONFLICT (user_id, month)
       DO UPDATE SET beat_dates=$4, notes=$5, status='draft', updated_at=NOW()
       RETURNING *`,
      [uid, tid, month, JSON.stringify(beat_dates || {}), notes || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /tour-plans/:id/submit
router.patch('/tour-plans/:id/submit', authTeam, FF, async (req, res) => {
  const uid = req.user.id;
  try {
    const { rows } = await sharedPool.query(
      `UPDATE field_tour_plans SET status='submitted', submitted_at=NOW(), updated_at=NOW()
       WHERE id=$1 AND user_id=$2 AND status='draft'
       RETURNING *`,
      [req.params.id, uid]
    );
    if (!rows.length) return res.status(404).json({ error: 'Draft tour plan not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── health camp registrations ─────────────────────────────────────────────────

// POST /camps/:id/register
router.post('/camps/:id/register', authTeam, FF, async (req, res) => {
  const { patient_name, age, gender, phone, address, screening_notes, high_risk_flag, referred_to } = req.body;
  const uid = req.user.id;
  const tid = tenantId(req);
  if (!patient_name) return res.status(400).json({ error: 'patient_name is required' });
  try {
    const { rows } = await sharedPool.query(
      `INSERT INTO field_camp_registrations
         (camp_id, tenant_id, registered_by, patient_name, age, gender, phone,
          address, screening_notes, high_risk_flag, referred_to)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.params.id, tid, uid, patient_name, age||null, gender||null, phone||null,
       address||null, screening_notes||null, high_risk_flag||false, referred_to||null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /camps/:id/registrations
router.get('/camps/:id/registrations', authTeam, FF, async (req, res) => {
  const tid = tenantId(req);
  try {
    const { rows } = await sharedPool.query(
      `SELECT r.*, (u."firstName" || ' ' || u."lastName") AS registered_by_name
       FROM field_camp_registrations r
       JOIN users u ON u.id = r.registered_by
       WHERE r.camp_id=$1 AND r.tenant_id=$2 ORDER BY r.created_at DESC`,
      [req.params.id, tid]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── collateral / sample handovers ────────────────────────────────────────────

// POST /handovers
router.post('/handovers', authTeam, FF, async (req, res) => {
  const { visit_id, doctor_crm_id, items, digital_signature_url, geofence_verified, lat, lng } = req.body;
  const uid = req.user.id;
  const tid = tenantId(req);
  if (!items || !items.length) return res.status(400).json({ error: 'items array is required' });
  try {
    const { rows } = await sharedPool.query(
      `INSERT INTO field_handovers
         (visit_id, doctor_crm_id, user_id, tenant_id, items,
          digital_signature_url, geofence_verified, lat, lng)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [visit_id||null, doctor_crm_id||null, uid, tid, JSON.stringify(items),
       digital_signature_url||null, geofence_verified||false, lat||null, lng||null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /handovers?visit_id=&doctor_crm_id=
router.get('/handovers', authTeam, FF, async (req, res) => {
  const { visit_id, doctor_crm_id } = req.query;
  const uid = req.user.id;
  const tid = tenantId(req);
  const params = [uid, tid];
  const conds = ['user_id=$1', 'tenant_id=$2'];
  if (visit_id)      { params.push(visit_id);      conds.push(`visit_id=$${params.length}`); }
  if (doctor_crm_id) { params.push(doctor_crm_id); conds.push(`doctor_crm_id=$${params.length}`); }
  try {
    const { rows } = await sharedPool.query(
      `SELECT * FROM field_handovers WHERE ${conds.join(' AND ')} ORDER BY created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── outreach permissions ──────────────────────────────────────────────────────

// GET /outreach-permissions
router.get('/outreach-permissions', authTeam, FF, async (req, res) => {
  const { status, type } = req.query;
  const tid = tenantId(req);
  const params = [tid];
  const conds = ['p.tenant_id=$1'];
  if (status) { params.push(status); conds.push(`p.status=$${params.length}`); }
  if (type)   { params.push(type);   conds.push(`p.permission_type=$${params.length}`); }
  try {
    const { rows } = await sharedPool.query(
      `SELECT p.*, (u."firstName" || ' ' || u."lastName") AS created_by_name FROM field_outreach_permissions p
       JOIN users u ON u.id = p.user_id
       WHERE ${conds.join(' AND ')} ORDER BY p.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /outreach-permissions
router.post('/outreach-permissions', authTeam, FF, async (req, res) => {
  const { outreach_id, permission_type, authority_name, reference_no,
          valid_from, valid_until, document_url, notes } = req.body;
  const uid = req.user.id;
  const tid = tenantId(req);
  if (!permission_type || !authority_name) {
    return res.status(400).json({ error: 'permission_type and authority_name required' });
  }
  try {
    const { rows } = await sharedPool.query(
      `INSERT INTO field_outreach_permissions
         (outreach_id, tenant_id, user_id, permission_type, authority_name,
          reference_no, valid_from, valid_until, document_url, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [outreach_id||null, tid, uid, permission_type, authority_name,
       reference_no||null, valid_from||null, valid_until||null, document_url||null, notes||null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PHASE 6: REMAINING GAP COMPLETIONS ──────────────────────────────────────

import llmProvider from '../services/ai-brain/llm-provider.js';

// ── day-plan sequence (multi-stop planner) ────────────────────────────────────

// GET /my/day-plan?date=YYYY-MM-DD  — ordered visit list for the day
router.get('/my/day-plan', authTeam, FF, async (req, res) => {
  const { date = today() } = req.query;
  const uid = req.user.id;
  const tid = tenantId(req);
  try {
    const { rows } = await sharedPool.query(
      `SELECT v.*, e.status AS exception_status
       FROM field_visits v
       LEFT JOIN field_visit_exceptions e ON e.visit_id = v.id
       WHERE v.user_id=$1 AND v.tenant_id=$2
         AND DATE(COALESCE(v.planned_at, v.created_at)) = $3
       ORDER BY COALESCE(v.planned_sequence, 999), v.planned_at`,
      [uid, tid, date]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /visits/:id/sequence  — set stop sequence + estimated arrival
router.patch('/visits/:id/sequence', authTeam, FF, async (req, res) => {
  const { planned_sequence, estimated_arrival } = req.body;
  const uid = req.user.id;
  try {
    const { rows } = await sharedPool.query(
      `UPDATE field_visits SET planned_sequence=$3, estimated_arrival=$4::timestamptz,
         updated_at=NOW()
       WHERE id=$1 AND user_id=$2 RETURNING *`,
      [req.params.id, uid, planned_sequence ?? null, estimated_arrival ?? null]
    );
    if (!rows.length) return res.status(404).json({ error: 'Visit not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /visits/:id/checklist  — update in-progress checklist items
router.patch('/visits/:id/checklist', authTeam, FF, async (req, res) => {
  const { visit_checklist, duration_seconds } = req.body;
  const uid = req.user.id;
  try {
    const { rows } = await sharedPool.query(
      `UPDATE field_visits SET
         visit_checklist = COALESCE($3::jsonb, visit_checklist),
         duration_seconds = COALESCE($4, duration_seconds),
         updated_at = NOW()
       WHERE id=$1 AND user_id=$2 RETURNING *`,
      [req.params.id, uid, visit_checklist ? JSON.stringify(visit_checklist) : null,
       duration_seconds ?? null]
    );
    if (!rows.length) return res.status(404).json({ error: 'Visit not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── doctor CRM (exec, read-only) ──────────────────────────────────────────────
// Documented at GET /api/field/doctor-crm but never implemented — the only existing
// doctor-crm route lived under /api/crm/field-force (authCRM, Business Head login),
// which a field exec's team JWT can't authenticate against.

// GET /doctor-crm  — read-only directory search for the field exec's own use
router.get('/doctor-crm', authTeam, FF, async (req, res) => {
  const { search, relationship_status } = req.query;
  const tid = tenantId(req);
  const params = [tid];
  const conds = ['tenant_id=$1'];
  if (search) {
    params.push(`%${search}%`);
    conds.push(`(doctor_name ILIKE $${params.length} OR hospital_affiliation ILIKE $${params.length} OR city ILIKE $${params.length})`);
  }
  if (relationship_status) {
    params.push(relationship_status);
    conds.push(`relationship_status=$${params.length}`);
  }
  try {
    const { rows } = await sharedPool.query(
      `SELECT id, doctor_name, qualification, specialty, hospital_affiliation, city, phone,
              relationship_status, last_visit_date, next_visit_date
       FROM field_doctor_crm WHERE ${conds.join(' AND ')}
       ORDER BY doctor_name ASC LIMIT 100`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── leads (exec self-view) ────────────────────────────────────────────────────
// Same situation as doctor-crm above: documented at GET/POST /api/field/leads but only
// ever implemented under the BH-only /api/crm/field-force path.

// GET /leads  — the exec's own leads
router.get('/leads', authTeam, FF, async (req, res) => {
  const { status } = req.query;
  const uid = req.user.id;
  const tid = tenantId(req);
  const params = [uid, tid];
  const conds = ['user_id=$1', 'tenant_id=$2'];
  if (status) { params.push(status); conds.push(`status=$${params.length}`); }
  try {
    const { rows } = await sharedPool.query(
      `SELECT * FROM field_leads WHERE ${conds.join(' AND ')} ORDER BY created_at DESC LIMIT 100`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /leads  — create a new lead from the field
router.post('/leads', authTeam, FF, async (req, res) => {
  // field_leads has no `city` column — fold it into notes if the caller sends one
  // (the doc's example includes it) rather than silently dropping the data.
  const { lead_type, entity_name, contact_name, phone, city, notes, visit_id } = req.body;
  if (!entity_name) return res.status(400).json({ error: 'entity_name is required' });
  const uid = req.user.id;
  const tid = tenantId(req);
  const combinedNotes = [city ? `City: ${city}` : null, notes || null].filter(Boolean).join(' — ') || null;
  try {
    const { rows } = await sharedPool.query(
      `INSERT INTO field_leads
         (user_id, tenant_id, visit_id, lead_type, entity_name, contact_name, contact_phone, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'new')
       RETURNING *`,
      [uid, tid, visit_id || null, lead_type || 'other', entity_name, contact_name || null, phone || null, combinedNotes]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── institution profile ───────────────────────────────────────────────────────

// GET /institution/:entityType/:entityId  — profile: visits + open leads + empanelment
router.get('/institution/:entityType/:entityId', authTeam, FF, async (req, res) => {
  const { entityType, entityId } = req.params;
  const tid = tenantId(req);
  try {
    const [visits, leads, emp] = await Promise.all([
      sharedPool.query(
        `SELECT v.id, v.visit_type, v.status, v.planned_at, v.created_at,
           (u."firstName" || ' ' || u."lastName") AS exec_name, v.outcome
         FROM field_visits v LEFT JOIN users u ON u.id=v.user_id
         WHERE v.entity_type=$1 AND v.entity_id=$2 AND v.tenant_id=$3
         ORDER BY v.created_at DESC LIMIT 30`,
        [entityType, entityId, tid]
      ),
      // field_leads has no entity_id column — it links back to the visit it came from,
      // so match leads via visits already found for this entity (also catches leads
      // raised from a visit whose entity_type/entity_id matches, through that visit's id).
      sharedPool.query(
        `SELECT l.id, l.lead_type, l.entity_name, l.pipeline_stage, l.contract_value, l.created_at
         FROM field_leads l
         WHERE l.tenant_id=$3 AND (
           l.entity_type=$1 AND l.entity_name = (
             SELECT entity_name FROM field_visits WHERE entity_type=$1 AND entity_id=$2 LIMIT 1
           )
           OR l.visit_id IN (SELECT id FROM field_visits WHERE entity_type=$1 AND entity_id=$2)
         )
         ORDER BY l.created_at DESC LIMIT 10`,
        [entityType, entityId, tid]
      ),
      // field_empanelment_applications has no entity_type/entity_id/entity_name columns at
      // all — it's modeled around insurer_name (the insurer side of the deal), with no
      // link back to which hospital/clinic the application is about. There's no real data
      // to query here without a schema change, so return empty rather than erroring.
      Promise.resolve({ rows: [] }),
    ]);
    res.json({
      entity_type: entityType,
      entity_id:   entityId,
      visits:      visits.rows,
      leads:       leads.rows,
      empanelment: emp.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── CME events (exec view) ────────────────────────────────────────────────────

// GET /cme-events?status=planned
router.get('/cme-events', authTeam, FF, async (req, res) => {
  const { status } = req.query;
  const tid = tenantId(req);
  const params = [tid];
  const conds = ['e.tenant_id=$1'];
  if (status) { params.push(status); conds.push(`e.status=$${params.length}`); }
  try {
    const { rows } = await sharedPool.query(
      `SELECT e.*,
         (SELECT COUNT(*) FROM field_cme_attendees a WHERE a.cme_event_id=e.id) AS invited_count,
         (SELECT COUNT(*) FROM field_cme_attendees a WHERE a.cme_event_id=e.id AND a.attended) AS attended_count,
         (SELECT COUNT(*) FROM field_cme_speakers s WHERE s.cme_event_id=e.id) AS speaker_count
       FROM field_cme_events e
       WHERE ${conds.join(' AND ')} ORDER BY e.scheduled_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /cme-events
router.post('/cme-events', authTeam, FF, async (req, res) => {
  const { name, event_type, scheduled_at, venue, city, max_attendees, budget_allocated, notes } = req.body;
  const uid = req.user.id;
  const tid = tenantId(req);
  if (!name || !scheduled_at) return res.status(400).json({ error: 'name and scheduled_at required' });
  try {
    const { rows } = await sharedPool.query(
      `INSERT INTO field_cme_events
         (tenant_id, created_by, name, event_type, scheduled_at, venue, city,
          max_attendees, budget_allocated, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [tid, uid, name, event_type||'cme', scheduled_at, venue||null, city||null,
       max_attendees||null, budget_allocated||null, notes||null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /cme-events/:id/invite  — invite a doctor to CME
router.post('/cme-events/:id/invite', authTeam, FF, async (req, res) => {
  const { doctor_crm_id, doctor_name, phone } = req.body;
  const uid = req.user.id;
  const tid = tenantId(req);
  const qr_token = crypto.randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase();
  try {
    const { rows } = await sharedPool.query(
      `INSERT INTO field_cme_attendees
         (cme_event_id, doctor_crm_id, tenant_id, invited_by, doctor_name, phone,
          invitation_sent_at, qr_token)
       VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7)
       ON CONFLICT DO NOTHING RETURNING *`,
      [req.params.id, doctor_crm_id||null, tid, uid, doctor_name||null, phone||null, qr_token]
    );
    res.status(201).json(rows[0] || { message: 'Already invited' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /cme-events/:id/checkin  — validate QR token and mark attendance
router.post('/cme-events/:id/checkin', authTeam, FF, async (req, res) => {
  const { qr_token } = req.body;
  if (!qr_token) return res.status(400).json({ error: 'qr_token required' });
  try {
    const { rows } = await sharedPool.query(
      `UPDATE field_cme_attendees SET attended=TRUE, checkin_at=NOW()
       WHERE cme_event_id=$1 AND qr_token=$2 AND attended=FALSE
       RETURNING *`,
      [req.params.id, qr_token]
    );
    if (!rows.length) return res.status(404).json({ error: 'Invalid QR token or already checked in' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /cme-events/:id/attendees
router.get('/cme-events/:id/attendees', authTeam, FF, async (req, res) => {
  try {
    const { rows } = await sharedPool.query(
      `SELECT a.*, (u."firstName" || ' ' || u."lastName") AS invited_by_name
       FROM field_cme_attendees a
       LEFT JOIN users u ON u.id=a.invited_by
       WHERE a.cme_event_id=$1 ORDER BY a.created_at`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── notifications ─────────────────────────────────────────────────────────────

// GET /notifications?unread=true
router.get('/notifications', authTeam, FF, async (req, res) => {
  const { unread, limit = 50 } = req.query;
  const uid = req.user.id;
  const tid = tenantId(req);
  const params = [uid, tid, Math.min(Number(limit), 200)];
  const conds = ['user_id=$1', 'tenant_id=$2'];
  if (unread === 'true') conds.push('read=FALSE');
  try {
    const { rows } = await sharedPool.query(
      `SELECT * FROM field_notifications WHERE ${conds.join(' AND ')}
       ORDER BY created_at DESC LIMIT $3`,
      params
    );
    const { rows: cnt } = await sharedPool.query(
      `SELECT COUNT(*) AS unread_count FROM field_notifications
       WHERE user_id=$1 AND tenant_id=$2 AND read=FALSE`,
      [uid, tid]
    );
    res.json({ notifications: rows, unread_count: Number(cnt[0].unread_count) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /notifications/:id/read
router.patch('/notifications/:id/read', authTeam, FF, async (req, res) => {
  const uid = req.user.id;
  try {
    await sharedPool.query(
      `UPDATE field_notifications SET read=TRUE, read_at=NOW()
       WHERE id=$1 AND user_id=$2`,
      [req.params.id, uid]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /notifications/read-all
router.patch('/notifications/read-all', authTeam, FF, async (req, res) => {
  const uid = req.user.id;
  const tid = tenantId(req);
  try {
    const { rowCount } = await sharedPool.query(
      `UPDATE field_notifications SET read=TRUE, read_at=NOW()
       WHERE user_id=$1 AND tenant_id=$2 AND read=FALSE`,
      [uid, tid]
    );
    res.json({ marked_read: rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── offline sync ──────────────────────────────────────────────────────────────

// POST /sync  — process a queue of offline operations idempotently
router.post('/sync', authTeam, FF, async (req, res) => {
  const { queue = [], device_id, last_sync_at } = req.body;
  const uid = req.user.id;
  const tid = tenantId(req);
  if (!Array.isArray(queue)) return res.status(400).json({ error: 'queue must be an array' });

  const results = [];
  for (const item of queue.slice(0, 200)) {
    const { idempotency_key, operation, payload } = item;
    if (!idempotency_key || !operation) {
      results.push({ idempotency_key, status: 'skipped', error: 'missing idempotency_key or operation' });
      continue;
    }

    // check idempotency — already processed?
    const { rows: existing } = await sharedPool.query(
      `SELECT id, status, result FROM field_sync_log WHERE idempotency_key=$1`,
      [idempotency_key]
    );
    if (existing.length) {
      results.push({ idempotency_key, status: 'duplicate', result: existing[0].result });
      continue;
    }

    let status = 'processed';
    let result = null;
    let error_message = null;

    try {
      switch (operation) {
        case 'clock_in': {
          const { lat, lng, accuracy_m, address } = payload;
          const d = new Date().toISOString().slice(0, 10);
          const { rows } = await sharedPool.query(
            `INSERT INTO field_attendance
               (user_id, date, clock_in_at, clock_in_lat, clock_in_lng, clock_in_accuracy_m, clock_in_address, status, tenant_id)
             VALUES ($1,$2,NOW(),$3,$4,$5,$6,'present',$7)
             ON CONFLICT (user_id, date) DO UPDATE SET
               clock_in_lat=$3, clock_in_lng=$4, clock_in_accuracy_m=$5, clock_in_address=$6, updated_at=NOW()
             RETURNING id`,
            [uid, d, lat||null, lng||null, accuracy_m||null, address||null, tid]
          );
          result = { id: rows[0]?.id };
          break;
        }
        case 'clock_out': {
          const { lat, lng, accuracy_m } = payload;
          const d = new Date().toISOString().slice(0, 10);
          const { rows } = await sharedPool.query(
            `UPDATE field_attendance SET clock_out_at=NOW(), clock_out_lat=$3,
               clock_out_lng=$4, clock_out_accuracy_m=$5, updated_at=NOW()
             WHERE user_id=$1 AND date=$2 RETURNING id`,
            [uid, d, lat||null, lng||null, accuracy_m||null]
          );
          result = { id: rows[0]?.id };
          break;
        }
        case 'create_visit': {
          const { entity_type, entity_id, entity_name, visit_type, planned_at, notes } = payload;
          const { rows } = await sharedPool.query(
            `INSERT INTO field_visits
               (user_id, tenant_id, entity_type, entity_id, entity_name, visit_type, planned_at, notes_planned, status, is_unplanned)
             VALUES ($1,$2,$3,$4,$5,$6,$7::timestamptz,$8,'planned',TRUE)
             RETURNING id`,
            [uid, tid, entity_type||'other', entity_id||null, entity_name||null,
             visit_type||'regular', planned_at||null, notes||null]
          );
          result = { id: rows[0]?.id };
          break;
        }
        case 'complete_visit': {
          // field_visits has no notes_actual column — outcome is the real free-text
          // narrative field; fall back to it when the doc-documented notes_actual is sent.
          const { visit_id, notes_actual, outcome, checklist } = payload;
          const { rows } = await sharedPool.query(
            `UPDATE field_visits SET status='completed', outcome=$3,
               visit_checklist=COALESCE($4::jsonb, visit_checklist), check_out_at=NOW(), updated_at=NOW()
             WHERE id=$2 AND user_id=$1 RETURNING id`,
            [uid, visit_id, outcome || notes_actual || null, checklist ? JSON.stringify(checklist) : null]
          );
          result = { id: rows[0]?.id };
          break;
        }
        case 'add_notification_read': {
          await sharedPool.query(
            `UPDATE field_notifications SET read=TRUE, read_at=NOW()
             WHERE id=$1 AND user_id=$2`, [payload.notification_id, uid]
          );
          result = { ok: true };
          break;
        }
        default:
          status = 'skipped';
          error_message = `unknown operation: ${operation}`;
      }
    } catch (opErr) {
      status = 'failed';
      error_message = opErr.message;
    }

    await sharedPool.query(
      `INSERT INTO field_sync_log
         (user_id, tenant_id, device_id, idempotency_key, operation, payload, status, result, error_message)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [uid, tid, device_id||'unknown', idempotency_key, operation,
       JSON.stringify(payload||{}), status, result ? JSON.stringify(result) : null, error_message]
    );
    results.push({ idempotency_key, status, result, error_message });
  }

  res.json({ processed: results.length, results, server_time: new Date().toISOString() });
});

// ── device telemetry ──────────────────────────────────────────────────────────

// POST /telemetry
router.post('/telemetry', authTeam, FF, async (req, res) => {
  const { device_id, app_version, gps_accuracy, cell_signal, battery_pct, network_type, lat, lng, extras } = req.body;
  const uid = req.user.id;
  const tid = tenantId(req);
  try {
    await sharedPool.query(
      `INSERT INTO field_telemetry
         (user_id, tenant_id, device_id, app_version, gps_accuracy, cell_signal,
          battery_pct, network_type, lat, lng, extras)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [uid, tid, device_id||null, app_version||null, gps_accuracy||null, cell_signal||null,
       battery_pct||null, network_type||null, lat||null, lng||null,
       JSON.stringify(extras||{})]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── coupon validator (OPD field use) ─────────────────────────────────────────

// GET /coupon/validate/:code
router.get('/coupon/validate/:code', authTeam, FF, async (req, res) => {
  try {
    const { rows } = await sharedPool.query(
      `SELECT id, code, type, value, description, "validFrom", "validUntil",
         "maxUsage" AS "usageLimit", "usageCount", "isActive"
       FROM coupons
       WHERE UPPER(code) = UPPER($1)
         AND "isActive" = TRUE
         AND ("validFrom" IS NULL OR "validFrom" <= NOW())
         AND ("validUntil" IS NULL OR "validUntil" >= NOW())`,
      [req.params.code]
    );
    if (!rows.length) return res.status(404).json({ error: 'Invalid or expired coupon' });
    const c = rows[0];
    const valid = !c.usageLimit || c.usageCount < c.usageLimit;
    res.json({ ...c, can_redeem: valid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── territory route (GeoJSON for client map) ──────────────────────────────────

// GET /territory?date=YYYY-MM-DD  — territory polygon + today's planned stops
router.get('/territory', authTeam, FF, async (req, res) => {
  const { date = today() } = req.query;
  const uid = req.user.id;
  const tid = tenantId(req);
  try {
    const [territory, stops] = await Promise.all([
      // field_territories has no polygon/boundary data — it's a per-exec territory-name
      // assignment (user_id, territory, city, zone), not map geometry. The doc's
      // polygon_geojson promise isn't backed by any real column; returning what exists.
      sharedPool.query(
        `SELECT id, territory AS name, city, zone, description, active
         FROM field_territories WHERE tenant_id=$1 AND user_id=$2 AND active=TRUE
         LIMIT 5`,
        [tid, uid]
      ),
      sharedPool.query(
        `SELECT id, entity_name, entity_type, visit_type, planned_at,
           check_in_lat, check_in_lng, planned_sequence, estimated_arrival, status
         FROM field_visits
         WHERE user_id=$1 AND tenant_id=$2
           AND DATE(COALESCE(planned_at, created_at)) = $3
         ORDER BY COALESCE(planned_sequence, 999), planned_at`,
        [uid, tid, date]
      ),
    ]);
    res.json({ territories: territory.rows, stops: stops.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── AI endpoints ──────────────────────────────────────────────────────────────

// GET /ai/briefing  — personalised daily briefing from LLM
router.get('/ai/briefing', authTeam, FF, async (req, res) => {
  const uid = req.user.id;
  const tid = tenantId(req);
  try {
    // visits_done and leads_closed are fetched as two separate aggregates, not a join —
    // field_visits and field_leads share no foreign key, so joining them multiplies rows.
    const [visitsDone, leadsClosed, targets, pendingExceptions, unreadNotif] = await Promise.all([
      sharedPool.query(
        `SELECT COUNT(*) AS cnt FROM field_visits
         WHERE user_id=$1 AND tenant_id=$2 AND status='completed' AND DATE(created_at) >= date_trunc('month',NOW())::date`,
        [uid, tid]
      ),
      sharedPool.query(
        `SELECT COUNT(*) AS cnt FROM field_leads
         WHERE user_id=$1 AND tenant_id=$2 AND pipeline_stage='closed_won' AND DATE(closed_at) >= date_trunc('month',NOW())::date`,
        [uid, tid]
      ),
      // field_targets.month is a 'YYYY-MM' string — surface this calendar month's targets
      sharedPool.query(
        `SELECT visits_target, doctors_target, leads_target, month FROM field_targets
         WHERE user_id=$1 AND tenant_id=$2 AND month = to_char(NOW(), 'YYYY-MM')
         LIMIT 1`,
        [uid, tid]
      ),
      sharedPool.query(
        `SELECT COUNT(*) AS cnt FROM field_visit_exceptions
         WHERE user_id=$1 AND tenant_id=$2 AND status='pending'`,
        [uid, tid]
      ),
      sharedPool.query(
        `SELECT COUNT(*) AS cnt FROM field_notifications
         WHERE user_id=$1 AND tenant_id=$2 AND read=FALSE`,
        [uid, tid]
      ),
    ]);

    const sc = { visits_done: visitsDone.rows[0]?.cnt || 0, leads_closed: leadsClosed.rows[0]?.cnt || 0 };
    const targetRow = targets.rows[0];
    const tgt = targetRow
      ? [['visits', targetRow.visits_target], ['doctors', targetRow.doctors_target], ['leads', targetRow.leads_target]]
          .filter(([, v]) => v != null)
          .map(([target_type, target_value]) => ({ target_type, target_value, period_end: targetRow.month }))
      : [];
    const context = [
      `Field executive daily briefing. Today: ${today()}.`,
      `MTD: ${sc.visits_done||0} visits completed, ${sc.leads_closed||0} leads closed.`,
      tgt.length ? `Active targets: ${tgt.map(t=>`${t.target_type} = ${t.target_value} by ${t.period_end}`).join('; ')}.` : '',
      pendingExceptions.rows[0]?.cnt > 0 ? `${pendingExceptions.rows[0].cnt} out-of-beat exception(s) pending manager review.` : '',
      `${unreadNotif.rows[0]?.cnt||0} unread notification(s).`,
    ].filter(Boolean).join(' ');

    const { choices } = await llmProvider.chat({
      messages: [
        { role: 'system', content: 'You are a concise field force AI assistant. Generate a 3-bullet daily briefing for the field executive based on the data. Be specific, actionable and encouraging. Output plain text only, no markdown.' },
        { role: 'user', content: context },
      ],
      max_tokens: 250,
    });

    res.json({
      briefing: choices?.[0]?.message?.content?.trim() || 'Good morning! Stay on track with your targets today.',
      data: { scorecard: sc, targets: tgt, pending_exceptions: pendingExceptions.rows[0]?.cnt },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /ai/optimize-route  — LLM-based visit sequence optimizer
router.post('/ai/optimize-route', authTeam, FF, async (req, res) => {
  const { stops, current_location } = req.body;
  if (!stops || !stops.length) return res.status(400).json({ error: 'stops array required' });
  try {
    const stopList = stops.map((s, i) => `${i+1}. ${s.entity_name} (${s.visit_type||'visit'})`).join('\n');
    const locationNote = current_location
      ? `Current location: lat ${current_location.lat}, lng ${current_location.lng}.`
      : 'Current location: unknown.';

    const { choices } = await llmProvider.chat({
      messages: [
        { role: 'system', content: 'You are a route optimization assistant for a healthcare field executive. Given a list of stops, suggest the most efficient visit order to minimise travel. Return ONLY a JSON array of stop numbers in recommended order, e.g. [3,1,2,4]. Nothing else.' },
        { role: 'user', content: `${locationNote}\nStops:\n${stopList}` },
      ],
      max_tokens: 100,
    });

    const raw = choices?.[0]?.message?.content?.trim() || '';
    let order = [];
    try { order = JSON.parse(raw.match(/\[[\d,\s]+\]/)?.[0] || '[]'); } catch { /* ignore */ }

    const optimized = order.length === stops.length
      ? order.map(i => stops[i - 1]).filter(Boolean)
      : stops;

    res.json({ optimized_stops: optimized, order, efficiency_note: 'Ordered by proximity estimate.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
