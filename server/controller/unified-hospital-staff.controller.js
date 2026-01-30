/**
 * Unified Hospital Staff Controller for Mediczy Mobile App
 * Single mobile app for all hospital staff across all tenants
 * 
 * Supported Roles:
 * - doctor
 * - nurse
 * - doctor_assistant
 * - insurance_coordinator
 * - patient (uses unified-patient.controller.js)
 * 
 * Hospital identification methods:
 * - hospital_id (database ID)
 * - hospital_slug (URL-safe identifier)
 * - hospital_domain (custom domain or subdomain)
 */

import User from '../models/postgres/user.model.postgres.js';
import Tenant from '../models/postgres/tenant.model.postgres.js';
import { validationResult } from 'express-validator';
import { Op } from 'sequelize';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { JWT_CONFIG } from '../config/auth.config.js';
import { auditLoginAttempt } from '../middleware/audit.middleware.js';

const JWT_SECRET = JWT_CONFIG.SECRET;

// Rate limiting for staff login
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
 * Helper function to find hospital by various identifiers
 * Supports: hospital_id, hospital_slug, hospital_domain
 */
const findHospitalByIdentifier = async (identifier) => {
  if (!identifier) {
    return null;
  }

  // Try to find by ID, slug, subdomain, or custom_domain
  // Filter by organization_type = 'hospital'
  const hospital = await Tenant.findOne({
    where: {
      [Op.and]: [
        { status: 'active' },
        { organization_type: 'hospital' },
        {
          [Op.or]: [
            { id: isNaN(identifier) ? null : parseInt(identifier) },
            { slug: identifier },
            { subdomain: identifier },
            { custom_domain: identifier }
          ]
        }
      ]
    }
  });

  return hospital;
};

/**
 * Helper function to get role-specific permissions
 */
const getRolePermissions = (role) => {
  const permissionsMap = {
    doctor: {
      read: ['patients', 'appointments', 'prescriptions', 'lab_reports', 'medical_records'],
      write: ['appointments', 'prescriptions', 'lab_orders', 'diagnoses', 'medical_records'],
      delete: ['appointments']
    },
    nurse: {
      read: ['patients', 'appointments', 'vital_signs', 'medical_records'],
      write: ['appointments', 'vital_signs', 'nursing_notes'],
      delete: []
    },
    doctor_assistant: {
      read: ['patients', 'appointments', 'schedules'],
      write: ['appointments', 'schedules', 'notes'],
      delete: []
    },
    insurance_coordinator: {
      read: ['patients', 'insurance_claims', 'insurance_policies', 'billing'],
      write: ['insurance_claims', 'insurance_verifications', 'billing_codes'],
      delete: []
    }
  };

  return permissionsMap[role] || { read: [], write: [], delete: [] };
};

/**
 * Unified Doctor Signup
 * Mobile app endpoint - accepts hospital identifier in request body
 * POST /api/hospital/staff/doctor/signup
 */
