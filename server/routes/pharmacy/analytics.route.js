/**
 * Pharmacy Analytics Routes
 */

import express from 'express';
import { db } from '../../db/index.js';

const router = express.Router();

/**
 * GET /api/pharmacy/analytics/dashboard
 * Get pharmacy dashboard analytics
 */
router.get('/dashboard', async (req, res) => {
  try {
    const { pharmacyId } = req.query;

    // Total sales today
    const salesQuery = `
      SELECT COALESCE(SUM(total_amount), 0) as total_sales
      FROM pharmacy_transactions
      WHERE pharmacy_id = $1 AND DATE(created_at) = CURRENT_DATE;
    `;

    // Total medicines in stock
    const stockQuery = `
      SELECT COALESCE(SUM(quantity), 0) as total_items
      FROM pharmacy_stock
      WHERE pharmacy_id = $1;
    `;

    // Low stock items
    const lowStockQuery = `
      SELECT COUNT(*) as low_stock_count
      FROM pharmacy_stock ps
      JOIN pharmacy_medicines pm ON ps.medicine_id = pm.id
      WHERE ps.pharmacy_id = $1 AND ps.quantity < pm.reorder_level;
    `;

    // Recent transactions
    const recentQuery = `
      SELECT t.*, c.name as customer_name
      FROM pharmacy_transactions t
      LEFT JOIN pharmacy_customers c ON t.customer_id = c.id
      WHERE t.pharmacy_id = $1
      ORDER BY t.created_at DESC
      LIMIT 10;
    `;

    const [salesResult, stockResult, lowStockResult, recentResult] = await Promise.all([
      db.query(salesQuery, [pharmacyId]),
      db.query(stockQuery, [pharmacyId]),
      db.query(lowStockQuery, [pharmacyId]),
      db.query(recentQuery, [pharmacyId])
    ]);

    res.json({
      success: true,
      analytics: {
        sales: {
          total: salesResult.rows[0]?.total_sales || 0,
          period: 'today'
        },
        stock: {
          totalItems: stockResult.rows[0]?.total_items || 0,
          lowStockItems: lowStockResult.rows[0]?.low_stock_count || 0
        },
        recentTransactions: recentResult.rows
      }
    });
  } catch (error) {
    console.error('Fetch analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics',
      error: error.message
    });
  }
});

/**
 * GET /api/pharmacy/analytics/sales
 * Get sales analytics
 */
router.get('/sales', async (req, res) => {
  try {
    const { pharmacyId, days = 30 } = req.query;

    const query = `
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as transaction_count,
        COALESCE(SUM(total_amount), 0) as daily_sales
      FROM pharmacy_transactions
      WHERE pharmacy_id = $1 AND created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC;
    `;

    const result = await db.query(query, [pharmacyId]);

    res.json({
      success: true,
      sales: result.rows
    });
  } catch (error) {
    console.error('Fetch sales analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sales analytics',
      error: error.message
    });
  }
});

export default router;
