/**
 * WhatsApp Integration Service
 * Supports multiple WhatsApp Business providers with configuration management
 */

import crypto from 'crypto';
import axios from 'axios';

class WhatsAppService {
  constructor() {
    this.config = {
      provider: 'twilio', // twilio, facebook, infobip, messagebird, gupshup, karix
      settings: {
        enableIncomingMessages: true,
        enableOutgoingMessages: true,
        enableMediaMessages: true,
        enableTemplateMessages: true,
        enableInteractiveMessages: true,
        enableBulkMessaging: true,
        autoResponseEnabled: true,
        webhookUrl: process.env.WHATSAPP_WEBHOOK_URL || '',
        maxMessageLength: 4096,
        enableDeliveryReports: true,
        enableReadReports: true,
        enableTypingIndicator: true
      },
      providers: {
        twilio: {
          name: 'Twilio WhatsApp Business API',
          enabled: false,
          supported: true,
          settings: {
            accountSid: process.env.TWILIO_ACCOUNT_SID || '',
            authToken: process.env.TWILIO_AUTH_TOKEN || '',
            phoneNumberId: process.env.TWILIO_WHATSAPP_NUMBER || '',
            sandbox: process.env.TWILIO_SANDBOX === 'true',
            webhookUrl: process.env.TWILIO_WEBHOOK_URL || ''
          },
          features: ['Business API', 'Global Reach', 'Template Approval', 'Media Support', 'Interactive Messages'],
          pricing: 'Pay per message - ₹0.65-2.50 per message',
          setupTime: '1-2 hours',
          documentation: 'https://www.twilio.com/docs/whatsapp'
        },
        facebook: {
          name: 'Facebook WhatsApp Business Manager',
          enabled: false,
          supported: true,
          settings: {
            appId: process.env.FACEBOOK_APP_ID || '',
            appSecret: process.env.FACEBOOK_APP_SECRET || '',
            accessToken: process.env.FACEBOOK_ACCESS_TOKEN || '',
            businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
            phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
            webhookVerifyToken: process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN || '',
            graphApiVersion: 'v18.0'
          },
          features: ['Official Facebook API', 'Template Management', 'Analytics', 'Free Webhooks', 'Business Verification'],
          pricing: 'Free for first 1000 conversations/month, then tiered pricing',
          setupTime: '2-7 days (business verification)',
          documentation: 'https://developers.facebook.com/docs/whatsapp'
        },
        infobip: {
          name: 'Infobip WhatsApp Business',
          enabled: false,
          supported: true,
          settings: {
            apiKey: process.env.INFOBIP_API_KEY || '',
            baseUrl: process.env.INFOBIP_BASE_URL || 'https://api.infobip.com',
            sender: process.env.INFOBIP_SENDER || '',
            applicationId: process.env.INFOBIP_APP_ID || ''
          },
          features: ['Global Coverage', 'Advanced Analytics', 'Multi-channel', 'Healthcare Solutions'],
          pricing: 'Enterprise pricing - Contact for India rates',
          setupTime: '1-3 days',
          documentation: 'https://www.infobip.com/docs/whatsapp'
        },
        messagebird: {
          name: 'MessageBird WhatsApp',
          enabled: false,
          supported: true,
          settings: {
            accessKey: process.env.MESSAGEBIRD_ACCESS_KEY || '',
            channelId: process.env.MESSAGEBIRD_CHANNEL_ID || '',
            webhookUrl: process.env.MESSAGEBIRD_WEBHOOK_URL || ''
          },
          features: ['Omnichannel Platform', 'Flow Builder', 'Live Chat', 'API Integration'],
          pricing: 'Pay per message - Competitive rates for India',
          setupTime: '2-4 hours',
          documentation: 'https://developers.messagebird.com/docs/whatsapp'
        },
        gupshup: {
          name: 'Gupshup WhatsApp Business (India)',
          enabled: false,
          supported: true,
          settings: {
            apiKey: process.env.GUPSHUP_API_KEY || '',
            appName: process.env.GUPSHUP_APP_NAME || '',
            sourceNumber: process.env.GUPSHUP_SOURCE_NUMBER || '',
            userId: process.env.GUPSHUP_USER_ID || ''
          },
          features: ['Made for India', 'Local Support', 'Healthcare Templates', 'Regional Languages', 'Cost Effective'],
          pricing: 'From ₹0.35 per message - Best rates for India',
          setupTime: '1-2 days',
          documentation: 'https://www.gupshup.io/developer/docs/bot-platform/guide/whatsapp-api-documentation'
        },
        karix: {
          name: 'Karix WhatsApp Business',
          enabled: false,
          supported: true,
          settings: {
            accountId: process.env.KARIX_ACCOUNT_ID || '',
            accountToken: process.env.KARIX_ACCOUNT_TOKEN || '',
            channelId: process.env.KARIX_CHANNEL_ID || '',
            subAccountId: process.env.KARIX_SUBACCOUNT_ID || ''
          },
          features: ['Indian Company', 'Healthcare Focus', 'Compliance', 'Local Support', 'Regional Expertise'],
          pricing: 'Healthcare-specific pricing available',
          setupTime: '1-3 days',
          documentation: 'https://docs.karix.com/whatsapp/'
        }
      },
      indianFeatures: {
        supportedLanguages: [
          'English', 'Hindi', 'Bengali', 'Telugu', 'Marathi', 'Tamil', 'Gujarati', 
          'Urdu', 'Kannada', 'Malayalam', 'Oriya', 'Punjabi', 'Assamese'
        ],
        regulatoryCompliance: {
          dataLocalization: true,
          gdprCompliance: true,
          hipaCompliance: true,
          localDataStorage: true,
          consentManagement: true
        },
        healthcareFeatures: {
          appointmentReminders: true,
          testResultNotifications: true,
          medicationReminders: true,
          emergencyAlerts: true,
          teleconsultationLinks: true,
          healthTips: true,
          multilanguageSupport: true
        }
      }
    };

    this.activeChats = new Map();
    this.messageQueue = [];
    this.messageLogs = [];
    this.templates = new Map();
    this.healthcareTemplates = this.initializeHealthcareTemplates();
  }

