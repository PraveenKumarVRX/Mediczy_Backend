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
  const { userId } = req.query;
  const options = {
    page: parseInt(req.query.page) || 1,
    limit: parseInt(req.query.limit) || 20,
    sortBy: req.query.sortBy || 'created_at',
    sortOrder: req.query.sortOrder || 'DESC'
  };
  
  const result = await labsService.listBookings(req.tenantId, userId, options);
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
  const { reportUrl } = req.body;
  
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
