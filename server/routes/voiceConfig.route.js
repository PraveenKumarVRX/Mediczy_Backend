/**
 * Voice Call Configuration Routes
 * API endpoints for managing voice call providers and settings
 */

import { Router } from 'express';
import voiceCallService from '../services/voiceCall.service.js';
import { authUser, requireRole } from '../middleware/auth.middleware.js';

const router = Router();

// Simple validation middleware for voice config
const validateVoiceConfig = (req, res, next) => {
  const { provider, settings, providers } = req.body;
  
  // Basic validation
  if (!provider && !settings && !providers) {
    return res.status(400).json({
      success: false,
      message: 'At least one of provider, settings, or providers must be specified'
    });
  }

  // Validate provider if specified
  if (provider && !['twilio', 'exotel', 'knowlarity', 'ozonetel', 'airtel_iq', 'jio_platforms'].includes(provider)) {
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
 * GET /api/voice-config
 * Get current voice call configuration
 */
router.get('/', requireRole('admin'), (req, res) => {
  try {
    const config = voiceCallService.getConfig();
    res.json({
      success: true,
      data: {
        ...config,
        recommendedForIndia: [
          {
            provider: 'exotel',
            reason: 'Local presence, regulatory compliance, cost-effective',
            priority: 1
          },
          {
            provider: 'knowlarity',
            reason: 'Healthcare-focused features, CRM integration',
            priority: 2
          },
          {
            provider: 'ozonetel',
            reason: 'Medical platform specialization',
            priority: 3
          }
        ]
      }
    });
  } catch (error) {
    console.error('Error fetching voice config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch voice call configuration'
    });
  }
});

/**
 * PUT /api/voice-config
 * Update voice call configuration
 */
router.put('/', requireRole('admin'), validateVoiceConfig, (req, res) => {
  try {
    const result = voiceCallService.updateConfig(req.body);
    res.json({
      success: true,
      message: 'Voice call configuration updated successfully',
      data: result
    });
  } catch (error) {
    console.error('Error updating voice config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update voice call configuration',
      error: error.message
    });
  }
});

/**
 * GET /api/voice-config/providers
 * Get all available voice call providers with India-specific info
 */
router.get('/providers', requireRole('admin'), (req, res) => {
  try {
    const config = voiceCallService.getConfig();
    
    const providersWithIndianInfo = config.providers.map(provider => ({
      ...provider,
      indianSupport: {
        localPresence: ['exotel', 'knowlarity', 'ozonetel', 'airtel_iq'].includes(provider.id),
        traiCompliance: true,
        localNumbers: provider.id !== 'jio_platforms',
        customerSupport: provider.id !== 'jio_platforms' ? '24/7' : 'Limited',
        setupTime: {
          exotel: '1-2 days',
          knowlarity: '2-3 days', 
          ozonetel: '1-3 days',
          twilio: 'Immediate',
          airtel_iq: '3-7 days',
          jio_platforms: 'Not available'
        }[provider.id],
        documentation: {
          exotel: 'Excellent - Hindi & English',
          knowlarity: 'Good - Healthcare focused',
          ozonetel: 'Good - Medical specialization',
          twilio: 'Excellent - Global standard',
          airtel_iq: 'Limited - Enterprise only',
          jio_platforms: 'Not available'
        }[provider.id]
      }
    }));

    res.json({
      success: true,
      data: providersWithIndianInfo,
      indianMarketInsights: {
        totalProviders: providersWithIndianInfo.length,
        recommendedProviders: 3,
        averageSetupTime: '2-4 days',
        regulatoryCompliance: 'TRAI & DoT compliant',
        costRange: '₹1500-5000/month for healthcare use'
      }
    });
  } catch (error) {
    console.error('Error fetching providers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch voice call providers'
    });
  }
});

/**
 * POST /api/voice-config/test/:provider
 * Test connection to specific provider
 */