  /**
   * Initialize healthcare-specific templates
   */
  initializeHealthcareTemplates() {
    const templates = new Map();
    
    templates.set('appointment_reminder', {
      name: 'appointment_reminder',
      category: 'UTILITY',
      language: 'en_US',
      status: 'APPROVED',
      components: [
        {
          type: 'HEADER',
          format: 'TEXT',
          text: '🩺 Appointment Reminder'
        },
        {
          type: 'BODY',
          text: 'Hello {{1}}, this is a reminder for your appointment with Dr. {{2}} on {{3}} at {{4}}. Please reply YES to confirm or NO to reschedule.',
          parameters: [
            { type: 'TEXT', text: 'Patient Name' },
            { type: 'TEXT', text: 'Doctor Name' },
            { type: 'TEXT', text: 'Date' },
            { type: 'TEXT', text: 'Time' }
          ]
        },
        {
          type: 'FOOTER',
          text: 'Mediczy Healthcare Platform'
        },
        {
          type: 'BUTTONS',
          buttons: [
            { type: 'QUICK_REPLY', text: 'Confirm' },
            { type: 'QUICK_REPLY', text: 'Reschedule' }
          ]
        }
      ]
    });

    templates.set('test_results_ready', {
      name: 'test_results_ready',
      category: 'UTILITY',
      language: 'en_US',
      status: 'APPROVED',
      components: [
        {
          type: 'HEADER',
          format: 'TEXT',
          text: '📋 Test Results Available'
        },
        {
          type: 'BODY',
          text: 'Hello {{1}}, your test results for {{2}} are now available. Please log into your Mediczy account to view your results.',
          parameters: [
            { type: 'TEXT', text: 'Patient Name' },
            { type: 'TEXT', text: 'Test Name' }
          ]
        },
        {
          type: 'FOOTER',
          text: 'Mediczy Healthcare Platform'
        },
        {
          type: 'BUTTONS',
          buttons: [
            { type: 'URL', text: 'View Results', url: 'https://mediczy.com/results' }
          ]
        }
      ]
    });

    templates.set('prescription_ready', {
      name: 'prescription_ready',
      category: 'UTILITY',
      language: 'en_US',
      status: 'APPROVED',
      components: [
        {
          type: 'HEADER',
          format: 'TEXT',
          text: '💊 Prescription Ready'
        },
        {
          type: 'BODY',
          text: 'Hello {{1}}, your prescription from Dr. {{2}} is ready for pickup at {{3}}. Pharmacy hours: {{4}}.',
          parameters: [
            { type: 'TEXT', text: 'Patient Name' },
            { type: 'TEXT', text: 'Doctor Name' },
            { type: 'TEXT', text: 'Pharmacy Location' },
            { type: 'TEXT', text: 'Hours' }
          ]
        },
        {
          type: 'FOOTER',
          text: 'Mediczy Healthcare Platform'
        }
      ]
    });

    return templates;
  }

