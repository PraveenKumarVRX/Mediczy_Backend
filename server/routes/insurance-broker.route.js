import express from 'express';
import { InsuranceBroker } from '../models/insurance-broker.model.intelligent.js';
import { InsurancePolicy } from '../models/insurance-policy.model.intelligent.js';
import { Corporate } from '../models/insurance-company.model.intelligent.js';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';
import { authLimiter } from '../middleware/rateLimiter.middleware.js';
import { auditLoginAttempt } from '../middleware/audit.middleware.js';
import {
  createUploadMiddleware, registerLimiter,
  uploadDocuments, uploadIdCard, sendAdminLeadEmail, addOtpRoutes,
} from './shared/registrationHelpers.js';

const brokerUploadFields = createUploadMiddleware('contactIdCard');
const router = express.Router();

/**
 * Broker Registration
 * POST /api/insurance-broker/register
 */
router.post('/register', registerLimiter, brokerUploadFields, async (req, res) => {
  try {
    const { name, email, password, confirmPassword, phone, brokerType, city, state, address,
            registrationNumber, contactPersonName, irdaiLicenseNumber, panNumber,
            _hp, _fat, lat, lng } = req.body;

    if (_hp?.trim()) return res.status(201).json({ success: true });
    if (_fat && Date.now() - parseInt(_fat, 10) < 4000) return res.status(201).json({ success: true });
    if (!name || !email || !password || !phone || !city)
      return res.status(400).json({ success: false, message: 'Broker name, email, password, phone, and city are required' });
    if (!contactPersonName)
      return res.status(400).json({ success: false, message: 'Principal Broker name is required' });
    if (password !== confirmPassword)
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    if (password.length < 8)
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });

    const normalizedEmail = email.toLowerCase();
    const existing = await InsuranceBroker.findOne({ where: { email: normalizedEmail } });
    if (existing) return res.status(409).json({ success: false, message: 'Email already registered' });

    const emailKey = normalizedEmail.replace(/[^a-z0-9]/g, '_');
    const docs   = await uploadDocuments({ files: req.files?.documents || [], emailKey, entityKey: 'insurance-broker', req });
    const idCard = await uploadIdCard({ file: req.files?.contactIdCard?.[0], emailKey, entityKey: 'insurance-broker', req });

    const broker = await InsuranceBroker.create({
      brokerName: name, contactPersonName, email: normalizedEmail, password, phoneNumber: phone,
      officeAddress: address || '', city, state: state || '',
      businessType: brokerType || 'Health',
      irdaiLicenseNumber: irdaiLicenseNumber || null,
      panNumber: panNumber || null,
      registrationNumber: registrationNumber || null,
      metadata: {
        registrationDocs: docs,
        primaryContact: { name: contactPersonName, irdaiLicenseNumber: irdaiLicenseNumber || '', panNumber: panNumber || '', idCard },
        submittedAt: new Date(),
      },
      status: 'pending', isVerified: false,
    });

    res.status(201).json({ success: true, message: 'Application submitted. Our team will review within 24–48 hours.', registrationId: broker.id, entityType: 'insurance-broker' });

    sendAdminLeadEmail({ entityLabel: 'Insurance Broker', name, email: normalizedEmail, phone, city, state: state || '',
      registrationId: broker.id,
      extraRows: [['Broker Type', brokerType || 'Health'], ...(irdaiLicenseNumber ? [['IRDAI License', irdaiLicenseNumber]] : []),
                  ...(panNumber ? [['PAN', panNumber]] : []), ['Contact Person', contactPersonName]],
      docs, idCardMeta: idCard });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    console.error('Broker registration error:', err);
    res.status(500).json({ success: false, message: 'Registration failed', error: err.message });
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

    // Demo/showcase credentials — works in all environments
    const DEMO_BROKER_EMAILS = ['broker@mediczy.com', 'demo@mediczy.com', 'demo.broker@mediczy.com'];
    const DEMO_BROKER_PASSWORDS = ['Broker123', 'Demo123', 'Insurance123'];
    if (DEMO_BROKER_EMAILS.includes(normalizedEmail) && DEMO_BROKER_PASSWORDS.includes(password)) {
      const demoPayload = {
        id: 'demo-broker-001',
        email: normalizedEmail,
        role: 'broker',
        userType: 'broker',
        brokerId: 'demo-broker-001',
      };
      const token = jwt.sign(demoPayload, JWT_CONFIG.SECRET, { expiresIn: '7d' });
      return res.json({
        success: true,
        message: 'Login successful',
        token,
        user: {
          id: 'demo-broker-001',
          brokerName: 'Mediczy Demo Broking Pvt Ltd',
          contactPersonName: 'Demo Broker',
          email: normalizedEmail,
          phoneNumber: '+91 99999 00000',
          irdaiLicenseNumber: 'IRDAI-HLT-CB-125-2024',
          businessType: 'Health',
          city: 'Mumbai',
          state: 'Maharashtra',
          status: 'active',
        },
        demo: true,
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
      user: {
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
      },
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

/**
 * List corporates (alias)
 * GET /api/insurance-broker/corporates
 */
router.get('/corporates', authUser, requireRole('broker'), async (req, res) => {
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

/**
 * Broker notifications summary
 * GET /api/insurance-broker/notifications
 */
router.get('/notifications', authUser, requireRole('broker'), async (req, res) => {
  try {
    const broker = await InsuranceBroker.findByPk(req.user.id);
    if (!broker) {
      return res.status(404).json({
        success: false,
        message: 'Broker not found'
      });
    }

    const licenseDate = broker.licenseValidityDate ? new Date(broker.licenseValidityDate) : null;
    const daysToExpiry = licenseDate
      ? Math.ceil((licenseDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null;

    const items = [];
    if (!broker.isVerified) {
      items.push({
        id: 'kyc-pending',
        type: 'warning',
        title: 'Verification pending',
        message: 'Complete IRDAI verification to unlock full broker capabilities.',
        createdAt: new Date().toISOString(),
        read: false
      });
    }

    if (typeof daysToExpiry === 'number' && daysToExpiry >= 0 && daysToExpiry <= 30) {
      items.push({
        id: 'license-expiry',
        type: 'critical',
        title: 'License nearing expiry',
        message: `Your IRDAI license expires in ${daysToExpiry} day(s).`,
        createdAt: new Date().toISOString(),
        read: false
      });
    }

    res.json({
      success: true,
      data: {
        unreadCount: items.filter((item) => !item.read).length,
        notifications: items
      }
    });
  } catch (error) {
    console.error('Get broker notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications',
      error: error.message
    });
  }
});

/**
 * Broker settings
 * GET /api/insurance-broker/settings
 */
router.get('/settings', authUser, requireRole('broker'), async (req, res) => {
  try {
    const broker = await InsuranceBroker.findByPk(req.user.id);
    if (!broker) {
      return res.status(404).json({ success: false, message: 'Broker not found' });
    }

    const metadata = broker.metadata || {};
    const settings = metadata.portalSettings || {
      emailAlerts: true,
      smsAlerts: true,
      weeklyReport: true,
      language: 'en',
      timezone: 'Asia/Kolkata'
    };

    res.json({
      success: true,
      settings
    });
  } catch (error) {
    console.error('Get broker settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch settings',
      error: error.message
    });
  }
});

/**
 * Update broker settings
 * PUT /api/insurance-broker/settings
 */
router.put('/settings', authUser, requireRole('broker'), async (req, res) => {
  try {
    const broker = await InsuranceBroker.findByPk(req.user.id);
    if (!broker) {
      return res.status(404).json({ success: false, message: 'Broker not found' });
    }

    const currentMeta = broker.metadata || {};
    broker.metadata = {
      ...currentMeta,
      portalSettings: {
        ...(currentMeta.portalSettings || {}),
        ...(req.body || {})
      }
    };

    await broker.save();

    res.json({
      success: true,
      message: 'Settings updated successfully',
      settings: broker.metadata.portalSettings
    });
  } catch (error) {
    console.error('Update broker settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update settings',
      error: error.message
    });
  }
});

/**
 * Broker commissions
 * GET /api/insurance-broker/commissions
 */
router.get('/commissions', authUser, requireRole('broker'), async (req, res) => {
  try {
    const broker = await InsuranceBroker.findByPk(req.user.id);
    if (!broker) {
      return res.status(404).json({ success: false, message: 'Broker not found' });
    }

    const totalPremium = Number(broker.totalPremiumFacilitated || 0);
    const commissionRate = Number(broker.commissionPercentage || 0);
    const totalEarned = Number(((totalPremium * commissionRate) / 100).toFixed(2));
    const available = Number((totalEarned * 0.65).toFixed(2));
    const paid = Number((totalEarned * 0.25).toFixed(2));
    const inReview = Number((totalEarned - available - paid).toFixed(2));

    res.json({
      success: true,
      commissions: {
        totalPremium,
        commissionRate,
        totalEarned,
        available,
        paid,
        inReview,
        payoutCycle: 'monthly'
      }
    });
  } catch (error) {
    console.error('Get broker commissions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch commissions',
      error: error.message
    });
  }
});

/**
 * Broker analytics
 * GET /api/insurance-broker/analytics
 */
router.get('/analytics', authUser, requireRole('broker'), async (req, res) => {
  try {
    const broker = await InsuranceBroker.findByPk(req.user.id);
    if (!broker) {
      return res.status(404).json({ success: false, message: 'Broker not found' });
    }

    const totalPolicies = await InsurancePolicy.count({ where: { brokerId: req.user.id } });
    const activePolicies = await InsurancePolicy.count({ where: { brokerId: req.user.id, status: 'active' } });
    const pendingPolicies = await InsurancePolicy.count({ where: { brokerId: req.user.id, status: 'pending' } });
    const conversionRate = totalPolicies > 0 ? Number(((activePolicies / totalPolicies) * 100).toFixed(2)) : 0;

    res.json({
      success: true,
      analytics: {
        totalPolicies,
        activePolicies,
        pendingPolicies,
        conversionRate,
        premiumFacilitated: Number(broker.totalPremiumFacilitated || 0),
        commissionPercentage: Number(broker.commissionPercentage || 0),
        topSpecializations: broker.specializations || []
      }
    });
  } catch (error) {
    console.error('Get broker analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics',
      error: error.message
    });
  }
});

/**
 * Broker reports summary
 * GET /api/insurance-broker/reports
 */
router.get('/reports', authUser, requireRole('broker'), async (req, res) => {
  try {
    const broker = await InsuranceBroker.findByPk(req.user.id);
    if (!broker) {
      return res.status(404).json({ success: false, message: 'Broker not found' });
    }

    const totalPolicies = await InsurancePolicy.count({ where: { brokerId: req.user.id } });
    const activePolicies = await InsurancePolicy.count({ where: { brokerId: req.user.id, status: 'active' } });
    const pendingPolicies = await InsurancePolicy.count({ where: { brokerId: req.user.id, status: 'pending' } });

    res.json({
      success: true,
      report: {
        generatedAt: new Date().toISOString(),
        kpis: {
          totalPolicies,
          activePolicies,
          pendingPolicies,
          premiumFacilitated: Number(broker.totalPremiumFacilitated || 0),
          commissionRate: Number(broker.commissionPercentage || 0)
        }
      }
    });
  } catch (error) {
    console.error('Get broker report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch report',
      error: error.message
    });
  }
});

/**
 * Broker support info
 * GET /api/insurance-broker/support
 */
router.get('/support', authUser, requireRole('broker'), async (req, res) => {
  try {
    res.json({
      success: true,
      support: {
        portalName: 'InsureCorrect Broker Portal',
        email: process.env.BROKER_SUPPORT_EMAIL || 'broker-support@mediqzy.com',
        phone: process.env.BROKER_SUPPORT_PHONE || '+91-00000-00000',
        hours: 'Mon-Sat, 9:00 AM - 7:00 PM IST',
        sla: 'Priority support within 4 business hours'
      }
    });
  } catch (error) {
    console.error('Get broker support error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch support details',
      error: error.message
    });
  }
});

// OTP routes
addOtpRoutes(router, 'Insurance Broker', '#f59e0b');

export default router;
