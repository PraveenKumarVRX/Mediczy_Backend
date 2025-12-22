import express from 'express';
import paymentController from '../controller/payment.controller.js';
import { authUser } from '../middleware/auth.middleware.js';

const router = express.Router();

/**
 * Payment Routes
 * Base path: /api/payments
 */

// Create payment order
router.post('/order', authUser, (req, res) => {
  paymentController.createOrder(req, res);
});

// Verify payment
router.post('/verify', authUser, (req, res) => {
  paymentController.verifyPayment(req, res);
});

// Handle Razorpay webhooks (no auth required)
router.post('/webhook', (req, res) => {
  paymentController.handleWebhook(req, res);
});

// Get all transactions with filtering
router.get('/transactions', authUser, (req, res) => {
  paymentController.getTransactions(req, res);
});

// Get single transaction
router.get('/transactions/:id', authUser, (req, res) => {
  paymentController.getTransaction(req, res);
});

// Create refund
router.post('/refund', authUser, (req, res) => {
  paymentController.createRefund(req, res);
});

// Get payment gateways
router.get('/gateways', authUser, (req, res) => {
  paymentController.getGateways(req, res);
});

// Create payment gateway
router.post('/gateways', authUser, (req, res) => {
  paymentController.createGateway(req, res);
});

// Update gateway configuration
router.put('/gateways/:id', authUser, (req, res) => {
  paymentController.updateGateway(req, res);
});

// Get payment statistics
router.get('/stats', authUser, (req, res) => {
  paymentController.getStatistics(req, res);
});

// Get Razorpay key for frontend
router.get('/config', (req, res) => {
  res.json({
    success: true,
    keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_YOUR_KEY_ID',
    currency: 'INR'
  });
});

export default router;
