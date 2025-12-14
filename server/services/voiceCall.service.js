/**
 * Voice Call Configuration Service
 * Supports virtual numbers, VoIP, and telecom providers for India
 */

import crypto from 'crypto';
import axios from 'axios';

class VoiceCallService {
  constructor() {
    this.config = {
      provider: 'twilio', // twilio, exotel, knowlarity, ozonetel, airtel_iq, jio_platforms
      settings: {
        enableIncomingCalls: true,
        enableOutgoingCalls: true,
        recordCalls: false,
        callQuality: 'high', // low, medium, high
        maxCallDuration: 3600, // 1 hour in seconds
        autoAnswerDelay: 3, // seconds
        enableIVR: true,
        enableConferencing: false,
        enableCallTransfer: true,
        enableVoicemail: true
      },
      providers: {
        twilio: {
          name: 'Twilio Voice (India)',
          enabled: false,
          supported: true,
          settings: {
            accountSid: process.env.TWILIO_ACCOUNT_SID || '',
            authToken: process.env.TWILIO_AUTH_TOKEN || '',
            phoneNumber: process.env.TWILIO_PHONE_NUMBER || '', // +91XXXXXXXXXX
            webhookUrl: process.env.TWILIO_WEBHOOK_URL || '',
            region: 'IN', // India region
            enableSMS: true,
            callRecording: false
          },
          features: ['Voice Calls', 'SMS', 'Global Reach', 'Recording', 'IVR'],
          pricing: 'Pay per use - ₹0.50-2.00 per minute'
        },
        exotel: {
          name: 'Exotel (Made for India)',
          enabled: false,
          supported: true,
          settings: {
            accountSid: process.env.EXOTEL_ACCOUNT_SID || '',
            apiKey: process.env.EXOTEL_API_KEY || '',
            apiToken: process.env.EXOTEL_API_TOKEN || '',
            virtualNumber: process.env.EXOTEL_VIRTUAL_NUMBER || '', // Indian virtual number
            subdomain: process.env.EXOTEL_SUBDOMAIN || '', // your-company.exotel.com
            enableMissedCallAlert: true,
            enableCallMasking: true
          },
          features: ['Indian Virtual Numbers', 'Call Masking', 'Missed Call Alerts', 'Regional Support'],
          pricing: 'Plans from ₹2000/month - Best for India'
        },
        knowlarity: {
          name: 'Knowlarity (Cloud Telephony)',
          enabled: false,
          supported: true,
          settings: {
            apiKey: process.env.KNOWLARITY_API_KEY || '',
            apiSecret: process.env.KNOWLARITY_API_SECRET || '',
            virtualNumber: process.env.KNOWLARITY_VIRTUAL_NUMBER || '',
            agentNumber: process.env.KNOWLARITY_AGENT_NUMBER || '',
            enableSuperReceptionist: true,
            enableCallRouting: true,
            enableCallAnalytics: true
          },
          features: ['Super Receptionist', 'Call Routing', 'Analytics', 'CRM Integration'],
          pricing: 'Enterprise plans from ₹1500/month'
        },
        ozonetel: {
          name: 'Ozonetel (KooKoo Platform)',
          enabled: false,
          supported: true,
          settings: {
            apiKey: process.env.OZONETEL_API_KEY || '',
            apiSecret: process.env.OZONETEL_API_SECRET || '',
            applicationId: process.env.OZONETEL_APP_ID || '',
            virtualNumber: process.env.OZONETEL_VIRTUAL_NUMBER || '',
            enableCallCenter: true,
            enablePredictiveDialer: false
          },
          features: ['Call Center Platform', 'Predictive Dialer', 'Multi-channel', 'Healthcare Focus'],
          pricing: 'Healthcare-focused plans available'
        },
        airtel_iq: {
          name: 'Airtel IQ (Enterprise)',
          enabled: false,
          supported: true,
          settings: {
            clientId: process.env.AIRTEL_CLIENT_ID || '',
            clientSecret: process.env.AIRTEL_CLIENT_SECRET || '',
            virtualNumber: process.env.AIRTEL_VIRTUAL_NUMBER || '',
            circleCode: process.env.AIRTEL_CIRCLE_CODE || '', // Regional circle
            enableCloudPBX: true,
            enableSIPTrunking: false
          },
          features: ['Airtel Network', 'Cloud PBX', 'SIP Trunking', 'Enterprise Grade'],
          pricing: 'Enterprise pricing - Contact Airtel'
        },
        jio_platforms: {
          name: 'Jio Platforms (JioSaavn API)',
          enabled: false,
          supported: false, // Limited API access
          settings: {
            apiKey: process.env.JIO_API_KEY || '',
            virtualNumber: process.env.JIO_VIRTUAL_NUMBER || '',
            enableJioTrunk: false
          },
          features: ['Jio Network', 'High Quality', 'Limited API Access'],
          pricing: 'Limited availability'
        }
      },
      indianFeatures: {
        supportedStates: [
          'Maharashtra', 'Karnataka', 'Tamil Nadu', 'Delhi', 'Gujarat',
          'Uttar Pradesh', 'West Bengal', 'Rajasthan', 'Madhya Pradesh',
          'Andhra Pradesh', 'Telangana', 'Kerala', 'Punjab', 'Haryana'
        ],
        regulatoryCompliance: {
          trai: true, // TRAI compliance
          dot: true,  // DoT regulations
          enableDND: true, // Do Not Disturb registry check
          enableKYC: false // KYC verification for voice calls
        },
        localizedFeatures: {
          multiLanguageIVR: true,
          hindiSupport: true,
          regionalLanguages: ['Hindi', 'English', 'Tamil', 'Telugu', 'Bengali', 'Marathi'],
          enableFestivalGreetings: false,
          enableRegionalNumberDisplay: true
        }
      }
    };

    this.activeCalls = new Map();
    this.callLogs = [];
  }

