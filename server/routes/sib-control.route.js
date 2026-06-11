/**
 * SIB Control Layer Management API
 * 
 * Endpoints for:
 * - Monitoring SIB decisions
 * - Kill switch management
 * - Human approval workflow
 * - Audit log access
 * - System health metrics
 */

import express from 'express';
import sibControlLayer, { DECISION_TYPES, AI_DECISION_TYPES } from '../services/sib-control-layer.service.js';
import { authUser, requireRole } from '../middleware/auth.middleware.js';

const router = express.Router();

// Admin-only middleware for sensitive endpoints
const authAdmin = [authUser, requireRole('admin')];

/**
 * POST /api/sib/decide
 * Submit a decision for SIB to process (with safety checks)
 */
router.post('/decide', authUser, async (req, res) => {
  try {
    const { type, data, confidence, reasoning, context } = req.body;
    
    const decision = {
      type,
      data,
      confidence: confidence || 0.8,
      reasoning,
      context: context || { source: 'api', timestamp: new Date().toISOString() }
    };
    
    const result = await sibControlLayer.processDecision(decision);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/sib/health
 * Get SIB system health and status (PUBLIC - read-only metrics)
 */
router.get('/health', (req, res) => {
  const health = sibControlLayer.getHealthStatus();
  
  res.json({
    success: true,
    data: health
  });
});

/**
 * GET /api/sib/audit
 * Get decision audit log (with filters)
 */
router.get('/audit', authAdmin, (req, res) => {
  try {
    const { type, status, since } = req.query;
    
    const log = sibControlLayer.getAuditLog({
      type,
      status,
      since
    });
    
    res.json({
      success: true,
      data: {
        count: log.length,
        decisions: log
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/sib/kill-switch/activate
 * Activate emergency kill switch (admin only)
 */
router.post('/kill-switch/activate', authAdmin, (req, res) => {
  try {
    const { reason } = req.body;
    const activatedBy = req.user?.email || req.user?.id || 'admin';
    
    sibControlLayer.activateKillSwitch(reason, activatedBy);
    
    res.json({
      success: true,
      message: 'Kill switch activated - all AI decisions blocked'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/sib/kill-switch/deactivate
 * Deactivate kill switch (requires admin token)
 */
router.post('/kill-switch/deactivate', authAdmin, (req, res) => {
  try {
    const { authToken } = req.body;
    const authorizedBy = req.user?.email || req.user?.id || 'admin';
    
    sibControlLayer.deactivateKillSwitch(authorizedBy, authToken);
    
    res.json({
      success: true,
      message: 'Kill switch deactivated - AI decisions resumed'
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/sib/approvals/pending
 * Get pending human approval requests
 */
router.get('/approvals/pending', authAdmin, (req, res) => {
  try {
    const pending = Array.from(sibControlLayer.humanOverrides.entries())
      .filter(([, value]) => value.status === 'pending')
      .map(([id, value]) => ({
        approvalId: id,
        ...value
      }));
    
    res.json({
      success: true,
      data: {
        count: pending.length,
        approvals: pending
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/sib/approvals/:approvalId/approve
 * Approve a pending decision
 */
router.post('/approvals/:approvalId/approve', authAdmin, async (req, res) => {
  try {
    const { approvalId } = req.params;
    const { comments } = req.body;
    const approvedBy = req.user?.email || req.user?.id || 'admin';
    
    const result = await sibControlLayer.approveDecision(approvalId, approvedBy, comments);
    
    res.json({
      success: true,
      message: 'Decision approved and executed',
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/sib/approvals/:approvalId/reject
 * Reject a pending decision
 */
router.post('/approvals/:approvalId/reject', authAdmin, (req, res) => {
  try {
    const { approvalId } = req.params;
    const { reason } = req.body;
    const rejectedBy = req.user?.email || req.user?.id || 'admin';
    
    sibControlLayer.rejectDecision(approvalId, rejectedBy, reason);
    
    res.json({
      success: true,
      message: 'Decision rejected'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/sib/decision-types
 * Get available decision types and their policies
 */
router.get('/decision-types', (req, res) => {
  res.json({
    success: true,
    data: {
      types: DECISION_TYPES,
      policies: {
        rateLimits: sibControlLayer.rateLimitCounters,
        confidenceThresholds: Object.keys(DECISION_TYPES).reduce((acc, key) => {
          const type = DECISION_TYPES[key];
          acc[type] = {
            minConfidence: 0.7, // Default, can be customized per type
            requiresHumanApproval: false
          };
          return acc;
        }, {})
      }
    }
  });
});

/**
 * GET /api/sib/metrics
 * Get SIB performance metrics
 */
router.get('/metrics', authAdmin, (req, res) => {
  const log = sibControlLayer.decisionLog;
  
  // Calculate metrics
  const totalDecisions = log.length;
  const approved = log.filter(d => d.status === 'approved').length;
  const rejected = log.filter(d => d.status === 'rejected').length;
  const pending = log.filter(d => d.status === 'pending').length;
  
  // By type
  const byType = {};
  log.forEach(d => {
    if (!byType[d.type]) {
      byType[d.type] = { total: 0, approved: 0, rejected: 0 };
    }
    byType[d.type].total++;
    if (d.status === 'approved') byType[d.type].approved++;
    if (d.status === 'rejected') byType[d.type].rejected++;
  });
  
  // Average confidence
  const avgConfidence = log.length > 0
    ? log.reduce((sum, d) => sum + (d.confidence || 0), 0) / log.length
    : 0;
  
  res.json({
    success: true,
    data: {
      totalDecisions,
      approved,
      rejected,
      pending,
      approvalRate: totalDecisions > 0 ? (approved / totalDecisions) : 0,
      avgConfidence,
      byType,
      lastDecision: log[log.length - 1]
    }
  });
});

/**
 * GET /api/sib/ai-dashboard
 * AI operations dashboard — shows all AI activity across tenants
 */
router.get('/ai-dashboard', authAdmin, (req, res) => {
  try {
    const dashboard = sibControlLayer.getAIDashboard();
    res.json({
      success: true,
      data: {
        ...dashboard,
        decisionTypes: DECISION_TYPES,
        aiDecisionTypes: AI_DECISION_TYPES
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
