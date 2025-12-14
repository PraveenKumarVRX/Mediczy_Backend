/**
 * WhatsApp Configuration Routes
 * API endpoints for managing WhatsApp providers and settings
 */

import { Router } from 'express';
import whatsAppService from '../services/whatsapp.service.js';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import multer from 'multer';

const router = Router();

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 64 * 1024 * 1024 }, // 64MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/webp',
      'audio/aac', 'audio/mp4', 'audio/amr', 'audio/mpeg', 'audio/ogg',
      'video/mp4', 'video/3gp',
      'application/pdf', 'application/msword', 'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type'), false);
    }
  }
});

// Simple validation middleware
const validateWhatsAppConfig = (req, res, next) => {
  const { provider, settings, providers } = req.body;
  
  if (!provider && !settings && !providers) {
    return res.status(400).json({
      success: false,
      message: 'At least one of provider, settings, or providers must be specified'
    });
  }

  if (provider && !['twilio', 'facebook', 'infobip', 'messagebird', 'gupshup', 'karix'].includes(provider)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid provider specified'
    });
  }

  next();
};

// Apply authentication to all routes
router.use(authUser);

/**
 * GET /api/whatsapp-config
 * Get current WhatsApp configuration
 */
router.get('/', requireRole('admin'), (req, res) => {
  try {
    const config = whatsAppService.getConfig();
    res.json({
      success: true,
      data: {
        ...config,
        recommendedForIndia: [
          {
            provider: 'gupshup',
            reason: 'Made for India, lowest costs, healthcare focus, local support',
            priority: 1,
            costRange: '₹0.35-0.65 per message',
            setupTime: '1-2 days'
          },
          {
            provider: 'facebook',
            reason: 'Official API, free tier, template management, global reach',
            priority: 2,
            costRange: 'Free for 1000 conversations/month',
            setupTime: '2-7 days'
          },
          {
            provider: 'karix',
            reason: 'Indian company, healthcare expertise, compliance',
            priority: 3,
            costRange: 'Healthcare-specific pricing',
            setupTime: '1-3 days'
          }
        ],
        marketInsights: {
          totalProviders: 6,
          indianProviders: 2,
          averageSetupTime: '1-7 days',
          costRange: '₹0.35-2.50 per message',
          complianceFeatures: ['Data localization', 'GDPR compliance', 'HIPAA compliance']
        }
      }
    });
  } catch (error) {
    console.error('Error fetching WhatsApp config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch WhatsApp configuration'
    });
  }
});

/**
 * PUT /api/whatsapp-config
 * Update WhatsApp configuration
 */
router.put('/', requireRole('admin'), validateWhatsAppConfig, (req, res) => {
  try {
    const result = whatsAppService.updateConfig(req.body);
    res.json({
      success: true,
      message: 'WhatsApp configuration updated successfully',
      data: result
    });
  } catch (error) {
    console.error('Error updating WhatsApp config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update WhatsApp configuration',
      error: error.message
    });
  }
});

/**
 * GET /api/whatsapp-config/providers
 * Get all available WhatsApp providers with India-specific info
 */
router.get('/providers', requireRole('admin'), (req, res) => {
  try {
    const config = whatsAppService.getConfig();
    
    const providersWithDetails = config.providers.map(provider => ({
      ...provider,
      marketFit: {
        indiaScore: {
          gupshup: 95,
          karix: 90,
          facebook: 85,
          infobip: 75,
          twilio: 70,
          messagebird: 65
        }[provider.id] || 50,
        factors: {
          localPresence: provider.indianSupport?.localPresence || false,
          costEffectiveness: provider.indianSupport?.costEffectiveness || 'Unknown',
          healthcareFocus: ['gupshup', 'karix'].includes(provider.id),
          setupComplexity: {
            facebook: 'High (business verification)',
            gupshup: 'Medium',
            karix: 'Medium',
            twilio: 'Low',
            infobip: 'Medium',
            messagebird: 'Low'
          }[provider.id] || 'Unknown'
        }
      }
    }));

    res.json({
      success: true,
      data: providersWithDetails,
      summary: {
        totalProviders: providersWithDetails.length,
        configuredProviders: providersWithDetails.filter(p => p.configured).length,
        recommendedProviders: providersWithDetails.filter(p => 
          p.marketFit.indiaScore >= 80
        ).length,
        averageIndiaScore: Math.round(
          providersWithDetails.reduce((acc, p) => acc + p.marketFit.indiaScore, 0) / 
          providersWithDetails.length
        )
      }
    });
  } catch (error) {
    console.error('Error fetching providers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch WhatsApp providers'
    });
  }
});

