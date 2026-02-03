/**
 * SaaS Billing Service for HIS Platform
 * 
 * Handles subscription billing for multi-tenant hospitals:
 * - Overage calculation and charges
 * - Monthly invoice generation
 * - Subscription renewals
 * - Grace period enforcement
 * - Auto-suspension for non-payment
 * 
 * @module services/saas-billing.service
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import Tenant from '../models/postgres/tenant.model.postgres.js';
import usageMeteringService, { OVERAGE_RATES } from './usage-metering.service.js';
import { EventEmitter } from 'events';

// Billing events
export const billingEvents = new EventEmitter();

// Billing configuration
const BILLING_CONFIG = {
  gracePeriodDays: 15,
  suspensionAfterDays: 30,
  latePaymentPenaltyPercent: 2, // 2% per month
  currency: 'INR',
  taxRate: 18, // GST 18%
  
  // Plan pricing (annual)
  planPricing: {
    free: {
      basePrice: 0,
      perUserPrice: 0,
      features: ['appointments', 'prescriptions']
    },
    basic: {
      basePrice: 60000, // ₹60,000/year
      perUserPrice: 3000, // ₹3,000 per additional user
      features: ['appointments', 'prescriptions', 'lab_tests', 'analytics']
    },
    professional: {
      basePrice: 180000, // ₹1,80,000/year
      perUserPrice: 5000,
      features: ['appointments', 'prescriptions', 'lab_tests', 'pharmacy', 'telemedicine', 'analytics', 'insurance']
    },
    enterprise: {
      basePrice: 500000, // ₹5,00,000/year (custom negotiated)
      perUserPrice: 8000,
      features: ['all']
    }
  },
  
  // Voice Scriber pricing
  voiceScriber: {
    perDeviceAnnual: 62000, // ₹62,000 per device/year
    perMinuteOverage: 0.5
  }
};

/**
 * SaaS Billing Service class
 */
class SaaSBillingService {
  constructor() {
    this.invoiceCounter = 0;
  }

  /**
   * Calculate overages for a tenant's billing period
   * @param {number} tenantId - Tenant ID
   * @param {Date} periodStart - Billing period start
   * @param {Date} periodEnd - Billing period end
   * @returns {Promise<object>} - Detailed overage calculation
   */
  async calculateOverages(tenantId, periodStart = null, periodEnd = null) {
    const tenant = await Tenant.findByPk(tenantId);
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    const usage = tenant.usage || {};
    const limits = tenant.limits || {};
    const overages = {};
    let totalOverageCharge = 0;

    // OPD Overage
    const opdUsage = usage.opd_patients_ytd || 0;
    const opdLimit = limits.opd_patients_per_year || Infinity;
    if (opdUsage > opdLimit) {
      const overage = opdUsage - opdLimit;
      const charge = overage * OVERAGE_RATES.opd_patients;
      overages.opd_patients = {
        usage: opdUsage,
        limit: opdLimit,
        overage,
        rate: OVERAGE_RATES.opd_patients,
        charge,
        description: `${overage} OPD patients over limit @ ₹${OVERAGE_RATES.opd_patients}/patient`
      };
      totalOverageCharge += charge;
    }

    // IPD Overage
    const ipdUsage = usage.ipd_admissions_ytd || 0;
    const ipdLimit = limits.ipd_admissions_per_year || Infinity;
    if (ipdUsage > ipdLimit) {
      const overage = ipdUsage - ipdLimit;
      const charge = overage * OVERAGE_RATES.ipd_admissions;
      overages.ipd_admissions = {
        usage: ipdUsage,
        limit: ipdLimit,
        overage,
        rate: OVERAGE_RATES.ipd_admissions,
        charge,
        description: `${overage} IPD admissions over limit @ ₹${OVERAGE_RATES.ipd_admissions}/admission`
      };
      totalOverageCharge += charge;
    }

    // Storage Overage
    const storageUsage = usage.storage_gb || 0;
    const storageLimit = limits.storage_gb || Infinity;
    if (storageUsage > storageLimit) {
      const overage = Math.ceil(storageUsage - storageLimit);
      const charge = overage * OVERAGE_RATES.storage_gb;
      overages.storage_gb = {
        usage: storageUsage,
        limit: storageLimit,
        overage,
        rate: OVERAGE_RATES.storage_gb,
        charge,
        description: `${overage} GB storage over limit @ ₹${OVERAGE_RATES.storage_gb}/GB`
      };
      totalOverageCharge += charge;
    }

    // Voice Minutes Overage
    const voiceUsage = usage.voice_minutes_mtd || 0;
    const voiceLimit = limits.voice_minutes_per_month || Infinity;
    if (voiceUsage > voiceLimit) {
      const overage = Math.ceil(voiceUsage - voiceLimit);
      const charge = overage * OVERAGE_RATES.voice_minutes;
      overages.voice_minutes = {
        usage: voiceUsage,
        limit: voiceLimit,
        overage,
        rate: OVERAGE_RATES.voice_minutes,
        charge,
        description: `${overage} voice minutes over limit @ ₹${OVERAGE_RATES.voice_minutes}/minute`
      };
      totalOverageCharge += charge;
    }

    return {
      tenantId,
      tenantName: tenant.name,
      plan: tenant.plan,
      periodStart: periodStart || tenant.plan_start_date,
      periodEnd: periodEnd || new Date(),
      overages,
      totalOverageCharge: Math.round(totalOverageCharge * 100) / 100,
      hasOverages: totalOverageCharge > 0,
      currency: BILLING_CONFIG.currency
    };
  }

