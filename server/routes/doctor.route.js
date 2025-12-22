import express from "express";
import { body, validationResult } from "express-validator";
import {
  registerDoctor,
  signInDoctor,
  getDoctorProfile,
  getAvailableDoctors,
  updateDoctorStatus,
} from "../controller/doctor.controller.js";
import { authDoctor } from "../middleware/auth.middleware.js";
import { Doctor, Appointment, User } from "../models/index.js";
import { Op } from 'sequelize';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const router = express.Router();

console.log('🔷 [doctor.route.js] Module loaded');
console.log('🔷 signInDoctor type:', typeof signInDoctor);

// Doctor Registration Route
router.post(
  "/register",
  [
    body("email").isEmail().withMessage("Must be a valid email"),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters long"),
    body("firstName")
      .isLength({ min: 3, max: 20 })
      .withMessage("First name must be between 3 to 20 characters"),
    body("lastName")
      .isLength({ min: 3, max: 20 })
      .withMessage("Last name must be between 3 to 20 characters"),
    body("phoneNumber")
      .isMobilePhone()
      .withMessage("Must be a valid mobile phone number"),
    body("specialization").notEmpty().withMessage("Specialization is required"),
    body("experience")
      .isInt({ min: 0 })
      .withMessage("Experience must be at least 0 years"),
    body("qualifications")
      .isLength({ min: 1 })
      .withMessage("At least one qualification is required"),
  ],
  registerDoctor
);

