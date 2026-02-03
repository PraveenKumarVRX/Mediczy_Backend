/**
 * SaaS Dashboard API Routes
 * 
 * Phase 2: Usage Dashboard endpoints for tenant analytics visualization
 * Provides data for charts, graphs, and usage summaries
 * 
 * @module routes/saas-dashboard.route
 */

import express from 'express';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import Tenant from '../models/postgres/tenant.model.postgres.js';
import usageMeteringService from '../services/usage-metering.service.js';
import saasBillingService from '../services/saas-billing.service.js';
import { authUser } from '../middleware/auth.middleware.js';

const router = express.Router();

/**
 * Middleware to verify admin access
 */
const requireAdminAccess = (req, res, next) => {
  const userRole = req.user?.role || '';
  const isAdmin = ['admin', 'superadmin', 'system_admin', 'platform_admin'].includes(userRole);
  const isSuperAdmin = req.user?.email === 'admin@mediczy.com' || req.user?.isAdmin;
  
  if (!isAdmin && !isSuperAdmin) {
    return res.status(403).json({
      success: false,
      error: 'Admin access required'
    });
  }
  next();
};

// ============================================================================
// PLATFORM-WIDE DASHBOARD
// ============================================================================

/**
 * @route GET /api/admin/saas-dashboard/overview
 * @desc Get platform-wide SaaS metrics overview
 * @access Super Admin
 */
