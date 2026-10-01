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
import bcrypt from 'bcrypt';
import { JWT_CONFIG } from '../config/auth.config.js';
import { auditLoginAttempt } from '../middleware/audit.middleware.js';
import { resolveOrgTypeForTenant } from '../utils/organizationType.js';

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

  const raw = String(identifier).trim().toLowerCase();
  const platformDomain = (process.env.PLATFORM_DOMAIN || 'mediqzy.com').toLowerCase();
  const subdomainLabel = raw.endsWith(`.${platformDomain}`)
    ? raw.slice(0, -(platformDomain.length + 1)).split('.')[0]
    : raw;

  // Try to find by ID, slug, subdomain, or custom_domain.
  //
  // Deliberately NOT restricted to type='hospital' any more. Every department login routes its
  // hospital_slug / hospital_domain through here, so the old filter meant a clinic, corporate,
  // broker or aggregator tenant answered 404 "Hospital not found." for its own slug — roughly 53
  // existing staff (tenant 7 broker=36, tenant 3 clinic=11, and others) could never use a
  // slug-scoped or subdomain login, only the generic form. Verified 2026-10-01: slug
  // 'ninjacart' -> 404 while 'smart-hospital' resolved.
  //
  // Widening this does not widen access: the caller still requires a users row matching this
  // organization_id AND the portal's role AND status='active', and the password is still checked.
  const hospital = await Tenant.findOne({
    where: {
      [Op.and]: [
        { status: 'active' },
        {
          [Op.or]: [
            { id: isNaN(identifier) ? null : parseInt(identifier) },
            { slug: raw },
            { subdomain: raw },
            { custom_domain: raw },
            ...(subdomainLabel && subdomainLabel !== raw
              ? [{ slug: subdomainLabel }, { subdomain: subdomainLabel }]
              : []),
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
    },
    accounts_staff: {
      read: ['billing', 'invoices', 'payments', 'financial_reports', 'ledgers'],
      write: ['invoices', 'payments', 'billing_entries', 'receipts'],
      delete: []
    },
    mrd_staff: {
      read: ['medical_records', 'patient_history', 'discharge_summaries', 'icd_codes'],
      write: ['medical_records', 'coding_entries', 'discharge_summaries'],
      delete: []
    },
    insurance_desk_staff: {
      read: ['insurance_claims', 'pre_authorizations', 'billing', 'tpa_records'],
      write: ['insurance_claims', 'pre_authorizations', 'tpa_submissions'],
      delete: []
    },
    hr_staff: {
      read: ['staff_records', 'payroll', 'attendance', 'leave_requests', 'recruitment'],
      write: ['staff_records', 'attendance', 'leave_approvals', 'payroll_entries'],
      delete: []
    },
    it_edp_staff: {
      read: ['system_logs', 'user_accounts', 'hardware_inventory', 'network_config'],
      write: ['user_accounts', 'system_config', 'hardware_inventory', 'tickets'],
      delete: []
    },
    ot_staff: {
      read: ['operation_schedules', 'patient_records', 'surgical_notes', 'ot_checklists'],
      write: ['operation_schedules', 'surgical_notes', 'ot_checklists', 'instrument_logs'],
      delete: []
    },
    icu_staff: {
      read: ['icu_patients', 'vital_signs', 'critical_care_notes', 'ventilator_logs'],
      write: ['vital_signs', 'critical_care_notes', 'medication_orders', 'nursing_notes'],
      delete: []
    },
    quality_staff: {
      read: ['audit_reports', 'nabh_compliance', 'incidents', 'quality_metrics', 'policies'],
      write: ['audit_reports', 'incidents', 'corrective_actions', 'nabh_checklists'],
      delete: []
    },
    security_staff: {
      read: ['access_logs', 'visitor_records', 'incident_reports', 'cctv_logs'],
      write: ['visitor_records', 'incident_reports', 'patrol_logs', 'access_requests'],
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
      { expiresIn: process.env.JWT_ACCESS_TTL || '15m' }
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
            type: hospital.type
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
      { expiresIn: process.env.JWT_ACCESS_TTL || '15m' }
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
            type: hospital.type,
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
      { expiresIn: process.env.JWT_ACCESS_TTL || '15m' }
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
            type: hospital.type
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
      { expiresIn: process.env.JWT_ACCESS_TTL || '15m' }
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
            type: hospital.type,
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
      { expiresIn: process.env.JWT_ACCESS_TTL || '15m' }
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
            type: hospital.type
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
      { expiresIn: process.env.JWT_ACCESS_TTL || '15m' }
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
            type: hospital.type,
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
      { expiresIn: process.env.JWT_ACCESS_TTL || '15m' }
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
            type: hospital.type
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
      { expiresIn: process.env.JWT_ACCESS_TTL || '15m' }
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
            type: hospital.type,
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

// ==================== DEPARTMENT STAFF HANDLERS (factory) ====================

/**
 * Factory: creates signup + login handlers for any department staff role.
 * If no hospital identifier is supplied in the request, the lookup falls back
 * to email+role across all hospitals (suitable for single-tenant deployments).
 */
/**
 * Builds the signup/login pair for one department staff role.
 *
 * options.allowUsername — the department may authenticate by `users.username` instead of an
 * email. Added for HR (20261001000001): HR and ward staff frequently share or simply lack a
 * corporate address, and `users.email` is UNIQUE, so such a person could not be given an
 * hr_staff row at all and their HR privileges were unreachable. Email still works for the
 * accounts that already have one — this widens the identifier, it does not replace it.
 */
const makeDeptHandlers = (roleKey, displayName, options = {}) => {
  const allowUsername = options.allowUsername === true;
  const credentialLabel = allowUsername ? 'username or email' : 'email';
  const signup = async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: 'Validation error', errors: errors.array() });
      }

      const { hospital_id, hospital_slug, hospital_domain, email, password, first_name, last_name, phone, department } = req.body;
      const hospitalIdentifier = hospital_id || hospital_slug || hospital_domain;

      // Normalised here as well as in the model hook, because the duplicate pre-check below
      // queries on it before any hook has run.
      const username = allowUsername && typeof req.body.username === 'string'
        ? req.body.username.trim().toLowerCase() || null
        : null;
      if (allowUsername && !username && !email) {
        return res.status(400).json({ success: false, message: 'A username or an email is required' });
      }

      const hospital = await findHospitalByIdentifier(hospitalIdentifier);
      if (!hospital) {
        return res.status(404).json({ success: false, message: 'Hospital not found. Please provide a valid hospital_id, hospital_slug, or hospital_domain.' });
      }

      // A username is unique platform-wide (partial unique index on lower(username)), so it is
      // checked without the organization/role scope that the email check uses.
      if (username) {
        const takenName = await User.findOne({ where: { username } });
        if (takenName) {
          return res.status(409).json({ success: false, message: 'That username is already taken.' });
        }
      }
      if (email) {
        const existing = await User.findOne({ where: { email, organization_id: hospital.id, role: roleKey } });
        if (existing) {
          return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
        }
      }

      // From the tenant's own type, not a hardcoded guess.
      const { orgType: staffOrgType, expressible } = resolveOrgTypeForTenant(hospital, null);
      if (!expressible) {
        console.warn(`[${displayName} signup] tenant ${hospital.id} is type '${hospital.type}', which users.organization_type cannot express; storing '${staffOrgType}'`);
      }

      const staff = await User.create({
        email: email || null,
        username,
        password,
        firstName: first_name,
        lastName: last_name,
        phoneNumber: phone || null,
        role: roleKey,
        organization_id: hospital.id,
        // Without this the column takes its model default, 'individual', and the new staff member
        // is invisible to the HR module — listStaff() filters on organization_type, so the account
        // exists, logs in, and appears nowhere.
        organization_type: staffOrgType,
        permissions: getRolePermissions(roleKey),
        scope: 'organization',
        status: 'active',
        metadata: { department: department || displayName, created_via: 'web_portal' }
      });

      const token = jwt.sign(
        { id: staff.id, email: staff.email, role: staff.role, userType: 'hospital', tokenType: 'access', organization_id: staff.organization_id, hospital_id: hospital.id, hospitalId: hospital.id, hospital_name: hospital.name, hospital_slug: hospital.slug },
        JWT_SECRET,
        { expiresIn: process.env.JWT_ACCESS_TTL || '15m' }
      );

      console.log(`✅ ${displayName} signup successful:`, staff.id);
      res.status(201).json({
        success: true,
        message: `${displayName} account created successfully`,
        data: {
          token,
          staff: { id: staff.id, email: staff.email, username: staff.username, first_name: staff.firstName, last_name: staff.lastName, role: staff.role,
            hospital: { id: hospital.id, name: hospital.name, slug: hospital.slug } }
        }
      });
    } catch (error) {
      console.error(`❌ ${displayName} signup error:`, error);
      res.status(500).json({ success: false, message: 'Error during signup', error: error.message });
    }
  };

  const login = async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: 'Validation error', errors: errors.array() });
      }

      const { hospital_id, hospital_slug, hospital_domain, email, password } = req.body;

      // Which column identifies this account. A department that allows usernames accepts either,
      // so staff who already have an email keep their existing credentials.
      const username = allowUsername && typeof req.body.username === 'string'
        ? req.body.username.trim().toLowerCase()
        : '';
      const byUsername = username.length > 0;
      // What the rate limiter and the audit log record. Keyed on whichever identifier was actually
      // submitted — keying username logins on a blank email would put the whole department into
      // one shared attempt budget.
      const identifier = byUsername ? username : email;

      // Hard guard, not a formality: Sequelize silently DROPS an undefined value from a `where`,
      // so a body carrying neither identifier would degrade to { role, status } and match the
      // first active member of this department — an authentication bypass. The validators cannot
      // catch this for HR, where both fields are individually optional.
      if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
        return res.status(400).json({ success: false, message: `A ${credentialLabel} is required` });
      }

      if (!checkRateLimit(identifier)) {
        return res.status(429).json({ success: false, message: 'Too many login attempts. Please try again in 15 minutes.' });
      }

      const hospitalIdentifier = hospital_id || hospital_slug || hospital_domain;

      // Stored usernames are already case-folded (User model beforeCreate/beforeUpdate), so an
      // equality match on the folded input is enough and agrees with the lower(username) index.
      const identifyBy = byUsername ? { username } : { email };

      let staff;
      if (hospitalIdentifier) {
        // Multi-tenant: look up within specific hospital
        const hospital = await findHospitalByIdentifier(hospitalIdentifier);
        if (!hospital) {
          return res.status(404).json({ success: false, message: 'Hospital not found.' });
        }
        staff = await User.findOne({ where: { ...identifyBy, organization_id: hospital.id, role: roleKey, status: 'active' } });
      } else {
        // Single-tenant fallback: find by identifier + role only
        staff = await User.findOne({ where: { ...identifyBy, role: roleKey, status: 'active' } });
      }

      if (!staff) {
        await auditLoginAttempt(req, null, identifier, false, `${displayName} not found`);
        return res.status(401).json({ success: false, message: `Invalid ${credentialLabel} or password` });
      }

      const isPasswordValid = await staff.verifyPassword(password);
      if (!isPasswordValid) {
        await auditLoginAttempt(req, staff.id, identifier, false, 'Invalid password');
        return res.status(401).json({ success: false, message: `Invalid ${credentialLabel} or password` });
      }

      const hospital = await Tenant.findByPk(staff.organization_id);

      const token = jwt.sign(
        { id: staff.id, email: staff.email, role: staff.role, userType: 'hospital', tokenType: 'access', organization_id: staff.organization_id, hospital_id: staff.organization_id, hospitalId: staff.organization_id, hospital_name: hospital?.name, hospital_slug: hospital?.slug },
        JWT_SECRET,
        { expiresIn: process.env.JWT_ACCESS_TTL || '15m' }
      );

      await staff.update({ metadata: { ...staff.metadata, last_login: new Date().toISOString(), login_source: 'web_portal' } });

      console.log(`✅ ${displayName} login successful:`, staff.id);
      await auditLoginAttempt(req, staff.id, identifier, true);

      res.status(200).json({
        success: true,
        message: 'Login successful',
        data: {
          token,
          staff: { id: staff.id, email: staff.email, username: staff.username, first_name: staff.firstName, last_name: staff.lastName, phone: staff.phoneNumber, role: staff.role, department: staff.metadata?.department,
            hospital: hospital ? { id: hospital.id, name: hospital.name, slug: hospital.slug, logo: hospital.logo, type: hospital.type, address: hospital.address, phone: hospital.phone, email: hospital.email } : null }
        }
      });
    } catch (error) {
      console.error(`❌ ${displayName} login error:`, error);
      res.status(500).json({ success: false, message: 'Error during login', error: error.message });
    }
  };

  return { signup, login };
};