export const doctorSignup = async (req, res) => {
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
      hospital_id,
      hospital_slug,
      hospital_domain,
      email,
      password,
      first_name,
      last_name,
      phone,
      specialization,
      license_number,
      years_of_experience,
      qualifications,
      department
    } = req.body;

    // Find hospital by any identifier provided
    const hospitalIdentifier = hospital_id || hospital_slug || hospital_domain;
    const hospital = await findHospitalByIdentifier(hospitalIdentifier);

    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: 'Hospital not found or not active',
        hint: 'Please check your hospital identifier (ID, slug, or domain)'
      });
    }

    console.log('👨‍⚕️ Mobile app doctor signup:', {
      email,
      hospital_name: hospital.name,
      hospital_id: hospital.id,
      hospital_slug: hospital.slug
    });

    // Check if email already exists in this hospital
    const existingUser = await User.findOne({
      where: {
        email,
        organization_id: hospital.id
      }
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Email already registered with this hospital',
        hospital_name: hospital.name
      });
    }

    // Create doctor user
    const doctor = await User.create({
      email,
      password, // Will be hashed by model hook
      firstName: first_name,
      lastName: last_name,
      phoneNumber: phone || '',
      role: 'doctor',
      organization_id: hospital.id,
      permissions: getRolePermissions('doctor'),
      scope: 'organization',
      status: 'active',
      metadata: {
        signup_source: 'mobile_app',
        signup_date: new Date().toISOString(),
        hospital_name: hospital.name,
        specialization: specialization || '',
        license_number: license_number || '',
        years_of_experience: years_of_experience || 0,
        qualifications: qualifications || [],
        department: department || ''
      }
    });

    // Generate JWT token
    const token = jwt.sign(
      {
        id: doctor.id,
        email: doctor.email,
        role: doctor.role,
        userType: 'hospital',
        organization_id: doctor.organization_id,
        hospital_id: hospital.id,
        hospitalId: hospital.id,
        hospital_name: hospital.name,
        hospital_slug: hospital.slug
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('✅ Doctor registered successfully:', doctor.id);

    res.status(201).json({
      success: true,
      message: 'Doctor registered successfully',
      data: {
        token,
        doctor: {
          id: doctor.id,
          email: doctor.email,
          first_name: doctor.firstName,
          last_name: doctor.lastName,
          phone: doctor.phoneNumber,
          role: doctor.role,
          specialization: specialization,
          hospital: {
            id: hospital.id,
            name: hospital.name,
            slug: hospital.slug,
            logo: hospital.logo,
            type: hospital.organization_type
          }
        }
      }
    });
  } catch (error) {
    console.error('❌ Doctor signup error:', error);
    res.status(500).json({
      success: false,
      message: 'Error registering doctor',
      error: error.message
    });
  }
};

/**
 * Unified Doctor Login
 * Mobile app endpoint - accepts hospital identifier in request body
 * POST /api/hospital/staff/doctor/login
 */
export const doctorLogin = async (req, res) => {
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
      hospital_id,
      hospital_slug,
      hospital_domain,
      email,
      password
    } = req.body;

    // Rate limiting check
    if (!checkRateLimit(email)) {
      return res.status(429).json({
        success: false,
        message: 'Too many login attempts. Please try again in 15 minutes.'
      });
    }

    // Find hospital by any identifier provided
    const hospitalIdentifier = hospital_id || hospital_slug || hospital_domain;
    const hospital = await findHospitalByIdentifier(hospitalIdentifier);

    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: 'Hospital not found or not active',
        hint: 'Please check your hospital identifier (ID, slug, or domain)'
      });
    }

    console.log('👨‍⚕️ Mobile app doctor login attempt:', {
      email,
      hospital_name: hospital.name
    });

    // Find doctor
    const doctor = await User.findOne({
      where: {
        email,
        organization_id: hospital.id,
        role: 'doctor',
        status: 'active'
      }
    });

    if (!doctor) {
      await auditLoginAttempt(req, null, email, false, 'Doctor not found');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
        hospital_name: hospital.name
      });
    }

    // Verify password
    const isPasswordValid = await doctor.verifyPassword(password);
    if (!isPasswordValid) {
      await auditLoginAttempt(req, doctor.id, email, false, 'Invalid password');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: doctor.id,
        email: doctor.email,
        role: doctor.role,
        userType: 'hospital',
        organization_id: doctor.organization_id,
        hospital_id: hospital.id,
        hospitalId: hospital.id,
        hospital_name: hospital.name,
        hospital_slug: hospital.slug
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Update last login
    await doctor.update({
      metadata: {
        ...doctor.metadata,
        last_login: new Date().toISOString(),
        login_source: 'mobile_app'
      }
    });

    console.log('✅ Doctor login successful:', doctor.id);
    await auditLoginAttempt(req, doctor.id, email, true);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        doctor: {
          id: doctor.id,
          email: doctor.email,
          first_name: doctor.firstName,
          last_name: doctor.lastName,
          phone: doctor.phoneNumber,
          role: doctor.role,
          specialization: doctor.metadata?.specialization,
          department: doctor.metadata?.department,
          hospital: {
            id: hospital.id,
            name: hospital.name,
            slug: hospital.slug,
            logo: hospital.logo,
            type: hospital.organization_type,
            address: hospital.address,
            phone: hospital.phone,
            email: hospital.email
          }
        }
      }
    });
  } catch (error) {
    console.error('❌ Doctor login error:', error);
    res.status(500).json({
      success: false,
      message: 'Error during login',
      error: error.message
    });
  }
};

