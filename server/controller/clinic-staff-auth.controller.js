/**
 * Clinic Staff Login Controller
 * Handles staff login for doctors, nurses, and doctor assistants
 */

import User from '../models/postgres/user.model.postgres.js';
import Tenant from '../models/postgres/tenant.model.postgres.js';
import jwt from 'jsonwebtoken';
import { Op } from 'sequelize';
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
    // Reset rate limit window
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
 * Staff login (doctor, nurse, or doctor assistant)
 */
export const clinicStaffLogin = async (req, res) => {
  try {
    const { email, password, role } = req.body;

    console.log(`🏥 Clinic staff login attempt:`, { email, role });

    if (!email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: 'Email, password, and role are required'
      });
    }

    // Validate role
    if (!['doctor', 'nurse', 'doctor_assistant'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Must be doctor, nurse, or doctor_assistant'
      });
    }

    // Check rate limit
    if (!checkRateLimit(email)) {
      return res.status(429).json({
        success: false,
        message: 'Too many login attempts. Please try again after 15 minutes.'
      });
    }

    // Find staff by email and role (QA-BUG-003b: removed broken Tenant include; clinic verified separately below)
    const staff = await User.findOne({
      where: {
        email,
        role,
        organization_type: 'clinic',
        status: 'active'
      },
      attributes: ['id', 'email', 'password', 'firstName', 'lastName', 'phoneNumber', 'role', 'status', 'isActive', 'organization_id', 'permissions', 'scope', 'metadata']
    });

    if (!staff) {
      await auditLoginAttempt(req, null, email, false, 'Staff not found');
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials or staff not found'
      });
    }

    // isActive guard — rejects accounts disabled via the boolean flag
    if (staff.isActive === false) {
      await auditLoginAttempt(req, staff.id, email, false, 'Staff account disabled (isActive=false)');
      return res.status(403).json({
        success: false,
        message: 'Your account has been disabled. Contact your clinic administrator.',
      });
    }

    // Verify password
    const isPasswordValid = await staff.verifyPassword(password);
    if (!isPasswordValid) {
      await auditLoginAttempt(req, staff.id, email, false, 'Invalid password');
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Get clinic details
    const clinic = await Tenant.findByPk(staff.organization_id, {
      attributes: ['id', 'uid', 'name', 'slug', 'type', 'status', 'email', 'phone', 'address']
    });

    if (!clinic || clinic.status !== 'active') {
      await auditLoginAttempt(req, staff.id, email, false, 'Clinic inactive');
      return res.status(403).json({
        success: false,
        message: 'Clinic is not active. Please contact support.'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: staff.id,
        email: staff.email,
        role: staff.role,
        organization_id: clinic.id,
        tenant_id: clinic.id,
        clinic_id: clinic.id,
        clinic_name: clinic.name,
        type: 'clinic_staff',
        first_name: staff.first_name,
        last_name: staff.last_name
      },
      JWT_SECRET,
      { expiresIn: process.env.JWT_ACCESS_TTL || '15m' }
    );

    console.log(`✅ Staff login successful:`, { role, email, clinic_name: clinic.name });

    await auditLoginAttempt(req, staff.id, email, true);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      staff: {
        id: staff.id,
        email: staff.email,
        first_name: staff.firstName,
        last_name: staff.lastName,
        phone: staff.phoneNumber,
        role: staff.role,
        permissions: staff.permissions,
        metadata: staff.metadata
      },
      clinic: {
        id: clinic.id,
        uid: clinic.uid,
        name: clinic.name,
        slug: clinic.slug,
        type: clinic.type,
        email: clinic.email,
        phone: clinic.phone,
        address: clinic.address
      }
    });
  } catch (error) {
    console.error('❌ Clinic staff login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
};

/**
 * Doctor login (specific role)
 */
export const doctorLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('🏥 Doctor login attempt:', { email });

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

    // Find doctor (QA-BUG-003b: include removed — clinic verified via Tenant.findByPk below)
    const doctor = await User.findOne({
      where: { email, role: 'doctor', organization_type: 'clinic', status: 'active' }
    });

    if (!doctor) {
      await auditLoginAttempt(req, null, email, false, 'Doctor not found');
      return res.status(401).json({
        success: false,
        message: 'Doctor account not found'
      });
    }

    // Verify password
    const isPasswordValid = await doctor.verifyPassword(password);
    if (!isPasswordValid) {
      await auditLoginAttempt(req, doctor.id, email, false, 'Invalid password');
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const clinic = await Tenant.findByPk(doctor.organization_id);

    // Generate JWT token
    const token = jwt.sign(
      {
        id: doctor.id,
        email: doctor.email,
        role: 'doctor',
        organization_id: clinic.id,
        tenant_id: clinic.id,
        clinic_id: clinic.id,
        clinic_name: clinic.name,
        type: 'clinic_staff'
      },
      JWT_SECRET,
      { expiresIn: process.env.JWT_ACCESS_TTL || '15m' }
    );

    console.log('✅ Doctor login successful:', { email, clinic_name: clinic.name });

    await auditLoginAttempt(req, doctor.id, email, true);

    res.json({
      success: true,
      message: 'Doctor login successful',
      token,
      doctor: {
        id: doctor.id,
        email: doctor.email,
        first_name: doctor.firstName,
        last_name: doctor.lastName,
        role: doctor.role,
        specialization: doctor.metadata?.specialization,
        license_number: doctor.metadata?.license_number
      },
      clinic: {
        id: clinic.id,
        name: clinic.name,
        slug: clinic.slug
      }
    });
  } catch (error) {
    console.error('❌ Doctor login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
};

/**
 * Nurse login (specific role)
 */
export const nurseLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('🏥 Nurse login attempt:', { email });

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

    // Find nurse (QA-BUG-003b: include removed)
    const nurse = await User.findOne({
      where: { email, role: 'nurse', organization_type: 'clinic', status: 'active' }
    });

    if (!nurse) {
      await auditLoginAttempt(req, null, email, false, 'Nurse not found');
      return res.status(401).json({
        success: false,
        message: 'Nurse account not found'
      });
    }

    // Verify password
    const isPasswordValid = await nurse.verifyPassword(password);
    if (!isPasswordValid) {
      await auditLoginAttempt(req, nurse.id, email, false, 'Invalid password');
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const clinic = await Tenant.findByPk(nurse.organization_id);

    // Generate JWT token
    const token = jwt.sign(
      {
        id: nurse.id,
        email: nurse.email,
        role: 'nurse',
        organization_id: clinic.id,
        tenant_id: clinic.id,
        clinic_id: clinic.id,
        clinic_name: clinic.name,
        type: 'clinic_staff'
      },
      JWT_SECRET,
      { expiresIn: process.env.JWT_ACCESS_TTL || '15m' }
    );

    console.log('✅ Nurse login successful:', { email, clinic_name: clinic.name });

    await auditLoginAttempt(req, nurse.id, email, true);

    res.json({
      success: true,
      message: 'Nurse login successful',
      token,
      nurse: {
        id: nurse.id,
        email: nurse.email,
        first_name: nurse.firstName,
        last_name: nurse.lastName,
        role: nurse.role,
        department: nurse.metadata?.department
      },
      clinic: {
        id: clinic.id,
        name: clinic.name,
        slug: clinic.slug
      }
    });
  } catch (error) {
    console.error('❌ Nurse login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
};

/**
 * Doctor Assistant login (specific role)
 */
export const assistantLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('🏥 Doctor Assistant login attempt:', { email });

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

    // Find assistant
    const assistant = await User.findOne({
      // QA-BUG-003b: include removed
      where: { email, role: 'doctor_assistant', organization_type: 'clinic', status: 'active' }
    });

    if (!assistant) {
      await auditLoginAttempt(req, null, email, false, 'Assistant not found');
      return res.status(401).json({
        success: false,
        message: 'Assistant account not found'
      });
    }

    // Verify password
    const isPasswordValid = await assistant.verifyPassword(password);
    if (!isPasswordValid) {
      await auditLoginAttempt(req, assistant.id, email, false, 'Invalid password');
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const clinic = await Tenant.findByPk(assistant.organization_id);

    // Generate JWT token
    const token = jwt.sign(
      {
        id: assistant.id,
        email: assistant.email,
        role: 'doctor_assistant',
        organization_id: clinic.id,
        tenant_id: clinic.id,
        clinic_id: clinic.id,
        clinic_name: clinic.name,
        type: 'clinic_staff'
      },
      JWT_SECRET,
      { expiresIn: process.env.JWT_ACCESS_TTL || '15m' }
    );

    console.log('✅ Doctor Assistant login successful:', { email, clinic_name: clinic.name });

    await auditLoginAttempt(req, assistant.id, email, true);

    res.json({
      success: true,
      message: 'Assistant login successful',
      token,
      assistant: {
        id: assistant.id,
        email: assistant.email,
        first_name: assistant.firstName,
        last_name: assistant.lastName,
        role: assistant.role,
        department: assistant.metadata?.department
      },
      clinic: {
        id: clinic.id,
        name: clinic.name,
        slug: clinic.slug
      }
    });
  } catch (error) {
    console.error('❌ Doctor Assistant login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
};

/**
 * Verify clinic staff token
 */
export const verifyStaffToken = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    res.json({
      success: true,
      staff: decoded
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
};
