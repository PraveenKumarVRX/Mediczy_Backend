/**
 * Tenant Billing Service
 * 
 * Aggregates usage metrics and generates billing data per tenant.
 * Supports tiered billing: Free (100 AI calls) → Pro (5000) → Enterprise (unlimited)
 */

import { connectPostgres } from '../db/postgres.js';
import tenantRegistry from './tenant-registry.service.js';
import cron from 'node-cron';

const BILLING_TIERS = {
  free: { name: 'Free', pricePerSeat: 0, aiCallsIncluded: 100, storageGB: 1 },
  basic: { name: 'Basic', pricePerSeat: 499, aiCallsIncluded: 1000, storageGB: 5 },
  professional: { name: 'Professional', pricePerSeat: 1499, aiCallsIncluded: 5000, storageGB: 25 },
  enterprise: { name: 'Enterprise', pricePerSeat: 4999, aiCallsIncluded: -1, storageGB: 100 }, // -1 = unlimited
  custom: { name: 'Custom', pricePerSeat: 0, aiCallsIncluded: -1, storageGB: -1 }
};

class TenantBillingService {
  constructor() {
    this.initialized = false;
  }

  async ensureTables() {
    if (this.initialized) return;
    const pool = await connectPostgres();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tenant_usage (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL,
        period VARCHAR(7) NOT NULL,
        api_calls INTEGER DEFAULT 0,
        ai_calls INTEGER DEFAULT 0,
        storage_bytes BIGINT DEFAULT 0,
        active_users INTEGER DEFAULT 0,
        seats_used INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(tenant_id, period)
      );
      CREATE INDEX IF NOT EXISTS idx_tenant_usage_period ON tenant_usage(tenant_id, period);

      CREATE TABLE IF NOT EXISTS tenant_invoices (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL,
        period VARCHAR(7) NOT NULL,
        plan VARCHAR(32) DEFAULT 'free',
        base_amount DECIMAL(10,2) DEFAULT 0,
        overage_amount DECIMAL(10,2) DEFAULT 0,
        total_amount DECIMAL(10,2) DEFAULT 0,
        currency VARCHAR(3) DEFAULT 'INR',
        status VARCHAR(20) DEFAULT 'pending',
        line_items JSONB DEFAULT '[]',
        generated_at TIMESTAMP DEFAULT NOW(),
        paid_at TIMESTAMP,
        UNIQUE(tenant_id, period)
      );
    `);
    this.initialized = true;
  }

  /**
   * Record usage for current period
   */
  async recordUsage(tenantId, metrics) {
    await this.ensureTables();
    const pool = await connectPostgres();
    const period = new Date().toISOString().slice(0, 7); // YYYY-MM

    await pool.query(`
      INSERT INTO tenant_usage (tenant_id, period, api_calls, ai_calls, storage_bytes, active_users, seats_used)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (tenant_id, period) DO UPDATE SET
        api_calls = tenant_usage.api_calls + EXCLUDED.api_calls,
        ai_calls = tenant_usage.ai_calls + EXCLUDED.ai_calls,
        storage_bytes = GREATEST(tenant_usage.storage_bytes, EXCLUDED.storage_bytes),
        active_users = GREATEST(tenant_usage.active_users, EXCLUDED.active_users),
        seats_used = GREATEST(tenant_usage.seats_used, EXCLUDED.seats_used),
        updated_at = NOW()
    `, [tenantId, period, metrics.apiCalls || 0, metrics.aiCalls || 0, metrics.storageBytes || 0, metrics.activeUsers || 0, metrics.seatsUsed || 0]);
  }

  /**
   * Get usage for a tenant and period
   */
  async getUsage(tenantId, period) {
    await this.ensureTables();
    const pool = await connectPostgres();
    period = period || new Date().toISOString().slice(0, 7);
    const result = await pool.query(
      `SELECT * FROM tenant_usage WHERE tenant_id = $1 AND period = $2`,
      [tenantId, period]
    );
    return result.rows[0] || { api_calls: 0, ai_calls: 0, storage_bytes: 0, active_users: 0, seats_used: 0 };
  }

  /**
   * Generate invoice for a tenant
   */
  async generateInvoice(tenantId, period) {
    await this.ensureTables();
    period = period || new Date().toISOString().slice(0, 7);

    const tenant = await tenantRegistry.getTenant(tenantId);
    if (!tenant) throw new Error('Tenant not found');

    const usage = await this.getUsage(tenantId, period);
    const plan = tenant.plan || 'free';
    const tier = BILLING_TIERS[plan] || BILLING_TIERS.free;

    const lineItems = [];
    let baseAmount = tier.pricePerSeat * (usage.seats_used || 1);
    lineItems.push({ description: `${tier.name} Plan (${usage.seats_used || 1} seats)`, amount: baseAmount });

    // AI call overage
    let overageAmount = 0;
    if (tier.aiCallsIncluded >= 0 && usage.ai_calls > tier.aiCallsIncluded) {
      const overageCalls = usage.ai_calls - tier.aiCallsIncluded;
      const overageCost = overageCalls * 0.5; // ₹0.50 per extra AI call
      overageAmount += overageCost;
      lineItems.push({ description: `AI call overage (${overageCalls} calls × ₹0.50)`, amount: overageCost });
    }

    // Storage overage
    const storageGB = usage.storage_bytes / (1024 * 1024 * 1024);
    if (tier.storageGB >= 0 && storageGB > tier.storageGB) {
      const extraGB = storageGB - tier.storageGB;
      const storageCost = Math.ceil(extraGB) * 50; // ₹50 per extra GB
      overageAmount += storageCost;
      lineItems.push({ description: `Storage overage (${Math.ceil(extraGB)} GB × ₹50)`, amount: storageCost });
    }

    const totalAmount = baseAmount + overageAmount;

    const pool = await connectPostgres();
    await pool.query(`
      INSERT INTO tenant_invoices (tenant_id, period, plan, base_amount, overage_amount, total_amount, line_items)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (tenant_id, period) DO UPDATE SET
        plan = EXCLUDED.plan, base_amount = EXCLUDED.base_amount,
        overage_amount = EXCLUDED.overage_amount, total_amount = EXCLUDED.total_amount,
        line_items = EXCLUDED.line_items, generated_at = NOW()
    `, [tenantId, period, plan, baseAmount, overageAmount, totalAmount, JSON.stringify(lineItems)]);

    return { tenantId, period, plan, baseAmount, overageAmount, totalAmount, lineItems, currency: 'INR' };
  }

  /**
   * Get billing overview across all tenants
   */
  async getBillingOverview(period) {
    await this.ensureTables();
    const pool = await connectPostgres();
    period = period || new Date().toISOString().slice(0, 7);

    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_invoices,
        SUM(total_amount) as total_revenue,
        SUM(overage_amount) as total_overage,
        AVG(total_amount) as avg_invoice,
        COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_count,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count
      FROM tenant_invoices WHERE period = $1
    `, [period]);