router.get('/overview', authUser, requireAdminAccess, async (req, res) => {
  try {
    // Active tenants count
    const [tenantStats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total_tenants,
        COUNT(*) FILTER (WHERE status = 'active') as active_tenants,
        COUNT(*) FILTER (WHERE status = 'suspended') as suspended_tenants,
        COUNT(*) FILTER (WHERE status = 'trial') as trial_tenants,
        COUNT(*) FILTER (WHERE "createdAt" >= NOW() - INTERVAL '30 days') as new_tenants_30d
      FROM tenants
    `);

    // Revenue metrics (current month)
    const [revenueStats] = await sequelize.query(`
      SELECT 
        COALESCE(SUM(total_amount), 0) as revenue_mtd,
        COALESCE(SUM(paid_amount), 0) as collected_mtd,
        COUNT(*) as invoices_generated,
        COUNT(*) FILTER (WHERE status = 'paid') as invoices_paid,
        COUNT(*) FILTER (WHERE status = 'overdue') as invoices_overdue
      FROM saas_invoices
      WHERE billing_period_start >= DATE_TRUNC('month', NOW())
    `).catch(() => [[{ revenue_mtd: 0, collected_mtd: 0, invoices_generated: 0, invoices_paid: 0, invoices_overdue: 0 }]]);

    // Usage aggregates
    const [usageStats] = await sequelize.query(`
      SELECT 
        COALESCE(SUM((usage->>'opd_patients_mtd')::int), 0) as total_opd_mtd,
        COALESCE(SUM((usage->>'ipd_admissions_mtd')::int), 0) as total_ipd_mtd,
        COALESCE(SUM((usage->>'voice_minutes_mtd')::numeric), 0) as total_voice_minutes_mtd,
        COALESCE(SUM((usage->>'storage_used_mb')::numeric), 0) / 1024 as total_storage_gb
      FROM tenants
      WHERE status = 'active'
    `).catch(() => [[{ total_opd_mtd: 0, total_ipd_mtd: 0, total_voice_minutes_mtd: 0, total_storage_gb: 0 }]]);

    // Voice scriber stats
    const [voiceStats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total_devices,
        COUNT(*) FILTER (WHERE status = 'online') as online_devices,
        COUNT(DISTINCT tenant_id) as tenants_with_devices
      FROM voice_scriber_devices
    `).catch(() => [[{ total_devices: 0, online_devices: 0, tenants_with_devices: 0 }]]);

    // Alert summary
    const [alertStats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total_alerts_today,
        COUNT(*) FILTER (WHERE alert_level = 'critical') as critical_alerts,
        COUNT(*) FILTER (WHERE alert_level = 'exceeded') as exceeded_alerts,
        COUNT(*) FILTER (WHERE acknowledged = false) as unacknowledged
      FROM usage_alerts
      WHERE created_at >= DATE_TRUNC('day', NOW())
    `).catch(() => [[{ total_alerts_today: 0, critical_alerts: 0, exceeded_alerts: 0, unacknowledged: 0 }]]);

    res.json({
      success: true,
      data: {
        tenants: tenantStats[0] || {},
        revenue: revenueStats[0] || {},
        usage: usageStats[0] || {},
        voiceScriber: voiceStats[0] || {},
        alerts: alertStats[0] || {},
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('SaaS dashboard overview error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard overview',
      message: error.message
    });
  }
});

/**
 * @route GET /api/admin/saas-dashboard/usage-trends
 * @desc Get platform-wide usage trends for charts
 * @access Super Admin
 */
router.get('/usage-trends', authUser, requireAdminAccess, async (req, res) => {
  try {
    const { days = 30, granularity = 'daily' } = req.query;
    
    let dateFormat, interval;
    switch (granularity) {
      case 'hourly':
        dateFormat = "YYYY-MM-DD HH24:00";
        interval = 'hour';
        break;
      case 'weekly':
        dateFormat = "IYYY-IW";
        interval = 'week';
        break;
      case 'monthly':
        dateFormat = "YYYY-MM";
        interval = 'month';
        break;
      default:
        dateFormat = "YYYY-MM-DD";
        interval = 'day';
    }

    // Usage logs trend
    const [usageTrend] = await sequelize.query(`
      SELECT 
        TO_CHAR(DATE_TRUNC('${interval}', created_at), '${dateFormat}') as period,
        usage_type,
        SUM(quantity) as total
      FROM usage_logs
      WHERE created_at >= NOW() - INTERVAL '${parseInt(days)} days'
      GROUP BY DATE_TRUNC('${interval}', created_at), usage_type
      ORDER BY period
    `).catch(() => [[]]);

    // New tenants trend
    const [tenantTrend] = await sequelize.query(`
      SELECT 
        TO_CHAR(DATE_TRUNC('${interval}', "createdAt"), '${dateFormat}') as period,
        COUNT(*) as new_tenants,
        COUNT(*) FILTER (WHERE plan = 'free') as free_signups,
        COUNT(*) FILTER (WHERE plan != 'free') as paid_signups
      FROM tenants
      WHERE "createdAt" >= NOW() - INTERVAL '${parseInt(days)} days'
      GROUP BY DATE_TRUNC('${interval}', "createdAt")
      ORDER BY period
    `).catch(() => [[]]);

    // Revenue trend
    const [revenueTrend] = await sequelize.query(`
      SELECT 
        TO_CHAR(DATE_TRUNC('${interval}', created_at), '${dateFormat}') as period,
        SUM(total_amount) as invoiced,
        SUM(paid_amount) as collected
      FROM saas_invoices
      WHERE created_at >= NOW() - INTERVAL '${parseInt(days)} days'
      GROUP BY DATE_TRUNC('${interval}', created_at)
      ORDER BY period
    `).catch(() => [[]]);

    res.json({
      success: true,
      data: {
        usageTrend: usageTrend || [],
        tenantTrend: tenantTrend || [],
        revenueTrend: revenueTrend || [],
        period: { days: parseInt(days), granularity }
      }
    });
  } catch (error) {
    console.error('Usage trends error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch usage trends',
      message: error.message
    });
  }
});

/**
 * @route GET /api/admin/saas-dashboard/tenant-comparison
 * @desc Compare usage across tenants for benchmarking
 * @access Super Admin
 */
router.get('/tenant-comparison', authUser, requireAdminAccess, async (req, res) => {
  try {
    const { metric = 'opd', limit = 20 } = req.query;

    let usageField;
    switch (metric) {
      case 'ipd':
        usageField = "ipd_admissions_mtd";
        break;
      case 'voice':
        usageField = "voice_minutes_mtd";
        break;
      case 'storage':
        usageField = "storage_used_mb";
        break;
      default:
        usageField = "opd_patients_mtd";
    }

    const [comparison] = await sequelize.query(`
      SELECT 
        t.id,
        t.name,
        t.plan,
        COALESCE((t.usage->>'${usageField}')::numeric, 0) as usage_value,
        COALESCE((t.limits->>'${usageField.replace('_mtd', '_per_month')}')::numeric, 0) as limit_value,
        CASE 
          WHEN COALESCE((t.limits->>'${usageField.replace('_mtd', '_per_month')}')::numeric, 0) > 0
          THEN ROUND((COALESCE((t.usage->>'${usageField}')::numeric, 0) / 
                      (t.limits->>'${usageField.replace('_mtd', '_per_month')}')::numeric) * 100, 1)
          ELSE 0
        END as usage_percent
      FROM tenants t
      WHERE t.status = 'active'
      ORDER BY usage_value DESC
      LIMIT $1
    `, { bind: [parseInt(limit)] });

    // Calculate platform averages
    const [averages] = await sequelize.query(`
      SELECT 
        AVG(COALESCE((usage->>'${usageField}')::numeric, 0)) as avg_usage,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY COALESCE((usage->>'${usageField}')::numeric, 0)) as median_usage,
        MAX(COALESCE((usage->>'${usageField}')::numeric, 0)) as max_usage
      FROM tenants
      WHERE status = 'active'
    `).catch(() => [[{ avg_usage: 0, median_usage: 0, max_usage: 0 }]]);

    res.json({
      success: true,
      data: {
        metric,
        tenants: comparison || [],
        platformAverages: averages[0] || {},
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Tenant comparison error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tenant comparison',
      message: error.message
    });
  }
});

// ============================================================================
// TENANT-SPECIFIC DASHBOARD
// ============================================================================

/**
 * @route GET /api/admin/saas-dashboard/tenant/:tenantId
 * @desc Get detailed usage dashboard for a specific tenant
 * @access Admin
 */
router.get('/tenant/:tenantId', authUser, requireAdminAccess, async (req, res) => {
  try {
    const { tenantId } = req.params;

    const tenant = await Tenant.findByPk(tenantId);
    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: 'Tenant not found'
      });
    }

    // Get comprehensive dashboard data
    const dashboardData = await usageMeteringService.getDashboardData(tenantId);
    
    // Get billing summary
    const billingSummary = await saasBillingService.getBillingSummary(tenantId);

    // Get usage history (last 6 months)
    const [usageHistory] = await sequelize.query(`
      SELECT 
        TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as month,
        usage_type,
        SUM(quantity) as total
      FROM usage_logs
      WHERE tenant_id = $1
        AND created_at >= NOW() - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', created_at), usage_type
      ORDER BY month
    `, { bind: [tenantId] }).catch(() => [[]]);

    // Get recent alerts
    const [recentAlerts] = await sequelize.query(`
      SELECT id, usage_type, threshold_percent, alert_level, message, created_at, acknowledged
      FROM usage_alerts
      WHERE tenant_id = $1
      ORDER BY created_at DESC
      LIMIT 10
    `, { bind: [tenantId] }).catch(() => [[]]);

    // Get recent invoices
    const [recentInvoices] = await sequelize.query(`
      SELECT id, invoice_number, billing_period_start, billing_period_end, 
             total_amount, paid_amount, status, due_date
      FROM saas_invoices
      WHERE tenant_id = $1
      ORDER BY created_at DESC
      LIMIT 5
    `, { bind: [tenantId] }).catch(() => [[]]);

    res.json({
      success: true,
      data: {
        tenant: {
          id: tenant.id,
          name: tenant.name,
          planType: tenant.plan,
          status: tenant.status,
          createdAt: tenant.created_at
        },
        usage: dashboardData,
        billing: billingSummary,
        usageHistory: usageHistory || [],
        recentAlerts: recentAlerts || [],
        recentInvoices: recentInvoices || [],
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Tenant dashboard error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tenant dashboard',
      message: error.message
    });
  }
});

/**
 * @route GET /api/admin/saas-dashboard/tenant/:tenantId/usage-breakdown
 * @desc Get detailed usage breakdown by category
 * @access Admin
 */
router.get('/tenant/:tenantId/usage-breakdown', authUser, requireAdminAccess, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { startDate, endDate } = req.query;

    const start = startDate || new Date(new Date().setDate(1)).toISOString().split('T')[0];
    const end = endDate || new Date().toISOString().split('T')[0];

    // OPD by doctor
    const [opdByDoctor] = await sequelize.query(`
      SELECT 
        doctor_id,
        COUNT(*) as visits
      FROM usage_logs
      WHERE tenant_id = $1 
        AND usage_type = 'opd_visit'
        AND created_at BETWEEN $2 AND $3
        AND doctor_id IS NOT NULL
      GROUP BY doctor_id
      ORDER BY visits DESC
      LIMIT 10
    `, { bind: [tenantId, start, end] }).catch(() => [[]]);

    // Usage by day of week
    const [byDayOfWeek] = await sequelize.query(`
      SELECT 
        EXTRACT(DOW FROM created_at) as day_of_week,
        TO_CHAR(created_at, 'Day') as day_name,
        usage_type,
        COUNT(*) as count
      FROM usage_logs
      WHERE tenant_id = $1
        AND created_at BETWEEN $2 AND $3
      GROUP BY EXTRACT(DOW FROM created_at), TO_CHAR(created_at, 'Day'), usage_type
      ORDER BY day_of_week
    `, { bind: [tenantId, start, end] }).catch(() => [[]]);

    // Usage by hour (for pattern analysis)
    const [byHour] = await sequelize.query(`
      SELECT 
        EXTRACT(HOUR FROM created_at) as hour,
        usage_type,
        COUNT(*) as count
      FROM usage_logs
      WHERE tenant_id = $1
        AND created_at BETWEEN $2 AND $3
      GROUP BY EXTRACT(HOUR FROM created_at), usage_type
      ORDER BY hour
    `, { bind: [tenantId, start, end] }).catch(() => [[]]);

    // Daily totals
    const [dailyTotals] = await sequelize.query(`
      SELECT 
        DATE(created_at) as date,
        usage_type,
        SUM(quantity) as total
      FROM usage_logs
      WHERE tenant_id = $1
        AND created_at BETWEEN $2 AND $3
      GROUP BY DATE(created_at), usage_type
      ORDER BY date
    `, { bind: [tenantId, start, end] }).catch(() => [[]]);

    res.json({
      success: true,
      data: {
        tenantId,
        period: { start, end },
        opdByDoctor: opdByDoctor || [],
        byDayOfWeek: byDayOfWeek || [],
        byHour: byHour || [],
        dailyTotals: dailyTotals || []
      }
    });
  } catch (error) {
    console.error('Usage breakdown error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch usage breakdown',
      message: error.message
    });
  }
});

/**
 * @route GET /api/admin/saas-dashboard/plans
 * @desc Get plan-wise distribution and statistics
 * @access Super Admin
 */
router.get('/plans', authUser, requireAdminAccess, async (req, res) => {
  try {
    const [planStats] = await sequelize.query(`
      SELECT 
        plan,
        COUNT(*) as tenant_count,
        COUNT(*) FILTER (WHERE status = 'active') as active_count,
        COALESCE(AVG((usage->>'opd_patients_mtd')::numeric), 0) as avg_opd,
        COALESCE(AVG((usage->>'ipd_admissions_mtd')::numeric), 0) as avg_ipd,
        COALESCE(AVG((usage->>'voice_minutes_mtd')::numeric), 0) as avg_voice
      FROM tenants
      GROUP BY plan
      ORDER BY tenant_count DESC
    `).catch(() => [[]]);

    // Plan upgrade/downgrade trends
    const [planChanges] = await sequelize.query(`
      SELECT 
        TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as month,
        action,
        COUNT(*) as count
      FROM tenant_suspension_history
      WHERE action IN ('plan_upgrade', 'plan_downgrade')
        AND created_at >= NOW() - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', created_at), action
      ORDER BY month
    `).catch(() => [[]]);

    res.json({
      success: true,
      data: {
        planDistribution: planStats || [],
        planChangeTrends: planChanges || [],
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Plan stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch plan statistics',
      message: error.message
    });
  }
});

/**
 * @route GET /api/admin/saas-dashboard/alerts-summary
 * @desc Get alerts summary with trends
 * @access Super Admin
 */
router.get('/alerts-summary', authUser, requireAdminAccess, async (req, res) => {
  try {
    const { days = 30 } = req.query;

    // Alerts by level
    const [byLevel] = await sequelize.query(`
      SELECT 
        alert_level,
        COUNT(*) as count
      FROM usage_alerts
      WHERE created_at >= NOW() - INTERVAL '${parseInt(days)} days'
      GROUP BY alert_level
    `).catch(() => [[]]);

    // Alerts by type
    const [byType] = await sequelize.query(`
      SELECT 
        usage_type,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE acknowledged = true) as acknowledged
      FROM usage_alerts
      WHERE created_at >= NOW() - INTERVAL '${parseInt(days)} days'
      GROUP BY usage_type
      ORDER BY count DESC
    `).catch(() => [[]]);

    // Daily trend
    const [dailyTrend] = await sequelize.query(`
      SELECT 
        DATE(created_at) as date,
        alert_level,
        COUNT(*) as count
      FROM usage_alerts
      WHERE created_at >= NOW() - INTERVAL '${parseInt(days)} days'
      GROUP BY DATE(created_at), alert_level
      ORDER BY date
    `).catch(() => [[]]);

    // Most affected tenants
    const [topAffected] = await sequelize.query(`
      SELECT 
        a.tenant_id,
        t.name as tenant_name,
        COUNT(*) as alert_count,
        COUNT(*) FILTER (WHERE a.alert_level = 'exceeded') as exceeded_count
      FROM usage_alerts a
      JOIN tenants t ON a.tenant_id = t.id
      WHERE a.created_at >= NOW() - INTERVAL '${parseInt(days)} days'
      GROUP BY a.tenant_id, t.name
      ORDER BY alert_count DESC
      LIMIT 10
    `).catch(() => [[]]);

    res.json({
      success: true,
      data: {
        byLevel: byLevel || [],
        byType: byType || [],
        dailyTrend: dailyTrend || [],
        topAffectedTenants: topAffected || [],
        period: { days: parseInt(days) }
      }
    });
  } catch (error) {
    console.error('Alerts summary error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch alerts summary',
      message: error.message
    });
  }
});

export default router;