/**
 * Unified Nurse Signup
 * POST /api/hospital/staff/nurse/signup
 */
export const nurseSignup = async (req, res) => {
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
      hospital_id,
      hospital_slug,
      hospital_domain,
      email,
      password,
      first_name,
      last_name,
      phone,
      license_number,
      department,
      shift_type
    } = req.body;

    const hospitalIdentifier = hospital_id || hospital_slug || hospital_domain;
    const hospital = await findHospitalByIdentifier(hospitalIdentifier);

    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: 'Hospital not found or not active'
      });
    }

    console.log('👩‍⚕️ Mobile app nurse signup:', {
      email,
      hospital_name: hospital.name
    });

    const existingUser = await User.findOne({
      where: { email, organization_id: hospital.id }
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Email already registered with this hospital'
      });
    }

    const nurse = await User.create({
      email,
      password,
      firstName: first_name,
      lastName: last_name,
      phoneNumber: phone || '',
      role: 'nurse',
      organization_id: hospital.id,
      permissions: getRolePermissions('nurse'),
      scope: 'organization',
      status: 'active',
      metadata: {
        signup_source: 'mobile_app',
        signup_date: new Date().toISOString(),
        hospital_name: hospital.name,
        license_number: license_number || '',
        department: department || '',
        shift_type: shift_type || 'rotating'
      }
    });

    const token = jwt.sign(
      {
        id: nurse.id,
        email: nurse.email,
        role: nurse.role,
        userType: 'hospital',
        organization_id: nurse.organization_id,
        hospital_id: hospital.id,
        hospitalId: hospital.id,
        hospital_name: hospital.name,
        hospital_slug: hospital.slug
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('✅ Nurse registered successfully:', nurse.id);

    res.status(201).json({
      success: true,
      message: 'Nurse registered successfully',
      data: {
        token,
        nurse: {
          id: nurse.id,
          email: nurse.email,
          first_name: nurse.firstName,
          last_name: nurse.lastName,
          phone: nurse.phoneNumber,
          role: nurse.role,
          department: department,
          hospital: {
            id: hospital.id,
            name: hospital.name,
            slug: hospital.slug,
            logo: hospital.logo,
            type: hospital.organization_type
          }
        }
      }
    });
  } catch (error) {
    console.error('❌ Nurse signup error:', error);
    res.status(500).json({
      success: false,
      message: 'Error registering nurse',
      error: error.message
    });
  }
};

/**
 * Unified Nurse Login
 * POST /api/hospital/staff/nurse/login
 */
