/**
 * OAuth Token Service
 * Manages authorization codes, access tokens, and refresh tokens
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { cache } from '../db/redis.js';

const TOKEN_EXPIRY = 3600; // 1 hour
const AUTH_CODE_EXPIRY = 600; // 10 minutes

class OAuthTokenService {
  /**
   * Generate short-lived authorization code
   * @param {Object} user - User object from Postgres
   * @param {string} client_id - OAuth client ID
   * @param {string} redirect_uri - Redirect URI for this auth code
   * @param {Array} scope - Requested scopes
   * @returns {Promise<string>} Authorization code
   */
  async generateAuthorizationCode(user, client_id, redirect_uri, scope = []) {
    try {
      const authCode = this._generateRandomCode(32);
      
      // Store code in Redis with expiry
      const codeData = {
        user_id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        client_id,
        redirect_uri,
        scope,
        created_at: new Date().toISOString()
      };

      await cache.set(
        `oauth:authcode:${authCode}`,
        codeData,
        AUTH_CODE_EXPIRY
      );

      console.log(`✅ OAuth: Authorization code generated for ${user.email} (client: ${client_id})`);
      return authCode;
    } catch (error) {
      console.error(`❌ OAuth: Failed to generate auth code:`, error.message);
      throw error;
    }
  }

  /**
   * Exchange authorization code for access token
   * @param {string} authCode - Authorization code
   * @param {string} client_id - OAuth client ID
   * @param {string} redirect_uri - Redirect URI (must match original)
   * @returns {Promise<Object>} Token response
   */
  async exchangeCodeForToken(authCode, client_id, redirect_uri) {
    try {
      // Retrieve code data from Redis
      const codeData = await cache.get(`oauth:authcode:${authCode}`);

      if (!codeData) {
        throw new Error('Authorization code expired or invalid');
      }

      // Validate code parameters
      if (codeData.client_id !== client_id) {
        throw new Error('Client ID mismatch');
      }

      if (codeData.redirect_uri !== redirect_uri) {
        throw new Error('Redirect URI mismatch');
      }

      // Delete used code
      await cache.del(`oauth:authcode:${authCode}`);

      // Generate access token (JWT)
      const accessToken = jwt.sign(
        {
          sub: codeData.user_id,
          email: codeData.email,
          username: codeData.username,
          name: `${codeData.firstName} ${codeData.lastName}`,
          client_id,
          scope: codeData.scope
        },
        process.env.JWT_SECRET,
        { expiresIn: TOKEN_EXPIRY }
      );

      console.log(`✅ OAuth: Access token issued for user ${codeData.user_id}`);

      return {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: TOKEN_EXPIRY,
        scope: codeData.scope.join(' ')
      };
    } catch (error) {
      console.error(`❌ OAuth: Token exchange failed:`, error.message);
      throw error;
    }
  }

  /**
   * Validate access token and extract user claim
   * @param {string} token - JWT access token
   * @returns {Object} Decoded token payload
   */
  validateAccessToken(token) {
    try {
      const payload = jwt.verify(
        token,
        process.env.JWT_SECRET
      );
      return payload;
    } catch (error) {
      console.error(`❌ OAuth: Token validation failed:`, error.message);
      throw new Error('Invalid or expired token');
    }
  }

  /**
   * Generate random code/token
   * @param {number} length - Length of code
   * @returns {string} Random code
   */
  _generateRandomCode(length = 32) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    let code = '';
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    for (let i = 0; i < length; i++) {
      code += chars[array[i] % chars.length];
    }
    return code;
  }
}

export default new OAuthTokenService();
