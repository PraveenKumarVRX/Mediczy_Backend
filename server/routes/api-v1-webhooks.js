/**
 * Webhooks Routes - Mediqzy API v1 (MVC Refactored)
 * Created: February 6, 2026
 * Updated: February 6, 2026 - Refactored to MVC pattern
 * 
 * Endpoints:
 * - POST /v1/{tenant-id}/webhooks - Register webhook
 * - GET /v1/{tenant-id}/webhooks - List webhooks
 * - GET /v1/{tenant-id}/webhooks/:webhookId - Webhook details
 * - PUT /v1/{tenant-id}/webhooks/:webhookId - Update webhook
 * - DELETE /v1/{tenant-id}/webhooks/:webhookId - Delete webhook
 * - POST /v1/{tenant-id}/webhooks/:webhookId/test - Test webhook
 * - GET /v1/{tenant-id}/webhooks/:webhookId/deliveries - Delivery history
 */

import express from 'express';
import { verifyToken, verifyTenant, requireScopes } from '../middleware/api-auth.js';
import { webhooksValidation, handleValidationErrors } from '../middleware/validation.js';
import * as webhooksController from '../controllers/api-v1/WebhooksController.js';

const router = express.Router({ mergeParams: true });

// Apply authentication and tenant verification to all routes
router.use(verifyToken, verifyTenant);

/**
 * POST /v1/{tenant-id}/webhooks
 * Create a new webhook
 */
router.post('/',
  requireScopes('webhooks.write'),
  webhooksValidation.createWebhook,
  handleValidationErrors,
  webhooksController.createWebhook
);

/**
 * GET /v1/{tenant-id}/webhooks
 * List webhooks
 */
router.get('/',
  requireScopes('webhooks.read'),
  webhooksController.listWebhooks
);

/**
 * GET /v1/{tenant-id}/webhooks/:webhookId
 * Get webhook details
 */
router.get('/:webhookId',
  requireScopes('webhooks.read'),
  webhooksController.getWebhook
);

/**
 * PUT /v1/{tenant-id}/webhooks/:webhookId
 * Update webhook
 */
router.put('/:webhookId',
  requireScopes('webhooks.write'),
  webhooksController.updateWebhook
);

/**
 * DELETE /v1/{tenant-id}/webhooks/:webhookId
 * Delete webhook
 */
router.delete('/:webhookId',
  requireScopes('webhooks.write'),
  webhooksController.deleteWebhook
);

/**
 * POST /v1/{tenant-id}/webhooks/:webhookId/test
 * Test webhook (trigger manually)
 */
router.post('/:webhookId/test',
  requireScopes('webhooks.write'),
  webhooksValidation.testWebhook,
  handleValidationErrors,
  webhooksController.testWebhook
);

/**
 * GET /v1/{tenant-id}/webhooks/:webhookId/deliveries
 * List webhook delivery history
 */
router.get('/:webhookId/deliveries',
  requireScopes('webhooks.read'),
  webhooksController.getDeliveries
);

export default router;
