import express from 'express';
import { Hospital } from '../models/hospital.model.intelligent.js';
import { Corporate } from '../models/insurance-company.model.intelligent.js';
import Tenant from '../models/postgres/tenant.model.postgres.js';
import User from '../models/postgres/user.model.postgres.js';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { Op } from 'sequelize';
import { JWT_CONFIG } from '../config/auth.config.js';
import { authLimiter } from '../middleware/rateLimiter.middleware.js';
import { auditLoginAttempt } from '../middleware/audit.middleware.js';

const router = express.Router();

const normalizeEmail = (email) => String(email || '').toLowerCase();

const buildHospitalTokenPayload = ({ hospital, tenant, user }) => {
  if (tenant && user) {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      userType: 'hospital',
      tenant_id: tenant.id,
      organization_id: tenant.id,
      hospital_id: tenant.id,
      hospitalId: tenant.id,
      hospitalName: tenant.name,
      hospital_slug: tenant.slug,
      subdomain: tenant.subdomain,
      custom_domain: tenant.custom_domain
    };
  }

  if (hospital) {
    return {
      id: hospital.id,
      email: hospital.email,
      role: 'hospital',
      userType: 'hospital',
      hospital_id: hospital.id,
      hospitalId: hospital.id,
      hospitalName: hospital.hospitalName || hospital.name
    };
  }

  return null;
};

/**
 * Hospital Registration
 * POST /api/hospital/auth/register
 */
export const hospitalRegister = async (req, res) => {
  try {
    const {
      hospitalName,
      registrationNumber,
      email,
      password,
      phoneNumber,
      address,
      city,
      state,
      pincode,
      totalBeds,
      specializations,
      facilities
    } = req.body;

    if (!hospitalName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Hospital name, email, and password are required'
      });
    }

    const existing = await Hospital.findOne({ where: { email } });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Hospital with this email already exists'
      });
    }

    const hospital = await Hospital.create({
      hospitalName,
      registrationNumber,
      email,
      password,
      phoneNumber,
      address,
      city,
      state,
      pincode,
      totalBeds: totalBeds || 0,
      availableBeds: totalBeds || 0,
      specializations: specializations || [],
      facilities: facilities || [],
      status: 'active',
      isVerified: false
    });

    const token = jwt.sign(
      { id: hospital.id, email: hospital.email, role: 'hospital' },
      JWT_CONFIG.SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'Hospital registered successfully',
      token,
      hospital: {
        id: hospital.id,
        hospitalName: hospital.hospitalName,
        email: hospital.email,
        city: hospital.city,
        status: hospital.status
      }
    });
  } catch (error) {
    console.error('Hospital registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register hospital',
      error: error.message
    });
  }
};

router.post('/register', hospitalRegister);

/**
 * Hospital Login
 * POST /api/hospital/auth/login
 */
