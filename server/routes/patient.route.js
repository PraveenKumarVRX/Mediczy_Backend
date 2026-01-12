import express from 'express';
import { body, validationResult } from 'express-validator';
import userModel from '../models/user.model.intelligent.js';
import Appointment from '../models/appointment.model.intelligent.js';
import Doctor from '../models/doctor.model.intelligent.js';
import bcrypt from 'bcryptjs';
import { authUser } from '../middleware/auth.middleware.js';
import { authTeam } from '../middleware/team.middleware.js';
import { authNurse } from '../routes/nurse.route.js';
import { authAssistant } from '../routes/assistant.route.js';
import { Op, Sequelize } from 'sequelize';

const router = express.Router();

// Validation rules for patient registration
const patientValidationRules = [
  body('email').isEmail().withMessage('Must be a valid email'),
  body('password')
    .isLength({ min: 4 })
    .withMessage('Password must be at least 4 characters long'),
  body('firstName')
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 to 50 characters'),
  body('lastName')
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 to 50 characters'),
  body('phoneNumber')
    .isMobilePhone()
    .withMessage('Must be a valid mobile phone number'),
  body('dateOfBirth')
    .isISO8601()
    .withMessage('Must be a valid date in YYYY-MM-DD format'),
  body('gender')
    .isIn(['Male', 'Female', 'Other'])
    .withMessage('Gender must be either Male, Female, or Other'),
];

// Middleware to check if user has permission to register patients
const canRegisterPatients = (req, res, next) => {
  // Check if authenticated via any of the allowed roles
  if (req.user || req.teamUser || req.nurse || req.assistant || req.doctor) {
    return next();
  }
  
  return res.status(403).json({
    success: false,
    message: 'You do not have permission to register patients'
  });
};

// Register patient - Admin route
router.post(
  '/admin/register',
  authUser,
  patientValidationRules,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      // Check if admin
      if (!req.user || (req.user.role !== 'admin' && !req.user.isAdmin)) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const {
        email,
        password,
        firstName,
        lastName,
        phoneNumber,
        dateOfBirth,
        gender,
        address,
        emergencyContact,
        bloodGroup,
        allergies,
        medicalHistory
      } = req.body;

      // Check if patient already exists
      const existingUser = await userModel.findOne({ where: { email } });
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: 'Patient with this email already exists'
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create patient - Default primary doctor is CMO Dr. Nandita Agarwal (ID: 5)
      const DEFAULT_PRIMARY_DOCTOR_ID = 5; // CMO Dr. Nandita Agarwal
      
      // Note: User model only supports basic fields
      // Additional fields should be stored in patient_profiles table if needed
      const patient = await userModel.create({
        email,
        password: hashedPassword,
        firstName,
        lastName,
        phoneNumber,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        gender,
        status: 'active',
        primaryDoctorId: DEFAULT_PRIMARY_DOCTOR_ID
      });

      res.status(201).json({
        success: true,
        message: 'Patient registered successfully',
        patient: {
          id: patient.id,
          email: patient.email,
          firstName: patient.firstName,
          lastName: patient.lastName,
          phoneNumber: patient.phoneNumber,
          dateOfBirth: patient.dateOfBirth,
          gender: patient.gender
        }
      });
    } catch (error) {
      console.error('Admin patient registration error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error during patient registration',
        error: error.message
      });
    }
  }
);

// Register patient - Doctor route
router.post(
  '/doctor/register',
  authUser,
  patientValidationRules,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      // Check if doctor
      if (!req.user || req.user.role !== 'doctor') {
        return res.status(403).json({
          success: false,
          message: 'Doctor access required'
        });
      }

      const {
        email,
        password,
        firstName,
        lastName,
        phoneNumber,
        dateOfBirth,
        gender,
        address,
        emergencyContact,
        bloodGroup,
        allergies,
        medicalHistory
      } = req.body;

      // Check if patient already exists
      const existingUser = await userModel.findOne({ where: { email } });
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: 'Patient with this email already exists'
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Get doctor's ID to set as primary doctor (Family Doctor concept)
      // When a doctor registers a patient, that doctor becomes the primary doctor
      let primaryDoctorId = req.user.id;
      
      // If req.user.id is the user account ID (not doctor ID), find the doctor record
      const doctorRecord = await Doctor.findOne({ where: { userId: req.user.id } });
      if (doctorRecord) {
        primaryDoctorId = doctorRecord.id;
      }

      // Create patient with the registering doctor as primary doctor
      // Note: User model only supports basic fields
      const patient = await userModel.create({
        email,
        password: hashedPassword,
        firstName,
        lastName,
        phoneNumber,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        gender,
        status: 'active',
        primaryDoctorId: primaryDoctorId
      });

      res.status(201).json({
        success: true,
        message: 'Patient registered successfully by doctor',
        patient: {
          id: patient.id,
          email: patient.email,
          firstName: patient.firstName,
          lastName: patient.lastName,
          phoneNumber: patient.phoneNumber,
          dateOfBirth: patient.dateOfBirth,
          gender: patient.gender,
          assignedDoctorId: patient.assignedDoctorId
        }
      });
    } catch (error) {
      console.error('Doctor patient registration error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error during patient registration',
        error: error.message
      });
    }
  }
);

