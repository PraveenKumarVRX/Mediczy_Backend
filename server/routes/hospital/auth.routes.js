import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'mediczy-super-secret-key-2024';

// Mock hospital data (replace with database later)
const mockHospital = {
  id: 1,
  name: "Test Multi-Specialty Hospital",
  email: "hospital@mediczy.com",
  password: "$2b$10$ofJVVrlQUlOTt.Orpaw/uu4S./YsJNmk2ZcWHtHML8sZgr/QpSzF.", // Hospital123
  contactPerson: "Hospital Admin",
  phone: "+91-9876543210",
  registrationNumber: "HOSP-DL-2024-001",
  hospitalType: "Multi-Specialty",
  totalBeds: 500,
  availableBeds: 125,
  address: "123 Medical District, Delhi",
  city: "New Delhi",
  state: "Delhi",
  isActive: true,
  accreditation: "NABH Certified"
};

/**
 * POST /api/hospital/login
 * Authenticate hospital account
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

    // Check if hospital exists
    if (email !== mockHospital.email) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, mockHospital.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if hospital is active
    if (!mockHospital.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is inactive. Please contact support.'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        hospitalId: mockHospital.id,
        email: mockHospital.email,
        name: mockHospital.name,
        userType: 'hospital',
        role: 'hospital'
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      hospital: {
        id: mockHospital.id,
        name: mockHospital.name,
        email: mockHospital.email,
        contactPerson: mockHospital.contactPerson,
        phone: mockHospital.phone,
        registrationNumber: mockHospital.registrationNumber,
        hospitalType: mockHospital.hospitalType,
        totalBeds: mockHospital.totalBeds,
        availableBeds: mockHospital.availableBeds,
        city: mockHospital.city,
        accreditation: mockHospital.accreditation
      }
    });

  } catch (error) {
    console.error('Hospital login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message
    });
  }
});

/**
 * GET /api/hospital/verify
 * Verify hospital token
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
      hospital: decoded
    });

  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
});

/**
 * POST /api/hospital/logout
 * Logout hospital (client-side token removal)
 */
router.post('/logout', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
});

export default router;
