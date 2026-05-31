/**
 * Pharmacy Routes
 * Authentication and pharmacy management
 */

import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';
import { Pharmacy } from '../models/index.js';
import sharedPool from '../db/pgPool.js';
import { authLimiter } from '../middleware/rateLimiter.middleware.js';
import { auditLoginAttempt } from '../middleware/audit.middleware.js';
import {
  createUploadMiddleware, registerLimiter,
  uploadDocuments, uploadIdCard, sendAdminLeadEmail, addOtpRoutes,
} from './shared/registrationHelpers.js';

const pharmUploadFields = createUploadMiddleware('contactIdCard');

sharedPool.query(`ALTER TABLE pharmacies ALTER COLUMN "licenseNumber" DROP NOT NULL`).catch(() => {});


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
 * GET /api/pharmacy/medicines
 * Public medicine search from pharmacy_medicines DB table (4,877 drugs with MRP)
 */
router.get('/medicines', async (req, res) => {
  try {
    const { search, category, form, schedule } = req.query;
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (search) {
      conditions.push(`(name ILIKE $${idx} OR brand_name ILIKE $${idx} OR generic_name ILIKE $${idx} OR composition ILIKE $${idx} OR manufacturer ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }
    if (category) {
      conditions.push(`category ILIKE $${idx}`);
      params.push(`%${category}%`);
      idx++;
    }
    if (form) {
      conditions.push(`form ILIKE $${idx}`);
      params.push(`%${form}%`);
      idx++;
    }
    if (schedule) {
      conditions.push(`schedule ILIKE $${idx}`);
      params.push(`%${schedule}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rowsResult, countResult] = await Promise.all([
      sharedPool.query(
        `SELECT id, name, brand_name, generic_name, strength, form, category,
                sub_category, manufacturer, composition, mrp, unit_price, pack_size,
                schedule, indication, side_effects, dosage, storage, cims_id
         FROM pharmacy_medicines ${where}
         ORDER BY name ASC LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset]
      ),
      sharedPool.query(
        `SELECT COUNT(*) FROM pharmacy_medicines ${where}`,
        params
      )
    ]);

    const total = parseInt(countResult.rows[0].count, 10);

    res.json({
      success: true,
      medicines: rowsResult.rows,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('[Pharmacy] Medicine search error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to search medicines' });
  }
});

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
      { expiresIn: process.env.JWT_ACCESS_TTL || '15m' }
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
/**
 * POST /api/pharmacy/register  (full security: bot-protection, ClamAV, MinIO, admin email)
 */
router.post('/register', registerLimiter, pharmUploadFields, async (req, res) => {
  try {
    const { name, email, password, confirmPassword, phone, pharmacyType, city, state, address,
            registrationNumber, pharmacistName, pharmacistQual, pharmacistRegNo,
            _hp, _fat, lat, lng } = req.body;

    if (_hp?.trim()) return res.status(201).json({ success: true });
    if (_fat && Date.now() - parseInt(_fat, 10) < 4000) return res.status(201).json({ success: true });
    if (!name || !email || !password || !phone || !city)
      return res.status(400).json({ success: false, message: 'Pharmacy name, email, password, phone, and city are required' });
    if (!pharmacistName)
      return res.status(400).json({ success: false, message: 'Pharmacist-in-Charge name is required' });
    if (password !== confirmPassword)
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    if (password.length < 8)
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });

    const normalizedEmail = email.toLowerCase();
    const existing = await Pharmacy.findOne({ where: { email: normalizedEmail } });
    if (existing) return res.status(409).json({ success: false, message: 'Email already registered' });

    const emailKey = normalizedEmail.replace(/[^a-z0-9]/g, '_');
    const docs   = await uploadDocuments({ files: req.files?.documents || [], emailKey, entityKey: 'pharmacy', req });
    const idCard = await uploadIdCard({ file: req.files?.contactIdCard?.[0], emailKey, entityKey: 'pharmacy', req });

    const pharmacy = await Pharmacy.create({
      name, email: normalizedEmail, password, phoneNumber: phone,
      address: { street: address || '', city, state: state || '', zipCode: '',
                 coordinates: lat && lng ? { lat: parseFloat(lat), lng: parseFloat(lng) } : null },
      pharmacyType: pharmacyType || 'Retail',
      licenseNumber: registrationNumber || null,
      metadata: {
        registrationDocs: docs,
        primaryContact: { name: pharmacistName, qualification: pharmacistQual || '', regNumber: pharmacistRegNo || '', idCard },
        submittedAt: new Date(),
      },
      status: 'pending', isVerified: false,
    });

    res.status(201).json({ success: true, message: 'Application submitted. Our team will review within 24–48 hours.', registrationId: pharmacy.id, entityType: 'pharmacy' });

    sendAdminLeadEmail({ entityLabel: 'Pharmacy', name, email: normalizedEmail, phone, city, state: state || '',
      registrationId: pharmacy.id,
      extraRows: [['Pharmacy Type', pharmacyType || 'Retail'], ...(registrationNumber ? [['Reg. Number', registrationNumber]] : []),
                  ['Pharmacist', pharmacistName], ...(pharmacistQual ? [['Qualification', pharmacistQual]] : [])],
      docs, idCardMeta: idCard });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    if (err.name === 'SequelizeUniqueConstraintError') return res.status(409).json({ success: false, message: 'Email already registered' });
    console.error('Pharmacy registration error:', err);
    res.status(500).json({ success: false, message: 'Registration failed', error: err.message });
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

// OTP routes
addOtpRoutes(router, 'Pharmacy', '#10b981');

export default router;
