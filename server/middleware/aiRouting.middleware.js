/**
 * AI Routing Middleware
 * Intercepts AI requests and routes them through Local AI Nodes when available
 */

import aiRoutingService from '../services/aiRouting.service.js';
import AiNodeApiKey from '../models/postgres/aiNodeApiKey.model.postgres.js';

/**
 * Middleware to authenticate requests from Local AI Nodes using API keys
 */
export const authenticateNode = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: 'API key required for node authentication'
      });
    }

    const keyRecord = await AiNodeApiKey.validateKey(apiKey);

    if (!keyRecord) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired API key'
      });
    }

    // Attach node info to request
    req.node = {
      nodeId: keyRecord.node_id,
      keyId: keyRecord.key_id,
      scopes: keyRecord.scopes
    };

    next();
  } catch (error) {
    console.error('Node authentication error:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication failed',
      error: error.message
    });
  }
};

/**
 * Middleware to check if node has required scope
 */
export const requireNodeScope = (scope) => {
  return (req, res, next) => {
    if (!req.node) {
      return res.status(401).json({
        success: false,
        message: 'Node authentication required'
      });
    }

    if (!req.node.scopes?.includes(scope) && !req.node.scopes?.includes('admin')) {
      return res.status(403).json({
        success: false,
        message: `API key does not have required scope: ${scope}`
      });
    }

    next();
  };
};

/**
 * Middleware to automatically route AI requests through local nodes
 * This can be applied to existing AI endpoints to add local node routing
 */
export const autoRouteAI = (requestType) => {
  return async (req, res, next) => {
    try {
      const hospitalId = req.user?.hospital_id;

      // If no hospital ID, skip routing (use default/cloud)
      if (!hospitalId) {
        return next();
      }

      // Check if local node is available
      const hasLocalNode = await aiRoutingService.hasLocalNode(hospitalId);

      if (!hasLocalNode) {
        // No local node, proceed with original handler
        return next();
      }

      // Route through local node
      const result = await aiRoutingService.routeRequest({
        hospitalId,
        requestType,
        priority: req.body.priority || 'NORMAL',
        payload: req.body,
        userId: req.user?.id,
        metadata: {
          originalPath: req.path,
          userRole: req.user?.role
        }
      });

      // Return result from local node
      return res.json({
        success: true,
        data: result.data,
        _routing: {
          processedBy: result.processedBy,
          responseTime: result.responseTime,
          routedTo: result.routedTo
        }
      });
    } catch (error) {
      // On routing error, fall back to original handler
      console.error('Auto-routing error, falling back:', error.message);
      return next();
    }
  };
};

/**
 * Middleware to add routing metadata to response
 */
export const addRoutingMetadata = (req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = (data) => {
    // Add routing metadata if available
    if (req.routingInfo) {
      data._routing = req.routingInfo;
    }
    return originalJson(data);
  };

  next();
};

/**
 * Rate limiting middleware for node API
 */
export const nodeRateLimit = async (req, res, next) => {
  try {
    if (!req.node) {
      return next();
    }

    const keyRecord = await AiNodeApiKey.findByPk(req.node.keyId);

    if (!keyRecord) {
      return next();
    }

    const withinLimit = await keyRecord.checkRateLimit();

    if (!withinLimit) {
      res.set('Retry-After', '60');
      return res.status(429).json({
        success: false,
        message: 'Rate limit exceeded',
        retryAfter: 60
      });
    }

    next();
  } catch (error) {
    console.error('Rate limit check error:', error);
    next(); // Don't block on rate limit errors
  }
};

/**
 * Logging middleware for AI requests
 */
export const logAIRequest = (req, res, next) => {
  const startTime = Date.now();

  // Override res.json to capture response
  const originalJson = res.json.bind(res);
  res.json = (data) => {
    const responseTime = Date.now() - startTime;
    
    console.log('AI Request Log:', {
      timestamp: new Date().toISOString(),
      path: req.path,
      method: req.method,
      hospitalId: req.user?.hospital_id,
      userId: req.user?.id,
      nodeId: req.node?.nodeId,
      responseTime,
      success: data?.success ?? (res.statusCode < 400)
    });

    return originalJson(data);
  };

  next();
};

export default {
  authenticateNode,
  requireNodeScope,
  autoRouteAI,
  addRoutingMetadata,
  nodeRateLimit,
  logAIRequest
};
