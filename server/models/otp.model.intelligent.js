import intelligentDb from '../utils/intelligentDbClient.js';
import crypto from 'crypto';
import { cache } from '../db/redis.js';

/**
 * OTP Model for Intelligent Database
 * Handles OTP generation, storage, and verification
 * Uses Redis for cross-cluster storage
 */

class OTP {
  /**
   * Generate and store OTP
   * @param {Object} data - OTP data
   * @param {string} data.phone - Phone number
   * @param {string} data.email - Email address (optional)
   * @param {string} data.purpose - Purpose (login, registration, password_reset, verification)
   * @param {number} data.expiryMinutes - Expiry time in minutes (default: 10)
   * @returns {Promise<Object>} OTP object with code
   */
  static async generate({ phone, email, purpose = 'login', expiryMinutes = 10, userId = null }) {
    try {
      // Generate 6-digit OTP
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      
      // Calculate expiry time
      const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);
      
      // Generate unique ID
      const id = crypto.randomBytes(16).toString('hex');
      
      const otpData = {
        id,
        phone: phone || null,
        email: email || null,
        code: otpCode,
        purpose,
        expiresAt: expiresAt.toISOString(),
        isVerified: false,
        attempts: 0,
        maxAttempts: 5,
        createdAt: new Date().toISOString(),
        lastAttemptAt: null,
        userId: userId || null
      };

      // Store in Redis (primary - works across clusters)
      const redisKey = `otp:${purpose}:${email || phone}:${id}`;
      const redisTTL = expiryMinutes * 60; // seconds
      await cache.set(redisKey, otpData, redisTTL);
      console.log(`🔐 OTP stored in Redis: ${redisKey}`);

      // Also try to store in intelligent database (backup)
      try {
        await intelligentDb.ingest('otps_v1', otpData);
      } catch (dbError) {
        console.warn('⚠️  IntelligentDB unavailable, OTP stored in Redis only:', dbError.message);
      }

      // Log OTP in development mode for testing
      if (process.env.NODE_ENV !== 'production') {
        console.log('🔐 Development OTP:', {
          email: email || 'N/A',
          phone: phone || 'N/A',
          code: otpCode,
          purpose,
          expiresAt
        });
      }

      return {
        id,
        code: otpCode,
        expiresAt,
        phone,
        email,
        purpose
      };
    } catch (error) {
      console.error('Error generating OTP:', error);
      throw new Error('Failed to generate OTP');
    }
  }

  /**
   * Verify OTP
   * @param {Object} data - Verification data
   * @param {string} data.phone - Phone number
   * @param {string} data.email - Email (optional)
   * @param {string} data.code - OTP code
   * @param {string} data.purpose - Purpose
   * @returns {Promise<Object>} Verification result
   */
  static async verify({ phone, email, code, purpose = 'login' }) {
    try {
      // Query for OTP
      const query = {
        code,
        purpose,
        isVerified: false
      };

      if (phone) query.phone = phone;
      if (email) query.email = email;

      let otp = null;

      // Search in Redis first (primary store for cluster mode)
      try {
        // Try both email and phone patterns to handle key mismatch cases
        // (e.g. OTP stored with email key but user verifies with phone, or vice versa)
        const { connectRedis } = await import('../db/redis.js');
        const redis = await connectRedis();

        let allKeys = [];
        if (email) {
          const emailKeys = await redis.keys(`otp:${purpose}:${email}:*`);
          allKeys = allKeys.concat(emailKeys);
        }
        if (phone) {
          const phoneKeys = await redis.keys(`otp:${purpose}:${phone}:*`);
          allKeys = allKeys.concat(phoneKeys);
        }
        if (allKeys.length === 0) {
          // Fallback: original single-pattern search
          const fallbackPattern = `otp:${purpose}:${email || phone}:*`;
          const fallbackKeys = await redis.keys(fallbackPattern);
          allKeys = fallbackKeys;
        }
        // Deduplicate keys
        const keys = [...new Set(allKeys)];
        
        console.log(`🔍 Searching Redis for OTP (purpose=${purpose}), found ${keys.length} keys`);
        
        for (const key of keys) {
          const storedOtp = await cache.get(key);
          if (storedOtp && 
              storedOtp.code === code && 
              storedOtp.purpose === purpose &&
              !storedOtp.isVerified &&
              (phone && storedOtp.phone ? storedOtp.phone === phone : true) &&
              (email && storedOtp.email ? storedOtp.email === email : true)) {
            otp = { ...storedOtp, redisKey: key };
            console.log(`✅ Found matching OTP in Redis: ${key}`);
            break;
          }
        }
      } catch (redisError) {
        console.warn('⚠️  Redis search failed, trying IntelligentDB:', redisError.message);
      }

      // Try to search in intelligent database if not found in Redis
      if (!otp) {
        try {
          const results = await intelligentDb.search('otps_v1', {
            filter: query,
            limit: 1
          });
          if (results && results.length > 0) {
            otp = results[0];
          }
        } catch (dbError) {
          console.warn('⚠️  IntelligentDB search failed');
        }
      }

      if (!otp) {
        return {
          success: false,
          message: 'Invalid OTP code'
        };
      }

      // Check if expired
      const now = new Date();
      const expiresAt = new Date(otp.expiresAt);
      
      if (now > expiresAt) {
        return {
          success: false,
          message: 'OTP has expired'
        };
      }

      // Check max attempts
      if (otp.attempts >= otp.maxAttempts) {
        return {
          success: false,
          message: 'Maximum verification attempts exceeded'
        };
      }

      // Mark as verified
      try {
        // Update in Redis first
        if (otp.redisKey) {
          otp.isVerified = true;
          otp.verifiedAt = new Date().toISOString();
          await cache.set(otp.redisKey, otp, 60); // Keep for 1 minute then expire
          console.log(`✅ OTP marked verified in Redis: ${otp.redisKey}`);
        }
        
        // Also update in intelligent DB
        await intelligentDb.update('otps_v1', otp.id, {
          isVerified: true,
          verifiedAt: new Date().toISOString()
        });
      } catch (dbError) {
        console.warn('⚠️  OTP verification update error:', dbError.message);
      }

      return {
        success: true,
        message: 'OTP verified successfully',
        otpId: otp.id
      };
    } catch (error) {
      console.error('Error verifying OTP:', error);
      
      // Increment attempt count on error (if OTP exists)
      try {
        if (phone || email) {
          const query = { code, purpose };
          if (phone) query.phone = phone;
          if (email) query.email = email;
          
          const results = await intelligentDb.search('otps_v1', {
            filter: query,
            limit: 1
          });
          
          if (results && results.length > 0) {
            const otp = results[0];
            await intelligentDb.update('otps_v1', otp.id, {
              attempts: (otp.attempts || 0) + 1,
              lastAttemptAt: new Date().toISOString()
            });
          }
        }
      } catch (updateError) {
        console.error('Error updating attempt count:', updateError);
      }

      return {
        success: false,
        message: 'Invalid OTP code'
      };
    }
  }

  /**
   * Resend OTP (invalidates old one and generates new)
   * @param {Object} data - Resend data
   * @param {string} data.phone - Phone number
   * @param {string} data.email - Email (optional)
   * @param {string} data.purpose - Purpose
   * @returns {Promise<Object>} New OTP object
   */
  static async resend({ phone, email, purpose = 'login' }) {
    try {
      // Invalidate existing OTPs
      const query = { purpose, isVerified: false };
      if (phone) query.phone = phone;
      if (email) query.email = email;

      const existingOtps = await intelligentDb.search('otps_v1', {
        filter: query
      });

      // Mark all as expired
      for (const otp of existingOtps) {
        await intelligentDb.update('otps_v1', otp.id, {
          expiresAt: new Date().toISOString() // Set to now (expired)
        });
      }

      // Generate new OTP
      return await this.generate({ phone, email, purpose });
    } catch (error) {
      console.error('Error resending OTP:', error);
      throw new Error('Failed to resend OTP');
    }
  }

  /**
   * Clean up expired OTPs (should be run periodically)
   * @returns {Promise<number>} Number of OTPs deleted
   */
  static async cleanupExpired() {
    try {
      const now = new Date().toISOString();
      
      // Search for expired OTPs
      const expiredOtps = await intelligentDb.search('otps_v1', {
        filter: {
          expiresAt: { $lt: now }
        }
      });

      // Delete expired OTPs
      let deletedCount = 0;
      for (const otp of expiredOtps) {
        await intelligentDb.delete('otps_v1', otp.id);
        deletedCount++;
      }

      console.log(`Cleaned up ${deletedCount} expired OTPs`);
      return deletedCount;
    } catch (error) {
      console.error('Error cleaning up OTPs:', error);
      return 0;
    }
  }

  /**
   * Get OTP statistics
   * @returns {Promise<Object>} Statistics
   */
  static async getStats() {
    try {
      const allOtps = await intelligentDb.search('otps_v1', {
        limit: 10000
      });

      const now = new Date();
      const stats = {
        total: allOtps.length,
        active: 0,
        expired: 0,
        verified: 0,
        unverified: 0,
        byPurpose: {}
      };

      allOtps.forEach(otp => {
        // Count by status
        if (otp.isVerified) {
          stats.verified++;
        } else {
          stats.unverified++;
          const expiresAt = new Date(otp.expiresAt);
          if (now > expiresAt) {
            stats.expired++;
          } else {
            stats.active++;
          }
        }

        // Count by purpose
        stats.byPurpose[otp.purpose] = (stats.byPurpose[otp.purpose] || 0) + 1;
      });

      return stats;
    } catch (error) {
      console.error('Error getting OTP stats:', error);
      return null;
    }
  }
}

export default OTP;