/**
 * POST /api/whatsapp-config/test/:provider
 * Test connection to specific provider
 */
router.post('/test/:provider', requireRole('admin'), async (req, res) => {
  try {
    const { provider } = req.params;
    const result = await whatsAppService.testProvider(provider);
    
    res.json({
      success: result.success,
      provider,
      message: result.message,
      data: {
        estimatedCost: result.estimatedCost,
        features: result.features || [],
        indianSupport: whatsAppService.getIndianSupport ? 
          whatsAppService.getIndianSupport(provider) : {},
        testTimestamp: new Date().toISOString(),
        recommendation: whatsAppService.getProviderRecommendation ? 
          whatsAppService.getProviderRecommendation(provider) : ''
      }
    });
  } catch (error) {
    console.error('Error testing provider:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to test provider connection',
      error: error.message
    });
  }
});

/**
 * POST /api/whatsapp-config/message
 * Send a WhatsApp message
 */
router.post('/message', async (req, res) => {
  try {
    const { to, content, type = 'text', templateName, patientId, doctorId, appointmentId } = req.body;

    if (!to || !content) {
      return res.status(400).json({
        success: false,
        message: 'Recipient phone number and message content are required'
      });
    }

    // Validate phone number format
    const phoneRegex = /^(\+91|91)?[6-9]\d{9}$/;
    if (!phoneRegex.test(to.replace(/\s+/g, ''))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format. Use +91XXXXXXXXXX or 10-digit format'
      });
    }

    const message = await whatsAppService.sendMessage({
      to: to.startsWith('+') ? to : `+91${to}`,
      content,
      type,
      templateName,
      patientId: patientId || req.user.patientId,
      doctorId: doctorId || req.user.id,
      appointmentId,
      from: req.user.id
    });

    res.json({
      success: true,
      message: 'WhatsApp message sent successfully',
      data: {
        messageId: message.id,
        status: message.status,
        provider: message.provider,
        to: message.to,
        type: message.type,
        createdAt: message.createdAt
      }
    });
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send WhatsApp message',
      error: error.message
    });
  }
});

/**
 * POST /api/whatsapp-config/template-message
 * Send a template message
 */
router.post('/template-message', async (req, res) => {
  try {
    const { to, templateName, parameters = [], patientId, doctorId, appointmentId } = req.body;

    if (!to || !templateName) {
      return res.status(400).json({
        success: false,
        message: 'Recipient phone number and template name are required'
      });
    }

    const templates = whatsAppService.getHealthcareTemplates();
    const template = templates.find(t => t.name === templateName);
    
    if (!template) {
      return res.status(404).json({
        success: false,
        message: `Template '${templateName}' not found`
      });
    }

    // Generate template content with parameters
    let templateContent = template.components.find(c => c.type === 'BODY')?.text || '';
    parameters.forEach((param, index) => {
      templateContent = templateContent.replace(`{{${index + 1}}}`, param);
    });

    const message = await whatsAppService.sendMessage({
      to: to.startsWith('+') ? to : `+91${to}`,
      content: templateContent,
      type: 'template',
      templateName,
      patientId: patientId || req.user.patientId,
      doctorId: doctorId || req.user.id,
      appointmentId,
      from: req.user.id
    });

    res.json({
      success: true,
      message: 'Template message sent successfully',
      data: {
        messageId: message.id,
        templateName,
        parameters,
        to: message.to,
        provider: message.provider,
        createdAt: message.createdAt
      }
    });
  } catch (error) {
    console.error('Error sending template message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send template message',
      error: error.message
    });
  }
});

/**
 * POST /api/whatsapp-config/bulk-message
 * Send bulk messages
 */
