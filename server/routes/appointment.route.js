import express from 'express';
import { body, param, query } from 'express-validator';
import {
  createAppointment,
  getUserAppointments,
  getDoctorAppointments,
  getAppointmentById,
  cancelAppointment,
  rescheduleAppointment,
  completeAppointment,
  rateAppointment,
  updatePaymentStatus
} from '../controller/appointment.controller.js';
import { authUser } from '../middleware/auth.middleware.js';
import Appointment from '../models/appointment.model.intelligent.js';
import intelligentDb from '../utils/intelligentDbClient.js';

const router = express.Router();

/**
 * @route   POST /api/appointments
 * @desc    Create a new appointment
 * @access  Private (User)
 */
router.post(
  '/',
  authUser,
  [
    body('doctorId').isInt().withMessage('Valid doctor ID is required'),
    body('appointmentDate').isDate().withMessage('Valid date is required'),
    body('appointmentTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Valid time in HH:MM format is required'),
    body('consultationType').isIn(['video', 'audio', 'chat', 'in-person']).withMessage('Valid consultation type is required'),
    body('symptoms').optional().isString(),
    body('reason').optional().isString()
  ],
  createAppointment
);

/**
 * @route   GET /api/appointments
 * @desc    Get user's appointments
 * @access  Private (User)
 */
router.get(
  '/',
  authUser,
  [
    query('status').optional().isIn(['scheduled', 'confirmed', 'in-progress', 'completed', 'cancelled', 'no-show', 'rescheduled']),
    query('upcoming').optional().isBoolean(),
    query('past').optional().isBoolean()
  ],
  getUserAppointments
);

/**
 * @route   GET /api/appointments/my-appointments
 * @desc    Alias for GET / - Get user's appointments (for frontend compatibility)
 * @access  Private (User)
 */
router.get(
  '/my-appointments',
  authUser,
  [
    query('status').optional().isIn(['scheduled', 'confirmed', 'in-progress', 'completed', 'cancelled', 'no-show', 'rescheduled']),
    query('upcoming').optional().isBoolean(),
    query('past').optional().isBoolean()
  ],
  getUserAppointments
);

/**
 * @route   GET /api/appointments/doctor
 * @desc    Get doctor's appointments
 * @access  Private (Doctor)
 */
router.get(
  '/doctor',
  authUser,
  [
    query('status').optional().isIn(['scheduled', 'confirmed', 'in-progress', 'completed', 'cancelled', 'no-show', 'rescheduled']),
    query('date').optional().isDate(),
    query('upcoming').optional().isBoolean()
  ],
  getDoctorAppointments
);

/**
 * @route   GET /api/appointments/:id
 * @desc    Get appointment by ID
 * @access  Private (User/Doctor)
 */
router.get(
  '/:id',
  authUser,
  [
    param('id').isInt().withMessage('Valid appointment ID is required')
  ],
  getAppointmentById
);

/**
 * @route   GET /api/appointments/analytics/basic
 * @desc    Basic intelligent DB analytics for appointments
 * @access  Private (User/Doctor)
 */
router.get(
  '/analytics/basic',
  authUser,
  async (req, res) => {
    try {
      const { role, id } = req.user;
      const filter = {};

      if (role === 'doctor') {
        filter.doctorId = id;
      } else {
        filter.patientId = id;
      }

      const analytics = await intelligentDb.query('appointments_v1', filter);

      return res.json({
        success: true,
        analytics
      });
    } catch (error) {
      console.error('Intelligent DB appointment analytics error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch intelligent appointment analytics',
        error: error.message
      });
    }
  }
);

/**
 * @route   PATCH /api/appointments/:id/cancel
 * @desc    Cancel appointment (alternative route)
 * @access  Private (User/Doctor)
 */
router.patch(
  '/:id/cancel',
  authUser,
  [
    param('id').isInt().withMessage('Valid appointment ID is required'),
    body('cancellationReason').optional().isString()
  ],
  cancelAppointment
);

/**
 * @route   DELETE /api/appointments/:id
 * @desc    Cancel appointment
 * @access  Private (User/Doctor)
 */
router.delete(
  '/:id',
  authUser,
  [
    param('id').isInt().withMessage('Valid appointment ID is required'),
    body('reason').optional().isString()
  ],
  cancelAppointment
);

