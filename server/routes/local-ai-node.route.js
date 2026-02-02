/**
 * Local AI Node Routes
 * API endpoints for Cloud Mother to manage Local AI Nodes
 */

import express from 'express';
import aiNodeManagerService from '../services/aiNodeManager.service.js';
import aiRoutingService from '../services/aiRouting.service.js';
import AiNodeApiKey from '../models/postgres/aiNodeApiKey.model.postgres.js';
import { authUser, requireRole } from '../middleware/auth.middleware.js';

const router = express.Router();

// Helper to authorize roles (middleware wrapper)
const authorizeRoles = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.userRole) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    
    if (!allowedRoles.includes(req.userRole)) {
      return res.status(403).json({ 
        success: false, 
        message: `Access denied. Required roles: ${allowedRoles.join(', ')}` 
      });
    }
    
    next();
  };
};

// Use authUser as authenticateToken
const authenticateToken = authUser;

// ============================================
// Node Management (Admin/Hospital Admin)
// ============================================

/**
 * Register a new Local AI Node
 * POST /api/ai-nodes/register
 */
router.post('/register', authenticateToken, authorizeRoles(['admin', 'hospital_admin']), async (req, res) => {
  try {
    const {
      hospitalId,
      hospitalName,
      nodeType,
      endpoint,
      capabilities,
      models,
      config,
      metadata
    } = req.body;

    // Validate required fields
    if (!hospitalId || !hospitalName || !endpoint) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: hospitalId, hospitalName, endpoint'
      });
    }

    const result = await aiNodeManagerService.registerNode({
      hospitalId,
      hospitalName,
      nodeType,
      endpoint,
      capabilities,
      models,
      config,
      metadata,
      registeredBy: req.user.id
    });

    res.status(201).json({
      success: true,
      message: 'Node registered successfully',
      data: {
        node: {
          nodeId: result.node.node_id,
          nodeCode: result.node.node_code,
          status: result.node.status
        },
        apiKey: result.apiKey, // IMPORTANT: Show only once!
        setupInstructions: result.setupInstructions
      }
    });
  } catch (error) {
    console.error('Node registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register node',
      error: error.message
    });
  }
});

/**
 * Get all nodes for current user's hospital
 * GET /api/ai-nodes
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const hospitalId = req.user.hospital_id || req.query.hospitalId;

    if (!hospitalId && req.user.role !== 'admin') {
      return res.status(400).json({
        success: false,
        message: 'Hospital ID required'
      });
    }

    let nodes;
    if (req.user.role === 'admin' && !hospitalId) {
      // Admin can see all nodes
      nodes = await aiNodeManagerService.getAllNodes(req.query);
    } else {
      nodes = await aiNodeManagerService.getNodesForTenant(hospitalId);
    }

    res.json({
      success: true,
      data: {
        nodes,
        count: nodes.length
      }
    });
  } catch (error) {
    console.error('Get nodes error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get nodes',
      error: error.message
    });
  }
});

/**
 * Get node health details
 * GET /api/ai-nodes/:nodeId/health
 */
router.get('/:nodeId/health', authenticateToken, async (req, res) => {
  try {
    const { nodeId } = req.params;
    const health = await aiNodeManagerService.getNodeHealth(nodeId);

    res.json({
      success: true,
      data: health
    });
  } catch (error) {
    console.error('Get node health error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get node health',
      error: error.message
    });
  }
});

/**
 * Update node configuration
 * PATCH /api/ai-nodes/:nodeId/config
 */
router.patch('/:nodeId/config', authenticateToken, authorizeRoles(['admin', 'hospital_admin']), async (req, res) => {
  try {
    const { nodeId } = req.params;
    const configUpdates = req.body;

    const node = await aiNodeManagerService.updateNodeConfig(nodeId, configUpdates, req.user.id);

    res.json({
      success: true,
      message: 'Node configuration updated',
      data: {
        nodeId: node.node_id,
        config: node.config
      }
    });
  } catch (error) {
    console.error('Update node config error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update node configuration',
      error: error.message
    });
  }
});

/**
 * Deactivate a node
 * POST /api/ai-nodes/:nodeId/deactivate
 */
router.post('/:nodeId/deactivate', authenticateToken, authorizeRoles(['admin', 'hospital_admin']), async (req, res) => {
  try {
    const { nodeId } = req.params;
    const { reason } = req.body;

    const node = await aiNodeManagerService.deactivateNode(nodeId, reason, req.user.id);

    res.json({
      success: true,
      message: 'Node deactivated',
      data: {
        nodeId: node.node_id,
        status: node.status
      }
    });
  } catch (error) {
    console.error('Deactivate node error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to deactivate node',
      error: error.message
    });
  }
});

