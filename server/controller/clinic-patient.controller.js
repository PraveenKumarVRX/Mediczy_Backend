/**
 * Clinic Patient Management Controller
 * Allows clinic staff and patients to manage patient accounts
 */

import User from '../models/postgres/user.model.postgres.js';
import Tenant from '../models/postgres/tenant.model.postgres.js';
import { validationResult } from 'express-validator';
import { Op } from 'sequelize';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { JWT_CONFIG } from '../config/auth.config.js';
import { auditLoginAttempt } from '../middleware/audit.middleware.js';

const JWT_SECRET = JWT_CONFIG.SECRET;

// Rate limiting for patient login
const loginAttempts = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;

const checkRateLimit = (email) => {
  const now = Date.now();
  const attempts = loginAttempts.get(email) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW };

  if (now > attempts.resetTime) {
    loginAttempts.set(email, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (attempts.count >= MAX_ATTEMPTS) {
    return false;
  }

  attempts.count += 1;
  loginAttempts.set(email, attempts);
  return true;
};

/**
 * Patient signup with clinic
 * Public endpoint - anyone can signup to a clinic
 */
export const patientSignup = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors.array()
      });
    }

    const { clinicId } = req.params;
    const {
      email,
      password,
      first_name,
      last_name,
      phone,
      date_of_birth,
      gender,
      blood_type,
      allergies,
      address_city,
      address_state,
      address_country = 'India'
    } = req.body;

    // Verify clinic exists and is active
    const clinic = await Tenant.findByPk(clinicId);
    if (!clinic || clinic.status !== 'active') {
      return res.status(404).json({
        success: false,
        message: 'Clinic not found or not active'
      });
    }

    console.log('👤 Patient signup attempt:', { email, clinic_name: clinic.name });

    // Check if email already exists
    const existingUser = await User.findOne({
      where: { email }
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Email already registered'
      });
    }

    // Create patient user
    const patient = await User.create({
      email,
      password, // Will be hashed by model hook
      firstName: first_name,
      lastName: last_name,
      phoneNumber: phone || '',
      dateOfBirth: date_of_birth || new Date(),
      gender: gender || 'Other',
      bloodType: blood_type || null,
      allergies: allergies || [],
      role: 'patient',
      organization_id: clinicId,
      organization_type: 'clinic',
      tenant_id: clinicId,
      status: 'active',
      is_verified: false,
      address_city: address_city || '',
      address_state: address_state || '',
      address_country: address_country,
      permissions: {
        appointments: true,
        medical_records: true,
        prescriptions: true,
        test_results: true,
        billing: false
      },
      scope: {
        clinic_id: clinicId,
        access_type: 'self_only'
      },
      metadata: {
        signup_source: 'clinic_portal',
        clinic_name: clinic.name,
        created_at: new Date().toISOString()
      }
    });

    console.log('✅ Patient signup successful:', { user_id: patient.id, email });

    // Generate JWT token
    const token = jwt.sign(
      {
        id: patient.id,
        email: patient.email,
        role: 'patient',
        organization_id: clinic.id,
        tenant_id: clinic.id,
        clinic_id: clinic.id,
        clinic_name: clinic.name,
        type: 'clinic_patient'
      },
      JWT_SECRET,
      { expiresIn: process.env.JWT_ACCESS_TTL || '15m' }
    );

    res.status(201).json({
      success: true,
      message: 'Patient account created successfully',
      token,
      patient: {
        id: patient.id,
        email: patient.email,
        first_name: patient.firstName,
        last_name: patient.lastName,
        phone: patient.phoneNumber,
        role: patient.role,
        status: patient.status
      },
      clinic: {
        id: clinic.id,
        name: clinic.name,
        phone: clinic.phone,
        address: clinic.address
      }
    });
  } catch (error) {
    console.error('❌ Patient signup error:', error);
    res.status(500).json({
      success: false,
      message: 'Signup failed',
      error: error.message
    });
  }
};

/**
 * Clinic admin adds patient
 * Admin endpoint - clinic admin creates patient account
 */
