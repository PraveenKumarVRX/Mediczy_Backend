import DoctorsService from '../../services/api-v1/DoctorsService.js';
import { asyncHandler } from '../../middleware/errorHandler.js';

const doctorsService = new DoctorsService();

/**
 * Get doctor profile (alias for getDoctor)
 */
export const getDoctorProfile = asyncHandler(async (req, res) => {
  const doctor = await doctorsService.getDoctor(req.tenantId, req.params.doctorId);
  res.json(doctor);
});

/**
 * Get available time slots for a doctor
 */
export const getAvailableSlots = asyncHandler(async (req, res) => {
  const { doctorId } = req.params;
  const { date } = req.query;
  
  const slots = await doctorsService.getAvailableSlots(req.tenantId, doctorId, date);
  res.json(slots);
});

/**
 * Create a new doctor profile
 */
export const createDoctor = asyncHandler(async (req, res) => {
  const doctor = await doctorsService.createDoctor(req.tenantId, req.body);
  res.status(201).json(doctor);
});

/**
 * Get a specific doctor profile
 */
export const getDoctor = asyncHandler(async (req, res) => {
  const doctor = await doctorsService.getDoctor(req.tenantId, req.params.doctorId);
  res.json(doctor);
});

/**
 * List doctors with filters
 */
export const listDoctors = asyncHandler(async (req, res) => {
  const { specialization, isAvailable, minRating, search } = req.query;
  const options = {
    specialization,
    isAvailable: isAvailable !== undefined ? isAvailable === 'true' : undefined,
    minRating: minRating ? parseFloat(minRating) : undefined,
    search,
    page: parseInt(req.query.page) || 1,
    limit: parseInt(req.query.limit) || 20,
    sortBy: req.query.sortBy || 'name',
    sortOrder: req.query.sortOrder || 'DESC'
  };
  
  const result = await doctorsService.listDoctors(req.tenantId, options);
  res.json(result);
});

/**
 * Update doctor profile
 */
export const updateDoctor = asyncHandler(async (req, res) => {
  const { doctorId } = req.params;
  const doctor = await doctorsService.updateDoctor(req.tenantId, doctorId, req.body);
  res.json(doctor);
});

/**
 * Set doctor availability schedule
 */
export const setAvailability = asyncHandler(async (req, res) => {
  const { doctorId } = req.params;
  const { schedule } = req.body;
  
  const doctor = await doctorsService.setAvailability(req.tenantId, doctorId, schedule);
  res.json(doctor);
});

/**
 * Get doctor availability for a specific date
 */
export const getAvailability = asyncHandler(async (req, res) => {
  const { doctorId } = req.params;
  const { date } = req.query;
  
  const availability = await doctorsService.getAvailability(req.tenantId, doctorId, date);
  res.json(availability);
});

/**
 * Increment consultation count
 */
export const incrementConsultations = asyncHandler(async (req, res) => {
  const { doctorId } = req.params;
  const doctor = await doctorsService.incrementConsultations(req.tenantId, doctorId);
  res.json(doctor);
});

/**
 * Search doctors with filters (alias for listDoctors)
 */
export const searchDoctors = listDoctors;

/**
 * Get doctor availability (alias for getAvailability)
 */
export const getDoctorAvailability = getAvailability;
