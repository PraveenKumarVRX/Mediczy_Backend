import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { Op } from 'sequelize';
import healthDiaryService from '../services/health-diary.service.js';
import { validateBody, validateQuery } from '../validationSchemas/validateRequest.middleware.js';
import {
  createAppointmentSchema,
  rescheduleAppointmentSchema,
  cancelAppointmentSchema,
  completeAppointmentSchema,
  listAppointmentsQuerySchema,
} from '../validationSchemas/appointment.schema.js';
import {
  createAppointment,
  getUserAppointments,
  getDoctorAppointments,
  getAppointmentById,
  cancelAppointment,
  rescheduleAppointment,
  completeAppointment,
  updatePaymentStatus
} from '../controller/appointment.controller.js';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import Appointment from '../models/appointment.model.intelligent.js';
import intelligentDb from '../utils/intelligentDbClient.js';
import { generateICalFile, generateDoctorICalFile, generateICalFilename } from '../utils/icalGenerator.js';
import Doctor from '../models/doctor.model.intelligent.js';
import { User } from '../models/user.model.intelligent.js';
import {
  findDoctorAuthorizedAppointment,
  isDoctorOwnerFromCandidates,
  resolveDoctorIdCandidates,
} from '../utils/doctor-appointment-access.js';
import { toArray, normalizeAppointment } from '../utils/doctorNormalizer.js';
import { postgresSequelize } from '../db/postgres-sequelize.js';

// appointments (and prescriptions) enforce FORCE ROW LEVEL SECURITY — every
// read/write must run inside a transaction with the session GUCs set, or
// Sequelize silently sees zero rows (reads) / gets rejected (writes).
async function withAppointmentsRls(req, work) {
  const transaction = await postgresSequelize.transaction();
  try {
    await req.setSequelizeRlsContext?.(transaction);
    const result = await work(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback().catch(() => {});
    throw error;
  }
}

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
    body('doctorId').notEmpty().withMessage('Doctor ID is required (numeric like 2 or alphanumeric like D2C193)'),
    body('appointmentDate').isDate().withMessage('Valid date is required'),
    // Accept both HH:MM format and HH:MM - HH:MM time range format
    body('appointmentTime')
      .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](\s*-\s*([0-1]?[0-9]|2[0-3]):[0-5][0-9])?$/)
      .withMessage('Valid time in HH:MM or HH:MM - HH:MM format is required'),
    body('consultationType').isIn(['video', 'audio', 'chat', 'in-person', 'review', 'follow-up', 'followup']).withMessage('Valid consultation type is required'),
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
    query('status').optional().isString(), // Allow comma-separated status values
    query('consultationType').optional().isString(),
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
  requireRole('doctor'),
  [
    query('status').optional().isIn(['scheduled', 'confirmed', 'in-progress', 'completed', 'cancelled', 'no-show', 'rescheduled']),
    query('date').optional().isDate(),
    query('upcoming').optional().isBoolean()
  ],
  getDoctorAppointments
);

/**
 * @route   GET /api/appointments/doctor/today
 * @desc    Get doctor's appointments for today
 * @access  Private (Doctor)
 */
router.get(
  '/doctor/today',
  authUser,
  requireRole('doctor'),
  async (req, res) => {
    try {
      const doctorId = req.user?.doctorId || req.user?.id;
      if (!doctorId) {
        return res.status(400).json({
          success: false,
          message: 'Doctor context missing in auth token'
        });
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const appointments = await withAppointmentsRls(req, (transaction) => Appointment.findAll({
        where: {
          doctorId,
          appointmentDate: {
            [Op.gte]: today,
            [Op.lt]: tomorrow
          }
        },
        include: [
          {
            model: User,
            as: 'patient',
            attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'],
            required: false
          }
        ],
        order: [
          ['appointmentDate', 'ASC'],
          ['appointmentTime', 'ASC']
        ],
        transaction,
      }));

      const normalizedAppointments = (appointments || []).map((apt) => {
        const item = apt.toJSON ? apt.toJSON() : apt;
        const patientName =
          item.patientName ||
          `${item.patient?.firstName || ''} ${item.patient?.lastName || ''}`.trim() ||
          'Patient';

        return {
          ...item,
          patientName,
          type: item.consultationType === 'online' ? 'Video' : 'In-Person',
        };
      });

      return res.json({
        success: true,
        appointments: normalizedAppointments,
        data: normalizedAppointments,
        count: normalizedAppointments.length
      });
    } catch (error) {
      console.error('Get today appointments error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch today\'s appointments',
        error: error.message
      });
    }
  }
);

/**
 * @route   GET /api/appointments/upcoming
 * @desc    Alias for GET /?upcoming=true — returns only upcoming appointments
 * @access  Private (User)
 */
