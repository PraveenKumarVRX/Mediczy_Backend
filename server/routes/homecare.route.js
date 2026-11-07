/**
 * Homecare Routes
 * Authentication and homecare management
 */

import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';
import { HomecareProvider } from '../models/index.js';
import { authLimiter } from '../middleware/rateLimiter.middleware.js';
import { auditLoginAttempt } from '../middleware/audit.middleware.js';

const router = express.Router();

/**
 * POST /api/homecare/login
 * Homecare provider login
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

    // Find homecare by email - select only needed fields for faster query
    const homecare = await HomecareProvider.findOne({
      where: { email: normalizedEmail },
      attributes: ['id', 'name', 'email', 'password', 'phone', 'services'],
      raw: true
    });

    if (!homecare) {
      await auditLoginAttempt(req, null, normalizedEmail, false, 'Homecare provider not found');
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, homecare.password);

    if (!isValidPassword) {
      await auditLoginAttempt(req, homecare.id, normalizedEmail, false, 'Invalid password');
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: homecare.id,
        homecareId: homecare.id,
        email: homecare.email,
        role: 'homecare',
        userType: 'homecare',
        type: 'homecare'
      },
      JWT_CONFIG.SECRET,
      { expiresIn: process.env.JWT_ACCESS_TTL || '15m' }
    );

    await auditLoginAttempt(req, homecare.id, normalizedEmail, true);

    res.json({
      success: true,
      token,
      homecare: {
        id: homecare.id,
        name: homecare.name,
        email: homecare.email,
        phone: homecare.phone,
        services: homecare.services
      }
    });
  } catch (error) {
    console.error('Homecare login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
});

/**
 * POST /api/homecare/book
 * Book a homecare service appointment
 */
router.post('/book', async (req, res) => {
  try {
    const {
      homecareId,
      appointmentDate,
      appointmentTime,
      serviceType, // 'doctor', 'nurse', or 'lab'
      specificService,
      duration,
      symptoms,
      notes,
      patientName,
      patientPhone,
      patientAddress,
      emergencyContact
    } = req.body;

    // Field-level validation (BUG-07): collect every problem and return it keyed
    // by field, so the client/mobile can show inline messages instead of a
    // generic "Request failed with status code 400". Same required set as before
    // (no new blocking), plus format checks on PIN code and phone when present.
    const fieldErrors = {};
    if (!homecareId) fieldErrors.homecareId = 'Homecare provider is required';
    if (!appointmentDate) fieldErrors.appointmentDate = 'Select an appointment date';
    else if (Number.isNaN(Date.parse(appointmentDate))) fieldErrors.appointmentDate = 'Appointment date is invalid';
    if (!appointmentTime) fieldErrors.appointmentTime = 'Select an appointment time';
    if (!serviceType) fieldErrors.serviceType = 'Select a service type';
    else if (!['doctor', 'nurse', 'lab'].includes(serviceType)) fieldErrors.serviceType = 'Service type must be "doctor", "nurse", or "lab"';
    const addr = patientAddress || {};
    if (!addr.street) fieldErrors['patientAddress.street'] = 'Street address is required';
    if (!addr.city) fieldErrors['patientAddress.city'] = 'City is required';
    if (addr.pincode && !/^\d{6}$/.test(String(addr.pincode).trim())) fieldErrors['patientAddress.pincode'] = 'Enter a valid 6-digit PIN code';
    if (patientPhone && !/^\d{10}$/.test(String(patientPhone).replace(/\D/g, '').slice(-10))) fieldErrors.patientPhone = 'Enter a valid 10-digit mobile number';

    if (Object.keys(fieldErrors).length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Please correct the highlighted fields and try again.',
        errorCode: 'VALIDATION_ERROR',
        errors: fieldErrors,
        fields: Object.keys(fieldErrors)
      });
    }

    // TODO: Fetch homecare provider details
    // const provider = await HomecareProvider.findByPk(homecareId);

    // Calculate fees based on service type and duration
    const baseFees = {
      doctor: 2000,
      nurse: 1000,
      lab: 1500
    };
    const baseFee = baseFees[serviceType] || 1500;
    const durationMultiplier = duration ? Math.ceil(duration / 60) : 1;
    const totalFee = baseFee * durationMultiplier;

    // Create appointment record
    const appointment = {
      id: `homecare-appt-${Date.now()}`,
      homecareId,
      patientName: patientName || 'Patient',
      patientPhone: patientPhone || '',
      emergencyContact: emergencyContact || patientPhone || '',
      appointmentDate,
      appointmentTime,
      serviceType,
      specificService: specificService || `${serviceType} visit`,
      duration: duration || 60,
      symptoms: symptoms || '',
      notes: notes || '',
      patientAddress,
      status: 'scheduled',
      bookingTime: new Date().toISOString(),
      fee: totalFee,
      visitStatus: 'pending'
    };

    // TODO: Store in database once HomecareAppointment model is created

    res.json({
      success: true,
      message: 'Homecare appointment booked successfully',
      appointment
    });
  } catch (error) {
    console.error('Homecare booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to book homecare appointment',
      error: error.message
    });
  }
});

/**
/**
 * POST /api/homecare/register — handled by homecare/auth.routes.js (secure wizard)
 */
// Registration is handled by the dedicated auth router (homecare/auth.routes.js)
// which is mounted at /api/homecare AFTER this router.
// DO NOT add a register handler here.

/**
 * GET /api/homecare/profile
 * Get homecare profile
 */
router.get('/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const decoded = jwt.verify(token, JWT_CONFIG.SECRET);
    const homecare = await HomecareProvider.findByPk(decoded.id);

    if (!homecare) {
      return res.status(404).json({ success: false, message: 'Homecare provider not found' });
    }

    res.json({
      success: true,
      homecare: {
        id: homecare.id,
        name: homecare.name,
        email: homecare.email,
        phone: homecare.phone,
        license_number: homecare.license_number,
        services: homecare.services,
        address: homecare.address,
        status: homecare.status
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch profile', error: error.message });
  }
});

export default router;