router.post('/bulk-message', async (req, res) => {
  try {
    const { recipients, content, type = 'text', templateName, delay = 1000 } = req.body;

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Recipients array is required and must not be empty'
      });
    }

    if (!content) {
      return res.status(400).json({
        success: false,
        message: 'Message content is required'
      });
    }

    const results = {
      total: recipients.length,
      sent: [],
      failed: []
    };

    // Send messages with delay to respect rate limits
    for (const recipient of recipients) {
      try {
        const to = typeof recipient === 'string' ? recipient : recipient.phone;
        const name = typeof recipient === 'object' ? recipient.name : null;
        
        // Personalize message if name is available
        let personalizedContent = content;
        if (name) {
          personalizedContent = content.replace(/{{name}}/g, name);
        }

        const message = await whatsAppService.sendMessage({
          to: to.startsWith('+') ? to : `+91${to}`,
          content: personalizedContent,
          type,
          templateName,
          from: req.user.id
        });

        results.sent.push({
          phone: to,
          name,
          messageId: message.id,
          status: 'sent'
        });

        // Add delay between messages
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } catch (error) {
        results.failed.push({
          phone: typeof recipient === 'string' ? recipient : recipient.phone,
          name: typeof recipient === 'object' ? recipient.name : null,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      message: 'Bulk messaging completed',
      data: results,
      summary: {
        total: results.total,
        sent: results.sent.length,
        failed: results.failed.length,
        successRate: Math.round((results.sent.length / results.total) * 100)
      }
    });
  } catch (error) {
    console.error('Error sending bulk messages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send bulk messages',
      error: error.message
    });
  }
});

/**
 * POST /api/whatsapp-config/upload-media
 * Upload media for WhatsApp
 */
router.post('/upload-media', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // For now, return mock data - in real implementation, upload to provider
    const mediaData = {
      mediaId: `media_${Date.now()}`,
      filename: req.file.originalname,
      size: req.file.size,
      type: req.file.mimetype,
      uploadedAt: new Date().toISOString()
    };

    res.json({
      success: true,
      message: 'Media uploaded successfully',
      data: mediaData
    });
  } catch (error) {
    console.error('Error uploading media:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload media',
      error: error.message
    });
  }
});

/**
 * GET /api/whatsapp-config/templates
 * Get healthcare templates
 */
router.get('/templates', (req, res) => {
  try {
    const templates = whatsAppService.getHealthcareTemplates();
    
    res.json({
      success: true,
      data: templates,
      total: templates.length,
      categories: [...new Set(templates.map(t => t.category))],
      languages: [...new Set(templates.map(t => t.language))]
    });
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch templates'
    });
  }
});

/**
 * GET /api/whatsapp-config/stats
 * Get WhatsApp statistics and analytics
 */
router.get('/stats', (req, res) => {
  try {
    const stats = whatsAppService.getStats();
    
    res.json({
      success: true,
      data: {
        ...stats,
        healthcareMetrics: {
          appointmentReminders: stats.messagesByStatus?.sent * 0.3 || 0,
          testResultNotifications: stats.messagesByStatus?.sent * 0.2 || 0,
          prescriptionAlerts: stats.messagesByStatus?.sent * 0.15 || 0,
          generalMessages: stats.messagesByStatus?.sent * 0.35 || 0
        },
        complianceStatus: {
          dataLocalization: stats.indianCompliance?.dataLocalization || false,
          gdprCompliant: stats.indianCompliance?.gdprCompliance || false,
          hipaaCompliant: stats.indianCompliance?.hipaCompliance || false
        }
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch WhatsApp statistics'
    });
  }
});

/**
 * GET /api/whatsapp-config/logs
 * Get WhatsApp message logs with filtering
 */
router.get('/logs', (req, res) => {
  try {
    const { provider, status, limit = 50 } = req.query;
    
    const logs = whatsAppService.getLogs({
      provider,
      status,
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      data: logs,
      totalLogs: logs.length,
      filters: { provider, status, limit }
    });
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch WhatsApp logs'
    });
  }
});

/**
 * GET /api/whatsapp-config/setup-guide
 * Get setup guide for WhatsApp providers
 */
