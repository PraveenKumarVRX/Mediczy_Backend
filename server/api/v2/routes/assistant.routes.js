/**
 * Assistant Routes for API v2
 * Thin routing layer - only handles route definitions
 * All logic is in the controller
 */

import express from 'express';
import AssistantController from '../controllers/assistant.controller.js';
import { authenticate, authorize } from '../auth.utils.js';
import { validateRequest } from '../validators/index.js';
import { authLimiter } from '../../../middleware/rateLimiter.middleware.js';
import { auditLogger } from '../../../middleware/logging.middleware.js';
import {
  loginSchema,
  updateProfileSchema,
  getAppointmentsSchema,
  createAppointmentSchema,
  updateAppointmentSchema,
  getPatientsSchema,
  registerPatientSchema,
  getPrescriptionsSchema,
  getBillingSchema,
  getMessagesSchema
} from '../validators/assistant.validator.js';

const router = express.Router();

// ============== Auth Routes ==============

router.post('/login',
  authLimiter,
  validateRequest(loginSchema),
  AssistantController.login
);

// ============== Protected Routes ==============

// Apply authentication to all routes below
router.use(authenticate({ allowedRoles: ['assistant', 'secretary'] }));

// Profile
router.get('/profile', AssistantController.getProfile);

router.put('/profile',
  validateRequest(updateProfileSchema),
  auditLogger('PROFILE_UPDATE', { resourceType: 'assistant' }),
  AssistantController.updateProfile
);

// Dashboard
router.get('/dashboard', AssistantController.getDashboard);

// Appointments
router.get('/appointments',
  authorize('canViewAppointments'),
  validateRequest(getAppointmentsSchema),
  AssistantController.getAppointments
);

router.post('/appointments',
  authorize('canManageAppointments'),
  validateRequest(createAppointmentSchema),
  auditLogger('APPOINTMENT_CREATE', { resourceType: 'appointment' }),
  AssistantController.createAppointment
);

router.patch('/appointments/:id/status',
  authorize('canManageAppointments'),
  auditLogger('APPOINTMENT_STATUS_UPDATE', { resourceType: 'appointment' }),
  AssistantController.updateAppointmentStatus
);

// Patients
router.get('/patients',
  authorize('canViewPatients'),
  validateRequest(getPatientsSchema),
  AssistantController.getPatients
);

router.post('/patients',
  authorize('canRegisterPatients'),
  validateRequest(registerPatientSchema),
  auditLogger('PATIENT_REGISTER', { resourceType: 'patient' }),
  AssistantController.registerPatient
);

// Prescriptions
router.get('/prescriptions',
  authorize('canViewPrescriptions'),
  validateRequest(getPrescriptionsSchema),
  AssistantController.getPrescriptions
);

// Billing
router.get('/billing',
  authorize('canViewBilling'),
  validateRequest(getBillingSchema),
  AssistantController.getBilling
);

// Messages
router.get('/messages',
  validateRequest(getMessagesSchema),
  AssistantController.getMessages
);

// Linked Doctors
router.get('/linked-doctors', AssistantController.getLinkedDoctors);

export default router;
