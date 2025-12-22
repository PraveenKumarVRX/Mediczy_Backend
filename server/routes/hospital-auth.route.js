import express from 'express';
import { Hospital } from '../models/hospital.model.intelligent.js';
import { Corporate } from '../models/insurance-company.model.intelligent.js';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import jwt from 'jsonwebtoken';

const router = express.Router();

/**
 * Hospital Registration
 * POST /api/hospital/auth/register
 */
router.post('/register', async (req, res) => {
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
      process.env.JWT_SECRET,
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
});

/**
 * Hospital Login
 * POST /api/hospital/auth/login
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    const hospital = await Hospital.findOne({
      where: { email: email.toLowerCase() }
    });

    if (!hospital) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const isPasswordValid = await hospital.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    if (hospital.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Hospital account is not active'
      });
    }

    const token = jwt.sign(
      { id: hospital.id, email: hospital.email, role: 'hospital' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

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
});

/**
 * Hospital Profile
 * GET /api/hospital/auth/profile
 */
router.get('/profile', authUser, requireRole('hospital'), async (req, res) => {
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
});

/**
 * Onboard Corporate (Hospital creates corporate record)
 * POST /api/hospital/auth/corporates
 */
router.post('/corporates', authUser, requireRole('hospital'), async (req, res) => {
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
});

/**
 * List Corporates onboarded by hospital
 * GET /api/hospital/auth/corporates
 */
router.get('/corporates', authUser, requireRole('hospital'), async (req, res) => {
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
});

export default router;
