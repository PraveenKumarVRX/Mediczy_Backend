/**
 * Video Call Configuration Service
 * Supports multiple video calling providers and configurations
 */

import crypto from 'crypto';

class VideoService {
  constructor() {
    this.config = {
      provider: 'livekit', // webrtc, livekit, jitsi, zoom, custom
      settings: {
        maxParticipants: 100, // Supports group calls and webinars (Zoom-like)
        recordingSetting: true,
        videoQuality: 'high', // low, medium, high, hd
        audioQuality: 'high', // low, medium, high
        enableScreenShare: true,
        enableFileShare: true,
        enableChat: true,
        enableWhiteboard: true,
        sessionTimeout: 7200, // 2 hours in seconds
        autoEndSession: false,
        requireAuth: true
      },
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ],
      providers: {
        webrtc: {
          name: 'WebRTC P2P',
          enabled: true,
          settings: {
            iceTransportPolicy: 'all',
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require'
          }
        },
        livekit: {
          name: 'LiveKit',
          enabled: true,
          settings: {
            serverUrl: process.env.LIVEKIT_URL || '',
            apiKey: process.env.LIVEKIT_API_KEY || '',
            apiSecret: process.env.LIVEKIT_API_SECRET || '',
            meetUrl: process.env.LIVEKIT_MEET_URL || '',
            roomPrefix: 'mediczy_',
            enableRecording: false,
            enableEgress: false
          }
        },
        jitsi: {
          name: 'Jitsi Meet',
          enabled: false,
          settings: {
            domain: process.env.JITSI_DOMAIN || 'meet.jit.si',
            roomPrefix: 'MediczY',
            enableAuth: true,
            moderatorPassword: process.env.JITSI_MODERATOR_PASSWORD || '',
            startAudioMuted: false,
            startVideoMuted: false
          }
        },
        zoom: {
          name: 'Zoom SDK',
          enabled: false,
          settings: {
            sdkKey: process.env.ZOOM_SDK_KEY || '',
            sdkSecret: process.env.ZOOM_SDK_SECRET || '',
            accountId: process.env.ZOOM_ACCOUNT_ID || '',
            clientId: process.env.ZOOM_CLIENT_ID || '',
            clientSecret: process.env.ZOOM_CLIENT_SECRET || ''
          }
        },
        agora: {
          name: 'Agora.io',
          enabled: false,
          settings: {
            appId: process.env.AGORA_APP_ID || '',
            appCertificate: process.env.AGORA_APP_CERTIFICATE || '',
            customerId: process.env.AGORA_CUSTOMER_ID || '',
            customerSecret: process.env.AGORA_CUSTOMER_SECRET || '',
            enableRecording: false,
            recordingRegion: 'US',
            videoProfile: '720p_1',
            audioProfile: 'music_standard'
          }
        },
        custom: {
          name: 'Custom Provider',
          enabled: false,
          settings: {
            apiUrl: process.env.CUSTOM_VIDEO_API_URL || '',
            apiKey: process.env.CUSTOM_VIDEO_API_KEY || '',
            webhookUrl: process.env.CUSTOM_VIDEO_WEBHOOK_URL || ''
          }
        }
      }
    };

    // Room-type specific configurations for Zoom-like multi-participant support
    this.roomTypeConfigs = {
      appointment: { maxParticipants: 2, defaultName: 'Appointment Video Call' },
      consultation: { maxParticipants: 5, defaultName: 'Medical Consultation' },
      group_consultation: { maxParticipants: 10, defaultName: 'Group Consultation' },
      webinar: { maxParticipants: 100, defaultName: 'Webinar' },
      team_meeting: { maxParticipants: 50, defaultName: 'Team Meeting' },
      classroom: { maxParticipants: 100, defaultName: 'Virtual Classroom' },
      generic: { maxParticipants: 100, defaultName: 'Video Conference' }
    };