// Instantiate department handlers
const _accounts   = makeDeptHandlers('accounts_staff',       'Accounts Staff');
const _mrd        = makeDeptHandlers('mrd_staff',            'MRD Staff');
const _insDeskH   = makeDeptHandlers('insurance_desk_staff', 'Insurance Desk Staff');
const _hr         = makeDeptHandlers('hr_staff',             'HR Staff', { allowUsername: true });
const _itEdp      = makeDeptHandlers('it_edp_staff',         'IT/EDP Staff');
const _ot         = makeDeptHandlers('ot_staff',             'OT Staff');
const _icu        = makeDeptHandlers('icu_staff',            'ICU Staff');
const _quality    = makeDeptHandlers('quality_staff',        'Quality Staff');
const _security   = makeDeptHandlers('security_staff',       'Security Staff');

export const accountsStaffSignup    = _accounts.signup;
export const accountsStaffLogin     = _accounts.login;
export const mrdStaffSignup         = _mrd.signup;
export const mrdStaffLogin          = _mrd.login;
export const insuranceDeskSignup    = _insDeskH.signup;
export const insuranceDeskLogin     = _insDeskH.login;
export const hrStaffSignup          = _hr.signup;
export const hrStaffLogin           = _hr.login;
export const itEdpStaffSignup       = _itEdp.signup;
export const itEdpStaffLogin        = _itEdp.login;
export const otStaffSignup          = _ot.signup;
export const otStaffLogin           = _ot.login;
export const icuStaffSignup         = _icu.signup;
export const icuStaffLogin          = _icu.login;
export const qualityStaffSignup     = _quality.signup;
export const qualityStaffLogin      = _quality.login;
export const securityStaffSignup    = _security.signup;
export const securityStaffLogin     = _security.login;

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

    const ALL_STAFF_ROLES = ['doctor', 'nurse', 'doctor_assistant', 'insurance_coordinator',
      'accounts_staff', 'mrd_staff', 'insurance_desk_staff', 'hr_staff',
      'it_edp_staff', 'ot_staff', 'icu_staff', 'quality_staff', 'security_staff'];

    const staff = await User.findOne({
      where: {
        id: staffId,
        role: { [Op.in]: ALL_STAFF_ROLES },
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
          type: hospital.type,
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

    const ALL_STAFF_ROLES = ['doctor', 'nurse', 'doctor_assistant', 'insurance_coordinator',
      'accounts_staff', 'mrd_staff', 'insurance_desk_staff', 'hr_staff',
      'it_edp_staff', 'ot_staff', 'icu_staff', 'quality_staff', 'security_staff'];

    const staff = await User.findOne({
      where: {
        id: staffId,
        role: { [Op.in]: ALL_STAFF_ROLES },
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
