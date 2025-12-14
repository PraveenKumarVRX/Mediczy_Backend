import jwt from 'jsonwebtoken';
import { createClient } from 'redis';

const JWT_SECRET = process.env.JWT_SECRET || 'mediczy-super-secret-key-2024';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'mediczy-refresh-secret-2024';

// Redis client for token blacklist (optional - for immediate revocation)
let redisClient = null;

const initRedis = async () => {
  if (process.env.REDIS_URL) {
    try {
      redisClient = createClient({ url: process.env.REDIS_URL });
      await redisClient.connect();
      console.log('✅ Redis connected for token management');
    } catch (error) {
      console.warn('⚠️ Redis not available, token revocation will be delayed until expiry');
    }
  }
};

initRedis();

/**
 * Generate access token (short-lived: 15 minutes)
 * Perfect for horizontal scaling - stateless verification
 */
export const generateAccessToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: '15m', // Short expiry for security
    issuer: 'mediczy-api',
    audience: 'mediczy-users',
  });
};

/**
 * Generate refresh token (long-lived: 7 days)
 * Used to get new access tokens
 */
export const generateRefreshToken = (payload) => {
  return jwt.sign(payload, REFRESH_SECRET, {
    expiresIn: '7d',
    issuer: 'mediczy-api',
    audience: 'mediczy-users',
  });
};

/**
 * Generate both tokens at once
 * Used during login
 */
export const generateTokenPair = (payload) => {
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);
  
  return {
    accessToken,
    refreshToken,
    expiresIn: 900, // 15 minutes in seconds
  };
};

/**
 * Verify access token
 * Stateless - perfect for horizontal scaling
 */
export const verifyAccessToken = (token) => {
  try {
    // Check blacklist first (if Redis available)
    if (redisClient) {
      const isBlacklisted = redisClient.get(`blacklist:${token}`);
      if (isBlacklisted) {
        throw new Error('Token has been revoked');
      }
    }
    
    return jwt.verify(token, JWT_SECRET, {
      issuer: 'mediczy-api',
      audience: 'mediczy-users',
    });
  } catch (error) {
    throw new Error(`Token verification failed: ${error.message}`);
  }
};

/**
 * Verify refresh token
 */
export const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, REFRESH_SECRET, {
      issuer: 'mediczy-api',
      audience: 'mediczy-users',
    });
  } catch (error) {
    throw new Error(`Refresh token verification failed: ${error.message}`);
  }
};

/**
 * Revoke token immediately (requires Redis)
 * Without Redis, tokens remain valid until expiry
 */
export const revokeToken = async (token) => {
  if (!redisClient) {
    console.warn('Token revocation requires Redis - token will remain valid until expiry');
    return false;
  }
  
  try {
    const decoded = jwt.decode(token);
    const expiresIn = decoded.exp - Math.floor(Date.now() / 1000);
    
    if (expiresIn > 0) {
      // Add to blacklist until natural expiry
      await redisClient.setEx(`blacklist:${token}`, expiresIn, '1');
      return true;
    }
  } catch (error) {
    console.error('Token revocation error:', error);
    return false;
  }
};

/**
 * Refresh access token using refresh token
 * This allows short-lived access tokens for better security
 */
export const refreshAccessToken = (refreshToken) => {
  try {
    const payload = verifyRefreshToken(refreshToken);
    
    // Generate new access token with same payload
    const newAccessToken = generateAccessToken({
      id: payload.id,
      email: payload.email,
      role: payload.role,
    });
    
    return {
      accessToken: newAccessToken,
      expiresIn: 900, // 15 minutes
    };
  } catch (error) {
    throw new Error('Refresh token invalid or expired');
  }
};

/**
 * Decode token without verification
 * Useful for extracting user info
 */
export const decodeToken = (token) => {
  return jwt.decode(token);
};

/**
 * Check if token is expired
 */
export const isTokenExpired = (token) => {
  try {
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.exp) return true;
    
    return decoded.exp < Math.floor(Date.now() / 1000);
  } catch (error) {
    return true;
  }
};

export default {
  generateAccessToken,
  generateRefreshToken,
  generateTokenPair,
  verifyAccessToken,
  verifyRefreshToken,
  revokeToken,
  refreshAccessToken,
  decodeToken,
  isTokenExpired,
};
