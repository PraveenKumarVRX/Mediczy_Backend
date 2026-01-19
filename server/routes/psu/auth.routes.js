import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { JWT_CONFIG } from '../../config/auth.config.js';

const router = express.Router();

// Mock PSU data (Public Sector Undertaking - replace with database later)
const mockPSU = {
  id: 1,
  organizationName: "CGHS - Central Government Health Scheme",
  email: "psu@mediczy.com",
  password: "$2b$10$obqmH4fnl5vdW9BcYe17eu6kojg3pEQeysAYBve6ldW2Bf/TAcpl.", // PSU123
  contactPerson: "PSU Health Administrator",
  phone: "+91-9876543210",
  department: "Ministry of Health & Family Welfare",
  employeeCount: 50000,
  registeredAddress: "Government Complex, New Delhi",
  isActive: true,
  beneficiaryCount: 200000
};

/**
 * POST /api/psu/login
 * Authenticate PSU account
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;


    if (!JWT_SECRET) {
      console.error('FATAL: JWT_SECRET environment variable not set!');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error'
      });
    }

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Check if PSU exists
    if (email !== mockPSU.email) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, mockPSU.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if PSU is active
    if (!mockPSU.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is inactive. Please contact support.'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: mockPSU.id,
        psuId: mockPSU.id,
        email: mockPSU.email,
        organizationName: mockPSU.organizationName,
        userType: 'psu',
        role: 'psu'
      },
      JWT_CONFIG.SECRET,
      { expiresIn: '7d' }
    );

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      psu: {
        id: mockPSU.id,
        organizationName: mockPSU.organizationName,
        email: mockPSU.email,
        contactPerson: mockPSU.contactPerson,
        phone: mockPSU.phone,
        department: mockPSU.department,
        employeeCount: mockPSU.employeeCount,
        beneficiaryCount: mockPSU.beneficiaryCount
      }
    });

  } catch (error) {
    console.error('PSU login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message
    });
  }
});

/**
 * GET /api/psu/verify
 * Verify PSU token
 */
router.get('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];


    if (!JWT_SECRET) {
      console.error('FATAL: JWT_SECRET environment variable not set!');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error'
      });
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const decoded = jwt.verify(token, JWT_CONFIG.SECRET);

    res.status(200).json({
      success: true,
      psu: decoded
    });

  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
});

/**
 * POST /api/psu/logout
 * Logout PSU (client-side token removal)
 */
router.post('/logout', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
});

export default router;
