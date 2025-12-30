/**
 * Assistant Routes - V1 API
 * Thin route layer - only defines endpoints, delegates to controller
 */

import express from 'express';
import AssistantController from '../controllers/assistant.controller.js';
import { authAssistant } from '../../../middleware/auth.middleware.js';
import { rateLimiter } from '../../../middleware/rateLimiter.middleware.js';

const router = express.Router();

// Public routes
router.post('/login', rateLimiter('login'), AssistantController.login);

// Protected routes - require authentication
router.use(authAssistant);

// Profile
router.get('/profile', AssistantController.getProfile);
router.put('/profile', AssistantController.updateProfile);

// Dashboard
router.get('/dashboard', AssistantController.getDashboard);

// Appointments
router.get('/appointments', AssistantController.getAppointments);
router.patch('/appointments/:id/status', AssistantController.updateAppointmentStatus);

// Patients
router.get('/patients', AssistantController.getPatients);
router.post('/patients', AssistantController.registerPatient);

// Doctors
router.get('/linked-doctors', AssistantController.getLinkedDoctors);

// Prescriptions
router.get('/prescriptions', AssistantController.getPrescriptions);

// Billing
router.get('/billing/invoices', AssistantController.getInvoices);

// Messages
router.get('/messages', AssistantController.getMessages);
router.post('/messages', AssistantController.sendMessage);

// Reports
router.get('/reports', AssistantController.getReports);

export default router;
