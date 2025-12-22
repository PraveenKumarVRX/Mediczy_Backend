import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const router = express.Router();

// Mock corporate data (replace with database later)
const mockCorporate = {
  id: 1,
  companyName: "Test Corporate Ltd",
  email: "corporate@mediczy.com",
  password: "$2b$10$obqmH4fnl5vdW9BcYe17eu6kojg3pEQeysAYBve6ldW2Bf/TAcpl.", // Corporate123
  contactPerson: "Corporate Admin",
  phone: "+91-9876543210",
  industry: "Healthcare",
  employeeCount: 500,
  registeredAddress: "123 Business Park, Delhi",
  isActive: true,
  planType: "Enterprise"
};

/**
 * POST /api/corporate/login
 * Authenticate corporate account
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

    // Check if corporate exists
    if (email !== mockCorporate.email) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, mockCorporate.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if corporate is active
    if (!mockCorporate.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is inactive. Please contact support.'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        // Backward-compatible: keep corporateId, but also provide id so authUser can resolve it.
        id: mockCorporate.id,
        corporateId: mockCorporate.id,
        email: mockCorporate.email,
        companyName: mockCorporate.companyName,
        userType: 'corporate',
        role: 'corporate'
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      corporate: {
        id: mockCorporate.id,
        companyName: mockCorporate.companyName,
        email: mockCorporate.email,
        contactPerson: mockCorporate.contactPerson,
        phone: mockCorporate.phone,
        industry: mockCorporate.industry,
        employeeCount: mockCorporate.employeeCount,
        planType: mockCorporate.planType
      }
    });

  } catch (error) {
    console.error('Corporate login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message
    });
  }
});

/**
 * GET /api/corporate/verify
 * Verify corporate token
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
      corporate: decoded
    });

  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
});

/**
 * POST /api/corporate/logout
 * Logout corporate (client-side token removal)
 */
router.post('/logout', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
});

export default router;
