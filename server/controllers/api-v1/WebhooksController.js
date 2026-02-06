import WebhooksService from '../../services/api-v1/WebhooksService.js';
import { asyncHandler } from '../../middleware/errorHandler.js';

const webhooksService = new WebhooksService();

/**
 * Create a new webhook
 */
export const createWebhook = asyncHandler(async (req, res) => {
  const webhook = await webhooksService.createWebhook(req.tenantId, req.body);
  res.status(201).json(webhook);
});

/**
 * Get a specific webhook
 */
export const getWebhook = asyncHandler(async (req, res) => {
  const webhook = await webhooksService.getWebhook(req.tenantId, req.params.webhookId);
  res.json(webhook);
});

/**
 * List all webhooks
 */
export const listWebhooks = asyncHandler(async (req, res) => {
  const options = {
    page: parseInt(req.query.page) || 1,
    limit: parseInt(req.query.limit) || 20,
    sortBy: req.query.sortBy || 'created_at',
    sortOrder: req.query.sortOrder || 'DESC'
  };
  
  const result = await webhooksService.listWebhooks(req.tenantId, options);
  res.json(result);
});

/**
 * Update a webhook
 */
export const updateWebhook = asyncHandler(async (req, res) => {
  const { webhookId } = req.params;
  const webhook = await webhooksService.updateWebhook(req.tenantId, webhookId, req.body);
  res.json(webhook);
});

/**
 * Delete a webhook
 */
export const deleteWebhook = asyncHandler(async (req, res) => {
  const { webhookId } = req.params;
  await webhooksService.deleteWebhook(req.tenantId, webhookId);
  res.status(204).send();
});

/**
 * Test a webhook (trigger it manually)
 */
export const testWebhook = asyncHandler(async (req, res) => {
  const { webhookId } = req.params;
  const { eventType, eventData } = req.body;
  
  const result = await webhooksService.triggerWebhook(req.tenantId, webhookId, eventType, eventData);
  res.json(result);
});

/**
 * Get webhook delivery history
 */
export const getDeliveries = asyncHandler(async (req, res) => {
  const { webhookId } = req.params;
  const options = {
    status: req.query.status,
    page: parseInt(req.query.page) || 1,
    limit: parseInt(req.query.limit) || 20
  };
  
  const result = await webhooksService.getDeliveries(req.tenantId, webhookId, options);
  res.json(result);
});
