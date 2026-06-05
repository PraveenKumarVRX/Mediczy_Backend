/**
 * Pharmacy Compliance Routes
 */

import express from 'express';
import { db } from '../../db/index.js';
import { requirePharmacyAuth } from '../../middleware/pharmacyAuth.middleware.js';

const router = express.Router();

router.use(requirePharmacyAuth);

const toSafeLimit = (value, fallback = 100) =>
  Math.min(250, Math.max(1, Number.parseInt(value, 10) || fallback));

const safeDateRange = (query) => ({
  startDate: query.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  endDate: query.endDate || new Date().toISOString().slice(0, 10)
});

router.get('/audit-logs', async (req, res) => {
  try {
    const pharmacyId = req.pharmacyId;
    const limit = toSafeLimit(req.query.limit);
    const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);
    const params = [pharmacyId];
    const conditions = ['pharmacy_id = $1'];

    if (req.query.action) {
      params.push(String(req.query.action));
      conditions.push('action = $' + params.length);
    }

    if (req.query.resourceType) {
      params.push(String(req.query.resourceType));
      conditions.push('resource_type = $' + params.length);
    }

    params.push(limit, offset);

    const result = await db.query([
      'SELECT * FROM pharmacy_audit_logs',
      'WHERE ' + conditions.join(' AND '),
      'ORDER BY created_at DESC',
      'LIMIT $' + (params.length - 1) + ' OFFSET $' + params.length + ';'
    ].join(' '), params);

    res.json({ success: true, auditLogs: result.rows, total: result.rows.length });
  } catch (error) {
    console.error('Fetch pharmacy audit logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pharmacy audit logs',
      error: error.message
    });
  }
});

router.get('/dispensing-report', async (req, res) => {
  try {
    const pharmacyId = req.pharmacyId;
    const { startDate, endDate } = safeDateRange(req.query);
    const rangeParams = [pharmacyId, startDate, endDate];

    const [prescriptions, controlled, returns, sales] = await Promise.all([
      db.query([
        'SELECT status, verification_status, COUNT(*)::int as count',
        'FROM pharmacy_prescriptions',
        'WHERE pharmacy_id = $1 AND created_at >= $2::date AND created_at < ($3::date + INTERVAL \'1 day\')',
        'GROUP BY status, verification_status',
        'ORDER BY status ASC;'
      ].join(' '), rangeParams),
      db.query([
        'SELECT COUNT(DISTINCT p.id)::int as prescriptions, COALESCE(SUM(pmx.quantity), 0)::int as units',
        'FROM pharmacy_prescriptions p',
        'INNER JOIN pharmacy_prescription_medicines pmx ON p.id = pmx.prescription_id',
        'INNER JOIN pharmacy_medicines m ON pmx.medicine_id = m.id',
        'WHERE p.pharmacy_id = $1',
        'AND p.created_at >= $2::date AND p.created_at < ($3::date + INTERVAL \'1 day\')',
        "AND (COALESCE(m.is_controlled, false) = true OR UPPER(COALESCE(m.schedule, '')) IN ('H', 'H1', 'X', 'NARCOTIC', 'CONTROLLED'));"
      ].join(' '), rangeParams),
      db.query([
        'SELECT COUNT(*)::int as count, COALESCE(SUM(total_amount), 0)::numeric as amount',
        'FROM pharmacy_returns',
        'WHERE pharmacy_id = $1 AND created_at >= $2::date AND created_at < ($3::date + INTERVAL \'1 day\');'
      ].join(' '), rangeParams),
      db.query([
        'SELECT COUNT(*)::int as count, COALESCE(SUM(total_amount), 0)::numeric as amount',
        'FROM pharmacy_transactions',
        'WHERE pharmacy_id = $1 AND created_at >= $2::date AND created_at < ($3::date + INTERVAL \'1 day\');'
      ].join(' '), rangeParams)
    ]);

    res.json({
      success: true,
      report: {
        startDate,
        endDate,
        prescriptions: prescriptions.rows,
        controlledDispensing: controlled.rows[0] || { prescriptions: 0, units: 0 },
        returns: returns.rows[0] || { count: 0, amount: 0 },
        sales: sales.rows[0] || { count: 0, amount: 0 }
      }
    });
  } catch (error) {
    console.error('Fetch pharmacy dispensing report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dispensing report',
      error: error.message
    });
  }
});

export default router;
