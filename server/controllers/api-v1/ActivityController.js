/**
 * Activity Controller - Mediqzy API v1
 * Handles heart rate, BMI, calories, distance, sleep endpoints
 */

import activityService from '../../services/api-v1/ActivityService.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { ErrorTypes } from '../../middleware/errorHandler.js';

// Helper: extract period/date query params
const extractPeriodParams = (query) => ({
  period: query.period || 'daily',
  date: query.date || null,
  startDate: query.start_date || null,
  endDate: query.end_date || null
});

/**
 * POST /activity/log
 * Log a single activity data point
 */
export const logActivity = asyncHandler(async (req, res) => {
  const { user_id, ...data } = req.body;
  if (!user_id) throw ErrorTypes.BadRequest('user_id is required');

  const entry = await activityService.logActivity(req.tenantId, user_id, data);
  res.status(201).json(entry);
});

/**
 * POST /activity/log/batch
 * Log multiple data points at once
 */
export const logBatch = asyncHandler(async (req, res) => {
  const { user_id, entries } = req.body;
  if (!user_id) throw ErrorTypes.BadRequest('user_id is required');
  if (!Array.isArray(entries) || entries.length === 0) {
    throw ErrorTypes.BadRequest('entries must be a non-empty array');
  }
  if (entries.length > 200) {
    throw ErrorTypes.BadRequest('Maximum 200 entries per batch');
  }

  const results = await activityService.logBatch(req.tenantId, user_id, entries);
  res.status(201).json({ logged: results.length, entries: results });
});

/**
 * GET /activity/heart-rate
 * Get heart rate data for a period
 */
export const getHeartRate = asyncHandler(async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) throw ErrorTypes.BadRequest('user_id is required');

  const data = await activityService.getMetricData(
    req.tenantId, user_id, 'heart_rate', extractPeriodParams(req.query)
  );
  res.json(data);
});

/**
 * GET /activity/bmi
 * Get BMI data for a period
 */
export const getBmi = asyncHandler(async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) throw ErrorTypes.BadRequest('user_id is required');

  const data = await activityService.getMetricData(
    req.tenantId, user_id, 'bmi', extractPeriodParams(req.query)
  );
  res.json(data);
});

/**
 * GET /activity/calories
 * Get calories data for a period
 */
export const getCalories = asyncHandler(async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) throw ErrorTypes.BadRequest('user_id is required');

  const data = await activityService.getMetricData(
    req.tenantId, user_id, 'calories', extractPeriodParams(req.query)
  );
  res.json(data);
});

/**
 * GET /activity/distance
 * Get distance data for a period
 */
export const getDistance = asyncHandler(async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) throw ErrorTypes.BadRequest('user_id is required');

  const data = await activityService.getMetricData(
    req.tenantId, user_id, 'distance', extractPeriodParams(req.query)
  );
  res.json(data);
});

/**
 * GET /activity/sleep
 * Get sleep data for a period
 */
export const getSleep = asyncHandler(async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) throw ErrorTypes.BadRequest('user_id is required');

  const data = await activityService.getMetricData(
    req.tenantId, user_id, 'sleep', extractPeriodParams(req.query)
  );
  res.json(data);
});

/**
 * GET /activity/summary
 * Multi-metric dashboard — all 5 metrics in one call
 */
export const getSummary = asyncHandler(async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) throw ErrorTypes.BadRequest('user_id is required');

  const dashboard = await activityService.getDashboard(
    req.tenantId, user_id, extractPeriodParams(req.query)
  );
  res.json(dashboard);
});

/**
 * PUT /activity/:activityId
 * Update a log entry
 */
export const updateActivity = asyncHandler(async (req, res) => {
  const { activityId } = req.params;
  const { user_id, ...data } = req.body;
  if (!user_id) throw ErrorTypes.BadRequest('user_id is required');

  const updated = await activityService.updateActivity(req.tenantId, user_id, activityId, data);
  res.json(updated);
});

/**
 * DELETE /activity/:activityId
 * Soft-delete a log entry
 */
export const deleteActivity = asyncHandler(async (req, res) => {
  const { activityId } = req.params;
  const { user_id } = req.query;
  if (!user_id) throw ErrorTypes.BadRequest('user_id query param is required');

  const result = await activityService.deleteActivity(req.tenantId, user_id, activityId);
  res.json(result);
});