    return {
      period,
      ...result.rows[0],
      tiers: BILLING_TIERS
    };
  }

  /**
   * Get invoices for a tenant
   */
  async getTenantInvoices(tenantId, limit = 12) {
    await this.ensureTables();
    const pool = await connectPostgres();
    const result = await pool.query(
      `SELECT * FROM tenant_invoices WHERE tenant_id = $1 ORDER BY period DESC LIMIT $2`,
      [tenantId, limit]
    );
    return result.rows;
  }

  /**
   * Start monthly invoice generation cron
   */
  startCron() {
    // Run on 1st of every month at midnight
    cron.schedule('0 0 1 * *', () => this.generateAllInvoices());
    console.log('💰 Billing cron started (monthly invoice generation)');
  }

  async generateAllInvoices() {
    const { tenants } = await tenantRegistry.listTenants({ status: 'active' });
    const period = new Date().toISOString().slice(0, 7);
    let generated = 0;
    for (const tenant of tenants) {
      try {
        await this.generateInvoice(tenant.id, period);
        generated++;
      } catch (e) {
        console.error(`Invoice generation failed for tenant ${tenant.id}:`, e.message);
      }
    }
    console.log(`💰 Generated ${generated} invoices for ${period}`);
  }
}

const tenantBillingService = new TenantBillingService();
export default tenantBillingService;
export { TenantBillingService, BILLING_TIERS };
