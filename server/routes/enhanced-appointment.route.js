import express from 'express';
import { body, param, query } from 'express-validator';
import { Op } from 'sequelize';
import { authUser } from '../middleware/auth.middleware.js';
import doctorModel from '../models/doctor.model.intelligent.js';
import userModel from '../models/user.model.intelligent.js';
import Appointment from '../models/appointment.model.intelligent.js';

// Import usage metering service for SaaS tracking
import usageMeteringService from '../services/usage-metering.service.js';
import notificationService from '../services/notification.service.js';

const router = express.Router();

const normalizeSymptoms = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry ?? '').trim())
      .filter(Boolean);
  }
  const asString = String(value).trim();
  if (!asString) return [];
  return asString
    .split(/[,\n;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const normalizeTimeHHMM = (value = '') => {
  const trimmed = String(value || '').trim();
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(trimmed)) return trimmed;
  if (/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(trimmed)) return trimmed.slice(0, 5);
  return trimmed;
};

const mapEnhancedConsultationTypeToDb = (requestedType) => {
  const normalized = String(requestedType || '').toLowerCase().trim();
  if (normalized === 'online') return 'online';
  if (normalized === 'walkin' || normalized === 'walk-in') return 'in-person';
  if (normalized === 'homevisit' || normalized === 'home-visit' || normalized === 'home_visit') return 'in-person';
  if (normalized === 'in-person' || normalized === 'inperson') return 'in-person';
  // Default to online to keep the route permissive; callers can still see requested type in metadata.
  return 'online';
};

const resolveDoctorIdFromRequest = async (req) => {
  const fallbackId = req.user?.id;
  if (!fallbackId) return null;

  const isHospitalDoctor = req.user?.userType === 'hospital' && req.user?.role === 'doctor';
  const isClinicDoctor = req.user?.type === 'clinic_staff' && req.user?.role === 'doctor';
  if ((isHospitalDoctor || isClinicDoctor) && req.user?.email) {
    const doctorRecord = await doctorModel.findOne({ where: { email: req.user.email } });
    if (doctorRecord?.id) return doctorRecord.id;
  }

  return fallbackId;
};

/**
 * Resolve doctor by ID (accepts both numeric ID and alphanumeric unique_id)
 */
const resolveDoctorId = async (doctorIdOrUniqueId) => {
  if (!doctorIdOrUniqueId) return null;
  
  const idString = String(doctorIdOrUniqueId).trim();
  
  // Check if it's a numeric ID
  if (/^\d+$/.test(idString)) {
    return await doctorModel.findByPk(parseInt(idString, 10));
  }
  
  // Check if it's an alphanumeric unique_id (starts with D)
  if (/^D[A-Z0-9]{5}$/i.test(idString)) {
    return await doctorModel.findOne({ where: { unique_id: idString.toUpperCase() } });
  }
  
  // Try both as fallback
  const doctor = await doctorModel.findOne({
    where: {
      [Op.or]: [
        { id: isNaN(idString) ? null : parseInt(idString, 10) },
        { unique_id: idString.toUpperCase() }
      ]
    }
  });
  
  return doctor;
};

const deriveChannelFromRequestedType = (requestedType) => {
  const normalized = String(requestedType || '').toLowerCase();
  if (normalized === 'audio' || normalized === 'phone') return 'phone';
  if (normalized === 'chat') return 'chat';
  if (normalized === 'walkin' || normalized === 'walk-in' || normalized === 'in-person' || normalized === 'homevisit') {
    return 'in-person';
  }
  return 'video';
};

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
    
    // Get doctor details (supports both numeric ID and alphanumeric unique_id)
    const doctor = await resolveDoctorId(doctorId);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found',
        hint: 'Please provide a valid doctor ID (numeric like 2 or alphanumeric like D2C193)'
      });
    }
    
    // Use the resolved internal ID for database operations
    const resolvedDoctorId = doctor.id;

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

    // Check if doctor has an appointment at this time (prevent doctor double-booking)
    const doctorConflict = await Appointment.findOne({
      where: {
        doctorId: resolvedDoctorId,
        appointmentDate,
        appointmentTime: startTime,
        status: {
          [Op.notIn]: ['cancelled', 'no-show']
        }
      }
    });

    if (doctorConflict) {
      return res.status(409).json({
        success: false,
        message: `Dr. ${doctor.firstName} ${doctor.lastName} (ID: ${doctor.unique_id || doctor.id}) is not available at the selected time. The time slot is already booked by another patient. Please select a different time slot.`,
        conflict: 'doctor_busy',
        doctorId: doctor.id,
        doctorPublicId: doctor.unique_id
      });
    }

    // Check if patient has an appointment at this time (prevent patient double-booking)
    const patientConflict = await Appointment.findOne({
      where: {
        userId: req.user.id,
        appointmentDate,
        appointmentTime: startTime,
        status: {
          [Op.notIn]: ['cancelled', 'no-show']
        }
      }
    });

    if (patientConflict) {
      const conflictDoctor = await doctorModel.findByPk(patientConflict.doctorId, {
        attributes: ['firstName', 'lastName', 'specialization', 'prefix']
      });
      const conflictDoctorName = conflictDoctor 
        ? `${conflictDoctor.prefix || 'Dr.'} ${conflictDoctor.firstName} ${conflictDoctor.lastName} (${conflictDoctor.specialization})`
        : 'another doctor';

      return res.status(409).json({
        success: false,
        message: `You already have an appointment scheduled at ${timeSlot} on ${appointmentDate} with ${conflictDoctorName}. You cannot book multiple appointments at the same time. Please select a different time slot or cancel your existing appointment first.`,
        conflict: 'patient_busy',
        existingAppointment: {
          id: patientConflict.id,
          doctorName: conflictDoctorName,
          timeSlot: timeSlot,
          date: appointmentDate
        }
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
    
    // PRE-CREATE VIDEO ROOM FOR ONLINE CONSULTATIONS
    let roomToken = null;
    let roomCreated = false;
    if (meetingRoom) {
      try {
        console.log(`🎥 Pre-creating video room: ${meetingRoom}`);
        // Call video service to create room and get token
        const videoApiUrl = process.env.VIDEO_API_URL || 'http://localhost:3000';
        const roomResponse = await fetch(`${videoApiUrl}/api/video/room/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId: meetingRoom,
            appointmentId: null, // Will be set after DB creation
            doctorId: resolvedDoctorId,
            patientId: req.user.id,
            maxParticipants: 2,
            duration: 30 // minutes
          })
        }).catch(err => {
          console.warn('⚠️ Video room pre-creation failed:', err.message);
          return null;
        });
        
        if (roomResponse?.ok) {
          const roomData = await roomResponse.json();
          roomToken = roomData.roomToken || roomData.token;
          roomCreated = roomData.success || true;
          console.log(`✅ Video room created: ${meetingRoom}, Token: ${roomToken ? 'YES' : 'NO'}`);
        }
      } catch (err) {
        console.warn('⚠️ Video room creation error:', err.message);
        // Continue without token - patient can still access room
      }
    }
    
    // Calculate fees
    const baseFee = doctor.consultationTypes[consultationType].fee;
    const serviceFee = Math.round(baseFee * 0.1); // 10% service fee
    const totalFee = baseFee + serviceFee;

    const normalizedStartTime = normalizeTimeHHMM(startTime);
    const normalizedEndTime = normalizeTimeHHMM(endTime);
    const requestedConsultationType = consultationType;
    const dbConsultationType = mapEnhancedConsultationTypeToDb(requestedConsultationType);
    const channel = deriveChannelFromRequestedType(requestedConsultationType);
    const symptomsArray = normalizeSymptoms(symptoms);
    const doctorName = `${doctor.prefix || 'Dr.'} ${doctor.firstName} ${doctor.lastName}`.trim();

    // Best-effort duration in minutes
    const toMinutes = (time) => {
      const [hours, minutes] = String(time || '').split(':').map((value) => parseInt(value, 10));
      if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
      return hours * 60 + minutes;
    };
    const startMinutes = toMinutes(normalizedStartTime);
    const endMinutes = toMinutes(normalizedEndTime);
    const durationMinutes =
      startMinutes !== null && endMinutes !== null && endMinutes > startMinutes
        ? endMinutes - startMinutes
        : null;

    // Create DB-backed appointment (canonical fields required by the Postgres model)
    const dbAppointment = await Appointment.create({
      userId: req.user.id,
      patientId: req.user.id, // Link patient for doctor queries
      doctorId: resolvedDoctorId,
      appointmentDate,
      appointmentTime: normalizedStartTime,
      consultationType: dbConsultationType,
      duration: durationMinutes || 15,
      patientName,
      patientEmail: patient.email,
      patientPhone: patientPhone || 'N/A',
      doctorName,
      specialization: doctor.specialization,
      paymentAmount: totalFee,
      symptoms: symptomsArray,
      reason: notes || null,
      notes: notes || null,
      status: 'scheduled',
      paymentStatus: 'pending',
      patientDetails: {
        ...(patientAge ? { age: patientAge } : {}),
        ...(patientGender ? { gender: patientGender } : {}),
        ...(patientAddress ? { address: patientAddress } : patient.address ? { address: patient.address } : {})
      },
      doctorDetails: {
        ...(doctor.phoneNumber ? { phoneNumber: doctor.phoneNumber } : {}),
        ...(doctor.email ? { email: doctor.email } : {}),
        ...(doctor.clinicHospitalName ? { clinicName: doctor.clinicHospitalName } : {}),
        ...(doctor.practiceAddress ? { address: doctor.practiceAddress } : {})
      },
      metadata: {
        requestedConsultationType,
        channel,
        preferredLanguage: preferredLanguage || null,
        emergencyContact: emergencyContact || null,
        patientAddress: patientAddress || null,
        insuranceDetails: insuranceDetails || null,
        doctorPublicId: doctor.unique_id || null,
        fees: {
          consultationFee: baseFee,
          serviceFee,
          totalFee,
          currency: 'INR'
        },
        meeting: {
          meetingLink: requestedConsultationType === 'online' ? `https://meet.mediczy.com/${meetingRoom}` : null,
          roomId: meetingRoom,
          roomToken: roomToken,
          roomCreated: roomCreated
        }
      }
    });

    // Build enhanced view object (keeps previous response shape as much as possible)
    const appointment = {
      id: dbAppointment.id,
      appointmentNumber: `MED${String(dbAppointment.id).padStart(6, '0')}`,
      patientId: req.user.id,
      doctorId: resolvedDoctorId,
      doctorPublicId: doctor.unique_id,
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
        roomToken: roomToken,
        roomCreated: roomCreated,
        joinInstructions: consultationType === 'online' ? 'Room is ready. Click the meeting link to join or use the access code provided' : null
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

    // Send appointment notification to doctor (async)
    try {
      const appointmentData = {
        id: dbAppointment.id,
        patientName,
        patientEmail: patient.email,
        patientPhone: patientPhone || req.user.phoneNumber,
        doctorName,
        doctorEmail: doctor.email,
        specialization: doctor.specialization,
        appointmentDate,
        appointmentTime: normalizedStartTime,
        duration: durationMinutes || 15,
        consultationType: dbAppointment.consultationType,
        consultationFee: totalFee,
        symptoms: symptomsArray,
        notes: notes || null,
        location: doctor.practiceAddress || doctor.clinicHospitalName || null,
        meetingLink: dbAppointment.metadata?.meeting?.meetingLink
      };
      await notificationService.notifyAppointmentRequest(dbAppointment, appointmentData);
    } catch (notificationError) {
      console.error('❌ Failed to send doctor appointment notification:', notificationError);
    }

    // Track usage for SaaS metering (non-blocking)
    try {
      const tenantId = req.tenantId || doctor.organization_id || doctor.tenantId;
      if (tenantId) {
        usageMeteringService.trackAppointment(tenantId, {
          appointmentId: dbAppointment.id,
          doctorId: resolvedDoctorId,
          patientId: req.user.id,
          consultationType: dbConsultationType
        }).catch(err => console.warn('Usage metering failed:', err.message));
      }
    } catch (meteringError) {
      console.warn('Usage metering error (non-blocking):', meteringError.message);
    }

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
    
    console.log(`📅 Fetching appointments for user ID: ${req.user.id}`);
    
    // Filter appointments for this user (DB-backed)
    let userAppointments = await Appointment.findAll({
      where: { userId: req.user.id },
      order: [
        ['appointmentDate', 'ASC'],
        ['appointmentTime', 'ASC']
      ]
    });
    
    console.log(`📅 Found ${userAppointments.length} appointments for user ${req.user.id}`);

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
        const timeA = a.appointmentTime || a.timeSlot || '00:00';
        const timeB = b.appointmentTime || b.timeSlot || '00:00';
        return timeA.localeCompare(timeB);
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
  query('status').optional().isIn(['scheduled', 'confirmed', 'completed', 'cancelled', 'in-progress']),
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
    const resolvedDoctorId = await resolveDoctorIdFromRequest(req);
    if (!resolvedDoctorId) {
      return res.status(400).json({
        success: false,
        message: 'Doctor ID could not be resolved'
      });
    }

    const where = { doctorId: resolvedDoctorId };
    if (date) {
      where.appointmentDate = date;
    }
    if (status) {
      where.status = status;
    }
    if (consultationType) {
      where.consultationType = mapEnhancedConsultationTypeToDb(consultationType);
    }

    // Filter appointments for this doctor
    const doctorAppointments = await Appointment.findAll({
      where,
      order: [
        ['appointmentDate', 'ASC'],
        ['appointmentTime', 'ASC']
      ]
    });

    // Normalize shape and add enhanced details for doctor view
    const enhancedAppointments = doctorAppointments.map(aptModel => {
      const apt = aptModel.toJSON();
      const appointmentTime = normalizeTimeHHMM(apt.appointmentTime);
      const timeSlot = `${appointmentTime}-${appointmentTime}`;

      // Normalize consultation type (online vs walkin)
      const rawType = apt.consultationType || 'online';
      const consultationType =
        rawType === 'walkIn' || rawType === 'walkin' || rawType === 'in-person'
          ? 'walkin'
          : 'online';

      // Derive channel
      const requestedType = apt.metadata?.requestedConsultationType || apt.metadata?.channel || rawType;
      const channel = deriveChannelFromRequestedType(requestedType);

      // Clinic / location details for walk-in
      const clinicId = apt.clinicId || null;
      const clinicName = apt.clinicName || apt.clinic?.name || null;
      const clinicAddress = apt.clinicAddress || apt.clinic?.address || apt.location || null;

      const symptomsValue = Array.isArray(apt.symptoms) ? apt.symptoms.join(', ') : apt.symptoms;
      const consultationFee = Number(apt.paymentAmount || 0);

      return {
        ...apt,
        appointmentTime,
        timeSlot,
        consultationType,
        channel,
        clinicId,
        clinicName,
        clinicAddress,
        symptoms: symptomsValue,
        consultationFee,
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
