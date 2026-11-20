import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authUser } from '../middleware/auth.middleware.js';
import { Appointment, Doctor } from '../models/index.js';
import { UserPlan } from '../models/postgres/membershipPlan.model.postgres.js';
import userModel from '../models/user.model.intelligent.js';
import paymentService from '../services/payment.service.js';
import notificationService from '../services/notification.service.js';
import healthCoinsService from '../services/health-coins.service.js';
import { getTeleconsultEntitlement, consumeTeleconsult } from '../services/teleconsult-entitlement.service.js';
import {
  buildLiveKitJoinData,
  createMeetingInfo,
  ensureMeetingInfo,
  getProviderLabel
} from '../utils/videoProvider.js';
import { Op } from 'sequelize';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import { normalizeDoctorProfile, toArray } from '../utils/doctorNormalizer.js';
import { canonicalizeAppointmentTime, isSlotBooked } from '../utils/appointmentSlotTime.js';
import { checkDoctorConflict, checkPatientConflict } from '../services/appointmentEligibility.service.js';
import { notifyCareTeamOfBooking } from '../services/care-team-notification.service.js';
import { setRlsContext } from '../middleware/rls-context.middleware.js';
import * as appointmentRepository from '../repositories/appointment.repository.js';
import { resolveActor, isOwnedByActor } from '../services/appointment-identity.service.js';
import { notifyPatientDoctorIsCalling } from '../services/doctor-calling-notification.service.js';
import { notDemoAccount } from '../utils/demo-account-sql.js';

const router = express.Router();

const MEMBERSHIP_RENEWAL_EXEMPT_EMAILS = new Set(
  String(process.env.MEMBERSHIP_RENEWAL_EXEMPT_EMAILS || 'user@mediczy.com')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
);

const isMembershipRenewalExemptEmail = (email) =>
  MEMBERSHIP_RENEWAL_EXEMPT_EMAILS.has(String(email || '').trim().toLowerCase());

