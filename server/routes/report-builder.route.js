/**
 * Report Builder API Routes
 * 
 * Phase 3: Custom report generation endpoints
 * - Report templates
 * - Custom report building
 * - Scheduled reports
 * - Export/download
 * 
 * @module routes/report-builder.route
 */

import express from 'express';
import reportBuilderService from '../services/report-builder.service.js';
import revenueAnalyticsService from '../services/revenue-analytics.service.js';
import complianceDashboardService from '../services/compliance-dashboard.service.js';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// Middleware to verify admin access
const verifyAdmin = async (req, res, next) => {
  try {
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'super_admin')) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (error) {
    res.status(401).json({ error: 'Authentication failed' });
  }
};

/**
 * @route GET /api/reports/templates
 * @desc Get available report templates
 * @access Admin
 */
router.get('/templates', verifyAdmin, async (req, res) => {
  try {
    const templates = reportBuilderService.getTemplates();
    res.json({ templates });
  } catch (error) {
    console.error('[Reports] Templates error:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

/**
 * @route GET /api/reports/metrics
 * @desc Get available metrics for custom reports
 * @access Admin
 */
router.get('/metrics', verifyAdmin, async (req, res) => {
  try {
    const metrics = reportBuilderService.getAvailableMetrics();
    res.json({ metrics });
  } catch (error) {
    console.error('[Reports] Metrics error:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

/**
 * @route POST /api/reports/build
 * @desc Build a custom report
 * @access Admin
 */
router.post('/build', verifyAdmin, async (req, res) => {
  try {
    const {
      templateId,
      metrics,
      filters,
      groupBy,
      orderBy,
      limit,
      format = 'json'
    } = req.body;

    const report = await reportBuilderService.buildReport({
      templateId,
      metrics,
      filters,
      groupBy,
      orderBy,
      limit,
      format
    });

    res.json(report);
  } catch (error) {
    console.error('[Reports] Build error:', error);
    res.status(500).json({ error: 'Failed to build report', details: error.message });
  }
});

/**
 * @route GET /api/reports/usage-summary
 * @desc Generate usage summary report
 * @access Admin
 */
router.get('/usage-summary', verifyAdmin, async (req, res) => {
  try {
    const { tenantId, period = 'last_month' } = req.query;
    const report = await reportBuilderService.generateUsageSummary(
      tenantId ? parseInt(tenantId) : null,
      period
    );
    res.json(report);
  } catch (error) {
    console.error('[Reports] Usage summary error:', error);
    res.status(500).json({ error: 'Failed to generate usage summary' });
  }
});

/**
 * @route GET /api/reports/billing
 * @desc Generate billing report
 * @access Admin
 */
router.get('/billing', verifyAdmin, async (req, res) => {
  try {
    const { tenantId, period = 'last_month' } = req.query;
    const report = await reportBuilderService.generateBillingReport(
      tenantId ? parseInt(tenantId) : null,
      period
    );
    res.json(report);
  } catch (error) {
    console.error('[Reports] Billing report error:', error);
    res.status(500).json({ error: 'Failed to generate billing report' });
  }
});

/**
 * @route GET /api/reports/compliance
 * @desc Generate compliance audit report
 * @access Admin
 */
router.get('/compliance', verifyAdmin, async (req, res) => {
  try {
    const { tenantId } = req.query;
    
    // Get comprehensive compliance data
    const [complianceReport, complianceDashboard] = await Promise.all([
      reportBuilderService.generateComplianceReport(
        tenantId ? parseInt(tenantId) : null
      ),
      complianceDashboardService.getComplianceDashboard()
    ]);

    res.json({
      ...complianceReport,
      dashboard: complianceDashboard
    });
  } catch (error) {
    console.error('[Reports] Compliance report error:', error);
    res.status(500).json({ error: 'Failed to generate compliance report' });
  }
});

/**
 * @route GET /api/reports/revenue
 * @desc Generate revenue analytics report
 * @access Admin
 */
router.get('/revenue', verifyAdmin, async (req, res) => {
  try {
    const { period = 'last_12_months' } = req.query;
    
    // Get comprehensive revenue data
    const [
      dashboard,
      forecast,
      cohortAnalysis,
      ltvMetrics
    ] = await Promise.all([
      revenueAnalyticsService.getRevenueDashboard(),
      revenueAnalyticsService.getRevenueForecast(6),
      revenueAnalyticsService.getCohortAnalysis(),
      revenueAnalyticsService.getLTVMetrics()
    ]);

    res.json({
      reportId: `REV-${Date.now()}`,
      generatedAt: new Date().toISOString(),
      period,
      dashboard,
      forecast,
      cohortAnalysis,
      ltvMetrics
    });
  } catch (error) {
    console.error('[Reports] Revenue report error:', error);
    res.status(500).json({ error: 'Failed to generate revenue report' });
  }
});

/**
 * @route POST /api/reports/export
 * @desc Export a report in specified format
 * @access Admin
 */
router.post('/export', verifyAdmin, async (req, res) => {
  try {
    const { reportConfig, format = 'csv' } = req.body;

    if (!['csv', 'excel', 'json'].includes(format)) {
      return res.status(400).json({ error: 'Invalid format. Supported: csv, excel, json' });
    }

    const report = await reportBuilderService.buildReport({
      ...reportConfig,
      format
    });

    if (format === 'json') {
      return res.json(report);
    }

    res.json({
      success: true,
      ...report
    });
  } catch (error) {
    console.error('[Reports] Export error:', error);
    res.status(500).json({ error: 'Failed to export report' });
  }
});

/**
 * @route GET /api/reports/download/:filename
 * @desc Download a generated report file
 * @access Admin
 */
router.get('/download/:filename', verifyAdmin, async (req, res) => {
  try {
    const { filename } = req.params;
    const reportsDir = path.join(process.cwd(), 'reports');
    const filepath = path.join(reportsDir, filename);

    // Security check - ensure file is in reports directory
    if (!filepath.startsWith(reportsDir)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.download(filepath);
  } catch (error) {
    console.error('[Reports] Download error:', error);
    res.status(500).json({ error: 'Failed to download report' });
  }
});

/**
 * @route POST /api/reports/schedule
 * @desc Schedule a recurring report
 * @access Admin
 */
router.post('/schedule', verifyAdmin, async (req, res) => {
  try {
    const {
      reportConfig,
      schedule, // Cron expression
      recipients,
      name
    } = req.body;

    if (!reportConfig || !schedule) {
      return res.status(400).json({ error: 'reportConfig and schedule are required' });
    }

    // Validate cron expression (basic validation)
    const cronParts = schedule.split(' ');
    if (cronParts.length < 5 || cronParts.length > 6) {
      return res.status(400).json({ error: 'Invalid cron expression' });
    }

    const result = await reportBuilderService.scheduleReport({
      scheduleId: `SCHED-${name?.replace(/\s+/g, '-') || Date.now()}`,
      name,
      reportConfig,
      schedule,
      recipients: recipients || [],
      enabled: true
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('[Reports] Schedule error:', error);
    res.status(500).json({ error: 'Failed to schedule report' });
  }
});

/**
 * @route GET /api/reports/scheduled
 * @desc Get all scheduled reports
 * @access Admin
 */
router.get('/scheduled', verifyAdmin, async (req, res) => {
  try {
    const scheduled = await reportBuilderService.getScheduledReports();
    res.json({ scheduledReports: scheduled });
  } catch (error) {
    console.error('[Reports] Get scheduled error:', error);
    res.status(500).json({ error: 'Failed to fetch scheduled reports' });
  }
});

/**
 * @route DELETE /api/reports/scheduled/:scheduleId
 * @desc Cancel a scheduled report
 * @access Admin
 */
router.delete('/scheduled/:scheduleId', verifyAdmin, async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const result = await reportBuilderService.cancelScheduledReport(scheduleId);
    res.json(result);
  } catch (error) {
    console.error('[Reports] Cancel scheduled error:', error);
    res.status(500).json({ error: 'Failed to cancel scheduled report' });
  }
});

/**
 * @route GET /api/reports/archive
 * @desc Get archived reports
 * @access Admin
 */
router.get('/archive', verifyAdmin, async (req, res) => {
  try {
    const { reportType, startDate, endDate } = req.query;
    const archives = await reportBuilderService.getArchivedReports({
      reportType,
      startDate,
      endDate
    });
    res.json({ archives });
  } catch (error) {
    console.error('[Reports] Archive error:', error);
    res.status(500).json({ error: 'Failed to fetch archived reports' });
  }
});

/**
 * @route GET /api/reports/tenant/:tenantId
 * @desc Generate comprehensive tenant report
 * @access Admin
 */
router.get('/tenant/:tenantId', verifyAdmin, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { period = 'last_month' } = req.query;

    // Generate multiple reports for the tenant
    const [usageReport, billingReport] = await Promise.all([
      reportBuilderService.buildReport({
        templateId: 'USAGE_SUMMARY',
        filters: { tenantId: parseInt(tenantId), period }
      }),
      reportBuilderService.buildReport({
        templateId: 'BILLING_REPORT',
        filters: { tenantId: parseInt(tenantId), period }
      })
    ]);

    res.json({
      reportId: `TENANT-${tenantId}-${Date.now()}`,
      generatedAt: new Date().toISOString(),
      tenantId: parseInt(tenantId),
      period,
      usage: usageReport,
      billing: billingReport
    });
  } catch (error) {
    console.error('[Reports] Tenant report error:', error);
    res.status(500).json({ error: 'Failed to generate tenant report' });
  }
});

/**
 * @route GET /api/reports/doctor-performance
 * @desc Generate doctor performance report
 * @access Admin
 */
router.get('/doctor-performance', verifyAdmin, async (req, res) => {
  try {
    const { tenantId, doctorId, period = 'last_month' } = req.query;

    const report = await reportBuilderService.buildReport({
      templateId: 'DOCTOR_PERFORMANCE',
      filters: {
        tenantId: tenantId ? parseInt(tenantId) : null,
        doctorId: doctorId ? parseInt(doctorId) : null,
        period
      }
    });

    res.json(report);
  } catch (error) {
    console.error('[Reports] Doctor performance error:', error);
    res.status(500).json({ error: 'Failed to generate doctor performance report' });
  }
});

/**
 * @route GET /api/reports/executive-summary
 * @desc Generate executive summary for leadership
 * @access Admin
 */
router.get('/executive-summary', verifyAdmin, async (req, res) => {
  try {
    const { period = 'last_month' } = req.query;

    // Gather data from multiple sources
    const [
      revenueDashboard,
      usageReport,
      complianceDashboard
    ] = await Promise.all([
      revenueAnalyticsService.getRevenueDashboard(),
      reportBuilderService.buildReport({
        templateId: 'USAGE_SUMMARY',
        filters: { period }
      }),
      complianceDashboardService.getComplianceDashboard()
    ]);

    res.json({
      reportId: `EXEC-${Date.now()}`,
      generatedAt: new Date().toISOString(),
      period,
      executiveSummary: {
        revenue: {
          mrr: revenueDashboard.mrr?.total || 0,
          arr: revenueDashboard.arr?.total || 0,
          growth: revenueDashboard.growth?.monthlyGrowthPercent || 0
        },
        usage: {
          totalConsultations: usageReport.summary?.opd_consultations?.total || 0,
          activeTenantsGrowth: usageReport.data?.length || 0
        },
        compliance: {
          overallScore: complianceDashboard.overallScore || 0,
          hipaaScore: complianceDashboard.hipaa?.overallScore || 0,
          dpdpScore: complianceDashboard.dpdp?.overallScore || 0
        }
      },
      details: {
        revenue: revenueDashboard,
        usage: usageReport,
        compliance: complianceDashboard
      }
    });
  } catch (error) {
    console.error('[Reports] Executive summary error:', error);
    res.status(500).json({ error: 'Failed to generate executive summary' });
  }
});

export default router;