export const nurseLogin = async (req, res) => {
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
      hospital_id,
      hospital_slug,
      hospital_domain,
      email,
      password
    } = req.body;

    if (!checkRateLimit(email)) {
      return res.status(429).json({
        success: false,
        message: 'Too many login attempts. Please try again in 15 minutes.'
      });
    }

    const hospitalIdentifier = hospital_id || hospital_slug || hospital_domain;
    const hospital = await findHospitalByIdentifier(hospitalIdentifier);

    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: 'Hospital not found or not active'
      });
    }

    console.log('👩‍⚕️ Mobile app nurse login attempt:', {
      email,
      hospital_name: hospital.name
    });

    const nurse = await User.findOne({
      where: {
        email,
        organization_id: hospital.id,
        role: 'nurse',
        status: 'active'
      }
    });

    if (!nurse) {
      await auditLoginAttempt(req, null, email, false, 'Nurse not found');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const isPasswordValid = await nurse.verifyPassword(password);
    if (!isPasswordValid) {
      await auditLoginAttempt(req, nurse.id, email, false, 'Invalid password');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const token = jwt.sign(
      {
        id: nurse.id,
        email: nurse.email,
        role: nurse.role,
        userType: 'hospital',
        organization_id: nurse.organization_id,
        hospital_id: hospital.id,
        hospitalId: hospital.id,
        hospital_name: hospital.name,
        hospital_slug: hospital.slug
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    await nurse.update({
      metadata: {
        ...nurse.metadata,
        last_login: new Date().toISOString(),
        login_source: 'mobile_app'
      }
    });

    console.log('✅ Nurse login successful:', nurse.id);
    await auditLoginAttempt(req, nurse.id, email, true);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        nurse: {
          id: nurse.id,
          email: nurse.email,
          first_name: nurse.firstName,
          last_name: nurse.lastName,
          phone: nurse.phoneNumber,
          role: nurse.role,
          department: nurse.metadata?.department,
          shift_type: nurse.metadata?.shift_type,
          hospital: {
            id: hospital.id,
            name: hospital.name,
            slug: hospital.slug,
            logo: hospital.logo,
            type: hospital.organization_type,
            address: hospital.address,
            phone: hospital.phone,
            email: hospital.email
          }
        }
      }
    });
  } catch (error) {
    console.error('❌ Nurse login error:', error);
    res.status(500).json({
      success: false,
      message: 'Error during login',
      error: error.message
    });
  }
};

/**
 * Unified Doctor Assistant Signup
 * POST /api/hospital/staff/assistant/signup
 */
export const assistantSignup = async (req, res) => {
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
      hospital_id,
      hospital_slug,
      hospital_domain,
      email,
      password,
      first_name,
      last_name,
      phone,
      assigned_doctor_id,
      department
    } = req.body;

    const hospitalIdentifier = hospital_id || hospital_slug || hospital_domain;
    const hospital = await findHospitalByIdentifier(hospitalIdentifier);

    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: 'Hospital not found or not active'
      });
    }

    console.log('👔 Mobile app assistant signup:', {
      email,
      hospital_name: hospital.name
    });

    const existingUser = await User.findOne({
      where: { email, organization_id: hospital.id }
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Email already registered with this hospital'
      });
    }

    const assistant = await User.create({
      email,
      password,
      firstName: first_name,
      lastName: last_name,
      phoneNumber: phone || '',
      role: 'doctor_assistant',
      organization_id: hospital.id,
      permissions: getRolePermissions('doctor_assistant'),
      scope: 'organization',
      status: 'active',
      metadata: {
        signup_source: 'mobile_app',
        signup_date: new Date().toISOString(),
        hospital_name: hospital.name,
        assigned_doctor_id: assigned_doctor_id || null,
        department: department || ''
      }
    });

    const token = jwt.sign(
      {
        id: assistant.id,
        email: assistant.email,
        role: assistant.role,
        userType: 'hospital',
        organization_id: assistant.organization_id,
        hospital_id: hospital.id,
        hospitalId: hospital.id,
        hospital_name: hospital.name,
        hospital_slug: hospital.slug
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('✅ Assistant registered successfully:', assistant.id);

    res.status(201).json({
      success: true,
      message: 'Doctor assistant registered successfully',
      data: {
        token,
        assistant: {
          id: assistant.id,
          email: assistant.email,
          first_name: assistant.firstName,
          last_name: assistant.lastName,
          phone: assistant.phoneNumber,
          role: assistant.role,
          department: department,
          hospital: {
            id: hospital.id,
            name: hospital.name,
            slug: hospital.slug,
            logo: hospital.logo,
            type: hospital.organization_type
          }
        }
      }
    });
  } catch (error) {
    console.error('❌ Assistant signup error:', error);
    res.status(500).json({
      success: false,
      message: 'Error registering doctor assistant',
      error: error.message
    });
  }
};

/**
 * Unified Doctor Assistant Login
 * POST /api/hospital/staff/assistant/login
 */