export const hospitalLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    const normalizedEmail = normalizeEmail(email);
    const hospital = await Hospital.findOne({
      where: { email: normalizedEmail }
    });

    if (!hospital) {
      // Fallback: try multitenant hospital staff login by email (no subdomain)
      const user = await User.findOne({
        where: {
          email: normalizedEmail,
          status: 'active',
          [Op.or]: [
            { organization_type: 'hospital' },
            { role: { [Op.in]: ['hospital_admin', 'doctor', 'staff', 'nurse', 'insurance_coordinator', 'billing', 'receptionist'] } }
          ]
        }
      });

      if (!user) {
        await auditLoginAttempt(req, null, normalizedEmail, false, 'Hospital not found');
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        await auditLoginAttempt(req, user.id, normalizedEmail, false, 'Invalid password');
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      const tenantId = user.tenant_id || user.organization_id;
      if (!tenantId) {
        await auditLoginAttempt(req, user.id, normalizedEmail, false, 'Hospital tenant missing');
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      const tenant = await Tenant.findOne({
        where: { id: tenantId, status: 'active', type: 'hospital' }
      });

      if (!tenant) {
        await auditLoginAttempt(req, user.id, normalizedEmail, false, 'Hospital tenant not found');
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      const tokenPayload = buildHospitalTokenPayload({ tenant, user });
      const token = jwt.sign(tokenPayload, JWT_CONFIG.SECRET, { expiresIn: '7d' });

      await auditLoginAttempt(req, user.id, normalizedEmail, true);

      return res.json({
        success: true,
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role
        },
        hospital: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          subdomain: tenant.subdomain,
          custom_domain: tenant.custom_domain,
          email: tenant.email,
          phone: tenant.phone,
          type: tenant.type,
          plan: tenant.plan,
          status: tenant.status
        }
      });
    }

    const isPasswordValid = await hospital.comparePassword(password);
    if (!isPasswordValid) {
      await auditLoginAttempt(req, hospital.id, normalizedEmail, false, 'Invalid password');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    if (hospital.status !== 'active') {
      await auditLoginAttempt(req, hospital.id, normalizedEmail, false, 'Hospital inactive');
      return res.status(403).json({
        success: false,
        message: 'Hospital account is not active'
      });
    }

    const tokenPayload = buildHospitalTokenPayload({ hospital });
    const token = jwt.sign(tokenPayload, JWT_CONFIG.SECRET, { expiresIn: '7d' });

    await auditLoginAttempt(req, hospital.id, normalizedEmail, true);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      hospital: {
        id: hospital.id,
        hospitalName: hospital.hospitalName,
        email: hospital.email,
        phoneNumber: hospital.phoneNumber,
        city: hospital.city,
        state: hospital.state,
        status: hospital.status,
        totalBeds: hospital.totalBeds,
        availableBeds: hospital.availableBeds
      }
    });
  } catch (error) {
    console.error('Hospital login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
};

router.post('/login', authLimiter, hospitalLogin);

/**
 * Hospital Login (Multitenancy-aware)
 * POST /api/hospital/auth/login/v2
 * Supports both old Hospital model and new Tenant model
 */
export const hospitalLoginV2 = async (req, res) => {
  try {
    const { email, password, subdomain } = req.body;
    const hospitalSlug = req.body.hospital_slug || req.body.hospitalSlug || req.body.slug;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Get tenant from subdomain or email domain
    let tenant = null;
    let user = null;

    if (subdomain || hospitalSlug) {
      // Login via subdomain (multitenancy)
      const tenantMatchers = [];
      if (subdomain) {
        tenantMatchers.push({ subdomain });
      }
      if (hospitalSlug) {
        tenantMatchers.push({ slug: hospitalSlug });
      }

      tenant = await Tenant.findOne({
        where: {
          status: 'active',
          type: 'hospital',
          ...(tenantMatchers.length ? { [Op.or]: tenantMatchers } : {})
        }
      });

      if (!tenant) {
        await auditLoginAttempt(req, null, email, false, 'Hospital tenant not found');
        return res.status(404).json({
          success: false,
          message: 'Hospital not found'
        });
      }

      // Find hospital user in tenant
      user = await User.findOne({
        where: {
          email: normalizeEmail(email),
          status: 'active',
          [Op.or]: [
            { tenant_id: tenant.id },
            { organization_id: tenant.id }
          ],
          role: {
            [Op.in]: [
              'hospital_admin',
              'doctor',
              'staff',
              'nurse',
              'insurance_coordinator',
              'billing',
              'receptionist'
            ]
          }
        }
      });
    } else {
      // Fallback: Login via email (old system)
      const hospital = await Hospital.findOne({
        where: { email: normalizeEmail(email) }
      });

      if (!hospital) {
        await auditLoginAttempt(req, null, email, false, 'Hospital not found');
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      const isPasswordValid = await hospital.comparePassword(password);
      if (!isPasswordValid) {
        await auditLoginAttempt(req, hospital.id, email, false, 'Invalid password');
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      if (hospital.status !== 'active') {
        await auditLoginAttempt(req, hospital.id, email, false, 'Hospital inactive');
        return res.status(403).json({
          success: false,
          message: 'Hospital account is not active'
        });
      }

      const tokenPayload = buildHospitalTokenPayload({ hospital });
      const token = jwt.sign(tokenPayload, JWT_CONFIG.SECRET, { expiresIn: '7d' });

      await auditLoginAttempt(req, hospital.id, email, true);
      return res.json({
        success: true,
        message: 'Login successful',
        token,
        hospital: {
          id: hospital.id,
          hospitalName: hospital.hospitalName,
          email: hospital.email,
          phoneNumber: hospital.phoneNumber,
          city: hospital.city,
          state: hospital.state,
          status: hospital.status,
          totalBeds: hospital.totalBeds,
          availableBeds: hospital.availableBeds
        }
      });
    }

    // Handle new multitenancy system
    if (!user) {
      await auditLoginAttempt(req, null, email, false, 'Hospital user not found');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      await auditLoginAttempt(req, user.id, email, false, 'Invalid password');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    if (user.status !== 'active') {
      await auditLoginAttempt(req, user.id, email, false, 'User inactive');
      return res.status(403).json({
        success: false,
        message: 'User account is not active'
      });
    }

    // Generate JWT token with tenant context
    const tokenPayload = buildHospitalTokenPayload({ tenant, user });
    const token = jwt.sign(tokenPayload, JWT_CONFIG.SECRET, { expiresIn: '7d' });

    await auditLoginAttempt(req, user.id, email, true);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      },
      hospital: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        subdomain: tenant.subdomain,
        custom_domain: tenant.custom_domain,
        email: tenant.email,
        phone: tenant.phone,
        type: tenant.type,
        plan: tenant.plan,
        status: tenant.status
      }
    });
  } catch (error) {
    console.error('Hospital login v2 error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
};

router.post('/login/v2', authLimiter, hospitalLoginV2);

/**
 * Hospital Login via Subdomain (for Dhyan hospital, etc.)
 * POST /api/hospital/auth/login-tenant
 * Optimized for multitenancy
 */
export const hospitalLoginTenant = async (req, res) => {
  try {
    const { email, password } = req.body;
    const subdomain = req.get('host')?.split('.')[0]; // Extract from subdomain

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Get hospital tenant
    const tenant = await Tenant.findOne({
      where: {
        [Tenant.sequelize.Op.or]: [
          { subdomain },
          { slug: subdomain }
        ],
        status: 'active',
        type: 'hospital'
      }
    });

    if (!tenant) {
      await auditLoginAttempt(req, null, email, false, 'Hospital tenant not found');
      return res.status(404).json({
        success: false,
        message: 'Hospital not found'
      });
    }

    // Find staff/user in this hospital
    const user = await User.findOne({
      where: {
        email: normalizeEmail(email),
        tenant_id: tenant.id,
        status: 'active'
      }
    });

    if (!user) {
      await auditLoginAttempt(req, null, email, false, 'Hospital user not found');
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      await auditLoginAttempt(req, user.id, email, false, 'Invalid password');
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate JWT
    const tokenPayload = buildHospitalTokenPayload({ tenant, user });
    const token = jwt.sign(tokenPayload, JWT_CONFIG.SECRET, { expiresIn: '7d' });

    await auditLoginAttempt(req, user.id, email, true);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      hospital: {
        id: tenant.id,
        name: tenant.name,
        subdomain: tenant.subdomain
      }
    });
  } catch (error) {
    console.error('Hospital tenant login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
};

router.post('/login-tenant', authLimiter, hospitalLoginTenant);

/**
 * Hospital Profile
 * GET /api/hospital/auth/profile
 */
export const hospitalProfile = async (req, res) => {
  try {
    const hospital = await Hospital.findByPk(req.user.id, {
      attributes: { exclude: ['password'] }
    });

    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: 'Hospital not found'
      });
    }

    res.json({
      success: true,
      hospital
    });
  } catch (error) {
    console.error('Get hospital profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get profile',
      error: error.message
    });
  }
};

