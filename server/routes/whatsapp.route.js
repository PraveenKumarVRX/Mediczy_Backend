import express from 'express';
import { body } from 'express-validator';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import {
  getWhatsAppStats,
  getWhatsAppTemplates,
  createWhatsAppTemplate,
  updateWhatsAppTemplate,
  deleteWhatsAppTemplate,
  getWhatsAppCampaigns,
  createWhatsAppCampaign,
  updateWhatsAppCampaignStatus,
  getWhatsAppMessages,
  sendWhatsAppMessage,
  verifyWhatsAppWebhook,
  getWhatsAppWebhook
} from '../controller/whatsapp.controller.js';

const router = express.Router();

// WhatsApp Business API endpoints (Admin + Team)
router.get('/stats', authUser, requireRole(['admin', 'team']), getWhatsAppStats);
router.get('/templates', authUser, requireRole(['admin', 'team']), getWhatsAppTemplates);
router.post('/templates', [
  body('name').notEmpty().withMessage('Template name is required'),
  body('category').isIn(['MARKETING', 'UTILITY', 'AUTHENTICATION']).withMessage('Invalid category'),
  body('language').notEmpty().withMessage('Language is required'),
  body('body').notEmpty().withMessage('Template body is required')
], authUser, requireRole(['admin', 'team']), createWhatsAppTemplate);
router.put('/templates/:id', [
  body('name').optional().notEmpty(),
  body('category').optional().isIn(['MARKETING', 'UTILITY', 'AUTHENTICATION']),
  body('language').optional().notEmpty(),
  body('body').optional().notEmpty()
], authUser, requireRole(['admin', 'team']), updateWhatsAppTemplate);
router.delete('/templates/:id', authUser, requireRole(['admin', 'team']), deleteWhatsAppTemplate);

router.get('/campaigns', authUser, requireRole('admin'), getWhatsAppCampaigns);
router.post('/campaigns', [
  body('name').notEmpty().withMessage('Campaign name is required'),
  body('templateId').notEmpty().withMessage('Template ID is required'),
  body('targetAudience').notEmpty().withMessage('Target audience is required'),
  body('scheduledAt').optional().isISO8601()
], authUser, requireRole('admin'), createWhatsAppCampaign);
router.put('/campaigns/:id/status', [
  body('status').isIn(['ACTIVE', 'PAUSED', 'STOPPED', 'COMPLETED']).withMessage('Invalid status')
], authUser, requireRole('admin'), updateWhatsAppCampaignStatus);

router.get('/messages', authUser, requireRole('admin'), getWhatsAppMessages);
router.post('/send', [
  body('to').isMobilePhone().withMessage('Valid phone number is required'),
  body('type').isIn(['text', 'template']).withMessage('Invalid message type'),
  body('content').if(body('type').equals('text')).notEmpty().withMessage('Content is required for text messages'),
  body('templateName').if(body('type').equals('template')).notEmpty().withMessage('Template name is required for template messages')
], authUser, requireRole('admin'), sendWhatsAppMessage);

// WhatsApp webhook endpoints (public - no auth required)
router.get('/webhook', getWhatsAppWebhook); // Webhook verification
router.post('/webhook', verifyWhatsAppWebhook); // Webhook for receiving messages

export default router;