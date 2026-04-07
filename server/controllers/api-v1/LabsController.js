import labsService from '../../services/api-v1/LabsService.js';
import n8nService from '../../services/n8n.service.js';
import { User } from '../../models/index.js';
import { asyncHandler } from '../../middleware/errorHandler.js';

/**
 * Create a new lab booking
 */
export const createBooking = asyncHandler(async (req, res) => {
  const booking = await labsService.createBooking(req.tenantId, req.body);
  res.status(201).json(booking);
});

/**
 * Get a specific lab booking
 */
export const getBooking = asyncHandler(async (req, res) => {
  const booking = await labsService.getBooking(req.tenantId, req.params.bookingId);
  res.json(booking);
});

/**
 * List all lab bookings for a user
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
  
  const result = await labsService.listBookings(req.tenantId, resolvedUserId, options);
  res.json(result);
});

/**
 * Update lab booking status
 */
export const updateStatus = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const { status, notes } = req.body;
  
  const booking = await labsService.updateStatus(req.tenantId, bookingId, status, notes);
  res.json(booking);
});

/**
 * Upload lab report
 */
export const uploadReport = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const reportUrl = req.body.reportUrl || req.body.report_url;
  
  const booking = await labsService.uploadReport(req.tenantId, bookingId, reportUrl);

  // Notify via n8n (best-effort)
  try {
    let patientEmail;
    let patientPhone;

    if (booking?.user_id) {
      const patient = await User.findByPk(booking.user_id);
      patientEmail = patient?.email;
      patientPhone = patient?.phoneNumber || patient?.phone;
    }

    await n8nService.healthReportReady({
      reportId: booking?.report_id || null,
      bookingId: booking?.booking_id || bookingId,
      patientId: booking?.user_id,
      patientName: booking?.patient_name,
      patientEmail,
      patientPhone,
      reportUrl: booking?.report_url || reportUrl,
      tests: booking?.tests,
      source: 'labs-v1'
    });
  } catch (n8nError) {
    console.error('Failed to trigger n8n health report workflow:', n8nError);
  }

  res.json(booking);
});

/**
 * List available lab tests
 */
export const listTests = asyncHandler(async (req, res) => {
  const options = {
    category: req.query.category,
    search: req.query.search,
    page: parseInt(req.query.page) || 1,
    limit: parseInt(req.query.limit) || 20
  };
  
  const result = await labsService.listTests(req.tenantId, options);
  res.json(result);
});

/**
 * GET /labs/tests/:testId
 * Get a single lab test's details
 */
export const getTest = asyncHandler(async (req, res) => {
  const test = await labsService.getTest(req.tenantId, req.params.testId);
  res.json(test);
});

/**
 * GET /labs/categories
 * List distinct categories with test counts
 */
export const listCategories = asyncHandler(async (req, res) => {
  const categories = await labsService.listCategories(req.tenantId);
  res.json({ data: categories });
});

/**
 * GET /labs/partners
 * List lab partner centers
 */
export const listPartners = asyncHandler(async (req, res) => {
  const options = {
    page: parseInt(req.query.page) || 1,
    limit: parseInt(req.query.limit) || 20,
    city: req.query.city,
    homeCollection: req.query.home_collection
  };
  const result = await labsService.listPartners(req.tenantId, options);
  res.json(result);
});

/**
 * GET /labs/slots
 * Get available collection time slots
 */
export const getSlots = asyncHandler(async (req, res) => {
  const slots = await labsService.getSlots(req.tenantId, {
    date: req.query.date,
    collectionType: req.query.collection_type || 'home-collection',
    partnerId: req.query.partner_id
  });
  res.json(slots);
});

/**
 * POST /labs/bookings/:bookingId/cancel
 * Cancel a lab booking
 */
export const cancelBooking = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const { reason } = req.body;
  const booking = await labsService.cancelBooking(req.tenantId, bookingId, reason);
  res.json(booking);
});

/**
 * GET /labs/bookings/:bookingId/report
 * Retrieve report URL/details for a completed booking
 */
export const getReport = asyncHandler(async (req, res) => {
  const report = await labsService.getReport(req.tenantId, req.params.bookingId);
  res.json(report);
});

/**
 * POST /labs/bookings/:bookingId/payment
 * Initiate payment for a booking
 */
export const initiatePayment = asyncHandler(async (req, res) => {
  const booking = await labsService.initiatePayment(
    req.tenantId, req.params.bookingId, req.body
  );
  res.json(booking);
});
