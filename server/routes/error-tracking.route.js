/**
 * Error Tracking & Dashboard Routes
 * 
 * Super Admin endpoints for monitoring and analyzing system errors:
 * - Categorized error tracking
 * - Tenant attribution
 * - Error trends and patterns
 * - Alerting rules configuration
 * 
 * @module routes/error-tracking.route
 */

import express from 'express';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { authUser } from '../middleware/auth.middleware.js';

const router = express.Router();

/**
 * Error categories for classification
 */
const ERROR_CATEGORIES = {
  AUTHENTICATION: 'authentication',
  AUTHORIZATION: 'authorization',
  DATABASE: 'database',
  NETWORK: 'network',
  VALIDATION: 'validation',
  INTEGRATION: 'integration',
  PAYMENT: 'payment',
  FILE_UPLOAD: 'file_upload',
  VOICE_SCRIBER: 'voice_scriber',
  AI_SERVICE: 'ai_service',
  EMAIL: 'email',
  SMS: 'sms',
  UNKNOWN: 'unknown'
};

const ERROR_SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * Middleware to verify super admin access
 */
const requireSuperAdmin = (req, res, next) => {
  const userRole = req.user?.role || '';
  const isAdmin = ['admin', 'superadmin', 'system_admin', 'platform_admin'].includes(userRole);
  const isSuperAdmin = req.user?.email === 'admin@mediczy.com' || req.user?.isAdmin;
  
  if (!isAdmin && !isSuperAdmin) {
    return res.status(403).json({
      success: false,
      error: 'Super admin access required'
    });
  }
  next();
};

/**
 * @route GET /api/admin/errors/dashboard
 * @desc Get error dashboard overview
 * @access Super Admin
 */
router.get('/dashboard', authUser, requireSuperAdmin, async (req, res) => {
  try {
    const { hours = 24 } = req.query;

    // Get error counts by severity
    const [severityCounts] = await sequelize.query(`
      SELECT 
        severity,
        COUNT(*) as count
      FROM system_errors
      WHERE created_at >= NOW() - INTERVAL '${parseInt(hours)} hours'
      GROUP BY severity
      ORDER BY 
        CASE severity 
          WHEN 'critical' THEN 1 
          WHEN 'high' THEN 2 
          WHEN 'medium' THEN 3 
          WHEN 'low' THEN 4 
        END
    `).catch(() => [[]]);

    // Get error counts by category
    const [categoryCounts] = await sequelize.query(`
      SELECT 
        category,
        COUNT(*) as count
      FROM system_errors
      WHERE created_at >= NOW() - INTERVAL '${parseInt(hours)} hours'
      GROUP BY category
      ORDER BY count DESC
    `).catch(() => [[]]);

    // Get top affected tenants
    const [affectedTenants] = await sequelize.query(`
      SELECT 
        e.tenant_id,
        t.name as tenant_name,
        COUNT(*) as error_count,
        COUNT(DISTINCT e.category) as categories_affected
      FROM system_errors e
      LEFT JOIN tenants t ON e.tenant_id = t.id
      WHERE e.created_at >= NOW() - INTERVAL '${parseInt(hours)} hours'
        AND e.tenant_id IS NOT NULL
      GROUP BY e.tenant_id, t.name
      ORDER BY error_count DESC
      LIMIT 10
    `).catch(() => [[]]);

    // Get hourly trend
    const [hourlyTrend] = await sequelize.query(`
      SELECT 
        DATE_TRUNC('hour', created_at) as hour,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE severity = 'critical') as critical,
        COUNT(*) FILTER (WHERE severity = 'high') as high
      FROM system_errors
      WHERE created_at >= NOW() - INTERVAL '${parseInt(hours)} hours'
      GROUP BY DATE_TRUNC('hour', created_at)
      ORDER BY hour
    `).catch(() => [[]]);

    // Get unresolved critical errors
    const [unresolvedCritical] = await sequelize.query(`
      SELECT 
        id,
        category,
        message,
        tenant_id,
        created_at
      FROM system_errors
      WHERE severity = 'critical' AND resolved = false
      ORDER BY created_at DESC
      LIMIT 10
    `).catch(() => [[]]);

    // Summary stats
    const totalErrors = severityCounts.reduce((sum, s) => sum + parseInt(s.count || 0), 0);
    const criticalCount = severityCounts.find(s => s.severity === 'critical')?.count || 0;

    res.json({
      success: true,
      data: {
        summary: {
          totalErrors,
          criticalErrors: parseInt(criticalCount),
          period: `Last ${hours} hours`,
          lastUpdated: new Date().toISOString()
        },
        bySeverity: severityCounts || [],
        byCategory: categoryCounts || [],
        affectedTenants: affectedTenants || [],
        hourlyTrend: hourlyTrend || [],
        unresolvedCritical: unresolvedCritical || []
      }
    });
  } catch (error) {
    console.error('Error dashboard error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch error dashboard',
      message: error.message
    });
  }
});

