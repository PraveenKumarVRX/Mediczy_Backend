import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import pool from '../db/pgPool.js';
import { createCustomerCareService } from '../services/customer-care.service.js';
import { createChatAppointmentActions } from '../services/chat-appointment-actions.js';
import * as appointmentRepository from '../repositories/appointment.repository.js';
import { resolveActor, isOwnedByActor } from '../services/appointment-identity.service.js';
import { cancelAppointment, rescheduleAppointment } from '../controller/appointment.controller.js';
import { chatOwner } from '../services/medical-chat-contract.js';

const router = express.Router();
const service = createCustomerCareService();
const appointmentActions = createChatAppointmentActions({
  database: pool,
  repository: appointmentRepository,
  resolveActor,
  owns: isOwnedByActor,
  cancel: cancelAppointment,
  reschedule: rescheduleAppointment,
  validateTarget: (appointment, action) => service.validateRescheduleTarget(appointment, action),
});

const fail = (res, error) => res.status(error.statusCode || 500).json({
  success: false,
  error: error.statusCode ? error.message : 'Customer-care service is temporarily unavailable',
  code: error.code || 'CUSTOMER_CARE_ERROR',
});

function requireCustomer(req, res, next) {
  const role = String(req.userRole || req.user?.role || '').toLowerCase();
  if (!['user', 'patient'].includes(role)) {
    return res.status(403).json({ success: false, error: 'Customer account required', code: 'CUSTOMER_ACCOUNT_REQUIRED' });
  }
  return next();
}

router.use(authUser, requireCustomer);

router.post('/conversations', async (req, res) => {
  try {
    const data = await service.createConversation(req, { channel: req.body?.channel });
    res.status(201).json({ success: true, data });
  } catch (error) { fail(res, error); }
});

router.get('/conversations/:id', async (req, res) => {
  try { res.json({ success: true, data: await service.getConversation(req, req.params.id) }); }
  catch (error) { fail(res, error); }
});

router.post('/conversations/:id/messages', async (req, res) => {
  try {
    const data = await service.answer(req, req.params.id, { message: req.body?.message });
    res.json({ success: true, data });
  } catch (error) { fail(res, error); }
});

router.get('/status/appointments', async (req, res) => {
  try { res.json({ success: true, data: await service.appointmentStatus(req, req.query.appointmentId || null) }); }
  catch (error) { fail(res, error); }
});

router.get('/status/lab-orders', async (req, res) => {
  try { res.json({ success: true, data: await service.labStatus(req, req.query.orderId || null) }); }
  catch (error) { fail(res, error); }
});

router.get('/status/pharmacy-orders', async (req, res) => {
  try { res.json({ success: true, data: await service.pharmacyStatus(req, req.query.orderId || null) }); }
  catch (error) { fail(res, error); }
});

router.get('/status/membership', async (req, res) => {
  try { res.json({ success: true, data: await service.membershipStatus(req) }); }
  catch (error) { fail(res, error); }
});

router.get('/availability', async (req, res) => {
  try { res.json({ success: true, data: await service.availableSlots({ doctorId: req.query.doctorId, date: req.query.date }) }); }
  catch (error) { fail(res, error); }
});

// A model or client can only create a proposal.  The existing appointment
// transaction remains the only code that commits a cancellation/reschedule.
router.post('/appointment-actions/proposals', async (req, res) => {
  if (process.env.CHATBOT_TASK_MUTATIONS_ENABLED === 'false') {
    return res.status(503).json({ success: false, error: 'Appointment actions are disabled', code: 'TASK_MUTATIONS_DISABLED' });
  }
  try {
    const data = await appointmentActions.propose(req, chatOwner(req), req.body || {});
    res.status(201).json({ success: true, data });
  } catch (error) { fail(res, error); }
});

router.post('/appointment-actions/confirm', async (req, res) => {
  if (process.env.CHATBOT_TASK_MUTATIONS_ENABLED === 'false') {
    return res.status(503).json({ success: false, error: 'Appointment actions are disabled', code: 'TASK_MUTATIONS_DISABLED' });
  }
  try {
    const data = await appointmentActions.confirm(req, chatOwner(req), req.body || {});
    res.json({ success: true, data });
  } catch (error) { fail(res, error); }
});

export default router;
