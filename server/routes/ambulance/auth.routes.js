import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'mediczy-super-secret-key-2024';

// Mock ambulance data (replace with database later)
const mockAmbulance = {
  id: 1,
  name: "City Emergency Ambulance Services",
  email: "ambulance@mediczy.com",
  password: "$2b$10$..qHR1IYI6dGrkXN5d5X.uL5ki397xAS9WWUsS9oFGiOjme8iN3wa", // Ambulance123
  phone: "+91-9876543210",
  registrationNumber: "AMB-DL-2024-001",
  serviceType: "ALS & BLS",
  totalVehicles: 12,
  availableVehicles: 8,
  coverageArea: "Delhi NCR",
  isActive: true,
  avgResponseTime: "8 mins"
};

/**
 * POST /api/ambulance/login
 * Authenticate ambulance service provider
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

    // DEV-ONLY: Mock ambulance authentication (disabled in production)
    if (process.env.NODE_ENV !== 'production' && email === mockAmbulance.email) {
      console.warn('⚠️ Using mock ambulance credentials (development only)');
      
      // Verify password
      const isPasswordValid = await bcrypt.compare(password, mockAmbulance.password);
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      // Check if ambulance is active
      if (!mockAmbulance.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Account is inactive. Please contact support.'
        });
      }

      // Generate JWT token for mock ambulance
      const token = jwt.sign(
        {
          ambulanceId: mockAmbulance.id,
          email: mockAmbulance.email,
          name: mockAmbulance.name,
          userType: 'ambulance',
          role: 'ambulance'
        },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.status(200).json({
        success: true,
        token,
        ambulance: mockAmbulance
      });
    }

    // PRODUCTION: Query actual Ambulance database (implement when Ambulance model is ready)
    // const Ambulance = (await import('../models/ambulance.model.js')).default;
    // const ambulance = await Ambulance.findOne({ where: { email: email.toLowerCase() } });
    // if (!ambulance) {
    //   return res.status(401).json({ success: false, message: 'Invalid credentials' });
    // }
    // ... verify password, generate token
    
    return res.status(401).json({
      success: false,
      message: 'Invalid email or password'
    });

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, mockAmbulance.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if ambulance is active
    if (!mockAmbulance.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is inactive. Please contact support.'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        ambulanceId: mockAmbulance.id,
        email: mockAmbulance.email,
        name: mockAmbulance.name,
        userType: 'ambulance',
        role: 'ambulance'
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      ambulance: {
        id: mockAmbulance.id,
        name: mockAmbulance.name,
        email: mockAmbulance.email,
        phone: mockAmbulance.phone,
        registrationNumber: mockAmbulance.registrationNumber,
        serviceType: mockAmbulance.serviceType,
        totalVehicles: mockAmbulance.totalVehicles,
        availableVehicles: mockAmbulance.availableVehicles,
        coverageArea: mockAmbulance.coverageArea,
        avgResponseTime: mockAmbulance.avgResponseTime
      }
    });

  } catch (error) {
    console.error('Ambulance login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message
    });
  }
});

/**
 * GET /api/ambulance/verify
 * Verify ambulance token
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
      ambulance: decoded
    });

  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
});

/**
 * POST /api/ambulance/logout
 * Logout ambulance (client-side token removal)
 */
router.post('/logout', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
});

export default router;