export const assistantLogin = async (req, res) => {
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
      hospital_id,
      hospital_slug,
      hospital_domain,
      email,
      password
    } = req.body;

    if (!checkRateLimit(email)) {
      return res.status(429).json({
        success: false,
        message: 'Too many login attempts. Please try again in 15 minutes.'
      });
    }

    const hospitalIdentifier = hospital_id || hospital_slug || hospital_domain;
    const hospital = await findHospitalByIdentifier(hospitalIdentifier);

    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: 'Hospital not found or not active'
      });
    }

    console.log('👔 Mobile app assistant login attempt:', {
      email,
      hospital_name: hospital.name
    });

    const assistant = await User.findOne({
      where: {
        email,
        organization_id: hospital.id,
        role: 'doctor_assistant',
        status: 'active'
      }
    });

    if (!assistant) {
      await auditLoginAttempt(req, null, email, false, 'Assistant not found');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const isPasswordValid = await assistant.verifyPassword(password);
    if (!isPasswordValid) {
      await auditLoginAttempt(req, assistant.id, email, false, 'Invalid password');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const token = jwt.sign(
      {
        id: assistant.id,
        email: assistant.email,
        role: assistant.role,
        userType: 'hospital',
        organization_id: assistant.organization_id,
        hospital_id: hospital.id,
        hospitalId: hospital.id,
        hospital_name: hospital.name,
        hospital_slug: hospital.slug
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    await assistant.update({
      metadata: {
        ...assistant.metadata,
        last_login: new Date().toISOString(),
        login_source: 'mobile_app'
      }
    });

    console.log('✅ Assistant login successful:', assistant.id);
    await auditLoginAttempt(req, assistant.id, email, true);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        assistant: {
          id: assistant.id,
          email: assistant.email,
          first_name: assistant.firstName,
          last_name: assistant.lastName,
          phone: assistant.phoneNumber,
          role: assistant.role,
          department: assistant.metadata?.department,
          assigned_doctor_id: assistant.metadata?.assigned_doctor_id,
          hospital: {
            id: hospital.id,
            name: hospital.name,
            slug: hospital.slug,
            logo: hospital.logo,
            type: hospital.organization_type,
            address: hospital.address,
            phone: hospital.phone,
            email: hospital.email
          }
        }
      }
    });
  } catch (error) {
    console.error('❌ Assistant login error:', error);
    res.status(500).json({
      success: false,
      message: 'Error during login',
      error: error.message
    });
  }
};

/**
 * Unified Insurance Coordinator Signup
 * POST /api/hospital/staff/insurance-coordinator/signup
 */
export const insuranceCoordinatorSignup = async (req, res) => {
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
      hospital_id,
      hospital_slug,
      hospital_domain,
      email,
      password,
      first_name,
      last_name,
      phone,
      department,
      certification
    } = req.body;

    const hospitalIdentifier = hospital_id || hospital_slug || hospital_domain;
    const hospital = await findHospitalByIdentifier(hospitalIdentifier);

    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: 'Hospital not found or not active'
      });
    }

    console.log('💼 Mobile app insurance coordinator signup:', {
      email,
      hospital_name: hospital.name
    });

    const existingUser = await User.findOne({
      where: { email, organization_id: hospital.id }
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Email already registered with this hospital'
      });
    }

    const coordinator = await User.create({
      email,
      password,
      firstName: first_name,
      lastName: last_name,
      phoneNumber: phone || '',
      role: 'insurance_coordinator',
      organization_id: hospital.id,
      permissions: getRolePermissions('insurance_coordinator'),
      scope: 'organization',
      status: 'active',
      metadata: {
        signup_source: 'mobile_app',
        signup_date: new Date().toISOString(),
        hospital_name: hospital.name,
        department: department || 'Billing',
        certification: certification || ''
      }
    });

    const token = jwt.sign(
      {
        id: coordinator.id,
        email: coordinator.email,
        role: coordinator.role,
        userType: 'hospital',
        organization_id: coordinator.organization_id,
        hospital_id: hospital.id,
        hospitalId: hospital.id,
        hospital_name: hospital.name,
        hospital_slug: hospital.slug
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('✅ Insurance coordinator registered successfully:', coordinator.id);

    res.status(201).json({
      success: true,
      message: 'Insurance coordinator registered successfully',
      data: {
        token,
        coordinator: {
          id: coordinator.id,
          email: coordinator.email,
          first_name: coordinator.firstName,
          last_name: coordinator.lastName,
          phone: coordinator.phoneNumber,
          role: coordinator.role,
          department: department,
          hospital: {
            id: hospital.id,
            name: hospital.name,
            slug: hospital.slug,
            logo: hospital.logo,
            type: hospital.organization_type
          }
        }
      }
    });
  } catch (error) {
    console.error('❌ Insurance coordinator signup error:', error);
    res.status(500).json({
      success: false,
      message: 'Error registering insurance coordinator',
      error: error.message
    });
  }
};

