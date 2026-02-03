/**
 * Usage Metering Service for SaaS HIS Platform
 * 
 * Tracks and enforces usage limits for multi-tenant healthcare organizations:
 * - OPD (Outpatient) visits
 * - IPD (Inpatient) admissions
 * - Storage usage
 * - Voice Scriber minutes
 * - API calls
 * 
 * Sends alerts at configurable thresholds (80%, 95%, 100%)
 * 
 * @module services/usage-metering.service
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import Tenant from '../models/postgres/tenant.model.postgres.js';
import { EventEmitter } from 'events';

// Usage metering event emitter
export const usageMeteringEvents = new EventEmitter();

// Alert thresholds (percentage of limit)
const ALERT_THRESHOLDS = {
  WARNING: 80,
  CRITICAL: 95,
  EXCEEDED: 100
};

// Overage rates (INR)
const OVERAGE_RATES = {
  opd_patients: 3,           // ₹3 per OPD visit over limit
  ipd_admissions: 50,        // ₹50 per IPD admission over limit
  storage_gb: 100,           // ₹100 per GB over limit
  voice_minutes: 0.5,        // ₹0.50 per minute over limit
  api_calls: 0.001           // ₹0.001 per API call over limit
};

// Usage type configurations
const USAGE_TYPES = {
  opd_patients: {
    name: 'OPD Patients',
    period: 'yearly',
    limitField: 'opd_patients_per_year',
    usageField: 'opd_patients_ytd',
    resetOn: 'contract_anniversary'
  },
  ipd_admissions: {
    name: 'IPD Admissions',
    period: 'yearly',
    limitField: 'ipd_admissions_per_year',
    usageField: 'ipd_admissions_ytd',
    resetOn: 'contract_anniversary'
  },
  users: {
    name: 'Active Users',
    period: 'none',
    limitField: 'users',
    usageField: 'users',
    resetOn: null
  },
  doctors: {
    name: 'Doctors',
    period: 'none',
    limitField: 'doctors',
    usageField: 'doctors',
    resetOn: null
  },
  storage_gb: {
    name: 'Storage (GB)',
    period: 'none',
    limitField: 'storage_gb',
    usageField: 'storage_gb',
    resetOn: null
  },
  voice_minutes: {
    name: 'Voice Scriber Minutes',
    period: 'monthly',
    limitField: 'voice_minutes_per_month',
    usageField: 'voice_minutes_mtd',
    resetOn: 'month_start'
  },
  appointments: {
    name: 'Appointments',
    period: 'monthly',
    limitField: 'appointments_per_month',
    usageField: 'appointments_this_month',
    resetOn: 'month_start'
  }
};

/**
 * Usage Metering Service class
 */
class UsageMeteringService {
  constructor() {
    this.alertsSent = new Map(); // Track sent alerts to prevent duplicates
    this.alertCooldown = 24 * 60 * 60 * 1000; // 24 hours between same alerts
  }

  /**
   * Track an OPD (Outpatient) visit for a tenant
   * @param {number|string} tenantId - Tenant ID
   * @param {object} visitData - Visit details
   * @returns {Promise<object>} - Updated usage stats and any alerts
   */
  async trackOPDVisit(tenantId, visitData = {}) {
    return this.incrementUsage(tenantId, 'opd_patients', 1, {
      visitType: 'OPD',
      patientId: visitData.patientId,
      doctorId: visitData.doctorId,
      appointmentId: visitData.appointmentId,
      timestamp: new Date()
    });
  }

  /**
   * Track an IPD (Inpatient) admission for a tenant
   * @param {number|string} tenantId - Tenant ID
   * @param {object} admissionData - Admission details
   * @returns {Promise<object>} - Updated usage stats and any alerts
   */
  async trackIPDAdmission(tenantId, admissionData = {}) {
    return this.incrementUsage(tenantId, 'ipd_admissions', 1, {
      visitType: 'IPD',
      patientId: admissionData.patientId,
      doctorId: admissionData.doctorId,
      admissionId: admissionData.admissionId,
      roomId: admissionData.roomId,
      timestamp: new Date()
    });
  }