/**
 * @route GET /api/admin/errors
 * @desc List errors with filtering
 * @access Super Admin
 */
router.get('/', authUser, requireSuperAdmin, async (req, res) => {
  try {
    const {
      category,
      severity,
      tenantId,
      resolved,
      startDate,
      endDate,
      search,
      page = 1,
      limit = 50
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (category) {
      whereClause += ` AND category = $${paramIndex++}`;
      params.push(category);
    }
    if (severity) {
      whereClause += ` AND severity = $${paramIndex++}`;
      params.push(severity);
    }
    if (tenantId) {
      whereClause += ` AND tenant_id = $${paramIndex++}`;
      params.push(tenantId);
    }
    if (resolved !== undefined) {
      whereClause += ` AND resolved = $${paramIndex++}`;
      params.push(resolved === 'true');
    }
    if (startDate) {
      whereClause += ` AND created_at >= $${paramIndex++}`;
      params.push(startDate);
    }
    if (endDate) {
      whereClause += ` AND created_at <= $${paramIndex++}`;
      params.push(endDate);
    }
    if (search) {
      whereClause += ` AND (message ILIKE $${paramIndex} OR stack_trace ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    const [errors] = await sequelize.query(`
      SELECT 
        e.id,
        e.category,
        e.severity,
        e.message,
        e.error_code,
        e.stack_trace,
        e.request_path,
        e.request_method,
        e.user_id,
        e.tenant_id,
        t.name as tenant_name,
        e.resolved,
        e.resolved_at,
        e.resolved_by,
        e.created_at,
        e.metadata
      FROM system_errors e
      LEFT JOIN tenants t ON e.tenant_id = t.id
      ${whereClause}
      ORDER BY e.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `, { bind: [...params, parseInt(limit), offset] });

    // Get total count
    const [countResult] = await sequelize.query(`
      SELECT COUNT(*) as total FROM system_errors e ${whereClause}
    `, { bind: params });

    res.json({
      success: true,
      data: {
        errors: errors || [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(countResult?.[0]?.total || 0),
          totalPages: Math.ceil((countResult?.[0]?.total || 0) / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('List errors error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch errors',
      message: error.message
    });
  }
});

/**
 * @route GET /api/admin/errors/:errorId
 * @desc Get single error details
 * @access Super Admin
 */
router.get('/:errorId', authUser, requireSuperAdmin, async (req, res) => {
  try {
    const { errorId } = req.params;

    const [errors] = await sequelize.query(`
      SELECT 
        e.*,
        t.name as tenant_name,
        u.email as user_email
      FROM system_errors e
      LEFT JOIN tenants t ON e.tenant_id = t.id
      LEFT JOIN users u ON e.user_id = u.id
      WHERE e.id = $1
    `, { bind: [errorId] });

    if (!errors || errors.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Error not found'
      });
    }

    // Get similar errors (same category and similar message)
    const [similar] = await sequelize.query(`
      SELECT id, message, tenant_id, created_at
      FROM system_errors
      WHERE category = $1 AND id != $2
        AND created_at >= NOW() - INTERVAL '7 days'
      ORDER BY created_at DESC
      LIMIT 5
    `, { bind: [errors[0].category, errorId] });

    res.json({
      success: true,
      data: {
        error: errors[0],
        similarErrors: similar || []
      }
    });
  } catch (error) {
    console.error('Get error details error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch error details',
      message: error.message
    });
  }
});

/**
 * @route PATCH /api/admin/errors/:errorId/resolve
 * @desc Mark error as resolved
 * @access Super Admin
 */
router.patch('/:errorId/resolve', authUser, requireSuperAdmin, async (req, res) => {
  try {
    const { errorId } = req.params;
    const { resolution_notes } = req.body;

    const [result] = await sequelize.query(`
      UPDATE system_errors 
      SET resolved = true, 
          resolved_at = NOW(), 
          resolved_by = $2,
          resolution_notes = $3,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, { bind: [errorId, req.user?.id || req.user?.email, resolution_notes] });

    if (!result || result.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Error not found'
      });
    }

    res.json({
      success: true,
      data: { error: result[0] },
      message: 'Error marked as resolved'
    });
  } catch (error) {
    console.error('Resolve error error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resolve error',
      message: error.message
    });
  }
});