  /**
   * Generate monthly invoice for a tenant
   * @param {number} tenantId - Tenant ID
   * @param {Date} billingDate - Date of invoice generation
   * @returns {Promise<object>} - Generated invoice
   */
  async generateMonthlyInvoice(tenantId, billingDate = new Date()) {
    const tenant = await Tenant.findByPk(tenantId);
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    // Calculate billing period
    const periodEnd = new Date(billingDate);
    const periodStart = new Date(billingDate);
    periodStart.setMonth(periodStart.getMonth() - 1);

    // Get plan pricing
    const planConfig = BILLING_CONFIG.planPricing[tenant.plan] || BILLING_CONFIG.planPricing.basic;
    
    // Calculate base subscription (pro-rated for monthly)
    const monthlyBase = Math.round(planConfig.basePrice / 12);
    
    // Calculate additional user charges
    const usage = tenant.usage || {};
    const limits = tenant.limits || {};
    const baseUsers = limits.users || 10;
    const actualUsers = usage.users || 0;
    const additionalUsers = Math.max(0, actualUsers - baseUsers);
    const additionalUserCharge = additionalUsers * Math.round(planConfig.perUserPrice / 12);

    // Calculate voice scriber charges (if applicable)
    let voiceScribers = 0;
    let voiceScribeCharge = 0;
    if (tenant.features?.ai_assistant || tenant.features?.voice_scriber) {
      voiceScribers = usage.voice_scriber_devices || 0;
      voiceScribeCharge = voiceScribers * Math.round(BILLING_CONFIG.voiceScriber.perDeviceAnnual / 12);
    }

    // Get overages
    const overageData = await this.calculateOverages(tenantId, periodStart, periodEnd);

    // Calculate subtotal
    const subtotal = monthlyBase + additionalUserCharge + voiceScribeCharge + overageData.totalOverageCharge;

    // Calculate tax
    const taxAmount = Math.round(subtotal * (BILLING_CONFIG.taxRate / 100));

    // Calculate total
    const totalAmount = subtotal + taxAmount;

    // Generate invoice number
    const invoiceNumber = this.generateInvoiceNumber(tenantId);

    // Create invoice object
    const invoice = {
      invoiceNumber,
      tenantId,
      tenantName: tenant.name,
      tenantEmail: tenant.email,
      tenantAddress: tenant.address,
      tenantGST: tenant.tax_id,
      
      plan: tenant.plan,
      billingCycle: tenant.billing_cycle || 'monthly',
      
      periodStart: periodStart.toISOString().split('T')[0],
      periodEnd: periodEnd.toISOString().split('T')[0],
      invoiceDate: billingDate.toISOString().split('T')[0],
      dueDate: this.calculateDueDate(billingDate).toISOString().split('T')[0],
      
      lineItems: [
        {
          description: `${this.capitalizeFirst(tenant.plan)} Plan - Monthly Subscription`,
          quantity: 1,
          unitPrice: monthlyBase,
          amount: monthlyBase
        }
      ],
      
      subtotal,
      taxRate: BILLING_CONFIG.taxRate,
      taxAmount,
      totalAmount,
      currency: BILLING_CONFIG.currency,
      
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    // Add additional users line item
    if (additionalUsers > 0) {
      invoice.lineItems.push({
        description: `Additional Users (${additionalUsers} × ₹${Math.round(planConfig.perUserPrice / 12)}/month)`,
        quantity: additionalUsers,
        unitPrice: Math.round(planConfig.perUserPrice / 12),
        amount: additionalUserCharge
      });
    }

    // Add voice scriber line item
    if (voiceScribers > 0) {
      invoice.lineItems.push({
        description: `Voice Scriber Devices (${voiceScribers} × ₹${Math.round(BILLING_CONFIG.voiceScriber.perDeviceAnnual / 12)}/month)`,
        quantity: voiceScribers,
        unitPrice: Math.round(BILLING_CONFIG.voiceScriber.perDeviceAnnual / 12),
        amount: voiceScribeCharge
      });
    }

    // Add overage line items
    for (const [type, overage] of Object.entries(overageData.overages)) {
      invoice.lineItems.push({
        description: `Overage: ${overage.description}`,
        quantity: overage.overage,
        unitPrice: overage.rate,
        amount: overage.charge
      });
    }

    // Save invoice to database
    try {
      await this.saveInvoice(invoice);
    } catch (error) {
      console.error('Error saving invoice:', error);
      // Continue without saving - invoice object is still useful
    }

    // Emit billing event
    billingEvents.emit('invoice:generated', invoice);

    return invoice;
  }

  /**
   * Save invoice to database
   * @param {object} invoice - Invoice object
   */
  async saveInvoice(invoice) {
    try {
      await sequelize.query(`
        INSERT INTO saas_invoices (
          invoice_number, tenant_id, plan, billing_cycle,
          period_start, period_end, invoice_date, due_date,
          line_items, subtotal, tax_rate, tax_amount, total_amount,
          currency, status, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW()
        )
        ON CONFLICT (invoice_number) DO NOTHING
      `, {
        bind: [
          invoice.invoiceNumber,
          invoice.tenantId,
          invoice.plan,
          invoice.billingCycle,
          invoice.periodStart,
          invoice.periodEnd,
          invoice.invoiceDate,
          invoice.dueDate,
          JSON.stringify(invoice.lineItems),
          invoice.subtotal,
          invoice.taxRate,
          invoice.taxAmount,
          invoice.totalAmount,
          invoice.currency,
          invoice.status
        ]
      });
    } catch (error) {
      // Table might not exist, log and continue
      console.log('[SaaSBilling] Could not save invoice to DB:', error.message);
    }
  }

  /**
   * Get invoice by number
   * @param {string} invoiceNumber - Invoice number
   */
  async getInvoice(invoiceNumber) {
    try {
      const [rows] = await sequelize.query(
        'SELECT * FROM saas_invoices WHERE invoice_number = $1',
        { bind: [invoiceNumber] }
      );
      return rows?.[0] || null;
    } catch (error) {
      console.log('[SaaSBilling] Could not fetch invoice:', error.message);
      return null;
    }
  }

  /**
   * Get all invoices for a tenant
   * @param {number} tenantId - Tenant ID
   * @param {object} options - Query options
   */
  async getTenantInvoices(tenantId, options = {}) {
    const { limit = 50, offset = 0, status = null } = options;
    
    try {
      let query = 'SELECT * FROM saas_invoices WHERE tenant_id = $1';
      const bind = [tenantId];
      
      if (status) {
        query += ' AND status = $2';
        bind.push(status);
      }
      
      query += ' ORDER BY invoice_date DESC LIMIT $' + (bind.length + 1) + ' OFFSET $' + (bind.length + 2);
      bind.push(limit, offset);
      
      const [rows] = await sequelize.query(query, { bind });
      return rows || [];
    } catch (error) {
      console.log('[SaaSBilling] Could not fetch invoices:', error.message);
      return [];
    }
  }

  /**
   * Check for overdue payments and apply penalties/suspensions
   */
  async checkOverduePayments() {
    const today = new Date();
    const gracePeriodDate = new Date(today);
    gracePeriodDate.setDate(gracePeriodDate.getDate() - BILLING_CONFIG.gracePeriodDays);
    
    const suspensionDate = new Date(today);
    suspensionDate.setDate(suspensionDate.getDate() - BILLING_CONFIG.suspensionAfterDays);

    const results = {
      checked: 0,
      reminders: 0,
      suspended: 0,
      errors: []
    };

    // Get tenants with pending invoices
    try {
      const [overdueInvoices] = await sequelize.query(`
        SELECT i.*, t.name as tenant_name, t.email as tenant_email, t.status as tenant_status
        FROM saas_invoices i
        JOIN tenants t ON i.tenant_id = t.id
        WHERE i.status = 'pending'
          AND i.due_date < $1
        ORDER BY i.due_date ASC
      `, { bind: [today.toISOString().split('T')[0]] });

      for (const invoice of overdueInvoices || []) {
        results.checked++;
        const dueDate = new Date(invoice.due_date);
        const daysOverdue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));

        try {
          if (daysOverdue >= BILLING_CONFIG.suspensionAfterDays && invoice.tenant_status === 'active') {
            // Suspend tenant
            await this.suspendTenantForNonPayment(invoice.tenant_id, invoice.invoice_number);
            results.suspended++;
            
            billingEvents.emit('tenant:suspended', {
              tenantId: invoice.tenant_id,
              tenantName: invoice.tenant_name,
              reason: 'non_payment',
              invoiceNumber: invoice.invoice_number,
              daysOverdue
            });
          } else if (daysOverdue >= BILLING_CONFIG.gracePeriodDays) {
            // Send reminder
            results.reminders++;
            
            billingEvents.emit('payment:reminder', {
              tenantId: invoice.tenant_id,
              tenantName: invoice.tenant_name,
              tenantEmail: invoice.tenant_email,
              invoiceNumber: invoice.invoice_number,
              amount: invoice.total_amount,
              daysOverdue,
              suspensionIn: BILLING_CONFIG.suspensionAfterDays - daysOverdue
            });
          }
        } catch (error) {
          results.errors.push({
            tenantId: invoice.tenant_id,
            error: error.message
          });
        }
      }
    } catch (error) {
      console.error('[SaaSBilling] Error checking overdue payments:', error);
    }