export const addPatient = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors.array()
      });
    }

    const { clinicId } = req.params;
    const {
      email,
      password,
      first_name,
      last_name,
      phone,
      date_of_birth,
      gender,
      blood_type,
      allergies,
      address_city,
      address_state,
      address_country = 'India'
    } = req.body;

    // Verify clinic exists
    const clinic = await Tenant.findByPk(clinicId);
    if (!clinic) {
      return res.status(404).json({
        success: false,
        message: 'Clinic not found'
      });
    }

    // Verify clinic admin's organization matches
    if (req.user.organization_id !== parseInt(clinicId)) {
      return res.status(403).json({
        success: false,
        message: 'You can only add patients to your clinic'
      });
    }

    console.log('👤 Adding patient to clinic:', { email, clinic_name: clinic.name });

    // Check if email already exists
    const existingUser = await User.findOne({
      where: { email }
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Email already registered'
      });
    }

    // Create patient user
    const patient = await User.create({
      email,
      password, // Will be hashed by model hook
      firstName: first_name,
      lastName: last_name,
      phoneNumber: phone || '',
      dateOfBirth: date_of_birth || new Date(),
      gender: gender || 'Other',
      bloodType: blood_type || null,
      allergies: allergies || [],
      role: 'patient',
      organization_id: clinicId,
      organization_type: 'clinic',
      tenant_id: clinicId,
      status: 'active',
      is_verified: true,
      verified_at: new Date(),
      address_city: address_city || '',
      address_state: address_state || '',
      address_country: address_country,
      permissions: {
        appointments: true,
        medical_records: true,
        prescriptions: true,
        test_results: true,
        billing: false
      },
      scope: {
        clinic_id: clinicId,
        access_type: 'self_only'
      },
      metadata: {
        added_by_admin: true,
        clinic_name: clinic.name,
        created_by: req.user.email,
        created_at: new Date().toISOString()
      }
    });

    console.log('✅ Patient added successfully:', { user_id: patient.id, email });

    res.status(201).json({
      success: true,
      message: 'Patient added successfully',
      patient: {
        id: patient.id,
        email: patient.email,
        first_name: patient.firstName,
        last_name: patient.lastName,
        phone: patient.phoneNumber,
        role: patient.role,
        status: patient.status,
        blood_type: patient.bloodType,
        gender: patient.gender
      }
    });
  } catch (error) {
    console.error('❌ Error adding patient:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add patient',
      error: error.message
    });
  }
};

/**
 * List clinic patients
 * Clinic admin can view all patients
 */
