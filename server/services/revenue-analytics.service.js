/**
 * Revenue Analytics Service (MRR/ARR)
 * 
 * Phase 3: SaaS Revenue Metrics
 * - Monthly Recurring Revenue (MRR)
 * - Annual Recurring Revenue (ARR)
 * - Churn analysis
 * - Growth metrics
 * - Cohort analysis
 * 
 * @module services/revenue-analytics.service
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';

// Plan pricing configuration
const PLAN_PRICING = {
  free: { monthly: 0, annual: 0 },
  basic: { monthly: 5000, annual: 60000 },
  professional: { monthly: 15000, annual: 180000 },
  enterprise: { monthly: 42000, annual: 500000 }
};

const VOICE_SCRIBER_PRICE = 62000; // Per device per year

class RevenueAnalyticsService {
  /**
   * Get comprehensive revenue dashboard
   */
  async getRevenueDashboard() {
    const [
      mrrMetrics,
      arrMetrics,
      churnMetrics,
      growthMetrics,
      revenueBreakdown
    ] = await Promise.all([
      this.calculateMRR(),
      this.calculateARR(),
      this.calculateChurn(),
      this.calculateGrowthMetrics(),
      this.getRevenueBreakdown()
    ]);

    return {
      mrr: mrrMetrics,
      arr: arrMetrics,
      churn: churnMetrics,
      growth: growthMetrics,
      breakdown: revenueBreakdown,
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Calculate Monthly Recurring Revenue (MRR)
   */
  async calculateMRR() {
    try {
      // Get active tenants by plan
      const [tenantsByPlan] = await sequelize.query(`
        SELECT 
          plan_type,
          COUNT(*) as tenant_count
        FROM tenants
        WHERE status = 'active'
        GROUP BY plan_type
      `);

      // Calculate base MRR from subscriptions
      let baseMRR = 0;
      const planBreakdown = {};

      for (const row of tenantsByPlan) {
        const pricing = PLAN_PRICING[row.plan_type] || PLAN_PRICING.free;
        const planMRR = pricing.monthly * parseInt(row.tenant_count);
        baseMRR += planMRR;
        planBreakdown[row.plan_type] = {
          count: parseInt(row.tenant_count),
          mrr: planMRR
        };
      }

      // Add Voice Scriber MRR (annual price / 12)
      const [voiceDevices] = await sequelize.query(`
        SELECT COUNT(*) as device_count
        FROM voice_scriber_devices
        WHERE status != 'deactivated'
      `);
      const voiceSciberMRR = Math.round((parseInt(voiceDevices[0]?.device_count || 0) * VOICE_SCRIBER_PRICE) / 12);

      // Get overage revenue from last month
      const [overageRevenue] = await sequelize.query(`
        SELECT COALESCE(SUM(overage_amount), 0) as total
        FROM saas_invoices
        WHERE billing_period_start >= DATE_TRUNC('month', NOW() - INTERVAL '1 month')
          AND billing_period_start < DATE_TRUNC('month', NOW())
      `);
      const overageMRR = parseFloat(overageRevenue[0]?.total || 0);

      const totalMRR = baseMRR + voiceSciberMRR + overageMRR;

      // Get previous month MRR for comparison
      const [prevMonthInvoices] = await sequelize.query(`
        SELECT COALESCE(SUM(base_amount + voice_scriber_amount), 0) as prev_mrr
        FROM saas_invoices
        WHERE billing_period_start >= DATE_TRUNC('month', NOW() - INTERVAL '2 months')
          AND billing_period_start < DATE_TRUNC('month', NOW() - INTERVAL '1 month')
      `);
      const prevMRR = parseFloat(prevMonthInvoices[0]?.prev_mrr || 0);

      const mrrGrowth = prevMRR > 0 ? ((totalMRR - prevMRR) / prevMRR) * 100 : 0;

      return {
        total: totalMRR,
        breakdown: {
          subscriptions: baseMRR,
          voiceScriber: voiceSciberMRR,
          overage: overageMRR
        },
        byPlan: planBreakdown,
        previousMonth: prevMRR,
        growthPercent: Math.round(mrrGrowth * 100) / 100,
        currency: 'INR'
      };
    } catch (error) {
      console.error('[RevenueAnalytics] MRR calculation error:', error);
      return { error: error.message };
    }
  }

  /**
   * Calculate Annual Recurring Revenue (ARR)
   */
  async calculateARR() {
    const mrr = await this.calculateMRR();
    if (mrr.error) return mrr;

    const arr = mrr.total * 12;

    // Get contracted ARR (sum of annual contracts)
    const [contractedARR] = await sequelize.query(`
      SELECT 
        COALESCE(SUM(
          CASE 
            WHEN plan_type = 'basic' THEN 60000
            WHEN plan_type = 'professional' THEN 180000
            WHEN plan_type = 'enterprise' THEN 500000
            ELSE 0
          END
        ), 0) as contracted_arr
      FROM tenants
      WHERE status = 'active' AND plan_type != 'free'
    `);

    return {
      projected: arr,
      contracted: parseFloat(contractedARR[0]?.contracted_arr || 0),
      mrrBased: arr,
      currency: 'INR'
    };
  }

  /**
   * Calculate churn metrics
   */
  async calculateChurn() {
    try {
      // Monthly churn rate
      const [churnData] = await sequelize.query(`
        WITH monthly_data AS (
          SELECT 
            DATE_TRUNC('month', created_at) as month,
            COUNT(*) FILTER (WHERE action = 'churned' OR action = 'suspended') as churned,
            (SELECT COUNT(*) FROM tenants WHERE status = 'active') as active_start
          FROM tenant_suspension_history
          WHERE created_at >= NOW() - INTERVAL '12 months'
          GROUP BY DATE_TRUNC('month', created_at)
        )
        SELECT 
          TO_CHAR(month, 'YYYY-MM') as month,
          churned,
          active_start,
          ROUND((churned::numeric / NULLIF(active_start, 0)) * 100, 2) as churn_rate
        FROM monthly_data
        ORDER BY month DESC
      `);

      // Calculate average churn rate
      const avgChurn = churnData.length > 0
        ? churnData.reduce((sum, d) => sum + parseFloat(d.churn_rate || 0), 0) / churnData.length
        : 0;

      // Revenue churn
      const [revenueChurn] = await sequelize.query(`
        SELECT 
          COALESCE(SUM(
            CASE t.plan_type
              WHEN 'basic' THEN 5000
              WHEN 'professional' THEN 15000
              WHEN 'enterprise' THEN 42000
              ELSE 0
            END
          ), 0) as churned_mrr
        FROM tenant_suspension_history h
        JOIN tenants t ON h.tenant_id = t.id
        WHERE h.action IN ('churned', 'suspended')
          AND h.created_at >= DATE_TRUNC('month', NOW())
      `);

      return {
        monthlyHistory: churnData || [],
        averageChurnRate: Math.round(avgChurn * 100) / 100,
        currentMonthChurnedMRR: parseFloat(revenueChurn[0]?.churned_mrr || 0),
        unit: 'percent'
      };
    } catch (error) {
      console.error('[RevenueAnalytics] Churn calculation error:', error);
      return { error: error.message };
    }
  }

  /**
   * Calculate growth metrics
   */
  async calculateGrowthMetrics() {
    try {
      // New MRR (from new customers)
      const [newMRR] = await sequelize.query(`
        SELECT COALESCE(SUM(
          CASE plan_type
            WHEN 'basic' THEN 5000
            WHEN 'professional' THEN 15000
            WHEN 'enterprise' THEN 42000
            ELSE 0
          END
        ), 0) as new_mrr
        FROM tenants
        WHERE created_at >= DATE_TRUNC('month', NOW())
          AND status = 'active'
          AND plan_type != 'free'
      `);

      // Expansion MRR (upgrades)
      const [expansionMRR] = await sequelize.query(`
        SELECT COALESCE(SUM(
          CASE 
            WHEN notes LIKE '%basic%professional%' THEN 10000
            WHEN notes LIKE '%basic%enterprise%' THEN 37000
            WHEN notes LIKE '%professional%enterprise%' THEN 27000
            ELSE 0
          END
        ), 0) as expansion_mrr
        FROM tenant_suspension_history
        WHERE action = 'plan_upgrade'
          AND created_at >= DATE_TRUNC('month', NOW())
      `);

      // Contraction MRR (downgrades)
      const [contractionMRR] = await sequelize.query(`
        SELECT COALESCE(SUM(
          CASE 
            WHEN notes LIKE '%enterprise%professional%' THEN 27000
            WHEN notes LIKE '%enterprise%basic%' THEN 37000
            WHEN notes LIKE '%professional%basic%' THEN 10000
            ELSE 0
          END
        ), 0) as contraction_mrr
        FROM tenant_suspension_history
        WHERE action = 'plan_downgrade'
          AND created_at >= DATE_TRUNC('month', NOW())
      `);

      // Monthly growth trend
      const [monthlyGrowth] = await sequelize.query(`
        SELECT 
          TO_CHAR(created_at, 'YYYY-MM') as month,
          COUNT(*) as new_tenants,
          COUNT(*) FILTER (WHERE plan_type != 'free') as paid_tenants
        FROM tenants
        WHERE created_at >= NOW() - INTERVAL '12 months'
        GROUP BY TO_CHAR(created_at, 'YYYY-MM')
        ORDER BY month
      `);

      const newMRRValue = parseFloat(newMRR[0]?.new_mrr || 0);
      const expansionValue = parseFloat(expansionMRR[0]?.expansion_mrr || 0);
      const contractionValue = parseFloat(contractionMRR[0]?.contraction_mrr || 0);

      return {
        newMRR: newMRRValue,
        expansionMRR: expansionValue,
        contractionMRR: contractionValue,
        netNewMRR: newMRRValue + expansionValue - contractionValue,
        monthlyTrend: monthlyGrowth || [],
        currency: 'INR'
      };
    } catch (error) {
      console.error('[RevenueAnalytics] Growth metrics error:', error);
      return { error: error.message };
    }
  }

  /**
   * Get revenue breakdown by category
   */
  async getRevenueBreakdown() {
    try {
      // By plan type
      const [byPlan] = await sequelize.query(`
        SELECT 
          plan_type,
          COUNT(*) as tenant_count,
          COUNT(*) * CASE plan_type
            WHEN 'basic' THEN 60000
            WHEN 'professional' THEN 180000
            WHEN 'enterprise' THEN 500000
            ELSE 0
          END as annual_revenue
        FROM tenants
        WHERE status = 'active'
        GROUP BY plan_type
        ORDER BY annual_revenue DESC
      `);

      // By revenue source
      const [bySource] = await sequelize.query(`
        SELECT 
          'subscriptions' as source,
          COALESCE(SUM(base_amount), 0) as amount
        FROM saas_invoices
        WHERE billing_period_start >= DATE_TRUNC('year', NOW())
        UNION ALL
        SELECT 
          'voice_scriber' as source,
          COALESCE(SUM(voice_scriber_amount), 0) as amount
        FROM saas_invoices
        WHERE billing_period_start >= DATE_TRUNC('year', NOW())
        UNION ALL
        SELECT 
          'overage' as source,
          COALESCE(SUM(overage_amount), 0) as amount
        FROM saas_invoices
        WHERE billing_period_start >= DATE_TRUNC('year', NOW())
      `);

      // Top revenue tenants
      const [topTenants] = await sequelize.query(`
        SELECT 
          t.id,
          t.name,
          t.plan_type,
          COALESCE(SUM(i.total_amount), 0) as total_revenue
        FROM tenants t
        LEFT JOIN saas_invoices i ON i.tenant_id = t.id
          AND i.billing_period_start >= DATE_TRUNC('year', NOW())
        WHERE t.status = 'active'
        GROUP BY t.id, t.name, t.plan_type
        ORDER BY total_revenue DESC
        LIMIT 10
      `);

      return {
        byPlan: byPlan || [],
        bySource: bySource || [],
        topTenants: topTenants || []
      };
    } catch (error) {
      console.error('[RevenueAnalytics] Revenue breakdown error:', error);
      return { error: error.message };
    }
  }

  /**
   * Get cohort analysis
   */
  async getCohortAnalysis(months = 12) {
    try {
      const [cohorts] = await sequelize.query(`
        WITH cohort_data AS (
          SELECT 
            t.id,
            DATE_TRUNC('month', t.created_at) as cohort_month,
            t.created_at,
            t.status,
            CASE 
              WHEN t.plan_type = 'basic' THEN 5000
              WHEN t.plan_type = 'professional' THEN 15000
              WHEN t.plan_type = 'enterprise' THEN 42000
              ELSE 0
            END as mrr
          FROM tenants t
          WHERE t.created_at >= NOW() - INTERVAL '${parseInt(months)} months'
        )
        SELECT 
          TO_CHAR(cohort_month, 'YYYY-MM') as cohort,
          COUNT(*) as initial_count,
          COUNT(*) FILTER (WHERE status = 'active') as current_active,
          ROUND((COUNT(*) FILTER (WHERE status = 'active')::numeric / COUNT(*)) * 100, 1) as retention_rate,
          SUM(mrr) FILTER (WHERE status = 'active') as current_mrr
        FROM cohort_data
        GROUP BY cohort_month
        ORDER BY cohort_month
      `);

      return {
        cohorts: cohorts || [],
        period: `${months} months`
      };
    } catch (error) {
      console.error('[RevenueAnalytics] Cohort analysis error:', error);
      return { error: error.message };
    }
  }

  /**
   * Get revenue forecast
   */
  async getRevenueForecast(months = 6) {
    try {
      const mrr = await this.calculateMRR();
      const growth = await this.calculateGrowthMetrics();
      const churn = await this.calculateChurn();

      if (mrr.error || growth.error) {
        return { error: 'Could not calculate forecast' };
      }

      // Simple forecast based on current MRR and growth rate
      const monthlyGrowthRate = (growth.netNewMRR / mrr.total) || 0.05; // Default 5%
      const monthlyChurnRate = (churn.averageChurnRate / 100) || 0.02; // Default 2%

      const forecast = [];
      let projectedMRR = mrr.total;

      for (let i = 1; i <= months; i++) {
        const newMRR = projectedMRR * monthlyGrowthRate;
        const churnedMRR = projectedMRR * monthlyChurnRate;
        projectedMRR = projectedMRR + newMRR - churnedMRR;

        const futureDate = new Date();
        futureDate.setMonth(futureDate.getMonth() + i);

        forecast.push({
          month: futureDate.toISOString().slice(0, 7),
          projectedMRR: Math.round(projectedMRR),
          projectedARR: Math.round(projectedMRR * 12)
        });
      }

      return {
        currentMRR: mrr.total,
        forecast,
        assumptions: {
          monthlyGrowthRate: Math.round(monthlyGrowthRate * 10000) / 100,
          monthlyChurnRate: Math.round(monthlyChurnRate * 10000) / 100
        }
      };
    } catch (error) {
      console.error('[RevenueAnalytics] Forecast error:', error);
      return { error: error.message };
    }
  }

  /**
   * Get LTV (Lifetime Value) metrics
   */
  async getLTVMetrics() {
    try {
      // Average revenue per account
      const [arpa] = await sequelize.query(`
        SELECT 
          plan_type,
          AVG(CASE plan_type
            WHEN 'basic' THEN 5000
            WHEN 'professional' THEN 15000
            WHEN 'enterprise' THEN 42000
            ELSE 0
          END) as arpa
        FROM tenants
        WHERE status = 'active' AND plan_type != 'free'
        GROUP BY plan_type
      `);

      // Average customer lifespan (in months)
      const [avgLifespan] = await sequelize.query(`
        SELECT 
          AVG(
            EXTRACT(EPOCH FROM (COALESCE(suspended_at, NOW()) - created_at)) / 86400 / 30
          ) as avg_months
        FROM tenants
        WHERE plan_type != 'free'
      `);

      const churn = await this.calculateChurn();
      const monthlyChurn = churn.averageChurnRate / 100;
      const avgLifespanMonths = parseFloat(avgLifespan[0]?.avg_months || 24);

      // Calculate LTV by plan
      const ltvByPlan = {};
      for (const row of arpa) {
        const customerLifetime = monthlyChurn > 0 ? 1 / monthlyChurn : avgLifespanMonths;
        ltvByPlan[row.plan_type] = Math.round(parseFloat(row.arpa) * customerLifetime);
      }

      return {
        byPlan: ltvByPlan,
        averageLifespanMonths: Math.round(avgLifespanMonths),
        churnRate: churn.averageChurnRate,
        currency: 'INR'
      };
    } catch (error) {
      console.error('[RevenueAnalytics] LTV calculation error:', error);
      return { error: error.message };
    }
  }
}

// Export singleton
const revenueAnalyticsService = new RevenueAnalyticsService();
export default revenueAnalyticsService;