const cleanDoctorToken = (value) =>
  String(value || '')
    .replace(/^(dr\.?|doctor)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();

const toNameCase = (value) =>
  String(value || '')
    .split(' ')
    .filter(Boolean)
    .map((part) => {
      if (part.length === 1) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ');

const formatDoctorDisplayName = ({ firstName, lastName }) => {
  const first = cleanDoctorToken(firstName);
  const last = cleanDoctorToken(lastName);
  const fullName = toNameCase([first, last].filter(Boolean).join(' '));
  return fullName ? `Dr ${fullName}` : 'Dr';
};

const isMembershipRenewalExemptUser = async ({ userId, email }) => {
  if (isMembershipRenewalExemptEmail(email)) {
    return true;
  }
  if (!userId) {
    return false;
  }

  const user = await userModel.findByPk(userId, {
    attributes: ['id', 'email']
  });
  return isMembershipRenewalExemptEmail(user?.email);
};

/**
 * Helper function to find appointment by ID or meetingId
 * Handles both numeric IDs and timestamp-based meetingId patterns
 * @param {string|number} appointmentId - The ID to lookup
 * @returns {Promise<Appointment|null>}
 */
async function findAppointmentFlexible(appointmentId, { transaction } = {}) {
  if (!appointmentId) return null;

  const idStr = String(appointmentId);
  const idAsNumber = parseInt(idStr, 10);

  // Try direct lookup if it's a valid integer within PostgreSQL INTEGER range
  if (!isNaN(idAsNumber) && idAsNumber <= 2147483647) {
    const appointment = await Appointment.findByPk(idAsNumber, { transaction });
    if (appointment) return appointment;
  }

  // Try looking up by meetingId pattern (apt-{timestamp})
  const meetingIdPattern = `apt-${idStr}`;
  let appointment = await Appointment.findOne({
    where: { meetingId: meetingIdPattern },
    transaction
  });
  if (appointment) return appointment;

  // Also try direct meetingId match (in case full meetingId is passed)
  if (idStr.startsWith('apt-')) {
    appointment = await Appointment.findOne({
      where: { meetingId: idStr },
      transaction
    });
  }

  return appointment;
}

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

// For genuinely public/unauthenticated routes (no req.user) that only need a
// narrow, existence-check-only, non-PII read from appointments.
async function withAppointmentsRlsBypass(work) {
  const transaction = await postgresSequelize.transaction();
  try {
    await setRlsContext(transaction, { orgId: 0, userId: 0, isPlatformAdmin: true });
    const result = await work(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback().catch(() => {});
    throw error;
  }
}

// ============================================
// STEP 1: BROWSE DOCTORS
// ============================================

/**
 * @route   GET /api/consultation/doctors
 * @desc    Get list of doctors with filters (specialty, availability)
 * @access  Public
 */
router.get('/doctors', async (req, res) => {
  try {
    const {
      specialty,
      date,
      maxFee,
      sortBy = 'fee',
      page = 1,
      limit = 20
    } = req.query;

    const where = {
      isOnline: true,
      isVerified: true
    };

    if (specialty) {
      where.specialization = specialty;
    }

    const doctors = await Doctor.findAll({
      where,
      attributes: [
        'id', 'prefix', 'firstName', 'lastName', 'email', 'phoneNumber',
        'profileImage', 'specialization', 'qualifications', 'experience',
        'registrationNumber', 'consultationFees', 'onlineConsultationFee',
        'inPersonConsultationFee',
        'languages', 'isOnline'
      ],
      order: sortBy === 'experience'
        ? [['experience', 'DESC']]
        : [['onlineConsultationFee', 'ASC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });

    // Filter by maxFee if provided
    let filteredDoctors = doctors;
    if (maxFee) {
      filteredDoctors = filteredDoctors.filter(d => 
        (d.onlineConsultationFee || d.consultationFees || 500) <= parseFloat(maxFee)
      );
    }

    res.json({
      success: true,
      count: filteredDoctors.length,
      doctors: filteredDoctors.map(raw => {
        const doc = normalizeDoctorProfile(raw);
        return {
          id: doc.id,
          name: formatDoctorDisplayName({ firstName: doc.firstName, lastName: doc.lastName }),
          email: doc.email,
          phone: doc.phoneNumber,
          profileImage: doc.profileImage,
          specialization: doc.specialization,
          specializations: doc.specializations,
          qualifications: doc.qualifications,
          experience: doc.experience,
          registrationNumber: doc.registrationNumber,
          feeStructure: doc.feeStructure,
          consultationFee: doc.feeStructure?.online || doc.onlineConsultationFee || doc.consultationFees || 500,
          bio: (typeof doc.metadata === 'object' ? doc.metadata?.about : null) || null,
          languages: doc.languages,
          isOnline: doc.isOnline,
          isAvailable: doc.isOnline !== false,
        };
      })
    });
  } catch (error) {
    console.error('Error fetching doctors:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch doctors',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/consultation/doctors/:id
 * @desc    Get detailed doctor profile
 * @access  Public
 */
router.get('/doctors/:id', async (req, res) => {
  try {
    const doctor = await Doctor.findByPk(req.params.id, {
      attributes: { exclude: ['password'] }
    });

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    const doc = normalizeDoctorProfile(doctor);
    res.json({
      success: true,
      doctor: {
        id: doc.id,
        name: formatDoctorDisplayName({ firstName: doc.firstName, lastName: doc.lastName }),
        email: doc.email,
        phone: doc.phoneNumber,
        profileImage: doc.profileImage,
        specialization: doc.specialization,
        specializations: doc.specializations,
        qualifications: doc.qualifications,
        experience: doc.experience,
        registrationNumber: doc.registrationNumber,
        feeStructure: doc.feeStructure,
        consultationFee: doc.feeStructure?.online || doc.onlineConsultationFee || doc.consultationFees || 500,
        inPersonFee: doc.feeStructure?.inClinic || doc.inPersonConsultationFee || 700,
        bio: (typeof doc.metadata === 'object' ? doc.metadata?.about : null) || null,
        languages: doc.languages,
        clinicAddress: doc.clinicAddress,
        weeklySchedule: doc.weeklySchedule,
        isOnline: doc.isOnline,
        isAvailable: doc.isOnline !== false,
      }
    });
  } catch (error) {
    console.error('Error fetching doctor:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch doctor details',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/consultation/doctors/:id/slots
 * @desc    Get available slots for a doctor on a specific date
 * @access  Public
 */
router.get('/doctors/:id/slots', async (req, res) => {
  try {
    const { date } = req.query;
    const doctorId = req.params.id;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date is required'
      });
    }

    const doctor = await Doctor.findByPk(doctorId);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    // Get existing appointments for this doctor on this date
    const existingAppointments = await withAppointmentsRlsBypass((transaction) => Appointment.findAll({
      where: {
        doctorId,
        appointmentDate: date,
        status: ['pending', 'accepted', 'confirmed', 'in-progress']
      },
      attributes: ['appointmentTime', 'duration'],
      transaction,
    }));

    const bookedSlots = existingAppointments.map(apt => apt.appointmentTime);
    const allSlots = [];
    const startHour = 9;
    const endHour = 21;
    
    for (let hour = startHour; hour < endHour; hour++) {
      for (let min = 0; min < 60; min += 30) {
        const timeStr = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
        const isBooked = isSlotBooked(timeStr, bookedSlots);
        
        // Check if slot is in the past for today
        const slotDate = new Date(`${date}T${timeStr}:00`);
        const isPast = slotDate < new Date();
        
        allSlots.push({
          time: timeStr,
          displayTime: new Date(`2000-01-01T${timeStr}:00`).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          }),
          available: !isBooked && !isPast,
          booked: isBooked,
          isPast
        });
      }
    }

    res.json({
      success: true,
      date,
      doctorId: parseInt(doctorId),
      doctorName: formatDoctorDisplayName({ firstName: doctor.firstName, lastName: doctor.lastName }),
      slots: allSlots,
      availableCount: allSlots.filter(s => s.available).length,
      consultationFee: doctor.onlineConsultationFee || doctor.consultationFees?.online || 500
    });
  } catch (error) {
    console.error('Error fetching slots:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch available slots',
      error: error.message
    });
  }
});

// ============================================
// STEP 2: BOOK APPOINTMENT
// ============================================

/**
 * @route   POST /api/consultation/book
 * @desc    Book an appointment with a doctor
 * @access  Private (Patient)
 */
router.post('/book', authUser, [
  body('doctorId').isInt().withMessage('Valid doctor ID is required'),
  body('appointmentDate').isDate().withMessage('Valid date is required'),
  body('appointmentTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Valid time in HH:MM format is required'),
  body('consultationType').optional().isIn(['online', 'in-person']).withMessage('Invalid consultation type'),
  body('symptoms').optional().isString(),
  body('reason').optional().isString(),
  body('paymentMethod').optional().isIn(['hc', 'wallet', 'razorpay', 'cash']).withMessage('Invalid payment method')
], async (req, res) => {
  let rlsTransaction = null;
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      doctorId,
      appointmentDate,
      appointmentTime,
      consultationType = 'online',
      symptoms,
      reason,
      paymentMethod
    } = req.body;

    // Get patient info
    const patientId = req.user.id || req.user.dataValues?.id;
    const patient = await userModel.findByPk(patientId);
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    // Get doctor info
    const doctor = await Doctor.findByPk(doctorId);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    const canonicalTime = canonicalizeAppointmentTime(appointmentTime);

    // appointments has FORCE ROW LEVEL SECURITY in production. The booking flow
    // must set transaction-scoped RLS context before checking conflicts or
    // inserting, otherwise conflict checks can miss rows and the INSERT fails.
    rlsTransaction = await postgresSequelize.transaction();
    await req.setSequelizeRlsContext?.(rlsTransaction);

    const doctorConflictResult = await checkDoctorConflict(doctorId, appointmentDate, canonicalTime, {
      transaction: rlsTransaction,
    });

    if (doctorConflictResult.conflict) {
      await rlsTransaction.rollback();
      rlsTransaction = null;
      return res.status(409).json({
        success: false,
        message: 'This doctor is not available at the selected time. The time slot is already booked by another patient. Please select a different time slot.',
        conflict: 'doctor_busy'
      });
    }

    const patientConflictResult = await checkPatientConflict(patientId, appointmentDate, canonicalTime, {
      transaction: rlsTransaction,
    });

    if (patientConflictResult.conflict) {
      const conflictDoctorName = patientConflictResult.conflictDoctorName || 'another doctor';
      const patientConflict = patientConflictResult.existingAppointment;

      await rlsTransaction.rollback();
      rlsTransaction = null;

      return res.status(409).json({
        success: false,
        message: `You already have an appointment scheduled at ${appointmentTime} on ${appointmentDate} with ${conflictDoctorName}. You cannot book multiple appointments at the same time. Please select a different time slot or cancel your existing appointment first.`,
        conflict: 'patient_busy',
        existingAppointment: {
          id: patientConflict.id,
          doctorName: conflictDoctorName,
          time: appointmentTime,
          date: appointmentDate
        }
      });
    }

    // Calculate consultation fee
    const listedFee = consultationType === 'online'
      ? (doctor.feeStructure?.online   || doctor.onlineConsultationFee   || doctor.consultationFees || 500)
      : (doctor.feeStructure?.inClinic || doctor.inPersonConsultationFee || doctor.consultationFees || 700);

    // D-23: a member whose plan includes online consultations was still being
    // charged the doctor's full rate. The join path already honoured an active
    // plan, so the member could join for free but was quoted ₹800 to book.
    const entitlement = await getTeleconsultEntitlement(patientId, { consultationType, specialty: doctor.specialization || 'general' });
    const consultationFee = entitlement.covered ? 0 : listedFee;

    // Normalize symptoms to array (handles string, array, null)
    const symptomsArray = toArray(symptoms).length > 0 ? toArray(symptoms)
      : [];

    // Determine initial status based on payment method
    let initialStatus = 'pending'; // Default: waiting for doctor approval
    // Nothing is owed on a plan-covered consultation. The enum has no
    // 'covered' value (adding one needs a migration), so 'paid' with a zero
    // amount is the honest state: no outstanding balance. Provenance goes in
    // paymentDetails so this is never mistaken for a settled card payment.
    let initialPaymentStatus = entitlement.covered ? 'paid' : 'pending';
    let meetingId = null;
    let meetingLink = null;
    let meetingDetails = null;
    let paymentDetails = null;
    let hcPaymentResult = null;
    const normalizedPaymentMethod = String(paymentMethod || '').toLowerCase();
    const isHealthCoinsPayment = ['hc', 'health_coins', 'healthcoins'].includes(normalizedPaymentMethod);

    // If paying with HC immediately, verify and process payment
    if (isHealthCoinsPayment) {
      const canPayResult = await healthCoinsService.canPayWithHC(patientId, consultationFee);
      
      if (!canPayResult.canPay) {
        return res.status(400).json({
          success: false,
          message: `Insufficient Health Coins. You need ${canPayResult.hcRequired} HC but have ${canPayResult.currentBalance} HC`,
          healthCoins: canPayResult,
          consultationFee
        });
      }
    }

    // Create appointment with 'pending' status (waiting for doctor approval)
    const appointment = await Appointment.create({
      userId: patientId,
      patientId: patientId, // Link patient for doctor queries
      patientName: `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || 'Patient',
      patientEmail: patient.email,
      patientPhone: patient.phoneNumber || patient.phone || '',
      doctorId: doctor.id,
      doctorName: formatDoctorDisplayName({ firstName: doctor.firstName, lastName: doctor.lastName }),
      specialization: doctor.specialization,
      appointmentDate,
      appointmentTime,
      duration: 30,
      consultationType,
      status: initialStatus,
      paymentAmount: consultationFee,
      paymentStatus: initialPaymentStatus,
      ...(entitlement.covered ? {
        paymentDetails: {
          method: 'membership_plan',
          coveredByPlan: true,
          planId: entitlement.planId,
          listedFee,
          amountCharged: 0,
          teleconsultsRemainingBefore: entitlement.remaining,
        },
      } : {}),
      symptoms: symptomsArray,
      reason
    }, {
      transaction: rlsTransaction,
    });

    // Spend the teleconsult only once the appointment exists, and inside the
    // same transaction, so a failure cannot burn an allowance with no booking.
    if (entitlement.covered) {
      const consumed = await consumeTeleconsult(
        patientId,
        doctor.specialization || 'general',
        1,
        { transaction: rlsTransaction },
      );
      if (!consumed) {
        // Raced with another booking that spent the last one — charge normally
        // rather than give away a consultation that is no longer covered.
        await appointment.update(
          { paymentAmount: listedFee, paymentStatus: 'pending', paymentDetails: null },
          { transaction: rlsTransaction },
        );
        entitlement.covered = false;
        entitlement.reason = 'teleconsult_allowance_exhausted';
      }
    }

    notifyCareTeamOfBooking({
      appointment,
      patient,
      doctor,
      bookingSource: 'online-consultation'
    });

    // Process HC payment immediately after appointment creation if requested
    if (isHealthCoinsPayment) {
      try {
        // Process HC payment
        hcPaymentResult = await healthCoinsService.payForAppointment(
          patientId,
          appointment.id,
          consultationFee,
          appointment.doctorName
        );

        // Generate meeting link
        const meetingInfo = createMeetingInfo({ appointmentId: appointment.id });
        meetingId = meetingInfo.meetingId;
        meetingLink = meetingInfo.meetingLink;
        meetingDetails = meetingInfo.meetingDetails;

        // Update appointment with confirmed status and payment details
        await appointment.update({
          status: 'confirmed',
          paymentStatus: 'paid',
          paymentDetails: {
            method: 'health_coins',
            transactionId: `HC-${hcPaymentResult.transaction.id}`,
            hcPaid: hcPaymentResult.hcPaid,
            amountINR: consultationFee,
            timestamp: new Date().toISOString()
          },
          meetingId,
          meetingLink,
          meetingDetails,
          notes: `Paid with ${hcPaymentResult.hcPaid} Health Coins (₹${consultationFee} value). Video consultation enabled.`
        }, {
          transaction: rlsTransaction,
        });

        paymentDetails = {
          method: 'health_coins',
          hcPaid: hcPaymentResult.hcPaid,
          consultationFeeINR: consultationFee,
          bonusPercent: hcPaymentResult.bonusPercent,
          newBalance: hcPaymentResult.newBalance,
          transactionId: hcPaymentResult.transaction.id
        };

        console.log(`✅ HC payment successful during booking: User ${patientId} paid ${hcPaymentResult.hcPaid} HC for appointment ${appointment.id}`);
      } catch (hcError) {
        await rlsTransaction.commit();
        rlsTransaction = null;
        // If HC payment fails, keep appointment as pending
        console.error('HC payment failed during booking:', hcError);
        // Don't fail the whole booking, just return with pending payment
        return res.status(201).json({
          success: true,
          message: 'Appointment created but payment failed. Please try paying separately.',
          appointment: {
            id: appointment.id,
            doctorName: appointment.doctorName,
            specialization: appointment.specialization,
            date: appointment.appointmentDate,
            time: appointment.appointmentTime,
            consultationType: appointment.consultationType,
            status: appointment.status,
            consultationFee: appointment.paymentAmount,
            paymentStatus: appointment.paymentStatus
          },
          paymentError: hcError.message
        });
      }
    }

    await rlsTransaction.commit();
    rlsTransaction = null;

    // Send notification to doctor about new appointment request
    try {
      if (isHealthCoinsPayment && hcPaymentResult) {
        // Appointment is confirmed and paid - send payment confirmation
        appointment.meetingLink = meetingLink;
        await notificationService.notifyPaymentReceived(appointment, doctor);
      } else {
        // Appointment is pending - send request notification
        await notificationService.notifyAppointmentRequest(appointment);
      }
    } catch (notifError) {
      console.error('Failed to send notification:', notifError);
      // Don't fail the booking if notification fails
    }

    const responseData = {
      success: true,
      message: isHealthCoinsPayment && hcPaymentResult
        ? `Appointment booked and paid successfully! Paid ${hcPaymentResult.hcPaid} HC for ₹${consultationFee} consultation.`
        : entitlement.covered
          ? 'Appointment request sent to doctor. This consultation is covered by your plan — nothing to pay.'
          : 'Appointment request sent to doctor. Waiting for confirmation.',
      // So the app can say "covered by your plan" instead of showing a price
      // the member does not owe.
      planCoverage: {
        covered: entitlement.covered,
        listedFee,
        amountPayable: consultationFee,
        teleconsultsRemaining: entitlement.covered ? Math.max(0, entitlement.remaining - 1) : entitlement.remaining,
        teleconsultsIncluded: entitlement.limit,
        reason: entitlement.reason,
      },
      appointment: {
        id: appointment.id,
        doctorName: appointment.doctorName,
        specialization: appointment.specialization,
        date: appointment.appointmentDate,
        time: appointment.appointmentTime,
        consultationType: appointment.consultationType,
        status: appointment.status,
        consultationFee: appointment.paymentAmount,
        paymentStatus: appointment.paymentStatus,
        ...(meetingLink && { meetingLink }),
        ...(meetingId && { meetingId })
      }
    };

    // Add payment details if HC was used
    if (paymentDetails) {
      responseData.payment = paymentDetails;
    }

    res.status(201).json(responseData);
  } catch (error) {
    if (rlsTransaction && !rlsTransaction.finished) {
      await rlsTransaction.rollback().catch(() => {});
    }
    console.error('Error booking appointment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to book appointment',
      error: error.message
    });
  }
});

// ============================================
// STEP 3: DOCTOR ACCEPT/REJECT
// ============================================

/**
 * @route   GET /api/consultation/doctor/requests
 * @desc    Get pending appointment requests for doctor
 * @access  Private (Doctor)
 */
router.get('/doctor/requests', authUser, async (req, res) => {
  try {
    const doctorId = req.user.id || req.user.dataValues?.id;
    
    // Verify this is a doctor
    const doctor = await Doctor.findByPk(doctorId);
    if (!doctor) {
      return res.status(403).json({
        success: false,
        message: 'Doctor access required'
      });
    }

    const requests = await withAppointmentsRls(req, (transaction) => Appointment.findAll({
      where: {
        doctorId,
        status: 'pending',
        [Op.and]: [notDemoAccount('Appointment.userId')], // never a shared demo login's booking
      },
      order: [['appointmentDate', 'ASC'], ['appointmentTime', 'ASC']],
      transaction,
    }));

    res.json({
      success: true,
      count: requests.length,
      requests: requests.map(apt => ({
        id: apt.id,
        patientName: apt.patientName,
        patientEmail: apt.patientEmail,
        patientPhone: apt.patientPhone,
        date: apt.appointmentDate,
        time: apt.appointmentTime,
        consultationType: apt.consultationType,
        symptoms: apt.symptoms,
        reason: apt.reason,
        consultationFee: apt.consultationFee,
        createdAt: apt.createdAt
      }))
    });
  } catch (error) {
    console.error('Error fetching requests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch appointment requests',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/consultation/doctor/accept/:appointmentId
 * @desc    Doctor accepts an appointment request
 * @access  Private (Doctor)
 */
router.post('/doctor/accept/:appointmentId', authUser, [
  param('appointmentId').isInt().withMessage('Valid appointment ID required'),
  body('notes').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { appointmentId } = req.params;
    const { notes } = req.body;
    const doctorId = req.user.id || req.user.dataValues?.id;

    const acceptResult = await withAppointmentsRls(req, async (transaction) => {
      const appointment = await Appointment.findByPk(appointmentId, { transaction });
      if (!appointment) return { notFound: true };
      if (Number(appointment.doctorId) !== Number(doctorId)) return { forbidden: true };
      if (appointment.status !== 'pending') return { badStatus: appointment.status };

      // Update appointment status to 'accepted' (payment pending)
      await appointment.update({
        status: 'accepted',
        notes: notes || 'Appointment accepted by doctor. Please complete payment to confirm.'
      }, { transaction });

      return { appointment };
    });

    if (acceptResult.notFound) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    if (acceptResult.forbidden) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to accept this appointment'
      });
    }

    if (acceptResult.badStatus) {
      return res.status(400).json({
        success: false,
        message: `Appointment is already ${acceptResult.badStatus}`
      });
    }

    const appointment = acceptResult.appointment;

    // Get doctor info for notification
    const doctor = await Doctor.findByPk(doctorId);

    // Send notification to patient about acceptance & payment link
    try {
      await notificationService.notifyAppointmentAccepted(appointment, doctor);
    } catch (notifError) {
      console.error('Failed to send acceptance notification:', notifError);
    }

    res.json({
      success: true,
      message: 'Appointment accepted. Waiting for patient payment.',
      appointment: {
        id: appointment.id,
        patientName: appointment.patientName,
        date: appointment.appointmentDate,
        time: appointment.appointmentTime,
        status: 'accepted',
        paymentStatus: appointment.paymentStatus,
        consultationFee: appointment.consultationFee
      }
    });
  } catch (error) {
    console.error('Error accepting appointment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to accept appointment',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/consultation/doctor/reject/:appointmentId
 * @desc    Doctor rejects an appointment request
 * @access  Private (Doctor)
 */
router.post('/doctor/reject/:appointmentId', authUser, [
  param('appointmentId').isInt().withMessage('Valid appointment ID required'),
  body('reason').notEmpty().withMessage('Rejection reason is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { appointmentId } = req.params;
    const { reason } = req.body;
    const doctorId = req.user.id || req.user.dataValues?.id;

    const rejectResult = await withAppointmentsRls(req, async (transaction) => {
      const appointment = await Appointment.findByPk(appointmentId, { transaction });
      if (!appointment) return { notFound: true };
      if (Number(appointment.doctorId) !== Number(doctorId)) return { forbidden: true };
      if (appointment.status !== 'pending') return { badStatus: appointment.status };

      // Update appointment status to 'rejected'
      await appointment.update({
        status: 'cancelled',
        cancelledBy: appointment.doctorId,
        cancellationReason: reason,
        cancelledAt: new Date()
      }, { transaction });

      return { appointment };
    });

    if (rejectResult.notFound) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    if (rejectResult.forbidden) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to reject this appointment'
      });
    }

    if (rejectResult.badStatus) {
      return res.status(400).json({
        success: false,
        message: `Cannot reject appointment with status: ${rejectResult.badStatus}`
      });
    }

    const appointment = rejectResult.appointment;

    // Get doctor info for notification
    const doctor = await Doctor.findByPk(doctorId);

    // Send notification to patient about rejection with reason
    try {
      await notificationService.notifyAppointmentRejected(appointment, doctor, reason);
    } catch (notifError) {
      console.error('Failed to send rejection notification:', notifError);
    }

    res.json({
      success: true,
      message: 'Appointment rejected',
      appointment: {
        id: appointment.id,
        patientName: appointment.patientName,
        status: 'rejected',
        rejectionReason: reason
      }
    });
  } catch (error) {
    console.error('Error rejecting appointment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject appointment',
      error: error.message
    });
  }
});

// ============================================
// STEP 4: PAYMENT
// ============================================

/**
 * @route   POST /api/consultation/payment/initiate/:appointmentId
 * @desc    Initiate payment for accepted appointment
 * @access  Private (Patient)
 */
router.post('/payment/initiate/:appointmentId', authUser, async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const patientId = req.user.id || req.user.dataValues?.id;

    const initiateResult = await withAppointmentsRls(req, async (transaction) => {
      const appointment = await Appointment.findByPk(appointmentId, { transaction });
      if (!appointment) return { notFound: true };
      if (appointment.userId !== patientId) return { forbidden: true };
      if (!['accepted', 'scheduled'].includes(appointment.status)) return { badStatus: appointment.status };
      if (appointment.paymentStatus === 'paid') return { alreadyPaid: true };
      return { appointment };
    });

    if (initiateResult.notFound) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    if (initiateResult.forbidden) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to pay for this appointment'
      });
    }

    if (initiateResult.badStatus) {
      return res.status(400).json({
        success: false,
        message: `Cannot pay for appointment with status: ${initiateResult.badStatus}.`
      });
    }

    if (initiateResult.alreadyPaid) {
      return res.status(400).json({
        success: false,
        message: 'Payment already completed'
      });
    }

    const appointment = initiateResult.appointment;

    // Create Razorpay order
    const amount = parseFloat(appointment.paymentAmount || appointment.consultationFee || 0); // PaymentService converts INR to paise
    const receipt = `apt_${appointmentId}_${Date.now()}`;

    try {
      const orderResult = await paymentService.createOrder({
        amount,
        currency: 'INR',
        receipt,
        notes: {
          appointmentId: appointment.id,
          patientId,
          doctorId: appointment.doctorId,
          type: 'consultation_fee'
        }
      });

      if (!orderResult.success) {
        throw new Error(orderResult.error || 'Failed to create payment order');
      }

      // Store order ID in appointment
      await withAppointmentsRls(req, (transaction) => appointment.update({
        transactionId: orderResult.order.id
      }, { transaction }));

      res.json({
        success: true,
        message: 'Payment order created',
        order: {
          id: orderResult.order.id,
          amount: orderResult.order.amount,
          amountINR: Math.round(orderResult.order.amount / 100 * 100) / 100,
          currency: orderResult.order.currency,
          receipt: orderResult.order.receipt
        },
        appointment: {
          id: appointment.id,
          doctorName: appointment.doctorName,
          date: appointment.appointmentDate,
          time: appointment.appointmentTime,
          consultationFee: appointment.consultationFee
        },
        gatewayConfig: {
          keyId: process.env.RAZORPAY_KEY_ID,
          currency: 'INR'
        }
      });
    } catch (paymentError) {
      console.error('Payment service error:', paymentError);
      res.status(500).json({
        success: false,
        message: 'Payment service unavailable',
        error: paymentError.message
      });
    }
  } catch (error) {
    console.error('Error initiating payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initiate payment',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/consultation/payment/verify/:appointmentId
 * @desc    Verify payment and confirm appointment
 * @access  Private (Patient)
 */
router.post('/payment/verify/:appointmentId', authUser, [
  body('razorpay_order_id').notEmpty(),
  body('razorpay_payment_id').notEmpty(),
  body('razorpay_signature').notEmpty()
], async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body;
    
    const patientId = req.user.id || req.user.dataValues?.id;

    const fetchResult = await withAppointmentsRls(req, async (transaction) => {
      const appointment = await Appointment.findByPk(appointmentId, { transaction });
      if (!appointment) return { notFound: true };
      if (appointment.userId !== patientId) return { forbidden: true };
      return { appointment };
    });

    if (fetchResult.notFound) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    if (fetchResult.forbidden) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    const appointment = fetchResult.appointment;

    // Verify payment signature
    const isValid = paymentService.verifyPaymentSignature({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    });

    if (!isValid) {
      await withAppointmentsRls(req, (transaction) => appointment.update({
        paymentStatus: 'failed'
      }, { transaction }));

      return res.status(400).json({
        success: false,
        message: 'Payment verification failed'
      });
    }

    // Generate meeting link only for video/online consultations
    var isOnlineConsult = ['online', 'video', 'audio', 'chat'].includes(appointment.consultationType);
    var meetingId = null;
    var meetingLink = null;
    var meetingDetails = null;
    if (isOnlineConsult) {
      var meetingInfo = createMeetingInfo({ appointmentId: appointment.id });
      meetingId = meetingInfo.meetingId;
      meetingLink = meetingInfo.meetingLink;
      meetingDetails = meetingInfo.meetingDetails;
    }

    // Update appointment as confirmed with payment
    await withAppointmentsRls(req, (transaction) => appointment.update({
      status: 'confirmed',
      paymentStatus: 'paid',
      paymentMethod: 'razorpay',
      transactionId: razorpay_payment_id,
      ...(meetingId && { meetingId }),
      ...(meetingLink && { meetingLink }),
      ...(meetingDetails && { meetingDetails }),
      notes: isOnlineConsult ? 'Payment received. Video consultation enabled.' : 'Payment received. In-person appointment confirmed.'
    }, { transaction }));

    // Get doctor info for notifications
    const doctor = await Doctor.findByPk(appointment.doctorId);
    // Update appointment with meeting link for notification
    appointment.meetingLink = meetingLink;

    // Send confirmation notifications to patient and doctor
    try {
      await notificationService.notifyPaymentReceived(appointment, doctor);
    } catch (notifError) {
      console.error('Failed to send payment notification:', notifError);
    }

    res.json({
      success: true,
      message: 'Payment successful! Appointment confirmed.',
      appointment: {
        id: appointment.id,
        doctorName: appointment.doctorName,
        date: appointment.appointmentDate,
        time: appointment.appointmentTime,
        status: 'confirmed',
        paymentStatus: 'paid',
        meetingLink,
        meetingId
      }
    });
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify payment',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/consultation/payment/manual/:appointmentId
 * @desc    Admin/Doctor manually confirms payment (for cash, UPI, etc.)
 * @access  Private (Doctor/Admin)
 */
router.post('/payment/manual/:appointmentId', authUser, [
  body('paymentMethod').notEmpty().withMessage('Payment method required'),
  body('transactionRef').optional().isString()
], async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { paymentMethod, transactionRef } = req.body;

    // isOwnedByActor covers both "is the assigned doctor" (via candidate
    // resolution, not a direct doctorId === req.user.id comparison — those
    // are independent id-spaces) and "is an admin" in one check.
    const actor = await resolveActor(req);

    const manualResult = await withAppointmentsRls(req, async (transaction) => {
      const appointment = await Appointment.findByPk(appointmentId, { transaction });
      if (!appointment) return { notFound: true };
      if (!isOwnedByActor(appointment, actor)) return { forbidden: true };

      if (appointment.status !== 'accepted') return { badStatus: appointment.status };

      // Generate meeting link
      const meetingInfo = createMeetingInfo({ appointmentId: appointment.id });
      const { meetingId, meetingLink, meetingDetails } = meetingInfo;

      // Update appointment
      await appointment.update({
        status: 'confirmed',
        paymentStatus: 'paid',
        paymentMethod,
        transactionId: transactionRef || `MANUAL-${Date.now()}`,
        meetingId,
        meetingLink,
        meetingDetails,
        notes: `Payment confirmed manually via ${paymentMethod}. Video consultation enabled.`
      }, { transaction });

      return { appointment, meetingId, meetingLink, meetingDetails };
    });

    if (manualResult.notFound) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    if (manualResult.forbidden) {
      return res.status(403).json({
        success: false,
        message: 'Only doctor or admin can confirm manual payment'
      });
    }

    if (manualResult.badStatus) {
      return res.status(400).json({
        success: false,
        message: `Cannot confirm payment for appointment with status: ${manualResult.badStatus}`
      });
    }

    const appointment = manualResult.appointment;
    const { meetingId, meetingLink, meetingDetails } = manualResult;

    // Get doctor info for notifications
    const doctor = await Doctor.findByPk(appointment.doctorId);
    // Update appointment with meeting link for notification
    appointment.meetingLink = meetingLink;

    // Send confirmation notifications
    try {
      await notificationService.notifyPaymentReceived(appointment, doctor);
    } catch (notifError) {
      console.error('Failed to send payment notification:', notifError);
    }

    res.json({
      success: true,
      message: 'Payment confirmed. Appointment is now active.',
      appointment: {
        id: appointment.id,
        patientName: appointment.patientName,
        date: appointment.appointmentDate,
        time: appointment.appointmentTime,
        status: 'confirmed',
        paymentStatus: 'paid',
        meetingLink,
        meetingId
      }
    });
  } catch (error) {
    console.error('Error confirming manual payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to confirm payment',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/consultation/payment/hc-check/:appointmentId
 * @desc    Check if user can pay for appointment with Health Coins
 * @access  Private (Patient)
 */
router.get('/payment/hc-check/:appointmentId', authUser, async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const patientId = req.user.id || req.user.dataValues?.id;

    const hcCheckResult = await withAppointmentsRls(req, async (transaction) => {
      const appointment = await Appointment.findByPk(appointmentId, { transaction });
      if (!appointment) return { notFound: true };
      if (appointment.userId !== patientId) return { forbidden: true };
      return { appointment };
    });

    if (hcCheckResult.notFound) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    if (hcCheckResult.forbidden) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this appointment'
      });
    }

    const appointment = hcCheckResult.appointment;

    const consultationFee = parseFloat(
      appointment.paymentAmount ?? appointment.consultationFee ?? appointment.paymentDetails?.amountINR ?? 0
    );
    if (!Number.isFinite(consultationFee) || consultationFee <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid consultation fee for this appointment'
      });
    }
    const canPayResult = await healthCoinsService.canPayWithHC(patientId, consultationFee);

    res.json({
      success: true,
      appointment: {
        id: appointment.id,
        doctorName: appointment.doctorName,
        consultationFee: consultationFee,
        status: appointment.status,
        paymentStatus: appointment.paymentStatus
      },
      healthCoins: canPayResult
    });
  } catch (error) {
    console.error('Error checking HC payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check HC payment eligibility',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/consultation/payment/hc/:appointmentId
 * @desc    Pay for appointment using Health Coins
 * @access  Private (Patient)
 */
router.post('/payment/hc/:appointmentId', authUser, async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const patientId = req.user.id || req.user.dataValues?.id;

    const hcPayFetch = await withAppointmentsRls(req, async (transaction) => {
      const appointment = await Appointment.findByPk(appointmentId, { transaction });
      if (!appointment) return { notFound: true };
      if (appointment.userId !== patientId) return { forbidden: true };
      if (!['accepted', 'pending', 'scheduled'].includes(appointment.status)) return { badStatus: appointment.status };
      if (appointment.paymentStatus === 'paid') return { alreadyPaid: true };
      return { appointment };
    });

    if (hcPayFetch.notFound) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    if (hcPayFetch.forbidden) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to pay for this appointment'
      });
    }

    if (hcPayFetch.badStatus) {
      return res.status(400).json({
        success: false,
        message: `Cannot pay for appointment with status: ${hcPayFetch.badStatus}`
      });
    }

    if (hcPayFetch.alreadyPaid) {
      return res.status(400).json({
        success: false,
        message: 'Payment already completed'
      });
    }

    const appointment = hcPayFetch.appointment;

    const consultationFee = parseFloat(
      appointment.paymentAmount ?? appointment.consultationFee ?? appointment.paymentDetails?.amountINR ?? 0
    );
    if (!Number.isFinite(consultationFee) || consultationFee <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid consultation fee for this appointment'
      });
    }
    
    // Check if user can pay with HC
    const canPayResult = await healthCoinsService.canPayWithHC(patientId, consultationFee);
    
    if (!canPayResult.canPay) {
      return res.status(400).json({
        success: false,
        message: `Insufficient Health Coins. You need ${canPayResult.hcRequired} HC but have ${canPayResult.currentBalance} HC`,
        healthCoins: canPayResult
      });
    }

    // Process HC payment
    const paymentResult = await healthCoinsService.payForAppointment(
      patientId,
      appointmentId,
      consultationFee,
      appointment.doctorName
    );

    // Generate meeting link
    const meetingInfo = createMeetingInfo({ appointmentId: appointment.id });
    const { meetingId, meetingLink, meetingDetails } = meetingInfo;

    // Update appointment
    await withAppointmentsRls(req, (transaction) => appointment.update({
      status: 'confirmed',
      paymentStatus: 'paid',
      paymentDetails: {
        method: 'health_coins',
        transactionId: `HC-${paymentResult.transaction.id}`,
        hcPaid: paymentResult.hcPaid,
        amountINR: consultationFee,
        timestamp: new Date().toISOString()
      },
      meetingId,
      meetingLink,
      meetingDetails,
      notes: `Paid with ${paymentResult.hcPaid} Health Coins (₹${consultationFee} value). Video consultation enabled.`
    }, { transaction }));

    // Get doctor info for notifications
    const doctor = await Doctor.findByPk(appointment.doctorId);
    appointment.meetingLink = meetingLink;

    // Send confirmation notifications
    try {
      await notificationService.notifyPaymentReceived(appointment, doctor);
    } catch (notifError) {
      console.error('Failed to send payment notification:', notifError);
    }

    console.log(`✅ HC payment successful: User ${patientId} paid ${paymentResult.hcPaid} HC for appointment ${appointmentId}`);

    res.json({
      success: true,
      message: `Payment successful! Paid ${paymentResult.hcPaid} HC for ₹${consultationFee} consultation.`,
      appointment: {
        id: appointment.id,
        doctorName: appointment.doctorName,
        date: appointment.appointmentDate,
        time: appointment.appointmentTime,
        status: 'confirmed',
        paymentStatus: 'paid',
        meetingLink,
        meetingId
      },
      payment: {
        method: 'health_coins',
        hcPaid: paymentResult.hcPaid,
        consultationFeeINR: consultationFee,
        bonusPercent: paymentResult.bonusPercent,
        newBalance: paymentResult.newBalance,
        transactionId: paymentResult.transaction.id
      }
    });
  } catch (error) {
    console.error('Error processing HC payment:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to process Health Coins payment',
      error: error.message
    });
  }
});

// ============================================
// STEP 5: VIDEO CONSULTATION
// ============================================

/**
 * @route   GET /api/consultation/video/join/:appointmentId
 * @desc    Get video call link for confirmed appointment
 * @access  Private (Patient/Doctor)
 */
router.get('/video/join/:appointmentId', authUser, async (req, res) => {
  try {
    const { appointmentId } = req.params;
    
    // ✅ FIX: Add defensive ID extraction (handle Sequelize dataValues structure)
    const userId = req.user.id || req.user.dataValues?.id;
    const userRole = req.user.role || req.userRole;

    // ✅ DEBUG: Log authentication details for troubleshooting
    console.log('🎥 Video Join Request:', {
      appointmentId,
      userId,
      userRole,
      userFields: Object.keys(req.user),
      hasDirectId: !!req.user.id,
      hasUnderscoreId: !!req.user._id
    });
    
    // ✅ FIX: Validate userId exists before authorization check
    if (!userId) {
      console.error('❌ User ID extraction failed:', req.user);
      return res.status(500).json({
        success: false,
        message: 'Internal error: Unable to identify user'
      });
    }

    // appointments has RLS enforced — without setting the session context,
    // this lookup silently sees zero rows and always 404s, even for the
    // requester's own appointment (same class of bug as the appointments list).
    const rlsTransaction = await postgresSequelize.transaction();
    let appointment;
    try {
      await req.setSequelizeRlsContext?.(rlsTransaction);
      appointment = await findAppointmentFlexible(appointmentId, { transaction: rlsTransaction });
      await rlsTransaction.commit();
    } catch (err) {
      await rlsTransaction.rollback();
      throw err;
    }

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    // Detect emergency triage appointments early for special handling
    const isEmergencyTriage = appointment.sourceChannel === 'emergency_triage' || 
                              appointment.notes_json?.type === 'emergency_triage';

    // Check authorization
    const normalizedUserId = userId ? String(userId) : null;
    const appointmentUserId = appointment.userId ? String(appointment.userId) : null;
    const appointmentDoctorId = appointment.doctorId ? String(appointment.doctorId) : null;
    
    // For emergency triage with null userId (guest), allow any authenticated user or match by appointment ID
    const isEmergencyGuest = isEmergencyTriage && appointmentUserId === null;
    const isPatient = !!(normalizedUserId && appointmentUserId === normalizedUserId);
    const isDoctor = !!(
      normalizedUserId &&
      appointmentDoctorId === normalizedUserId
    ) || userRole === 'doctor';
    
    console.log('🔐 Authorization Check:', { 
      userId, 
      appointmentUserId: appointment.userId, 
      appointmentDoctorId: appointment.doctorId,
      isPatient, 
      isDoctor,
      isEmergencyGuest,
      isEmergencyTriage
    });
    
    // Allow access if: patient, doctor, or emergency guest user
    if (!isPatient && !isDoctor && !isEmergencyGuest) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to join this consultation'
      });
    }

    // Check if appointment is confirmed and paid
    if (appointment.status !== 'confirmed' && appointment.status !== 'in-progress') {
      return res.status(400).json({
        success: false,
        message: `Cannot join video call. Appointment status: ${appointment.status}`,
        currentStatus: appointment.status,
        paymentStatus: appointment.paymentStatus,
        requiresPayment: appointment.paymentStatus !== 'paid'
      });
    }

    // Check payment status - allow emergency triage and nominal/free consults.
    const normalizedPaymentStatus = String(appointment.paymentStatus || '').toLowerCase();
    const isPaymentSettled = normalizedPaymentStatus === 'paid' || normalizedPaymentStatus === 'credit';
    const consultationFee = Number(appointment.consultationFee ?? appointment.paymentAmount ?? 0);
    const isNominalOrFreeConsultation = Number.isFinite(consultationFee) && consultationFee <= 1;
    const isMembershipRenewalExempt = await isMembershipRenewalExemptUser({
      userId: appointment.userId,
      email: req.user?.email
    });
    const isPaymentValid =
      isPaymentSettled ||
      isEmergencyTriage ||
      isNominalOrFreeConsultation ||
      isMembershipRenewalExempt;

    if (!isPaymentValid) {
      // Check if user has an active membership plan
      const activePlan = await UserPlan.findOne({
        where: {
          userId: appointment.userId,
          status: 'active',
          startDate: { [Op.lte]: new Date() },
          endDate: { [Op.gte]: new Date() }
        }
      });

      if (!activePlan) {
        return res.status(402).json({
          success: false,
          message: 'Payment required before joining video consultation',
          consultationFee: appointment.consultationFee,
          suggestion: 'You can pay with Health Coins or subscribe to a membership plan'
        });
      }
    }

    // Check if within appointment window
    // Skip timing check for:
    //   - Emergency triage appointments (immediate access)
    //   - Doctors (they manage their own schedule)
    //   - Doctor-initiated calls (doctor already validated timing on their side)
    const isDoctorInitiated = appointment.callInitiatedBy === 'doctor' && appointment.callInitiatedAt;

    if (!isEmergencyTriage && !isDoctor && !isDoctorInitiated) {
      // Use IST-aware same-day check: appointment date must match today (IST)
      const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      const todayIST = nowIST.toISOString().slice(0, 10);
      const aptDate = String(appointment.appointmentDate).slice(0, 10);

      if (aptDate !== todayIST) {
        // Allow joining 1 day before or if appointment is today
        const aptDateObj = new Date(aptDate);
        const todayDateObj = new Date(todayIST);
        const diffDays = Math.round((aptDateObj - todayDateObj) / (1000 * 60 * 60 * 24));

        if (diffDays > 0) {
          return res.status(400).json({
            success: false,
            message: 'Video call will be available on the day of your appointment',
            appointmentDate: aptDate,
            today: todayIST
          });
        }

        if (diffDays < -1) {
          return res.status(400).json({
            success: false,
            message: 'This appointment has already passed',
            appointmentDate: aptDate
          });
        }
      }
    } else if (isEmergencyTriage) {
      console.log('⚡ Emergency triage appointment - bypassing timing window check');
    } else if (isDoctor) {
      console.log('👨‍⚕️ Doctor joining - bypassing timing window check');
    } else if (isDoctorInitiated) {
      console.log('📞 Doctor-initiated call - bypassing timing window check for patient join');
    }

    // Generate or get meeting link
    const meetingInfo = ensureMeetingInfo(appointment);
    let { meetingId, meetingLink, meetingDetails, provider } = meetingInfo;

    if (meetingInfo.needsUpdate) {
      await withAppointmentsRls(req, (transaction) => appointment.update({ meetingId, meetingLink, meetingDetails }, { transaction }));
    }

    // Update status to in-progress if first join
    if (appointment.status === 'confirmed') {
      await withAppointmentsRls(req, (transaction) => appointment.update({ status: 'in-progress' }, { transaction }));
      
      // Send consultation started notification
      try {
        appointment.meetingLink = meetingLink;
        await notificationService.notifyConsultationStarting(appointment);
      } catch (notifError) {
        console.error('Failed to send consultation started notification:', notifError);
      }
    }

    const participantName = isDoctor ? appointment.doctorName : appointment.patientName;
    const videoPayload = {
      meetingLink,
      meetingId,
      platform: getProviderLabel(provider)
    };

    if (provider === 'livekit') {
      const livekitData = await buildLiveKitJoinData({
        meetingId,
        identity: `${userRole || 'user'}-${userId}`,
        name: participantName
      });
      videoPayload.livekit = livekitData;
      videoPayload.joinUrl = livekitData.joinUrl;
      if (!videoPayload.meetingLink) {
        videoPayload.meetingLink = livekitData.meetUrl;
      }
    }

    // Real-time "doctor is calling" signal to the patient — socket push for
    // an actively-connected screen, FCM push for when the app is backgrounded,
    // plus a persistent Notification record. This is distinct from
    // notifyConsultationStarting above (a generic, template-based
    // notification that only fires once per appointment on whichever side
    // joins first, and never does real-time socket delivery) — previously
    // nothing in this endpoint told an already-waiting patient that the
    // doctor had actually joined and started the call.
    //
    // Guarded by callInitiatedAt (a real column this route already reads
    // for isDoctorInitiated, but never wrote to) so a doctor's browser
    // refresh or reconnect mid-call doesn't re-ring the patient every time
    // they hit this same join endpoint — only a genuinely fresh call start
    // (no prior call, or the last one was over 5 minutes ago) notifies.
    const lastCallInitiatedAt = appointment.callInitiatedAt ? new Date(appointment.callInitiatedAt).getTime() : 0;
    const isFreshCallStart = Date.now() - lastCallInitiatedAt > 5 * 60 * 1000;

    if (isDoctor && isFreshCallStart) {
      await withAppointmentsRls(req, (transaction) => appointment.update(
        { callInitiatedBy: 'doctor', callInitiatedAt: new Date() },
        { transaction },
      )).catch((err) => console.error('[VideoJoin] failed to record callInitiatedAt:', err.message));

      notifyPatientDoctorIsCalling({
        appointment,
        doctorName: appointment.doctorName,
        meetingId,
        meetingLink: videoPayload.meetingLink,
        joinUrl: videoPayload.joinUrl,
        serverUrl: videoPayload.livekit?.serverUrl || '',
      }).catch((err) => console.error('[VideoJoin] doctor-calling notification failed:', err.message));
    }

    res.json({
      success: true,
      message: 'Video consultation ready',
      video: {
        ...videoPayload
      },
      appointment: {
        id: appointment.id,
        doctorName: appointment.doctorName,
        patientName: appointment.patientName,
        date: appointment.appointmentDate,
        time: appointment.appointmentTime,
        status: 'in-progress'
      },
      role: isDoctor ? 'doctor' : 'patient'
    });
  } catch (error) {
    console.error('Error getting video link:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get video consultation link',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/consultation/video/end/:appointmentId
 * @desc    End video consultation
 * @access  Private (Doctor)
 */
router.post('/video/end/:appointmentId', authUser, [
  body('notes').optional().isString(),
  body('prescription').optional().isString()
], async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { notes, prescription } = req.body;

    const actor = await resolveActor(req);
    if (actor.type === 'patient') {
      return res.status(403).json({ success: false, message: 'Unauthorized access' });
    }

    const videoEndResult = await withAppointmentsRls(req, async (transaction) => {
      const appointment = await Appointment.findByPk(appointmentId, { transaction });
      if (!appointment) return { notFound: true };
      if (!isOwnedByActor(appointment, actor)) return { forbidden: true };

      await appointment.update({
        status: 'completed',
        notes: notes || appointment.notes,
        prescription
      }, { transaction });

      return { appointment };
    });

    if (videoEndResult.notFound) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    if (videoEndResult.forbidden) {
      return res.status(403).json({
        success: false,
        message: 'Only the doctor can end the consultation'
      });
    }

    const appointment = videoEndResult.appointment;

    // Send consultation completed notification
    try {
      const doctor = await Doctor.findByPk(doctorId);
      await notificationService.notifyConsultationCompleted(appointment, doctor);
    } catch (notifError) {
      console.error('Failed to send consultation completed notification:', notifError);
    }

    res.json({
      success: true,
      message: 'Consultation completed',
      appointment: {
        id: appointment.id,
        status: 'completed',
        patientName: appointment.patientName
      }
    });
  } catch (error) {
    console.error('Error ending consultation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to end consultation',
      error: error.message
    });
  }
});

// ============================================
// PATIENT APPOINTMENT TRACKING
// ============================================

/**
 * @route   GET /api/consultation/my-appointments
 * @desc    Get patient's appointments with status
 * @access  Private (Patient)
 */
router.get('/my-appointments', authUser, async (req, res) => {
  try {
    const patientId = req.user.id || req.user.dataValues?.id;
    const { status, upcoming } = req.query;

    const where = { userId: patientId };
    
    if (status) {
      where.status = status;
    }

    const appointments = await withAppointmentsRls(req, (transaction) => Appointment.findAll({
      where,
      order: [['appointmentDate', 'DESC'], ['appointmentTime', 'DESC']],
      transaction,
    }));

    // Categorize appointments
    const now = new Date();
    const categorized = {
      pending: [],
      accepted: [],
      confirmed: [],
      upcoming: [],
      past: [],
      cancelled: []
    };

    const patientIsMembershipRenewalExempt = isMembershipRenewalExemptEmail(req.user?.email);

    appointments.forEach(apt => {
      const aptDateTime = new Date(`${apt.appointmentDate}T${apt.appointmentTime}`);
      const normalizedPaymentStatus = String(apt.paymentStatus || '').toLowerCase();
      const consultationFee = Number(apt.consultationFee ?? apt.paymentAmount ?? 0);
      const isNominalOrFreeConsultation = Number.isFinite(consultationFee) && consultationFee <= 1;
      const isVideoPaymentEligible =
        ['paid', 'credit'].includes(normalizedPaymentStatus) ||
        isNominalOrFreeConsultation ||
        patientIsMembershipRenewalExempt;
      const aptData = {
        id: apt.id,
        doctorName: apt.doctorName,
        specialization: apt.specialization,
        date: apt.appointmentDate,
        time: apt.appointmentTime,
        consultationType: apt.consultationType,
        status: apt.status,
        paymentStatus: apt.paymentStatus,
        isMembershipRenewalExemptUser: patientIsMembershipRenewalExempt,
        paymentStatusEffective:
          !['paid', 'credit'].includes(normalizedPaymentStatus) && patientIsMembershipRenewalExempt
            ? 'credit'
            : apt.paymentStatus,
        consultationFee: apt.consultationFee,
        meetingLink: apt.status === 'confirmed' ? apt.meetingLink : null,
        canJoinVideo:
          apt.status === 'confirmed' &&
          isVideoPaymentEligible,
        createdAt: apt.createdAt
      };

      if (apt.status === 'pending') {
        categorized.pending.push(aptData);
      } else if (apt.status === 'accepted') {
        categorized.accepted.push(aptData);
      } else if (apt.status === 'confirmed' && aptDateTime > now) {
        categorized.confirmed.push(aptData);
        categorized.upcoming.push(aptData);
      } else if (apt.status === 'cancelled') {
        categorized.cancelled.push(aptData);
      } else if (aptDateTime < now || apt.status === 'completed') {
        categorized.past.push(aptData);
      }
    });

    res.json({
      success: true,
      total: appointments.length,
      appointments: categorized
    });
  } catch (error) {
    console.error('Error fetching appointments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch appointments',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/consultation/doctor/appointments
 * @desc    Get doctor's appointments
 * @access  Private (Doctor)
 */
router.get('/doctor/appointments', authUser, async (req, res) => {
  try {
    const doctorId = req.user.id || req.user.dataValues?.id;
    const { status, date } = req.query;

    // Verify doctor
    const doctor = await Doctor.findByPk(doctorId);
    if (!doctor) {
      return res.status(403).json({
        success: false,
        message: 'Doctor access required'
      });
    }

    const where = { doctorId };
    
    if (status) {
      where.status = status;
    }
    if (date) {
      where.appointmentDate = date;
    }

    const appointments = await withAppointmentsRls(req, (transaction) => Appointment.findAll({
      where,
      order: [['appointmentDate', 'ASC'], ['appointmentTime', 'ASC']],
      transaction,
    }));

    // Categorize
    const now = new Date();
    const categorized = {
      pendingRequests: [],
      todaySchedule: [],
      upcoming: [],
      completed: []
    };

    const today = now.toISOString().split('T')[0];

    const patientIds = [...new Set(appointments.map((apt) => apt.userId).filter(Boolean))];
    const patientRows = patientIds.length
      ? await userModel.findAll({
          attributes: ['id', 'email'],
          where: { id: { [Op.in]: patientIds } }
        })
      : [];
    const exemptPatientIds = new Set(
      patientRows
        .filter((user) => isMembershipRenewalExemptEmail(user.email))
        .map((user) => Number(user.id))
    );

    appointments.forEach(apt => {
      const normalizedPaymentStatus = String(apt.paymentStatus || '').toLowerCase();
      const consultationFee = Number(apt.consultationFee ?? apt.paymentAmount ?? 0);
      const isNominalOrFreeConsultation = Number.isFinite(consultationFee) && consultationFee <= 1;
      const isMembershipRenewalExempt = exemptPatientIds.has(Number(apt.userId));
      const isVideoPaymentEligible =
        ['paid', 'credit'].includes(normalizedPaymentStatus) ||
        isNominalOrFreeConsultation ||
        isMembershipRenewalExempt;

      const aptData = {
        id: apt.id,
        patientName: apt.patientName,
        patientPhone: apt.patientPhone,
        date: apt.appointmentDate,
        time: apt.appointmentTime,
        consultationType: apt.consultationType,
        status: apt.status,
        paymentStatus: apt.paymentStatus,
        isMembershipRenewalExemptUser: isMembershipRenewalExempt,
        paymentStatusEffective:
          !['paid', 'credit'].includes(normalizedPaymentStatus) && isMembershipRenewalExempt
            ? 'credit'
            : apt.paymentStatus,
        symptoms: apt.symptoms,
        reason: apt.reason,
        meetingLink: apt.meetingLink,
        canStartVideo:
          apt.status === 'confirmed' &&
          isVideoPaymentEligible
      };

      if (apt.status === 'pending') {
        categorized.pendingRequests.push(aptData);
      } else if (apt.appointmentDate === today && ['accepted', 'confirmed', 'in-progress'].includes(apt.status)) {
        categorized.todaySchedule.push(aptData);
      } else if (apt.status === 'confirmed' && new Date(`${apt.appointmentDate}T${apt.appointmentTime}`) > now) {
        categorized.upcoming.push(aptData);
      } else if (apt.status === 'completed') {
        categorized.completed.push(aptData);
      }
    });

    res.json({
      success: true,
      pendingCount: categorized.pendingRequests.length,
      todayCount: categorized.todaySchedule.length,
      appointments: categorized
    });
  } catch (error) {
    console.error('Error fetching doctor appointments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch appointments',
      error: error.message
    });
  }
});

// ============================================
// CONSULTATION CHAT ENDPOINTS
// ============================================

// In-memory store for consultation chat messages with automatic cleanup
const consultationChats = new Map();
const MAX_CHAT_ENTRIES = 500; // Limit to prevent memory leak
const CHAT_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Cleanup old chat entries every hour
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of consultationChats.entries()) {
    if (value.lastActivity && (now - value.lastActivity > CHAT_TTL)) {
      consultationChats.delete(key);
    }
  }
  // Also enforce max size
  if (consultationChats.size > MAX_CHAT_ENTRIES) {
    const keysToDelete = Array.from(consultationChats.keys()).slice(0, consultationChats.size - MAX_CHAT_ENTRIES);
    keysToDelete.forEach(k => consultationChats.delete(k));
  }
  console.log(`🧹 Cleaned up consultation chats. Current size: ${consultationChats.size}`);
}, 60 * 60 * 1000); // Every hour

/**
 * @route   GET /api/consultation/chat/conversations
 * @desc    Get user's consultation chat conversations
 * @access  Private
 */
router.get('/chat/conversations', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    
    // Get appointments for this user/doctor
    const where = userRole === 'doctor' 
      ? { doctorId: userId }
      : { patientId: userId };
    
    const appointments = await withAppointmentsRls(req, (transaction) => Appointment.findAll({
      where,
      attributes: ['id', 'doctorId', 'patientId', 'patientName', 'doctorName', 'status', 'appointmentDate', 'appointmentTime'],
      order: [['updatedAt', 'DESC']],
      limit: 50,
      transaction,
    }));
    
    // Build conversations from appointments with chat enabled
    const conversations = await Promise.all(appointments.map(async (apt) => {
      const chatKey = `chat_${apt.id}`;
      const messages = consultationChats.get(chatKey) || [];
      const lastMessage = messages[messages.length - 1];
      const unreadCount = messages.filter(m => 
        m.receiverId === userId && !m.read
      ).length;
      
      // Get other party info
      let otherParty;
      if (userRole === 'doctor') {
        otherParty = {
          id: apt.patientId,
          name: apt.patientName || 'Patient',
          type: 'patient'
        };
      } else {
        const doctor = await Doctor.findByPk(apt.doctorId, {
          attributes: ['id', 'firstName', 'lastName', 'specialization', 'profileImage']
        });
        otherParty = {
          id: apt.doctorId,
          name: doctor ? `Dr. ${doctor.firstName} ${doctor.lastName}` : apt.doctorName || 'Doctor',
          specialization: doctor?.specialization,
          profileImage: doctor?.profileImage,
          type: 'doctor'
        };
      }
      
      return {
        id: chatKey,
        appointmentId: apt.id,
        participant: otherParty,
        lastMessage: lastMessage ? {
          text: lastMessage.text,
          timestamp: lastMessage.createdAt,
          senderId: lastMessage.senderId
        } : null,
        unreadCount,
        appointmentDate: apt.appointmentDate,
        appointmentTime: apt.appointmentTime,
        status: apt.status
      };
    }));
    
    res.json({
      success: true,
      conversations: conversations.filter(c => c.lastMessage || c.status === 'confirmed')
    });
  } catch (error) {
    console.error('Error fetching chat conversations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch conversations',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/consultation/chat/:appointmentId/messages
 * @desc    Get messages for a consultation chat
 * @access  Private
 */
router.get('/chat/:appointmentId/messages', authUser, async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { limit = 50, before } = req.query;
    // Used only for the in-memory chat read-receipt system below, which
    // stores receiverId as raw req.user.id/appointment.doctorId — a
    // separate, pre-existing convention from appointment ownership.
    const userId = req.user.id;

    const actor = await resolveActor(req);
    const appointment = actor.type === 'doctor'
      ? await appointmentRepository.findByIdForDoctor(req, appointmentId)
      : await withAppointmentsRls(req, (transaction) => Appointment.findByPk(appointmentId, { transaction }));
    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    if (!isOwnedByActor(appointment, actor)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const chatKey = `chat_${appointmentId}`;
    let messages = consultationChats.get(chatKey) || [];
    
    // Filter and limit messages
    if (before) {
      messages = messages.filter(m => new Date(m.createdAt) < new Date(before));
    }
    messages = messages.slice(-parseInt(limit));
    
    // Mark messages as read
    messages.forEach(m => {
      if (m.receiverId === userId) {
        m.read = true;
        m.readAt = new Date().toISOString();
      }
    });
    consultationChats.set(chatKey, messages);
    
    // Get participant info
    const isDoctor = req.user.role === 'doctor';
    let participant;
    if (isDoctor) {
      participant = {
        id: appointment.patientId,
        name: appointment.patientName,
        type: 'patient'
      };
    } else {
      const doctor = await Doctor.findByPk(appointment.doctorId, {
        attributes: ['id', 'firstName', 'lastName', 'specialization', 'profileImage']
      });
      participant = {
        id: appointment.doctorId,
        name: doctor ? `Dr. ${doctor.firstName} ${doctor.lastName}` : 'Doctor',
        specialization: doctor?.specialization,
        profileImage: doctor?.profileImage,
        type: 'doctor'
      };
    }
    
    res.json({
      success: true,
      appointmentId,
      participant,
      messages: messages.map(m => ({
        id: m.id,
        text: m.text,
        senderId: m.senderId,
        senderType: m.senderType,
        receiverId: m.receiverId,
        read: m.read,
        createdAt: m.createdAt,
        attachments: m.attachments || []
      })),
      appointmentStatus: appointment.status
    });
  } catch (error) {
    console.error('Error fetching chat messages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch messages',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/consultation/chat/:appointmentId/messages
 * @desc    Send a message in consultation chat
 * @access  Private
 */
router.post('/chat/:appointmentId/messages', authUser, [
  body('text').notEmpty().withMessage('Message text is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    
    const { appointmentId } = req.params;
    const { text, attachments } = req.body;
    const userId = req.user.id;

    // Verify user has access
    const actor = await resolveActor(req);
    const appointment = actor.type === 'doctor'
      ? await appointmentRepository.findByIdForDoctor(req, appointmentId)
      : await withAppointmentsRls(req, (transaction) => Appointment.findByPk(appointmentId, { transaction }));
    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    if (!isOwnedByActor(appointment, actor)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const isDoctor = actor.type === 'doctor';
    
    const chatKey = `chat_${appointmentId}`;
    const messages = consultationChats.get(chatKey) || [];
    
    const newMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      text,
      senderId: userId,
      senderType: isDoctor ? 'doctor' : 'patient',
      receiverId: isDoctor ? appointment.patientId : appointment.doctorId,
      receiverType: isDoctor ? 'patient' : 'doctor',
      read: false,
      createdAt: new Date().toISOString(),
      attachments: attachments || []
    };
    
    messages.push(newMessage);
    consultationChats.set(chatKey, messages);
    
    // TODO: Send real-time notification via socket.io
    // TODO: Send push notification
    
    res.json({
      success: true,
      message: newMessage
    });
  } catch (error) {
    console.error('Error sending chat message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/consultation/chat/:appointmentId/read
 * @desc    Mark messages as read
 * @access  Private
 */
router.post('/chat/:appointmentId/read', authUser, async (req, res) => {
  try {
    const { appointmentId } = req.params;
    // Used only for the in-memory chat read-receipt system below.
    const userId = req.user.id;

    // Verify access
    const actor = await resolveActor(req);
    const appointment = actor.type === 'doctor'
      ? await appointmentRepository.findByIdForDoctor(req, appointmentId)
      : await withAppointmentsRls(req, (transaction) => Appointment.findByPk(appointmentId, { transaction }));
    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    if (!isOwnedByActor(appointment, actor)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    const chatKey = `chat_${appointmentId}`;
    const messages = consultationChats.get(chatKey) || [];
    
    // Mark all messages to this user as read
    let readCount = 0;
    messages.forEach(m => {
      if (m.receiverId === userId && !m.read) {
        m.read = true;
        m.readAt = new Date().toISOString();
        readCount++;
      }
    });
    consultationChats.set(chatKey, messages);
    
    res.json({
      success: true,
      readCount
    });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark messages as read',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/consultation/chat/unread-count
 * @desc    Get total unread message count
 * @access  Private
 */
router.get('/chat/unread-count', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    
    // Get user's appointments
    const where = userRole === 'doctor'
      ? { doctorId: userId }
      : { patientId: userId };
    
    const appointments = await withAppointmentsRls(req, (transaction) => Appointment.findAll({
      where,
      attributes: ['id'],
      limit: 100,
      transaction,
    }));
    
    let totalUnread = 0;
    appointments.forEach(apt => {
      const chatKey = `chat_${apt.id}`;
      const messages = consultationChats.get(chatKey) || [];
      totalUnread += messages.filter(m => 
        m.receiverId === userId && !m.read
      ).length;
    });
    
    res.json({
      success: true,
      unreadCount: totalUnread
    });
  } catch (error) {
    console.error('Error getting unread count:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get unread count',
      error: error.message
    });
  }
});

// GET /api/consultation/calls — the patient's video/audio call history.
router.get('/calls', authUser, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const rows = await Appointment.findAll({
      where: {
        userId: req.user.id,
        [Op.or]: [
          { consultationType: { [Op.in]: ['online', 'video', 'audio'] } },
          { channel: { [Op.in]: ['video', 'online'] } },
        ],
      },
      order: [['appointmentDate', 'DESC'], ['appointmentTime', 'DESC']],
      limit,
    });
    const calls = rows.map((a) => ({
      id: String(a.id),
      doctorName: a.doctorName || null,
      specialization: a.specialization || null,
      date: a.appointmentDate,
      time: a.appointmentTime,
      type: a.consultationType || a.channel || 'online',
      status: a.status,
      durationMinutes: a.metadata?.callDurationMinutes ?? null,
    }));
    return res.json({ success: true, calls });
  } catch (e) {
    console.error('[consultation] call history error:', e.message);
    return res.json({ success: true, calls: [] });
  }
});

export default router;
