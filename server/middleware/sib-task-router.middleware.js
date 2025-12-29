/**
 * SIB Task Router Middleware
 * ==========================
 * 
 * Express middleware that ensures all medical/admin operations
 * route through SIB unified task router
 * 
 * Usage:
 * app.use('/api', sibTaskRouterMiddleware);
 */

const { getSIBTaskProxy } = require('./sib-task-proxy');
const logger = require('../utils/logger');

/**
 * Middleware to attach SIB task proxy to request object
 * 
 * Makes SIB available to all route handlers via req.sib
 * Includes automatic health checking
 */
function sibTaskRouterMiddleware(req, res, next) {
  try {
    req.sib = getSIBTaskProxy();
    
    // Attach user context helper
    req.executeTask = async (taskType, payload, options = {}) => {
      return req.sib.executeTask(
        taskType,
        payload,
        req.user?.id || options.userId,
        req.user?.patientId || options.patientId,
        options.context
      );
    };
    
    next();
  } catch (error) {
    logger.error('❌ SIB middleware initialization failed', { error: error.message });
    res.status(503).json({ error: 'SIB service unavailable' });
  }
}

/**
 * Simple route wrapper for SIB task execution
 * 
 * Usage:
 * router.post('/chat', sibTaskRoute(async (req) => ({
 *   taskType: 'chat',
 *   payload: { message: req.body.message }
 * })));
 */
function sibTaskRoute(handler) {
  return async (req, res) => {
    try {
      const config = await handler(req);
      
      const result = await req.sib.executeTask(
        config.taskType,
        config.payload,
        req.user?.id,
        req.user?.patientId,
        config.context || {}
      );
      
      res.json(result);
    } catch (error) {
      logger.error('SIB task route error', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message,
        status: 'failed'
      });
    }
  };
}

/**
 * SIB Health Check Middleware
 * 
 * Can be used to verify SIB is available before allowing requests
 */
async function sibHealthCheck(req, res, next) {
  try {
    const sib = getSIBTaskProxy();
    const health = await sib.healthCheck();
    
    if (health.status !== 'healthy') {
      logger.warn('⚠️ SIB health check failed', health);
      return res.status(503).json({
        error: 'SIB service unavailable',
        details: health
      });
    }
    
    res.sibHealth = health;
    next();
  } catch (error) {
    logger.error('SIB health check error', { error: error.message });
    res.status(503).json({
      error: 'SIB service unreachable',
      message: error.message
    });
  }
}

module.exports = {
  sibTaskRouterMiddleware,
  sibTaskRoute,
  sibHealthCheck
};
