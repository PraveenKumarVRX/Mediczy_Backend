/**
 * Unified Patient Controller for Mediczy Mobile App
 * Single mobile app for all clinic patients across all tenants
 * 
 * Clinic identification methods:
 * - clinic_id (database ID)
 * - clinic_slug (URL-safe identifier)
 * - clinic_domain (custom domain or subdomain)
 */

import User from '../models/postgres/user.model.postgres.js';
import Tenant from '../models/postgres/tenant.model.postgres.js';
import { validationResult } from 'express-validator';
import { Op } from 'sequelize';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { JWT_CONFIG } from '../config/auth.config.js';
import { auditLoginAttempt } from '../middleware/audit.middleware.js';

const JWT_SECRET = JWT_CONFIG.SECRET;

/**
 * Rate limiting for patient login — failed attempts only.
 *
 * This counter used to be incremented on every *attempt* and cleared only by
 * the window expiring, so five correct logins inside 15 minutes locked the
 * account out of the sixth. That is reachable in normal use: the access token
 * lives 15 minutes, and a mobile user who signs out and back in, or runs the
 * app on two devices, hits it with the right password every time. Counting
 * failures and clearing on success keeps the brute-force guard (five wrong
 * passwords still locks the window) without punishing the legitimate user.
 *
 * The map is per PM2 worker and is pruned on write — an unbounded Map keyed on
 * an attacker-supplied email string is a slow memory leak otherwise.
 */
const loginAttempts = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;
const MAX_TRACKED_IDENTIFIERS = 10000;

const rateLimitKey = (email) => String(email || '').trim().toLowerCase();

const pruneLoginAttempts = (now) => {
  for (const [key, entry] of loginAttempts) {
    if (now > entry.resetTime) loginAttempts.delete(key);
  }
  // Still full of live windows: drop the oldest tracked identifier rather than
  // growing without bound. Insertion order makes the first key the oldest.
  while (loginAttempts.size >= MAX_TRACKED_IDENTIFIERS) {
    const oldest = loginAttempts.keys().next();
    if (oldest.done) break;
    loginAttempts.delete(oldest.value);
  }
};

