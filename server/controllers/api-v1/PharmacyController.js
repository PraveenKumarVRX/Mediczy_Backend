import pharmacyService from '../../services/api-v1/PharmacyService.js';
import { asyncHandler } from '../../middleware/errorHandler.js';

/**
 * Create a new prescription
 */
export const createPrescription = asyncHandler(async (req, res) => {
  const prescription = await pharmacyService.createPrescription(req.tenantId, req.body);
  res.status(201).json(prescription);
});

/**
 * Create a new pharmacy order
 */
export const createOrder = asyncHandler(async (req, res) => {
  const order = await pharmacyService.createOrder(req.tenantId, req.body);
  res.status(201).json(order);
});

/**
 * Get a specific pharmacy order
 */
export const getOrder = asyncHandler(async (req, res) => {
  const order = await pharmacyService.getOrder(req.tenantId, req.params.orderId);
  res.json(order);
});

/**
 * List all pharmacy orders for a user
 */
export const listOrders = asyncHandler(async (req, res) => {
  const { userId } = req.query;
  const options = {
    page: parseInt(req.query.page) || 1,
    limit: parseInt(req.query.limit) || 20,
    sortBy: req.query.sortBy || 'created_at',
    sortOrder: req.query.sortOrder || 'DESC'
  };
  
  const result = await pharmacyService.listOrders(req.tenantId, userId, options);
  res.json(result);
});

/**
 * Update pharmacy order status
 */
export const updateOrderStatus = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { status } = req.body;
  
  const order = await pharmacyService.updateOrderStatus(req.tenantId, orderId, status);
  res.json(order);
});
