/**
 * Activity Monitor Routes - Mediqzy API v1
 * Created: April 4, 2026
 *
 * Endpoints:
 * POST   /v1/{tenant-id}/activity/log               Log a single data point
 * POST   /v1/{tenant-id}/activity/log/batch         Log multiple data points
 * GET    /v1/{tenant-id}/activity/summary            Multi-metric dashboard (all 5 metrics)
 * GET    /v1/{tenant-id}/activity/heart-rate         Heart rate data
 * GET    /v1/{tenant-id}/activity/bmi                BMI data
 * GET    /v1/{tenant-id}/activity/calories           Calories burned data
 * GET    /v1/{tenant-id}/activity/distance           Distance traveled data
 * GET    /v1/{tenant-id}/activity/sleep              Sleep data
 * PUT    /v1/{tenant-id}/activity/:activityId        Update a log entry
 * DELETE /v1/{tenant-id}/activity/:activityId        Delete a log entry
 *
 * Query params shared by GET metric endpoints:
 *   user_id   (required)
 *   period    daily | weekly | monthly  (default: daily)
 *   date      YYYY-MM-DD  reference date (defaults to today)
 *   start_date / end_date  override period with explicit range
 */

import express from 'express';
import { verifyToken, verifyTenant, requireScopes } from '../middleware/api-auth.js';
import { activityValidation, handleValidationErrors } from '../middleware/validation.js';
import * as activityController from '../controllers/api-v1/ActivityController.js';

const router = express.Router({ mergeParams: true });

// All routes require auth + tenant
router.use(verifyToken, verifyTenant);

// -------------------------------------------------------
// Write endpoints
// -------------------------------------------------------

/**
 * POST /activity/log
 * Log a single metric data point
 */
router.post('/log',
  requireScopes('activity.write'),
  activityValidation.logActivity,
  activityController.logActivity
);

/**
 * POST /activity/log/batch
 * Bulk-log up to 200 metric data points
 */
router.post('/log/batch',
  requireScopes('activity.write'),
  activityValidation.logBatch,
  activityController.logBatch
);

// -------------------------------------------------------
// Read endpoints
// -------------------------------------------------------

/**
 * GET /activity/summary
 * All-in-one dashboard: all 5 metrics in one response
 */
router.get('/summary',
  requireScopes('activity.read'),
  activityValidation.queryParams,
  activityController.getSummary
);

/**
 * GET /activity/heart-rate
 */
router.get('/heart-rate',
  requireScopes('activity.read'),
  activityValidation.queryParams,
  activityController.getHeartRate
);

/**
 * GET /activity/bmi
 */
router.get('/bmi',
  requireScopes('activity.read'),
  activityValidation.queryParams,
  activityController.getBmi
);

/**
 * GET /activity/calories
 */
router.get('/calories',
  requireScopes('activity.read'),
  activityValidation.queryParams,
  activityController.getCalories
);

/**
 * GET /activity/distance
 */
router.get('/distance',
  requireScopes('activity.read'),
  activityValidation.queryParams,
  activityController.getDistance
);

/**
 * GET /activity/sleep
 */
router.get('/sleep',
  requireScopes('activity.read'),
  activityValidation.queryParams,
  activityController.getSleep
);

// -------------------------------------------------------
// CRUD on individual log entries
// -------------------------------------------------------

/**
 * PUT /activity/:activityId
 */
router.put('/:activityId',
  requireScopes('activity.write'),
  activityController.updateActivity
);

/**
 * DELETE /activity/:activityId
 */
router.delete('/:activityId',
  requireScopes('activity.write'),
  activityController.deleteActivity
);

export default router;