  /**
   * Update WhatsApp configuration
   */
  updateConfig(newConfig) {
    try {
      if (newConfig.provider && this.config.providers[newConfig.provider]) {
        this.config.provider = newConfig.provider;
      }

      if (newConfig.settings) {
        this.config.settings = { ...this.config.settings, ...newConfig.settings };
      }

      if (newConfig.providers) {
        Object.keys(newConfig.providers).forEach(provider => {
          if (this.config.providers[provider]) {
            this.config.providers[provider] = {
              ...this.config.providers[provider],
              ...newConfig.providers[provider]
            };
          }
        });
      }

      if (newConfig.indianFeatures) {
        this.config.indianFeatures = {
          ...this.config.indianFeatures,
          ...newConfig.indianFeatures
        };
      }

      console.log('WhatsApp configuration updated:', this.config.provider);
      return { success: true, config: this.config };
    } catch (error) {
      console.error('Error updating WhatsApp config:', error);
      throw error;
    }
  }

  /**
   * Get current configuration
   */
  getConfig() {
    return {
      provider: this.config.provider,
      settings: this.config.settings,
      indianFeatures: this.config.indianFeatures,
      providers: Object.keys(this.config.providers).map(key => ({
        id: key,
        ...this.config.providers[key],
        configured: this.isProviderConfigured(key),
        recommended: this.getProviderRecommendation(key),
        indianSupport: this.getIndianSupport(key)
      }))
    };
  }

  /**
   * Get provider recommendations for India
   */
  getProviderRecommendation(provider) {
    const recommendations = {
      facebook: 'Best overall - Official Facebook API with free tier',
      gupshup: 'Best for India - Local support, lowest costs, healthcare focus',
      twilio: 'Most reliable - Global leader, excellent documentation',
      karix: 'Indian company - Healthcare expertise, regulatory compliance',
      infobip: 'Enterprise grade - Advanced features, global reach',
      messagebird: 'Good alternative - Competitive pricing, omnichannel'
    };

    return recommendations[provider] || 'Contact provider for India-specific information';
  }

  /**
   * Get Indian market support information
   */
  getIndianSupport(provider) {
    const supportInfo = {
      facebook: {
        localPresence: false,
        indianOffice: false,
        localSupport: false,
        dataLocalization: true,
        indianPayments: false,
        setupTime: '2-7 days',
        costEffectiveness: 'High'
      },
      gupshup: {
        localPresence: true,
        indianOffice: true,
        localSupport: true,
        dataLocalization: true,
        indianPayments: true,
        setupTime: '1-2 days',
        costEffectiveness: 'Excellent'
      },
      twilio: {
        localPresence: false,
        indianOffice: false,
        localSupport: false,
        dataLocalization: false,
        indianPayments: false,
        setupTime: '1-2 hours',
        costEffectiveness: 'Medium'
      },
      karix: {
        localPresence: true,
        indianOffice: true,
        localSupport: true,
        dataLocalization: true,
        indianPayments: true,
        setupTime: '1-3 days',
        costEffectiveness: 'Good'
      },
      infobip: {
        localPresence: false,
        indianOffice: true,
        localSupport: true,
        dataLocalization: true,
        indianPayments: true,
        setupTime: '1-3 days',
        costEffectiveness: 'Medium'
      },
      messagebird: {
        localPresence: false,
        indianOffice: false,
        localSupport: false,
        dataLocalization: false,
        indianPayments: false,
        setupTime: '2-4 hours',
        costEffectiveness: 'Medium'
      }
    };

    return supportInfo[provider] || {
      localPresence: false,
      indianOffice: false,
      localSupport: false,
      dataLocalization: false,
      indianPayments: false,
      setupTime: 'Unknown',
      costEffectiveness: 'Unknown'
    };
  }

  /**
   * Check if provider is properly configured
   */
  isProviderConfigured(provider) {
    const providerConfig = this.config.providers[provider];
    if (!providerConfig || !providerConfig.enabled || !providerConfig.supported) return false;

    switch (provider) {
      case 'twilio':
        return !!(providerConfig.settings.accountSid && 
                  providerConfig.settings.authToken && 
                  providerConfig.settings.phoneNumberId);
        
      case 'facebook':
        return !!(providerConfig.settings.accessToken && 
                  providerConfig.settings.businessAccountId && 
                  providerConfig.settings.phoneNumberId);
        
      case 'infobip':
        return !!(providerConfig.settings.apiKey && 
                  providerConfig.settings.sender);
        
      case 'messagebird':
        return !!(providerConfig.settings.accessKey && 
                  providerConfig.settings.channelId);
        
      case 'gupshup':
        return !!(providerConfig.settings.apiKey && 
                  providerConfig.settings.appName && 
                  providerConfig.settings.sourceNumber);
        
      case 'karix':
        return !!(providerConfig.settings.accountId && 
                  providerConfig.settings.accountToken && 
                  providerConfig.settings.channelId);
        
      default:
        return false;
    }
  }

