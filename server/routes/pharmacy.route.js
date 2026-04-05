/**
 * Pharmacy Routes
 * Authentication and pharmacy management
 */

import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { JWT_CONFIG } from '../config/auth.config.js';
import { Pharmacy } from '../models/index.js';
import { authLimiter } from '../middleware/rateLimiter.middleware.js';
import { auditLoginAttempt } from '../middleware/audit.middleware.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  }
});
import dashboardRouter from './pharmacy/dashboard.routes.js';
import inventoryRouter from './pharmacy/inventory.routes.js';
import posRouter from './pharmacy/pos.routes.js';
import prescriptionsRouter from './pharmacy/prescriptions.routes.js';
import transactionsRouter from './pharmacy/transactions.route.js';
import prescriptionsDetailRouter from './pharmacy/prescriptions.route.js';
import stockRouter from './pharmacy/stock.route.js';
import customersRouter from './pharmacy/customers.route.js';
import batchesRouter from './pharmacy/batches.route.js';
import purchaseOrdersRouter from './pharmacy/purchase-orders.route.js';
import stockAlertsRouter from './pharmacy/stock-alerts.route.js';
import invoicesRouter from './pharmacy/invoices.route.js';
import analyticsRouter from './pharmacy/analytics.route.js';

const router = express.Router();

// Mount sub-routers
router.use('/dashboard', dashboardRouter);
router.use('/inventory', inventoryRouter);
router.use('/pos', posRouter);
router.use('/prescriptions', prescriptionsRouter);
router.use('/transactions', transactionsRouter);
router.use('/prescriptions-detail', prescriptionsDetailRouter);
router.use('/stock', stockRouter);
router.use('/customers', customersRouter);
router.use('/batches', batchesRouter);
router.use('/purchase-orders', purchaseOrdersRouter);
router.use('/stock-alerts', stockAlertsRouter);
router.use('/invoices', invoicesRouter);
router.use('/analytics', analyticsRouter);

/**
 * POST /api/pharmacy/login
 * Pharmacy login
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

    // Find pharmacy by email
    const pharmacy = await Pharmacy.findOne({ where: { email: normalizedEmail } });

    if (!pharmacy) {
      await auditLoginAttempt(req, null, normalizedEmail, false, 'Pharmacy not found');
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, pharmacy.password);

    if (!isValidPassword) {
      await auditLoginAttempt(req, pharmacy.id, normalizedEmail, false, 'Invalid password');
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check for pending approval
    if (pharmacy.status === 'pending') {
      await auditLoginAttempt(req, pharmacy.id, normalizedEmail, false, 'Pharmacy pending approval');
      return res.status(403).json({
        success: false,
        pending: true,
        message: 'Your account is under review by our team. You will receive an email once approved.'
      });
    }
    if (pharmacy.status !== 'active') {
      await auditLoginAttempt(req, pharmacy.id, normalizedEmail, false, 'Pharmacy inactive');
      return res.status(403).json({
        success: false,
        message: 'Account is inactive. Please contact support.'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: pharmacy.id,
        pharmacyId: pharmacy.id,
        email: pharmacy.email,
        role: 'pharmacy',
        userType: 'pharmacy',
        type: 'pharmacy',
        tenant_id: pharmacy.tenant_id
      },
      JWT_CONFIG.SECRET,
      { expiresIn: '7d' }
    );

    await auditLoginAttempt(req, pharmacy.id, normalizedEmail, true);

    res.json({
      success: true,
      token,
      pharmacy: {
        id: pharmacy.id,
        name: pharmacy.name,
        email: pharmacy.email,
        phone: pharmacy.phone,
        type: pharmacy.type,
        license_number: pharmacy.license_number,
        tenant_id: pharmacy.tenant_id
      }
    });
  } catch (error) {
    console.error('Pharmacy login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
});

/**
 * POST /api/pharmacy/register
 * Register new pharmacy
 */
router.post('/register', async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      phone,
      licenseNumber,
      address,
      type = 'Retail',
      city,
      state
    } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
    }

    // Check if pharmacy exists
    const existing = await Pharmacy.findOne({ where: { email: String(email).toLowerCase() } });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Email already registered'
      });
    }

    const registrationDocs = [];
    if (req.files?.length > 0) {
      for (const file of req.files) {
        try {
          const { uploadToMinio } = await import('../services/minio-upload.service.js');
          const result = await uploadToMinio({ buffer: file.buffer, originalName: file.originalname, mimeType: file.mimetype, keyPrefix: 'registrations/pharmacy' });
          if (result.success) registrationDocs.push({ name: file.originalname, url: result.url, key: result.key, size: file.size, uploadedAt: new Date() });
        } catch (e) { console.warn('Pharmacy doc upload skipped:', e.message); }
      }
    }

    // Create pharmacy (model hook hashes password + status defaults to pending)
    const pharmacy = await Pharmacy.create({
      name,
      email: String(email).toLowerCase(),
      password,
      phoneNumber: phone,
      licenseNumber: licenseNumber || null,
      address: address ? { street: address, city: city || '', state: state || '' } : {},
      pharmacyType: type,
      metadata: { registrationDocs, submittedAt: new Date() },
      status: 'pending'
    });

    res.status(201).json({
      success: true,
      message: 'Application submitted. Our team will review and activate your account within 24–48 hours.',
      registrationId: pharmacy.id,
      entityType: 'pharmacy'
    });
  } catch (error) {
    console.error('Pharmacy registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message
    });
  }
});

/**
 * GET /api/pharmacy/profile
 * Get pharmacy profile
 */
router.get('/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const decoded = jwt.verify(token, JWT_CONFIG.SECRET);
    const pharmacy = await Pharmacy.findByPk(decoded.id);

    if (!pharmacy) {
      return res.status(404).json({ success: false, message: 'Pharmacy not found' });
    }

    res.json({
      success: true,
      pharmacy: {
        id: pharmacy.id,
        name: pharmacy.name,
        email: pharmacy.email,
        phone: pharmacy.phone,
        type: pharmacy.type,
        license_number: pharmacy.license_number,
        address: pharmacy.address,
        status: pharmacy.status
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch profile', error: error.message });
  }
});

export default router;