  /**
   * Track Voice Scriber usage
   * @param {number|string} tenantId - Tenant ID
   * @param {number} minutes - Minutes used
   * @param {object} metadata - Additional tracking data
   * @returns {Promise<object>} - Updated usage stats
   */
  async trackVoiceScriber(tenantId, minutes, metadata = {}) {
    return this.incrementUsage(tenantId, 'voice_minutes', minutes, {
      doctorId: metadata.doctorId,
      deviceId: metadata.deviceId,
      sessionId: metadata.sessionId,
      duration: minutes,
      timestamp: new Date()
    });
  }

  /**
   * Track storage usage
   * @param {number|string} tenantId - Tenant ID
   * @param {number} bytesAdded - Bytes added (can be negative for deletions)
   * @returns {Promise<object>} - Updated usage stats
   */
  async trackStorage(tenantId, bytesAdded) {
    const gbAdded = bytesAdded / (1024 * 1024 * 1024); // Convert to GB
    return this.incrementUsage(tenantId, 'storage_gb', gbAdded);
  }

  /**
   * Track an appointment booking
   * @param {number|string} tenantId - Tenant ID
   * @param {object} appointmentData - Appointment details
   * @returns {Promise<object>} - Updated usage stats
   */
  async trackAppointment(tenantId, appointmentData = {}) {
    const usageType = appointmentData.consultationType === 'ipd' 
      ? 'ipd_admissions' 
      : appointmentData.consultationType === 'in-person' || appointmentData.consultationType === 'opd'
        ? 'opd_patients'
        : 'appointments';
    
    return this.incrementUsage(tenantId, usageType, 1, {
      appointmentId: appointmentData.id,
      patientId: appointmentData.patientId || appointmentData.userId,
      doctorId: appointmentData.doctorId,
      consultationType: appointmentData.consultationType,
      timestamp: new Date()
    });
  }

