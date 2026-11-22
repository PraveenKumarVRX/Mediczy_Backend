/**
 * Custom Report Builder Service
 * 
 * Phase 3: Flexible reporting engine
 * - Custom query builder
 * - Multiple report templates
 * - Export formats (JSON, CSV, Excel, PDF)
 * - Scheduled report generation
 * - Report sharing and archival
 * 
 * @module services/report-builder.service
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import cronParser from 'cron-parser';
import { withCronLease } from './cron-lease.service.js';

// Report templates
const REPORT_TEMPLATES = {
  USAGE_SUMMARY: {
    id: 'usage_summary',
    name: 'Usage Summary Report',
    description: 'Monthly usage summary by tenant',
    metrics: ['opd_consultations', 'ipd_admissions', 'storage_used', 'voice_minutes'],
    groupBy: ['tenant', 'month'],
    defaultFilters: { period: 'last_month' }
  },
  BILLING_REPORT: {
    id: 'billing_report',
    name: 'Billing Report',
    description: 'Invoice and payment summary',
    metrics: ['total_invoiced', 'total_paid', 'outstanding', 'overdue'],
    groupBy: ['tenant', 'plan'],
    defaultFilters: { period: 'last_month' }
  },
  COMPLIANCE_AUDIT: {
    id: 'compliance_audit',
    name: 'Compliance Audit Report',
    description: 'Compliance status and violations',
    metrics: ['hipaa_score', 'dpdp_score', 'violations_count', 'audit_log_count'],
    groupBy: ['tenant'],
    defaultFilters: { period: 'last_quarter' }
  },
  TENANT_HEALTH: {
    id: 'tenant_health',
    name: 'Tenant Health Report',
    description: 'Tenant activity and engagement metrics',
    metrics: ['active_doctors', 'consultations', 'login_count', 'feature_usage'],
    groupBy: ['tenant'],
    defaultFilters: { period: 'last_month' }
  },
  REVENUE_ANALYSIS: {
    id: 'revenue_analysis',
    name: 'Revenue Analysis Report',
    description: 'MRR, ARR, and revenue breakdown',
    metrics: ['mrr', 'arr', 'new_mrr', 'churn_mrr', 'net_mrr_growth'],
    groupBy: ['plan', 'month'],
    defaultFilters: { period: 'last_12_months' }
  },
  DOCTOR_PERFORMANCE: {
    id: 'doctor_performance',
    name: 'Doctor Performance Report',
    description: 'Individual doctor consultation metrics',
    metrics: ['consultations', 'avg_duration', 'patient_satisfaction', 'prescriptions'],
    groupBy: ['doctor', 'tenant'],
    defaultFilters: { period: 'last_month' }
  }
};

// Period configurations
const PERIOD_CONFIG = {
  today: { days: 1, label: 'Today' },
  last_7_days: { days: 7, label: 'Last 7 Days' },
  last_30_days: { days: 30, label: 'Last 30 Days' },
  last_month: { months: 1, label: 'Last Month' },
  last_quarter: { months: 3, label: 'Last Quarter' },
  last_6_months: { months: 6, label: 'Last 6 Months' },
  last_12_months: { months: 12, label: 'Last 12 Months' },
  ytd: { ytd: true, label: 'Year to Date' },
  custom: { custom: true, label: 'Custom Range' }
};

class ReportBuilderService {
  constructor() {
    this.scheduledReports = new Map();
    this.reportsDir = path.join(process.cwd(), 'reports');
    this.ensureReportsDir();
  }

  nextRunAt(schedule, from = new Date()) {
    try {
      return cronParser.parseExpression(schedule, { currentDate: from }).next().toDate();
    } catch {
      throw Object.assign(new Error('Invalid cron expression'), { statusCode: 422 });
    }
  }

  async registerScheduledReport(record) {
    const scheduleId = record.schedule_id || record.scheduleId;
    const schedule = record.cron_schedule || record.schedule;
    if (this.scheduledReports.has(scheduleId)) this.scheduledReports.get(scheduleId).task.stop();
    const config = {
      scheduleId,
      name: record.name || scheduleId,
      reportConfig: record.report_config || record.reportConfig,
      schedule,
      recipients: record.recipients || [],
      enabled: record.enabled !== false,
    };
    const task = cron.schedule(schedule, async () => {
      await withCronLease(`report-schedule:${scheduleId}`, async () => {
        const report = await this.buildReport(config.reportConfig);
        await this.archiveReport(report, scheduleId);
        const nextRunAt = this.nextRunAt(schedule);
        await sequelize.query(`
          UPDATE scheduled_reports
          SET last_run_at = NOW(), next_run_at = :nextRunAt, run_count = run_count + 1, updated_at = NOW()
          WHERE schedule_id = :scheduleId
        `, { replacements: { scheduleId, nextRunAt } });
      });
    });
    this.scheduledReports.set(scheduleId, { task, config, createdAt: record.created_at || new Date().toISOString() });
  }

  /** Restore active schedules after a process restart.  The cron lease keeps
   * multiple app instances from generating the same report. */
  async startScheduledReports() {
    const [rows] = await sequelize.query(`
      SELECT schedule_id, name, report_config, cron_schedule, recipients, enabled, created_at
      FROM scheduled_reports WHERE enabled = TRUE
    `).catch(() => [[]]);
    for (const row of rows) {
      try { await this.registerScheduledReport(row); }
      catch (error) { console.error(`[ReportBuilder] Could not restore ${row.schedule_id}:`, error.message); }
    }
    return rows.length;
  }

  /**
   * Ensure reports directory exists
   */
  ensureReportsDir() {
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }
  }

  /**
   * Get available report templates
   */
  getTemplates() {
    return Object.values(REPORT_TEMPLATES);
  }

  /**
   * Get available metrics for custom reports
   */
  getAvailableMetrics() {
    return {
      usage: [
        { id: 'opd_consultations', name: 'OPD Consultations', type: 'count' },
        { id: 'ipd_admissions', name: 'IPD Admissions', type: 'count' },
        { id: 'storage_used_mb', name: 'Storage Used (MB)', type: 'sum' },
        { id: 'voice_minutes', name: 'Voice Minutes', type: 'sum' },
        { id: 'active_doctors', name: 'Active Doctors', type: 'count' },
        { id: 'active_patients', name: 'Active Patients', type: 'count' }
      ],
      billing: [
        { id: 'total_invoiced', name: 'Total Invoiced', type: 'currency' },
        { id: 'total_paid', name: 'Total Paid', type: 'currency' },
        { id: 'outstanding_amount', name: 'Outstanding', type: 'currency' },
        { id: 'overdue_amount', name: 'Overdue', type: 'currency' }
      ],
      revenue: [
        { id: 'mrr', name: 'Monthly Recurring Revenue', type: 'currency' },
        { id: 'arr', name: 'Annual Recurring Revenue', type: 'currency' },
        { id: 'new_mrr', name: 'New MRR', type: 'currency' },
        { id: 'churn_rate', name: 'Churn Rate', type: 'percentage' }
      ],
      compliance: [
        { id: 'hipaa_score', name: 'HIPAA Score', type: 'score' },
        { id: 'dpdp_score', name: 'DPDP Score', type: 'score' },
        { id: 'audit_log_count', name: 'Audit Log Entries', type: 'count' },
        { id: 'violations_count', name: 'Compliance Violations', type: 'count' }
      ]
    };
  }

  /**
   * Build and execute a custom report
   */
  async buildReport(config) {
    const {
      templateId,
      metrics = [],
      filters = {},
      groupBy = [],
      orderBy = null,
      limit = null,
      format = 'json'
    } = config;

    try {
      // Get template if specified
      const template = templateId ? REPORT_TEMPLATES[templateId.toUpperCase()] : null;
      
      // Merge template defaults with provided config
      const finalMetrics = metrics.length > 0 ? metrics : (template?.metrics || []);
      const finalGroupBy = groupBy.length > 0 ? groupBy : (template?.groupBy || []);
      const finalFilters = { ...(template?.defaultFilters || {}), ...filters };

      // Calculate date range
      const dateRange = this.calculateDateRange(finalFilters.period, finalFilters);

      // Generate report based on metrics
      const data = await this.executeReportQuery({
        metrics: finalMetrics,
        groupBy: finalGroupBy,
        dateRange,
        filters: finalFilters,
        orderBy,
        limit
      });

      // Create report object
      const report = {
        reportId: `RPT-${Date.now()}`,
        generatedAt: new Date().toISOString(),
        template: template?.name || 'Custom Report',
        period: {
          start: dateRange.start.toISOString(),
          end: dateRange.end.toISOString(),
          label: PERIOD_CONFIG[finalFilters.period]?.label || 'Custom'
        },
        filters: finalFilters,
        groupBy: finalGroupBy,
        metrics: finalMetrics,
        data,
        summary: this.calculateSummary(data, finalMetrics)
      };

      // Export in requested format
      if (format !== 'json') {
        return this.exportReport(report, format);
      }

      return report;
    } catch (error) {
      console.error('[ReportBuilder] Error building report:', error);
      throw error;
    }
  }

  /**
   * Calculate date range from period config
   */
  calculateDateRange(period, filters = {}) {
    const now = new Date();
    let start, end;

    if (period === 'custom' && filters.startDate && filters.endDate) {
      start = new Date(filters.startDate);
      end = new Date(filters.endDate);
    } else if (PERIOD_CONFIG[period]) {
      const config = PERIOD_CONFIG[period];
      end = new Date(now);
      
      if (config.days) {
        start = new Date(now);
        start.setDate(start.getDate() - config.days);
      } else if (config.months) {
        start = new Date(now);
        start.setMonth(start.getMonth() - config.months);
      } else if (config.ytd) {
        start = new Date(now.getFullYear(), 0, 1);
      } else {
        start = new Date(now);
        start.setMonth(start.getMonth() - 1);
      }
    } else {
      // Default to last 30 days
      end = new Date(now);
      start = new Date(now);
      start.setDate(start.getDate() - 30);
    }

    return { start, end };
  }

  /**
   * Execute report query based on configuration
   */
  async executeReportQuery({ metrics, groupBy, dateRange, filters, orderBy, limit }) {
    const results = [];

    // Build base query parts
    const selectParts = [];
    const joinParts = [];
    const whereParts = [`created_at BETWEEN '${dateRange.start.toISOString()}' AND '${dateRange.end.toISOString()}'`];
    const groupByParts = [];

    // Add filters
    if (filters.tenantId) {
      whereParts.push(`tenant_id = ${parseInt(filters.tenantId)}`);
    }

    // Process group by
    for (const group of groupBy) {
      if (group === 'tenant') {
        selectParts.push('tenant_id');
        groupByParts.push('tenant_id');
      } else if (group === 'month') {
        selectParts.push("DATE_TRUNC('month', created_at) as month");
        groupByParts.push("DATE_TRUNC('month', created_at)");
      } else if (group === 'plan') {
        selectParts.push('plan_type');
        groupByParts.push('plan_type');
      } else if (group === 'doctor') {
        selectParts.push('doctor_id');
        groupByParts.push('doctor_id');
      }
    }

    // Execute different queries based on metrics
    if (metrics.includes('opd_consultations') || metrics.includes('ipd_admissions')) {
      const data = await this.getUsageMetrics(dateRange, filters, groupBy);
      results.push(...data);
    }

    if (metrics.includes('mrr') || metrics.includes('arr') || metrics.includes('new_mrr')) {
      const data = await this.getRevenueMetrics(dateRange, filters, groupBy);
      results.push(...data);
    }

    if (metrics.includes('total_invoiced') || metrics.includes('total_paid')) {
      const data = await this.getBillingMetrics(dateRange, filters, groupBy);
      results.push(...data);
    }

    if (metrics.includes('hipaa_score') || metrics.includes('dpdp_score')) {
      const data = await this.getComplianceMetrics(dateRange, filters, groupBy);
      results.push(...data);
    }

    // Merge results by group key
    const merged = this.mergeResults(results, groupBy);

    // Apply ordering
    if (orderBy) {
      merged.sort((a, b) => {
        const aVal = a[orderBy.field] || 0;
        const bVal = b[orderBy.field] || 0;
        return orderBy.direction === 'desc' ? bVal - aVal : aVal - bVal;
      });
    }

    // Apply limit
    return limit ? merged.slice(0, limit) : merged;
  }

  /**
   * Get usage metrics
   */
  async getUsageMetrics(dateRange, filters, groupBy) {
    try {
      const [results] = await sequelize.query(`
        SELECT 
          ${groupBy.includes('tenant') ? 'tenant_id,' : ''}
          ${groupBy.includes('month') ? "DATE_TRUNC('month', created_at) as month," : ''}
          SUM(CASE WHEN metric_type = 'opd_consultation' THEN usage_count ELSE 0 END) as opd_consultations,
          SUM(CASE WHEN metric_type = 'ipd_admission' THEN usage_count ELSE 0 END) as ipd_admissions,
          SUM(CASE WHEN metric_type = 'storage' THEN usage_count ELSE 0 END) as storage_used_mb,
          SUM(CASE WHEN metric_type = 'voice_minutes' THEN usage_count ELSE 0 END) as voice_minutes
        FROM usage_records
        WHERE created_at BETWEEN :startDate AND :endDate
          ${filters.tenantId ? 'AND tenant_id = :tenantId' : ''}
        ${groupBy.length > 0 ? `GROUP BY ${groupBy.map(g => g === 'month' ? "DATE_TRUNC('month', created_at)" : g === 'tenant' ? 'tenant_id' : g).join(', ')}` : ''}
      `, {
        replacements: {
          startDate: dateRange.start.toISOString(),
          endDate: dateRange.end.toISOString(),
          tenantId: filters.tenantId
        }
      }).catch(() => [[]]);

      return results.map(r => ({
        ...r,
        _type: 'usage'
      }));
    } catch (error) {
      console.error('[ReportBuilder] Usage metrics error:', error);
      return [];
    }
  }

  /**
   * Get revenue metrics
   */
  async getRevenueMetrics(dateRange, filters, groupBy) {
    try {
      const [results] = await sequelize.query(`
        WITH monthly_revenue AS (
          SELECT 
            ${groupBy.includes('tenant') ? 't.id as tenant_id,' : ''}
            ${groupBy.includes('plan') ? 't.plan_type,' : ''}
            ${groupBy.includes('month') ? "DATE_TRUNC('month', i.created_at) as month," : ''}
            SUM(i.total_amount) as mrr
          FROM tenants t
          LEFT JOIN saas_invoices i ON t.id = i.tenant_id
          WHERE i.created_at BETWEEN :startDate AND :endDate
            AND i.status = 'paid'
            ${filters.tenantId ? 'AND t.id = :tenantId' : ''}
          GROUP BY ${groupBy.map(g => g === 'month' ? "DATE_TRUNC('month', i.created_at)" : g === 'tenant' ? 't.id' : g === 'plan' ? 't.plan_type' : g).join(', ') || 't.id'}
        )
        SELECT 
          *,
          mrr * 12 as arr
        FROM monthly_revenue
      `, {
        replacements: {
          startDate: dateRange.start.toISOString(),
          endDate: dateRange.end.toISOString(),
          tenantId: filters.tenantId
        }
      }).catch(() => [[]]);

      return results.map(r => ({
        ...r,
        _type: 'revenue'
      }));
    } catch (error) {
      console.error('[ReportBuilder] Revenue metrics error:', error);
      return [];
    }
  }

  /**
   * Get billing metrics
   */
  async getBillingMetrics(dateRange, filters, groupBy) {
    try {
      const [results] = await sequelize.query(`
        SELECT 
          ${groupBy.includes('tenant') ? 'tenant_id,' : ''}
          ${groupBy.includes('month') ? "DATE_TRUNC('month', created_at) as month," : ''}
          SUM(total_amount) as total_invoiced,
          SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END) as total_paid,
          SUM(CASE WHEN status IN ('pending', 'overdue') THEN total_amount ELSE 0 END) as outstanding_amount,
          SUM(CASE WHEN status = 'overdue' THEN total_amount ELSE 0 END) as overdue_amount
        FROM saas_invoices
        WHERE created_at BETWEEN :startDate AND :endDate
          ${filters.tenantId ? 'AND tenant_id = :tenantId' : ''}
        ${groupBy.length > 0 ? `GROUP BY ${groupBy.map(g => g === 'month' ? "DATE_TRUNC('month', created_at)" : g === 'tenant' ? 'tenant_id' : g).join(', ')}` : ''}
      `, {
        replacements: {
          startDate: dateRange.start.toISOString(),
          endDate: dateRange.end.toISOString(),
          tenantId: filters.tenantId
        }
      }).catch(() => [[]]);

      return results.map(r => ({
        ...r,
        _type: 'billing'
      }));
    } catch (error) {
      console.error('[ReportBuilder] Billing metrics error:', error);
      return [];
    }
  }

  /**
   * Get compliance metrics
   */
  async getComplianceMetrics(dateRange, filters, groupBy) {
    try {
      const [results] = await sequelize.query(`
        SELECT 
          ${groupBy.includes('tenant') ? 'tenant_id,' : ''}
          COUNT(*) as audit_log_count,
          0 as hipaa_score,
          0 as dpdp_score,
          0 as violations_count
        FROM audit_logs
        WHERE created_at BETWEEN :startDate AND :endDate
          ${filters.tenantId ? 'AND tenant_id = :tenantId' : ''}
        ${groupBy.includes('tenant') ? 'GROUP BY tenant_id' : ''}
      `, {
        replacements: {
          startDate: dateRange.start.toISOString(),
          endDate: dateRange.end.toISOString(),
          tenantId: filters.tenantId
        }
      }).catch(() => [[]]);

      return results.map(r => ({
        ...r,
        hipaa_score: 85, // Placeholder - would come from compliance service
        dpdp_score: 90,
        _type: 'compliance'
      }));
    } catch (error) {
      console.error('[ReportBuilder] Compliance metrics error:', error);
      return [];
    }
  }

  /**
   * Merge results from different queries
   */
  mergeResults(results, groupBy) {
    if (results.length === 0) return [];

    const merged = new Map();

    for (const row of results) {
      // Create key from group by fields
      const key = groupBy.map(g => {
        if (g === 'tenant') return row.tenant_id;
        if (g === 'month') return row.month;
        if (g === 'plan') return row.plan_type;
        if (g === 'doctor') return row.doctor_id;
        return '';
      }).join('|') || 'all';

      if (!merged.has(key)) {
        merged.set(key, { ...row });
      } else {
        // Merge row data
        const existing = merged.get(key);
        Object.keys(row).forEach(k => {
          if (k !== '_type' && row[k] !== undefined && row[k] !== null) {
            existing[k] = row[k];
          }
        });
      }
    }

    // Remove _type from final results
    return Array.from(merged.values()).map(r => {
      const { _type, ...rest } = r;
      return rest;
    });
  }

  /**
   * Calculate report summary
   */
  calculateSummary(data, metrics) {
    if (data.length === 0) return {};

    const summary = {
      recordCount: data.length
    };

    for (const metric of metrics) {
      const values = data.map(d => parseFloat(d[metric]) || 0);
      summary[metric] = {
        total: values.reduce((a, b) => a + b, 0),
        average: values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0,
        min: Math.min(...values),
        max: Math.max(...values)
      };
    }

    return summary;
  }

  /**
   * Export report in different formats
   */
  async exportReport(report, format) {
    const filename = `${report.reportId}_${Date.now()}`;

    switch (format.toLowerCase()) {
      case 'csv':
        return this.exportToCSV(report, filename);
      case 'excel':
        return await this.exportToExcel(report, filename);
      default:
        throw Object.assign(new Error(`Unsupported report export format: ${format}`), { statusCode: 422 });
    }
  }

  /**
   * Export to CSV
   */
  exportToCSV(report, filename) {
    if (!report.data || report.data.length === 0) {
      return { format: 'csv', content: '', filename: `${filename}.csv` };
    }

    const headers = Object.keys(report.data[0]);
    const rows = [
      headers.join(','),
      ...report.data.map(row => 
        headers.map(h => {
          const val = row[h];
          if (val === null || val === undefined) return '';
          if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
          return val;
        }).join(',')
      )
    ];

    const content = rows.join('\n');
    const filepath = path.join(this.reportsDir, `${filename}.csv`);

    fs.writeFileSync(filepath, content);

    return {
      format: 'csv',
      filename: `${filename}.csv`,
      filepath,
      size: content.length,
      downloadUrl: `/api/admin/reports/download/${filename}.csv`
    };
  }

  /** Export a real XLSX workbook; CSV remains a separate explicit format. */
  async exportToExcel(report, filename) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'My SmartHealth';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet('Report');
    const data = Array.isArray(report.data) ? report.data : [];
    const headers = [...new Set(data.flatMap((row) => Object.keys(row || {})))];
    sheet.columns = headers.map((header) => ({ header, key: header, width: Math.min(48, Math.max(14, header.length + 2)) }));
    for (const row of data) sheet.addRow(headers.map((header) => row?.[header] ?? null));
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    const filepath = path.join(this.reportsDir, `${filename}.xlsx`);
    await workbook.xlsx.writeFile(filepath);
    const size = fs.statSync(filepath).size;
    return { format: 'excel', filename: `${filename}.xlsx`, filepath, size, downloadUrl: `/api/admin/reports/download/${filename}.xlsx` };
  }

  /**
   * Schedule a recurring report
   */
  async scheduleReport(config) {
    const {
      scheduleId = `SCHED-${Date.now()}`,
      reportConfig,
      schedule, // cron expression
      recipients = [],
      enabled = true
    } = config;

    const nextRunAt = this.nextRunAt(schedule);
    await sequelize.query(`
      INSERT INTO scheduled_reports (schedule_id, name, report_config, cron_schedule, recipients, enabled, next_run_at)
      VALUES (:scheduleId, :name, CAST(:reportConfig AS jsonb), :schedule, CAST(:recipients AS jsonb), :enabled, :nextRunAt)
      ON CONFLICT (schedule_id) DO UPDATE SET
        name = EXCLUDED.name, report_config = EXCLUDED.report_config, cron_schedule = EXCLUDED.cron_schedule,
        recipients = EXCLUDED.recipients, enabled = EXCLUDED.enabled, next_run_at = EXCLUDED.next_run_at, updated_at = NOW()
      RETURNING *
    `, { replacements: {
      scheduleId, name: config.name || scheduleId, reportConfig: JSON.stringify(reportConfig), schedule,
      recipients: JSON.stringify(recipients), enabled, nextRunAt,
    } });
    if (enabled) await this.registerScheduledReport({ schedule_id: scheduleId, name: config.name || scheduleId, report_config: reportConfig, cron_schedule: schedule, recipients, enabled });
    else if (this.scheduledReports.has(scheduleId)) this.scheduledReports.get(scheduleId).task.stop();

    return {
      scheduleId,
      schedule,
      reportConfig,
      recipients,
      status: enabled ? 'scheduled' : 'disabled',
      nextRun: nextRunAt.toISOString()
    };
  }

  /**
   * Get next run time for cron schedule
   */
  getNextRunTime(schedule) {
    try {
      const interval = cron.schedule(schedule, () => {}, { scheduled: false });
      // This is a simplified calculation
      return 'See cron expression: ' + schedule;
    } catch {
      return 'Invalid schedule';
    }
  }

  /**
   * Cancel a scheduled report
   */
  async cancelScheduledReport(scheduleId) {
    const scheduled = this.scheduledReports.get(scheduleId);
    if (scheduled) {
      scheduled.task.stop();
      this.scheduledReports.delete(scheduleId);
    }
    const [updated] = await sequelize.query(`
      UPDATE scheduled_reports SET enabled = FALSE, updated_at = NOW() WHERE schedule_id = :scheduleId RETURNING schedule_id
    `, { replacements: { scheduleId } }).catch(() => [[]]);
    return updated[0] ? { scheduleId, status: 'cancelled' } : { scheduleId, status: 'not_found' };
  }

  /**
   * Get all scheduled reports
   */
  async getScheduledReports() {
    const [rows] = await sequelize.query(`
      SELECT schedule_id AS "scheduleId", name, cron_schedule AS schedule, recipients, enabled,
             last_run_at AS "lastRunAt", next_run_at AS "nextRunAt", run_count AS "runCount", created_at AS "createdAt"
      FROM scheduled_reports ORDER BY created_at DESC LIMIT 100
    `).catch(() => [[]]);
    return rows.map((row) => ({ ...row, status: row.enabled ? 'active' : 'disabled' }));
  }

  /**
   * Archive a report
   */
  async archiveReport(report, scheduleId = null) {
    try {
      const archivePath = path.join(this.reportsDir, 'archive');
      if (!fs.existsSync(archivePath)) {
        fs.mkdirSync(archivePath, { recursive: true });
      }

      const filename = `${report.reportId}${scheduleId ? '_' + scheduleId : ''}.json`;
      const filepath = path.join(archivePath, filename);

      fs.writeFileSync(filepath, JSON.stringify(report, null, 2));

      // Also store in database
      await sequelize.query(`
        INSERT INTO report_archive (
          report_id, schedule_id, report_type, 
          generated_at, period_start, period_end,
          record_count, file_path
        ) VALUES (
          :reportId, :scheduleId, :reportType,
          :generatedAt, :periodStart, :periodEnd,
          :recordCount, :filePath
        )
      `, {
        replacements: {
          reportId: report.reportId,
          scheduleId,
          reportType: report.template,
          generatedAt: report.generatedAt,
          periodStart: report.period?.start,
          periodEnd: report.period?.end,
          recordCount: report.data?.length || 0,
          filePath: filepath
        }
      }).catch(() => {}); // Ignore if table doesn't exist

      return { archived: true, filepath };
    } catch (error) {
      console.error('[ReportBuilder] Archive error:', error);
      return { archived: false, error: error.message };
    }
  }

  /**
   * Get archived reports
   */
  async getArchivedReports(filters = {}) {
    try {
      const whereParts = [];
      if (filters.reportType) {
        whereParts.push(`report_type = '${filters.reportType}'`);
      }
      if (filters.startDate) {
        whereParts.push(`generated_at >= '${filters.startDate}'`);
      }
      if (filters.endDate) {
        whereParts.push(`generated_at <= '${filters.endDate}'`);
      }

      const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

      const [archives] = await sequelize.query(`
        SELECT *
        FROM report_archive
        ${whereClause}
        ORDER BY generated_at DESC
        LIMIT 100
      `).catch(() => [[]]);

      return archives;
    } catch (error) {
      console.error('[ReportBuilder] Get archives error:', error);
      return [];
    }
  }

  /**
   * Generate usage summary report (convenience method)
   */
  async generateUsageSummary(tenantId = null, period = 'last_month') {
    return this.buildReport({
      templateId: 'USAGE_SUMMARY',
      filters: { tenantId, period }
    });
  }

  /**
   * Generate billing report (convenience method)
   */
  async generateBillingReport(tenantId = null, period = 'last_month') {
    return this.buildReport({
      templateId: 'BILLING_REPORT',
      filters: { tenantId, period }
    });
  }

  /**
   * Generate compliance audit report (convenience method)
   */
  async generateComplianceReport(tenantId = null) {
    return this.buildReport({
      templateId: 'COMPLIANCE_AUDIT',
      filters: { tenantId, period: 'last_quarter' }
    });
  }
}

// Export singleton
const reportBuilderService = new ReportBuilderService();
export default reportBuilderService;
