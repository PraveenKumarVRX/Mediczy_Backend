/**
 * Mediqzy API v1 Routes Aggregator
 * Created: February 6, 2026
 * Updated: February 6, 2026 - Added 6 additional modules
 * 
 * Combines all API v1 route modules
 */

import express from 'express';
import authRoutes from './api-v1-auth.js';
import usersRoutes from './api-v1-users.js';
import doctorsRoutes from './api-v1-doctors.js';
import appointmentsRoutes from './api-v1-appointments.js';
import videoRoutes from './api-v1-video.js';
import chatRoutes from './api-v1-chat.js';
import labsRoutes from './api-v1-labs.js';
import pharmacyRoutes from './api-v1-pharmacy.js';
import homecareRoutes from './api-v1-homecare.js';
import wellnessRoutes from './api-v1-wellness.js';
import webhooksRoutes from './api-v1-webhooks.js';

const router = express.Router();

/**
 * Mount routes with tenant-id prefix
 * Base URL: /v1/{tenant-id}/*
 */

// Auth routes (no tenant-id prefix)
router.use('/auth', authRoutes);

// Tenant-scoped routes
router.use('/:tenantId/users', usersRoutes);
router.use('/:tenantId/doctors', doctorsRoutes);
router.use('/:tenantId/appointments', appointmentsRoutes);
router.use('/:tenantId/video', videoRoutes);
router.use('/:tenantId/chat', chatRoutes);
router.use('/:tenantId/labs', labsRoutes);
router.use('/:tenantId/pharmacy', pharmacyRoutes);
router.use('/:tenantId/homecare', homecareRoutes);
router.use('/:tenantId/wellness', wellnessRoutes);
router.use('/:tenantId/webhooks', webhooksRoutes);

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// API version info
router.get('/', (req, res) => {
  res.status(200).json({
    name: 'Mediqzy API',
    version: '1.0.0',
    description: 'Multi-tenant wellness platform API for health insurance stakeholders',
    documentation: 'https://docs.mediqzy.com/api/v1',
    endpoints: {
      auth: '/v1/auth',
      users: '/v1/{tenant-id}/users',
      doctors: '/v1/{tenant-id}/doctors',
      appointments: '/v1/{tenant-id}/appointments',
      video: '/v1/{tenant-id}/video',
      chat: '/v1/{tenant-id}/chat',
      labs: '/v1/{tenant-id}/labs',
      pharmacy: '/v1/{tenant-id}/pharmacy',
      homecare: '/v1/{tenant-id}/homecare',
      wellness: '/v1/{tenant-id}/wellness',
      webhooks: '/v1/{tenant-id}/webhooks'
    },
    status: 'beta',
    contact: {
      email: 'api-support@mediqzy.com',
      docs: 'https://docs.mediqzy.com'
    }
  });
});

export default router;
