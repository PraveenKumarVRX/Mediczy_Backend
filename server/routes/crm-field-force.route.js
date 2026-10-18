/**
 * CRM Field Force Management API
 * ================================
 * Mounted at /api/crm/field-force
 * Auth: authCRM + requireCRMCapability('field_force:read')
 *
 * Business Head can see aggregate field team data, approve expenses,
 * set targets, assign territories, and manage the doctor CRM.
 *
 * All queries are scoped to req.crmUser.tenantId (integer tenant_id
 * on the field_* tables, matching the CRM user's hospital tenant).
 */

import { Router } from 'express';
import pool from '../db/pgPool.js';
import { authCRM, requireCRMCapability } from '../middleware/crm.middleware.js';

const router = Router();
const FF_READ   = requireCRMCapability('field_force:read');
const FF_MANAGE = requireCRMCapability('field_force:manage');

function tid(req) { return req.crmUser.tenantId || 1; }

function thisMonth() { return new Date().toISOString().slice(0, 7); }
function today()     { return new Date().toISOString().slice(0, 10); }

// ─── SUMMARY KPIs ─────────────────────────────────────────────────────────────

// GET /summary  — dashboard KPI chips
router.get('/summary', authCRM, FF_READ, async (req, res) => {
  const tenantId = tid(req);
  const month = req.query.month || thisMonth();
  const d     = req.query.date  || today();

  try {
    const [attendance, visits, leads, expenses, targets] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'present') AS present,
           COUNT(*) FILTER (WHERE status = 'exception') AS exceptions,
           COUNT(*) AS total
         FROM field_attendance
         WHERE tenant_id = $1 AND date = $2`,
        [tenantId, d]
      ),
      pool.query(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status = 'completed') AS completed,
           COUNT(*) FILTER (WHERE status = 'checked_in') AS in_progress
         FROM field_visits
         WHERE tenant_id = $1 AND DATE(COALESCE(planned_at, created_at)) = $2`,
        [tenantId, d]
      ),
      pool.query(
        `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'new') AS new_leads
         FROM field_leads WHERE tenant_id = $1
         AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', $2::date)`,
        [tenantId, d]
      ),
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'submitted') AS pending_approval,
           SUM(total_amount) FILTER (WHERE status = 'submitted') AS pending_amount,
           SUM(approved_amount) FILTER (WHERE status = 'approved' OR status = 'paid') AS approved_amount
         FROM field_expense_claims
         WHERE tenant_id = $1 AND claim_month = $2`,
        [tenantId, month]
      ),
      pool.query(
        `SELECT COALESCE(SUM(visits_target),0) AS visits_target,
                COALESCE(SUM(leads_target),0)  AS leads_target
         FROM field_targets WHERE tenant_id = $1 AND month = $2`,
        [tenantId, month]
      ),
    ]);

    res.json({
      date: d,
      month,
      attendance: attendance.rows[0],
      visits: visits.rows[0],
      leads: leads.rows[0],
      expenses: expenses.rows[0],
      targets: targets.rows[0],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── TEAM ATTENDANCE ──────────────────────────────────────────────────────────

// GET /attendance?date=YYYY-MM-DD
router.get('/attendance', authCRM, FF_READ, async (req, res) => {
  const { date = today() } = req.query;
  const tenantId = tid(req);
  try {
    const { rows } = await pool.query(
      `SELECT a.*,
         u.name AS exec_name, u.email AS exec_email,
         EXTRACT(EPOCH FROM (COALESCE(a.clock_out_at, NOW()) - a.clock_in_at))/3600 AS hours_so_far,
         (SELECT COUNT(*) FROM field_visits WHERE user_id = a.user_id AND DATE(COALESCE(planned_at,created_at)) = a.date AND status = 'completed') AS visits_done,
         (SELECT COUNT(*) FROM field_visits WHERE user_id = a.user_id AND DATE(COALESCE(planned_at,created_at)) = a.date) AS visits_total
       FROM field_attendance a
       JOIN users u ON u.id = a.user_id
       WHERE a.tenant_id = $1 AND a.date = $2
       ORDER BY u.name`,
      [tenantId, date]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── VISITS ───────────────────────────────────────────────────────────────────

// GET /visits?date=&exec_id=&entity_type=&page=1
router.get('/visits', authCRM, FF_READ, async (req, res) => {
  const { date, exec_id, entity_type, purpose, page = 1, limit = 50 } = req.query;
  const tenantId = tid(req);
  const params = [tenantId];
  const conds  = ['v.tenant_id = $1'];

  if (date)        { params.push(date);        conds.push(`DATE(COALESCE(v.planned_at, v.created_at)) = $${params.length}`); }
  if (exec_id)     { params.push(exec_id);     conds.push(`v.user_id = $${params.length}`); }
  if (entity_type) { params.push(entity_type); conds.push(`v.entity_type = $${params.length}`); }
  if (purpose)     { params.push(purpose);     conds.push(`v.purpose = $${params.length}`); }

  const offset = (page - 1) * limit;
  try {
    const { rows } = await pool.query(
      `SELECT v.*, u.name AS exec_name
       FROM field_visits v
       JOIN users u ON u.id = v.user_id
       WHERE ${conds.join(' AND ')}
       ORDER BY COALESCE(v.planned_at, v.created_at) DESC
       LIMIT $${params.length+1} OFFSET $${params.length+2}`,
      [...params, limit, offset]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /visits/analytics?month=YYYY-MM
router.get('/visits/analytics', authCRM, FF_READ, async (req, res) => {
  const { month = thisMonth() } = req.query;
  const tenantId = tid(req);
  try {
    const [byExec, byPurpose, byEntityType, daily] = await Promise.all([
      pool.query(
        `SELECT u.name AS exec_name, v.user_id,
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE v.status = 'completed') AS completed,
           COUNT(*) FILTER (WHERE v.status = 'cancelled') AS cancelled
         FROM field_visits v JOIN users u ON u.id = v.user_id
         WHERE v.tenant_id = $1 AND TO_CHAR(COALESCE(v.planned_at, v.created_at), 'YYYY-MM') = $2
         GROUP BY v.user_id, u.name ORDER BY total DESC`,
        [tenantId, month]
      ),
      pool.query(
        `SELECT purpose, COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status = 'completed') AS completed
         FROM field_visits
         WHERE tenant_id = $1 AND TO_CHAR(COALESCE(planned_at, created_at), 'YYYY-MM') = $2
         GROUP BY purpose ORDER BY total DESC`,
        [tenantId, month]
      ),
      pool.query(
        `SELECT entity_type, COUNT(*) AS total
         FROM field_visits
         WHERE tenant_id = $1 AND TO_CHAR(COALESCE(planned_at, created_at), 'YYYY-MM') = $2
           AND entity_type IS NOT NULL
         GROUP BY entity_type ORDER BY total DESC`,
        [tenantId, month]
      ),
      pool.query(
        `SELECT DATE(COALESCE(planned_at, created_at)) AS day,
           COUNT(*) AS total, COUNT(*) FILTER (WHERE status='completed') AS completed
         FROM field_visits
         WHERE tenant_id = $1 AND TO_CHAR(COALESCE(planned_at, created_at), 'YYYY-MM') = $2
         GROUP BY day ORDER BY day`,
        [tenantId, month]
      ),
    ]);
    res.json({ month, by_exec: byExec.rows, by_purpose: byPurpose.rows, by_entity_type: byEntityType.rows, daily: daily.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── EXPENSE APPROVALS ────────────────────────────────────────────────────────

// GET /expenses?status=submitted
router.get('/expenses', authCRM, FF_READ, async (req, res) => {
  const { status, month, exec_id } = req.query;
  const tenantId = tid(req);
  const params = [tenantId];
  const conds  = ['c.tenant_id = $1'];
  if (status)  { params.push(status);  conds.push(`c.status = $${params.length}`); }
  if (month)   { params.push(month);   conds.push(`c.claim_month = $${params.length}`); }
  if (exec_id) { params.push(exec_id); conds.push(`c.user_id = $${params.length}`); }

  try {
    const { rows } = await pool.query(
      `SELECT c.*, u.name AS exec_name,
         (SELECT COUNT(*) FROM field_expense_items WHERE claim_id = c.id) AS item_count,
         (SELECT COALESCE(SUM(amount),0) FROM field_expense_items WHERE claim_id = c.id) AS item_total
       FROM field_expense_claims c
       JOIN users u ON u.id = c.user_id
       WHERE ${conds.join(' AND ')}
       ORDER BY c.submitted_at DESC NULLS LAST, c.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /expenses/:id  — claim detail with items
