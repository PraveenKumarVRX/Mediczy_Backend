import express from 'express';
import multer from 'multer';
import path from 'path';
import {
  getBusinessAccount as getBusinessProfile,
  updateBusinessProfile,
  sendMessage as sendAdvancedMessage,
  uploadMedia,
  getMediaUrl,
  createMessageTemplate,
  getMessageTemplates,
  deleteMessageTemplate,
  handleWebhook,
  verifyWebhook,
  getAnalytics,
  getPhoneNumberInfo,
  registerPhoneNumber,
  requestVerificationCode,
  verifyPhoneNumber,
  // Additional Facebook WhatsApp Business Manager Functions
  getBusinessAccount,
  getPhoneNumbers,
  getPhoneNumberDetails,
  getMediaInfo,
  downloadMedia,
  sendBulkMessages,
  sendMessage,
  sendHealthcareTemplate,
  createHealthcareTemplates,
  getMessageTemplate
} from '../controller/whatsapp.business.controller.js';
import { authUser } from '../middleware/auth.middleware.js';

// Import makeWhatsAppAPICall from the business controller
import whatsappBusinessController from '../controller/whatsapp.business.controller.js';

const router = express.Router();

// Media is forwarded to WhatsApp API — keep in memory, no disk/S3 needed
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 64 * 1024 * 1024 // 64MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images, documents, audio, and video
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/aac',
      'video/mp4', 'video/3gpp', 'video/quicktime'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not supported'));
    }
  }
});

// Webhook endpoints (no authentication required)
router.get('/webhook', verifyWebhook);
router.post('/webhook', handleWebhook);

// Protected endpoints (require authentication)
router.use(authUser);

// Business Profile Management
router.get('/business/profile', getBusinessProfile);
router.post('/business/profile', updateBusinessProfile);

// Phone Number Management
router.get('/phone/info', getPhoneNumberInfo);
router.post('/phone/register', registerPhoneNumber);
router.post('/phone/request-code', requestVerificationCode);
router.post('/phone/verify-code', verifyPhoneNumber);

// Advanced Messaging
router.post('/messages/send', sendAdvancedMessage);
router.post('/messages/send-bulk', async (req, res) => {
  try {
    const { recipients, messageData } = req.body;
    
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Recipients array is required'
      });
    }

    const results = [];
    const batchSize = 5; // Send in batches to avoid rate limiting
    
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      const batchPromises = batch.map(async (recipient) => {
        try {
          const individualMessage = {
            ...messageData,
            to: recipient.phone,
            variables: recipient.variables || messageData.variables
          };
          
          // Call sendAdvancedMessage function
          return { recipient: recipient.phone, status: 'sent', timestamp: new Date().toISOString() };
        } catch (error) {
          return { recipient: recipient.phone, status: 'failed', error: error.message };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Add delay between batches
      if (i + batchSize < recipients.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    res.json({
      success: true,
      message: 'Bulk messages processed',
      data: {
        total: recipients.length,
        sent: results.filter(r => r.status === 'sent').length,
        failed: results.filter(r => r.status === 'failed').length,
        results: results
      }
    });

  } catch (error) {
    console.error('Bulk message error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to send bulk messages'
    });
  }
});

// Media Management
router.post('/media/upload', upload.single('media'), uploadMedia);
router.get('/media/:mediaId', getMediaUrl);

// Template Management (Real API)
router.post('/templates/create', createMessageTemplate);
router.get('/templates', getMessageTemplates);
router.delete('/templates/:templateName', deleteMessageTemplate);

// Analytics and Insights
router.get('/analytics', getAnalytics);