// Doctor Login Route
router.post(
  "/login",
  [
    body("email").isEmail().withMessage("Must be a valid email"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  signInDoctor
);

// Get Doctor Profile (Protected Route)
router.get("/profile", authDoctor, getDoctorProfile);

// Update Doctor Status
router.put("/status", updateDoctorStatus);

// Get Available Doctors
router.get("/available", getAvailableDoctors);

/**
 * @route   GET /api/doctors/:doctorId/user-slots
 * @desc    Get doctor's available slots for user booking (public endpoint)
 * @access  Public
 */
router.get("/:doctorId/user-slots", async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { date } = req.query;

    const doctor = await Doctor.findByPk(doctorId);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    // Get doctor's appointment configuration
    const slotDuration = doctor.slotDuration || 30;
    const weeklySchedule = doctor.weeklySchedule || {};
    const practiceLocations = doctor.practiceLocations || [];

    // If date is provided, get slots for that specific day
    if (date) {
      const requestedDate = new Date(date);
      const dayName = requestedDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      const daySchedule = weeklySchedule[dayName];

      if (!daySchedule || daySchedule.isOff) {
        return res.json({
          success: true,
          date,
          dayName,
          isOff: true,
          slots: { online: [], inPerson: [] }
        });
      }

      // Generate time slots based on configuration
      const generateTimeSlots = (startTime, endTime, duration) => {
        const slots = [];
        if (!startTime || !endTime) return slots;

        const [startHour, startMin] = startTime.split(':').map(Number);
        const [endHour, endMin] = endTime.split(':').map(Number);
        
        let currentTime = startHour * 60 + startMin;
        const endTimeInMin = endHour * 60 + endMin;

        while (currentTime + duration <= endTimeInMin) {
          const hours = Math.floor(currentTime / 60);
          const mins = currentTime % 60;
          const endHours = Math.floor((currentTime + duration) / 60);
          const endMins = (currentTime + duration) % 60;
          
          const startFormatted = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
          const endFormatted = `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;
          
          slots.push(`${startFormatted} - ${endFormatted}`);
          currentTime += duration;
        }

        return slots;
      };

      // Get booked appointments for this date
      const bookedAppointments = await Appointment.findAll({
        where: {
          doctorId,
          appointmentDate: date,
          status: {
            [Op.notIn]: ['cancelled', 'no-show']
          }
        },
        attributes: ['appointmentTime', 'consultationType']
      });

      const bookedSlotTimes = bookedAppointments.map(apt => apt.appointmentTime);

      // Generate online slots
      const onlineSlots = daySchedule.online?.enabled
        ? generateTimeSlots(
            daySchedule.online.startTime,
            daySchedule.online.endTime,
            slotDuration
          ).map(slot => ({
            time: slot,
            available: !bookedSlotTimes.includes(slot) && !daySchedule.blockedSlots?.includes(slot),
            blocked: daySchedule.blockedSlots?.includes(slot) || false
          }))
        : [];

      // Generate in-person slots
      const inPersonSlots = daySchedule.inPerson?.enabled
        ? generateTimeSlots(
            daySchedule.inPerson.startTime,
            daySchedule.inPerson.endTime,
            slotDuration
          ).map(slot => {
            const location = practiceLocations.find(loc => loc.id === daySchedule.inPerson?.locationId);
            return {
              time: slot,
              available: !bookedSlotTimes.includes(slot) && !daySchedule.blockedSlots?.includes(slot),
              blocked: daySchedule.blockedSlots?.includes(slot) || false,
              location: location ? {
                name: location.name,
                address: location.address,
                fee: location.consultationFee
              } : null
            };
          })
        : [];

      return res.json({
        success: true,
        date,
        dayName,
        slotDuration,
        isOff: false,
        slots: {
          online: onlineSlots,
          inPerson: inPersonSlots
        },
        fees: {
          online: doctor.onlineConsultationFee || 0,
          inPerson: doctor.inPersonConsultationFee || 0
        }
      });
    }

    // If no date provided, return weekly schedule overview
    const weeklySlots = {};
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    
    for (const day of days) {
      const daySchedule = weeklySchedule[day];
      if (!daySchedule || daySchedule.isOff) {
        weeklySlots[day] = { isOff: true, online: [], inPerson: [] };
        continue;
      }

      const location = practiceLocations.find(loc => loc.id === daySchedule.inPerson?.locationId);
      
      weeklySlots[day] = {
        isOff: false,
        online: {
          enabled: daySchedule.online?.enabled || false,
          startTime: daySchedule.online?.startTime || '',
          endTime: daySchedule.online?.endTime || ''
        },
        inPerson: {
          enabled: daySchedule.inPerson?.enabled || false,
          startTime: daySchedule.inPerson?.startTime || '',
          endTime: daySchedule.inPerson?.endTime || '',
          location: location ? {
            name: location.name,
            address: location.address,
            fee: location.consultationFee
          } : null
        }
      };
    }

    res.json({
      success: true,
      slotDuration,
      weeklySlots,
      practiceLocations,
      fees: {
        online: doctor.onlineConsultationFee || 0,
        inPerson: doctor.inPersonConsultationFee || 0
      }
    });

  } catch (error) {
    console.error('Get doctor user slots error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch doctor slots',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/doctors/my-patients/create
 * @desc    Create a new patient account on behalf of patient (Doctor only)
 * @access  Private (Doctor)
 */
router.post(
  '/my-patients/create',
  authDoctor,
  [
    body('firstName').isLength({ min: 2, max: 50 }).withMessage('First name must be between 2 to 50 characters'),
    body('lastName').isLength({ min: 2, max: 50 }).withMessage('Last name must be between 2 to 50 characters'),
    body('phoneNumber').matches(/^\+?[1-9]\d{1,14}$/).withMessage('Must be a valid phone number with country code'),
    body('email').optional().isEmail().withMessage('Must be a valid email'),
    body('dateOfBirth').optional().isISO8601().withMessage('Must be a valid date in YYYY-MM-DD format'),
    body('gender').optional().isIn(['male', 'female', 'other', 'Male', 'Female', 'Other']).withMessage('Gender must be male, female, or other'),
    body('bloodGroup').optional().isString(),
    body('address').optional().isString(),
    body('emergencyContact').optional().isString(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          success: false,
          errors: errors.array() 
        });
      }

      const doctorId = req.doctor.id;
      const {
        firstName,
        lastName,
        phoneNumber,
        email,
        dateOfBirth,
        gender,
        bloodGroup,
        address,
        emergencyContact,
        medicalHistory,
        allergies
      } = req.body;

      // Check if phone number already exists
      const existingUserByPhone = await User.findOne({ 
        where: { phoneNumber } 
      });

      if (existingUserByPhone) {
        return res.status(409).json({
          success: false,
          message: 'Patient with this phone number already exists',
          existingPatient: {
            id: existingUserByPhone.id,
            name: `${existingUserByPhone.firstName} ${existingUserByPhone.lastName}`,
            phoneNumber: existingUserByPhone.phoneNumber,
            email: existingUserByPhone.email
          }
        });
      }

      // If email provided, check if it already exists
      if (email) {
        const existingUserByEmail = await User.findOne({ 
          where: { email } 
        });

        if (existingUserByEmail) {
          return res.status(409).json({
            success: false,
            message: 'Patient with this email already exists',
            existingPatient: {
              id: existingUserByEmail.id,
              name: `${existingUserByEmail.firstName} ${existingUserByEmail.lastName}`,
              phoneNumber: existingUserByEmail.phoneNumber,
              email: existingUserByEmail.email
            }
          });
        }
      }

      // Generate a temporary password (patient can reset later)
      const tempPassword = crypto.randomBytes(4).toString('hex').toUpperCase(); // 8-char password
      const hashedPassword = await bcrypt.hash(tempPassword, 10);

      // Generate email if not provided
      const generatedEmail = email || `patient.${phoneNumber.replace(/[^0-9]/g, '')}@mediczy.com`;

      // Normalize gender to match database enum (capitalize first letter)
      const normalizedGender = gender ? gender.charAt(0).toUpperCase() + gender.slice(1).toLowerCase() : null;

      // Create patient account
      const newPatient = await User.create({
        firstName,
        lastName,
        email: generatedEmail,
        password: hashedPassword,
        phoneNumber,
        phone: phoneNumber, // Legacy field
        dateOfBirth: dateOfBirth || null,
        gender: normalizedGender,
        bloodGroup: bloodGroup || null,
        address: address || null,
        emergencyContact: emergencyContact || null,
        isActive: true,
        isVerified: true, // Doctor-created patients are auto-verified
        role: 'user',
        createdBy: 'doctor',
        referredBy: doctorId,
        medicalHistory: medicalHistory || null,
        allergies: allergies || null
      });

      // Get doctor info for notification
      const doctor = await Doctor.findByPk(doctorId);
      const doctorName = `Dr. ${doctor.firstName} ${doctor.lastName}`;

      // Send welcome notification via SMS, WhatsApp, and Email
      try {
        const credentialsMessage = `Welcome to Mediczy! 🏥\n\nYour account has been created by ${doctorName}.\n\n📱 *Login Credentials:*\nPhone: ${phoneNumber}\nEmail: ${generatedEmail}\nTemporary Password: *${tempPassword}*\n\n🔐 Please login at https://mediqzy.com and change your password immediately.\n\n_This is an auto-generated message. Please do not reply._`;

        // 1. Send SMS
        const notificationService = await import('../services/notification.service.js');
        await notificationService.default.sendSMS(
          phoneNumber,
          `Welcome to Mediczy! Your account created by ${doctorName}.\nTemp Password: ${tempPassword}\nLogin: https://mediqzy.com`
        );

        // 2. Send WhatsApp (session message)
        try {
          const whatsappService = (await import('../services/whatsapp-production.service.js')).default;
          await whatsappService.sendSessionMessage({
            to: phoneNumber,
            body: credentialsMessage
          });
          console.log(`✅ WhatsApp credentials sent to ${phoneNumber}`);
        } catch (whatsappError) {
          console.warn('WhatsApp notification failed (patient may not have WhatsApp):', whatsappError.message);
          // Continue - WhatsApp is optional
        }

        // 3. Send Email if valid email provided
        if (email && !email.includes('@mediczy.com')) {
          await notificationService.default.sendEmail(
            email,
            'Welcome to Mediczy - Account Created',
            `Dear ${firstName} ${lastName},\n\nYour Mediczy account has been created by ${doctorName}.\n\nLogin Credentials:\nEmail/Phone: ${phoneNumber}\nTemporary Password: ${tempPassword}\n\nPlease login at https://mediqzy.com and change your password immediately.\n\nBest regards,\nMediczy Team`
          );
        }
      } catch (notificationError) {
        console.error('Failed to send patient welcome notification:', notificationError);
        // Continue even if notification fails
      }

      // Return patient details and temporary password
      res.status(201).json({
        success: true,
        message: 'Patient account created successfully',
        patient: {
          id: newPatient.id,
          firstName: newPatient.firstName,
          lastName: newPatient.lastName,
          fullName: `${newPatient.firstName} ${newPatient.lastName}`,
          email: newPatient.email,
          phoneNumber: newPatient.phoneNumber,
          dateOfBirth: newPatient.dateOfBirth,
          gender: newPatient.gender,
          bloodGroup: newPatient.bloodGroup,
          createdAt: newPatient.createdAt
        },
        credentials: {
          tempPassword: tempPassword,
          loginWith: phoneNumber,
          message: 'Share these credentials with the patient. Password sent via SMS.'
        },
        nextSteps: [
          'Patient can login using phone number or email',
          'Patient should change password after first login',
          'You can now book appointments for this patient'
        ]
      });

    } catch (error) {
      console.error('Create patient error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create patient account',
        error: error.message
      });
    }
  }
);

/**
 * @route   GET /api/doctors/my-patients
 * @desc    Get all patients who have appointments with the doctor
 * @access  Private (Doctor)
 */
router.get('/my-patients', authDoctor, async (req, res) => {
  try {
    const doctorId = req.doctor.id;
    const { search, limit = 50, offset = 0 } = req.query;

    // Build where clause for search
    const whereClause = {
      doctorId: parseInt(doctorId)
    };

    // Get all appointments for this doctor to find unique patients
    const appointments = await Appointment.findAll({
      where: whereClause,
      attributes: ['userId'],
      group: ['userId'],
      raw: true
    });

    const patientIds = appointments.map(apt => apt.userId).filter(Boolean);

    if (patientIds.length === 0) {
      return res.json({
        success: true,
        count: 0,
        patients: []
      });
    }

    // Build patient search criteria
    const patientWhere = {
      id: { [Op.in]: patientIds }
    };

    if (search) {
      patientWhere[Op.or] = [
        { firstName: { [Op.iLike]: `%${search}%` } },
        { lastName: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { phoneNumber: { [Op.iLike]: `%${search}%` } }
      ];
    }

    // Get patients with appointment stats
    const patients = await User.findAll({
      where: patientWhere,
      attributes: [
        'id',
        'firstName',
        'lastName',
        'email',
        'phoneNumber',
        'dateOfBirth',
        'gender',
        'bloodGroup',
        'createdAt'
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    // Get appointment counts for each patient
    const patientsWithStats = await Promise.all(
      patients.map(async (patient) => {
        const appointmentStats = await Appointment.count({
          where: {
            doctorId: parseInt(doctorId),
            userId: patient.id
          },
          group: ['status']
        });

        const totalAppointments = await Appointment.count({
          where: {
            doctorId: parseInt(doctorId),
            userId: patient.id
          }
        });

        const lastAppointment = await Appointment.findOne({
          where: {
            doctorId: parseInt(doctorId),
            userId: patient.id
          },
          order: [['appointmentDate', 'DESC'], ['appointmentTime', 'DESC']],
          attributes: ['appointmentDate', 'appointmentTime', 'status', 'consultationType']
        });

        // Calculate age if dateOfBirth exists
        let age = null;
        if (patient.dateOfBirth) {
          const dob = new Date(patient.dateOfBirth);
          const today = new Date();
          age = today.getFullYear() - dob.getFullYear();
          const monthDiff = today.getMonth() - dob.getMonth();
          if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
            age--;
          }
        }

        return {
          id: patient.id,
          firstName: patient.firstName,
          lastName: patient.lastName,
          fullName: `${patient.firstName} ${patient.lastName}`,
          email: patient.email,
          phoneNumber: patient.phoneNumber,
          dateOfBirth: patient.dateOfBirth,
          age,
          gender: patient.gender,
          bloodGroup: patient.bloodGroup,
          totalAppointments,
          lastAppointment: lastAppointment ? {
            date: lastAppointment.appointmentDate,
            time: lastAppointment.appointmentTime,
            status: lastAppointment.status,
            type: lastAppointment.consultationType
          } : null,
          registeredAt: patient.createdAt
        };
      })
    );

    res.json({
      success: true,
      count: patientsWithStats.length,
      total: patientIds.length,
      patients: patientsWithStats
    });

  } catch (error) {
    console.error('Get my patients error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch patients',
      error: error.message
    });
  }
});

export default router;