router.get('/profile', authUser, requireRole('hospital'), hospitalProfile);

/**
 * Onboard Corporate (Hospital creates corporate record)
 * POST /api/hospital/auth/corporates
 */
export const hospitalCreateCorporate = async (req, res) => {
  try {
    const {
      companyName, cin, gstin, pan, industry, employeeCount,
      hrContactName, hrContactEmail, hrContactPhone,
      officeAddress, city, state, pincode
    } = req.body;

    if (!companyName || !hrContactEmail) {
      return res.status(400).json({
        success: false,
        message: 'Company name and HR contact email are required'
      });
    }

    const existing = await Corporate.findOne({ where: { hrContactEmail } });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Corporate with this HR email already exists'
      });
    }

    const corporate = await Corporate.create({
      companyName, cin, gstin, pan, industry,
      employeeCount: employeeCount || 0,
      hrContactName, hrContactEmail, hrContactPhone,
      officeAddress, city, state, pincode,
      status: 'active',
      isVerified: false,
      onboardedBy: 'hospital',
      onboardedById: req.user.id
    });

    res.status(201).json({
      success: true,
      message: 'Corporate onboarded successfully',
      corporate: {
        id: corporate.id,
        companyName: corporate.companyName,
        industry: corporate.industry,
        employeeCount: corporate.employeeCount,
        status: corporate.status
      }
    });
  } catch (error) {
    console.error('Hospital corporate onboarding error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to onboard corporate',
      error: error.message
    });
  }
};

router.post('/corporates', authUser, requireRole('hospital'), hospitalCreateCorporate);

/**
 * List Corporates onboarded by hospital
 * GET /api/hospital/auth/corporates
 */
export const hospitalListCorporates = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const whereClause = { onboardedBy: 'hospital', onboardedById: req.user.id };
    if (status) whereClause.status = status;

    const offset = (page - 1) * limit;
    const { count, rows: corporates } = await Corporate.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      total: count,
      page: parseInt(page),
      totalPages: Math.ceil(count / limit),
      corporates
    });
  } catch (error) {
    console.error('Get hospital corporates error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get corporates',
      error: error.message
    });
  }
};

router.get('/corporates', authUser, requireRole('hospital'), hospitalListCorporates);

/**
 * Verify hospital token
 * GET /api/hospital/auth/verify
 */
export const hospitalVerify = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const decoded = jwt.verify(token, JWT_CONFIG.SECRET);
    return res.status(200).json({
      success: true,
      hospital: decoded
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
};

router.get('/verify', hospitalVerify);

/**
 * Logout hospital (client-side token removal)
 * POST /api/hospital/auth/logout
 */
export const hospitalLogout = async (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
};

router.post('/logout', hospitalLogout);

export default router;
