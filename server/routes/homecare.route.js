/**
 * Homecare Routes
 * Authentication and homecare management
 */

import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { HomecareProvider } from '../models/index.js';

const router = express.Router();

/**
 * POST /api/homecare/login
 * Homecare provider login
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
    
    // Find homecare by email - select only needed fields for faster query
    const homecare = await HomecareProvider.findOne({ 
      where: { email },
      attributes: ['id', 'name', 'email', 'password', 'phone', 'services', 'tenant_id'],
      raw: true
    });
    
    if (!homecare) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    // Verify password
    const isValidPassword = await bcrypt.compare(password, homecare.password);
    
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      {
        id: homecare.id,
        email: homecare.email,
        type: 'homecare',
        tenant_id: homecare.tenant_id
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({
      success: true,
      token,
      homecare: {
        id: homecare.id,
        name: homecare.name,
        email: homecare.email,
        phone: homecare.phone,
        services: homecare.services,
        tenant_id: homecare.tenant_id
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

    // Validate required fields
    if (!homecareId || !appointmentDate || !appointmentTime) {
      return res.status(400).json({
        success: false,
        message: 'Homecare ID, appointment date, and time are required'
      });
    }

    if (!serviceType || !['doctor', 'nurse', 'lab'].includes(serviceType)) {
      return res.status(400).json({
        success: false,
        message: 'Service type must be "doctor", "nurse", or "lab"'
      });
    }

    if (!patientAddress || !patientAddress.street || !patientAddress.city) {
      return res.status(400).json({
        success: false,
        message: 'Complete patient address is required for homecare services'
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
 * POST /api/homecare/register
 * Register new homecare provider
 */
router.post('/register', async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      phone,
      license_number,
      address,
      services = [],
      tenant_id
    } = req.body;
    
    // Check if homecare exists
    const existing = await HomecareProvider.findOne({ where: { email } });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Email already registered'
      });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create homecare
    const homecare = await HomecareProvider.create({
      name,
      email,
      password: hashedPassword,
      phone,
      license_number,
      address,
      services,
      tenant_id,
      status: 'active'
    });
    
    // Generate token
    const token = jwt.sign(
      {
        id: homecare.id,
        email: homecare.email,
        type: 'homecare',
        tenant_id: homecare.tenant_id
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.status(201).json({
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
    console.error('Homecare registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message
    });
  }
});

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
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
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