/**
 * Reactivate a node
 * POST /api/ai-nodes/:nodeId/reactivate
 */
router.post('/:nodeId/reactivate', authenticateToken, authorizeRoles(['admin', 'hospital_admin']), async (req, res) => {
  try {
    const { nodeId } = req.params;

    const result = await aiNodeManagerService.reactivateNode(nodeId, req.user.id);

    res.json({
      success: true,
      message: 'Node reactivated',
      data: {
        nodeId: result.node.node_id,
        status: result.node.status,
        newApiKey: result.newApiKey // Show only once!
      }
    });
  } catch (error) {
    console.error('Reactivate node error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reactivate node',
      error: error.message
    });
  }
});

/**
 * Generate new API key for a node
 * POST /api/ai-nodes/:nodeId/api-keys
 */
router.post('/:nodeId/api-keys', authenticateToken, authorizeRoles(['admin', 'hospital_admin']), async (req, res) => {
  try {
    const { nodeId } = req.params;
    const { name, scopes, expiresInDays } = req.body;

    const result = await aiNodeManagerService.generateApiKey(nodeId, {
      name,
      scopes,
      expiresInDays
    });

    res.status(201).json({
      success: true,
      message: 'API key generated',
      data: {
        keyId: result.apiKey.key_id,
        apiKey: result.rawKey, // Show only once!
        expiresAt: result.expiresAt
      }
    });
  } catch (error) {
    console.error('Generate API key error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate API key',
      error: error.message
    });
  }
});

/**
 * Get routing statistics
 * GET /api/ai-nodes/stats/routing
 */
router.get('/stats/routing', authenticateToken, async (req, res) => {
  try {
    const hospitalId = req.user.hospital_id || req.query.hospitalId;
    const days = parseInt(req.query.days) || 7;

    const stats = await aiRoutingService.getRoutingStats(hospitalId, days);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Get routing stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get routing statistics',
      error: error.message
    });
  }
});

// ============================================
// Node Heartbeat (Called by Local Nodes)
// ============================================

/**
 * Node heartbeat endpoint
 * POST /api/ai-nodes/heartbeat
 * Authentication: API Key
 */
router.post('/heartbeat', async (req, res) => {
  try {
    // Extract API key from header
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: 'API key required'
      });
    }

    // Validate API key
    const keyRecord = await AiNodeApiKey.validateKey(apiKey);
    
    if (!keyRecord) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired API key'
      });
    }

    // Check scope
    if (!keyRecord.hasScope('heartbeat')) {
      return res.status(403).json({
        success: false,
        message: 'API key does not have heartbeat scope'
      });
    }

    // Process heartbeat
    const result = await aiNodeManagerService.processHeartbeat(keyRecord.node_id, req.body);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Heartbeat error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process heartbeat',
      error: error.message
    });
  }
});

// ============================================
// AI Request Routing
// ============================================

/**
 * Route an AI request through the best available node
 * POST /api/ai-nodes/route
 */
router.post('/route', authenticateToken, async (req, res) => {
  try {
    const {
      requestType,
      priority,
      payload
    } = req.body;

    const hospitalId = req.user.hospital_id;

    if (!requestType || !payload) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: requestType, payload'
      });
    }

    const result = await aiRoutingService.routeRequest({
      hospitalId,
      requestType,
      priority,
      payload,
      userId: req.user.id,
      metadata: {
        userRole: req.user.role,
        requestedAt: new Date().toISOString()
      }
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Route request error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to route AI request',
      error: error.message
    });
  }
});

/**
 * Check local node availability
 * GET /api/ai-nodes/check-availability
 */
router.get('/check-availability', authenticateToken, async (req, res) => {
  try {
    const hospitalId = req.user.hospital_id || req.query.hospitalId;
    const capability = req.query.capability;

    const hasNode = await aiRoutingService.hasLocalNode(hospitalId, capability);

    res.json({
      success: true,
      data: {
        hasLocalNode: hasNode,
        capability
      }
    });
  } catch (error) {
    console.error('Check availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check node availability',
      error: error.message
    });
  }
});

// ============================================
// Admin Maintenance
// ============================================

/**
 * Run maintenance tasks
 * POST /api/ai-nodes/maintenance
 */
router.post('/maintenance', authenticateToken, authorizeRoles(['admin']), async (req, res) => {
  try {
    const results = await aiNodeManagerService.runMaintenance();

    res.json({
      success: true,
      message: 'Maintenance completed',
      data: results
    });
  } catch (error) {
    console.error('Maintenance error:', error);
    res.status(500).json({
      success: false,
      message: 'Maintenance failed',
      error: error.message
    });
  }
});

export default router;
