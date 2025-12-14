/**
 * Session Timeout Middleware
 * 
 * Compliance: HIPAA Best Practice - 15-minute idle timeout for PHI access
 *            NIST SP 800-66 - Automatic Logoff
 * 
 * Enforces automatic session expiration after period of inactivity
 * to prevent unauthorized access to Protected Health Information.
 */

import redis from '../config/redis.js';

const SESSION_TIMEOUT = 15 * 60 * 1000; // 15 minutes in milliseconds
const MAX_SESSION_LIFETIME = 24 * 60 * 60 * 1000; // 24 hours maximum

/**
 * Track session activity and enforce timeout
 */
export const sessionTimeout = async (req, res, next) => {
  try {
    // Only check for authenticated users
    if (!req.user?.id) {
      return next();
    }
    
    const sessionKey = `session:${req.user.id}:${req.sessionID || req.headers['x-session-id']}`;
    
    // Get last activity time from Redis
    const sessionData = await redis.get(sessionKey);
    
    if (sessionData) {
      const { lastActivity, createdAt } = JSON.parse(sessionData);
      const now = Date.now();
      const timeSinceLastActivity = now - lastActivity;
      const sessionAge = now - createdAt;
      
      // Check if session has expired due to inactivity
      if (timeSinceLastActivity > SESSION_TIMEOUT) {
        // Session expired - clear it
        await redis.del(sessionKey);
        
        return res.status(401).json({
          error: 'Session expired',
          message: 'Your session has expired due to inactivity. Please log in again.',
          reason: 'IDLE_TIMEOUT'
        });
      }
      
      // Check if session has exceeded maximum lifetime
      if (sessionAge > MAX_SESSION_LIFETIME) {
        await redis.del(sessionKey);
        
        return res.status(401).json({
          error: 'Session expired',
          message: 'Your session has expired. Please log in again.',
          reason: 'MAX_LIFETIME'
        });
      }
      
      // Update last activity time
      await redis.setex(
        sessionKey,
        Math.ceil(SESSION_TIMEOUT / 1000), // TTL in seconds
        JSON.stringify({
          lastActivity: now,
          createdAt,
          userId: req.user.id,
          userType: req.user.role
        })
      );
    } else {
      // First activity - create session tracking
      await redis.setex(
        sessionKey,
        Math.ceil(SESSION_TIMEOUT / 1000),
        JSON.stringify({
          lastActivity: Date.now(),
          createdAt: Date.now(),
          userId: req.user.id,
          userType: req.user.role
        })
      );
    }
    
    // Add session info to response headers for client-side tracking
    res.set('X-Session-Timeout', SESSION_TIMEOUT);
    res.set('X-Session-Expires-In', SESSION_TIMEOUT);
    
    next();
  } catch (error) {
    console.error('Session timeout check failed:', error);
    // Don't block request on Redis failure
    next();
  }
};

/**
 * Initialize session after login
 */
export const initializeSession = async (userId, sessionId, userType = 'user') => {
  try {
    const sessionKey = `session:${userId}:${sessionId}`;
    const now = Date.now();
    
    await redis.setex(
      sessionKey,
      Math.ceil(SESSION_TIMEOUT / 1000),
      JSON.stringify({
        lastActivity: now,
        createdAt: now,
        userId,
        userType,
        loginTime: new Date().toISOString()
      })
    );
    
    return true;
  } catch (error) {
    console.error('Failed to initialize session:', error);
    return false;
  }
};

/**
 * Terminate session on logout
 */
export const terminateSession = async (userId, sessionId) => {
  try {
    const sessionKey = `session:${userId}:${sessionId}`;
    await redis.del(sessionKey);
    return true;
  } catch (error) {
    console.error('Failed to terminate session:', error);
    return false;
  }
};

/**
 * Get session info
 */
export const getSessionInfo = async (userId, sessionId) => {
  try {
    const sessionKey = `session:${userId}:${sessionId}`;
    const sessionData = await redis.get(sessionKey);
    
    if (!sessionData) return null;
    
    const data = JSON.parse(sessionData);
    const now = Date.now();
    
    return {
      ...data,
      expiresIn: Math.max(0, SESSION_TIMEOUT - (now - data.lastActivity)),
      age: now - data.createdAt,
      isExpired: (now - data.lastActivity) > SESSION_TIMEOUT
    };
  } catch (error) {
    console.error('Failed to get session info:', error);
    return null;
  }
};

export default {
  sessionTimeout,
  initializeSession,
  terminateSession,
  getSessionInfo,
  SESSION_TIMEOUT,
  MAX_SESSION_LIFETIME
};
