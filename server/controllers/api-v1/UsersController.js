import UsersService from '../../services/api-v1/UsersService.js';
import { asyncHandler } from '../../middleware/errorHandler.js';

const usersService = new UsersService();

/**
 * Create or update user profile
 * Upsert operation based on userId presence
 */
export const createOrUpdateUser = asyncHandler(async (req, res) => {
  if (req.body.user_id) {
    // Update existing user
    const user = await usersService.updateUser(req.tenantId, req.body.user_id, req.body);
    res.json(user);
  } else {
    // Create new user
    const user = await usersService.createUser(req.tenantId, req.body);
    res.status(201).json(user);
  }
});

/**
 * Get user profile (alias for getUserProfile)
 */
export const getUserProfile = asyncHandler(async (req, res) => {
  const user = await usersService.getUser(req.tenantId, req.params.userId);
  res.json(user);
});

/**
 * Update user profile (alias for updateUserProfile)
 */
export const updateUserProfile = asyncHandler(async (req, res) => {
  const user = await usersService.updateUser(req.tenantId, req.params.userId, req.body);
  res.json(user);
});

/**
 * Get health profile (alias for getMedicalHistory)
 */
export const getHealthProfile = asyncHandler(async (req, res) => {
  const history = await usersService.getMedicalHistory(req.tenantId, req.params.userId);
  res.json(history);
});

/**
 * Update health profile (alias for updateMedicalHistory)
 */
export const updateHealthProfile = asyncHandler(async (req, res) => {
  const user = await usersService.updateMedicalHistory(req.tenantId, req.params.userId, req.body);
  res.json(user);
});

/**
 * Create a new user
 */
export const createUser = asyncHandler(async (req, res) => {
  const user = await usersService.createUser(req.tenantId, req.body);
  res.status(201).json(user);
});

/**
 * Get a specific user profile
 */
export const getUser = asyncHandler(async (req, res) => {
  const user = await usersService.getUser(req.tenantId, req.params.userId);
  res.json(user);
});

/**
 * List users with filters
 */
export const listUsers = asyncHandler(async (req, res) => {
  const { isActive, search, abhaId } = req.query;
  const options = {
    isActive: isActive !== undefined ? isActive === 'true' : undefined,
    search,
    abhaId,
    page: parseInt(req.query.page) || 1,
    limit: parseInt(req.query.limit) || 20,
    sortBy: req.query.sortBy || 'created_at',
    sortOrder: req.query.sortOrder || 'DESC'
  };
  
  const result = await usersService.listUsers(req.tenantId, options);
  res.json(result);
});

/**
 * Update user profile
 */
export const updateUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const user = await usersService.updateUser(req.tenantId, userId, req.body);
  res.json(user);
});

/**
 * Update user's medical history
 */
export const updateMedicalHistory = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const user = await usersService.updateMedicalHistory(req.tenantId, userId, req.body);
  res.json(user);
});

/**
 * Get user's medical history
 */
export const getMedicalHistory = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const history = await usersService.getMedicalHistory(req.tenantId, userId);
  res.json(history);
});

/**
 * Link ABHA ID to user
 */
export const linkAbhaId = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { abhaId, phrAddress } = req.body;
  
  const user = await usersService.linkAbhaId(req.tenantId, userId, abhaId, phrAddress);
  res.json(user);
});

/**
 * Verify user email
 */
export const verifyEmail = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const user = await usersService.verifyEmail(req.tenantId, userId);
  res.json(user);
});

/**
 * Verify user phone
 */
export const verifyPhone = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const user = await usersService.verifyPhone(req.tenantId, userId);
  res.json(user);
});

/**
 * Deactivate user account
 */
export const deactivateUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const user = await usersService.deactivateUser(req.tenantId, userId);
  res.json(user);
});

/**
 * Reactivate user account
 */
export const reactivateUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const user = await usersService.reactivateUser(req.tenantId, userId);
  res.json(user);
});
