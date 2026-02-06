/**
 * Webhooks Service - Mediqzy API v1
 */

import BaseService from '../BaseService.js';
import crypto from 'crypto';

class WebhooksService extends BaseService {
  constructor() {
    super('api_webhooks');
  }

  async createWebhook(tenantId, data) {
    const webhookId = this.generateId('hook');
    
    const result = await this.query(
      `INSERT INTO api_webhooks 
       (webhook_id, tenant_id, name, url, secret, events, enabled, retry_enabled,
        max_retries, timeout_seconds, headers, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active')
       RETURNING *`,
      [webhookId, tenantId, data.name, data.url, data.secret, data.events,
       data.enabled !== false, data.retry_enabled !== false, data.max_retries || 3,
       data.timeout_seconds || 30, JSON.stringify(data.headers || {})]
    );

    return result.rows[0];
  }

  async getWebhook(tenantId, webhookId) {
    return await this.findById(webhookId, tenantId, 'webhook_id');
  }

  async listWebhooks(tenantId, options = {}) {
    return await this.findAll(tenantId, options);
  }

  async updateWebhook(tenantId, webhookId, updates) {
    return await this.update(webhookId, updates, tenantId, 'webhook_id');
  }

  async deleteWebhook(tenantId, webhookId) {
    return await this.delete(webhookId, tenantId, 'webhook_id');
  }

  async triggerWebhook(tenantId, webhookId, eventType, eventData) {
    const webhook = await this.getWebhook(tenantId, webhookId);
    
    if (!webhook.enabled) {
      throw new Error('Webhook is disabled');
    }

    if (!webhook.events.includes(eventType)) {
      throw new Error(`Webhook not configured for event: ${eventType}`);
    }

    const deliveryId = this.generateId('delivery');
    const signature = this.generateSignature(eventData, webhook.secret);

    // Create delivery record
    await this.query(
      `INSERT INTO api_webhook_deliveries
       (delivery_id, webhook_id, event_type, event_data, status, request_url,
        request_headers, request_body)
       VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7)`,
      [deliveryId, webhookId, eventType, JSON.stringify(eventData), webhook.url,
       JSON.stringify({ ...webhook.headers, 'X-Mediqzy-Signature': signature }),
       JSON.stringify(eventData)]
    );

    // Send webhook (in real implementation, this would be async/queued)
    try {
      const response = await this.sendWebhook(webhook, eventType, eventData, signature);
      
      await this.query(
        `UPDATE api_webhook_deliveries
         SET status = 'success', delivered_at = CURRENT_TIMESTAMP,
             response_status = $1, response_body = $2, response_time_ms = $3
         WHERE delivery_id = $4`,
        [response.status, response.body, response.time, deliveryId]
      );

      // Update webhook stats
      await this.query(
        `UPDATE api_webhooks
         SET last_triggered_at = CURRENT_TIMESTAMP, failure_count = 0
         WHERE webhook_id = $1`,
        [webhookId]
      );

      return { deliveryId, status: 'success' };
    } catch (error) {
      await this.query(
        `UPDATE api_webhook_deliveries
         SET status = 'failed', failed_at = CURRENT_TIMESTAMP, error_message = $1
         WHERE delivery_id = $2`,
        [error.message, deliveryId]
      );

      // Increment failure count
      await this.query(
        `UPDATE api_webhooks
         SET failure_count = failure_count + 1
         WHERE webhook_id = $1`,
        [webhookId]
      );

      throw error;
    }
  }

  generateSignature(payload, secret) {
    return crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');
  }

  async sendWebhook(webhook, eventType, eventData, signature) {
    const startTime = Date.now();
    
    // In real implementation, use fetch or axios
    // This is a placeholder
    return {
      status: 200,
      body: 'OK',
      time: Date.now() - startTime
    };
  }

  async getDeliveries(tenantId, webhookId, options = {}) {
    const { page = 1, limit = 50, status } = options;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE w.webhook_id = $1 AND w.tenant_id = $2';
    let params = [webhookId, tenantId];
    let paramIndex = 3;

    if (status) {
      whereClause += ` AND d.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    const result = await this.query(
      `SELECT d.*
       FROM api_webhook_deliveries d
       JOIN api_webhooks w ON d.webhook_id = w.webhook_id
       ${whereClause}
       ORDER BY d.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    return result.rows;
  }
}

export default new WebhooksService();
