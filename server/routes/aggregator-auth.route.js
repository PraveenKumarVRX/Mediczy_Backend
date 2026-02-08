/**
 * Aggregator Authentication Routes
 * Self-service login/register for aggregators (e.g., Mayden)
 * 
 * Base path: /api/aggregator-auth
 */

import express from 'express';
import { body, validationResult } from 'express-validator';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { InsuranceBroker, AuditLog } from '../models/index.js';
import { authUser } from '../middleware/auth.middleware.js';
import { authLimiter } from '../middleware/rateLimiter.middleware.js';
import { auditLoginAttempt } from '../middleware/audit.middleware.js';

const router = express.Router();

// ============================================
// AGGREGATOR AUTHENTICATION ROUTES
// ============================================

/**
 * @route   POST /api/aggregator-auth/register
 * @desc    Register a new aggregator (organization like Mayden)
 * @access  Public
 * @body    {
 *            brokerName: string (organization name),
 *            contactPersonName: string,
 *            email: string (unique),
 *            password: string (min 8 chars),
 *            phoneNumber: string (optional),
 *            officeAddress: string,
 *            city: string,
 *            state: string,
 *            pincode: string,
 *            panNumber: string,
 *            gstin: string,
 *            irdaiLicenseNumber: string (optional for aggregators),
 *            businessType: string (e.g., 'aggregator'),
 *            specializations: array (optional)
 *          }
 * @returns  {token, aggregator}
 */
router.post(
  '/register',
  [
    body('brokerName').trim().notEmpty().withMessage('Organization name is required'),
    body('contactPersonName').trim().notEmpty().withMessage('Contact person name is required'),
    body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('officeAddress').trim().notEmpty().withMessage('Office address is required'),
    body('city').trim().notEmpty().withMessage('City is required'),
    body('state').trim().notEmpty().withMessage('State is required'),
    body('pincode').trim().notEmpty().withMessage('Pincode is required'),
    body('panNumber').trim().notEmpty().withMessage('PAN number is required'),
    body('gstin').trim().optional(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const {
      brokerName,
      contactPersonName,
      email,
      password,
      phoneNumber,
      officeAddress,
      city,
      state,
      pincode,
      panNumber,
      gstin,
      irdaiLicenseNumber,
      businessType = 'aggregator',
      specializations = [],
    } = req.body;

    try {
      // Check if email already exists
      const existingAggregator = await InsuranceBroker.findOne({ where: { email } });
      if (existingAggregator) {
        return res.status(409).json({
          success: false,
          message: 'Email already registered as an aggregator',
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create aggregator
      const aggregator = await InsuranceBroker.create({
        brokerName,
        contactPersonName,
        email,
        password: hashedPassword,
        phoneNumber,
        officeAddress,
        city,
        state,
        pincode,
        panNumber,
        gstin,
        irdaiLicenseNumber,
        businessType,
        specializations,
        status: 'pending',
        isVerified: false,
        commissionPercentage: 0,
        totalPremiumFacilitated: 0,
      });

      // Generate JWT token
      const token = jwt.sign(
        { id: aggregator.id, email: aggregator.email, role: 'aggregator' },
        process.env.JWT_SECRET || 'your_jwt_secret',
        { expiresIn: '7d' }
      );

      // Audit log
      await auditLoginAttempt({
        userId: aggregator.id,
        userType: 'aggregator',
        action: 'register',
        ipAddress: req.ip,
        success: true,
      });

      res.status(201).json({
        success: true,
        message: 'Aggregator registered successfully. Awaiting verification.',
        token,
        aggregator: {
          id: aggregator.id,
          brokerName: aggregator.brokerName,
          email: aggregator.email,
          status: aggregator.status,
        },
      });
    } catch (error) {
      console.error('Aggregator registration error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to register aggregator',
        error: error.message,
      });
    }
  }
);

/**
 * @route   POST /api/aggregator-auth/login
 * @desc    Login aggregator (organization)
 * @access  Public
 * @body    { email: string, password: string }
 * @returns { token, aggregator }
 */
router.post(
  '/login',
  authLimiter,
  [
    body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
      // Find aggregator by email
      const aggregator = await InsuranceBroker.findOne({ where: { email } });
      if (!aggregator) {
        await auditLoginAttempt({
          userEmail: email,
          userType: 'aggregator',
          action: 'login',
          ipAddress: req.ip,
          success: false,
          reason: 'User not found',
        });
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password',
        });
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, aggregator.password);
      if (!isPasswordValid) {
        await auditLoginAttempt({
          userId: aggregator.id,
          userType: 'aggregator',
          action: 'login',
          ipAddress: req.ip,
          success: false,
          reason: 'Invalid password',
        });
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password',
        });
      }

      // Check if aggregator is active
      if (aggregator.status !== 'active') {
        await auditLoginAttempt({
          userId: aggregator.id,
          userType: 'aggregator',
          action: 'login',
          ipAddress: req.ip,
          success: false,
          reason: `Account status: ${aggregator.status}`,
        });
        return res.status(403).json({
          success: false,
          message: `Your account is currently ${aggregator.status}. Please contact support.`,
        });
      }

      // Generate JWT token
      const token = jwt.sign(
        { id: aggregator.id, email: aggregator.email, role: 'aggregator' },
        process.env.JWT_SECRET || 'your_jwt_secret',
        { expiresIn: '7d' }
      );

      // Audit log
      await auditLoginAttempt({
        userId: aggregator.id,
        userType: 'aggregator',
        action: 'login',
        ipAddress: req.ip,
        success: true,
      });

      res.status(200).json({
        success: true,
        message: 'Login successful',
        token,
        aggregator: {
          id: aggregator.id,
          brokerName: aggregator.brokerName,
          email: aggregator.email,
          status: aggregator.status,
          isVerified: aggregator.isVerified,
        },
      });
    } catch (error) {
      console.error('Aggregator login error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to login',
        error: error.message,
      });
    }
  }
);

