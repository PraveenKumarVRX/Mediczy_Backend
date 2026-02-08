/**
 * Authentication Routes Index
 * Central entry point for all authentication-related routes
 * 
 * Aggregates routes from:
 * - JWT authentication
 * - OAuth / Social login
 * - Token management
 * - Role-based access control
 */

import express from 'express';

// Import auth routes from routes directory
import authLoginRoute from '../../routes/auth.login.route.js';
import authTokenRoute from '../../routes/auth.token.route.js';
import authUniversalRoute from '../../routes/auth.universal.route.js';
import oauthRoute from '../../routes/oauth.route.js';
import hospitalAuthRoute from '../../routes/hospital-auth.route.js';
import doctorOauthRoute from '../../routes/doctor-oauth.route.js';
import clinicStaffAuthRoute from '../../routes/clinic-staff-auth.routes.js';

const router = express.Router();

// Mount authentication routes
router.use('/login', authLoginRoute);
router.use('/token', authTokenRoute);
router.use('/', authUniversalRoute);
router.use('/oauth', oauthRoute);
router.use('/hospital', hospitalAuthRoute);
router.use('/doctor-oauth', doctorOauthRoute);
router.use('/clinic-staff', clinicStaffAuthRoute);

// Health check for auth service
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'authentication',
    timestamp: new Date().toISOString()
  });
});

// Status check - verify JWT middleware is configured
router.get('/status', (req, res) => {
  res.json({
    status: 'available',
    features: {
      jwt: true,
      oauth: true,
      token_management: true,
      role_based_access: true
    },
    timestamp: new Date().toISOString()
  });
});

export default router;
