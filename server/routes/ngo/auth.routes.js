import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { JWT_CONFIG } from '../../config/auth.config.js';

const router = express.Router();

// Mock NGO data (Non-Governmental Organization - replace with database later)
const mockNGO = {
  id: 1,
  organizationName: "HealthCare For All Foundation",
  email: "ngo@mediczy.com",
  password: "$2b$10$obqmH4fnl5vdW9BcYe17eu6kojg3pEQeysAYBve6ldW2Bf/TAcpl.", // NGO123
  contactPerson: "NGO Program Director",
  phone: "+91-9876543210",
  registrationNumber: "NGO-2024-001",
  focusAreas: ["Primary Healthcare", "Preventive Care", "Community Outreach"],
  registeredAddress: "Community Center, Chennai",
  isActive: true,
  beneficiaryCount: 25000
};

/**
 * POST /api/ngo/login
 * Authenticate NGO account
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

    // Check if NGO exists
    if (email !== mockNGO.email) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, mockNGO.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if NGO is active
    if (!mockNGO.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is inactive. Please contact support.'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: mockNGO.id,
        ngoId: mockNGO.id,
        email: mockNGO.email,
        organizationName: mockNGO.organizationName,
        userType: 'ngo',
        role: 'ngo'
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      ngo: {
        id: mockNGO.id,
        organizationName: mockNGO.organizationName,
        email: mockNGO.email,
        contactPerson: mockNGO.contactPerson,
        phone: mockNGO.phone,
        registrationNumber: mockNGO.registrationNumber,
        focusAreas: mockNGO.focusAreas,
        beneficiaryCount: mockNGO.beneficiaryCount
      }
    });

  } catch (error) {
    console.error('NGO login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message
    });
  }
});

/**
 * GET /api/ngo/verify
 * Verify NGO token
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

    const decoded = jwt.verify(token, JWT_SECRET);

    res.status(200).json({
      success: true,
      ngo: decoded
    });

  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
});

/**
 * POST /api/ngo/logout
 * Logout NGO (client-side token removal)
 */
router.post('/logout', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
});

export default router;
