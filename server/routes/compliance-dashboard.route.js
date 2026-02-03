/**
 * Compliance Dashboard API Routes
 * 
 * Phase 3: Healthcare compliance tracking endpoints
 * - HIPAA/DPDP compliance status
 * - Audit log management
 * - Data subject requests
 * - Compliance reporting
 * 
 * @module routes/compliance-dashboard.route
 */

import express from 'express';
import complianceDashboardService from '../services/compliance-dashboard.service.js';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';

const router = express.Router();

// Middleware to verify admin access
const verifyAdmin = async (req, res, next) => {
  try {
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'super_admin')) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (error) {
    res.status(401).json({ error: 'Authentication failed' });
  }
};

/**
 * @route GET /api/compliance/dashboard
 * @desc Get comprehensive compliance dashboard
 * @access Admin
 */
router.get('/dashboard', verifyAdmin, async (req, res) => {
  try {
    const dashboard = await complianceDashboardService.getComplianceDashboard();
    res.json(dashboard);
  } catch (error) {
    console.error('[Compliance] Dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch compliance dashboard' });
  }
});

/**
 * @route GET /api/compliance/hipaa
 * @desc Get HIPAA compliance status
 * @access Admin
 */
router.get('/hipaa', verifyAdmin, async (req, res) => {
  try {
    const status = await complianceDashboardService.getHIPAAComplianceStatus();
    res.json(status);
  } catch (error) {
    console.error('[Compliance] HIPAA check error:', error);
    res.status(500).json({ error: 'Failed to fetch HIPAA status' });
  }
});

/**
 * @route GET /api/compliance/dpdp
 * @desc Get DPDP (India) compliance status
 * @access Admin
 */
router.get('/dpdp', verifyAdmin, async (req, res) => {
  try {
    const status = await complianceDashboardService.getDPDPComplianceStatus();
    res.json(status);
  } catch (error) {
    console.error('[Compliance] DPDP check error:', error);
    res.status(500).json({ error: 'Failed to fetch DPDP status' });
  }
});

/**
 * @route GET /api/compliance/audit-logs
 * @desc Get audit logs with filtering
 * @access Admin
 */
