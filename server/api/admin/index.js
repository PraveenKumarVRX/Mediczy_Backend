/**
 * Admin Routes Index
 * Central entry point for all super-admin and admin API endpoints
 * 
 * Includes:
 * - API credentials management
 * - Aggregator account provisioning
 * - System administration
 * - Access control and permissions
 * - Audit logging and monitoring
 */

import express from 'express';

// Import admin routes
import apiCredentialsRoutes from './api-credentials.routes.js';
import aggregatorsRoutes from './aggregators.routes.js';

const router = express.Router();

// Mount admin API routes
router.use('/api-credentials', apiCredentialsRoutes);
router.use('/aggregators', aggregatorsRoutes);

// Admin health check
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'admin-api',
    timestamp: new Date().toISOString()
  });
});

// Admin status with features
router.get('/status', (req, res) => {
  res.json({
    status: 'available',
    features: {
      api_credentials_management: true,
      aggregator_provisioning: true,
      access_control: true,
      audit_logging: true,
      system_monitoring: true
    },
    timestamp: new Date().toISOString()
  });
});

// Routes info
router.get('/routes', (req, res) => {
  res.json({
    admin_api: {
      api_credentials: {
        generate: 'POST /api/admin/api-credentials/generate',
        list: 'GET /api/admin/api-credentials',
        get: 'GET /api/admin/api-credentials/:id',
        rotate: 'POST /api/admin/api-credentials/:id/rotate',
        revoke: 'POST /api/admin/api-credentials/:id/revoke'
      },
      aggregators: {
        create: 'POST /api/admin/aggregators/create',
        list: 'GET /api/admin/aggregators',
        get: 'GET /api/admin/aggregators/:id',
        rotate_credential: 'POST /api/admin/aggregators/:id/rotate-credential',
        revoke_credential: 'POST /api/admin/aggregators/:id/revoke-credential'
      }
    }
  });
});

export default router;