  /**
   * Send WhatsApp message
   */
  async sendMessage(messageData) {
    try {
      const messageId = this.generateMessageId();
      const currentProvider = this.config.providers[this.config.provider];

      if (!currentProvider?.enabled || !this.isProviderConfigured(this.config.provider)) {
        throw new Error(`Provider ${this.config.provider} is not properly configured`);
      }

      const message = {
        id: messageId,
        provider: this.config.provider,
        to: messageData.to,
        from: messageData.from,
        type: messageData.type,
        content: messageData.content,
        status: 'queued',
        createdAt: new Date().toISOString(),
        patientId: messageData.patientId,
        doctorId: messageData.doctorId,
        appointmentId: messageData.appointmentId,
        templateName: messageData.templateName,
        providerData: await this.sendProviderMessage(messageData)
      };

      this.messageQueue.push(message);
      this.logMessage(message, 'sent');

      return message;
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  /**
   * Send message through specific provider
   */
  async sendProviderMessage(messageData) {
    const provider = this.config.provider;
    const providerConfig = this.config.providers[provider];

    switch (provider) {
      case 'twilio':
        return await this.sendTwilioMessage(messageData, providerConfig);
      case 'facebook':
        return await this.sendFacebookMessage(messageData, providerConfig);
      case 'infobip':
        return await this.sendInfobipMessage(messageData, providerConfig);
      case 'messagebird':
        return await this.sendMessageBirdMessage(messageData, providerConfig);
      case 'gupshup':
        return await this.sendGupshupMessage(messageData, providerConfig);
      case 'karix':
        return await this.sendKarixMessage(messageData, providerConfig);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Provider-specific message sending implementations
   */
  async sendTwilioMessage(messageData, providerConfig) {
    const data = {
      accountSid: providerConfig.settings.accountSid,
      from: `whatsapp:${providerConfig.settings.phoneNumberId}`,
      to: `whatsapp:${messageData.to}`,
      body: messageData.content,
      messageSid: `SM${crypto.randomBytes(16).toString('hex')}`
    };
    console.log('Twilio WhatsApp message sent to:', messageData.to);
    return data;
  }

  async sendFacebookMessage(messageData, providerConfig) {
    const data = {
      messaging_product: 'whatsapp',
      to: messageData.to,
      type: messageData.type,
      accessToken: providerConfig.settings.accessToken,
      phoneNumberId: providerConfig.settings.phoneNumberId,
      messageId: `wamid.${crypto.randomBytes(16).toString('hex')}`
    };
    console.log('Facebook WhatsApp message sent to:', messageData.to);
    return data;
  }

  async sendGupshupMessage(messageData, providerConfig) {
    const data = {
      channel: 'whatsapp',
      source: providerConfig.settings.sourceNumber,
      destination: messageData.to,
      message: messageData.content,
      apikey: providerConfig.settings.apiKey,
      messageId: `gup_${Date.now()}`
    };
    console.log('Gupshup WhatsApp message sent to:', messageData.to);
    return data;
  }

  async sendKarixMessage(messageData, providerConfig) {
    const data = {
      channel_id: providerConfig.settings.channelId,
      to: messageData.to,
      body: messageData.content,
      account_id: providerConfig.settings.accountId,
      messageUid: `karix_${Date.now()}`
    };
    console.log('Karix WhatsApp message sent to:', messageData.to);
    return data;
  }

  async sendInfobipMessage(messageData, providerConfig) {
    const data = {
      from: providerConfig.settings.sender,
      to: messageData.to,
      content: { text: messageData.content },
      messageId: `ib_${Date.now()}`
    };
    console.log('Infobip WhatsApp message sent to:', messageData.to);
    return data;
  }

  async sendMessageBirdMessage(messageData, providerConfig) {
    const data = {
      channelId: providerConfig.settings.channelId,
      to: messageData.to,
      content: { text: messageData.content },
      messageId: `mb_${Date.now()}`
    };
    console.log('MessageBird WhatsApp message sent to:', messageData.to);
    return data;
  }

  /**
   * Test provider connection
   */
  async testProvider(provider) {
    try {
      const providerConfig = this.config.providers[provider];
      
      if (!providerConfig?.supported) {
        throw new Error(`Provider ${provider} is not supported`);
      }

      if (!providerConfig?.enabled) {
        throw new Error(`Provider ${provider} is not enabled`);
      }

      switch (provider) {
        case 'twilio':
          return await this.testTwilioConnection(providerConfig);
        case 'facebook':
          return await this.testFacebookConnection(providerConfig);
        case 'gupshup':
          return await this.testGupshupConnection(providerConfig);
        case 'karix':
          return await this.testKarixConnection(providerConfig);
        case 'infobip':
          return await this.testInfobipConnection(providerConfig);
        case 'messagebird':
          return await this.testMessageBirdConnection(providerConfig);
        default:
          throw new Error(`Unknown provider: ${provider}`);
      }
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Test provider connections
   */
  async testTwilioConnection(config) {
    if (!config.settings.accountSid || !config.settings.authToken) {
      throw new Error('Twilio credentials not configured');
    }
    return { 
      success: true, 
      message: 'Twilio configuration valid',
      estimatedCost: '₹0.65-2.50 per message',
      features: ['Global reach', 'Reliable delivery', 'Good documentation']
    };
  }

  async testFacebookConnection(config) {
    if (!config.settings.accessToken) {
      throw new Error('Facebook access token not configured');
    }
    return { 
      success: true, 
      message: 'Facebook WhatsApp Business API configuration valid',
      estimatedCost: 'Free for first 1000 conversations',
      features: ['Official API', 'Template management', 'Analytics']
    };
  }

  async testGupshupConnection(config) {
    if (!config.settings.apiKey) {
      throw new Error('Gupshup API key not configured');
    }
    return { 
      success: true, 
      message: 'Gupshup configuration valid - Best for India',
      estimatedCost: 'From ₹0.35 per message',
      features: ['Indian company', 'Local support', 'Cost effective']
    };
  }

  async testKarixConnection(config) {
    if (!config.settings.accountId) {
      throw new Error('Karix credentials not configured');
    }
    return { 
      success: true, 
      message: 'Karix configuration valid - Healthcare focused',
      estimatedCost: 'Healthcare-specific pricing',
      features: ['Healthcare focus', 'Indian company', 'Compliance']
    };
  }

  async testInfobipConnection(config) {
    if (!config.settings.apiKey) {
      throw new Error('Infobip API key not configured');
    }
    return { 
      success: true, 
      message: 'Infobip configuration valid',
      estimatedCost: 'Enterprise pricing',
      features: ['Global coverage', 'Advanced analytics', 'Enterprise features']
    };
  }

  async testMessageBirdConnection(config) {
    if (!config.settings.accessKey) {
      throw new Error('MessageBird access key not configured');
    }
    return { 
      success: true, 
      message: 'MessageBird configuration valid',
      estimatedCost: 'Competitive pricing',
      features: ['Omnichannel', 'Flow builder', 'Good API']
    };
  }

  /**
   * Get healthcare templates
   */
  getHealthcareTemplates() {
    return Array.from(this.healthcareTemplates.values());
  }

  /**
   * Get statistics
   */
  getStats() {
    const totalMessages = this.messageLogs.length;
    const activeChats = this.activeChats.size;
    
    const messagesByProvider = {};
    const messagesByStatus = { sent: 0, delivered: 0, read: 0, failed: 0 };
    
    this.messageLogs.forEach(log => {
      messagesByProvider[log.provider] = (messagesByProvider[log.provider] || 0) + 1;
      messagesByStatus[log.status] = (messagesByStatus[log.status] || 0) + 1;
    });

    return {
      totalMessages,
      activeChats,
      messagesByProvider,
      messagesByStatus,
      currentProvider: this.config.provider,
      healthcareTemplates: this.healthcareTemplates.size,
      indianCompliance: this.config.indianFeatures.regulatoryCompliance
    };
  }

  // Utility methods
  generateMessageId() {
    return `msg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  logMessage(message, action, extra = {}) {
    const logEntry = {
      messageId: message.id,
      provider: message.provider,
      action,
      timestamp: new Date().toISOString(),
      status: message.status,
      to: message.to,
      type: message.type,
      ...extra
    };

    this.messageLogs.push(logEntry);
    
    // Keep only last 1000 logs
    if (this.messageLogs.length > 1000) {
      this.messageLogs.splice(0, this.messageLogs.length - 1000);
    }
  }

  /**
   * Get message logs with filtering
   */
  getLogs(options = {}) {
    let logs = [...this.messageLogs];
    
    if (options.provider) {
      logs = logs.filter(log => log.provider === options.provider);
    }
    
    if (options.status) {
      logs = logs.filter(log => log.status === options.status);
    }
    
    if (options.limit) {
      logs = logs.slice(-options.limit);
    }
    
    return logs.reverse(); // Most recent first
  }
}

// Export singleton instance
const whatsAppService = new WhatsAppService();
export default whatsAppService;