/**
 * Unified Insurance Coordinator Login
 * POST /api/hospital/staff/insurance-coordinator/login
 */
export const insuranceCoordinatorLogin = async (req, res) => {
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
      hospital_id,
      hospital_slug,
      hospital_domain,
      email,
      password
    } = req.body;

    if (!checkRateLimit(email)) {
      return res.status(429).json({
        success: false,
        message: 'Too many login attempts. Please try again in 15 minutes.'
      });
    }

    const hospitalIdentifier = hospital_id || hospital_slug || hospital_domain;
    const hospital = await findHospitalByIdentifier(hospitalIdentifier);

    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: 'Hospital not found or not active'
      });
    }

    console.log('💼 Mobile app insurance coordinator login attempt:', {
      email,
      hospital_name: hospital.name
    });

    const coordinator = await User.findOne({
      where: {
        email,
        organization_id: hospital.id,
        role: 'insurance_coordinator',
        status: 'active'
      }
    });

    if (!coordinator) {
      await auditLoginAttempt(req, null, email, false, 'Insurance coordinator not found');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const isPasswordValid = await coordinator.verifyPassword(password);
    if (!isPasswordValid) {
      await auditLoginAttempt(req, coordinator.id, email, false, 'Invalid password');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const token = jwt.sign(
      {
        id: coordinator.id,
        email: coordinator.email,
        role: coordinator.role,
        userType: 'hospital',
        organization_id: coordinator.organization_id,
        hospital_id: hospital.id,
        hospitalId: hospital.id,
        hospital_name: hospital.name,
        hospital_slug: hospital.slug
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    await coordinator.update({
      metadata: {
        ...coordinator.metadata,
        last_login: new Date().toISOString(),
        login_source: 'mobile_app'
      }
    });

    console.log('✅ Insurance coordinator login successful:', coordinator.id);
    await auditLoginAttempt(req, coordinator.id, email, true);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        coordinator: {
          id: coordinator.id,
          email: coordinator.email,
          first_name: coordinator.firstName,
          last_name: coordinator.lastName,
          phone: coordinator.phoneNumber,
          role: coordinator.role,
          department: coordinator.metadata?.department,
          certification: coordinator.metadata?.certification,
          hospital: {
            id: hospital.id,
            name: hospital.name,
            slug: hospital.slug,
            logo: hospital.logo,
            type: hospital.organization_type,
            address: hospital.address,
            phone: hospital.phone,
            email: hospital.email
          }
        }
      }
    });
  } catch (error) {
    console.error('❌ Insurance coordinator login error:', error);
    res.status(500).json({
      success: false,
      message: 'Error during login',
      error: error.message
    });
  }
};

/**
 * Search Hospitals
 * Mobile app endpoint - allows staff to search for hospitals to join
 * GET /api/hospital/staff/search?query=apollo&city=chennai
 */
