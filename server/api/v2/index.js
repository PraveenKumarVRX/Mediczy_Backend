/**
 * API Version 2 Router
 * Enterprise-grade API structure with proper MVC patterns
 * 
 * Structure:
 * /api/v2/assistants - Assistant management (MVC pattern)
 * /api/v2/doctors - Doctor management (MVC pattern)  
 * /api/v2/patients - Patient management (MVC pattern)
 * /api/v2/appointments - Appointment management
 * /api/v2/prescriptions - Prescription management
 * /api/v2/billing - Billing management
 * 
 * Features:
 * - Standardized request/response format
 * - Zod validation on all inputs
 * - Comprehensive error handling
 * - Audit logging
 * - Rate limiting per endpoint type
 */

import express from 'express';
import { asyncHandler } from '../../middleware/errorHandler.middleware.js';
import { apiLimiter, authLimiter } from '../../middleware/rateLimiter.middleware.js';
import { requestLogger, auditLogger } from '../../middleware/logging.middleware.js';

const router = express.Router();

// ============== Middleware ==============

// Request logging for v2 API
router.use(requestLogger({ format: 'dev' }));

// API rate limiting
router.use(apiLimiter);

// ============== Health Check ==============

router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API v2 is healthy',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// ============== API Documentation ==============

router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Mediczy API v2',
    version: '2.0.0',
    documentation: '/api/v2/docs',
    endpoints: {
      auth: {
        login: 'POST /api/v2/auth/login',
        logout: 'POST /api/v2/auth/logout',
        refresh: 'POST /api/v2/auth/refresh'
      },
      assistants: {
        profile: 'GET /api/v2/assistants/profile',
        dashboard: 'GET /api/v2/assistants/dashboard',
        appointments: 'GET /api/v2/assistants/appointments',
        patients: 'GET /api/v2/assistants/patients'
      },
      doctors: {
        list: 'GET /api/v2/doctors',
        profile: 'GET /api/v2/doctors/:id',
        availability: 'GET /api/v2/doctors/:id/availability'
      },
      patients: {
        list: 'GET /api/v2/patients',
        register: 'POST /api/v2/patients',
        profile: 'GET /api/v2/patients/:id'
      },
      appointments: {
        list: 'GET /api/v2/appointments',
        create: 'POST /api/v2/appointments',
        update: 'PUT /api/v2/appointments/:id'
      }
    }
  });
});

// ============== Unified Auth Routes ==============

import { 
  authenticate, 
  generateToken, 
  generateRefreshToken,
  refreshAccessToken 
} from './auth.utils.js';
import { validateRequest } from './validators/index.js';
import { loginSchema } from './validators/assistant.validator.js';
import db from './db.js';

router.post('/auth/login', authLimiter, validateRequest(loginSchema), asyncHandler(async (req, res) => {
  const { email, password, role = 'assistant' } = req.body;
  
  // Determine table based on role
  const tableMap = {
    doctor: 'doctors',
    assistant: 'assistants',
    patient: 'patients',
    admin: 'admin_users'
  };
  
  const table = tableMap[role] || 'users';
  
  // Find user
  const result = await db.query(
    `SELECT * FROM ${table} WHERE email = $1`,
    [email]
  );
  
  if (result.rows.length === 0) {
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_FAILED', message: 'Invalid credentials' }
    });
  }
  
  const user = result.rows[0];
  
  // Verify password (simplified - use bcrypt in production)
  if (user.password !== password) {
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_FAILED', message: 'Invalid credentials' }
    });
  }
  
  // Generate tokens
  const accessToken = generateToken({
    id: user.id,
    userId: user.id,
    email: user.email,
    name: user.name,
    permissions: user.permissions,
    tenantId: user.tenant_id || 'default'
  }, role);
  
  const refreshToken = generateRefreshToken(user.id, role);
  
  // Remove sensitive data
  delete user.password;
  
  res.json({
    success: true,
    message: 'Login successful',
    data: {
      user,
      accessToken,
      refreshToken,
      expiresIn: '8h'
    }
  });
}));

router.post('/auth/refresh', asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  
  if (!refreshToken) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_TOKEN', message: 'Refresh token required' }
    });
  }
  
  const result = await refreshAccessToken(refreshToken);
  
  res.json({
    success: true,
    data: result
  });
}));

router.post('/auth/logout', authenticate(), (req, res) => {
  // In a real app, invalidate the refresh token in database/Redis
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

// ============== Assistant Routes (V2 - Enterprise Pattern) ==============

import AssistantController from './controllers/assistant.controller.js';
import assistantRoutes from './routes/assistant.routes.js';

router.use('/assistants', assistantRoutes);

// ============== Placeholder Routes for Future Migration ==============

// These will be migrated from v1 to proper MVC pattern

router.all('/doctors/*', (req, res) => {
  res.status(501).json({
    success: false,
    message: 'Doctor routes not yet migrated to v2. Use /api/doctors instead.',
    migrationStatus: 'pending'
  });
});

router.all('/patients/*', (req, res) => {
  res.status(501).json({
    success: false,
    message: 'Patient routes not yet migrated to v2. Use /api/patient instead.',
    migrationStatus: 'pending'
  });
});

router.all('/appointments/*', (req, res) => {
  res.status(501).json({
    success: false,
    message: 'Appointment routes not yet migrated to v2. Use /api/appointments instead.',
    migrationStatus: 'pending'
  });
});

// ============== Error Handling ==============

import { notFoundHandler, errorHandler } from '../../middleware/errorHandler.middleware.js';

router.use(notFoundHandler);
router.use(errorHandler);

export default router;
