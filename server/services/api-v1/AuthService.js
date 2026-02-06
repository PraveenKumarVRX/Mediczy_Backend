import BaseService from '../BaseService.js';
import { ErrorTypes } from '../../middleware/errorHandler.js';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

class AuthService extends BaseService {
  constructor() {
    super('api_users'); // Auth operations primarily work with users
  }

  /**
   * Authenticate user via OIDC (ABHA integration)
   */
  async authenticateOIDC(tenantId, code, redirectUri) {
    // In production, this would exchange the authorization code with ABHA
    // For now, this is a placeholder implementation

    const abhaTokenUrl = process.env.ABHA_TOKEN_URL || 'https://abhasbx.abdm.gov.in/abha/api/v3/profile/token';
    const clientId = process.env.ABHA_CLIENT_ID;
    const clientSecret = process.env.ABHA_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw ErrorTypes.InternalServer('ABHA credentials not configured');
    }

    // Exchange authorization code for tokens (simplified)
    // In production, you would make a POST request to ABHA token endpoint
    const tokenExchangeData = {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret
    };

    // Placeholder: This would be an actual HTTP request to ABHA
    // const response = await fetch(abhaTokenUrl, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(tokenExchangeData)
    // });
    // const tokens = await response.json();

    // For now, return a mock response
    const mockAbhaTokens = {
      access_token: 'abha_access_token_placeholder',
      id_token: 'abha_id_token_placeholder',
      refresh_token: 'abha_refresh_token_placeholder',
      expires_in: 3600
    };

    // Decode ID token to get user info (simplified)
    // In production, verify the JWT signature with ABHA's public key
    const userInfo = {
      abha_id: 'mock_abha_id',
      name: 'Mock User',
      email: 'user@example.com',
      phone: '+919876543210',
      phr_address: 'user@abdm'
    };

    // Find or create user in our system
    let user = await this.findUserByAbhaId(tenantId, userInfo.abha_id);

    if (!user) {
      // Create new user
      const userId = this.generateId('user');
      const userData = {
        id: userId,
        abha_id: userInfo.abha_id,
        phr_address: userInfo.phr_address,
        name: userInfo.name,
        email: userInfo.email,
        phone: userInfo.phone,
        email_verified: true,
        phone_verified: true,
        is_active: true
      };

      user = await this.create(userData, tenantId);
    }

    // Generate our own JWT tokens
    const { accessToken, refreshToken } = await this.generateJWT(user, ['user.read', 'user.write']);

