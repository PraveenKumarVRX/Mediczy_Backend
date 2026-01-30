import express from 'express';
import { InsuranceBroker } from '../models/insurance-broker.model.intelligent.js';
import { InsurancePolicy } from '../models/insurance-policy.model.intelligent.js';
import { Corporate } from '../models/insurance-company.model.intelligent.js';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';
import { authLimiter } from '../middleware/rateLimiter.middleware.js';
import { auditLoginAttempt } from '../middleware/audit.middleware.js';

const router = express.Router();

/**
 * Broker Registration
 * POST /api/insurance-broker/register
 */
router.post('/register', async (req, res) => {
  try {
    const {
      brokerName,
      contactPersonName,
      email,
      password,
      phoneNumber,
      irdaiLicenseNumber,
      licenseValidityDate,
      panNumber,
      gstin,
      businessType,
      officeAddress,
      city,
      state,
      pincode,
      specializations,
      serviceAreas
    } = req.body;

    // Validate required fields
    if (!brokerName || !contactPersonName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Broker name, contact person, email, and password are required'
      });
    }

    // Check if broker already exists
    const existingBroker = await InsuranceBroker.findOne({ where: { email } });
    if (existingBroker) {
      return res.status(409).json({
        success: false,
        message: 'Broker with this email already exists'
      });
    }

    // Check IRDAI license uniqueness
    if (irdaiLicenseNumber) {
      const existingLicense = await InsuranceBroker.findOne({
        where: { irdaiLicenseNumber }
      });
      if (existingLicense) {
        return res.status(409).json({
          success: false,
          message: 'This IRDAI license number is already registered'
        });
      }
    }

    // Create broker
    const broker = await InsuranceBroker.create({
      brokerName,
      contactPersonName,
      email,
      password,
      phoneNumber,
      irdaiLicenseNumber,
      licenseValidityDate,
      panNumber,
      gstin,
      businessType: businessType || 'individual',
      officeAddress,
      city,
      state,
      pincode,
      specializations: specializations || [],
      serviceAreas: serviceAreas || [],
      status: 'active',
      isVerified: false
    });

    // Generate JWT token
    const token = jwt.sign(
      {
        id: broker.id,
        email: broker.email,
        role: 'broker',
        userType: 'broker',
        brokerId: broker.id
      },
      JWT_CONFIG.SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'Insurance broker registered successfully',
      token,
      broker: {
        id: broker.id,
        brokerName: broker.brokerName,
        contactPersonName: broker.contactPersonName,
        email: broker.email,
        phoneNumber: broker.phoneNumber,
        irdaiLicenseNumber: broker.irdaiLicenseNumber,
        businessType: broker.businessType,
        status: broker.status,
        isVerified: broker.isVerified
      }
    });
  } catch (error) {
    console.error('Broker registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register broker',
      error: error.message
    });
  }
});

/**
 * Broker Login
 * POST /api/insurance-broker/login
 */
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = String(email || '').toLowerCase();

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find broker
    const broker = await InsuranceBroker.findOne({
      where: { email: normalizedEmail }
    });

    if (!broker) {
      await auditLoginAttempt(req, null, normalizedEmail, false, 'Broker not found');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check password
    const isPasswordValid = await broker.comparePassword(password);
    if (!isPasswordValid) {
      await auditLoginAttempt(req, broker.id, normalizedEmail, false, 'Invalid password');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if broker is active
    if (broker.status !== 'active') {
      await auditLoginAttempt(req, broker.id, normalizedEmail, false, 'Broker inactive');
      return res.status(403).json({
        success: false,
        message: 'Broker account is not active'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: broker.id,
        email: broker.email,
        role: 'broker',
        userType: 'broker',
        brokerId: broker.id
      },
      JWT_CONFIG.SECRET,
      { expiresIn: '7d' }
    );

    await auditLoginAttempt(req, broker.id, normalizedEmail, true);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      broker: {
        id: broker.id,
        brokerName: broker.brokerName,
        contactPersonName: broker.contactPersonName,
        email: broker.email,
        phoneNumber: broker.phoneNumber,
        irdaiLicenseNumber: broker.irdaiLicenseNumber,
        businessType: broker.businessType,
        status: broker.status,
        isVerified: broker.isVerified,
        commissionPercentage: broker.commissionPercentage,
        activePoliciesCount: broker.activePoliciesCount
      }
    });
  } catch (error) {
    console.error('Broker login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
});

/**
 * Get Broker Profile
 * GET /api/insurance-broker/profile
 */