router.get(
  '/upcoming',
  authUser,
  (req, _res, next) => { req.query.upcoming = 'true'; next(); },
  getUserAppointments
);
/**
 * @route   GET /api/appointments/my
 * @desc    Alias for GET / - Get current user appointments
 * @access  Private (User)
 */
router.get(
  '/my',
  authUser,
  [
    query('status').optional().isString(),
    query('consultationType').optional().isString(),
    query('upcoming').optional().isBoolean(),
    query('past').optional().isBoolean()
  ],
  getUserAppointments
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

      let analytics = null;
      
      try {
        // Try intelligent DB first
        analytics = await intelligentDb.query('appointments_v1', filter);
      } catch (intelligentDbError) {
        console.log('Intelligent DB not available, using fallback analytics');
        
        // Fallback: Get basic analytics from database directly
        const whereClause = role === 'doctor' 
          ? { doctorId: id } 
          : { patientId: id };
        
        // Sequential (not Promise.all): all four counts share one RLS
        // transaction, and a single pg connection cannot run concurrent queries.
        const [totalCount, completedCount, upcomingCount, cancelledCount] = await withAppointmentsRls(req, async (transaction) => {
          const total = await Appointment.count({ where: whereClause, transaction });
          const completed = await Appointment.count({ where: { ...whereClause, status: 'completed' }, transaction });
          const upcoming = await Appointment.count({ where: { ...whereClause, status: { [Op.in]: ['scheduled', 'confirmed'] } }, transaction });
          const cancelled = await Appointment.count({ where: { ...whereClause, status: 'cancelled' }, transaction });
          return [total, completed, upcoming, cancelled];
        });
        
        analytics = {
          total: totalCount,
          completed: completedCount,
          upcoming: upcomingCount,
          cancelled: cancelledCount,
          completionRate: totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0,
          source: 'database_fallback'
        };
      }

      return res.json({
        success: true,
        analytics
      });
    } catch (error) {
      console.error('Appointment analytics error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch appointment analytics',
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
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }
    let rlsTransaction = null;
    try {
      const { id } = req.params;
      const { status, notes } = req.body;

      // appointments uses FORCE ROW LEVEL SECURITY; set session context
      // so doctor/admin status updates can resolve the row reliably.
      rlsTransaction = await postgresSequelize.transaction();
      await req.setSequelizeRlsContext?.(rlsTransaction);

      const doctorIdCandidates = await resolveDoctorIdCandidates({
        actorId: req.user?.id,
        actorDoctorId: req.user?.doctorId,
        actorEmail: req.user?.email,
        UserModel: User,
      });

      const appointment = await findDoctorAuthorizedAppointment({
        AppointmentModel: Appointment,
        Op,
        appointmentId: id,
        doctorIdCandidates,
        include: undefined,
        transaction: rlsTransaction,
        allowMeetingFallback: false,
      }) || await Appointment.findByPk(id, { transaction: rlsTransaction });

      if (!appointment) {
        await rlsTransaction.rollback();
        return res.status(404).json({ message: 'Appointment not found' });
      }

      const isAdmin =
        Boolean(req.user?.isAdmin) ||
        (typeof req.userRole === 'string' && req.userRole.includes('admin'));
      const isDoctorOwner =
        req.userRole === 'doctor' &&
        isDoctorOwnerFromCandidates(appointment.doctorId, doctorIdCandidates);

      if (!isAdmin && !isDoctorOwner) {
        return res.status(403).json({ message: 'Unauthorized access' });
      }

      const updates = {};
      if (status) updates.status = status;
      if (notes !== undefined) updates.notes = notes;

      await appointment.update(updates, { transaction: rlsTransaction });
      await rlsTransaction.commit();
      
      // Auto-increment patient's plan usage when marking as completed
      if (status === 'completed' && appointment.userId && appointment.specialization) {
        try {
          const { UserPlan } = await import('../models/postgres/membershipPlan.model.postgres.js');
          
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
      if (rlsTransaction && !rlsTransaction.finished) {
        await rlsTransaction.rollback().catch(() => {});
      }
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
 * @route   POST /api/appointments/:id/complete-with-prescription
 * @desc    Complete consultation and auto-create prescription draft
 * @access  Private (Doctor)
 */
router.post(
  '/:id/complete-with-prescription',
  authUser,
  [
    param('id').isInt().withMessage('Valid appointment ID is required'),
    body('notes').optional().isString(),
    body('duration').optional().isString()
  ],
  async (req, res) => {
    try {
      const { id } = req.params;
      const doctorId = req.user.id;
      const { notes, duration } = req.body;

      const completeResult = await withAppointmentsRls(req, async (transaction) => {
        const appointment = await Appointment.findByPk(id, { transaction });
        if (!appointment) return { notFound: true };
        if (appointment.doctorId !== doctorId) return { forbidden: true };

        // Check if prescription already exists
        const { Prescription, Doctor, User } = await import('../models/index.js');

        let prescription = await Prescription.findOne({
          where: { appointmentId: parseInt(id) },
          transaction,
        });

        // If no prescription exists, create draft
        if (!prescription) {
          const doctor = await Doctor.findByPk(doctorId);
          const patient = await User.findByPk(appointment.userId);

          if (doctor && patient) {
            let patientAge = null;
            if (patient.dateOfBirth) {
              const dob = new Date(patient.dateOfBirth);
              const today = new Date();
              patientAge = today.getFullYear() - dob.getFullYear();
            }

            prescription = await Prescription.create({
              appointmentId: appointment.id,
              patientId: appointment.userId,
              patientName: `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || appointment.patientName,
              patientAge,
              patientGender: patient.gender || 'Not specified',
              patientPhone: patient.phoneNumber || patient.phone || appointment.patientPhone,
              doctorId: doctor.id,
              doctorName: `${doctor.firstName || ''} ${doctor.lastName || ''}`.trim(),
              doctorQualifications: Array.isArray(doctor.qualifications)
                ? doctor.qualifications.join(', ')
                : (doctor.qualifications || doctor.qualification || 'MBBS'),
              doctorRegNo: doctor.registrationNumber || doctor.licenseNumber || 'N/A',
              specialty: doctor.specialization || 'General Medicine',
              clinicName: doctor.clinicHospitalName || doctor.clinicName || 'Mediczy Healthcare',
              clinicAddress: ['video', 'audio', 'chat'].includes(appointment.consultationType)
                ? 'Online Consultation / Telemedicine'
                : (doctor.clinicAddress || 'Clinic'),
              clinicPhone: doctor.phone || doctor.phoneNumber,
              clinicEmail: doctor.email,
              clinicDetails: {
                name: doctor.clinicHospitalName || doctor.clinicName || 'Mediczy Healthcare',
                address: ['video', 'audio', 'chat'].includes(appointment.consultationType)
                  ? 'Online Consultation / Telemedicine'
                  : (doctor.clinicAddress || 'Clinic'),
                phone: doctor.phone || doctor.phoneNumber,
                email: doctor.email,
                specialty: doctor.specialization,
                consultationType: appointment.consultationType
              },
              diagnosis: 'To be filled by doctor',
              chiefComplaints: toArray(appointment.symptoms).length > 0 ? toArray(appointment.symptoms) : ['As discussed during consultation'],
              medications: [],
              labTests: [],
              instructions: [
                'Complete the full course of medications',
                'Take medicines as directed',
                'Contact doctor if symptoms worsen'
              ],
              vitals: {},
              validityDays: 30,
              notes: duration
                ? `${appointment.consultationType} consultation completed (${duration})`
                : notes || `${appointment.consultationType} consultation completed`,
              status: 'draft'
            }, { transaction });
          }
        }

        // Update appointment
        await appointment.update({
          status: 'completed',
          notes: duration
            ? `Consultation completed (${duration})`
            : notes || 'Consultation completed',
          prescription: prescription?.prescriptionId
        }, { transaction });

        return { appointment, prescription };
      });

      if (completeResult.notFound) {
        return res.status(404).json({ message: 'Appointment not found' });
      }

      if (completeResult.forbidden) {
        return res.status(403).json({ message: 'Unauthorized access' });
      }

      const appointment = completeResult.appointment;
      const prescription = completeResult.prescription;

      // Auto-log consultation to patient's health diary (fire-and-forget)
      if (appointment.userId) {
        setImmediate(async () => {
          try {
            await healthDiaryService.logConsultation(appointment.userId, {
              id: appointment.id,
              doctorId: appointment.doctorId,
              doctorName: appointment.doctorName || 'Doctor',
              consultationType: appointment.consultationType || 'General',
              status: 'completed',
              scheduledTime: appointment.scheduledTime,
              duration
            });
          } catch (e) {
            console.error('Health diary auto-log (appointment complete):', e.message);
          }
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Consultation completed and prescription draft created',
        appointment: {
          id: appointment.id,
          status: appointment.status,
          consultationType: appointment.consultationType
        },
        prescription: prescription ? {
          prescriptionId: prescription.prescriptionId,
          status: prescription.status,
          editUrl: `/api/prescriptions/${prescription.prescriptionId}`,
          updateUrl: `/api/prescriptions/from-appointment/${appointment.id}`,
          message: 'Prescription draft ready. Add diagnosis and medications to finalize.'
        } : null
      });

    } catch (error) {
      console.error('Complete with prescription error:', error);
      return res.status(500).json({ 
        message: 'Failed to complete consultation',
        error: error.message 
      });
    }
  }
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

/**
 * @route   POST /api/appointments/:id/remind
 * @desc    Send reminder notification for an appointment
 * @access  Private (Assistant/Staff)
 */
router.post(
  '/:id/remind',
  authUser,
  [
    param('id').isInt().withMessage('Valid appointment ID is required'),
    body('message').optional().isString()
  ],
  async (req, res) => {
    try {
      const { id } = req.params;
      const { message } = req.body;
      
      const appointment = await withAppointmentsRls(req, (transaction) => Appointment.findByPk(id, { transaction }));
      if (!appointment) {
        return res.status(404).json({ success: false, message: 'Appointment not found' });
      }

      // Try to send notification
      try {
        const notificationService = (await import('../services/notification.service.js')).default;

        const reminderMessage = message || `Reminder: You have an appointment scheduled for ${appointment.appointmentDate} at ${appointment.appointmentTime}`;

        // Send notification to patient
        if (appointment.userId) {
          await notificationService.sendNotification({
            userId: appointment.userId,
            userType: 'patient',
            title: 'Appointment Reminder',
            body: reminderMessage,
            type: 'appointment_reminder',
            data: {
              appointmentId: id,
              appointmentDate: appointment.appointmentDate,
              appointmentTime: appointment.appointmentTime
            }
          });
        }

        // Update appointment to mark reminder sent
        await withAppointmentsRls(req, (transaction) => appointment.update({
          reminderSent: true,
          lastReminderAt: new Date()
        }, { transaction }));
        
        res.json({ 
          success: true, 
          message: 'Reminder sent successfully',
          appointment
        });
      } catch (notifError) {
        console.error('Notification service error:', notifError);
        // Still return success but note the notification failed
        res.json({ 
          success: true, 
          message: 'Appointment marked for reminder (notification service unavailable)',
          notificationSent: false
        });
      }
    } catch (error) {
      console.error('Remind appointment error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to send reminder', 
        error: error.message 
      });
    }
  }
);

/**
 * @route   GET /api/appointments/:id/calendar
 * @desc    Download appointment as iCal (.ics) file
 * @access  Private (User/Doctor)
 */
router.get(
  '/:id/calendar',
  authUser,
  [
    param('id').isInt().withMessage('Valid appointment ID is required')
  ],
  async (req, res) => {
    try {
      const appointmentId = parseInt(req.params.id);
      const userId = req.user.id;
      const userRole = req.user.role;

      // Fetch appointment
      const appointment = await withAppointmentsRls(req, (transaction) => Appointment.findByPk(appointmentId, { transaction }));

      if (!appointment) {
        return res.status(404).json({
          success: false,
          message: 'Appointment not found'
        });
      }

      // Verify user has access to this appointment
      const isDoctor = userRole === 'doctor' && appointment.doctorId === userId;
      const isPatient = userRole !== 'doctor' && appointment.userId === userId;

      if (!isDoctor && !isPatient) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      // Fetch doctor and user details for complete calendar info
      const doctor = await Doctor.findByPk(appointment.doctorId);
      const patient = await User.findByPk(appointment.userId);

      // Build appointment data for iCal
      const appointmentData = {
        id: appointment.id,
        patientName: appointment.patientName || `${patient?.firstName} ${patient?.lastName}`.trim(),
        patientEmail: appointment.patientEmail || patient?.email,
        patientPhone: appointment.patientPhone || patient?.phoneNumber || patient?.phone,
        doctorName: appointment.doctorName || `Dr. ${doctor?.firstName} ${doctor?.lastName}`.trim(),
        doctorEmail: doctor?.email,
        specialization: appointment.specialization || doctor?.specialization,
        appointmentDate: appointment.appointmentDate,
        appointmentTime: appointment.appointmentTime,
        duration: appointment.duration || 30,
        consultationType: appointment.consultationType,
        consultationFee: appointment.consultationFee,
        symptoms: toArray(appointment.symptoms),
        notes: appointment.notes,
        location: appointment.location,
        meetingLink: appointment.meetingLink
      };

      // Generate iCal content based on user role
      const icalContent = isDoctor 
        ? generateDoctorICalFile(appointmentData)
        : generateICalFile(appointmentData);

      // Generate filename
      const filename = generateICalFilename(
        appointmentData, 
        isDoctor ? 'doctor' : 'patient'
      );

      // Set response headers for file download
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', Buffer.byteLength(icalContent));

      // Send iCal file
      return res.send(icalContent);

    } catch (error) {
      console.error('Calendar download error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate calendar file',
        error: error.message
      });
    }
  }
);

export default router;
