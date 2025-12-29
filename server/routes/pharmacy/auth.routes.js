import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'mediczy-super-secret-key-2024';

// Mock pharmacy data (replace with database later)
const mockPharmacy = {
  id: 1,
  name: "Test MedPlus Pharmacy",
  email: "pharmacy@mediczy.com",
  password: "$2b$10$i39CI8aAWD3n0eQwxNPaQO1d1CBGVOZ40BKvyUuYNcj5qexJ8.Ujy", // Pharmacy123
  contactPerson: "Pharmacy Manager",
  phone: "+91-9876543210",
  registrationNumber: "PHARM-DL-2024-001",
  pharmacyType: "Retail Pharmacy",
  licenseNumber: "DL-PHARM-2024-12345",
  homeDelivery: true,
  address: "789 Medical Avenue, Delhi",
  city: "New Delhi",
  state: "Delhi",
  isActive: true,
  operatingHours: "24x7"
};

/**
 * POST /api/pharmacy/login
 * Authenticate pharmacy account
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

    const allowDemo = process.env.NODE_ENV !== 'production' || process.env.ALLOW_PHARMACY_DEMO === 'true';
    const fallbackPassword = process.env.PHARMACY_DEFAULT_PASSWORD || 'Pharmacy123';

    // Mock pharmacy authentication (enabled when allowDemo)
    if (allowDemo && email.toLowerCase() === mockPharmacy.email.toLowerCase()) {
      console.warn('⚠️ Using mock pharmacy credentials (demo mode)');
      
      // Verify password
      let isPasswordValid = false;
      try {
        isPasswordValid = await bcrypt.compare(password, mockPharmacy.password);
      } catch (e) {
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

      // Check if pharmacy is active
      if (!mockPharmacy.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Account is inactive. Please contact support.'
        });
      }

      // Generate JWT token for mock pharmacy
      const token = jwt.sign(
        {
          id: mockPharmacy.id,
          pharmacyId: mockPharmacy.id,
          email: mockPharmacy.email,
          name: mockPharmacy.name,
          type: 'pharmacy',
          userType: 'pharmacy',
          role: 'pharmacy'
        },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.status(200).json({
        success: true,
        token,
        pharmacy: mockPharmacy
      });
    }

    // PRODUCTION: Query actual Pharmacy database (implement when Pharmacy model is ready)
    // const Pharmacy = (await import('../models/pharmacy.model.js')).default;
    // const pharmacy = await Pharmacy.findOne({ where: { email: email.toLowerCase() } });
    // if (!pharmacy) {
    //   return res.status(401).json({ success: false, message: 'Invalid credentials' });
    // }
    // ... verify password, generate token
    
    return res.status(401).json({
      success: false,
      message: 'Invalid email or password'
    });

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, mockPharmacy.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if pharmacy is active
    if (!mockPharmacy.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is inactive. Please contact support.'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        pharmacyId: mockPharmacy.id,
        email: mockPharmacy.email,
        name: mockPharmacy.name,
        userType: 'pharmacy',
        role: 'pharmacy'
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      pharmacy: {
        id: mockPharmacy.id,
        name: mockPharmacy.name,
        email: mockPharmacy.email,
        contactPerson: mockPharmacy.contactPerson,
        phone: mockPharmacy.phone,
        registrationNumber: mockPharmacy.registrationNumber,
        pharmacyType: mockPharmacy.pharmacyType,
        licenseNumber: mockPharmacy.licenseNumber,
        homeDelivery: mockPharmacy.homeDelivery,
        city: mockPharmacy.city,
        operatingHours: mockPharmacy.operatingHours
      }
    });

  } catch (error) {
    console.error('Pharmacy login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message
    });
  }
});

/**
 * GET /api/pharmacy/verify
 * Verify pharmacy token
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
      pharmacy: decoded
    });

  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
});

/**
 * POST /api/pharmacy/logout
 * Logout pharmacy (client-side token removal)
 */
router.post('/logout', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
});

export default router;