// Register patient - Nurse route
router.post(
  '/nurse/register',
  authNurse,
  patientValidationRules,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const {
        email,
        password,
        firstName,
        lastName,
        phoneNumber,
        dateOfBirth,
        gender,
        address,
        emergencyContact,
        bloodGroup,
        allergies,
        medicalHistory
      } = req.body;

      // Check if patient already exists
      const existingUser = await userModel.findOne({ where: { email } });
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: 'Patient with this email already exists'
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create patient - Default primary doctor is CMO Dr. Nandita Agarwal (ID: 5)
      const DEFAULT_PRIMARY_DOCTOR_ID = 5; // CMO Dr. Nandita Agarwal
      
      // Note: User model only supports basic fields
      const patient = await userModel.create({
        email,
        password: hashedPassword,
        firstName,
        lastName,
        phoneNumber,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        gender,
        status: 'active',
        primaryDoctorId: DEFAULT_PRIMARY_DOCTOR_ID
      });

      res.status(201).json({
        success: true,
        message: 'Patient registered successfully by nurse',
        patient: {
          id: patient.id,
          email: patient.email,
          firstName: patient.firstName,
          lastName: patient.lastName,
          phoneNumber: patient.phoneNumber,
          dateOfBirth: patient.dateOfBirth,
          gender: patient.gender
        }
      });
    } catch (error) {
      console.error('Nurse patient registration error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error during patient registration',
        error: error.message
      });
    }
  }
);

// Register patient - Assistant route
router.post(
  '/assistant/register',
  authAssistant,
  patientValidationRules,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: errors.array()
        });
      }

      const {
        email,
        password,
        firstName,
        lastName,
        phoneNumber,
        dateOfBirth,
        gender,
        address,
        emergencyContact,
        bloodGroup,
        allergies,
        medicalHistory
      } = req.body;

      // Validate required fields
      if (!email || !password || !firstName || !lastName || !phoneNumber) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: email, password, firstName, lastName, phoneNumber'
        });
      }

      // Check if patient already exists
      const existingUser = await userModel.findOne({ where: { email } });
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: 'Patient with this email already exists'
        });
      }

      // Check for duplicate phone number
      const existingPhone = await userModel.findOne({ where: { phoneNumber } });
      if (existingPhone) {
        return res.status(409).json({
          success: false,
          message: 'A patient with this phone number is already registered'
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create patient - assign to assistant's linked doctor as primary doctor
      // If assistant has a linked doctor, use that; otherwise default to CMO
      const DEFAULT_PRIMARY_DOCTOR_ID = 5; // CMO Dr. Nandita Agarwal
      const primaryDoctorId = req.assistant.primaryDoctorId || 
                               (req.assistant.linkedDoctorIds && req.assistant.linkedDoctorIds[0]) ||
                               DEFAULT_PRIMARY_DOCTOR_ID;
      
      // Note: User model only supports basic fields. 
      // Additional fields (address, bloodGroup, etc.) should be stored in patient_profiles table
      const patient = await userModel.create({
        email,
        password: hashedPassword,
        firstName,
        lastName,
        phoneNumber,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        gender,
        role: 'patient',
        status: 'active',  // Use status instead of isActive
        primaryDoctorId: primaryDoctorId
      });

      res.status(201).json({
        success: true,
        message: 'Patient registered successfully by assistant',
        patient: {
          id: patient.id,
          email: patient.email,
          firstName: patient.firstName,
          lastName: patient.lastName,
          phoneNumber: patient.phoneNumber,
          dateOfBirth: patient.dateOfBirth,
          gender: patient.gender,
          primaryDoctorId: patient.primaryDoctorId
        }
      });
    } catch (error) {
      console.error('Assistant patient registration error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error during patient registration',
        error: error.message
      });
    }
  }
);