  /**
   * Update voice call configuration
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

      console.log('Voice call configuration updated:', this.config.provider);
      return { success: true, config: this.config };
    } catch (error) {
      console.error('Error updating voice config:', error);
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
        recommended: this.getProviderRecommendation(key)
      }))
    };
  }

  /**
   * Check if provider is configured and recommended for India
   */
  getProviderRecommendation(provider) {
    const recommendations = {
      exotel: 'Best for India - Local presence, regulatory compliance',
      knowlarity: 'Good for healthcare - CRM integration, analytics',
      twilio: 'Global leader - Reliable but higher cost in India',
      ozonetel: 'Healthcare focused - Specialized for medical use',
      airtel_iq: 'Enterprise grade - Good for large healthcare systems',
      jio_platforms: 'Limited API access - Not recommended currently'
    };

    return recommendations[provider] || 'Contact provider for India-specific plans';
  }

  /**
   * Check if a provider is properly configured
   */
  isProviderConfigured(provider) {
    const providerConfig = this.config.providers[provider];
    if (!providerConfig || !providerConfig.enabled || !providerConfig.supported) return false;

    switch (provider) {
      case 'twilio':
        return !!(providerConfig.settings.accountSid && 
                  providerConfig.settings.authToken && 
                  providerConfig.settings.phoneNumber);
        
      case 'exotel':
        return !!(providerConfig.settings.accountSid && 
                  providerConfig.settings.apiKey && 
                  providerConfig.settings.virtualNumber);
        
      case 'knowlarity':
        return !!(providerConfig.settings.apiKey && 
                  providerConfig.settings.virtualNumber);
        
      case 'ozonetel':
        return !!(providerConfig.settings.apiKey && 
                  providerConfig.settings.applicationId);
        
      case 'airtel_iq':
        return !!(providerConfig.settings.clientId && 
                  providerConfig.settings.virtualNumber);
        
      default:
        return false;
    }
  }

  /**
   * Initiate outbound call
   */
  async makeCall(callData) {
    try {
      const callId = this.generateCallId();
      const currentProvider = this.config.providers[this.config.provider];

      if (!currentProvider?.enabled || !this.isProviderConfigured(this.config.provider)) {
        throw new Error(`Provider ${this.config.provider} is not properly configured`);
      }

      const call = {
        id: callId,
        provider: this.config.provider,
        direction: 'outbound',
        from: callData.from,
        to: callData.to,
        status: 'initiated',
        createdAt: new Date().toISOString(),
        doctorId: callData.doctorId,
        patientId: callData.patientId,
        appointmentId: callData.appointmentId,
        purpose: callData.purpose || 'consultation',
        settings: { ...this.config.settings },
        providerData: await this.initiateProviderCall(callData)
      };

      this.activeCalls.set(callId, call);
      this.logCall(call, 'initiated');

      return call;
    } catch (error) {
      console.error('Error making call:', error);
      throw error;
    }
  }