/**
 * @route   PATCH /api/appointments/:id/reschedule
 * @desc    Reschedule appointment
 * @access  Private (User)
 */
router.patch(
  '/:id/reschedule',
  authUser,
  [
    param('id').isInt().withMessage('Valid appointment ID is required'),
    body('appointmentDate').isDate().withMessage('Valid date is required'),
    body('appointmentTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Valid time in HH:MM format is required')
  ],
  rescheduleAppointment
);

/**
 * @route   PATCH /api/appointments/:id/status
 * @desc    Update appointment status (Doctor)
 * @access  Private (Doctor)
 */
router.patch(
  '/:id/status',
  authUser,
  [
    param('id').isInt().withMessage('Valid appointment ID is required'),
    body('status').optional().isIn(['scheduled', 'confirmed', 'in-progress', 'completed', 'cancelled', 'no-show']),
    body('notes').optional().isString()
  ],
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status, notes } = req.body;
      
      const appointment = await Appointment.findByPk(id);
      if (!appointment) {
        return res.status(404).json({ message: 'Appointment not found' });
      }
      
      const updates = {};
      if (status) updates.status = status;
      if (notes !== undefined) updates.notes = notes;
      
      await appointment.update(updates);
      
      // Auto-increment patient's plan usage when marking as completed
      if (status === 'completed' && appointment.userId && appointment.specialization) {
        try {
          const { UserPlan } = await import('../models/membershipPlan.model.intelligent.js');
          
          const userPlan = await UserPlan.findOne({
            where: { userId: appointment.userId, status: 'active' }
          });
            
            if (userPlan) {
              const applied = userPlan.appliedLimits || {};
              const teleLimits = applied.teleConsultLimits || {};
              const usage = userPlan.usage || {};
              usage.teleConsult = usage.teleConsult || {};
              
              // Increment usage
              const spec = appointment.specialization;
              if (typeof teleLimits.allSpecialties === 'number') {
                const totalUsed = Object.values(usage.teleConsult).reduce((sum, v) => sum + Number(v || 0), 0);
                const allowed = Number(teleLimits.allSpecialties);
                if (totalUsed < allowed) {
                  usage.teleConsult[spec] = Number(usage.teleConsult[spec] || 0) + 1;
                  await userPlan.update({ usage });
                }
              } else if (teleLimits[spec]) {
                const specUsed = Number(usage.teleConsult[spec] || 0);
                const specAllowed = Number(teleLimits[spec] || 0);
                if (specUsed < specAllowed) {
                  usage.teleConsult[spec] = specUsed + 1;
                  await userPlan.update({ usage });
                }
              }
            }
        } catch (importErr) {
          console.error('Could not import membership models:', importErr);
        }
      }
      
      res.json({ appointment });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Failed to update appointment', error: error.message });
    }
  }
);

/**
 * @route   POST /api/appointments/:id/complete
 * @desc    Mark appointment as completed (Doctor only)
 * @access  Private (Doctor)
 */
router.post(
  '/:id/complete',
  authUser,
  [
    param('id').isInt().withMessage('Valid appointment ID is required'),
    body('notes').optional().isString(),
    body('prescription').optional().isString()
  ],
  completeAppointment
);

/**
 * @route   PATCH /api/appointments/:id/rating
 * @desc    Submit appointment rating (alternative route)
 * @access  Private (User)
 */
router.patch(
  '/:id/rating',
  authUser,
  [
    param('id').isInt().withMessage('Valid appointment ID is required'),
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('feedback').optional().isString()
  ],
  rateAppointment
);

/**
 * @route   POST /api/appointments/:id/rating
 * @desc    Submit appointment rating
 * @access  Private (User)
 */
router.post(
  '/:id/rating',
  authUser,
  [
    param('id').isInt().withMessage('Valid appointment ID is required'),
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('feedback').optional().isString()
  ],
  rateAppointment
);

/**
 * @route   PATCH /api/appointments/:id/payment
 * @desc    Update payment status
 * @access  Private
 */
router.patch(
  '/:id/payment',
  authUser,
  [
    param('id').isInt().withMessage('Valid appointment ID is required'),
    body('paymentStatus').isIn(['pending', 'paid', 'refunded', 'failed']).withMessage('Valid payment status is required'),
    body('paymentMethod').optional().isString(),
    body('transactionId').optional().isString()
  ],
  updatePaymentStatus
);

export default router;