export const searchHospitals = async (req, res) => {
  try {
    const { query, city, state, page = 1, limit = 20 } = req.query;

    const whereClause = {
      status: 'active',
      organization_type: 'hospital'
    };

    if (query) {
      whereClause[Op.or] = [
        { name: { [Op.iLike]: `%${query}%` } },
        { slug: { [Op.iLike]: `%${query}%` } }
      ];
    }

    if (city) {
      whereClause.city = { [Op.iLike]: `%${city}%` };
    }

    if (state) {
      whereClause.state = { [Op.iLike]: `%${state}%` };
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows: hospitals } = await Tenant.findAndCountAll({
      where: whereClause,
      attributes: [
        'id',
        'name',
        'slug',
        'logo',
        'organization_type',
        'address',
        'city',
        'state',
        'country',
        'phone',
        'email',
        'website',
        'description'
      ],
      limit: parseInt(limit),
      offset,
      order: [['name', 'ASC']]
    });

    res.status(200).json({
      success: true,
      data: {
        hospitals,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          total_pages: Math.ceil(count / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('❌ Hospital search error:', error);
    res.status(500).json({
      success: false,
      message: 'Error searching hospitals',
      error: error.message
    });
  }
};

/**
 * Get Staff Profile
 * Mobile app endpoint - staff gets their own profile
 * GET /api/hospital/staff/profile
 */
export const getStaffProfile = async (req, res) => {
  try {
    const staffId = req.user.id;

    const staff = await User.findOne({
      where: {
        id: staffId,
        role: { [Op.in]: ['doctor', 'nurse', 'doctor_assistant', 'insurance_coordinator'] },
        status: 'active'
      },
      attributes: { exclude: ['password'] }
    });

    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff member not found'
      });
    }

    const hospital = await Tenant.findByPk(staff.organization_id);

    res.status(200).json({
      success: true,
      data: {
        staff: {
          id: staff.id,
          email: staff.email,
          first_name: staff.firstName,
          last_name: staff.lastName,
          phone: staff.phoneNumber,
          role: staff.role,
          status: staff.status,
          metadata: staff.metadata,
          created_at: staff.createdAt
        },
        hospital: hospital ? {
          id: hospital.id,
          name: hospital.name,
          slug: hospital.slug,
          logo: hospital.logo,
          type: hospital.organization_type,
          address: hospital.address,
          city: hospital.city,
          state: hospital.state,
          phone: hospital.phone,
          email: hospital.email
        } : null
      }
    });
  } catch (error) {
    console.error('❌ Get staff profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching staff profile',
      error: error.message
    });
  }
};

/**
 * Update Staff Profile
 * Mobile app endpoint - staff updates their own profile
 * PATCH /api/hospital/staff/profile
 */
export const updateStaffProfile = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors.array()
      });
    }

    const staffId = req.user.id;
    const {
      first_name,
      last_name,
      phone,
      specialization,
      department,
      license_number,
      qualifications,
      years_of_experience,
      shift_type,
      certification
    } = req.body;

    const staff = await User.findOne({
      where: {
        id: staffId,
        role: { [Op.in]: ['doctor', 'nurse', 'doctor_assistant', 'insurance_coordinator'] },
        status: 'active'
      }
    });

    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff member not found'
      });
    }

    // Update basic info
    await staff.update({
      firstName: first_name || staff.firstName,
      lastName: last_name || staff.lastName,
      phoneNumber: phone || staff.phoneNumber,
      metadata: {
        ...staff.metadata,
        specialization: specialization || staff.metadata?.specialization,
        department: department || staff.metadata?.department,
        license_number: license_number || staff.metadata?.license_number,
        qualifications: qualifications || staff.metadata?.qualifications,
        years_of_experience: years_of_experience || staff.metadata?.years_of_experience,
        shift_type: shift_type || staff.metadata?.shift_type,
        certification: certification || staff.metadata?.certification
      }
    });

    console.log('✅ Staff profile updated:', staffId);

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        staff: {
          id: staff.id,
          email: staff.email,
          first_name: staff.firstName,
          last_name: staff.lastName,
          phone: staff.phoneNumber,
          role: staff.role,
          metadata: staff.metadata
        }
      }
    });
  } catch (error) {
    console.error('❌ Update staff profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating staff profile',
      error: error.message
    });
  }
};
