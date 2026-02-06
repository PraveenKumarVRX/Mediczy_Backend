import AppointmentsService from '../../services/api-v1/AppointmentsService.js';
import { asyncHandler } from '../../middleware/errorHandler.js';

const appointmentsService = new AppointmentsService();

/**
 * Create a new appointment
 */
export const createAppointment = asyncHandler(async (req, res) => {
  const appointment = await appointmentsService.createAppointment(req.tenantId, req.body);
  res.status(201).json(appointment);
});

/**
 * Get a specific appointment
 */
export const getAppointment = asyncHandler(async (req, res) => {
  const appointment = await appointmentsService.getAppointment(req.tenantId, req.params.appointmentId);
  res.json(appointment);
});

/**
 * List appointments with filters
 */
export const listAppointments = asyncHandler(async (req, res) => {
  const { userId, userType, status, fromDate, toDate } = req.query;
  const options = {
    userId,
    userType,
    status,
    fromDate,
    toDate,
    page: parseInt(req.query.page) || 1,
    limit: parseInt(req.query.limit) || 20,
    sortBy: req.query.sortBy || 'appointment_date',
    sortOrder: req.query.sortOrder || 'DESC'
  };
  
  const result = await appointmentsService.listAppointments(req.tenantId, userId, options);
  res.json(result);
});

/**
 * Update an appointment
 */
export const updateAppointment = asyncHandler(async (req, res) => {
  const { appointmentId } = req.params;
  const appointment = await appointmentsService.updateAppointment(req.tenantId, appointmentId, req.body);
  res.json(appointment);
});

/**
 * Cancel an appointment
 */
export const cancelAppointment = asyncHandler(async (req, res) => {
  const { appointmentId } = req.params;
  const { reason } = req.body;
  
  const appointment = await appointmentsService.cancelAppointment(req.tenantId, appointmentId, reason);
  res.json(appointment);
});

/**
 * Reschedule an appointment
 */
export const rescheduleAppointment = asyncHandler(async (req, res) => {
  const { appointmentId } = req.params;
  const { appointment_date, appointment_time } = req.body;
  
  const appointment = await appointmentsService.rescheduleAppointment(
    req.tenantId,
    appointmentId,
    { appointment_date, appointment_time }
  );
  res.json(appointment);
});

/**
 * Check doctor availability
 */
export const checkAvailability = asyncHandler(async (req, res) => {
  const { doctorId, appointmentDate, appointmentTime } = req.query;
  
  const available = await appointmentsService.checkAvailability(
    req.tenantId,
    doctorId,
    appointmentDate,
    appointmentTime
  );
  
  res.json({ available, doctorId, appointmentDate, appointmentTime });
});

/**
 * Complete an appointment
 */
export const completeAppointment = asyncHandler(async (req, res) => {
  const { appointmentId } = req.params;
  const appointment = await appointmentsService.completeAppointment(req.tenantId, appointmentId);
  res.json(appointment);
});

/**
 * Start an appointment
 */
export const startAppointment = asyncHandler(async (req, res) => {
  const { appointmentId } = req.params;
  const appointment = await appointmentsService.startAppointment(req.tenantId, appointmentId);
  res.json(appointment);
});