router.post('/test/:provider', requireRole('admin'), async (req, res) => {
  try {
    const { provider } = req.params;
    const result = await voiceCallService.testProvider(provider);
    
    res.json({
      success: result.success,
      provider,
      message: result.message,
      data: {
        localPresence: result.localPresence,
        estimatedCost: result.estimatedCost,
        indianCompliance: true,
        testTimestamp: new Date().toISOString()
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
 * POST /api/voice-config/call
 * Initiate a voice call
 */
router.post('/call', async (req, res) => {
  try {
    const { to, from, doctorId, patientId, appointmentId, purpose } = req.body;

    if (!to || !from) {
      return res.status(400).json({
        success: false,
        message: 'Both "to" and "from" phone numbers are required'
      });
    }

    // Validate Indian phone number format
    const indianPhoneRegex = /^(\+91|91)?[6-9]\d{9}$/;
    if (!indianPhoneRegex.test(to.replace(/\s+/g, ''))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Indian phone number format. Use +91XXXXXXXXXX or 10-digit format'
      });
    }

    const call = await voiceCallService.makeCall({
      to,
      from,
      doctorId: doctorId || req.user.id,
      patientId,
      appointmentId,
      purpose: purpose || 'consultation'
    });

    res.json({
      success: true,
      message: 'Voice call initiated successfully',
      data: {
        callId: call.id,
        status: call.status,
        provider: call.provider,
        to: call.to,
        createdAt: call.createdAt,
        estimatedCost: call.provider === 'exotel' ? '₹1-3 per minute' : 
                      call.provider === 'twilio' ? '₹0.50-2 per minute' : 
                      'Contact provider for pricing'
      }
    });
  } catch (error) {
    console.error('Error initiating call:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initiate voice call',
      error: error.message
    });
  }
});

/**
 * GET /api/voice-config/stats
 * Get voice call statistics and analytics
 */
router.get('/stats', (req, res) => {
  try {
    const stats = voiceCallService.getStats();
    
    res.json({
      success: true,
      data: {
        ...stats,
        indianMetrics: {
          traiCompliance: stats.indianCompliance?.trai || false,
          dotCompliance: stats.indianCompliance?.dot || false,
          dndRespected: stats.indianCompliance?.enableDND || false,
          multiLanguageSupport: true,
          localProviderUsage: Object.keys(stats.callsByProvider)
            .filter(provider => ['exotel', 'knowlarity', 'ozonetel', 'airtel_iq'].includes(provider))
            .reduce((acc, provider) => acc + stats.callsByProvider[provider], 0)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch voice call statistics'
    });
  }
});

/**
 * GET /api/voice-config/logs
 * Get voice call logs with filtering
 */
router.get('/logs', (req, res) => {
  try {
    const { provider, status, limit = 50 } = req.query;
    
    const logs = voiceCallService.getLogs({
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
      message: 'Failed to fetch voice call logs'
    });
  }
});

/**
 * GET /api/voice-config/indian-setup-guide
 * Get setup guide for Indian voice call providers
 */
router.get('/indian-setup-guide', requireRole('admin'), (req, res) => {
  try {
    const setupGuide = {
      generalRequirements: {
        businessRegistration: 'Valid Indian business registration',
        gstNumber: 'GST number for billing',
        kycDocuments: 'KYC documents for telecom compliance',
        bankAccount: 'Indian bank account for payments'
      },
      providerSetup: {
        exotel: {
          steps: [
            'Register at exotel.com',
            'Submit business documents',
            'Choose virtual number (1-2 days)',
            'Configure webhooks and APIs',
            'Test calls and integration'
          ],
          documents: ['Business certificate', 'GST certificate', 'Address proof'],
          pricing: 'Plans from ₹2000/month',
          setupTime: '1-2 business days'
        },
        knowlarity: {
          steps: [
            'Register at knowlarity.com',
            'Submit healthcare business proof',
            'Choose cloud telephony plan',
            'Setup CRM integration',
            'Configure call routing'
          ],
          documents: ['Healthcare license', 'Business registration', 'GST number'],
          pricing: 'Plans from ₹1500/month',
          setupTime: '2-3 business days'
        },
        ozonetel: {
          steps: [
            'Contact Ozonetel for healthcare plans',
            'Submit medical business documents',
            'Setup KooKoo platform access',
            'Configure medical workflows',
            'Test healthcare-specific features'
          ],
          documents: ['Medical license', 'Healthcare registration'],
          pricing: 'Healthcare-focused pricing',
          setupTime: '1-3 business days'
        },
        twilio: {
          steps: [
            'Register at twilio.com',
            'Verify Indian phone number',
            'Purchase Indian phone number',
            'Setup webhook URLs',
            'Test voice calls'
          ],
          documents: ['Business verification for phone numbers'],
          pricing: '₹0.50-2.00 per minute',
          setupTime: 'Immediate'
        }
      },
      regulatoryNotes: [
        'All providers must comply with TRAI regulations',
        'DND (Do Not Disturb) registry must be respected',
        'Call recording requires patient consent',
        'International calling may need additional permissions'
      ],
      recommendations: [
        'Start with Exotel for best Indian market fit',
        'Use Knowlarity for advanced healthcare features',
        'Consider Ozonetel for specialized medical workflows',
        'Twilio for international patient base'
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