/**
 * @route   GET /api/aggregator-auth/profile
 * @desc    Get aggregator profile (requires authentication)
 * @access  Private
 */
router.get('/profile', authUser, async (req, res) => {
  try {
    const aggregator = await InsuranceBroker.findByPk(req.user.id);
    if (!aggregator) {
      return res.status(404).json({
        success: false,
        message: 'Aggregator not found',
      });
    }

    res.status(200).json({
      success: true,
      aggregator: {
        id: aggregator.id,
        brokerName: aggregator.brokerName,
        contactPersonName: aggregator.contactPersonName,
        email: aggregator.email,
        phoneNumber: aggregator.phoneNumber,
        officeAddress: aggregator.officeAddress,
        city: aggregator.city,
        state: aggregator.state,
        pincode: aggregator.pincode,
        panNumber: aggregator.panNumber,
        gstin: aggregator.gstin,
        businessType: aggregator.businessType,
        specializations: aggregator.specializations,
        status: aggregator.status,
        isVerified: aggregator.isVerified,
      },
    });
  } catch (error) {
    console.error('Failed to fetch aggregator profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile',
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/aggregator-auth/dashboard
 * @desc    Get aggregator dashboard statistics
 * @access  Private
 */
router.get('/dashboard', authUser, async (req, res) => {
  try {
    const aggregator = await InsuranceBroker.findByPk(req.user.id);
    if (!aggregator) {
      return res.status(404).json({
        success: false,
        message: 'Aggregator not found',
      });
    }

    // For aggregators, count their managed entities
    // This would need to be customized based on your data model
    const stats = {
      organizationName: aggregator.brokerName,
      status: aggregator.status,
      isVerified: aggregator.isVerified,
      verificationDate: aggregator.verificationDate,
      totalCorporates: 0, // TODO: Count corporates under this aggregator
      totalEmployees: 0, // TODO: Count employees
      totalPartners: 0, // TODO: Count wellness partners
      totalPolicies: 0, // TODO: Count policies
      totalMembers: 0, // TODO: Count members covered
    };

    res.status(200).json({
      success: true,
      dashboard: stats,
    });
  } catch (error) {
    console.error('Failed to fetch aggregator dashboard:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard data',
      error: error.message,
    });
  }
});

export default router;
