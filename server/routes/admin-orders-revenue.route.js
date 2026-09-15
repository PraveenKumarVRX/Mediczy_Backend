/**
 * Admin: Orders & Revenue
 *
 * Real, working replacement for the gap found in the 2026-09-15 micro-audit:
 * /admin/payments queried an unrelated legacy PaymentTransaction store, and
 * /admin/billing called a GET /api/admin/invoices endpoint that never existed.
 * Neither page could show an actual patient purchase (lab/pharmacy orders,
 * membership upgrades) — this route reads directly from the tables that
 * actually record them: orders + payments, and user_plans.
 *
 * Shared by both the Admin portal and the Team portal. Gated by the real,
 * enforced Team RBAC system (server/config/team-permissions.config.js +
 * requirePermission()) rather than a blanket role check — admins always pass
 * (requirePermission short-circuits for isAdmin/role==='admin'), team members
 * need 'Finance Access' explicitly granted via /team/user-management.
 */
import express from 'express';
import { authTeam, requirePermission } from '../middleware/team.middleware.js';
import pool from '../db/pgPool.js';

const router = express.Router();

router.use(authTeam, requirePermission('Finance Access'));

function buildItemLabel(row) {
  const meta = row.metadata || {};
  if (row.type === 'membership_upgrade') {
    return `Membership: ${row.plan_name || 'Plan upgrade'}`;
  }
  if (row.order_type === 'lab_test' && meta.testName) {
    return `${meta.testName} — Lab Test${meta.isHomeCollection ? ' (Home Collection)' : ''}`;
  }
  if (row.order_type === 'medicine' || row.order_type === 'pharmacy') {
    return 'Pharmacy Order';
  }
  if (row.order_type) {
    return `${String(row.order_type).replace(/_/g, ' ')}${row.order_number ? ' — ' + row.order_number : ''}`;
  }
  return row.order_number || 'Order';
}

/**
 * GET /api/admin/orders-revenue
 * Query: search, type (order|membership_upgrade|all), from, to, page, limit
 */
router.get('/', async (req, res) => {
  try {
    const {
      search = '',
      type = 'all',
      from,
      to,
      page = 1,
      limit = 25,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const offset = (pageNum - 1) * limitNum;

    const params = [];
    const conditions = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(u."firstName" ILIKE $${params.length} OR u."lastName" ILIKE $${params.length} OR u.email ILIKE $${params.length} OR u."phoneNumber" ILIKE $${params.length})`);
    }
    if (from) {
      params.push(from);
      conditions.push(`created_at >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`created_at <= $${params.length}`);
    }

    const orderPart = `
      SELECT
        'order' AS type,
        o.id::text AS id,
        TRIM(CONCAT(u."firstName", ' ', u."lastName")) AS customer_name,
        u.email AS customer_email,
        u."phoneNumber" AS customer_phone,
        u.employer_name AS employer,
        o."orderType"::text AS order_type,
        o."orderNumber" AS order_number,
        o.metadata AS metadata,
        NULL::text AS plan_name,
        p.amount AS amount,
        p.currency AS currency,
        p.status::text AS status,
        p."paymentId" AS payment_id,
        p.gateway::text AS gateway,
        p."createdAt" AS created_at
      FROM payments p
      JOIN orders o ON o.id = p."orderId"
      JOIN users u ON u.id = p."userId"
      WHERE p.status = 'success'
    `;

    const membershipPart = `
      SELECT
        'membership_upgrade' AS type,
        up.id::text AS id,
        TRIM(CONCAT(u."firstName", ' ', u."lastName")) AS customer_name,
        u.email AS customer_email,
        u."phoneNumber" AS customer_phone,
        u.employer_name AS employer,
        'membership' AS order_type,
        NULL::text AS order_number,
        up.metadata AS metadata,
        mp.name AS plan_name,
        up."paidAmount" AS amount,
        'INR' AS currency,
        CASE WHEN up."paidAmount" > 0 THEN 'success' ELSE 'free' END AS status,
        up."paymentId" AS payment_id,
        COALESCE(up."paymentMethod", 'corporate') AS gateway,
        up."createdAt" AS created_at
      FROM user_plans up
      JOIN users u ON u.id = up."userId"
      LEFT JOIN membership_plans mp ON mp.id = up."membershipPlanId"
    `;

    let unionSql;
    if (type === 'order') unionSql = orderPart;
    else if (type === 'membership_upgrade') unionSql = membershipPart;
    else unionSql = `${orderPart} UNION ALL ${membershipPart}`;

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const baseSql = `SELECT * FROM (${unionSql}) combined ${whereClause}`;

    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM (${baseSql}) c`, params);
    const total = countResult.rows[0]?.total || 0;

    const listParams = [...params, limitNum, offset];
    const listResult = await pool.query(
      `${baseSql} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      listParams
    );

    const data = listResult.rows.map(row => ({
      id: row.id,
      type: row.type,
      customerName: row.customer_name || 'Unknown',
      customerEmail: row.customer_email,
      customerPhone: row.customer_phone,
      employer: row.employer,
      itemLabel: buildItemLabel(row),
      amount: Number(row.amount || 0),
      currency: row.currency || 'INR',
      status: row.status,
      paymentId: row.payment_id,
      gateway: row.gateway,
      createdAt: row.created_at,
    }));

    res.json({
      success: true,
      data,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (error) {
    console.error('Admin orders-revenue list error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch orders/revenue', error: error.message });
  }
});

/**
 * GET /api/admin/orders-revenue/summary
 * Revenue + count rollups: today / this week / this month / all-time.
 */
router.get('/summary', async (req, res) => {
  try {
    const sql = `
      WITH combined AS (
        SELECT p.amount, p."createdAt" AS created_at
        FROM payments p
        WHERE p.status = 'success'
        UNION ALL
        SELECT up."paidAmount" AS amount, up."createdAt" AS created_at
        FROM user_plans up
        WHERE up."paidAmount" > 0
      )
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE created_at >= date_trunc('day', now())), 0) AS today_revenue,
        COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now())) AS today_count,
        COALESCE(SUM(amount) FILTER (WHERE created_at >= date_trunc('week', now())), 0) AS week_revenue,
        COUNT(*) FILTER (WHERE created_at >= date_trunc('week', now())) AS week_count,
        COALESCE(SUM(amount) FILTER (WHERE created_at >= date_trunc('month', now())), 0) AS month_revenue,
        COUNT(*) FILTER (WHERE created_at >= date_trunc('month', now())) AS month_count,
        COALESCE(SUM(amount), 0) AS all_time_revenue,
        COUNT(*) AS all_time_count
      FROM combined
    `;
    const result = await pool.query(sql);
    const row = result.rows[0] || {};
    res.json({
      success: true,
      summary: {
        todayRevenue: Number(row.today_revenue || 0),
        todayCount: Number(row.today_count || 0),
        weekRevenue: Number(row.week_revenue || 0),
        weekCount: Number(row.week_count || 0),
        monthRevenue: Number(row.month_revenue || 0),
        monthCount: Number(row.month_count || 0),
        allTimeRevenue: Number(row.all_time_revenue || 0),
        allTimeCount: Number(row.all_time_count || 0),
      },
    });
  } catch (error) {
    console.error('Admin orders-revenue summary error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch summary', error: error.message });
  }
});

export default router;
