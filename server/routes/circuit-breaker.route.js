/**
 * Circuit Breaker Monitoring Routes
 * 
 * Provides endpoints to monitor circuit breaker health and status
 */

import express from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import {
  getAllCircuitBreakerStatus,
  resetAllCircuitBreakers
} from '../utils/circuitBreaker.js';

const router = express.Router();

/**
 * @swagger
 * /api/circuit-breakers/status:
 *   get:
 *     summary: Get all circuit breakers status
 *     description: Returns health status and metrics for all circuit breakers
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Circuit breakers status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   additionalProperties:
 *                     type: object
 *                     properties:
 *                       state:
 *                         type: string
 *                         enum: [open, half-open, closed]
 *                       stats:
 *                         type: object
 *                       enabled:
 *                         type: boolean
 */
router.get('/status', authUser, requireRole('admin'), (req, res) => {
  try {
    const status = getAllCircuitBreakerStatus();
    res.json({
      success: true,
      data: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching circuit breaker status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch circuit breaker status',
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/circuit-breakers/reset:
 *   post:
 *     summary: Reset all circuit breakers
 *     description: Closes all open circuit breakers (admin only, for testing)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Circuit breakers reset
 */
router.post('/reset', authUser, requireRole('admin'), (req, res) => {
  try {
    resetAllCircuitBreakers();
    res.json({
      success: true,
      message: 'All circuit breakers reset successfully'
    });
  } catch (error) {
    console.error('Error resetting circuit breakers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset circuit breakers',
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/circuit-breakers/health:
 *   get:
 *     summary: Health check for circuit breaker system
 *     description: Simple health check endpoint
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: System healthy
 */
router.get('/health', (req, res) => {
  const status = getAllCircuitBreakerStatus();
  const openCircuits = Object.entries(status).filter(([_, data]) => data.state === 'open');
  
  res.json({
    success: true,
    healthy: openCircuits.length === 0,
    openCircuits: openCircuits.map(([name]) => name),
    totalCircuits: Object.keys(status).length,
    timestamp: new Date().toISOString()
  });
});

export default router;
