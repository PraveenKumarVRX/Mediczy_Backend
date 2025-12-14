import express from 'express';
import { body, param, query } from 'express-validator';
import {
  getDoctorAvailability,
  getAvailableSlots,
  setDoctorAvailability,
  updateDoctorAvailability,
  deleteDoctorAvailability,
  bulkSetAvailability
} from '../controller/availability.controller.js';
import { authUser } from '../middleware/auth.middleware.js';

const router = express.Router();

/**
 * @route   GET /api/doctors/:doctorId/availability
 * @desc    Get doctor's availability schedule
 * @access  Public
 */
router.get(
  '/:doctorId/availability',
  [
    param('doctorId').isInt().withMessage('Valid doctor ID is required')
  ],
  getDoctorAvailability
);

/**
 * @route   GET /api/doctors/:doctorId/available-slots
 * @desc    Get available time slots for a specific date
 * @access  Public
 */
router.get(
  '/:doctorId/available-slots',
  [
    param('doctorId').isInt().withMessage('Valid doctor ID is required'),
    query('date').isDate().withMessage('Valid date is required')
  ],
  getAvailableSlots
);

/**
 * @route   POST /api/doctors/:doctorId/availability
 * @desc    Set doctor's availability
 * @access  Private (Doctor only)
 */
router.post(
  '/:doctorId/availability',
  authUser,
  [
    param('doctorId').isInt().withMessage('Valid doctor ID is required'),
    body('dayOfWeek').isInt({ min: 0, max: 6 }).withMessage('Day of week must be between 0-6'),
    body('startTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Valid start time in HH:MM format is required'),
    body('endTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Valid end time in HH:MM format is required'),
    body('slotDuration').optional().isIn([15, 30, 45, 60]).withMessage('Slot duration must be 15, 30, 45, or 60 minutes'),
    body('breakTimes').optional().isArray(),
    body('isAvailable').optional().isBoolean(),
    body('allowVideoConsultation').optional().isBoolean(),
    body('allowAudioConsultation').optional().isBoolean(),
    body('allowChatConsultation').optional().isBoolean(),
    body('allowInPersonConsultation').optional().isBoolean(),
    body('videoConsultationFee').optional().isFloat({ min: 0 }),
    body('audioConsultationFee').optional().isFloat({ min: 0 }),
    body('chatConsultationFee').optional().isFloat({ min: 0 }),
    body('inPersonConsultationFee').optional().isFloat({ min: 0 }),
    body('maxAppointmentsPerSlot').optional().isInt({ min: 1, max: 10 })
  ],
  setDoctorAvailability
);

/**
 * @route   POST /api/doctors/:doctorId/availability/bulk
 * @desc    Bulk set doctor's weekly availability
 * @access  Private (Doctor only)
 */
router.post(
  '/:doctorId/availability/bulk',
  authUser,
  [
    param('doctorId').isInt().withMessage('Valid doctor ID is required'),
    body('schedules').isArray({ min: 1 }).withMessage('Schedules array is required')
  ],
  bulkSetAvailability
);

/**
 * @route   PATCH /api/doctors/:doctorId/availability/:scheduleId
 * @desc    Update doctor's availability
 * @access  Private (Doctor only)
 */
router.patch(
  '/:doctorId/availability/:scheduleId',
  authUser,
  [
    param('doctorId').isInt().withMessage('Valid doctor ID is required'),
    param('scheduleId').isInt().withMessage('Valid schedule ID is required')
  ],
  updateDoctorAvailability
);

/**
 * @route   DELETE /api/doctors/:doctorId/availability/:scheduleId
 * @desc    Delete doctor's availability
 * @access  Private (Doctor only)
 */
router.delete(
  '/:doctorId/availability/:scheduleId',
  authUser,
  [
    param('doctorId').isInt().withMessage('Valid doctor ID is required'),
    param('scheduleId').isInt().withMessage('Valid schedule ID is required')
  ],
  deleteDoctorAvailability
);

export default router;