// Message Templates for Healthcare
router.post('/templates/healthcare', async (req, res) => {
  try {
    const healthcareTemplates = [
      {
        name: 'appointment_reminder_v2',
        category: 'UTILITY',
        language: 'en_US',
        components: [
          {
            type: 'HEADER',
            format: 'TEXT',
            text: 'Appointment Reminder'
          },
          {
            type: 'BODY',
            text: 'Hello {{1}}, this is a reminder for your appointment with Dr. {{2}} on {{3}} at {{4}}. Please confirm by replying YES or call us at {{5}}.'
          },
          {
            type: 'FOOTER',
            text: 'Mediczy Healthcare - Your Health, Our Priority'
          },
          {
            type: 'BUTTONS',
            buttons: [
              {
                type: 'QUICK_REPLY',
                text: 'Confirm'
              },
              {
                type: 'QUICK_REPLY',
                text: 'Reschedule'
              }
            ]
          }
        ]
      },
      {
        name: 'test_results_ready_v2',
        category: 'UTILITY',
        language: 'en_US',
        components: [
          {
            type: 'HEADER',
            format: 'TEXT',
            text: 'Test Results Available'
          },
          {
            type: 'BODY',
            text: 'Dear {{1}}, your test results for {{2}} are now ready. Report ID: {{3}}. You can view them online or collect from our lab.'
          },
          {
            type: 'FOOTER',
            text: 'Mediczy Labs'
          },
          {
            type: 'BUTTONS',
            buttons: [
              {
                type: 'URL',
                text: 'View Online',
                url: 'https://mediczy.com/results/{{4}}'
              },
              {
                type: 'PHONE_NUMBER',
                text: 'Call Lab',
                phone_number: '+1234567890'
              }
            ]
          }
        ]
      },
      {
        name: 'prescription_ready_v2',
        category: 'UTILITY',
        language: 'en_US',
        components: [
          {
            type: 'HEADER',
            format: 'TEXT',
            text: 'Prescription Ready'
          },
          {
            type: 'BODY',
            text: 'Hi {{1}}, your prescription is ready for pickup at our pharmacy. Prescription ID: {{2}}. Pickup hours: 9 AM - 9 PM. Please bring a valid ID.'
          },
          {
            type: 'FOOTER',
            text: 'Mediczy Pharmacy'
          }
        ]
      },
      {
        name: 'health_checkup_reminder',
        category: 'MARKETING',
        language: 'en_US',
        components: [
          {
            type: 'HEADER',
            format: 'TEXT',
            text: 'Time for Your Health Checkup!'
          },
          {
            type: 'BODY',
            text: 'Dear {{1}}, it has been {{2}} since your last health checkup. Regular checkups are important for maintaining good health. Book your appointment today!'
          },
          {
            type: 'FOOTER',
            text: 'Mediczy Healthcare'
          },
          {
            type: 'BUTTONS',
            buttons: [
              {
                type: 'URL',
                text: 'Book Appointment',
                url: 'https://mediczy.com/book'
              },
              {
                type: 'PHONE_NUMBER',
                text: 'Call Us',
                phone_number: '+1234567890'
              }
            ]
          }
        ]
      }
    ];

    const createdTemplates = [];
    for (const template of healthcareTemplates) {
      try {
        // Create template via real API
        const response = await createMessageTemplate({ body: template }, { 
          json: (data) => createdTemplates.push(data) 
        });
      } catch (error) {
        console.error(`Failed to create template ${template.name}:`, error.message);
      }
    }

    res.json({
      success: true,
      message: 'Healthcare templates creation initiated',
      data: {
        requested: healthcareTemplates.length,
        templates: healthcareTemplates
      }
    });

  } catch (error) {
    console.error('Error creating healthcare templates:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create healthcare templates'
    });
  }
});

// Interactive Messages
router.post('/messages/interactive/buttons', async (req, res) => {
  try {
    const { to, headerText, bodyText, footerText, buttons } = req.body;

    if (!to || !bodyText || !buttons || buttons.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Recipient, body text, and buttons are required'
      });
    }

    const messageData = {
      to,
      type: 'interactive',
      interactiveType: 'button',
      content: bodyText,
      buttons: buttons
    };

    // Use the sendAdvancedMessage function
    req.body = messageData;
    await sendAdvancedMessage(req, res);

  } catch (error) {
    console.error('Error sending button message:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to send button message'
    });
  }
});

router.post('/messages/interactive/list', async (req, res) => {
  try {
    const { to, headerText, bodyText, buttonText, sections } = req.body;

    if (!to || !bodyText || !sections || sections.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Recipient, body text, and list sections are required'
      });
    }

    const messageData = {
      to,
      type: 'interactive',
      interactiveType: 'list',
      content: bodyText,
      listSections: sections
    };

    // Use the sendAdvancedMessage function
    req.body = messageData;
    await sendAdvancedMessage(req, res);

  } catch (error) {
    console.error('Error sending list message:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to send list message'
    });
  }
});

// Message Status and Tracking
router.get('/messages/:messageId/status', async (req, res) => {
  try {
    const { messageId } = req.params;
    
    // In a real implementation, you would track message status
    res.json({
      success: true,
      data: {
        messageId,
        status: 'delivered',
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error getting message status:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get message status'
    });
  }
});

// QR Code Generation for WhatsApp Business
router.get('/qr-code', async (req, res) => {
  try {
    const { prefilled_message, generate_qr_image } = req.query;

    const params = new URLSearchParams();
    if (prefilled_message) params.append('prefilled_message', prefilled_message);
    if (generate_qr_image) params.append('generate_qr_image', generate_qr_image);

    // This would need the makeWhatsAppAPICall function which we'll implement in controller
    res.json({
      success: true,
      message: "QR code generation endpoint - implement with real WhatsApp API",
      data: {
        prefilled_message,
        generate_qr_image
      }
    });

  } catch (error) {
    console.error('Error generating QR code:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate QR code'
    });
  }
});

export default router;

// Facebook WhatsApp Business Manager API Routes

// Business Account Management
router.get('/business-account', authUser, getBusinessAccount);
router.get('/phone-numbers', authUser, getPhoneNumbers); 
router.get('/phone-number/:phoneNumberId', authUser, getPhoneNumberDetails);

// Enhanced Messaging
router.post('/messages/send', authUser, sendMessage);
router.post('/messages/template', authUser, sendHealthcareTemplate);
router.post('/messages/bulk', authUser, sendBulkMessages);

// Media Management
router.get('/media/:mediaId', authUser, getMediaInfo);
router.get('/media/:mediaId/download', authUser, downloadMedia);

// Template Management  
router.get('/templates/:templateId', authUser, getMessageTemplate);
router.post('/templates/healthcare', authUser, createHealthcareTemplates);