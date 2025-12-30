/**
 * API V1 Router
 * Central router for all V1 API endpoints
 */

import express from 'express';

// Controllers/Routes
import assistantRoutes from './routes/assistant.routes.js';
// Import other v1 routes as they are migrated
// import userRoutes from './routes/user.routes.js';
// import doctorRoutes from './routes/doctor.routes.js';
// import appointmentRoutes from './routes/appointment.routes.js';
// import patientRoutes from './routes/patient.routes.js';
// import billingRoutes from './routes/billing.routes.js';
// import chatRoutes from './routes/chat.routes.js';

const router = express.Router();

/**
 * API V1 Info
 */
router.get('/', (req, res) => {
  res.json({
    version: '1.0.0',
    status: 'active',
    documentation: '/api/v1/docs',
    endpoints: {
      assistant: '/api/v1/assistant',
      users: '/api/v1/users',
      doctors: '/api/v1/doctors',
      appointments: '/api/v1/appointments',
      patients: '/api/v1/patients',
      billing: '/api/v1/billing',
      chat: '/api/v1/chat'
    }
  });
});

/**
 * Mount Routes
 */

// Assistant Portal
router.use('/assistant', assistantRoutes);

// User Routes (to be migrated)
// router.use('/users', userRoutes);

// Doctor Routes (to be migrated)
// router.use('/doctors', doctorRoutes);

// Appointment Routes (to be migrated)
// router.use('/appointments', appointmentRoutes);

// Patient Routes (to be migrated)
// router.use('/patients', patientRoutes);

// Billing Routes (to be migrated)
// router.use('/billing', billingRoutes);

// Chat Routes (to be migrated)
// router.use('/chat', chatRoutes);

/**
 * API Documentation (Swagger/OpenAPI)
 */
router.get('/docs', (req, res) => {
  // In production, serve Swagger UI
  res.json({
    message: 'API Documentation',
    swagger: '/api/v1/docs/swagger.json',
    postman: '/api/v1/docs/postman.json'
  });
});

export default router;
