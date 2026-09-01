import crypto from 'crypto';
import { cache, connectRedis } from '../db/redis.js';

/**
 * OTP Model — Redis-backed
 * All OTPs stored exclusively in Redis with native TTL.
 * No dependency on intelligent-db. Data survives Redis restarts (AOF/RDB),
 * and auto-expires without any cron cleanup.
 *
 * Key format: otp:{purpose}:{email|phone}:{id}
 * TTL: set natively — Redis auto-evicts on expiry.
 */

class OTP {
  /** Normalize email identifiers so request, resend, and verify share one Redis key. */
  static _normalizeEmail(email) {
    if (!email) return null;
    return String(email).trim().toLowerCase();
  }

  /**
   * Normalize phone to last 10 digits for consistent Redis key lookup.
   * e.g., "+919615933444" or "919615933444" → "9615933444"
   */
  static _normalizePhone(phone) {
    if (!phone) return null;
    const digits = String(phone).replace(/\D/g, '');
    return digits.length > 10 ? digits.slice(-10) : digits;
  }

  /**
   * Scan Redis for all OTP keys matching a purpose + identifier.
   * Returns [{key, data}] for all non-expired entries found.
   */
  static async _findRedisKeys(purpose, { email, phone }) {
    const redis = await connectRedis();
    email = OTP._normalizeEmail(email) || email;
    let allKeys = [];
    if (email) allKeys = allKeys.concat(await redis.keys(`otp:${purpose}:${email}:*`));
    if (phone) allKeys = allKeys.concat(await redis.keys(`otp:${purpose}:${phone}:*`));
    if (!allKeys.length && (email || phone)) {
      allKeys = await redis.keys(`otp:${purpose}:${email || phone}:*`);
    }
    const keys = [...new Set(allKeys)];
    const results = [];
    for (const key of keys) {
      const data = await cache.get(key);
      if (data) results.push({ key, data });
    }
    return results;
  }

  static async generate({ phone, email, purpose = 'login', expiryMinutes = 10, userId = null }) {
    try {
      email = OTP._normalizeEmail(email) || email;
      const normalizedPhone = OTP._normalizePhone(phone);
      phone = normalizedPhone || phone;

      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);
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

      const redisKey = `otp:${purpose}:${email || phone}:${id}`;
      await cache.set(redisKey, otpData, expiryMinutes * 60);
      console.log(`🔐 OTP stored in Redis: ${redisKey}`);

      if (process.env.NODE_ENV !== 'production') {
        console.log('🔐 Development OTP:', { email: email || 'N/A', phone: phone || 'N/A', code: otpCode, purpose, expiresAt });
      }

      return { id, code: otpCode, expiresAt, phone, email, purpose };
    } catch (error) {
      console.error('Error generating OTP:', error);
      throw new Error('Failed to generate OTP');
    }
  }

  static async verify({ phone, email, code, purpose = 'login' }) {
    try {
      email = OTP._normalizeEmail(email) || email;
      if (phone) phone = OTP._normalizePhone(phone) || phone;

      const entries = await OTP._findRedisKeys(purpose, { email, phone });
      console.log(`🔍 Searching Redis for OTP (purpose=${purpose}), found ${entries.length} keys`);

      let otp = null;
      for (const { key, data } of entries) {
        if (
          data.code === code &&
          data.purpose === purpose &&
          !data.isVerified &&
          (phone && data.phone ? data.phone === phone : true) &&
          (email && data.email ? data.email === email : true)
        ) {
          otp = { ...data, redisKey: key };
          console.log(`✅ Found matching OTP in Redis: ${key}`);
          break;
        }
      }

      if (!otp) {
        // Increment attempt counter on all matching unverified keys
        for (const { key, data } of entries) {
          if (!data.isVerified) {
            const ttl = Math.max(await (await connectRedis()).ttl(key), 1);
            await cache.set(key, { ...data, attempts: (data.attempts || 0) + 1, lastAttemptAt: new Date().toISOString() }, ttl);
          }
        }
        return { success: false, message: 'Invalid OTP code' };
      }

      if (new Date() > new Date(otp.expiresAt)) {
        return { success: false, message: 'OTP has expired' };
      }

      if (otp.attempts >= otp.maxAttempts) {
        return { success: false, message: 'Maximum verification attempts exceeded' };
      }

      // Mark verified — keep key alive for 60 s then Redis auto-deletes
      await cache.set(otp.redisKey, { ...otp, isVerified: true, verifiedAt: new Date().toISOString() }, 60);
      console.log(`✅ OTP marked verified in Redis: ${otp.redisKey}`);

      return { success: true, message: 'OTP verified successfully', otpId: otp.id };
    } catch (error) {
      console.error('Error verifying OTP:', error);
      return { success: false, message: 'Invalid OTP code' };
    }
  }

  static async resend({ phone, email, purpose = 'login' }) {
    try {
      email = OTP._normalizeEmail(email) || email;
      if (phone) phone = OTP._normalizePhone(phone) || phone;

      // Delete all existing unverified OTPs for this identifier + purpose
      const entries = await OTP._findRedisKeys(purpose, { email, phone });
      for (const { key, data } of entries) {
        if (!data.isVerified) await cache.del(key);
      }

      return await OTP.generate({ phone, email, purpose });
    } catch (error) {
      console.error('Error resending OTP:', error);
      throw new Error('Failed to resend OTP');
    }
  }

  /**
   * No-op — Redis TTL handles expiry automatically.
   */
  static async cleanupExpired() {
    return 0;
  }

  /**
   * Get OTP statistics by scanning Redis keys.
   */
  static async getStats() {
    try {
      const redis = await connectRedis();
      const keys = await redis.keys('otp:*');
      const now = new Date();
      const stats = {
        total: keys.length,
        active: 0,
        expired: 0,
        verified: 0,
        unverified: 0,
        byPurpose: {}
      };

      for (const key of keys) {
        const otp = await cache.get(key);
        if (!otp) continue;
        if (otp.isVerified) {
          stats.verified++;
        } else {
          stats.unverified++;
          if (new Date() > new Date(otp.expiresAt)) {
            stats.expired++;
          } else {
            stats.active++;
          }
        }
        stats.byPurpose[otp.purpose] = (stats.byPurpose[otp.purpose] || 0) + 1;
      }

      return stats;
    } catch (error) {
      console.error('Error getting OTP stats:', error);
      return null;
    }
  }
}

export default OTP;