const isRateLimited = (email) => {
  const key = rateLimitKey(email);
  const entry = loginAttempts.get(key);
  if (!entry) return false;
  if (Date.now() > entry.resetTime) {
    loginAttempts.delete(key);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
};

const registerFailedLogin = (email) => {
  const now = Date.now();
  const key = rateLimitKey(email);
  const entry = loginAttempts.get(key);
  if (entry && now <= entry.resetTime) {
    entry.count += 1;
    loginAttempts.set(key, entry);
    return;
  }
  pruneLoginAttempts(now);
  loginAttempts.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
};

const clearFailedLogins = (email) => {
  loginAttempts.delete(rateLimitKey(email));
};

export const __loginThrottleTestHooks = {
  isRateLimited,
  registerFailedLogin,
  clearFailedLogins,
  reset: () => loginAttempts.clear(),
  size: () => loginAttempts.size,
  MAX_ATTEMPTS,
  MAX_TRACKED_IDENTIFIERS,
};

/**
 * Helper function to find clinic by various identifiers
 * Supports: clinic_id, clinic_slug, clinic_domain
 */
const findClinicByIdentifier = async (identifier) => {
  if (!identifier) {
    return null;
  }

  // Try to find by ID, slug, subdomain, or custom_domain
  const clinic = await Tenant.findOne({
    where: {
      [Op.and]: [
        { status: 'active' },
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

  return clinic;
};

/**
 * Unified Patient Signup
 * Mobile app endpoint - accepts clinic identifier in request body
 * POST /api/patient/signup
 */
export const unifiedPatientSignup = async (req, res) => {
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
      clinic_id,
      clinic_slug,
      clinic_domain,
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

    // Find clinic by any identifier provided
    const clinicIdentifier = clinic_id || clinic_slug || clinic_domain;
    const clinic = await findClinicByIdentifier(clinicIdentifier);

    if (!clinic) {
      return res.status(404).json({
        success: false,
        message: 'Clinic not found or not active',
        hint: 'Please check your clinic identifier (ID, slug, or domain)'
      });
    }

    console.log('📱 Mobile app patient signup:', {
      email,
      clinic_name: clinic.name,
      clinic_id: clinic.id,
      clinic_slug: clinic.slug
    });

    // Check if email already exists in this clinic
    const existingUser = await User.findOne({
      where: {
        email,
        organization_id: clinic.id
      }
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Email already registered with this clinic',
        clinic_name: clinic.name
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
      bloodType: blood_type || '',
      allergies: allergies || [],
      addressCity: address_city || '',
      addressState: address_state || '',
      addressCountry: address_country,
      role: 'patient',
      organization_id: clinic.id,
      permissions: {
        read: ['own_profile', 'own_appointments', 'own_prescriptions', 'own_lab_reports'],
        write: ['own_profile'],
        delete: []
      },
      scope: 'self_only',
      status: 'active',
      metadata: {
        signup_source: 'mobile_app',
        signup_date: new Date().toISOString(),
        clinic_name: clinic.name
      }
    });

    // Generate JWT token
    const token = jwt.sign(
      {
        id: patient.id,
        email: patient.email,
        role: patient.role,
        organization_id: patient.organization_id,
        clinic_id: clinic.id,
        clinic_name: clinic.name,
        clinic_slug: clinic.slug
      },
      JWT_SECRET,
      { expiresIn: process.env.JWT_ACCESS_TTL || '15m' }
    );

    console.log('✅ Patient registered successfully:', patient.id);

    res.status(201).json({
      success: true,
      message: 'Patient registered successfully',
      data: {
        token,
        patient: {
          id: patient.id,
          email: patient.email,
          first_name: patient.firstName,
          last_name: patient.lastName,
          phone: patient.phoneNumber,
          role: patient.role,
          clinic: {
            id: clinic.id,
            name: clinic.name,
            slug: clinic.slug,
            logo: clinic.logo,
            type: clinic.organization_type
          }
        }
      }
    });
  } catch (error) {
    console.error('❌ Patient signup error:', error);
    res.status(500).json({
      success: false,
      message: 'Error registering patient',
      error: error.message
    });
  }
};

/**
 * Unified Patient Login
 * Mobile app endpoint - accepts clinic identifier in request body
 * POST /api/patient/login
 */
export const unifiedPatientLogin = async (req, res) => {
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
      clinic_id,
      clinic_slug,
      clinic_domain,
      email,
      password
    } = req.body;

    // Rate limiting check (failed attempts only — see registerFailedLogin)
    if (isRateLimited(email)) {
      return res.status(429).json({
        success: false,
        message: 'Too many login attempts. Please try again in 15 minutes.'
      });
    }

    // Find clinic by any identifier provided
    const clinicIdentifier = clinic_id || clinic_slug || clinic_domain;
    const clinic = await findClinicByIdentifier(clinicIdentifier);

    if (!clinic) {
      return res.status(404).json({
        success: false,
        message: 'Clinic not found or not active',
        hint: 'Please check your clinic identifier (ID, slug, or domain)'
      });
    }

    console.log('📱 Mobile app patient login attempt:', {
      email,
      clinic_name: clinic.name
    });

    // Find patient
    const patient = await User.findOne({
      where: {
        email,
        organization_id: clinic.id,
        role: 'patient',
        status: 'active'
      }
    });

    if (!patient) {
      registerFailedLogin(email);
      await auditLoginAttempt(req, null, email, false, 'Patient not found');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
        clinic_name: clinic.name
      });
    }

    // Verify password
    const isPasswordValid = await patient.verifyPassword(password);
    if (!isPasswordValid) {
      registerFailedLogin(email);
      await auditLoginAttempt(req, patient.id, email, false, 'Invalid password');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    clearFailedLogins(email);

    // Generate JWT token
    const token = jwt.sign(
      {
        id: patient.id,
        email: patient.email,
        role: patient.role,
        organization_id: patient.organization_id,
        clinic_id: clinic.id,
        clinic_name: clinic.name,
        clinic_slug: clinic.slug
      },
      JWT_SECRET,
      { expiresIn: process.env.JWT_ACCESS_TTL || '15m' }
    );

    // Update last login
    await patient.update({
      metadata: {
        ...patient.metadata,
        last_login: new Date().toISOString(),
        login_source: 'mobile_app'
      }
    });

    console.log('✅ Patient login successful:', patient.id);
    await auditLoginAttempt(req, patient.id, email, true);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        patient: {
          id: patient.id,
          email: patient.email,
          first_name: patient.firstName,
          last_name: patient.lastName,
          phone: patient.phoneNumber,
          date_of_birth: patient.dateOfBirth,
          gender: patient.gender,
          blood_type: patient.bloodType,
          allergies: patient.allergies,
          role: patient.role,
          clinic: {
            id: clinic.id,
            name: clinic.name,
            slug: clinic.slug,
            logo: clinic.logo,
            type: clinic.organization_type,
            address: clinic.address,
            phone: clinic.phone,
            email: clinic.email
          }
        }
      }
    });
  } catch (error) {
    console.error('❌ Patient login error:', error);
    res.status(500).json({
      success: false,
      message: 'Error during login',
      error: error.message
    });
  }
};

/**
 * Search Clinics
 * Mobile app endpoint - allows users to search for clinics to join
 * GET /api/patient/clinics/search?query=apollo&city=chennai
 */
