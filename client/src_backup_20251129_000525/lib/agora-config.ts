// Agora Configuration
export const AGORA_CONFIG = {
  APP_ID: import.meta.env.VITE_AGORA_APP_ID || "your_agora_app_id_here",
  APP_CERTIFICATE: import.meta.env.VITE_AGORA_APP_CERTIFICATE || "your_agora_app_certificate_here",
  
  // Channel name generation
  generateChannelName: (userId1: string, userId2: string) => {
    // Sort user IDs to ensure consistent channel names regardless of who initiates
    const sortedIds = [userId1, userId2].sort();
    return `consultation_${sortedIds[0]}_${sortedIds[1]}_${Date.now()}`;
  },

  // UID generation
  generateUID: (userId: string) => {
    // Convert string userId to number for Agora
    const hash = userId.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    return Math.abs(hash) % 1000000; // Ensure positive number under 1M
  },

  // Default video profile
  VIDEO_PROFILE: {
    width: 640,
    height: 480,
    frameRate: 30,
    bitrateMin: 400,
    bitrateMax: 1000,
  },

  // Audio profile
  AUDIO_PROFILE: {
    sampleRate: 48000,
    stereo: true,
  }
};

export default AGORA_CONFIG;