    this.sessions = new Map(); // Active video sessions
    this.sessionLogs = []; // Session history
  }

  /**
   * Update video call configuration
   */
  updateConfig(newConfig) {
    try {
      if (newConfig.provider && this.config.providers[newConfig.provider]) {
        this.config.provider = newConfig.provider;
      }

      if (newConfig.settings) {
        this.config.settings = { ...this.config.settings, ...newConfig.settings };
      }

      if (newConfig.iceServers) {
        this.config.iceServers = newConfig.iceServers;
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

      console.log('Video configuration updated:', this.config.provider);
      return { success: true, config: this.config };
    } catch (error) {
      console.error('Error updating video config:', error);
      throw error;
    }
  }

  /**
   * Get room-type specific max participants for Zoom-like multi-participant support
   */
  getMaxParticipantsForRoom(roomType = 'generic') {
    const config = this.roomTypeConfigs[roomType] || this.roomTypeConfigs.generic;
    return config.maxParticipants;
  }

  /**
   * Get room type display name
   */
  getRoomTypeName(roomType = 'generic') {
    const config = this.roomTypeConfigs[roomType] || this.roomTypeConfigs.generic;
    return config.defaultName;
  }

  /**
   * Get current configuration
   */
  getConfig() {
    return {
      provider: this.config.provider,
      settings: this.config.settings,
      roomTypes: this.roomTypeConfigs,
      iceServers: this.config.iceServers,
      providers: Object.keys(this.config.providers).map(key => ({
        id: key,
        ...this.config.providers[key],
        configured: this.isProviderConfigured(key)
      }))
    };
  }

  /**
   * Check if a provider is properly configured
   */
  isProviderConfigured(provider) {
    const providerConfig = this.config.providers[provider];
    if (!providerConfig || !providerConfig.enabled) return false;

    switch (provider) {
      case 'webrtc':
        return true; // WebRTC is always available

      case 'livekit':
        return !!(
          providerConfig.settings.serverUrl &&
          providerConfig.settings.apiKey &&
          providerConfig.settings.apiSecret
        );
        
      case 'jitsi':
        return !!providerConfig.settings.domain;
        
      case 'zoom':
        return !!(providerConfig.settings.sdkKey && providerConfig.settings.sdkSecret);
        
      case 'agora':
        return !!(providerConfig.settings.appId && providerConfig.settings.appCertificate);
        
      case 'custom':
        return !!(providerConfig.settings.apiUrl && providerConfig.settings.apiKey);
        
      default:
        return false;
    }
  }

  /**
   * Create a new video session
   */
  async createSession(sessionData) {
    try {
      const sessionId = this.generateSessionId();
      const currentProvider = this.config.providers[this.config.provider];

      if (!currentProvider?.enabled || !this.isProviderConfigured(this.config.provider)) {
        throw new Error(`Provider ${this.config.provider} is not properly configured`);
      }

      const session = {
        id: sessionId,
        provider: this.config.provider,
        roomId: sessionData.roomId || this.generateRoomId(),
        appointmentId: sessionData.appointmentId,
        doctorId: sessionData.doctorId,
        patientId: sessionData.patientId,
        participants: [],
        status: 'created',
        createdAt: new Date().toISOString(),
        settings: { ...this.config.settings },
        providerData: await this.createProviderSession(sessionData)
      };

      this.sessions.set(sessionId, session);
      this.logSession(session, 'created');

      return session;
    } catch (error) {
      console.error('Error creating video session:', error);
      throw error;
    }
  }

  /**
   * Create session with specific provider
   */
  async createProviderSession(sessionData) {
    const provider = this.config.provider;
    const providerConfig = this.config.providers[provider];

    switch (provider) {
      case 'webrtc':
        return {
          iceServers: this.config.iceServers,
          configuration: providerConfig.settings
        };

      case 'livekit':
        return this.createLiveKitSession(sessionData, providerConfig);

      case 'jitsi':
        return this.createJitsiSession(sessionData, providerConfig);

      case 'zoom':
        return await this.createZoomSession(sessionData, providerConfig);

      case 'agora':
        return await this.createAgoraSession(sessionData, providerConfig);

      case 'custom':
        return await this.createCustomSession(sessionData, providerConfig);

      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Create LiveKit session
   */
  createLiveKitSession(sessionData, providerConfig) {
    const roomName = `${providerConfig.settings.roomPrefix}${sessionData.roomId || this.generateRoomId()}`;
    const meetUrl = providerConfig.settings.meetUrl
      ? `${providerConfig.settings.meetUrl.replace(/\/+$/, '')}/rooms/${roomName}`
      : '';

    return {
      roomName,
      serverUrl: providerConfig.settings.serverUrl,
      meetUrl,
      recordingEnabled: providerConfig.settings.enableRecording,
      egressEnabled: providerConfig.settings.enableEgress
    };
  }

  /**
   * Create Jitsi Meet session
   */
  createJitsiSession(sessionData, providerConfig) {
    const roomName = `${providerConfig.settings.roomPrefix}${sessionData.roomId || this.generateRoomId()}`;
    
    return {
      domain: providerConfig.settings.domain,
      roomName,
      roomUrl: `https://${providerConfig.settings.domain}/${roomName}`,
      options: {
        startAudioMuted: providerConfig.settings.startAudioMuted,
        startVideoMuted: providerConfig.settings.startVideoMuted,
        enableAuth: providerConfig.settings.enableAuth
      }
    };
  }

  /**
   * Create Zoom SDK session
   */
  async createZoomSession(sessionData, providerConfig) {
    try {
      // In a real implementation, you would call Zoom API here
      const zoomData = {
        sdkKey: providerConfig.settings.sdkKey,
        signature: this.generateZoomSignature(sessionData, providerConfig),
        meetingNumber: sessionData.meetingNumber || this.generateMeetingNumber(),
        userName: sessionData.userName || 'Mediczy User'
      };

      console.log('Zoom session created');
      return zoomData;
    } catch (error) {
      console.error('Error creating Zoom session:', error);
      throw error;
    }
  }

  /**
   * Create Agora session
   */
  async createAgoraSession(sessionData, providerConfig) {
    try {
      const channelName = `mediczy_${sessionData.roomId || this.generateRoomId()}`;
      const uid = sessionData.userId || 0; // 0 for auto-assigned UID
      
      // Generate Agora token (in real implementation, use proper token generation)
      const agoraToken = this.generateAgoraToken(
        providerConfig.settings.appId,
        providerConfig.settings.appCertificate,
        channelName,
        uid
      );

      const agoraData = {
        appId: providerConfig.settings.appId,
        channelName,
        token: agoraToken,
        uid,
        videoProfile: providerConfig.settings.videoProfile,
        audioProfile: providerConfig.settings.audioProfile,
        recordingEnabled: providerConfig.settings.enableRecording,
        recordingRegion: providerConfig.settings.recordingRegion
      };

      console.log('Agora session created:', channelName);
      return agoraData;
    } catch (error) {
      console.error('Error creating Agora session:', error);
      throw error;
    }
  }

  /**
   * Create custom provider session
   */
  async createCustomSession(sessionData, providerConfig) {
    try {
      // In a real implementation, you would call your custom API here
      const customData = {
        apiUrl: providerConfig.settings.apiUrl,
        sessionToken: this.generateCustomToken(),
        roomId: sessionData.roomId || this.generateRoomId()
      };

      console.log('Custom provider session created');
      return customData;
    } catch (error) {
      console.error('Error creating custom session:', error);
      throw error;
    }
  }

  /**
   * Join an existing session
   */
  joinSession(sessionId, participantData) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    if (session.participants.length >= this.config.settings.maxParticipants) {
      throw new Error('Session is full');
    }

    const participant = {
      id: participantData.userId,
      role: participantData.role || 'participant',
      joinedAt: new Date().toISOString(),
      ...participantData
    };

    session.participants.push(participant);
    session.status = 'active';
    
    this.logSession(session, 'participant_joined', participant);
    
    return { session, participant };
  }

  /**
   * End a session
   */
  endSession(sessionId, endedBy) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    session.status = 'ended';
    session.endedAt = new Date().toISOString();
    session.endedBy = endedBy;
    
    // Calculate session duration
    const startTime = new Date(session.createdAt);
    const endTime = new Date(session.endedAt);
    session.duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);

    this.logSession(session, 'ended');
    this.sessions.delete(sessionId);

    return session;
  }

  /**
   * Get session statistics
   */
  getStats() {
    const totalSessions = this.sessionLogs.length;
    const activeSessions = this.sessions.size;
    
    const sessionsByProvider = {};
    const sessionsByStatus = { created: 0, active: 0, ended: 0 };
    
    this.sessionLogs.forEach(log => {
      sessionsByProvider[log.provider] = (sessionsByProvider[log.provider] || 0) + 1;
      sessionsByStatus[log.status] = (sessionsByStatus[log.status] || 0) + 1;
    });

    const averageDuration = this.sessionLogs
      .filter(log => log.duration)
      .reduce((acc, log, _, arr) => acc + log.duration / arr.length, 0);

    return {
      totalSessions,
      activeSessions,
      sessionsByProvider,
      sessionsByStatus,
      averageDuration: Math.round(averageDuration),
      currentProvider: this.config.provider,
      providersConfigured: Object.keys(this.config.providers)
        .filter(p => this.isProviderConfigured(p))
    };
  }

  /**
   * Test provider connection
   */
  async testProvider(provider) {
    try {
      const providerConfig = this.config.providers[provider];
      
      if (!providerConfig?.enabled) {
        throw new Error(`Provider ${provider} is not enabled`);
      }

      switch (provider) {
        case 'webrtc':
          return { success: true, message: 'WebRTC is available' };

      case 'livekit':
        return this.testLiveKitConnection(providerConfig);
          
        case 'jitsi':
          return { success: true, message: 'Jitsi configuration valid' };
          
        case 'zoom':
          return { success: true, message: 'Zoom SDK keys configured' };
          
        case 'agora':
          return await this.testAgoraConnection(providerConfig);
          
        case 'custom':
          return { success: true, message: 'Custom provider configured' };
          
        default:
          throw new Error(`Unknown provider: ${provider}`);
      }
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Test LiveKit connection
   */
  async testLiveKitConnection(providerConfig) {
    try {
      if (!providerConfig.settings.serverUrl) {
        throw new Error('LiveKit server URL not configured');
      }
      if (!providerConfig.settings.apiKey || !providerConfig.settings.apiSecret) {
        throw new Error('LiveKit API credentials not configured');
      }

      console.log('LiveKit configuration detected for:', providerConfig.settings.serverUrl);

      return {
        success: true,
        message: 'LiveKit configuration valid',
        serverUrl: providerConfig.settings.serverUrl
      };
    } catch (error) {
      return { success: false, message: `LiveKit test failed: ${error.message}` };
    }
  }

  // Utility methods
  generateSessionId() {
    return `session_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  generateRoomId() {
    return `room_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  }

  generateMeetingNumber() {
    return Math.floor(Math.random() * 1000000000).toString();
  }

  generateCustomToken() {
    return crypto.randomBytes(16).toString('hex');
  }

  generateZoomSignature(sessionData, providerConfig) {
    // Zoom signature generation would go here
    return crypto.randomBytes(32).toString('base64');
  }

  generateAgoraToken(appId, appCertificate, channelName, uid) {
    // In a real implementation, you would use Agora's token generation
    // For now, return a mock token
    const timestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = timestamp + 3600; // 1 hour
    return `agora_token_${appId}_${channelName}_${uid}_${privilegeExpiredTs}`;
  }

  /**
   * Test Agora connection
   */
  async testAgoraConnection(providerConfig) {
    try {
      if (!providerConfig.settings.appId) {
        throw new Error('Agora App ID not configured');
      }
      if (!providerConfig.settings.appCertificate) {
        throw new Error('Agora App Certificate not configured');
      }

      // In a real implementation, you would test Agora REST API
      console.log('Testing Agora connection with App ID:', providerConfig.settings.appId);
      
      return { 
        success: true, 
        message: 'Agora configuration valid',
        appId: providerConfig.settings.appId
      };
    } catch (error) {
      return { success: false, message: `Agora test failed: ${error.message}` };
    }
  }

  logSession(session, action, extra = {}) {
    const logEntry = {
      sessionId: session.id,
      provider: session.provider,
      action,
      timestamp: new Date().toISOString(),
      status: session.status,
      duration: session.duration,
      participants: session.participants.length,
      ...extra
    };

    this.sessionLogs.push(logEntry);
    
    // Keep only last 1000 logs
    if (this.sessionLogs.length > 1000) {
      this.sessionLogs.splice(0, this.sessionLogs.length - 1000);
    }
  }

  /**
   * Get session logs with filtering
   */
  getLogs(options = {}) {
    let logs = [...this.sessionLogs];
    
    if (options.provider) {
      logs = logs.filter(log => log.provider === options.provider);
    }
    
    if (options.action) {
      logs = logs.filter(log => log.action === options.action);
    }
    
    if (options.limit) {
      logs = logs.slice(-options.limit);
    }
    
    return logs.reverse(); // Most recent first
  }
}

// Export singleton instance
const videoService = new VideoService();
export default videoService;