export const searchClinics = async (req, res) => {
  try {
    const { query, city, state, type, page = 1, limit = 20 } = req.query;

    const whereClause = {
      status: 'active'
    };

    // Add search filters
    if (query) {
      whereClause[Op.or] = [
        { name: { [Op.iLike]: `%${query}%` } },
        { slug: { [Op.iLike]: `%${query}%` } }
      ];
    }

    if (city) {
      whereClause[Op.and] = [
        ...(whereClause[Op.and] || []),
        sequelize.where(sequelize.fn('lower', sequelize.cast(sequelize.json('address.city'), 'text')), { [Op.like]: `%${city.toLowerCase()}%` })
      ];
    }

    if (state) {
      whereClause[Op.and] = [
        ...(whereClause[Op.and] || []),
        sequelize.where(sequelize.fn('lower', sequelize.cast(sequelize.json('address.state'), 'text')), { [Op.like]: `%${state.toLowerCase()}%` })
      ];
    }

    if (type) {
      whereClause.type = type;
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows: clinics } = await Tenant.findAndCountAll({
      where: whereClause,
      attributes: [
        'id',
        'name',
        'slug',
        'type',
        'branding',
        'address',
        'phone',
        'email',
        'website'
      ],
      limit: parseInt(limit),
      offset,
      order: [['name', 'ASC']]
    });

    const clinicsNormalized = clinics.map(c => {
      const plain = c.toJSON ? c.toJSON() : c;
      return {
        id: plain.id,
        name: plain.name,
        slug: plain.slug,
        type: plain.type,
        logo: plain.branding?.logo_url || null,
        address: plain.address,
        city: plain.address?.city || null,
        state: plain.address?.state || null,
        country: plain.address?.country || null,
        phone: plain.phone,
        email: plain.email,
        website: plain.website
      };
    });

    res.status(200).json({
      success: true,
      data: {
        clinics: clinicsNormalized,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          total_pages: Math.ceil(count / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('❌ Clinic search error:', error);
    res.status(500).json({
      success: false,
      message: 'Error searching clinics',
      error: error.message
    });
  }
};

/**
 * Get Patient Profile
 * Mobile app endpoint - patient gets their own profile
 * GET /api/patient/profile
 */
export const getPatientProfile = async (req, res) => {
  try {
    const patientId = req.user.id;

    const patient = await User.findOne({
      where: {
        id: patientId,
        role: 'patient',
        status: 'active'
      },
      attributes: { exclude: ['password'] }
    });

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    // Get clinic details
    const clinic = await Tenant.findByPk(patient.organization_id);

    res.status(200).json({
      success: true,
      data: {
        patient: {
          id: patient.id,
          email: patient.email,
          first_name: patient.firstName,
          last_name: patient.lastName,
          phone: patient.phoneNumber,
          date_of_birth: patient.dateOfBirth,
          gender: patient.gender,
          blood_type: patient.bloodType,
          allergies: patient.allergies,
          address_city: patient.addressCity,
          address_state: patient.addressState,
          address_country: patient.addressCountry,
          role: patient.role,
          status: patient.status,
          created_at: patient.createdAt
        },
        clinic: clinic ? {
          id: clinic.id,
          name: clinic.name,
          slug: clinic.slug,
          logo: clinic.logo,
          type: clinic.organization_type,
          address: clinic.address,
          city: clinic.city,
          state: clinic.state,
          phone: clinic.phone,
          email: clinic.email
        } : null
      }
    });
  } catch (error) {
    console.error('❌ Get patient profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching patient profile',
      error: error.message
    });
  }
};

/**
 * Update Patient Profile
 * Mobile app endpoint - patient updates their own profile
 * PATCH /api/patient/profile
 */
export const updatePatientProfile = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors.array()
      });
    }

    const patientId = req.user.id;
    const {
      first_name,
      last_name,
      phone,
      date_of_birth,
      gender,
      blood_type,
      allergies,
      address_city,
      address_state,
      address_country
    } = req.body;

    const patient = await User.findOne({
      where: {
        id: patientId,
        role: 'patient',
        status: 'active'
      }
    });

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    // Update patient
    await patient.update({
      firstName: first_name || patient.firstName,
      lastName: last_name || patient.lastName,
      phoneNumber: phone || patient.phoneNumber,
      dateOfBirth: date_of_birth || patient.dateOfBirth,
      gender: gender || patient.gender,
      bloodType: blood_type || patient.bloodType,
      allergies: allergies || patient.allergies,
      addressCity: address_city || patient.addressCity,
      addressState: address_state || patient.addressState,
      addressCountry: address_country || patient.addressCountry
    });

    console.log('✅ Patient profile updated:', patientId);

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        patient: {
          id: patient.id,
          email: patient.email,
          first_name: patient.firstName,
          last_name: patient.lastName,
          phone: patient.phoneNumber,
          date_of_birth: patient.dateOfBirth,
          gender: patient.gender,
          blood_type: patient.bloodType,
          allergies: patient.allergies,
          address_city: patient.addressCity,
          address_state: patient.addressState,
          address_country: patient.addressCountry
        }
      }
    });
  } catch (error) {
    console.error('❌ Update patient profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating patient profile',
      error: error.message
    });
  }
};