router.get('/expenses/:id', authCRM, FF_READ, async (req, res) => {
  const tenantId = tid(req);
  try {
    const [claim, items] = await Promise.all([
      pool.query(`SELECT c.*, u.name AS exec_name FROM field_expense_claims c JOIN users u ON u.id = c.user_id WHERE c.id=$1 AND c.tenant_id=$2`, [req.params.id, tenantId]),
      pool.query(`SELECT * FROM field_expense_items WHERE claim_id=$1 ORDER BY expense_date, id`, [req.params.id]),
    ]);
    if (!claim.rows.length) return res.status(404).json({ error: 'Claim not found' });
    res.json({ ...claim.rows[0], items: items.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /expenses/:id/approve
router.patch('/expenses/:id/approve', authCRM, FF_MANAGE, async (req, res) => {
  const { approved_amount, approval_notes } = req.body;
  const tenantId = tid(req);
  const reviewerId = req.crmUser.id;
  try {
    const { rows } = await pool.query(
      `UPDATE field_expense_claims
       SET status = 'approved', approved_amount = $3, approval_notes = $4,
           reviewed_by = $5, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND status = 'submitted'
       RETURNING *`,
      [req.params.id, tenantId, approved_amount || null, approval_notes || null, reviewerId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Claim not found or not in submitted state' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /expenses/:id/reject
router.patch('/expenses/:id/reject', authCRM, FF_MANAGE, async (req, res) => {
  const { rejection_reason } = req.body;
  if (!rejection_reason) return res.status(400).json({ error: 'rejection_reason is required' });
  const tenantId = tid(req);
  const reviewerId = req.crmUser.id;
  try {
    const { rows } = await pool.query(
      `UPDATE field_expense_claims
       SET status = 'rejected', rejection_reason = $3,
           reviewed_by = $4, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND status = 'submitted'
       RETURNING *`,
      [req.params.id, tenantId, rejection_reason, reviewerId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Claim not found or not in submitted state' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── TARGETS ──────────────────────────────────────────────────────────────────

// GET /targets?month=YYYY-MM
router.get('/targets', authCRM, FF_READ, async (req, res) => {
  const { month = thisMonth() } = req.query;
  const tenantId = tid(req);
  try {
    const { rows } = await pool.query(
      `SELECT t.*, u.name AS exec_name,
         (SELECT COUNT(*) FROM field_visits WHERE user_id = t.user_id AND TO_CHAR(COALESCE(planned_at,created_at),'YYYY-MM') = t.month AND tenant_id = $1 AND status = 'completed') AS visits_done,
         (SELECT COUNT(*) FROM field_leads  WHERE user_id = t.user_id AND TO_CHAR(created_at,'YYYY-MM') = t.month AND tenant_id = $1) AS leads_done,
         (SELECT COUNT(*) FROM field_visits WHERE user_id = t.user_id AND entity_type = 'doctor' AND TO_CHAR(COALESCE(planned_at,created_at),'YYYY-MM') = t.month AND tenant_id = $1 AND status = 'completed') AS doctors_done,
         (SELECT COUNT(*) FROM field_visits WHERE user_id = t.user_id AND entity_type = 'corporate' AND TO_CHAR(COALESCE(planned_at,created_at),'YYYY-MM') = t.month AND tenant_id = $1 AND status = 'completed') AS corporates_done
       FROM field_targets t JOIN users u ON u.id = t.user_id
       WHERE t.tenant_id = $1 AND t.month = $2
       ORDER BY u.name`,
      [tenantId, month]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /targets  — upsert a target for one exec
router.post('/targets', authCRM, FF_MANAGE, async (req, res) => {
  const {
    user_id, month, visits_target, doctors_target, corporates_target,
    camps_target, leads_target, empanelment_target, revenue_target, notes,
  } = req.body;
  if (!user_id || !month) return res.status(400).json({ error: 'user_id and month are required' });
  const tenantId = tid(req);
  const setBy = req.crmUser.id;
  try {
    const { rows } = await pool.query(
      `INSERT INTO field_targets
         (user_id, month, visits_target, doctors_target, corporates_target,
          camps_target, leads_target, empanelment_target, revenue_target, notes, set_by, tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (user_id, month)
       DO UPDATE SET
         visits_target      = EXCLUDED.visits_target,
         doctors_target     = EXCLUDED.doctors_target,
         corporates_target  = EXCLUDED.corporates_target,
         camps_target       = EXCLUDED.camps_target,
         leads_target       = EXCLUDED.leads_target,
         empanelment_target = EXCLUDED.empanelment_target,
         revenue_target     = EXCLUDED.revenue_target,
         notes              = EXCLUDED.notes,
         set_by             = EXCLUDED.set_by,
         updated_at         = NOW()
       RETURNING *`,
      [user_id, month,
       visits_target || 0, doctors_target || 0, corporates_target || 0,
       camps_target || 0, leads_target || 0, empanelment_target || 0,
       revenue_target || 0, notes || null, setBy, tenantId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /team/:userId/scorecard?month=YYYY-MM
router.get('/team/:userId/scorecard', authCRM, FF_READ, async (req, res) => {
  const tenantId = tid(req);
  const { userId } = req.params;
  const { month = thisMonth() } = req.query;

  try {
    const [user, target, actuals, expenseSummary, empanelment] = await Promise.all([
      pool.query(`SELECT id, name, email FROM users WHERE id = $1`, [userId]),
      pool.query(`SELECT * FROM field_targets WHERE user_id=$1 AND month=$2 AND tenant_id=$3`, [userId, month, tenantId]),
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status='present') AS days_present,
           COUNT(*) AS days_recorded
         FROM field_attendance WHERE user_id=$1 AND TO_CHAR(date,'YYYY-MM')=$2 AND tenant_id=$3`,
        [userId, month, tenantId]
      ),
      pool.query(
        `SELECT COALESCE(SUM(total_amount),0) AS claimed, COALESCE(SUM(approved_amount),0) AS approved
         FROM field_expense_claims WHERE user_id=$1 AND claim_month=$2 AND tenant_id=$3`,
        [userId, month, tenantId]
      ),
      pool.query(
        `SELECT COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status='empanelled') AS empanelled,
           COUNT(*) FILTER (WHERE status IN ('submitted','under_review','approved')) AS in_progress
         FROM field_empanelment_applications WHERE assigned_to=$1 AND tenant_id=$2`,
        [userId, tenantId]
      ),
    ]);

    // visit breakdown
    const { rows: visitRows } = await pool.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE status='completed') AS completed,
         COUNT(*) FILTER (WHERE entity_type='doctor') AS doctor_visits,
         COUNT(*) FILTER (WHERE entity_type='corporate') AS corporate_visits,
         COUNT(*) FILTER (WHERE status='completed' AND entity_type='doctor') AS doctor_visits_done,
         COUNT(*) FILTER (WHERE status='completed' AND entity_type='corporate') AS corporate_visits_done
       FROM field_visits
       WHERE user_id=$1 AND TO_CHAR(COALESCE(planned_at,created_at),'YYYY-MM')=$2 AND tenant_id=$3`,
      [userId, month, tenantId]
    );

    const { rows: leadRows } = await pool.query(
      `SELECT COUNT(*) AS total FROM field_leads
       WHERE user_id=$1 AND TO_CHAR(created_at,'YYYY-MM')=$2 AND tenant_id=$3`,
      [userId, month, tenantId]
    );

    res.json({
      user: user.rows[0],
      month,
      target: target.rows[0] || null,
      actuals: {
        ...actuals.rows[0],
        ...visitRows[0],
        leads: leadRows.rows[0]?.total ?? 0,
        expense: expenseSummary.rows[0],
        empanelment: empanelment.rows[0],
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── TERRITORIES ──────────────────────────────────────────────────────────────

// GET /territories
router.get('/territories', authCRM, FF_READ, async (req, res) => {
  const tenantId = tid(req);
  try {
    const { rows } = await pool.query(
      `SELECT t.*, u.name AS exec_name
       FROM field_territories t JOIN users u ON u.id = t.user_id
       WHERE t.tenant_id = $1 AND t.active = TRUE
       ORDER BY u.name, t.territory`,
      [tenantId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /territories
router.post('/territories', authCRM, FF_MANAGE, async (req, res) => {
  const { user_id, territory, description, city, zone } = req.body;
  if (!user_id || !territory) return res.status(400).json({ error: 'user_id and territory are required' });
  const tenantId = tid(req);
  const assignedBy = req.crmUser.id;
  try {
    const { rows } = await pool.query(
      `INSERT INTO field_territories (user_id, territory, description, city, zone, assigned_by, tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [user_id, territory, description || null, city || null, zone || null, assignedBy, tenantId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /territories/:id
router.delete('/territories/:id', authCRM, FF_MANAGE, async (req, res) => {
  const tenantId = tid(req);
  try {
    await pool.query(`UPDATE field_territories SET active=FALSE, updated_at=NOW() WHERE id=$1 AND tenant_id=$2`, [req.params.id, tenantId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── FIELD LEADS ──────────────────────────────────────────────────────────────

// GET /leads?status=new&exec_id=&lead_type=
router.get('/leads', authCRM, FF_READ, async (req, res) => {
  const { status, exec_id, lead_type } = req.query;
  const tenantId = tid(req);
  const params = [tenantId];
  const conds  = ['l.tenant_id = $1'];
  if (status)    { params.push(status);    conds.push(`l.status = $${params.length}`); }
  if (exec_id)   { params.push(exec_id);   conds.push(`l.user_id = $${params.length}`); }
  if (lead_type) { params.push(lead_type); conds.push(`l.lead_type = $${params.length}`); }
  try {
    const { rows } = await pool.query(
      `SELECT l.*, u.name AS exec_name
       FROM field_leads l JOIN users u ON u.id = l.user_id
       WHERE ${conds.join(' AND ')}
       ORDER BY l.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DOCTOR CRM ───────────────────────────────────────────────────────────────

// GET /doctor-crm?status=&city=&exec_id=&search=
router.get('/doctor-crm', authCRM, FF_READ, async (req, res) => {
  const { relationship_status, city, exec_id, search, referral_potential } = req.query;
  const tenantId = tid(req);
  const params = [tenantId];
  const conds  = ['tenant_id = $1'];
  if (relationship_status) { params.push(relationship_status); conds.push(`relationship_status = $${params.length}`); }
  if (city)                { params.push(city);                conds.push(`city = $${params.length}`); }
  if (exec_id)             { params.push(exec_id);             conds.push(`assigned_exec_id = $${params.length}`); }
  if (referral_potential)  { params.push(referral_potential);  conds.push(`referral_potential = $${params.length}`); }
  if (search) { params.push(`%${search}%`); conds.push(`(doctor_name ILIKE $${params.length} OR specialty ILIKE $${params.length} OR hospital_affiliation ILIKE $${params.length})`); }

  try {
    const { rows } = await pool.query(
      `SELECT * FROM field_doctor_crm WHERE ${conds.join(' AND ')} ORDER BY doctor_name`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /doctor-crm
router.post('/doctor-crm', authCRM, FF_READ, async (req, res) => {
  const {
    doctor_name, qualification, specialty, hospital_affiliation,
    address, area, city, phone, email, opd_days, avg_daily_patients,
    referral_potential, relationship_status, visit_frequency_target,
    services_interested, key_pain_points, notes, assigned_exec_id, tags,
  } = req.body;
  if (!doctor_name) return res.status(400).json({ error: 'doctor_name is required' });
  const tenantId = tid(req);
  try {
    const { rows } = await pool.query(
      `INSERT INTO field_doctor_crm
         (doctor_name, qualification, specialty, hospital_affiliation,
          address, area, city, phone, email, opd_days, avg_daily_patients,
          referral_potential, relationship_status, visit_frequency_target,
          services_interested, key_pain_points, notes, assigned_exec_id, tags, tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING *`,
      [doctor_name, qualification || null, specialty || null, hospital_affiliation || null,
       address || null, area || null, city || null, phone || null, email || null,
       opd_days || null, avg_daily_patients || null,
       referral_potential || 'medium', relationship_status || 'prospect',
       visit_frequency_target || 1, services_interested || null,
       key_pain_points || null, notes || null, assigned_exec_id || null,
       tags || null, tenantId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /doctor-crm/:id
router.patch('/doctor-crm/:id', authCRM, FF_READ, async (req, res) => {
  const {
    qualification, specialty, hospital_affiliation, address, area, city,
    phone, email, opd_days, avg_daily_patients, referral_potential,
    relationship_status, visit_frequency_target, last_visit_date, next_visit_date,
    services_interested, key_pain_points, notes, assigned_exec_id, tags,
  } = req.body;
  const tenantId = tid(req);
  try {
    const { rows } = await pool.query(
      `UPDATE field_doctor_crm SET
         qualification          = COALESCE($3, qualification),
         specialty              = COALESCE($4, specialty),
         hospital_affiliation   = COALESCE($5, hospital_affiliation),
         address                = COALESCE($6, address),
         area                   = COALESCE($7, area),
         city                   = COALESCE($8, city),
         phone                  = COALESCE($9, phone),
         email                  = COALESCE($10, email),
         opd_days               = COALESCE($11, opd_days),
         avg_daily_patients     = COALESCE($12, avg_daily_patients),
         referral_potential     = COALESCE($13, referral_potential),
         relationship_status    = COALESCE($14, relationship_status),
         visit_frequency_target = COALESCE($15, visit_frequency_target),
         last_visit_date        = COALESCE($16::date, last_visit_date),
         next_visit_date        = COALESCE($17::date, next_visit_date),
         services_interested    = COALESCE($18, services_interested),
         key_pain_points        = COALESCE($19, key_pain_points),
         notes                  = COALESCE($20, notes),
         assigned_exec_id       = COALESCE($21, assigned_exec_id),
         tags                   = COALESCE($22, tags),
         updated_at             = NOW()
       WHERE id=$1 AND tenant_id=$2 RETURNING *`,
      [req.params.id, tenantId,
       qualification || null, specialty || null, hospital_affiliation || null,
       address || null, area || null, city || null, phone || null, email || null,
       opd_days || null, avg_daily_patients || null, referral_potential || null,
       relationship_status || null, visit_frequency_target || null,
       last_visit_date || null, next_visit_date || null,
       services_interested || null, key_pain_points || null,
       notes || null, assigned_exec_id || null, tags || null]
    );
    if (!rows.length) return res.status(404).json({ error: 'Doctor not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── TEAM LIST ────────────────────────────────────────────────────────────────

// GET /team  — field execs in this tenant (users with 'Field Force' team permission)
router.get('/team', authCRM, FF_READ, async (req, res) => {
  const tenantId = tid(req);
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email,
         (SELECT MAX(date) FROM field_attendance WHERE user_id = u.id AND tenant_id = $1) AS last_attendance,
         (SELECT COUNT(*) FROM field_visits WHERE user_id = u.id AND tenant_id = $1
            AND TO_CHAR(COALESCE(planned_at,created_at),'YYYY-MM') = TO_CHAR(NOW(),'YYYY-MM')) AS visits_this_month
       FROM users u
       WHERE u.tenant_id = $1
         AND u.isTeam = TRUE
         AND EXISTS (
           SELECT 1 FROM team_permissions tp
           WHERE tp.user_id = u.id AND tp.permission = 'Field Force'
         )
       ORDER BY u.name`,
      [tenantId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── FIELD LEADS (exec-side CREATE) ──────────────────────────────────────────
// Also mounted here so the CRM BH can push a field lead into the CRM pipeline

// PATCH /leads/:id/push-to-crm  — creates a crm_leads record and links it
router.patch('/leads/:id/push-to-crm', authCRM, FF_MANAGE, async (req, res) => {
  const tenantId = tid(req);
  try {
    const { rows: lead } = await pool.query(
      `SELECT * FROM field_leads WHERE id=$1 AND tenant_id=$2`, [req.params.id, tenantId]
    );
    if (!lead.length) return res.status(404).json({ error: 'Lead not found' });
    const l = lead[0];

    // Insert into crm_leads
    const { rows: crm } = await pool.query(
      `INSERT INTO crm_leads
         (name, phone, email, company, designation, source, status, notes, assigned_to, created_by)
       VALUES ($1,$2,$3,$4,$5,'field_visit','new',$6,$7,$7)
       RETURNING id`,
      [l.contact_name || l.entity_name, l.contact_phone, l.contact_email,
       l.entity_name, l.designation, l.notes, req.crmUser.id]
    );
    const crmLeadId = crm[0].id;

    await pool.query(
      `UPDATE field_leads SET crm_lead_id=$1, updated_at=NOW() WHERE id=$2`,
      [crmLeadId, req.params.id]
    );
    res.json({ crm_lead_id: crmLeadId, field_lead_id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── EMPANELMENT (BH view) ────────────────────────────────────────────────────

// GET /empanelment  — all applications for this tenant
router.get('/empanelment', authCRM, FF_READ, async (req, res) => {
  const { status, assigned_to } = req.query;
  const tenantId = tid(req);
  const params = [tenantId];
  const conds  = ['a.tenant_id = $1'];
  if (status)      { params.push(status);      conds.push(`a.status = $${params.length}`); }
  if (assigned_to) { params.push(assigned_to); conds.push(`a.assigned_to = $${params.length}`); }
  try {
    const { rows } = await pool.query(
      `SELECT a.*,
         u.name AS assigned_exec_name,
         (SELECT COUNT(*) FROM field_empanelment_milestones WHERE application_id = a.id AND status='done') AS milestones_done,
         (SELECT COUNT(*) FROM field_empanelment_milestones WHERE application_id = a.id) AS milestones_total
       FROM field_empanelment_applications a
       LEFT JOIN users u ON u.id = a.assigned_to
       WHERE ${conds.join(' AND ')}
       ORDER BY a.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PHASE 5: GAP COMPLETIONS ────────────────────────────────────────────────

// ── unified approvals inbox ────────────────────────────────────────────────────
// GET /approvals?type=expenses|exceptions|tour_plans&status=pending
router.get('/approvals', authCRM, FF_READ, async (req, res) => {
  const { type, status = 'pending' } = req.query;
  const tenantId = tid(req);
  try {
    const results = {};

    if (!type || type === 'expenses') {
      const { rows } = await pool.query(
        `SELECT ec.*, u.name AS exec_name, 'expense' AS approval_type
         FROM field_expense_claims ec JOIN users u ON u.id=ec.user_id
         WHERE ec.tenant_id=$1 AND ec.status=$2 ORDER BY ec.created_at DESC LIMIT 50`,
        [tenantId, status === 'pending' ? 'submitted' : status]
      );
      results.expenses = rows;
    }

    if (!type || type === 'exceptions') {
      const { rows } = await pool.query(
        `SELECT e.*, u.name AS exec_name, v.entity_name, v.visit_type, 'exception' AS approval_type
         FROM field_visit_exceptions e
         JOIN users u ON u.id=e.user_id
         LEFT JOIN field_visits v ON v.id=e.visit_id
         WHERE e.tenant_id=$1 AND e.status=$2 ORDER BY e.created_at DESC LIMIT 50`,
        [tenantId, status]
      );
      results.exceptions = rows;
    }

    if (!type || type === 'tour_plans') {
      const { rows } = await pool.query(
        `SELECT t.*, u.name AS exec_name, 'tour_plan' AS approval_type
         FROM field_tour_plans t JOIN users u ON u.id=t.user_id
         WHERE t.tenant_id=$1 AND t.status=$2 ORDER BY t.submitted_at DESC LIMIT 50`,
        [tenantId, status === 'pending' ? 'submitted' : status]
      );
      results.tour_plans = rows;
    }

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /approvals/exceptions/:id/approve
router.patch('/approvals/exceptions/:id/approve', authCRM, FF_MANAGE, async (req, res) => {
  const { review_note } = req.body;
  const reviewerId = req.user?.id;
  try {
    const { rows } = await pool.query(
      `UPDATE field_visit_exceptions SET status='approved', reviewed_by=$2,
         reviewed_at=NOW(), review_note=$3, updated_at=NOW()
       WHERE id=$1 AND status='pending' RETURNING *`,
      [req.params.id, reviewerId, review_note || null]
    );
    if (!rows.length) return res.status(404).json({ error: 'Exception not found or already reviewed' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /approvals/exceptions/:id/reject
router.patch('/approvals/exceptions/:id/reject', authCRM, FF_MANAGE, async (req, res) => {
  const { review_note } = req.body;
  const reviewerId = req.user?.id;
  if (!review_note) return res.status(400).json({ error: 'review_note required for rejection' });
  try {
    const { rows } = await pool.query(
      `UPDATE field_visit_exceptions SET status='rejected', reviewed_by=$2,
         reviewed_at=NOW(), review_note=$3, updated_at=NOW()
       WHERE id=$1 AND status='pending' RETURNING *`,
      [req.params.id, reviewerId, review_note]
    );
    if (!rows.length) return res.status(404).json({ error: 'Exception not found or already reviewed' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /approvals/tour-plans/:id/approve
router.patch('/approvals/tour-plans/:id/approve', authCRM, FF_MANAGE, async (req, res) => {
  const { review_note } = req.body;
  const reviewerId = req.user?.id;
  try {
    const { rows } = await pool.query(
      `UPDATE field_tour_plans SET status='approved', reviewed_by=$2,
         reviewed_at=NOW(), review_note=$3, updated_at=NOW()
       WHERE id=$1 AND status='submitted' RETURNING *`,
      [req.params.id, reviewerId, review_note || null]
    );
    if (!rows.length) return res.status(404).json({ error: 'Tour plan not found or not submitted' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /approvals/tour-plans/:id/reject
router.patch('/approvals/tour-plans/:id/reject', authCRM, FF_MANAGE, async (req, res) => {
  const { review_note } = req.body;
  if (!review_note) return res.status(400).json({ error: 'review_note required' });
  const reviewerId = req.user?.id;
  try {
    const { rows } = await pool.query(
      `UPDATE field_tour_plans SET status='rejected', reviewed_by=$2,
         reviewed_at=NOW(), review_note=$3, updated_at=NOW()
       WHERE id=$1 AND status='submitted' RETURNING *`,
      [req.params.id, reviewerId, review_note]
    );
    if (!rows.length) return res.status(404).json({ error: 'Tour plan not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── lead pipeline stage progression ──────────────────────────────────────────

// PATCH /leads/:id/stage
router.patch('/leads/:id/stage', authCRM, FF_READ, async (req, res) => {
  const { pipeline_stage, note } = req.body;
  const valid = ['new','contacted','qualified','proposal','empanelment','closed_won','closed_lost'];
  if (!valid.includes(pipeline_stage)) {
    return res.status(400).json({ error: `pipeline_stage must be one of: ${valid.join(', ')}` });
  }
  const tenantId = tid(req);
  try {
    const { rows } = await pool.query(
      `UPDATE field_leads SET
         pipeline_stage = $3,
         stage_history  = COALESCE(stage_history,'[]'::jsonb) || jsonb_build_object(
           'stage', $3, 'at', NOW(), 'by', $4::text, 'note', $5::text
         )::jsonb,
         updated_at = NOW()
       WHERE id=$1 AND tenant_id=$2 RETURNING *`,
      [req.params.id, tenantId, pipeline_stage, req.user?.id, note || null]
    );
    if (!rows.length) return res.status(404).json({ error: 'Lead not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /leads/:id/convert — mark as closed_won with contract details
router.patch('/leads/:id/convert', authCRM, FF_MANAGE, async (req, res) => {
  const { contract_value, mou_document_url, note } = req.body;
  const tenantId = tid(req);
  try {
    const { rows } = await pool.query(
      `UPDATE field_leads SET
         pipeline_stage  = 'closed_won',
         contract_value  = $3,
         mou_document_url= $4,
         closed_at       = NOW(),
         stage_history   = COALESCE(stage_history,'[]'::jsonb) || jsonb_build_object(
           'stage','closed_won','at',NOW(),'by',$5::text,'note',$6::text
         )::jsonb,
         updated_at      = NOW()
       WHERE id=$1 AND tenant_id=$2 RETURNING *`,
      [req.params.id, tenantId, contract_value||null, mou_document_url||null,
       req.user?.id, note||null]
    );
    if (!rows.length) return res.status(404).json({ error: 'Lead not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── doctor CRM enrichment ─────────────────────────────────────────────────────

// GET /doctor-crm/:id/intel  — gatekeeper/relationship notes
router.get('/doctor-crm/:id/intel', authCRM, FF_READ, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT i.*, u.name AS updated_by_name
       FROM field_doctor_intel i
       LEFT JOIN users u ON u.id=i.updated_by
       WHERE i.doctor_crm_id=$1`,
      [req.params.id]
    );
    res.json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /doctor-crm/:id/intel — upsert gatekeeper intel
router.put('/doctor-crm/:id/intel', authCRM, FF_READ, async (req, res) => {
  const { gatekeeper_name, gatekeeper_phone, opd_days, best_visit_time, notes } = req.body;
  const tenantId = tid(req);
  try {
    const existing = await pool.query(
      `SELECT id FROM field_doctor_intel WHERE doctor_crm_id=$1`, [req.params.id]
    );
    let rows;
    if (existing.rows.length) {
      ({ rows } = await pool.query(
        `UPDATE field_doctor_intel SET
           gatekeeper_name=$2, gatekeeper_phone=$3, opd_days=$4,
           best_visit_time=$5, notes=$6, updated_by=$7, updated_at=NOW()
         WHERE doctor_crm_id=$1 RETURNING *`,
        [req.params.id, gatekeeper_name||null, gatekeeper_phone||null, opd_days||null,
         best_visit_time||null, notes||null, req.user?.id]
      ));
    } else {
      ({ rows } = await pool.query(
        `INSERT INTO field_doctor_intel
           (doctor_crm_id, tenant_id, gatekeeper_name, gatekeeper_phone,
            opd_days, best_visit_time, notes, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [req.params.id, tenantId, gatekeeper_name||null, gatekeeper_phone||null,
         opd_days||null, best_visit_time||null, notes||null, req.user?.id]
      ));
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /doctor-crm/:id/trail — visit history + linked admissions for a doctor
router.get('/doctor-crm/:id/trail', authCRM, FF_READ, async (req, res) => {
  const tenantId = tid(req);
  try {
    const [visits, intel] = await Promise.all([
      pool.query(
        `SELECT v.*, u.name AS exec_name
         FROM field_visits v
         LEFT JOIN users u ON u.id=v.user_id
         WHERE v.doctor_crm_id=$1 AND v.tenant_id=$2
         ORDER BY v.created_at DESC LIMIT 50`,
        [req.params.id, tenantId]
      ),
      pool.query(
        `SELECT dc.name, dc.speciality, dc.hospital_name, dc.relationship_status,
           COUNT(v.id) AS total_visits,
           MAX(v.created_at) AS last_visit_at,
           COUNT(v.id) FILTER (WHERE v.status='completed') AS completed_visits
         FROM field_doctor_crm dc
         LEFT JOIN field_visits v ON v.doctor_crm_id=dc.id
         WHERE dc.id=$1 GROUP BY dc.id`,
        [req.params.id]
      ),
    ]);
    res.json({
      doctor:  intel.rows[0] || null,
      visits:  visits.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── camp management (BH view) ─────────────────────────────────────────────────

// GET /camps
router.get('/camps', authCRM, FF_READ, async (req, res) => {
  const { status } = req.query;
  const tenantId = tid(req);
  try {
    const params = [tenantId];
    const conds  = ['tenant_id=$1'];
    if (status) { params.push(status); conds.push(`status=$${params.length}`); }
    const { rows } = await pool.query(
      `SELECT c.*,
         (SELECT COUNT(*) FROM field_camp_registrations r WHERE r.camp_id=c.id) AS footfall
       FROM health_camps c
       WHERE ${conds.join(' AND ')} ORDER BY c.scheduled_date DESC LIMIT 100`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /camps/:id/registrations
router.get('/camps/:id/registrations', authCRM, FF_READ, async (req, res) => {
  const tenantId = tid(req);
  try {
    const { rows } = await pool.query(
      `SELECT r.*, u.name AS registered_by_name
       FROM field_camp_registrations r
       JOIN users u ON u.id=r.registered_by
       WHERE r.camp_id=$1 AND r.tenant_id=$2 ORDER BY r.created_at DESC`,
      [req.params.id, tenantId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── exceptions overview (BH) ──────────────────────────────────────────────────

// GET /exceptions?status=pending&user_id=
router.get('/exceptions', authCRM, FF_READ, async (req, res) => {
  const { status, user_id } = req.query;
  const tenantId = tid(req);
  const params = [tenantId];
  const conds  = ['e.tenant_id=$1'];
  if (status)  { params.push(status);  conds.push(`e.status=$${params.length}`); }
  if (user_id) { params.push(user_id); conds.push(`e.user_id=$${params.length}`); }
  try {
    const { rows } = await pool.query(
      `SELECT e.*, u.name AS exec_name, v.entity_name, v.visit_type,
         ru.name AS reviewed_by_name
       FROM field_visit_exceptions e
       JOIN users u ON u.id=e.user_id
       LEFT JOIN field_visits v ON v.id=e.visit_id
       LEFT JOIN users ru ON ru.id=e.reviewed_by
       WHERE ${conds.join(' AND ')} ORDER BY e.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── tour plans (BH view) ──────────────────────────────────────────────────────

// GET /tour-plans?user_id=&status=submitted
router.get('/tour-plans', authCRM, FF_READ, async (req, res) => {
  const { user_id, status } = req.query;
  const tenantId = tid(req);
  const params = [tenantId];
  const conds  = ['t.tenant_id=$1'];
  if (status)  { params.push(status);  conds.push(`t.status=$${params.length}`); }
  if (user_id) { params.push(user_id); conds.push(`t.user_id=$${params.length}`); }
  try {
    const { rows } = await pool.query(
      `SELECT t.*, u.name AS exec_name FROM field_tour_plans t
       JOIN users u ON u.id=t.user_id
       WHERE ${conds.join(' AND ')} ORDER BY t.month DESC, t.submitted_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
