/**
 * Doctor Routes Index
 * Central entry point for all doctor-related API routes
 * 
 * Includes:
 * - Doctor profile management
 * - Doctor availability and scheduling
 * - Consultation management
 * - Doctor dashboard and analytics
 * - Doctor settings and preferences
 */

import express from 'express';

// Import doctor routes
import doctorRoutes from '../../routes/doctor.route.js';
import doctorEnhancedRoutes from '../../routes/doctor.enhanced.route.js';
import doctorAvailabilityRoutes from '../../routes/doctor-availability.route.js';
import doctorSettingsRoutes from '../../routes/doctor-settings.route.js';

const router = express.Router();

// Mount doctor-related routes
router.use('/', doctorRoutes);
router.use('/enhanced', doctorEnhancedRoutes);
router.use('/availability', doctorAvailabilityRoutes);
router.use('/settings', doctorSettingsRoutes);

// Health check for doctor service
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'doctor-api',
    timestamp: new Date().toISOString()
  });
});

// Status endpoint
router.get('/status', (req, res) => {
  res.json({
    status: 'available',
    features: {
      profile_management: true,
      availability_scheduling: true,
      consultation_management: true,
      analytics: true,
      settings_management: true
    },
    timestamp: new Date().toISOString()
  });
});

export default router;