router.get('/audit-logs', verifyAdmin, async (req, res) => {
  try {
    const {
      tenantId,
      userId,
      actionType,
      startDate,
      endDate,
      page = 1,
      limit = 50
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const whereParts = [];
    const replacements = {};

    if (tenantId) {
      whereParts.push('tenant_id = :tenantId');
      replacements.tenantId = parseInt(tenantId);
    }
    if (userId) {
      whereParts.push('user_id = :userId');
      replacements.userId = parseInt(userId);
    }
    if (actionType) {
      whereParts.push('action_type = :actionType');
      replacements.actionType = actionType;
    }
    if (startDate) {
      whereParts.push('created_at >= :startDate');
      replacements.startDate = startDate;
    }
    if (endDate) {
      whereParts.push('created_at <= :endDate');
      replacements.endDate = endDate;
    }

    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

    const [logs] = await sequelize.query(`
      SELECT *
      FROM audit_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT :limit OFFSET :offset
    `, {
      replacements: { ...replacements, limit: parseInt(limit), offset }
    }).catch(() => [[]]);

    const [countResult] = await sequelize.query(`
      SELECT COUNT(*) as total
      FROM audit_logs
      ${whereClause}
    `, { replacements }).catch(() => [[{ total: 0 }]]);

    res.json({
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult[0]?.total || 0),
        pages: Math.ceil((countResult[0]?.total || 0) / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('[Compliance] Audit logs error:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

/**
 * @route POST /api/compliance/audit-logs
 * @desc Create an audit log entry
 * @access Admin
 */
router.post('/audit-logs', verifyAdmin, async (req, res) => {
  try {
    const {
      actionType,
      description,
      tenantId,
      userId,
      resourceType,
      resourceId,
      metadata
    } = req.body;

    if (!actionType || !description) {
      return res.status(400).json({ error: 'actionType and description are required' });
    }

    const [result] = await sequelize.query(`
      INSERT INTO audit_logs (
        action_type, description, tenant_id, user_id,
        resource_type, resource_id, metadata, 
        ip_address, user_agent, created_at
      ) VALUES (
        :actionType, :description, :tenantId, :userId,
        :resourceType, :resourceId, :metadata,
        :ipAddress, :userAgent, NOW()
      )
      RETURNING *
    `, {
      replacements: {
        actionType,
        description,
        tenantId: tenantId || null,
        userId: userId || req.user?.id || null,
        resourceType: resourceType || null,
        resourceId: resourceId || null,
        metadata: metadata ? JSON.stringify(metadata) : null,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      }
    });

    res.status(201).json(result[0]);
  } catch (error) {
    console.error('[Compliance] Create audit log error:', error);
    res.status(500).json({ error: 'Failed to create audit log' });
  }
});

/**
 * @route GET /api/compliance/data-requests
 * @desc Get data subject requests (access/erasure)
 * @access Admin
 */
router.get('/data-requests', verifyAdmin, async (req, res) => {
  try {
    const { type, status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Get access requests
    const [accessRequests] = await sequelize.query(`
      SELECT 
        id, 'access' as request_type, user_id, 
        status, requested_at, completed_at, notes
      FROM data_access_requests
      ${status ? `WHERE status = '${status}'` : ''}
      ORDER BY requested_at DESC
      LIMIT :limit OFFSET :offset
    `, {
      replacements: { limit: parseInt(limit), offset }
    }).catch(() => [[]]);

    // Get erasure requests
    const [erasureRequests] = await sequelize.query(`
      SELECT 
        id, 'erasure' as request_type, user_id, 
        status, requested_at, completed_at, notes
      FROM data_erasure_requests
      ${status ? `WHERE status = '${status}'` : ''}
      ORDER BY requested_at DESC
      LIMIT :limit OFFSET :offset
    `, {
      replacements: { limit: parseInt(limit), offset }
    }).catch(() => [[]]);

    // Filter by type if specified
    let requests = [...accessRequests, ...erasureRequests];
    if (type === 'access') requests = accessRequests;
    if (type === 'erasure') requests = erasureRequests;

    // Sort by date
    requests.sort((a, b) => new Date(b.requested_at) - new Date(a.requested_at));

    res.json({
      requests: requests.slice(0, parseInt(limit)),
      summary: {
        totalAccess: accessRequests.length,
        totalErasure: erasureRequests.length,
        pendingAccess: accessRequests.filter(r => r.status === 'pending').length,
        pendingErasure: erasureRequests.filter(r => r.status === 'pending').length
      }
    });
  } catch (error) {
    console.error('[Compliance] Data requests error:', error);
    res.status(500).json({ error: 'Failed to fetch data requests' });
  }
});

/**
 * @route POST /api/compliance/data-requests/access
 * @desc Create a data access request
 * @access Admin
 */
router.post('/data-requests/access', verifyAdmin, async (req, res) => {
  try {
    const { userId, notes } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const [result] = await sequelize.query(`
      INSERT INTO data_access_requests (
        user_id, status, requested_at, requested_by, notes
      ) VALUES (
        :userId, 'pending', NOW(), :requestedBy, :notes
      )
      RETURNING *
    `, {
      replacements: {
        userId: parseInt(userId),
        requestedBy: req.user?.id,
        notes: notes || null
      }
    });

    res.status(201).json(result[0]);
  } catch (error) {
    console.error('[Compliance] Create access request error:', error);
    res.status(500).json({ error: 'Failed to create access request' });
  }
});

/**
 * @route POST /api/compliance/data-requests/erasure
 * @desc Create a data erasure request
 * @access Admin
 */
router.post('/data-requests/erasure', verifyAdmin, async (req, res) => {
  try {
    const { userId, notes, verificationMethod } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const [result] = await sequelize.query(`
      INSERT INTO data_erasure_requests (
        user_id, status, requested_at, requested_by, 
        verification_method, notes
      ) VALUES (
        :userId, 'pending', NOW(), :requestedBy,
        :verificationMethod, :notes
      )
      RETURNING *
    `, {
      replacements: {
        userId: parseInt(userId),
        requestedBy: req.user?.id,
        verificationMethod: verificationMethod || 'admin_verified',
        notes: notes || null
      }
    });

    res.status(201).json(result[0]);
  } catch (error) {
    console.error('[Compliance] Create erasure request error:', error);
    res.status(500).json({ error: 'Failed to create erasure request' });
  }
});

/**
 * @route PATCH /api/compliance/data-requests/:type/:id
 * @desc Update data request status
 * @access Admin
 */
router.patch('/data-requests/:type/:id', verifyAdmin, async (req, res) => {
  try {
    const { type, id } = req.params;
    const { status, notes } = req.body;

    if (!['access', 'erasure'].includes(type)) {
      return res.status(400).json({ error: 'Invalid request type' });
    }

    const table = type === 'access' ? 'data_access_requests' : 'data_erasure_requests';

    const [result] = await sequelize.query(`
      UPDATE ${table}
      SET 
        status = :status,
        ${status === 'completed' ? 'completed_at = NOW(),' : ''}
        notes = COALESCE(:notes, notes),
        processed_by = :processedBy
      WHERE id = :id
      RETURNING *
    `, {
      replacements: {
        id: parseInt(id),
        status,
        notes: notes || null,
        processedBy: req.user?.id
      }
    });

    if (result.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    res.json(result[0]);
  } catch (error) {
    console.error('[Compliance] Update request error:', error);
    res.status(500).json({ error: 'Failed to update request' });
  }
});

/**
 * @route GET /api/compliance/violations
 * @desc Get compliance violations
 * @access Admin
 */
router.get('/violations', verifyAdmin, async (req, res) => {
  try {
    const { severity, status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const whereParts = [];
    if (severity) whereParts.push(`severity = '${severity}'`);
    if (status) whereParts.push(`remediation_status = '${status}'`);
    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

    const [violations] = await sequelize.query(`
      SELECT *
      FROM compliance_violations
      ${whereClause}
      ORDER BY 
        CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
        created_at DESC
      LIMIT :limit OFFSET :offset
    `, {
      replacements: { limit: parseInt(limit), offset }
    }).catch(() => [[]]);

    const [summary] = await sequelize.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE severity = 'critical') as critical,
        COUNT(*) FILTER (WHERE severity = 'high') as high,
        COUNT(*) FILTER (WHERE severity = 'medium') as medium,
        COUNT(*) FILTER (WHERE severity = 'low') as low,
        COUNT(*) FILTER (WHERE remediation_status = 'open') as open_count,
        COUNT(*) FILTER (WHERE remediation_status = 'resolved') as resolved_count
      FROM compliance_violations
    `).catch(() => [[{}]]);

    res.json({
      violations,
      summary: summary[0] || {}
    });
  } catch (error) {
    console.error('[Compliance] Violations error:', error);
    res.status(500).json({ error: 'Failed to fetch violations' });
  }
});

/**
 * @route POST /api/compliance/violations
 * @desc Report a compliance violation
 * @access Admin
 */
router.post('/violations', verifyAdmin, async (req, res) => {
  try {
    const {
      violationType,
      severity,
      description,
      tenantId,
      userId,
      affectedRecords,
      recommendedAction
    } = req.body;

    if (!violationType || !severity || !description) {
      return res.status(400).json({ 
        error: 'violationType, severity, and description are required' 
      });
    }

    const [result] = await sequelize.query(`
      INSERT INTO compliance_violations (
        violation_type, severity, description,
        tenant_id, user_id, affected_records,
        recommended_action, remediation_status,
        reported_by, created_at
      ) VALUES (
        :violationType, :severity, :description,
        :tenantId, :userId, :affectedRecords,
        :recommendedAction, 'open',
        :reportedBy, NOW()
      )
      RETURNING *
    `, {
      replacements: {
        violationType,
        severity,
        description,
        tenantId: tenantId || null,
        userId: userId || null,
        affectedRecords: affectedRecords || 0,
        recommendedAction: recommendedAction || null,
        reportedBy: req.user?.id
      }
    });

    res.status(201).json(result[0]);
  } catch (error) {
    console.error('[Compliance] Report violation error:', error);
    res.status(500).json({ error: 'Failed to report violation' });
  }
});

/**
 * @route PATCH /api/compliance/violations/:id
 * @desc Update violation status/remediation
 * @access Admin
 */
router.patch('/violations/:id', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { remediationStatus, remediationNotes, resolvedBy } = req.body;

    const [result] = await sequelize.query(`
      UPDATE compliance_violations
      SET 
        remediation_status = COALESCE(:remediationStatus, remediation_status),
        remediation_notes = COALESCE(:remediationNotes, remediation_notes),
        resolved_by = COALESCE(:resolvedBy, resolved_by),
        resolved_at = CASE WHEN :remediationStatus = 'resolved' THEN NOW() ELSE resolved_at END,
        updated_at = NOW()
      WHERE id = :id
      RETURNING *
    `, {
      replacements: {
        id: parseInt(id),
        remediationStatus,
        remediationNotes,
        resolvedBy: resolvedBy || req.user?.id
      }
    });

    if (result.length === 0) {
      return res.status(404).json({ error: 'Violation not found' });
    }

    res.json(result[0]);
  } catch (error) {
    console.error('[Compliance] Update violation error:', error);
    res.status(500).json({ error: 'Failed to update violation' });
  }
});

/**
 * @route GET /api/compliance/report
 * @desc Generate compliance report
 * @access Admin
 */
router.get('/report', verifyAdmin, async (req, res) => {
  try {
    const report = await complianceDashboardService.generateComplianceReport();
    res.json(report);
  } catch (error) {
    console.error('[Compliance] Report generation error:', error);
    res.status(500).json({ error: 'Failed to generate compliance report' });
  }
});

/**
 * @route GET /api/compliance/security-posture
 * @desc Get security posture assessment
 * @access Admin
 */
router.get('/security-posture', verifyAdmin, async (req, res) => {
  try {
    const posture = await complianceDashboardService.getSecurityPosture();
    res.json(posture);
  } catch (error) {
    console.error('[Compliance] Security posture error:', error);
    res.status(500).json({ error: 'Failed to fetch security posture' });
  }
});

/**
 * @route GET /api/compliance/data-retention
 * @desc Get data retention status
 * @access Admin
 */
router.get('/data-retention', verifyAdmin, async (req, res) => {
  try {
    const status = await complianceDashboardService.getDataRetentionStatus();
    res.json(status);
  } catch (error) {
    console.error('[Compliance] Data retention error:', error);
    res.status(500).json({ error: 'Failed to fetch data retention status' });
  }
});

export default router;