    return {
      user: this.sanitize(user),
      accessToken,
      refreshToken,
      expiresIn: 3600,
      tokenType: 'Bearer'
    };
  }

  /**
   * Find user by ABHA ID
   */
  async findUserByAbhaId(tenantId, abhaId) {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE tenant_id = $1 AND abha_id = $2 AND deleted_at IS NULL
      LIMIT 1
    `;

    const result = await this.query(sql, [tenantId, abhaId]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Generate JWT access and refresh tokens
   */
  async generateJWT(user, scopes) {
    const jwtSecret = process.env.JWT_SECRET;
    const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || jwtSecret;

    if (!jwtSecret) {
      throw ErrorTypes.InternalServer('JWT secret not configured');
    }

    // Access token payload
    const accessTokenPayload = {
      userId: user.id,
      tenantId: user.tenant_id,
      email: user.email,
      abhaId: user.abha_id,
      scopes: scopes || [],
      type: 'access'
    };

    // Refresh token payload
    const refreshTokenPayload = {
      userId: user.id,
      tenantId: user.tenant_id,
      type: 'refresh',
      tokenId: crypto.randomBytes(16).toString('hex')
    };

    // Sign tokens
    const accessToken = jwt.sign(accessTokenPayload, jwtSecret, {
      algorithm: 'HS256',
      expiresIn: '1h',
      issuer: 'mediczy-api',
      subject: user.id
    });

    const refreshToken = jwt.sign(refreshTokenPayload, jwtRefreshSecret, {
      algorithm: 'HS256',
      expiresIn: '30d',
      issuer: 'mediczy-api',
      subject: user.id
    });

    // Store refresh token in database (for revocation capability)
    await this.storeRefreshToken(user.tenant_id, user.id, refreshTokenPayload.tokenId, refreshToken);

    return {
      accessToken,
      refreshToken,
      expiresIn: 3600,
      tokenType: 'Bearer'
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken) {
    const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;

    if (!jwtRefreshSecret) {
      throw ErrorTypes.InternalServer('JWT secret not configured');
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, jwtRefreshSecret);
    } catch (error) {
      throw ErrorTypes.Unauthorized('Invalid refresh token');
    }

    if (decoded.type !== 'refresh') {
      throw ErrorTypes.Unauthorized('Invalid token type');
    }

    // Check if token is revoked
    const isRevoked = await this.isTokenRevoked(decoded.tenantId, decoded.tokenId);
    if (isRevoked) {
      throw ErrorTypes.Unauthorized('Refresh token has been revoked');
    }

    // Get user
    const user = await this.findById(decoded.userId, decoded.tenantId);

    if (!user.is_active) {
      throw ErrorTypes.Forbidden('User account is deactivated');
    }

    // Generate new access token (keep same refresh token)
    const jwtSecret = process.env.JWT_SECRET;
    const accessTokenPayload = {
      userId: user.id,
      tenantId: user.tenant_id,
      email: user.email,
      abhaId: user.abha_id,
      scopes: decoded.scopes || [],
      type: 'access'
    };

    const accessToken = jwt.sign(accessTokenPayload, jwtSecret, {
      algorithm: 'HS256',
      expiresIn: '1h',
      issuer: 'mediczy-api',
      subject: user.id
    });

    return {
      accessToken,
      expiresIn: 3600,
      tokenType: 'Bearer'
    };
  }

  /**
   * Revoke refresh token (logout)
   */
  async revokeToken(refreshToken) {
    const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;

    // Decode token without verification (we just need the tokenId)
    const decoded = jwt.decode(refreshToken);

    if (!decoded || decoded.type !== 'refresh') {
      throw ErrorTypes.BadRequest('Invalid refresh token');
    }

    // Mark token as revoked
    await this.revokeRefreshToken(decoded.tenantId, decoded.tokenId);

    return { revoked: true };
  }

  /**
   * Validate access token
   */
  async validateToken(token) {
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      throw ErrorTypes.InternalServer('JWT secret not configured');
    }

    try {
      const decoded = jwt.verify(token, jwtSecret);

      if (decoded.type !== 'access') {
        throw ErrorTypes.Unauthorized('Invalid token type');
      }

      // Check if user is still active
      const user = await this.findById(decoded.userId, decoded.tenantId);

      if (!user.is_active) {
        throw ErrorTypes.Forbidden('User account is deactivated');
      }

      return {
        valid: true,
        userId: decoded.userId,
        tenantId: decoded.tenantId,
        scopes: decoded.scopes,
        expiresAt: new Date(decoded.exp * 1000).toISOString()
      };
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw ErrorTypes.Unauthorized('Token has expired');
      }
      throw ErrorTypes.Unauthorized('Invalid token');
    }
  }

  /**
   * Store refresh token in database
   */
  async storeRefreshToken(tenantId, userId, tokenId, token) {
    // This would typically go into a separate tokens table
    // For simplicity, using a placeholder implementation
    const sql = `
      INSERT INTO api_audit_logs (tenant_id, action, resource_type, resource_id, metadata)
      VALUES ($1, 'token_issued', 'refresh_token', $2, $3)
    `;
    
    const metadata = JSON.stringify({
      userId,
      tokenId,
      issuedAt: new Date().toISOString()
    });

    await this.query(sql, [tenantId, tokenId, metadata]);
  }

  /**
   * Check if token is revoked
   */
  async isTokenRevoked(tenantId, tokenId) {
    // Check if revocation record exists
    const sql = `
      SELECT COUNT(*) as count
      FROM api_audit_logs
      WHERE tenant_id = $1 
        AND action = 'token_revoked' 
        AND resource_id = $2
    `;

    const result = await this.query(sql, [tenantId, tokenId]);
    return parseInt(result.rows[0].count) > 0;
  }

  /**
   * Revoke refresh token
   */
  async revokeRefreshToken(tenantId, tokenId) {
    const sql = `
      INSERT INTO api_audit_logs (tenant_id, action, resource_type, resource_id, metadata)
      VALUES ($1, 'token_revoked', 'refresh_token', $2, $3)
    `;

    const metadata = JSON.stringify({
      revokedAt: new Date().toISOString()
    });

    await this.query(sql, [tenantId, tokenId, metadata]);
  }
}

export default AuthService;
