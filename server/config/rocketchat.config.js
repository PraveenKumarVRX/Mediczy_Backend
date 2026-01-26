/**
 * RocketChat Configuration
 * Self-hosted chat integration for Mediczy platform
 */

const ROCKETCHAT_CONFIG = {
  // RocketChat Server
  url: process.env.ROCKETCHAT_URL || 'https://smart-chat.live',
  
  // Authentication
  userId: process.env.ROCKETCHAT_USER_ID || '',
  authToken: process.env.ROCKETCHAT_AUTH_TOKEN || '',
  
  // Feature Flags
  enableEmbed: process.env.ROCKETCHAT_ENABLE_EMBED === 'true',
  enableSSO: process.env.ROCKETCHAT_ENABLE_SSO === 'true',
  
  // API Endpoints
  api: {
    baseUrl: process.env.ROCKETCHAT_URL ? `${process.env.ROCKETCHAT_URL}/api/v1` : 'https://smart-chat.live/api/v1',
    channels: '/channels.list',
    createChannel: '/channels.create',
    invite: '/channels.invite',
    sendMessage: '/chat.postMessage',
    users: '/users.list',
    createUser: '/users.create',
    login: '/login',
    me: '/me',
    groups: '/groups.list',
    createGroup: '/groups.create',
    directMessages: '/dm.list',
    createDirect: '/dm.create',
  },
  
  // Default Channels for Different User Types
  defaultChannels: {
    hospital: 'hospital-general',
    doctor: 'doctors-lounge',
    patient: 'patient-support',
    clinic: 'clinic-updates',
    tpa: 'tpa-communication',
    insurance: 'insurance-claims',
    corporate: 'corporate-wellness',
    admin: 'admin-internal'
  },
  
  // Room Types
  roomTypes: {
    CHANNEL: 'c',      // Public channel
    PRIVATE: 'p',      // Private group
    DIRECT: 'd',       // Direct message
    LIVECHAT: 'l'      // Live chat
  },
  
  // Embed Configuration
  embed: {
    width: '100%',
    height: '600px',
    showRoom: true,
    showHeader: true,
    showSidebar: false,
    showToolbar: true,
  },
  
  // Timeouts
  timeout: {
    api: 30000,        // 30 seconds
    connection: 10000  // 10 seconds
  },
  
  // Rate Limiting
  rateLimit: {
    maxRequests: 100,
    perMinutes: 1
  }
};

export default ROCKETCHAT_CONFIG;
