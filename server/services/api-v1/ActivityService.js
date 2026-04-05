/**
 * Activity Service - Mediqzy API v1
 * Handles heart rate, BMI, calories, distance, sleep data
 * Supports daily / weekly / monthly aggregations
 */

import BaseService from '../BaseService.js';
import { ErrorTypes } from '../../middleware/errorHandler.js';

const VALID_METRICS = ['heart_rate', 'bmi', 'calories', 'distance', 'sleep'];

const METRIC_UNITS = {
  heart_rate: 'bpm',
  bmi: 'kg/m2',
  calories: 'kcal',
  distance: 'km',
  sleep: 'hours'
};

class ActivityService extends BaseService {
  constructor() {
    super('api_activity_logs');
  }

  // -------------------------------------------------------
  // Log a data point
  // -------------------------------------------------------
  async logActivity(tenantId, userId, data) {
    const { metric_type, value, recorded_at, source = 'manual', metadata = {}, notes } = data;

    if (!VALID_METRICS.includes(metric_type)) {
      throw ErrorTypes.BadRequest(`metric_type must be one of: ${VALID_METRICS.join(', ')}`);
    }

    const activityId = this.generateId('act');
    const ts = recorded_at ? new Date(recorded_at) : new Date();
    const date = ts.toISOString().split('T')[0]; // YYYY-MM-DD
    const unit = data.unit || METRIC_UNITS[metric_type];

    const result = await this.query(
      `INSERT INTO api_activity_logs
         (activity_id, tenant_id, user_id, metric_type, value, unit,
          recorded_at, date, source, metadata, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [activityId, tenantId, userId, metric_type, value, unit,
       ts, date, source, JSON.stringify(metadata), notes || null]
    );

    return result.rows[0];
  }

  // -------------------------------------------------------
  // Log multiple data points in one call (batch)
  // -------------------------------------------------------
  async logBatch(tenantId, userId, entries) {
    const results = [];
    for (const entry of entries) {
      results.push(await this.logActivity(tenantId, userId, entry));
    }
    return results;
  }

  // -------------------------------------------------------
  // Fetch raw data for a single metric over a date range
  // -------------------------------------------------------
  async getMetricData(tenantId, userId, metricType, { period = 'daily', date, startDate, endDate } = {}) {
    if (!VALID_METRICS.includes(metricType)) {
      throw ErrorTypes.BadRequest(`Invalid metric: ${metricType}`);
    }

    const { start, end } = this._resolveDateRange(period, date, startDate, endDate);

    const result = await this.query(
      `SELECT activity_id, metric_type, value, unit, recorded_at, date, source, metadata, notes
       FROM api_activity_logs
       WHERE tenant_id = $1
         AND user_id   = $2
         AND metric_type = $3
         AND date BETWEEN $4 AND $5
         AND deleted_at IS NULL
       ORDER BY recorded_at ASC`,
      [tenantId, userId, metricType, start, end]
    );

    const rows = result.rows;
    const aggregated = this._aggregate(rows, period, metricType);

    return {
      metric: metricType,
      unit: METRIC_UNITS[metricType],
      period,
      start_date: start,
      end_date: end,
      data_points: rows,
      summary: aggregated
    };
  }

  // -------------------------------------------------------
  // Multi-metric dashboard summary
  // -------------------------------------------------------
  async getDashboard(tenantId, userId, { period = 'daily', date, startDate, endDate } = {}) {
    const { start, end } = this._resolveDateRange(period, date, startDate, endDate);

    const result = await this.query(
      `SELECT metric_type, value, unit, recorded_at, date, source, metadata
       FROM api_activity_logs
       WHERE tenant_id = $1
         AND user_id   = $2
         AND metric_type = ANY($3)
         AND date BETWEEN $4 AND $5
         AND deleted_at IS NULL
       ORDER BY metric_type, recorded_at ASC`,
      [tenantId, userId, VALID_METRICS, start, end]
    );

    const byMetric = {};
    for (const metric of VALID_METRICS) {
      byMetric[metric] = [];
    }
    for (const row of result.rows) {
      byMetric[row.metric_type].push(row);
    }

    const summary = {};
    for (const metric of VALID_METRICS) {
      summary[metric] = {
        unit: METRIC_UNITS[metric],
        ...this._aggregate(byMetric[metric], period, metric)
      };
    }

    return {
      period,
      start_date: start,
      end_date: end,
      metrics: summary
    };
  }

  // -------------------------------------------------------
  // Update a single log entry
  // -------------------------------------------------------
  async updateActivity(tenantId, userId, activityId, data) {
    const row = await this.query(
      `SELECT * FROM api_activity_logs
       WHERE activity_id = $1 AND tenant_id = $2 AND user_id = $3 AND deleted_at IS NULL`,
      [activityId, tenantId, userId]
    );
    if (row.rows.length === 0) {
      throw ErrorTypes.NotFound('Activity log entry');
    }

    const allowed = ['value', 'unit', 'recorded_at', 'source', 'metadata', 'notes'];
    const updates = {};
    for (const k of allowed) {
      if (data[k] !== undefined) updates[k] = data[k];
    }
    if (data.recorded_at) {
      updates.date = new Date(data.recorded_at).toISOString().split('T')[0];
    }

    if (Object.keys(updates).length === 0) {
      return row.rows[0];
    }

    const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 4}`).join(', ');
    const values = Object.values(updates);

    const updated = await this.query(
      `UPDATE api_activity_logs
       SET ${setClauses}, updated_at = CURRENT_TIMESTAMP
       WHERE activity_id = $1 AND tenant_id = $2 AND user_id = $3 AND deleted_at IS NULL
       RETURNING *`,
      [activityId, tenantId, userId, ...values]
    );
    return updated.rows[0];
  }

