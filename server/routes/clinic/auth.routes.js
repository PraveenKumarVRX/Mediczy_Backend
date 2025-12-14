import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'mediczy-clinic-secret-key-2025';

// Mock clinic data (replace with database later)
const mockClinic = {
  id: 1,
  name: "Test Medical Clinic",
  email: "clinic@mediczy.com",
  password: "$2b$10$iawpnFyT2kF.4qPawCj3jeJ86wJsIHqRliFXq2iYBhFhVRehZMMlu", // Clinic123
  contactPerson: "Dr. Clinic Admin",
  phone: "+91-9876543210",
  registrationNumber: "CLINIC-DL-2024-001",
  clinicType: "General Practice",
  numberOfRooms: 5,
  hasPharmacy: true,
  hasLab: false,
  address: "321 Health Street, Delhi",
  city: "New Delhi",
  state: "Delhi",
  isActive: true,
  specializations: "General Medicine, Pediatrics"
};

// Clinic Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('🏥 Clinic login attempt:', { email });

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Check if clinic exists
    if (email !== mockClinic.email) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials or clinic not found'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, mockClinic.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if clinic is active
    if (!mockClinic.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is inactive. Please contact support.'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: mockClinic.id,
        email: mockClinic.email,
        type: 'clinic',
        name: mockClinic.name,
        userType: 'clinic',
        role: 'clinic'
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('✅ Clinic login successful:', mockClinic.name);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      clinic: {
        id: mockClinic.id,
        name: mockClinic.name,
        email: mockClinic.email,
        contactPerson: mockClinic.contactPerson,
        phone: mockClinic.phone,
        registrationNumber: mockClinic.registrationNumber,
        clinicType: mockClinic.clinicType,
        numberOfRooms: mockClinic.numberOfRooms,
        city: mockClinic.city,
        specializations: mockClinic.specializations
      }
    });
  } catch (error) {
    console.error('❌ Clinic login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
});

// Verify Token
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

    res.json({
      success: true,
      clinic: decoded
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
});

// Logout
router.post('/logout', (req, res) => {
  res.json({
    success: true,
    message: 'Logout successful'
  });
});

export default router;