export const listClinicPatients = async (req, res) => {
  try {
    const { clinicId } = req.params;
    const { search, status, limit = 20, offset = 0 } = req.query;

    // Verify clinic admin's organization matches
    if (req.user.organization_id !== parseInt(clinicId)) {
      return res.status(403).json({
        success: false,
        message: 'You can only view patients for your clinic'
      });
    }

    const where = {
      organization_id: parseInt(clinicId),
      role: 'patient'
    };

    if (status) where.status = status;

    if (search) {
      where[Op.or] = [
        { email: { [Op.iLike]: `%${search}%` } },
        { firstName: { [Op.iLike]: `%${search}%` } },
        { lastName: { [Op.iLike]: `%${search}%` } },
        { phoneNumber: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows } = await User.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'email', 'firstName', 'lastName', 'phoneNumber', 'gender', 'bloodType', 'status', 'createdAt']
    });

    res.json({
      success: true,
      data: {
        patients: rows,
        pagination: {
          total: count,
          limit: parseInt(limit),
          offset: parseInt(offset),
          pages: Math.ceil(count / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('❌ Error listing patients:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to list patients',
      error: error.message
    });
  }
};

/**
 * Get patient details
 */
export const getPatientDetails = async (req, res) => {
  try {
    const { clinicId, patientId } = req.params;

    // Verify clinic admin's organization matches
    if (req.user.organization_id !== parseInt(clinicId)) {
      return res.status(403).json({
        success: false,
        message: 'You can only view patients for your clinic'
      });
    }

    const patient = await User.findOne({
      where: {
        id: parseInt(patientId),
        organization_id: parseInt(clinicId),
        role: 'patient'
      },
      attributes: ['id', 'email', 'firstName', 'lastName', 'phoneNumber', 'dateOfBirth', 'gender', 'bloodType', 'allergies', 'address_city', 'address_state', 'address_country', 'status', 'createdAt', 'updatedAt']
    });

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    res.json({
      success: true,
      data: {
        patient
      }
    });
  } catch (error) {
    console.error('❌ Error getting patient details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get patient details',
      error: error.message
    });
  }
};

/**
 * Update patient information
 */
export const updatePatient = async (req, res) => {
  try {
    const { clinicId, patientId } = req.params;
    const { phone, blood_type, allergies, address_city, address_state, gender, status } = req.body;

    // Verify clinic admin's organization matches
    if (req.user.organization_id !== parseInt(clinicId)) {
      return res.status(403).json({
        success: false,
        message: 'You can only update patients for your clinic'
      });
    }

    const patient = await User.findOne({
      where: {
        id: parseInt(patientId),
        organization_id: parseInt(clinicId),
        role: 'patient'
      }
    });

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    // Update fields
    if (phone) patient.phoneNumber = phone;
    if (blood_type) patient.bloodType = blood_type;
    if (allergies) patient.allergies = allergies;
    if (address_city) patient.address_city = address_city;
    if (address_state) patient.address_state = address_state;
    if (gender) patient.gender = gender;
    if (status) patient.status = status;

    await patient.save();

    console.log('✅ Patient updated:', { patient_id: patient.id });

    res.json({
      success: true,
      message: 'Patient updated successfully',
      patient: {
        id: patient.id,
        email: patient.email,
        first_name: patient.firstName,
        last_name: patient.lastName,
        phone: patient.phoneNumber,
        blood_type: patient.bloodType,
        allergies: patient.allergies,
        gender: patient.gender,
        status: patient.status
      }
    });
  } catch (error) {
    console.error('❌ Error updating patient:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update patient',
      error: error.message
    });
  }
};

/**
 * Patient login
 */
export const patientLogin = async (req, res) => {
  try {
    const { clinicId } = req.params;
    const { email, password } = req.body;
    const normalizedEmail = String(email || '').toLowerCase();

    console.log('👤 Patient login attempt:', { email, clinicId });

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Check rate limit
    if (!checkRateLimit(email)) {
      return res.status(429).json({
        success: false,
        message: 'Too many login attempts. Please try again after 15 minutes.'
      });
    }

    // Verify clinic exists
    const clinic = await Tenant.findByPk(clinicId);
    if (!clinic || clinic.status !== 'active') {
      return res.status(404).json({
        success: false,
        message: 'Clinic not found or not active'
      });
    }

    // Find patient
    const patient = await User.findOne({
      where: {
        email: normalizedEmail,
        role: 'patient',
        organization_id: clinicId,
        status: 'active'
      }
    });

    if (!patient) {
      await auditLoginAttempt(req, null, normalizedEmail, false, 'Patient not found');
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials or patient account not found'
      });
    }

    // Verify password
    const isPasswordValid = await patient.verifyPassword(password);
    if (!isPasswordValid) {
      await auditLoginAttempt(req, patient.id, normalizedEmail, false, 'Invalid password');
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: patient.id,
        email: patient.email,
        role: 'patient',
        organization_id: clinic.id,
        tenant_id: clinic.id,
        clinic_id: clinic.id,
        clinic_name: clinic.name,
        type: 'clinic_patient',
        first_name: patient.firstName,
        last_name: patient.lastName
      },
      JWT_SECRET,
      { expiresIn: process.env.JWT_ACCESS_TTL || '15m' }
    );

    console.log('✅ Patient login successful:', { email: normalizedEmail, clinic_name: clinic.name });
    await auditLoginAttempt(req, patient.id, normalizedEmail, true);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      patient: {
        id: patient.id,
        email: patient.email,
        first_name: patient.firstName,
        last_name: patient.lastName,
        phone: patient.phoneNumber,
        role: patient.role,
        gender: patient.gender,
        blood_type: patient.bloodType
      },
      clinic: {
        id: clinic.id,
        name: clinic.name,
        phone: clinic.phone,
        address: clinic.address
      }
    });
  } catch (error) {
    console.error('❌ Patient login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
};

/**
 * Get patient stats for clinic
 */
export const getPatientStats = async (req, res) => {
  try {
    const { clinicId } = req.params;

    // Verify clinic admin's organization matches
    if (req.user.organization_id !== parseInt(clinicId)) {
      return res.status(403).json({
        success: false,
        message: 'You can only view stats for your clinic'
      });
    }

    const totalPatients = await User.count({
      where: {
        organization_id: parseInt(clinicId),
        role: 'patient',
        status: 'active'
      }
    });

    const newPatients = await User.count({
      where: {
        organization_id: parseInt(clinicId),
        role: 'patient',
        status: 'active',
        createdAt: {
          [Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
        }
      }
    });

    res.json({
      success: true,
      data: {
        patient_statistics: {
          total_patients: totalPatients,
          new_patients_30_days: newPatients
        }
      }
    });
  } catch (error) {
    console.error('❌ Error getting patient stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get patient statistics',
      error: error.message
    });
  }
};