    return results;
  }

  /**
   * Suspend tenant for non-payment
   * @param {number} tenantId - Tenant ID
   * @param {string} invoiceNumber - Related invoice number
   */
  async suspendTenantForNonPayment(tenantId, invoiceNumber) {
    const tenant = await Tenant.findByPk(tenantId);
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    // Update tenant status
    tenant.status = 'suspended';
    tenant.suspension_reason = 'non_payment';
    tenant.suspension_date = new Date();
    tenant.suspension_invoice = invoiceNumber;
    
    await tenant.save();

    console.log(`[SaaSBilling] Tenant ${tenant.name} (${tenantId}) suspended for non-payment`);
    return tenant;
  }

  /**
   * Reactivate tenant after payment
   * @param {number} tenantId - Tenant ID
   */
  async reactivateTenant(tenantId) {
    const tenant = await Tenant.findByPk(tenantId);
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    tenant.status = 'active';
    tenant.suspension_reason = null;
    tenant.suspension_date = null;
    tenant.suspension_invoice = null;
    
    await tenant.save();

    billingEvents.emit('tenant:reactivated', {
      tenantId,
      tenantName: tenant.name
    });

    console.log(`[SaaSBilling] Tenant ${tenant.name} (${tenantId}) reactivated`);
    return tenant;
  }

  /**
   * Record payment for an invoice
   * @param {string} invoiceNumber - Invoice number
   * @param {object} paymentDetails - Payment details
   */
  async recordPayment(invoiceNumber, paymentDetails) {
    const { amount, method, transactionId, paidAt = new Date() } = paymentDetails;

    try {
      await sequelize.query(`
        UPDATE saas_invoices 
        SET status = 'paid',
            payment_amount = $1,
            payment_method = $2,
            payment_transaction_id = $3,
            paid_at = $4,
            updated_at = NOW()
        WHERE invoice_number = $5
      `, {
        bind: [amount, method, transactionId, paidAt, invoiceNumber]
      });

      // Get invoice to check if tenant needs reactivation
      const invoice = await this.getInvoice(invoiceNumber);
      if (invoice) {
        const tenant = await Tenant.findByPk(invoice.tenant_id);
        if (tenant && tenant.status === 'suspended' && tenant.suspension_invoice === invoiceNumber) {
          await this.reactivateTenant(invoice.tenant_id);
        }
      }

      billingEvents.emit('payment:received', {
        invoiceNumber,
        amount,
        method,
        transactionId
      });

      return { success: true, invoiceNumber };
    } catch (error) {
      console.error('[SaaSBilling] Error recording payment:', error);
      throw error;
    }
  }

  /**
   * Get billing summary for super admin dashboard
   */
  async getBillingSummary() {
    const summary = {
      totalMRR: 0,
      totalARR: 0,
      overdueAmount: 0,
      pendingInvoices: 0,
      paidThisMonth: 0,
      byPlan: {}
    };

    try {
      // Get MRR by plan
      const tenants = await Tenant.findAll({ where: { status: 'active' } });
      
      for (const tenant of tenants) {
        const planConfig = BILLING_CONFIG.planPricing[tenant.plan] || BILLING_CONFIG.planPricing.basic;
        const monthlyValue = Math.round(planConfig.basePrice / 12);
        
        summary.totalMRR += monthlyValue;
        
        if (!summary.byPlan[tenant.plan]) {
          summary.byPlan[tenant.plan] = { count: 0, mrr: 0 };
        }
        summary.byPlan[tenant.plan].count++;
        summary.byPlan[tenant.plan].mrr += monthlyValue;
      }
      
      summary.totalARR = summary.totalMRR * 12;

      // Get pending/overdue invoices
      const [invoiceStats] = await sequelize.query(`
        SELECT 
          COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
          SUM(total_amount) FILTER (WHERE status = 'pending' AND due_date < NOW()) as overdue_amount,
          SUM(total_amount) FILTER (WHERE status = 'paid' AND paid_at >= DATE_TRUNC('month', NOW())) as paid_this_month
        FROM saas_invoices
      `);

      if (invoiceStats?.[0]) {
        summary.pendingInvoices = parseInt(invoiceStats[0].pending_count) || 0;
        summary.overdueAmount = parseFloat(invoiceStats[0].overdue_amount) || 0;
        summary.paidThisMonth = parseFloat(invoiceStats[0].paid_this_month) || 0;
      }
    } catch (error) {
      console.log('[SaaSBilling] Error getting billing summary:', error.message);
    }

    return summary;
  }

  /**
   * Generate unique invoice number
   * @param {number} tenantId - Tenant ID
   */
  generateInvoiceNumber(tenantId) {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const timestamp = Date.now().toString().slice(-6);
    return `INV-${year}${month}-${tenantId}-${timestamp}`;
  }

  /**
   * Calculate due date (15 days from invoice date)
   * @param {Date} invoiceDate - Invoice date
   */
  calculateDueDate(invoiceDate) {
    const dueDate = new Date(invoiceDate);
    dueDate.setDate(dueDate.getDate() + 15);
    return dueDate;
  }

  /**
   * Capitalize first letter
   * @param {string} str - String to capitalize
   */
  capitalizeFirst(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
  }
}

// Export singleton instance
const saasBillingService = new SaaSBillingService();
export default saasBillingService;

// Also export class and config for testing
export { SaaSBillingService, BILLING_CONFIG };
