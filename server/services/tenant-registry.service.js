/**
 * Tenant Registry Service
 * 
 * Central registry for all tenants with infrastructure configuration.
 * Manages tenant lifecycle: provision → active → suspend → decommission.
 */

import Tenant from '../models/postgres/tenant.model.postgres.js';
import { Op } from 'sequelize';

class TenantRegistry {
  constructor() {
    this.heartbeats = new Map(); // tenantId → last heartbeat
  }

  // ── CRUD ───────────────────────────────────────────────────
  async createTenant(data) {
    const tenant = await Tenant.create({
      ...data,
      status: data.status || 'provisioning',
      settings: {
        ...(data.settings || {}),
        isolation_level: data.isolation_level || 'shared_row',
        server_config: data.server_config || {},
        db_config: data.db_config || {},
        domain_config: data.domain_config || {},
        ai_config: data.ai_config || this.defaultAIConfig(),
        billing_config: data.billing_config || {},
        monthly_usage: { apiCalls: 0, aiCalls: 0, storageBytes: 0, activeUsers: 0 }
      }
    });
    return tenant;
  }

  async getTenant(id) {
    return Tenant.findByPk(id);
  }

  async getTenantBySlug(slug) {
    return Tenant.findOne({ where: { slug } });
  }

  async listTenants({ status, type, plan, page = 1, limit = 50 } = {}) {
    const where = {};
    if (status) where.status = status;
    if (type) where.type = type;
    if (plan) where.plan = plan;

    const { rows, count } = await Tenant.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit
    });
    return { tenants: rows, total: count, page, pages: Math.ceil(count / limit) };
  }

  async updateTenant(id, updates) {
    const tenant = await Tenant.findByPk(id);
    if (!tenant) throw new Error('Tenant not found');
    await tenant.update(updates);
    return tenant;
  }

  async updateTenantSettings(id, settingsUpdates) {
    const tenant = await Tenant.findByPk(id);
    if (!tenant) throw new Error('Tenant not found');
    const current = tenant.settings || {};
    await tenant.update({ settings: { ...current, ...settingsUpdates } });
    return tenant;
  }

  // ── Status Management ──────────────────────────────────────
  async suspendTenant(id, reason) {
    return this.updateTenant(id, {
      status: 'suspended',
      admin_metadata: { suspended_at: new Date(), suspend_reason: reason }
    });
  }

  async activateTenant(id) {
    return this.updateTenant(id, {
      status: 'active',
      admin_metadata: { activated_at: new Date() }
    });
  }

  async decommissionTenant(id) {
    return this.updateTenant(id, {
      status: 'archived',
      admin_metadata: { decommissioned_at: new Date() }
    });
  }

  // ── AI Config ──────────────────────────────────────────────
  async getAIConfig(id) {
    const tenant = await Tenant.findByPk(id);
    if (!tenant) throw new Error('Tenant not found');
    return tenant.settings?.ai_config || this.defaultAIConfig();
  }

  async updateAIConfig(id, aiConfig) {
    const tenant = await Tenant.findByPk(id);
    if (!tenant) throw new Error('Tenant not found');
    const settings = tenant.settings || {};
    settings.ai_config = { ...(settings.ai_config || {}), ...aiConfig };
    await tenant.update({ settings });
    return settings.ai_config;
  }

  defaultAIConfig() {
    return {
      llmCascade: { text: ['isha', 'groq'], vision: ['anthropic'], stt: ['groq'] },
      sibPolicy: {
        rateLimits: { AI_QUERY: 500, AI_PRESCRIPTION: 100, AI_DIAGNOSIS: 200, AI_EMERGENCY: 50 },
        confidenceThresholds: { AI_DIAGNOSIS: 0.85, AI_EMERGENCY: 0.95, AI_PRESCRIPTION: 0.80 },
        requireApproval: ['AI_PRESCRIPTION'],
        killSwitch: false
      },
      allowedModels: ['openai/gpt-oss-120b', 'bimedix2-8b'],
      maxAICallsPerMonth: 10000
    };
  }

  // ── Heartbeat ──────────────────────────────────────────────
  recordHeartbeat(tenantId, metrics) {
    this.heartbeats.set(tenantId, {
      timestamp: new Date(),
      ...metrics
    });
  }

  getHeartbeat(tenantId) {
    return this.heartbeats.get(tenantId) || null;
  }

  checkHealth(tenantId) {
    const hb = this.heartbeats.get(tenantId);
    if (!hb) return 'unknown';
    const ageMs = Date.now() - hb.timestamp.getTime();
    if (ageMs < 3 * 60 * 1000) return 'healthy';
    if (ageMs < 5 * 60 * 1000) return 'warning';
    return 'critical';
  }

  // ── Usage Tracking ─────────────────────────────────────────
  async incrementUsage(id, metric, amount = 1) {
    const tenant = await Tenant.findByPk(id);
    if (!tenant) return;
    const settings = tenant.settings || {};
    const usage = settings.monthly_usage || {};
    usage[metric] = (usage[metric] || 0) + amount;
    settings.monthly_usage = usage;
    await tenant.update({ settings });
  }

  async getUsage(id) {
    const tenant = await Tenant.findByPk(id);
    if (!tenant) throw new Error('Tenant not found');
    return tenant.settings?.monthly_usage || {};
  }

  // ── Dashboard ──────────────────────────────────────────────
  async getDashboard() {
    const total = await Tenant.count();
    const byStatus = await Tenant.findAll({
      attributes: ['status', [Tenant.sequelize.fn('COUNT', '*'), 'count']],
      group: ['status'],
      raw: true
    });
    const byPlan = await Tenant.findAll({
      attributes: ['plan', [Tenant.sequelize.fn('COUNT', '*'), 'count']],
      group: ['plan'],
      raw: true
    });
    const byType = await Tenant.findAll({
      attributes: ['type', [Tenant.sequelize.fn('COUNT', '*'), 'count']],
      group: ['type'],
      raw: true
    });

    // Check heartbeats
    const healthSummary = { healthy: 0, warning: 0, critical: 0, unknown: 0 };
    for (const [tid] of this.heartbeats) {
      healthSummary[this.checkHealth(tid)]++;
    }

    return {
      totalTenants: total,
      byStatus: byStatus.reduce((acc, r) => { acc[r.status || 'active'] = parseInt(r.count); return acc; }, {}),
      byPlan: byPlan.reduce((acc, r) => { acc[r.plan || 'free'] = parseInt(r.count); return acc; }, {}),
      byType: byType.reduce((acc, r) => { acc[r.type || 'hospital'] = parseInt(r.count); return acc; }, {}),
      healthSummary,
      lastUpdated: new Date().toISOString()
    };
  }
}

const tenantRegistry = new TenantRegistry();
export default tenantRegistry;
export { TenantRegistry };
