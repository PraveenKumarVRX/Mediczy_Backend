import homecareService from '../../services/api-v1/HomecareService.js';
import { asyncHandler } from '../../middleware/errorHandler.js';

/**
 * Create a new homecare booking
 */
export const createBooking = asyncHandler(async (req, res) => {
  const booking = await homecareService.createBooking(req.tenantId, req.body);
  res.status(201).json(booking);
});

/**
 * Get a specific homecare booking
 */
export const getBooking = asyncHandler(async (req, res) => {
  const booking = await homecareService.getBooking(req.tenantId, req.params.bookingId);
  res.json(booking);
});

/**
 * List all homecare bookings for a user
 */
export const listBookings = asyncHandler(async (req, res) => {
  // Enforce ownership: only admins/doctors may query arbitrary users
  const PRIVILEGED_ROLES = ['admin', 'doctor', 'provider', 'team'];
  const resolvedUserId = PRIVILEGED_ROLES.includes(req.role)
    ? (req.query.userId || req.userId)
    : req.userId;
  const options = {
    page: parseInt(req.query.page) || 1,
    limit: parseInt(req.query.limit) || 20,
    sortBy: req.query.sortBy || 'created_at',
    sortOrder: req.query.sortOrder || 'DESC'
  };
  
  const result = await homecareService.listBookings(req.tenantId, resolvedUserId, options);
  res.json(result);
});

/**
 * Update a homecare booking
 */
export const updateBooking = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const booking = await homecareService.updateBooking(req.tenantId, bookingId, req.body);
  res.json(booking);
});

/**
 * Assign a professional to a booking
 */
export const assignProfessional = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const { professionalId, name, phone } = req.body;
  
  const booking = await homecareService.assignProfessional(
    req.tenantId,
    bookingId,
    professionalId,
    name,
    phone
  );
  res.json(booking);
});

/**
 * List available homecare services
 */
export const listServices = asyncHandler(async (req, res) => {
  const options = {
    category: req.query.category,
    page: parseInt(req.query.page) || 1,
    limit: parseInt(req.query.limit) || 20
  };
  
  const result = await homecareService.listServices(req.tenantId, options);
  res.json(result);
});
