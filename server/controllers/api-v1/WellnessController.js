import WellnessService from '../../services/api-v1/WellnessService.js';
import { asyncHandler } from '../../middleware/errorHandler.js';

const wellnessService = new WellnessService();

/**
 * Create a new health risk assessment
 */
export const createHRA = asyncHandler(async (req, res) => {
  const assessment = await wellnessService.createHRA(req.tenantId, req.body);
  res.status(201).json(assessment);
});

/**
 * Get a specific health risk assessment
 */
export const getHRA = asyncHandler(async (req, res) => {
  const assessment = await wellnessService.getHRA(req.tenantId, req.params.assessmentId);
  res.json(assessment);
});

/**
 * List all health risk assessments for a user
 */
export const listHRAs = asyncHandler(async (req, res) => {
  const { userId } = req.query;
  const options = {
    page: parseInt(req.query.page) || 1,
    limit: parseInt(req.query.limit) || 20,
    sortBy: req.query.sortBy || 'created_at',
    sortOrder: req.query.sortOrder || 'DESC'
  };
  
  const result = await wellnessService.listHRAs(req.tenantId, userId, options);
  res.json(result);
});

/**
 * List available wellness plans
 */
export const listWellnessPlans = asyncHandler(async (req, res) => {
  const options = {
    category: req.query.category,
    page: parseInt(req.query.page) || 1,
    limit: parseInt(req.query.limit) || 20
  };
  
  const result = await wellnessService.listWellnessPlans(req.tenantId, options);
  res.json(result);
});
