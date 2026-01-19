import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Sequelize } from 'sequelize';
import { JWT_CONFIG } from '../../config/auth.config.js';

const router = express.Router();
const JWT_SECRET = JWT_CONFIG.SECRET;

// Database connection
const sequelize = new Sequelize(
  process.env.POSTGRES_DATABASE || 'mediczy_ai',
  process.env.POSTGRES_USER || 'mediczy_helper',
  process.env.POSTGRES_PASSWORD || 'Mediczy2024Helper',
  {
    host: process.env.POSTGRES_HOST || '127.0.0.1',
    dialect: 'postgres',
    logging: false
  }
);

// Clinic Login - Now using database
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

    // Query hospital/clinic from database
    const clinics = await sequelize.query(
      `SELECT id, hospital_name, email, password, phone_number, city, state,
              registration_number, total_beds, available_beds, specializations,
              facilities, metadata, status, is_verified
       FROM hospitals 
       WHERE email = :email 
       LIMIT 1`,
      {
        replacements: { email },
        type: Sequelize.QueryTypes.SELECT
      }
    );

    if (!clinics || clinics.length === 0) {
      console.warn('⚠️ Clinic not found:', email);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials or clinic not found'
      });
    }

    const clinic = clinics[0];

    if (!clinic.password) {
      console.error('❌ Clinic has no password hash:', clinic.id);
      return res.status(500).json({
        success: false,
        message: 'Account configuration error. Please contact support.'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, clinic.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if clinic is active
    if (clinic.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Account is inactive. Please contact support.'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: clinic.id,
        email: clinic.email,
        type: 'clinic',
        name: clinic.hospital_name,
        userType: 'clinic',
        role: 'clinic'
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('✅ Clinic login successful:', clinic.hospital_name);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      clinic: {
        id: clinic.id,
        name: clinic.hospital_name,
        email: clinic.email,
        phone: clinic.phone_number,
        registrationNumber: clinic.registration_number,
        clinicType: clinic.metadata?.clinicType || 'General',
        numberOfRooms: clinic.metadata?.numberOfRooms || 0,
        city: clinic.city,
        state: clinic.state,
        totalBeds: clinic.total_beds,
        availableBeds: clinic.available_beds,
        specializations: clinic.specializations || [],
        facilities: clinic.facilities || [],
        isVerified: clinic.is_verified
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