  /**
   * Core increment function with alert checking
   * @param {number|string} tenantId - Tenant ID
   * @param {string} usageType - Type of usage to increment
   * @param {number} amount - Amount to increment
   * @param {object} metadata - Additional tracking metadata
   * @returns {Promise<object>} - Updated stats and alerts
   */
  async incrementUsage(tenantId, usageType, amount = 1, metadata = {}) {
    const transaction = await sequelize.transaction();
    
    try {
      // Get tenant with lock
      const tenant = await Tenant.findByPk(tenantId, {
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      if (!tenant) {
        await transaction.rollback();
        throw new Error(`Tenant not found: ${tenantId}`);
      }

      const typeConfig = USAGE_TYPES[usageType];
      if (!typeConfig) {
        await transaction.rollback();
        throw new Error(`Unknown usage type: ${usageType}`);
      }

      // Initialize usage and limits if not present
      const usage = { ...tenant.usage } || {};
      const limits = { ...tenant.limits } || {};

      // Get current values
      const currentUsage = usage[typeConfig.usageField] || 0;
      const limit = limits[typeConfig.limitField] || Infinity;
      
      // Increment usage
      const newUsage = currentUsage + amount;
      usage[typeConfig.usageField] = newUsage;
      
      // Track last update
      usage.last_updated = new Date().toISOString();
      usage[`${typeConfig.usageField}_last_updated`] = new Date().toISOString();

      // Log the usage event
      if (!usage.usage_log) usage.usage_log = [];
      usage.usage_log.push({
        type: usageType,
        amount,
        timestamp: new Date().toISOString(),
        ...metadata
      });

      // Keep only last 1000 log entries
      if (usage.usage_log.length > 1000) {
        usage.usage_log = usage.usage_log.slice(-1000);
      }

      // Update tenant
      tenant.usage = usage;
      await tenant.save({ transaction });
      await transaction.commit();

      // Calculate percentage used
      const percentUsed = limit === Infinity ? 0 : Math.round((newUsage / limit) * 100);

      // Check for alerts (async, don't block)
      this.checkAndSendAlerts(tenant, usageType, newUsage, limit, percentUsed).catch(err => {
        console.error('Error sending usage alert:', err);
      });

      // Emit usage event
      usageMeteringEvents.emit('usage:increment', {
        tenantId: tenant.id,
        tenantName: tenant.name,
        usageType,
        amount,
        currentUsage: newUsage,
        limit,
        percentUsed,
        metadata
      });

      return {
        success: true,
        tenantId: tenant.id,
        usageType,
        currentUsage: newUsage,
        limit,
        percentUsed,
        isOverLimit: newUsage > limit,
        alerts: this.getAlertLevel(percentUsed)
      };
    } catch (error) {
      await transaction.rollback();
      console.error('Error incrementing usage:', error);
      throw error;
    }
  }

  /**
   * Get usage statistics for a tenant
   * @param {number|string} tenantId - Tenant ID
   * @param {Date} startDate - Start date for period (optional)
   * @param {Date} endDate - End date for period (optional)
   * @returns {Promise<object>} - Detailed usage stats
   */
  async getUsageStats(tenantId, startDate = null, endDate = null) {
    const tenant = await Tenant.findByPk(tenantId);
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    const usage = tenant.usage || {};
    const limits = tenant.limits || {};
    const stats = {};

    // Build stats for each usage type
    for (const [type, config] of Object.entries(USAGE_TYPES)) {
      const currentUsage = usage[config.usageField] || 0;
      const limit = limits[config.limitField] || 0;
      const percentUsed = limit ? Math.round((currentUsage / limit) * 100) : 0;
      const overage = Math.max(0, currentUsage - limit);
      const overageRate = OVERAGE_RATES[type] || 0;

      stats[type] = {
        name: config.name,
        period: config.period,
        currentUsage,
        limit,
        percentUsed,
        remaining: Math.max(0, limit - currentUsage),
        isOverLimit: currentUsage > limit,
        overage,
        overageCharge: overage * overageRate,
        alertLevel: this.getAlertLevel(percentUsed),
        lastUpdated: usage[`${config.usageField}_last_updated`] || null
      };
    }

    // Add summary
    const totalOverageCharge = Object.values(stats).reduce((sum, s) => sum + s.overageCharge, 0);
    
    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      plan: tenant.plan,
      billingCycle: tenant.billing_cycle,
      contractStart: tenant.plan_start_date,
      contractEnd: tenant.plan_end_date,
      stats,
      summary: {
        totalOverageCharge,
        hasOverages: totalOverageCharge > 0,
        criticalUsage: Object.entries(stats)
          .filter(([_, s]) => s.percentUsed >= ALERT_THRESHOLDS.CRITICAL)
          .map(([type]) => type),
        warningUsage: Object.entries(stats)
          .filter(([_, s]) => s.percentUsed >= ALERT_THRESHOLDS.WARNING && s.percentUsed < ALERT_THRESHOLDS.CRITICAL)
          .map(([type]) => type)
      },
      lastUpdated: usage.last_updated || null
    };
  }

  /**
   * Check usage limits and determine if operation should be blocked
   * @param {number|string} tenantId - Tenant ID
   * @param {string} usageType - Type of usage to check
   * @returns {Promise<object>} - Limit check result
   */
  async checkUsageLimits(tenantId, usageType = null) {
    const tenant = await Tenant.findByPk(tenantId);
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    const usage = tenant.usage || {};
    const limits = tenant.limits || {};
    const results = {};
    const typesToCheck = usageType ? { [usageType]: USAGE_TYPES[usageType] } : USAGE_TYPES;

    for (const [type, config] of Object.entries(typesToCheck)) {
      if (!config) continue;
      
      const currentUsage = usage[config.usageField] || 0;
      const limit = limits[config.limitField] || Infinity;
      const percentUsed = limit === Infinity ? 0 : Math.round((currentUsage / limit) * 100);

      results[type] = {
        currentUsage,
        limit,
        percentUsed,
        remaining: Math.max(0, limit - currentUsage),
        isAtLimit: currentUsage >= limit,
        isOverLimit: currentUsage > limit,
        canProceed: currentUsage < limit || tenant.plan === 'enterprise', // Enterprise can exceed with overage
        alertLevel: this.getAlertLevel(percentUsed)
      };
    }

    return usageType ? results[usageType] : results;
  }

  /**
   * Check and send alerts if thresholds are crossed
   * @param {object} tenant - Tenant object
   * @param {string} usageType - Usage type
   * @param {number} currentUsage - Current usage value
   * @param {number} limit - Usage limit
   * @param {number} percentUsed - Percentage used
   */
  async checkAndSendAlerts(tenant, usageType, currentUsage, limit, percentUsed) {
    const alertLevel = this.getAlertLevel(percentUsed);
    if (!alertLevel) return;

    // Check if we already sent this alert recently
    const alertKey = `${tenant.id}-${usageType}-${alertLevel}`;
    const lastAlert = this.alertsSent.get(alertKey);
    if (lastAlert && Date.now() - lastAlert < this.alertCooldown) {
      return; // Skip, already sent recently
    }

    // Record alert time
    this.alertsSent.set(alertKey, Date.now());

    // Emit alert event
    usageMeteringEvents.emit('usage:alert', {
      tenantId: tenant.id,
      tenantName: tenant.name,
      tenantEmail: tenant.email,
      usageType,
      usageTypeName: USAGE_TYPES[usageType]?.name || usageType,
      currentUsage,
      limit,
      percentUsed,
      alertLevel,
      timestamp: new Date()
    });

    // Log alert
    console.log(`[USAGE ALERT] ${alertLevel.toUpperCase()}: ${tenant.name} - ${usageType} at ${percentUsed}% (${currentUsage}/${limit})`);
  }

  /**
   * Get alert level based on percentage used
   * @param {number} percentUsed - Percentage used
   * @returns {string|null} - Alert level or null
   */
  getAlertLevel(percentUsed) {
    if (percentUsed >= ALERT_THRESHOLDS.EXCEEDED) return 'exceeded';
    if (percentUsed >= ALERT_THRESHOLDS.CRITICAL) return 'critical';
    if (percentUsed >= ALERT_THRESHOLDS.WARNING) return 'warning';
    return null;
  }

  /**
   * Calculate overages for billing period
   * @param {number|string} tenantId - Tenant ID
   * @param {Date} periodStart - Billing period start
   * @param {Date} periodEnd - Billing period end
   * @returns {Promise<object>} - Overage calculation
   */
  async calculateOverages(tenantId, periodStart = null, periodEnd = null) {
    const stats = await this.getUsageStats(tenantId, periodStart, periodEnd);
    const overages = {};
    let totalOverage = 0;

    for (const [type, stat] of Object.entries(stats.stats)) {
      if (stat.overage > 0) {
        const rate = OVERAGE_RATES[type] || 0;
        const charge = stat.overage * rate;
        overages[type] = {
          overage: stat.overage,
          rate,
          charge,
          description: `${stat.overage} ${stat.name} over limit @ ₹${rate} each`
        };
        totalOverage += charge;
      }
    }

    return {
      tenantId,
      tenantName: stats.tenantName,
      periodStart: periodStart || stats.contractStart,
      periodEnd: periodEnd || new Date(),
      overages,
      totalOverageCharge: totalOverage,
      hasOverages: totalOverage > 0
    };
  }

  /**
   * Reset monthly usage counters
   * Called by cron job at start of each month
   */
  async resetMonthlyUsage() {
    const tenants = await Tenant.findAll({ where: { status: 'active' } });
    const results = [];

    for (const tenant of tenants) {
      try {
        const usage = { ...tenant.usage } || {};
        
        // Reset monthly fields
        usage.appointments_this_month = 0;
        usage.voice_minutes_mtd = 0;
        usage.api_calls_mtd = 0;
        
        // Archive previous month
        const prevMonth = new Date();
        prevMonth.setMonth(prevMonth.getMonth() - 1);
        const archiveKey = `archive_${prevMonth.getFullYear()}_${prevMonth.getMonth() + 1}`;
        usage[archiveKey] = {
          appointments: usage.appointments_this_month || 0,
          voice_minutes: usage.voice_minutes_mtd || 0,
          archived_at: new Date().toISOString()
        };

        tenant.usage = usage;
        await tenant.save();

        results.push({ tenantId: tenant.id, success: true });
      } catch (error) {
        results.push({ tenantId: tenant.id, success: false, error: error.message });
      }
    }

    usageMeteringEvents.emit('usage:monthly_reset', { results });
    return results;
  }

  /**
   * Reset yearly usage counters (on contract anniversary)
   * @param {number|string} tenantId - Tenant ID
   */
  async resetYearlyUsage(tenantId) {
    const tenant = await Tenant.findByPk(tenantId);
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    const usage = { ...tenant.usage } || {};
    const year = new Date().getFullYear();
    
    // Archive current year
    usage[`archive_${year - 1}`] = {
      opd_patients: usage.opd_patients_ytd || 0,
      ipd_admissions: usage.ipd_admissions_ytd || 0,
      archived_at: new Date().toISOString()
    };

    // Reset yearly fields
    usage.opd_patients_ytd = 0;
    usage.ipd_admissions_ytd = 0;

    tenant.usage = usage;
    await tenant.save();

    usageMeteringEvents.emit('usage:yearly_reset', {
      tenantId: tenant.id,
      tenantName: tenant.name
    });

    return { success: true, tenantId };
  }

  /**
   * Get usage dashboard data for all tenants (super admin)
   * @returns {Promise<object>} - Dashboard data
   */
  async getDashboardData() {
    const tenants = await Tenant.findAll({
      where: { status: 'active' },
      attributes: ['id', 'name', 'plan', 'usage', 'limits', 'status']
    });

    const dashboard = {
      totalTenants: tenants.length,
      tenantsAtWarning: 0,
      tenantsAtCritical: 0,
      tenantsExceeded: 0,
      totalOPD: 0,
      totalIPD: 0,
      tenants: []
    };

    for (const tenant of tenants) {
      const usage = tenant.usage || {};
      const limits = tenant.limits || {};
      
      const opdUsage = usage.opd_patients_ytd || 0;
      const opdLimit = limits.opd_patients_per_year || 0;
      const opdPercent = opdLimit ? Math.round((opdUsage / opdLimit) * 100) : 0;

      const ipdUsage = usage.ipd_admissions_ytd || 0;
      const ipdLimit = limits.ipd_admissions_per_year || 0;
      const ipdPercent = ipdLimit ? Math.round((ipdUsage / ipdLimit) * 100) : 0;

      const maxPercent = Math.max(opdPercent, ipdPercent);
      
      if (maxPercent >= 100) dashboard.tenantsExceeded++;
      else if (maxPercent >= 95) dashboard.tenantsAtCritical++;
      else if (maxPercent >= 80) dashboard.tenantsAtWarning++;

      dashboard.totalOPD += opdUsage;
      dashboard.totalIPD += ipdUsage;

      dashboard.tenants.push({
        id: tenant.id,
        name: tenant.name,
        plan: tenant.plan,
        opdUsage,
        opdLimit,
        opdPercent,
        ipdUsage,
        ipdLimit,
        ipdPercent,
        alertLevel: this.getAlertLevel(maxPercent)
      });
    }

    // Sort by highest usage percentage
    dashboard.tenants.sort((a, b) => Math.max(b.opdPercent, b.ipdPercent) - Math.max(a.opdPercent, a.ipdPercent));

    return dashboard;
  }
}

// Export singleton instance
const usageMeteringService = new UsageMeteringService();
export default usageMeteringService;

// Also export class for testing
export { UsageMeteringService, ALERT_THRESHOLDS, OVERAGE_RATES, USAGE_TYPES };
