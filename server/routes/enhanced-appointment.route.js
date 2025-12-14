import express from 'express';
import { body, param, query } from 'express-validator';
import { Op } from 'sequelize';
import { authUser } from '../middleware/auth.middleware.js';
import doctorModel from '../models/doctor.model.intelligent.js';
import userModel from '../models/user.model.intelligent.js';
import Appointment from '../models/appointment.model.intelligent.js';

const router = express.Router();

const toPlainRecord = (record) => {
  if (!record) return null;
  if (typeof record.toJSON === 'function') {
    return record.toJSON();
  }
  if (typeof record.get === 'function') {
    return record.get({ plain: true });
  }
  return record;
};

const calculateAge = (dateOfBirth) => {
  if (!dateOfBirth) return undefined;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return undefined;
  const diff = Date.now() - dob.getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
};

/**
 * @route   POST /api/enhanced-appointments/book
 * @desc    Book an appointment with enhanced doctor features
 *          NOTE: For production, prefer /api/appointments (DB-backed).
 *          This route now creates a DB-backed Appointment instead of in-memory.
 * @access  Private (Patient)
 */
router.post('/book', authUser, [
  body('doctorId').notEmpty().withMessage('Doctor ID is required'),
  body('appointmentDate').isDate().withMessage('Valid appointment date is required'),
  body('timeSlot').notEmpty().withMessage('Time slot is required'),
  body('consultationType').isIn(['online', 'walkIn', 'homeVisit']).withMessage('Valid consultation type is required'),
  body('preferredLanguage').optional().isString(),
  body('symptoms').optional().isString(),
  body('notes').optional().isString(),
  body('emergencyContact').optional().isString(),
  body('patientAddress').optional().isObject(),
  body('insuranceDetails').optional().isObject()
], async (req, res) => {
  try {
    const { 
      doctorId, 
      appointmentDate, 
      timeSlot, 
      consultationType, 
      preferredLanguage,
      symptoms, 
      notes, 
      emergencyContact,
      patientAddress,
      insuranceDetails
    } = req.body;
    
    // Get doctor details
    const doctor = await doctorModel.findByPk(doctorId);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    // Check if doctor is verified
    if (!doctor.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'Doctor is not verified yet'
      });
    }

    // Check if doctor offers this consultation type
    if (!doctor.consultationTypes[consultationType]?.available) {
      return res.status(400).json({
        success: false,
        message: `Doctor does not offer ${consultationType} consultations`
      });
    }

    // Check if doctor speaks the preferred language
    if (preferredLanguage && !doctor.languages.includes(preferredLanguage)) {
      return res.status(400).json({
        success: false,
        message: `Doctor does not speak ${preferredLanguage}`
      });
    }

    // Get appointment day
    const appointmentDay = new Date(appointmentDate).toLocaleDateString('en-US', { weekday: 'lowercase' });
    
    // Check if doctor is available on this day
    const dayAvailability = doctor.weeklyAvailability[appointmentDay];
    if (!dayAvailability?.isAvailable) {
      return res.status(400).json({
        success: false,
        message: `Doctor is not available on ${appointmentDay}`
      });
    }

    // Validate time slot format and availability
    const [startTime, endTime] = timeSlot.split('-');
    if (!startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: 'Invalid time slot format. Expected format: HH:MM-HH:MM'
      });
    }

    const slotAvailable = dayAvailability.slots.some(slot => 
      slot.startTime <= startTime && 
      slot.endTime >= endTime && 
      (slot.consultationType === consultationType || slot.consultationType === 'both')
    );

    if (!slotAvailable) {
      return res.status(400).json({
        success: false,
        message: 'Requested time slot is not available for this consultation type'
      });
    }

    // Check for existing appointments at this time (DB-backed)
    const existingAppointment = await Appointment.findOne({
      where: {
        doctorId,
        appointmentDate,
        appointmentTime: startTime,
        status: {
          [Op.notIn]: ['cancelled', 'no-show']
        }
      }
    });

    if (existingAppointment) {
      return res.status(400).json({
        success: false,
        message: 'Time slot already booked'
      });
    }

    // Get user details
    const patientInstance = await userModel.findByPk(req.user.id, {
      attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber', 'dateOfBirth', 'gender', 'address']
    });
    if (!patientInstance) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }
    const patient = toPlainRecord(patientInstance);
    const patientName = [patient.firstName, patient.lastName].filter(Boolean).join(' ').trim() || patient.name || 'Patient';
    const patientPhone = patient.phoneNumber || req.user.phoneNumber || emergencyContact || null;
    const patientGender = patient.gender || 'Not specified';
    const patientAge = patient.dateOfBirth ? calculateAge(patient.dateOfBirth) : patient.age;

    // Generate meeting details
    const meetingRoom = consultationType === 'online' ? `mediczy-room-${Date.now()}` : null;
    
    // Calculate fees
    const baseFee = doctor.consultationTypes[consultationType].fee;
    const serviceFee = Math.round(baseFee * 0.1); // 10% service fee
    const totalFee = baseFee + serviceFee;

    // Create DB-backed appointment (minimal canonical fields)
    const dbAppointment = await Appointment.create({
      userId: req.user.id,
      doctorId,
      appointmentDate,
      appointmentTime: startTime,
      consultationType,
      symptoms: symptoms || '',
      reason: notes || '',
      status: 'scheduled',
      paymentStatus: 'pending'
    });

    // Build enhanced view object (keeps previous response shape as much as possible)
    const appointment = {
      id: dbAppointment.id,
      appointmentNumber: `MED${String(dbAppointment.id).padStart(6, '0')}`,
      patientId: req.user.id,
      doctorId,
      appointmentDate,
      timeSlot,
      consultationType,
      preferredLanguage: preferredLanguage || 'English',
      symptoms: symptoms || '',
      notes: notes || '',
      emergencyContact: emergencyContact || patientPhone,
      patientAddress: patientAddress || patient.address || {},
      insuranceDetails: insuranceDetails || {},
      status: dbAppointment.status,
      bookingTime: dbAppointment.createdAt?.toISOString?.() || new Date().toISOString(),
      fees: {
        consultationFee: baseFee,
        serviceFee,
        totalFee,
        currency: 'INR'
      },
      paymentStatus: dbAppointment.paymentStatus,
      meetingDetails: {
        meetingLink: consultationType === 'online' ? `https://meet.mediczy.com/${meetingRoom}` : null,
        roomId: meetingRoom,
        joinInstructions: consultationType === 'online' ? 'Click the meeting link 5 minutes before your appointment' : null
      },
      patient: {
        name: patientName,
        email: patient.email,
        phoneNumber: patientPhone,
        age: patientAge,
        gender: patientGender
      },
      doctor: {
        name: `${doctor.prefix} ${doctor.firstName} ${doctor.lastName}`,
        specialization: doctor.specialization,
        subSpecialization: doctor.subSpecialization,
        phoneNumber: doctor.phoneNumber,
        email: doctor.email,
        clinicName: doctor.clinicHospitalName,
        address: doctor.practiceAddress,
        languages: doctor.languages,
        experience: doctor.experienceYears,
        profilePicture: doctor.mediaUploads?.profilePicture,
        digitalSignature: doctor.mediaUploads?.digitalSignature
      },
      reminders: {
        emailSent: false,
        smsSent: false,
        reminderTime24h: new Date(new Date(appointmentDate).getTime() - 24 * 60 * 60 * 1000).toISOString(),
        reminderTime1h: new Date(new Date(`${appointmentDate} ${startTime}`).getTime() - 60 * 60 * 1000).toISOString()
      }
    };

    // Simulate sending confirmation notifications
    setTimeout(() => {
      console.log(`📧 Appointment confirmation sent to ${patient.email}`);
      if (patientPhone) {
        console.log(`📱 SMS confirmation sent to ${patientPhone}`);
      }
      console.log(`📧 New appointment notification sent to ${doctor.email}`);
    }, 1000);

    res.status(201).json({
      success: true,
      message: 'Appointment booked successfully',
      appointment: {
        ...appointment,
        // Don't send sensitive doctor info to patient
        doctor: {
          name: appointment.doctor.name,
          specialization: appointment.doctor.specialization,
          clinicName: appointment.doctor.clinicName,
          experience: appointment.doctor.experience,
          profilePicture: appointment.doctor.profilePicture
        }
      }
    });
  } catch (error) {
    console.error('Book appointment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to book appointment',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/enhanced-appointments/available-slots
 * @desc    Get available time slots with enhanced features
 * @access  Public
 */
router.get('/available-slots', [
  query('doctorId').notEmpty().withMessage('Doctor ID is required'),
  query('date').isDate().withMessage('Valid date is required'),
  query('consultationType').isIn(['online', 'walkIn', 'homeVisit']).withMessage('Valid consultation type is required'),
  query('language').optional().isString()
], async (req, res) => {
  try {
    const { doctorId, date, consultationType, language } = req.query;
    
    // Get doctor details
    const doctor = await doctorModel.findByPk(doctorId);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    // Check verification status
    if (!doctor.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'Doctor is not verified'
      });
    }

    // Check if doctor offers this consultation type
    if (!doctor.consultationTypes[consultationType]?.available) {
      return res.json({
        success: true,
        availableSlots: [],
        message: `Doctor does not offer ${consultationType} consultations`
      });
    }

    // Check language requirement
    if (language && !doctor.languages.includes(language)) {
      return res.json({
        success: true,
        availableSlots: [],
        message: `Doctor does not speak ${language}`
      });
    }

    // Check if date is in the past
    const today = new Date();
    const appointmentDate = new Date(date);
    if (appointmentDate < today.setHours(0, 0, 0, 0)) {
      return res.json({
        success: true,
        availableSlots: [],
        message: 'Cannot book appointments for past dates'
      });
    }

    // Get day of week
    const dayOfWeek = appointmentDate.toLocaleDateString('en-US', { weekday: 'lowercase' });
    const dayAvailability = doctor.weeklyAvailability[dayOfWeek];
    
    if (!dayAvailability?.isAvailable) {
      return res.json({
        success: true,
        availableSlots: [],
        message: 'Doctor is not available on this day'
      });
    }

    // Get doctor's slots for the consultation type
    const doctorSlots = dayAvailability.slots.filter(slot => 
      slot.consultationType === consultationType || slot.consultationType === 'both'
    );

    // Get booked appointments for this date (DB-backed)
    const bookedAppointments = await Appointment.findAll({
      where: {
        doctorId,
        appointmentDate: date,
        status: {
          [Appointment.sequelize.Op.notIn]: ['cancelled', 'no-show']
        }
      }
    });

    // Filter available slots and add more details
    const availableSlots = doctorSlots.filter(slot => {
      const slotTime = `${slot.startTime}-${slot.endTime}`;
      return !bookedAppointments.some(apt => apt.timeSlot === slotTime);
    }).map(slot => {
      const consultationFee = doctor.consultationTypes[consultationType].fee;
      const serviceFee = Math.round(consultationFee * 0.1);
      
      return {
        startTime: slot.startTime,
        endTime: slot.endTime,
        timeSlot: `${slot.startTime}-${slot.endTime}`,
        consultationType: slot.consultationType,
        duration: calculateDuration(slot.startTime, slot.endTime),
        fees: {
          consultationFee,
          serviceFee,
          totalFee: consultationFee + serviceFee,
          currency: 'INR'
        },
        availability: 'Available'
      };
    });

    // Sort slots by time
    availableSlots.sort((a, b) => a.startTime.localeCompare(b.startTime));

    res.json({
      success: true,
      availableSlots,
      doctorInfo: {
        name: `${doctor.prefix} ${doctor.firstName} ${doctor.lastName}`,
        specialization: doctor.specialization,
        subSpecialization: doctor.subSpecialization,
        experience: `${doctor.experienceYears} years`,
        clinicName: doctor.clinicHospitalName,
        languages: doctor.languages,
        rating: doctor.statistics.averageRating,
        totalConsultations: doctor.statistics.totalConsultations,
        profilePicture: doctor.mediaUploads?.profilePicture,
        nextAvailableDate: getNextAvailableDate(doctor.weeklyAvailability),
        consultationTypes: Object.keys(doctor.consultationTypes).filter(
          type => doctor.consultationTypes[type].available
        )
      },
      slotSummary: {
        totalSlots: availableSlots.length,
        morningSlots: availableSlots.filter(slot => parseInt(slot.startTime.split(':')[0]) < 12).length,
        afternoonSlots: availableSlots.filter(slot => {
          const hour = parseInt(slot.startTime.split(':')[0]);
          return hour >= 12 && hour < 17;
        }).length,
        eveningSlots: availableSlots.filter(slot => parseInt(slot.startTime.split(':')[0]) >= 17).length
      }
    });
  } catch (error) {
    console.error('Get available slots error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch available slots',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/enhanced-appointments/my-appointments
 * @desc    Get user's appointments with enhanced details
 * @access  Private (Patient)
 */
router.get('/my-appointments', authUser, [
  query('status').optional().isIn(['scheduled', 'completed', 'cancelled', 'in-progress']),
  query('consultationType').optional().isIn(['online', 'walkIn', 'homeVisit']),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('page').optional().isInt({ min: 1 }),
  query('upcoming').optional().isBoolean()
], async (req, res) => {
  try {
    const { status, consultationType, limit = 10, page = 1, upcoming } = req.query;
    
    // Filter appointments for this user (DB-backed)
    let userAppointments = await Appointment.findAll({
      where: { userId: req.user.id },
      order: [
        ['appointmentDate', 'ASC'],
        ['appointmentTime', 'ASC']
      ]
    });

    // Apply filters
    if (status) {
      userAppointments = userAppointments.filter(apt => apt.status === status);
    }
    if (consultationType) {
      userAppointments = userAppointments.filter(apt => apt.consultationType === consultationType);
    }
    if (upcoming) {
      const now = new Date();
      userAppointments = userAppointments.filter(apt => new Date(apt.appointmentDate) >= now);
    }

    // Sort by date and time
    userAppointments.sort((a, b) => {
      const dateCompare = new Date(a.appointmentDate) - new Date(b.appointmentDate);
      if (dateCompare === 0) {
        return a.timeSlot.localeCompare(b.timeSlot);
      }
      return dateCompare;
    });

    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedAppointments = userAppointments.slice(startIndex, endIndex).map(aptModel => {
      const apt = aptModel.toJSON();

      const timeSlot = `${apt.appointmentTime}-${apt.appointmentTime}`; // placeholder single-time slot

      // Normalize consultation type (online vs walkin)
      const rawType = apt.consultationType || 'online';
      const consultationType =
        rawType === 'walkIn' || rawType === 'walkin' || rawType === 'in-person'
          ? 'walkin'
          : 'online';

      // Derive channel: video / phone / in-person
      let channel = 'video';
      if (apt.channel === 'phone' || apt.consultationMode === 'audio') channel = 'phone';
      else if (rawType === 'in-person' || rawType === 'walkIn' || rawType === 'walkin') channel = 'in-person';

      // Clinic / location details for walk-in
      const clinicId = apt.clinicId || null;
      const clinicName = apt.clinicName || apt.clinic?.name || null;
      const clinicAddress = apt.clinicAddress || apt.clinic?.address || apt.location || null;

      return {
        ...apt,
        timeSlot,
        consultationType,
        channel,
        clinicId,
        clinicName,
        clinicAddress
      };
    });

    // Add status badges and additional info in a separate layer
    const enhancedAppointments = paginatedAppointments.map(apt => ({
      ...apt,
      statusBadge: getStatusBadge(apt.status),
      canJoin: apt.consultationType === 'online' && apt.status === 'scheduled' && canJoinMeeting(apt),
      canCancel: apt.status === 'scheduled' && canCancelAppointment(apt),
      canReschedule: apt.status === 'scheduled' && canRescheduleAppointment(apt),
      timeUntilAppointment: getTimeUntilAppointment(apt.appointmentDate, apt.timeSlot)
    }));

    res.json({
      success: true,
      appointments: enhancedAppointments,
      pagination: {
        total: userAppointments.length,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(userAppointments.length / limit)
      },
      summary: {
        total: userAppointments.length,
        scheduled: userAppointments.filter(apt => apt.status === 'scheduled').length,
        completed: userAppointments.filter(apt => apt.status === 'completed').length,
        cancelled: userAppointments.filter(apt => apt.status === 'cancelled').length,
        upcoming: userAppointments.filter(apt => {
          const now = new Date();
          return new Date(apt.appointmentDate) >= now && apt.status === 'scheduled';
        }).length
      }
    });
  } catch (error) {
    console.error('Get my appointments error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch appointments',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/enhanced-appointments/doctor-appointments
 * @desc    Get doctor's appointments with enhanced details
 * @access  Private (Doctor)
 */
router.get('/doctor-appointments', authUser, [
  query('date').optional().isDate(),
  query('status').optional().isIn(['scheduled', 'completed', 'cancelled', 'in-progress']),
  query('consultationType').optional().isIn(['online', 'walkIn', 'homeVisit'])
], async (req, res) => {
  try {
    if (req.user.role !== 'doctor') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Doctor role required.'
      });
    }

    const { date, status, consultationType } = req.query;
    
    // Filter appointments for this doctor
    let doctorAppointments = await Appointment.findAll({
      where: { doctorId: req.user.id },
      order: [
        ['appointmentDate', 'ASC'],
        ['appointmentTime', 'ASC']
      ]
    });

    // Apply filters
    if (date) {
      doctorAppointments = doctorAppointments.filter(apt => apt.appointmentDate === date);
    }
    if (status) {
      doctorAppointments = doctorAppointments.filter(apt => apt.status === status);
    }
    if (consultationType) {
      doctorAppointments = doctorAppointments.filter(apt => apt.consultationType === consultationType);
    }

    // Sort by date and time
    doctorAppointments.sort((a, b) => {
      const dateCompare = new Date(a.appointmentDate) - new Date(b.appointmentDate);
      if (dateCompare === 0) {
        return a.timeSlot.localeCompare(b.timeSlot);
      }
      return dateCompare;
    });

    // Normalize shape and add enhanced details for doctor view
    const enhancedAppointments = doctorAppointments.map(aptModel => {
      const apt = aptModel.toJSON();
      const timeSlot = `${apt.appointmentTime}-${apt.appointmentTime}`;

      // Normalize consultation type (online vs walkin)
      const rawType = apt.consultationType || 'online';
      const consultationType =
        rawType === 'walkIn' || rawType === 'walkin' || rawType === 'in-person'
          ? 'walkin'
          : 'online';

      // Derive channel
      let channel = 'video';
      if (apt.channel === 'phone' || apt.consultationMode === 'audio') channel = 'phone';
      else if (rawType === 'in-person' || rawType === 'walkIn' || rawType === 'walkin') channel = 'in-person';

      // Clinic / location details for walk-in
      const clinicId = apt.clinicId || null;
      const clinicName = apt.clinicName || apt.clinic?.name || null;
      const clinicAddress = apt.clinicAddress || apt.clinic?.address || apt.location || null;

      return {
        ...apt,
        timeSlot,
        consultationType,
        channel,
        clinicId,
        clinicName,
        clinicAddress,
        statusBadge: getStatusBadge(apt.status),
        timeUntilAppointment: getTimeUntilAppointment(apt.appointmentDate, timeSlot),
        canStart: apt.status === 'scheduled' && canStartConsultation({
          appointmentDate: apt.appointmentDate,
          timeSlot
        }),
        canComplete: apt.status === 'in-progress',
        consultationDuration: null
      };
    });

    res.json({
      success: true,
      appointments: enhancedAppointments,
      summary: {
        total: doctorAppointments.length,
        scheduled: doctorAppointments.filter(apt => apt.status === 'scheduled').length,
        inProgress: doctorAppointments.filter(apt => apt.status === 'in-progress').length,
        completed: doctorAppointments.filter(apt => apt.status === 'completed').length,
        cancelled: doctorAppointments.filter(apt => apt.status === 'cancelled').length
      }
    });
  } catch (error) {
    console.error('Get doctor appointments error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch appointments',
      error: error.message
    });
  }
});

// Helper functions for doctor appointments
function canStartConsultation(appointment) {
  const appointmentDateTime = new Date(`${appointment.appointmentDate} ${appointment.timeSlot.split('-')[0]}`);
  const now = new Date();
  const timeDiff = appointmentDateTime.getTime() - now.getTime();
  
  // Can start 10 minutes before appointment time
  return timeDiff <= 10 * 60 * 1000 && timeDiff >= -10 * 60 * 1000;
}

function calculateConsultationDuration(startTime, endTime) {
  if (!startTime || !endTime) return null;
  
  const start = new Date(startTime);
  const end = new Date(endTime);
  const durationMs = end.getTime() - start.getTime();
  const minutes = Math.floor(durationMs / (1000 * 60));
  
  return `${minutes} minutes`;
}

// Helper functions
function calculateDuration(startTime, endTime) {
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);
  
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;
  const durationMinutes = endMinutes - startMinutes;
  
  if (durationMinutes >= 60) {
    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${durationMinutes}m`;
}

function getNextAvailableDate(weeklyAvailability) {
  const today = new Date();
  const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  
  for (let i = 1; i <= 14; i++) { // Check next 2 weeks
    const checkDate = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
    const dayName = daysOfWeek[checkDate.getDay()];
    
    if (weeklyAvailability[dayName]?.isAvailable) {
      return checkDate.toISOString().split('T')[0];
    }
  }
  return null;
}

function getStatusBadge(status) {
  const badges = {
    scheduled: { color: 'blue', text: 'Scheduled' },
    'in-progress': { color: 'green', text: 'In Progress' },
    completed: { color: 'emerald', text: 'Completed' },
    cancelled: { color: 'red', text: 'Cancelled' }
  };
  return badges[status] || { color: 'gray', text: status };
}

function canJoinMeeting(appointment) {
  const appointmentDateTime = new Date(`${appointment.appointmentDate} ${appointment.timeSlot.split('-')[0]}`);
  const now = new Date();
  const timeDiff = appointmentDateTime.getTime() - now.getTime();
  
  // Can join 10 minutes before appointment
  return timeDiff <= 10 * 60 * 1000 && timeDiff >= -30 * 60 * 1000;
}

function canCancelAppointment(appointment) {
  const appointmentDateTime = new Date(`${appointment.appointmentDate} ${appointment.timeSlot.split('-')[0]}`);
  const now = new Date();
  const timeDiff = appointmentDateTime.getTime() - now.getTime();
  
  // Can cancel up to 2 hours before appointment
  return timeDiff > 2 * 60 * 60 * 1000;
}

function canRescheduleAppointment(appointment) {
  const appointmentDateTime = new Date(`${appointment.appointmentDate} ${appointment.timeSlot.split('-')[0]}`);
  const now = new Date();
  const timeDiff = appointmentDateTime.getTime() - now.getTime();
  
  // Can reschedule up to 4 hours before appointment
  return timeDiff > 4 * 60 * 60 * 1000;
}

function getTimeUntilAppointment(date, timeSlot) {
  const appointmentDateTime = new Date(`${date} ${timeSlot.split('-')[0]}`);
  const now = new Date();
  const timeDiff = appointmentDateTime.getTime() - now.getTime();
  
  if (timeDiff <= 0) return 'Past appointment';
  
  const days = Math.floor(timeDiff / (24 * 60 * 60 * 1000));
  const hours = Math.floor((timeDiff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((timeDiff % (60 * 60 * 1000)) / (60 * 1000));
  
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export default router;