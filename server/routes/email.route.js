import express from 'express';
import { body, param, query } from 'express-validator';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import emailService from '../services/emailService.js';
import {
  getEmailConfigs,
  createEmailConfig,
  updateEmailConfig,
  deleteEmailConfig,
  testEmailConfig,
  setDefaultConfig,
  getEmailTemplates,
  createEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,
  sendEmail,
  sendBulkEmail,
  getEmailLogs,
  getEmailStats,
  retryFailedEmail,
  cancelPendingEmail,
  previewTemplate,
  validateTemplate,
  exportEmailLogs,
  getEmailAnalytics,
  scheduleEmail
} from '../controller/email.controller.js';

const router = express.Router();

// All routes require admin authentication
router.use(authUser, requireRole('admin'));

// SMTP Configuration routes
router.get('/configs', getEmailConfigs);
router.post('/configs', [
  body('name').notEmpty().trim(),
  body('host').notEmpty().trim(),
  body('port').isInt({ min: 1, max: 65535 }),
  body('username').notEmpty().trim(),
  body('password').notEmpty(),
  body('fromEmail').isEmail(),
  body('fromName').notEmpty().trim(),
  body('encryption').optional().isIn(['none', 'tls', 'ssl']),
  body('isDefault').optional().isBoolean().toBoolean(),
  body('isActive').optional().isBoolean().toBoolean(),
  body('replyTo').optional().trim(),
  body('dailyLimit').optional().isInt({ min: 1 }),
  body('monthlyLimit').optional().isInt({ min: 1 }),
  body('provider').optional().trim(),
  body('maxRetries').optional().isInt({ min: 1, max: 10 }),
  body('retryDelay').optional().isInt({ min: 1000 })
], createEmailConfig);

router.put('/configs/:id', [
  param('id').notEmpty(),
  body('name').optional().trim(),
  body('host').optional().trim(),
  body('port').optional().isInt({ min: 1, max: 65535 }),
  body('username').optional().trim(),
  body('password').optional(),
  body('fromEmail').optional().isEmail().normalizeEmail(),
  body('fromName').optional().trim()
], updateEmailConfig);

router.delete('/configs/:id', [
  param('id').notEmpty()
], deleteEmailConfig);

router.post('/configs/:id/test', [
  param('id').notEmpty(),
  body('testEmail').isEmail().withMessage('Please provide a valid email address')
], testEmailConfig);

router.put('/configs/:id/default', [
  param('id').notEmpty()
], setDefaultConfig);

// Email Template routes
router.get('/templates', getEmailTemplates);
router.post('/templates', [
  body('name').notEmpty().trim(),
  body('category').isIn(['notification', 'welcome', 'reminder', 'billing', 'system', 'marketing']),
  body('subject').notEmpty().trim(),
  body('htmlContent').notEmpty(),
  body('textContent').notEmpty(),
  body('variables').optional().isArray()
], createEmailTemplate);

router.put('/templates/:id', [
  param('id').notEmpty(),
  body('name').optional().trim(),
  body('category').optional().isIn(['notification', 'welcome', 'reminder', 'billing', 'system', 'marketing']),
  body('subject').optional().trim(),
  body('htmlContent').optional(),
  body('textContent').optional(),
  body('variables').optional().isArray()
], updateEmailTemplate);

router.delete('/templates/:id', [
  param('id').notEmpty()
], deleteEmailTemplate);

router.post('/templates/:id/preview', [
  param('id').notEmpty(),
  body('variables').optional().isObject()
], previewTemplate);

router.post('/templates/:id/validate', [
  param('id').notEmpty(),
  body('variables').optional().isObject()
], validateTemplate);

// Email Sending routes
router.post('/send', [
  body('to').isEmail().normalizeEmail(),
  body('subject').optional().trim(),
  body('templateId').optional().notEmpty(),
  body('configId').optional().notEmpty(),
  body('variables').optional().isObject(),
  body('priority').optional().isIn(['low', 'normal', 'high', 'urgent'])
], sendEmail);

router.post('/send-bulk', [
  body('recipients').isArray({ min: 1, max: 1000 }),
  body('recipients.*.to').isEmail().normalizeEmail(),
  body('templateId').notEmpty(),
  body('configId').optional().notEmpty(),
  body('priority').optional().isIn(['low', 'normal', 'high', 'urgent'])
], sendBulkEmail);

router.post('/schedule', [
  body('to').isEmail().normalizeEmail(),
  body('scheduledAt').isISO8601(),
  body('templateId').notEmpty(),
  body('configId').optional().notEmpty(),
  body('variables').optional().isObject()
], scheduleEmail);

// Email Logs and Analytics routes
router.get('/logs', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isIn(['pending', 'sent', 'delivered', 'bounced', 'failed', 'cancelled']),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('to').optional().isEmail()
], getEmailLogs);

router.get('/stats', [
  query('period').optional().isIn(['hour', 'day', 'week', 'month', 'year']),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601()
], getEmailStats);

router.get('/analytics', [
  query('period').optional().isIn(['day', 'week', 'month', 'year']),
  query('templateId').optional().notEmpty(),
  query('configId').optional().notEmpty()
], getEmailAnalytics);

router.post('/logs/:id/retry', [
  param('id').notEmpty()
], retryFailedEmail);

router.post('/logs/:id/cancel', [
  param('id').notEmpty()
], cancelPendingEmail);

router.get('/logs/export', [
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('format').optional().isIn(['csv', 'xlsx'])
], exportEmailLogs);

// Email tracking routes (public - no auth required)
router.get('/track/open/:emailLogId', async (req, res) => {
  try {
    const { emailLogId } = req.params;
    await emailService.trackEmailOpen(emailLogId, req);
    
    // Return 1x1 transparent pixel
    const pixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64'
    );
    
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': pixel.length,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.end(pixel);
  } catch (error) {
    console.error('Error tracking email open:', error);
    res.status(200).end(); // Don't expose errors in tracking
  }
});

router.get('/track/click/:emailLogId', async (req, res) => {
  try {
    const { emailLogId } = req.params;
    const { url } = req.query;
    
    await emailService.trackEmailClick(emailLogId, req, url);
    
    // Redirect to the original URL
    if (url) {
      res.redirect(decodeURIComponent(url));
    } else {
      res.status(400).json({ error: 'URL parameter required' });
    }
  } catch (error) {
    console.error('Error tracking email click:', error);
    if (req.query.url) {
      res.redirect(decodeURIComponent(req.query.url));
    } else {
      res.status(400).json({ error: 'Tracking failed' });
    }
  }
});

export default router;