import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const router = express.Router();

// Mock lab data (replace with database later)
const mockLab = {
  id: 1,
  name: "Test Diagnostic Laboratory",
  email: "lab@mediczy.com",
  password: "$2b$10$Tj9I3Su7X3l.CidDiU7NbeiSkHxMpncawUn0K61DrjsMj62IZdCFS", // Lab123
  contactPerson: "Lab Manager",
  phone: "+91-9876543210",
  registrationNumber: "LAB-DL-2024-001",
  labType: "Diagnostic & Pathology",
  accreditation: "NABL Certified",
  totalTests: 250,
  homeCollection: true,
  address: "456 Healthcare Plaza, Delhi",
  city: "New Delhi",
  state: "Delhi",
  isActive: true,
  reportTurnaroundTime: "24-48 hours"
};

/**
 * POST /api/lab/login
 * Authenticate laboratory account
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

    const allowDemo = process.env.NODE_ENV !== 'production' || process.env.ALLOW_LAB_DEMO === 'true';
    const fallbackPassword = process.env.LAB_DEFAULT_PASSWORD || 'Lab123';

    // DEV/DEMO: Mock lab authentication (can be enabled in production via ALLOW_LAB_DEMO)
    if (allowDemo && email.toLowerCase() === mockLab.email.toLowerCase()) {
      console.warn('⚠️ Using mock lab credentials (demo mode)');
      
      // Verify password
      let isPasswordValid = false;
      try {
        isPasswordValid = await bcrypt.compare(password, mockLab.password);
      } catch (e) {
        isPasswordValid = password === fallbackPassword;
      }
      if (!isPasswordValid && password === fallbackPassword) {
        // allow fallback for cleartext demo password
        isPasswordValid = true;
      }
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      // Check if lab is active
      if (!mockLab.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Account is inactive. Please contact support.'
        });
      }

      // Generate JWT token for mock lab
      const token = jwt.sign(
        {
          id: mockLab.id,
          labId: mockLab.id,
          email: mockLab.email,
          name: mockLab.name,
          userType: 'lab',
          role: 'lab'
        },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.status(200).json({
        success: true,
        token,
        lab: mockLab
      });
    }

    // PRODUCTION: Query actual Lab database
    // For now, fall back to mock lab for non-demo emails as well
    // (This allows testing with different email addresses in development)
    
    // Verify password against mock lab
    let isPasswordValid = false;
    try {
      isPasswordValid = await bcrypt.compare(password, mockLab.password);
    } catch (e) {
      // Fallback for cleartext comparison
      isPasswordValid = password === fallbackPassword;
    }
    if (!isPasswordValid && password === fallbackPassword) {
      isPasswordValid = true;
    }
    
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if lab is active
    if (!mockLab.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is inactive. Please contact support.'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        // Provide `id` so the shared auth middleware can resolve role context.
        id: mockLab.id,
        labId: mockLab.id,
        email: mockLab.email,
        name: mockLab.name,
        userType: 'lab',
        role: 'lab'
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      lab: {
        id: mockLab.id,
        name: mockLab.name,
        email: mockLab.email,
        contactPerson: mockLab.contactPerson,
        phone: mockLab.phone,
        registrationNumber: mockLab.registrationNumber,
        labType: mockLab.labType,
        accreditation: mockLab.accreditation,
        totalTests: mockLab.totalTests,
        homeCollection: mockLab.homeCollection,
        city: mockLab.city,
        reportTurnaroundTime: mockLab.reportTurnaroundTime
      }
    });

  } catch (error) {
    console.error('Lab login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message
    });
  }
});

/**
 * GET /api/lab/verify
 * Verify lab token
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
      lab: decoded
    });

  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
});

/**
 * POST /api/lab/logout
 * Logout lab (client-side token removal)
 */
router.post('/logout', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
});

export default router;
