import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const router = express.Router();

// Mock TPA data (Third Party Administrator - replace with database later)
const mockTPA = {
  id: 1,
  organizationName: "MediClaim TPA Services Ltd",
  email: "tpa@mediczy.com",
  password: "$2b$10$obqmH4fnl5vdW9BcYe17eu6kojg3pEQeysAYBve6ldW2Bf/TAcpl.", // TPA123
  contactPerson: "TPA Administrator",
  phone: "+91-9876543210",
  licenseNumber: "TPA-2024-001",
  servicesOffered: ["Health Insurance", "Cashless Claims", "Reimbursements"],
  registeredAddress: "TPA Tower, Mumbai",
  isActive: true,
  networkSize: 5000
};

/**
 * POST /api/tpa/login
 * Authenticate TPA account
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const JWT_SECRET = process.env.JWT_SECRET;

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

    // Check if TPA exists
    if (email !== mockTPA.email) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, mockTPA.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if TPA is active
    if (!mockTPA.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is inactive. Please contact support.'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: mockTPA.id,
        tpaId: mockTPA.id,
        email: mockTPA.email,
        organizationName: mockTPA.organizationName,
        userType: 'tpa',
        role: 'tpa'
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      tpa: {
        id: mockTPA.id,
        organizationName: mockTPA.organizationName,
        email: mockTPA.email,
        contactPerson: mockTPA.contactPerson,
        phone: mockTPA.phone,
        licenseNumber: mockTPA.licenseNumber,
        servicesOffered: mockTPA.servicesOffered,
        networkSize: mockTPA.networkSize
      }
    });

  } catch (error) {
    console.error('TPA login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message
    });
  }
});

/**
 * GET /api/tpa/verify
 * Verify TPA token
 */
router.get('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    const JWT_SECRET = process.env.JWT_SECRET;

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
      tpa: decoded
    });

  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
});

/**
 * POST /api/tpa/logout
 * Logout TPA (client-side token removal)
 */
router.post('/logout', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
});

export default router;