// Get patients list - Admin
router.get('/admin/patients', authUser, async (req, res) => {
  try {
    if (!req.user || (req.user.role !== 'admin' && !req.user.isAdmin)) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    const { page = 1, limit = 20, search = '' } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {
      role: 'patient'
    };

    if (search) {
      whereClause.$or = [
        { firstName: { $like: `%${search}%` } },
        { lastName: { $like: `%${search}%` } },
        { email: { $like: `%${search}%` } },
        { phoneNumber: { $like: `%${search}%` } }
      ];
    }

    const { rows: patients, count } = await userModel.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      attributes: { exclude: ['password'] },
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json({
      success: true,
      patients,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get patients error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Get patients list - Doctor (their patients from appointments OR primary doctor relationship)
router.get('/doctor/patients', authUser, async (req, res) => {
  try {
    console.log('[/doctor/patients] Request received, user:', req.user?.id, 'role:', req.user?.role);
    
    if (!req.user || req.user.role !== 'doctor') {
      console.log('[/doctor/patients] Access denied - not a doctor');
      return res.status(403).json({
        success: false,
        message: 'Doctor access required'
      });
    }

    // For doctors, req.user.id IS the doctor ID (doctors table)
    const doctorId = req.user.id;
    console.log('[/doctor/patients] Doctor ID:', doctorId);

    // Get unique patient IDs from appointments for this doctor
    const appointments = await Appointment.findAll({
      where: {
        doctorId: doctorId
      },
      attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('patientId')), 'patientId']],
      raw: true
    });

    const appointmentPatientIds = appointments.map(a => a.patientId).filter(id => id != null);

    // Also get patients where this doctor is the primary doctor (Family Doctor concept)
    const primaryPatients = await userModel.findAll({
      where: {
        primary_doctor_id: doctorId
      },
      attributes: ['id'],
      raw: true
    });

    const primaryPatientIds = primaryPatients.map(p => p.id);

    // Combine both sets of patient IDs (unique)
    const allPatientIds = [...new Set([...appointmentPatientIds, ...primaryPatientIds])];
    console.log('[/doctor/patients] Found patient IDs:', allPatientIds.length);

    if (allPatientIds.length === 0) {
      return res.status(200).json({
        success: true,
        patients: [],
        count: 0
      });
    }

    const patients = await userModel.findAll({
      where: {
        id: {
          [Op.in]: allPatientIds
        }
      },
      attributes: { exclude: ['password'] },
      order: [['createdAt', 'DESC']]
    });

    // Add a flag to indicate if this doctor is the primary doctor
    const patientsWithPrimaryFlag = patients.map(p => ({
      ...p.toJSON(),
      isPrimaryDoctor: p.primary_doctor_id === doctorId
    }));

    res.status(200).json({
      success: true,
      patients: patientsWithPrimaryFlag,
      count: patientsWithPrimaryFlag.length
    });
  } catch (error) {
    console.error('[/doctor/patients] Error:', error.message);
    console.error('[/doctor/patients] Stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Get patients list - Nurse
router.get('/nurse/patients', authNurse, async (req, res) => {
  try {
    const patients = await userModel.findAll({
      where: {
        role: 'patient',
        isActive: true
      },
      attributes: { exclude: ['password'] },
      order: [['createdAt', 'DESC']],
      limit: 50
    });

    res.status(200).json({
      success: true,
      patients,
      count: patients.length
    });
  } catch (error) {
    console.error('Get nurse patients error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Get patients list - Assistant (doctor's assigned patients)
router.get('/assistant/patients', authAssistant, async (req, res) => {
  try {
    const patients = await userModel.findAll({
      where: {
        role: 'patient',
        assignedDoctorId: req.assistant.linkedDoctorId
      },
      attributes: { exclude: ['password'] },
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json({
      success: true,
      patients,
      count: patients.length
    });
  } catch (error) {
    console.error('Get assistant patients error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

export default router;