  // -------------------------------------------------------
  // Soft-delete a log entry
  // -------------------------------------------------------
  async deleteActivity(tenantId, userId, activityId) {
    const result = await this.query(
      `UPDATE api_activity_logs
       SET deleted_at = CURRENT_TIMESTAMP
       WHERE activity_id = $1 AND tenant_id = $2 AND user_id = $3 AND deleted_at IS NULL
       RETURNING activity_id`,
      [activityId, tenantId, userId]
    );
    if (result.rows.length === 0) {
      throw ErrorTypes.NotFound('Activity log entry');
    }
    return { deleted: true, activity_id: activityId };
  }

  // -------------------------------------------------------
  // Internal: resolve date range from period / explicit dates
  // -------------------------------------------------------
  _resolveDateRange(period, date, startDate, endDate) {
    if (startDate && endDate) {
      return { start: startDate, end: endDate };
    }

    const ref = date ? new Date(date) : new Date();
    ref.setHours(0, 0, 0, 0);

    let start, end;

    switch (period) {
      case 'daily': {
        start = ref.toISOString().split('T')[0];
        end = start;
        break;
      }
      case 'weekly': {
        // Monday of the week containing ref
        const day = ref.getDay(); // 0=Sun
        const diff = (day === 0 ? -6 : 1 - day);
        const mon = new Date(ref);
        mon.setDate(ref.getDate() + diff);
        const sun = new Date(mon);
        sun.setDate(mon.getDate() + 6);
        start = mon.toISOString().split('T')[0];
        end = sun.toISOString().split('T')[0];
        break;
      }
      case 'monthly': {
        const y = ref.getFullYear();
        const m = String(ref.getMonth() + 1).padStart(2, '0');
        const lastDay = new Date(y, ref.getMonth() + 1, 0).getDate();
        start = `${y}-${m}-01`;
        end = `${y}-${m}-${lastDay}`;
        break;
      }
      default:
        throw ErrorTypes.BadRequest('period must be daily, weekly, or monthly');
    }

    return { start, end };
  }

  // -------------------------------------------------------
  // Internal: aggregate rows into min/max/avg/total/count
  // -------------------------------------------------------
  _aggregate(rows, period, metricType) {
    if (rows.length === 0) {
      return { count: 0, min: null, max: null, avg: null, total: null, latest: null };
    }

    const values = rows.map(r => parseFloat(r.value));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = parseFloat((values.reduce((a, b) => a + b, 0) / values.length).toFixed(4));
    const total = parseFloat(values.reduce((a, b) => a + b, 0).toFixed(4));
    const latest = rows[rows.length - 1].value;

    // For certain metrics, "total" is more meaningful than avg
    const useTotalMetrics = ['calories', 'distance'];
    const primaryValue = useTotalMetrics.includes(metricType) ? total : avg;

    return {
      count: rows.length,
      min,
      max,
      avg,
      total,
      latest: parseFloat(latest),
      primary_value: primaryValue,
      // Daily breakdown if period is weekly or monthly
      daily_breakdown: (period !== 'daily') ? this._dailyBreakdown(rows) : undefined
    };
  }

  // -------------------------------------------------------
  // Internal: group by date for multi-day periods
  // -------------------------------------------------------
  _dailyBreakdown(rows) {
    const map = {};
    for (const row of rows) {
      const d = row.date;
      if (!map[d]) map[d] = [];
      map[d].push(parseFloat(row.value));
    }
    return Object.entries(map).map(([date, vals]) => ({
      date,
      count: vals.length,
      avg: parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(4)),
      min: Math.min(...vals),
      max: Math.max(...vals),
      total: parseFloat(vals.reduce((a, b) => a + b, 0).toFixed(4))
    })).sort((a, b) => a.date.localeCompare(b.date));
  }
}

export default new ActivityService();
