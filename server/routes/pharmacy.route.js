/**
 * Pharmacy Routes
 * Authentication and pharmacy management
 */

import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Pharmacy } from '../models/index.js';

const router = express.Router();

/**
 * POST /api/pharmacy/login
 * Pharmacy login
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }
    
    // Find pharmacy by email
    const pharmacy = await Pharmacy.findOne({ where: { email } });
    
    if (!pharmacy) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    // Verify password
    const isValidPassword = await bcrypt.compare(password, pharmacy.password);
    
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      {
        id: pharmacy.id,
        email: pharmacy.email,
        type: 'pharmacy',
        tenant_id: pharmacy.tenant_id
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({
      success: true,
      token,
      pharmacy: {
        id: pharmacy.id,
        name: pharmacy.name,
        email: pharmacy.email,
        phone: pharmacy.phone,
        type: pharmacy.type,
        license_number: pharmacy.license_number,
        tenant_id: pharmacy.tenant_id
      }
    });
  } catch (error) {
    console.error('Pharmacy login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
});

/**
 * POST /api/pharmacy/register
 * Register new pharmacy
 */
router.post('/register', async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      phone,
      license_number,
      address,
      type = 'Retail Pharmacy',
      tenant_id
    } = req.body;
    
    // Check if pharmacy exists
    const existing = await Pharmacy.findOne({ where: { email } });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Email already registered'
      });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create pharmacy
    const pharmacy = await Pharmacy.create({
      name,
      email,
      password: hashedPassword,
      phone,
      license_number,
      address,
      type,
      tenant_id,
      status: 'active'
    });
    
    // Generate token
    const token = jwt.sign(
      {
        id: pharmacy.id,
        email: pharmacy.email,
        type: 'pharmacy',
        tenant_id: pharmacy.tenant_id
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.status(201).json({
      success: true,
      token,
      pharmacy: {
        id: pharmacy.id,
        name: pharmacy.name,
        email: pharmacy.email,
        phone: pharmacy.phone
      }
    });
  } catch (error) {
    console.error('Pharmacy registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message
    });
  }
});

/**
 * GET /api/pharmacy/profile
 * Get pharmacy profile
 */
router.get('/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const pharmacy = await Pharmacy.findByPk(decoded.id);
    
    if (!pharmacy) {
      return res.status(404).json({ success: false, message: 'Pharmacy not found' });
    }
    
    res.json({
      success: true,
      pharmacy: {
        id: pharmacy.id,
        name: pharmacy.name,
        email: pharmacy.email,
        phone: pharmacy.phone,
        type: pharmacy.type,
        license_number: pharmacy.license_number,
        address: pharmacy.address,
        status: pharmacy.status
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch profile', error: error.message });
  }
});

export default router;