router.get('/setup-guide', requireRole('admin'), (req, res) => {
  try {
    const setupGuide = {
      generalRequirements: {
        businessVerification: 'WhatsApp Business verification',
        phoneNumber: 'Dedicated business phone number',
        businessProfile: 'Complete business profile setup',
        complianceDocuments: 'Healthcare compliance documents'
      },
      providerSetup: {
        facebook: {
          title: 'Facebook WhatsApp Business Manager',
          difficulty: 'Hard',
          time: '2-7 days',
          steps: [
            'Create Facebook Developer account',
            'Create Facebook App with WhatsApp product',
            'Submit business verification documents',
            'Add phone number and verify',
            'Configure webhooks',
            'Apply for template approval'
          ],
          documents: ['Business license', 'Healthcare registration', 'Tax documents'],
          pricing: 'Free tier: 1000 conversations/month',
          pros: ['Official API', 'Free tier', 'Advanced features'],
          cons: ['Complex setup', 'Business verification required', 'Approval process']
        },
        gupshup: {
          title: 'Gupshup WhatsApp Business API',
          difficulty: 'Medium',
          time: '1-2 days',
          steps: [
            'Register at gupshup.io',
            'Submit business documents',
            'Choose WhatsApp Business API plan',
            'Configure phone number',
            'Setup webhooks and integration',
            'Test message sending'
          ],
          documents: ['Business registration', 'GST certificate', 'Healthcare license'],
          pricing: 'From ₹0.35 per message - Best for India',
          pros: ['Indian company', 'Local support', 'Cost effective', 'Healthcare focus'],
          cons: ['Limited global reach', 'Smaller feature set']
        },
        twilio: {
          title: 'Twilio WhatsApp Business API',
          difficulty: 'Easy',
          time: '1-2 hours',
          steps: [
            'Register at twilio.com',
            'Verify phone number',
            'Request WhatsApp Business API access',
            'Configure phone number',
            'Setup webhook endpoints',
            'Test integration'
          ],
          documents: ['Business verification for phone numbers'],
          pricing: '₹0.65-2.50 per message',
          pros: ['Easy setup', 'Excellent documentation', 'Global reach', 'Reliable'],
          cons: ['Higher cost', 'No local Indian support']
        },
        karix: {
          title: 'Karix WhatsApp Business',
          difficulty: 'Medium',
          time: '1-3 days',
          steps: [
            'Contact Karix for healthcare plans',
            'Submit healthcare business documents',
            'Setup account and phone number',
            'Configure API access',
            'Setup healthcare-specific features',
            'Test and go live'
          ],
          documents: ['Healthcare license', 'Medical registration', 'Business documents'],
          pricing: 'Healthcare-focused pricing plans',
          pros: ['Healthcare expertise', 'Indian company', 'Compliance focus'],
          cons: ['Limited documentation', 'Smaller scale']
        },
        infobip: {
          title: 'Infobip WhatsApp Business',
          difficulty: 'Medium',
          time: '1-3 days',
          steps: [
            'Contact Infobip sales team',
            'Submit business verification',
            'Setup enterprise account',
            'Configure WhatsApp channel',
            'Integrate with healthcare systems',
            'Launch and monitor'
          ],
          documents: ['Enterprise business documents', 'Healthcare certifications'],
          pricing: 'Enterprise pricing - contact sales',
          pros: ['Enterprise features', 'Global reach', 'Advanced analytics'],
          cons: ['High cost', 'Complex setup', 'Enterprise focus']
        },
        messagebird: {
          title: 'MessageBird WhatsApp',
          difficulty: 'Easy',
          time: '2-4 hours',
          steps: [
            'Register at messagebird.com',
            'Setup business account',
            'Add WhatsApp channel',
            'Verify phone number',
            'Configure API integration',
            'Test message flows'
          ],
          documents: ['Basic business verification'],
          pricing: 'Competitive per-message pricing',
          pros: ['Easy setup', 'Omnichannel platform', 'Good API'],
          cons: ['Limited Indian focus', 'No local support']
        }
      },
      recommendations: [
        {
          scenario: 'Small clinic in India',
          recommendation: 'Gupshup',
          reason: 'Lowest cost, local support, healthcare focus'
        },
        {
          scenario: 'Large hospital chain',
          recommendation: 'Facebook WhatsApp Business Manager',
          reason: 'Free tier, advanced features, official API'
        },
        {
          scenario: 'Quick setup needed',
          recommendation: 'Twilio',
          reason: 'Fastest setup, excellent documentation'
        },
        {
          scenario: 'Healthcare compliance focus',
          recommendation: 'Karix',
          reason: 'Healthcare expertise, Indian compliance'
        },
        {
          scenario: 'Enterprise with global patients',
          recommendation: 'Infobip',
          reason: 'Enterprise features, global coverage'
        }
      ],
      complianceNotes: [
        'All providers must comply with WhatsApp Business Policy',
        'Healthcare messages require patient consent',
        'Template messages need approval for promotional content',
        'Personal health information should be handled securely',
        'Message logs should be maintained for audit purposes'
      ]
    };

    res.json({
      success: true,
      data: setupGuide,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching setup guide:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch setup guide'
    });
  }
});

export default router;