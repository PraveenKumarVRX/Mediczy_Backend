import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { JWT_CONFIG } from '../../config/auth.config.js';

const router = express.Router();

// Mock Insurer data (replace with database later)
const mockInsurer = {
  id: 1,
  organizationName: "HealthFirst Insurance Co.",
  email: "insurer@mediczy.com",
  password: "$2b$10$obqmH4fnl5vdW9BcYe17eu6kojg3pEQeysAYBve6ldW2Bf/TAcpl.", // Insurer123
  contactPerson: "Insurance Operations Manager",
  phone: "+91-9876543210",
  licenseNumber: "INS-2024-001",
  insuranceTypes: ["Health", "Critical Illness", "Personal Accident"],
  registeredAddress: "Insurance Tower, Bangalore",
  isActive: true,
  policyholderCount: 100000
};

/**
 * POST /api/insurer/login
 * Authenticate Insurer account
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

    // Check if insurer exists
    if (email !== mockInsurer.email) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, mockInsurer.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if insurer is active
    if (!mockInsurer.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is inactive. Please contact support.'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: mockInsurer.id,
        insurerId: mockInsurer.id,
        email: mockInsurer.email,
        organizationName: mockInsurer.organizationName,
        userType: 'insurer',
        role: 'insurer'
      },
      JWT_CONFIG.SECRET,
      { expiresIn: '7d' }
    );

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      insurer: {
        id: mockInsurer.id,
        organizationName: mockInsurer.organizationName,
        email: mockInsurer.email,
        contactPerson: mockInsurer.contactPerson,
        phone: mockInsurer.phone,
        licenseNumber: mockInsurer.licenseNumber,
        insuranceTypes: mockInsurer.insuranceTypes,
        policyholderCount: mockInsurer.policyholderCount
      }
    });

  } catch (error) {
    console.error('Insurer login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message
    });
  }
});

/**
 * GET /api/insurer/verify
 * Verify Insurer token
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
      insurer: decoded
    });

  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
});

/**
 * POST /api/insurer/logout
 * Logout Insurer (client-side token removal)
 */
router.post('/logout', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
});

export default router;