/**
 * @route POST /api/admin/errors
 * @desc Log a new error (internal API)
 * @access Internal
 */
router.post('/', async (req, res) => {
  try {
    const {
      category = ERROR_CATEGORIES.UNKNOWN,
      severity = ERROR_SEVERITY.MEDIUM,
      message,
      error_code,
      stack_trace,
      request_path,
      request_method,
      user_id,
      tenant_id,
      metadata
    } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Error message is required'
      });
    }

    const [result] = await sequelize.query(`
      INSERT INTO system_errors (
        category, severity, message, error_code, stack_trace,
        request_path, request_method, user_id, tenant_id, metadata,
        resolved, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false, NOW())
      RETURNING *
    `, {
      bind: [
        category,
        severity,
        message,
        error_code,
        stack_trace,
        request_path,
        request_method,
        user_id,
        tenant_id,
        metadata ? JSON.stringify(metadata) : null
      ]
    });

    res.status(201).json({
      success: true,
      data: { error: result[0] }
    });
  } catch (error) {
    console.error('Log error error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to log error'
    });
  }
});

/**
 * @route GET /api/admin/errors/trends/:tenantId
 * @desc Get error trends for a specific tenant
 * @access Super Admin
 */
router.get('/trends/:tenantId', authUser, requireSuperAdmin, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { days = 30 } = req.query;

    // Daily error trend
    const [dailyTrend] = await sequelize.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE severity = 'critical') as critical,
        COUNT(*) FILTER (WHERE severity = 'high') as high,
        COUNT(*) FILTER (WHERE severity = 'medium') as medium,
        COUNT(*) FILTER (WHERE severity = 'low') as low
      FROM system_errors
      WHERE tenant_id = $1
        AND created_at >= NOW() - INTERVAL '${parseInt(days)} days'
      GROUP BY DATE(created_at)
      ORDER BY date
    `, { bind: [tenantId] });

    // Error by category
    const [byCategory] = await sequelize.query(`
      SELECT 
        category,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE resolved = true) as resolved_count
      FROM system_errors
      WHERE tenant_id = $1
        AND created_at >= NOW() - INTERVAL '${parseInt(days)} days'
      GROUP BY category
      ORDER BY count DESC
    `, { bind: [tenantId] });

    // Most common errors
    const [commonErrors] = await sequelize.query(`
      SELECT 
        message,
        category,
        COUNT(*) as occurrence_count,
        MAX(created_at) as last_occurrence
      FROM system_errors
      WHERE tenant_id = $1
        AND created_at >= NOW() - INTERVAL '${parseInt(days)} days'
      GROUP BY message, category
      ORDER BY occurrence_count DESC
      LIMIT 10
    `, { bind: [tenantId] });

    res.json({
      success: true,
      data: {
        tenantId,
        period: `Last ${days} days`,
        dailyTrend: dailyTrend || [],
        byCategory: byCategory || [],
        commonErrors: commonErrors || []
      }
    });
  } catch (error) {
    console.error('Get tenant trends error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tenant error trends',
      message: error.message
    });
  }
});

/**
 * @route GET /api/admin/errors/alerts/rules
 * @desc Get alerting rules configuration
 * @access Super Admin
 */
router.get('/alerts/rules', authUser, requireSuperAdmin, async (req, res) => {
  try {
    const [rules] = await sequelize.query(`
      SELECT * FROM error_alert_rules
      ORDER BY priority DESC, created_at DESC
    `).catch(() => [[]]);

    res.json({
      success: true,
      data: { rules: rules || [] }
    });
  } catch (error) {
    console.error('Get alert rules error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch alert rules',
      message: error.message
    });
  }
});

/**
 * @route POST /api/admin/errors/alerts/rules
 * @desc Create a new alerting rule
 * @access Super Admin
 */
router.post('/alerts/rules', authUser, requireSuperAdmin, async (req, res) => {
  try {
    const {
      name,
      description,
      condition_type, // 'threshold', 'pattern', 'rate'
      condition_value, // JSON config
      severity_filter,
      category_filter,
      tenant_filter,
      notification_channels, // ['email', 'slack', 'sms']
      notification_recipients,
      cooldown_minutes = 60,
      enabled = true,
      priority = 0
    } = req.body;

    if (!name || !condition_type || !condition_value) {
      return res.status(400).json({
        success: false,
        error: 'name, condition_type, and condition_value are required'
      });
    }

    const [result] = await sequelize.query(`
      INSERT INTO error_alert_rules (
        name, description, condition_type, condition_value,
        severity_filter, category_filter, tenant_filter,
        notification_channels, notification_recipients,
        cooldown_minutes, enabled, priority, created_at, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), $13)
      RETURNING *
    `, {
      bind: [
        name,
        description,
        condition_type,
        JSON.stringify(condition_value),
        severity_filter ? JSON.stringify(severity_filter) : null,
        category_filter ? JSON.stringify(category_filter) : null,
        tenant_filter ? JSON.stringify(tenant_filter) : null,
        JSON.stringify(notification_channels || ['email']),
        JSON.stringify(notification_recipients || []),
        cooldown_minutes,
        enabled,
        priority,
        req.user?.id || req.user?.email
      ]
    });

    res.status(201).json({
      success: true,
      data: { rule: result[0] },
      message: 'Alert rule created successfully'
    });
  } catch (error) {
    console.error('Create alert rule error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create alert rule',
      message: error.message
    });
  }
});

/**
 * @route PATCH /api/admin/errors/alerts/rules/:ruleId
 * @desc Update an alerting rule
 * @access Super Admin
 */
router.patch('/alerts/rules/:ruleId', authUser, requireSuperAdmin, async (req, res) => {
  try {
    const { ruleId } = req.params;
    const updates = req.body;

    const allowedFields = [
      'name', 'description', 'condition_type', 'condition_value',
      'severity_filter', 'category_filter', 'tenant_filter',
      'notification_channels', 'notification_recipients',
      'cooldown_minutes', 'enabled', 'priority'
    ];

    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        const value = ['condition_value', 'severity_filter', 'category_filter', 
                       'tenant_filter', 'notification_channels', 'notification_recipients']
                       .includes(field) 
          ? JSON.stringify(updates[field]) 
          : updates[field];
        setClauses.push(`${field} = $${paramIndex++}`);
        values.push(value);
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields to update'
      });
    }

    setClauses.push(`updated_at = NOW()`);
    values.push(ruleId);

    const [result] = await sequelize.query(`
      UPDATE error_alert_rules 
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, { bind: values });

    if (!result || result.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Alert rule not found'
      });
    }

    res.json({
      success: true,
      data: { rule: result[0] },
      message: 'Alert rule updated successfully'
    });
  } catch (error) {
    console.error('Update alert rule error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update alert rule',
      message: error.message
    });
  }
});

/**
 * @route DELETE /api/admin/errors/alerts/rules/:ruleId
 * @desc Delete an alerting rule
 * @access Super Admin
 */
router.delete('/alerts/rules/:ruleId', authUser, requireSuperAdmin, async (req, res) => {
  try {
    const { ruleId } = req.params;

    const [result] = await sequelize.query(`
      DELETE FROM error_alert_rules WHERE id = $1 RETURNING id
    `, { bind: [ruleId] });

    if (!result || result.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Alert rule not found'
      });
    }

    res.json({
      success: true,
      message: 'Alert rule deleted successfully'
    });
  } catch (error) {
    console.error('Delete alert rule error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete alert rule',
      message: error.message
    });
  }
});

/**
 * Export error categories and severity for use elsewhere
 */
export { ERROR_CATEGORIES, ERROR_SEVERITY };
export default router;
