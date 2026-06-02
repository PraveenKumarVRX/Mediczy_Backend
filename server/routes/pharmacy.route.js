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
import { requirePharmacyAuth } from '../middleware/pharmacyAuth.middleware.js';
import {
  createUploadMiddleware, registerLimiter,
  uploadDocuments, uploadIdCard, sendAdminLeadEmail, addOtpRoutes,
} from './shared/registrationHelpers.js';

const pharmUploadFields = createUploadMiddleware('contactIdCard');


import dashboardRouter from './pharmacy/dashboard.routes.js';
import inventoryRouter from './pharmacy/inventory.routes.js';
import posRouter from './pharmacy/pos.routes.js';
import prescriptionsRouter from './pharmacy/prescriptions.route.js';
import transactionsRouter from './pharmacy/transactions.route.js';
import stockRouter from './pharmacy/stock.route.js';
import customersRouter from './pharmacy/customers.route.js';
import batchesRouter from './pharmacy/batches.route.js';
import purchaseOrdersRouter from './pharmacy/purchase-orders.route.js';
import stockAlertsRouter from './pharmacy/stock-alerts.route.js';
import invoicesRouter from './pharmacy/invoices.route.js';
import analyticsRouter from './pharmacy/analytics.route.js';
import returnsRouter from './pharmacy/returns.route.js';
import complianceRouter from './pharmacy/compliance.route.js';

const router = express.Router();

// Mount sub-routers
router.use('/dashboard', dashboardRouter);
router.use('/inventory', inventoryRouter);
router.use('/pos', posRouter);
router.use('/prescriptions', prescriptionsRouter);
router.use('/transactions', transactionsRouter);
router.use('/prescriptions-detail', prescriptionsRouter);
router.use('/stock', stockRouter);
router.use('/customers', customersRouter);
router.use('/batches', batchesRouter);
router.use('/purchase-orders', purchaseOrdersRouter);
router.use('/stock-alerts', stockAlertsRouter);
router.use('/invoices', invoicesRouter);
router.use('/analytics', analyticsRouter);
router.use('/returns', returnsRouter);
router.use('/compliance', complianceRouter);

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
 * GET /api/pharmacy/medicines/:id/alternatives
 * Returns similar medicines by generic_name + form when a medicine is out of stock.
 */
router.get('/medicines/:id/alternatives', async (req, res) => {
  try {
    const { id } = req.params;
    const idNum = parseInt(id, 10);
    if (!idNum) return res.status(400).json({ success: false, message: 'Invalid medicine ID' });

    // Fetch the source medicine first
    const sourceResult = await sharedPool.query(
      `SELECT id, generic_name, form, category FROM pharmacy_medicines WHERE id = $1 LIMIT 1`,
      [idNum]
    );
    if (!sourceResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Medicine not found' });
    }

    const source = sourceResult.rows[0];

    // Find alternatives: same generic_name + form, excluding source, in-stock first
    const altResult = await sharedPool.query(
      `SELECT id, name, brand_name, generic_name, strength, form, category, mrp, unit_price,
              pack_size, manufacturer, in_stock
       FROM pharmacy_medicines
       WHERE id != $1
         AND generic_name ILIKE $2
         AND form ILIKE $3
       ORDER BY in_stock DESC NULLS LAST, mrp ASC
       LIMIT 5`,
      [idNum, source.generic_name || '%', source.form || '%']
    );

    res.json({ success: true, alternatives: altResult.rows, sourceId: idNum });
  } catch (error) {
    console.error('[Pharmacy] Alternatives error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to find alternatives' });
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
        pharmacyId: pharmacy.id,
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
router.get('/profile', requirePharmacyAuth, async (req, res) => {
  try {
    const pharmacy = await Pharmacy.findByPk(req.pharmacyId);

    if (!pharmacy) {
      return res.status(404).json({ success: false, message: 'Pharmacy not found' });
    }

    res.json({
      success: true,
      pharmacy: {
        id: pharmacy.id,
        name: pharmacy.name,
        email: pharmacy.email,
        phone: pharmacy.phoneNumber,
        phoneNumber: pharmacy.phoneNumber,
        licenseNumber: pharmacy.licenseNumber,
        license_number: pharmacy.licenseNumber,
        gstNumber: pharmacy.gstNumber,
        address: pharmacy.address,
        operatingHours: pharmacy.operatingHours,
        metadata: pharmacy.metadata,
        status: pharmacy.status
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch profile', error: error.message });
  }
});

/**
 * PUT /api/pharmacy/profile
 * Update pharmacy profile for the authenticated pharmacy
 */
router.put('/profile', requirePharmacyAuth, async (req, res) => {
  try {
    const pharmacy = await Pharmacy.findByPk(req.pharmacyId);

    if (!pharmacy) {
      return res.status(404).json({ success: false, message: 'Pharmacy not found' });
    }

    const allowedUpdates = {};
    const { name, phoneNumber, phone, licenseNumber, gstNumber, address, operatingHours, expiryAlertDays, lowStockThreshold, notes } = req.body || {};

    if (typeof name === 'string') allowedUpdates.name = name.trim();
    if (typeof phoneNumber === 'string' || typeof phone === 'string') allowedUpdates.phoneNumber = String(phoneNumber || phone).trim();
    if (typeof licenseNumber === 'string') allowedUpdates.licenseNumber = licenseNumber.trim();
    if (typeof gstNumber === 'string') allowedUpdates.gstNumber = gstNumber.trim();
    if (address && typeof address === 'object') allowedUpdates.address = address;
    if (operatingHours && typeof operatingHours === 'object') allowedUpdates.operatingHours = operatingHours;

    const metadata = { ...(pharmacy.metadata || {}) };
    if (expiryAlertDays !== undefined) metadata.expiryAlertDays = Number(expiryAlertDays) || 30;
    if (lowStockThreshold !== undefined) metadata.lowStockThreshold = Number(lowStockThreshold) || 50;
    if (typeof notes === 'string') metadata.notes = notes;
    allowedUpdates.metadata = metadata;

    await pharmacy.update(allowedUpdates);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      pharmacy: {
        id: pharmacy.id,
        name: pharmacy.name,
        email: pharmacy.email,
        phone: pharmacy.phoneNumber,
        phoneNumber: pharmacy.phoneNumber,
        licenseNumber: pharmacy.licenseNumber,
        license_number: pharmacy.licenseNumber,
        gstNumber: pharmacy.gstNumber,
        address: pharmacy.address,
        operatingHours: pharmacy.operatingHours,
        metadata: pharmacy.metadata,
        status: pharmacy.status
      }
    });
  } catch (error) {
    console.error('Pharmacy profile update error:', error);
    res.status(500).json({ success: false, message: 'Failed to update profile', error: error.message });
  }
});

// OTP routes
addOtpRoutes(router, 'Pharmacy', '#10b981');

export default router;
