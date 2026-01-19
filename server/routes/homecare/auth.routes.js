import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { JWT_CONFIG } from '../../config/auth.config.js';

const router = express.Router();
const JWT_SECRET = JWT_CONFIG.SECRET;

// Mock homecare data (replace with database later)
const mockHomecare = {
  id: 1,
  name: "Premium Home Healthcare Services",
  email: "homecare@mediczy.com",
  password: "$2a$10$XYZ123ABC456DEF789GHI0JK.LMNOPQRSTUVWXYZ1234567890", // Homecare123
  phone: "+91-9876543211",
  registrationNumber: "HCS-DL-2024-001",
  serviceType: "Full Spectrum Home Care",
  totalStaff: 20,
  availableStaff: 12,
  coverageArea: "Delhi, Gurgaon, Noida",
  isActive: true,
  avgRating: 4.8,
  totalPatients: 342
};

// Generate proper password hash for Homecare123
bcrypt.hash('Homecare123', 10).then(hash => {
  mockHomecare.password = hash;
});

/**
 * POST /api/homecare/login
 * Authenticate homecare service provider
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Check if homecare exists
    if (email !== mockHomecare.email) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, mockHomecare.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if homecare is active
    if (!mockHomecare.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is inactive. Please contact support.'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        homecareId: mockHomecare.id,
        email: mockHomecare.email,
        name: mockHomecare.name,
        userType: 'homecare',
        role: 'homecare'
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      homecare: {
        id: mockHomecare.id,
        name: mockHomecare.name,
        email: mockHomecare.email,
        phone: mockHomecare.phone,
        registrationNumber: mockHomecare.registrationNumber,
        serviceType: mockHomecare.serviceType,
        totalStaff: mockHomecare.totalStaff,
        availableStaff: mockHomecare.availableStaff,
        coverageArea: mockHomecare.coverageArea,
        avgRating: mockHomecare.avgRating,
        totalPatients: mockHomecare.totalPatients
      }
    });

  } catch (error) {
    console.error('Homecare login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message
    });
  }
});

/**
 * GET /api/homecare/verify
 * Verify homecare token
 */
router.get('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    res.status(200).json({
      success: true,
      homecare: decoded
    });

  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
});

/**
 * POST /api/homecare/logout
 * Logout homecare (client-side token removal)
 */
router.post('/logout', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
});

export default router;