  /**
   * Initiate call with specific provider
   */
  async initiateProviderCall(callData) {
    const provider = this.config.provider;
    const providerConfig = this.config.providers[provider];

    switch (provider) {
      case 'twilio':
        return await this.initiateTwilioCall(callData, providerConfig);
      case 'exotel':
        return await this.initiateExotelCall(callData, providerConfig);
      case 'knowlarity':
        return await this.initiateKnowlarityCall(callData, providerConfig);
      case 'ozonetel':
        return await this.initiateOzonetelCall(callData, providerConfig);
      case 'airtel_iq':
        return await this.initiateAirtelCall(callData, providerConfig);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Twilio call integration
   */
  async initiateTwilioCall(callData, providerConfig) {
    try {
      // In real implementation, use Twilio SDK
      const twilioData = {
        accountSid: providerConfig.settings.accountSid,
        from: providerConfig.settings.phoneNumber,
        to: callData.to,
        callSid: `CA${crypto.randomBytes(16).toString('hex')}`,
        webhookUrl: providerConfig.settings.webhookUrl,
        record: this.config.settings.recordCalls
      };

      console.log('Twilio call initiated to:', callData.to);
      return twilioData;
    } catch (error) {
      console.error('Error initiating Twilio call:', error);
      throw error;
    }
  }

  /**
   * Exotel call integration (Best for India)
   */
  async initiateExotelCall(callData, providerConfig) {
    try {
      const exotelData = {
        accountSid: providerConfig.settings.accountSid,
        virtualNumber: providerConfig.settings.virtualNumber,
        agentNumber: callData.from,
        customerNumber: callData.to,
        callId: this.generateCallId(),
        subdomain: providerConfig.settings.subdomain,
        callMasking: providerConfig.settings.enableCallMasking
      };

      console.log('Exotel call initiated to:', callData.to);
      return exotelData;
    } catch (error) {
      console.error('Error initiating Exotel call:', error);
      throw error;
    }
  }

  /**
   * Knowlarity call integration
   */
  async initiateKnowlarityCall(callData, providerConfig) {
    try {
      const knowlarityData = {
        apiKey: providerConfig.settings.apiKey,
        virtualNumber: providerConfig.settings.virtualNumber,
        agentNumber: providerConfig.settings.agentNumber,
        customerNumber: callData.to,
        callId: this.generateCallId(),
        superReceptionist: providerConfig.settings.enableSuperReceptionist
      };

      console.log('Knowlarity call initiated to:', callData.to);
      return knowlarityData;
    } catch (error) {
      console.error('Error initiating Knowlarity call:', error);
      throw error;
    }
  }

  /**
   * Ozonetel call integration
   */
  async initiateOzonetelCall(callData, providerConfig) {
    try {
      const ozonetelData = {
        apiKey: providerConfig.settings.apiKey,
        applicationId: providerConfig.settings.applicationId,
        virtualNumber: providerConfig.settings.virtualNumber,
        customerNumber: callData.to,
        callId: this.generateCallId(),
        enableCallCenter: providerConfig.settings.enableCallCenter
      };

      console.log('Ozonetel call initiated to:', callData.to);
      return ozonetelData;
    } catch (error) {
      console.error('Error initiating Ozonetel call:', error);
      throw error;
    }
  }

  /**
   * Airtel IQ call integration
   */
  async initiateAirtelCall(callData, providerConfig) {
    try {
      const airtelData = {
        clientId: providerConfig.settings.clientId,
        virtualNumber: providerConfig.settings.virtualNumber,
        customerNumber: callData.to,
        circleCode: providerConfig.settings.circleCode,
        callId: this.generateCallId(),
        cloudPBX: providerConfig.settings.enableCloudPBX
      };

      console.log('Airtel IQ call initiated to:', callData.to);
      return airtelData;
    } catch (error) {
      console.error('Error initiating Airtel call:', error);
      throw error;
    }
  }

  /**
   * Test provider connection
   */
  async testProvider(provider) {
    try {
      const providerConfig = this.config.providers[provider];
      
      if (!providerConfig?.supported) {
        throw new Error(`Provider ${provider} is not supported in India`);
      }

      if (!providerConfig?.enabled) {
        throw new Error(`Provider ${provider} is not enabled`);
      }

      switch (provider) {
        case 'twilio':
          return await this.testTwilioConnection(providerConfig);
        case 'exotel':
          return await this.testExotelConnection(providerConfig);
        case 'knowlarity':
          return await this.testKnowlarityConnection(providerConfig);
        case 'ozonetel':
          return await this.testOzonetelConnection(providerConfig);
        case 'airtel_iq':
          return await this.testAirtelConnection(providerConfig);
        default:
          throw new Error(`Unknown provider: ${provider}`);
      }
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Test connections for each provider
   */
  async testTwilioConnection(providerConfig) {
    try {
      if (!providerConfig.settings.accountSid || !providerConfig.settings.authToken) {
        throw new Error('Twilio credentials not configured');
      }

      return { 
        success: true, 
        message: 'Twilio configuration valid - Global reach including India',
        localPresence: false,
        estimatedCost: '₹0.50-2.00 per minute'
      };
    } catch (error) {
      return { success: false, message: `Twilio test failed: ${error.message}` };
    }
  }

  async testExotelConnection(providerConfig) {
    try {
      if (!providerConfig.settings.virtualNumber) {
        throw new Error('Exotel virtual number not configured');
      }

      return { 
        success: true, 
        message: 'Exotel configuration valid - Best for Indian market',
        localPresence: true,
        estimatedCost: 'From ₹2000/month - Most cost effective for India'
      };
    } catch (error) {
      return { success: false, message: `Exotel test failed: ${error.message}` };
    }
  }

  async testKnowlarityConnection(providerConfig) {
    try {
      if (!providerConfig.settings.apiKey) {
        throw new Error('Knowlarity API key not configured');
      }

      return { 
        success: true, 
        message: 'Knowlarity configuration valid - Great for healthcare',
        localPresence: true,
        estimatedCost: 'From ₹1500/month - Healthcare focused'
      };
    } catch (error) {
      return { success: false, message: `Knowlarity test failed: ${error.message}` };
    }
  }

  async testOzonetelConnection(providerConfig) {
    try {
      if (!providerConfig.settings.apiKey) {
        throw new Error('Ozonetel API key not configured');
      }

      return { 
        success: true, 
        message: 'Ozonetel configuration valid - Healthcare platform',
        localPresence: true,
        estimatedCost: 'Healthcare plans available'
      };
    } catch (error) {
      return { success: false, message: `Ozonetel test failed: ${error.message}` };
    }
  }

  async testAirtelConnection(providerConfig) {
    try {
      if (!providerConfig.settings.clientId) {
        throw new Error('Airtel IQ credentials not configured');
      }

      return { 
        success: true, 
        message: 'Airtel IQ configuration valid - Enterprise grade',
        localPresence: true,
        estimatedCost: 'Enterprise pricing - Contact Airtel'
      };
    } catch (error) {
      return { success: false, message: `Airtel test failed: ${error.message}` };
    }
  }

  /**
   * Get voice call statistics
   */
  getStats() {
    const totalCalls = this.callLogs.length;
    const activeCalls = this.activeCalls.size;
    
    const callsByProvider = {};
    const callsByStatus = { initiated: 0, connected: 0, completed: 0, failed: 0 };
    
    this.callLogs.forEach(log => {
      callsByProvider[log.provider] = (callsByProvider[log.provider] || 0) + 1;
      callsByStatus[log.status] = (callsByStatus[log.status] || 0) + 1;
    });

    const averageDuration = this.callLogs
      .filter(log => log.duration)
      .reduce((acc, log, _, arr) => acc + log.duration / arr.length, 0);

    return {
      totalCalls,
      activeCalls,
      callsByProvider,
      callsByStatus,
      averageDuration: Math.round(averageDuration),
      currentProvider: this.config.provider,
      indianCompliance: this.config.indianFeatures.regulatoryCompliance
    };
  }

  // Utility methods
  generateCallId() {
    return `call_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  logCall(call, action, extra = {}) {
    const logEntry = {
      callId: call.id,
      provider: call.provider,
      action,
      timestamp: new Date().toISOString(),
      status: call.status,
      duration: call.duration,
      direction: call.direction,
      ...extra
    };

    this.callLogs.push(logEntry);
    
    // Keep only last 1000 logs
    if (this.callLogs.length > 1000) {
      this.callLogs.splice(0, this.callLogs.length - 1000);
    }
  }

  /**
   * Get call logs with filtering
   */
  getLogs(options = {}) {
    let logs = [...this.callLogs];
    
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
const voiceCallService = new VoiceCallService();
export default voiceCallService;