router.get('/profile', authUser, requireRole('broker'), async (req, res) => {
  try {
    const broker = await InsuranceBroker.findByPk(req.user.id, {
      attributes: { exclude: ['password'] }
    });

    if (!broker) {
      return res.status(404).json({
        success: false,
        message: 'Broker not found'
      });
    }

    res.json({
      success: true,
      broker
    });
  } catch (error) {
    console.error('Get broker profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get broker profile',
      error: error.message
    });
  }
});

/**
 * Update Broker Profile
 * PUT /api/insurance-broker/profile
 */
router.put('/profile', authUser, requireRole('broker'), async (req, res) => {
  try {
    const broker = await InsuranceBroker.findByPk(req.user.id);

    if (!broker) {
      return res.status(404).json({
        success: false,
        message: 'Broker not found'
      });
    }

    const {
      brokerName,
      contactPersonName,
      phoneNumber,
      officeAddress,
      city,
      state,
      pincode,
      specializations,
      serviceAreas,
      payoutBankAccount
    } = req.body;

    // Update fields
    if (brokerName) broker.brokerName = brokerName;
    if (contactPersonName) broker.contactPersonName = contactPersonName;
    if (phoneNumber) broker.phoneNumber = phoneNumber;
    if (officeAddress) broker.officeAddress = officeAddress;
    if (city) broker.city = city;
    if (state) broker.state = state;
    if (pincode) broker.pincode = pincode;
    if (specializations) broker.specializations = specializations;
    if (serviceAreas) broker.serviceAreas = serviceAreas;
    if (payoutBankAccount) broker.payoutBankAccount = payoutBankAccount;

    await broker.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      broker: {
        id: broker.id,
        brokerName: broker.brokerName,
        contactPersonName: broker.contactPersonName,
        email: broker.email,
        phoneNumber: broker.phoneNumber,
        officeAddress: broker.officeAddress,
        city: broker.city,
        state: broker.state,
        pincode: broker.pincode
      }
    });
  } catch (error) {
    console.error('Update broker profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: error.message
    });
  }
});

/**
 * Get Broker's Policies
 * GET /api/insurance-broker/policies
 */
router.get('/policies', authUser, requireRole('broker'), async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const whereClause = { brokerId: req.user.id };
    if (status) whereClause.status = status;

    const offset = (page - 1) * limit;

    const { count, rows: policies } = await InsurancePolicy.findAndCountAll({
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
      policies
    });
  } catch (error) {
    console.error('Get broker policies error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get policies',
      error: error.message
    });
  }
});

/**
 * Get Broker Dashboard Stats
 * GET /api/insurance-broker/dashboard
 */
router.get('/dashboard', authUser, requireRole('broker'), async (req, res) => {
  try {
    const broker = await InsuranceBroker.findByPk(req.user.id);

    const totalPolicies = await InsurancePolicy.count({
      where: { brokerId: req.user.id }
    });

    const activePolicies = await InsurancePolicy.count({
      where: { brokerId: req.user.id, status: 'active' }
    });

    const pendingPolicies = await InsurancePolicy.count({
      where: { brokerId: req.user.id, status: 'pending' }
    });

    res.json({
      success: true,
      dashboard: {
        brokerName: broker.brokerName,
        totalPolicies,
        activePolicies,
        pendingPolicies,
        totalPremiumFacilitated: broker.totalPremiumFacilitated,
        commissionPercentage: broker.commissionPercentage,
        isVerified: broker.isVerified,
        licenseValidityDate: broker.licenseValidityDate
      }
    });
  } catch (error) {
    console.error('Get broker dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get dashboard data',
      error: error.message
    });
  }
});

/**
 * Onboard Corporate (Broker creates corporate record)
 * POST /api/insurance-broker/corporates
 */
router.post('/corporates', authUser, requireRole('broker'), async (req, res) => {
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
      onboardedBy: 'broker',
      onboardedById: req.user.id
    });

    res.status(201).json({
      success: true,
      message: 'Corporate onboarded successfully',
      corporate: {
        id: corporate.id,
        companyName: corporate.companyName,
        industry: corporate.industry,
        status: corporate.status
      }
    });
  } catch (error) {
    console.error('Broker corporate onboarding error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to onboard corporate',
      error: error.message
    });
  }
});

/**
 * List Corporates onboarded by broker
 * GET /api/insurance-broker/corporates
 */
router.get('/corporates-list', authUser, requireRole('broker'), async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const whereClause = { onboardedBy: 'broker', onboardedById: req.user.id };
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
    console.error('Get broker corporates error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get corporates',
      error: error.message
    });
  }
});

export default router;
