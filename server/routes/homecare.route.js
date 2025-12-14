/**
 * Homecare Routes
 * Authentication and homecare management
 */

import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { HomecareProvider } from '../models/index.js';

const router = express.Router();

/**
 * POST /api/homecare/login
 * Homecare provider login
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
    
    // Find homecare by email
    const homecare = await HomecareProvider.findOne({ where: { email } });
    
    if (!homecare) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    // Verify password
    const isValidPassword = await bcrypt.compare(password, homecare.password);
    
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      {
        id: homecare.id,
        email: homecare.email,
        type: 'homecare',
        tenant_id: homecare.tenant_id
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({
      success: true,
      token,
      homecare: {
        id: homecare.id,
        name: homecare.name,
        email: homecare.email,
        phone: homecare.phone,
        services: homecare.services,
        tenant_id: homecare.tenant_id
      }
    });
  } catch (error) {
    console.error('Homecare login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
});

/**
 * POST /api/homecare/register
 * Register new homecare provider
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
      services = [],
      tenant_id
    } = req.body;
    
    // Check if homecare exists
    const existing = await HomecareProvider.findOne({ where: { email } });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Email already registered'
      });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create homecare
    const homecare = await HomecareProvider.create({
      name,
      email,
      password: hashedPassword,
      phone,
      license_number,
      address,
      services,
      tenant_id,
      status: 'active'
    });
    
    // Generate token
    const token = jwt.sign(
      {
        id: homecare.id,
        email: homecare.email,
        type: 'homecare',
        tenant_id: homecare.tenant_id
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.status(201).json({
      success: true,
      token,
      homecare: {
        id: homecare.id,
        name: homecare.name,
        email: homecare.email,
        phone: homecare.phone,
        services: homecare.services
      }
    });
  } catch (error) {
    console.error('Homecare registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message
    });
  }
});

/**
 * GET /api/homecare/profile
 * Get homecare profile
 */
router.get('/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const homecare = await HomecareProvider.findByPk(decoded.id);
    
    if (!homecare) {
      return res.status(404).json({ success: false, message: 'Homecare provider not found' });
    }
    
    res.json({
      success: true,
      homecare: {
        id: homecare.id,
        name: homecare.name,
        email: homecare.email,
        phone: homecare.phone,
        license_number: homecare.license_number,
        services: homecare.services,
        address: homecare.address,
        status: homecare.status
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch profile', error: error.message });
  }
});

export default router;
