/**
 * Idempotent Webhook Routes — Eve-Healthcare pattern ported to Mediqzy
 *
 * Admin endpoints for managing the idempotent webhook event log:
 *   GET    /api/admin/webhooks/events           — list webhook events
 *   GET    /api/admin/webhooks/events/:eventId  — get a single event
 *   POST   /api/admin/webhooks/events/:eventId/retry — manual retry of failed event
 *   GET    /api/admin/webhooks/stats            — summary stats
 *
 * Mounted in server/app.js alongside the other admin routes.
 */
import express from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import {
  listWebhookEvents,
  getWebhookEvent,
  retryWebhookEvent,
  webhookEventStats
} from '../controllers/idempotentWebhookController.js';

const router = express.Router();

/**
 * Admin-only routes for webhook event management
 * Roles: admin, platform_admin, finance, tpa (read-only for their org)
 */
router.get(
  '/events',
  authUser,
  requireRole(['admin', 'platform_admin', 'finance', 'tpa']),
  listWebhookEvents
);

router.get(
  '/events/:eventId',
  authUser,
  requireRole(['admin', 'platform_admin', 'finance', 'tpa']),
  getWebhookEvent
);

router.post(
  '/events/:eventId/retry',
  authUser,
  requireRole(['admin', 'platform_admin', 'finance']),
  retryWebhookEvent
);

router.get(
  '/stats',
  authUser,
  requireRole(['admin', 'platform_admin', 'finance']),
  webhookEventStats
);

export default router;