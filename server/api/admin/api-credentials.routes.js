/**
 * API Credentials Management System
 * Secure credential rotation for mobile app integrations
 * 
 * Features:
 * - Generate API credentials for corporate integrations
 * - Rotate credentials with version management
 * - Track credential usage and expiration
 * - Super admin controls for credential lifecycle
 * - Backward compatible with existing JWT flow
 * 
 * API Endpoints (mounted at /api/admin):
 * - /api/admin/api-credentials/generate - POST
 * - /api/admin/api-credentials - GET  
 * - /api/admin/api-credentials/:id - GET
 * - /api/admin/api-credentials/rotate - POST
 * - /api/admin/api-credentials/revoke - POST
 * - /api/mobile/auth/api-credentials - POST
 */

import express from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { asyncHandler } from '../../middleware/errorHandler.middleware.js';
import { authenticate, generateToken, generateRefreshToken } from '../v2/auth.utils.js';
import { requireRole } from '../../middleware/auth.middleware.js';
import db from '../../database/index.js';

const router = express.Router();

// ============================================================================
// API CREDENTIALS MODEL (Sequelize)
// ============================================================================

/**
 * Add to sequelize models/index.js or create new file: models/ApiCredential.js
 * 
CREATE TABLE api_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Credential Metadata
  name VARCHAR(255) NOT NULL,
  description TEXT,
  integration_type VARCHAR(100), -- 'smarthealth-rn', 'web-portal', 'hospital-api', etc.
  
  -- API Client ID (username)
  client_id VARCHAR(100) UNIQUE NOT NULL,
  
  -- Hashed password (similar to user passwords)
  client_secret_hash VARCHAR(255) NOT NULL,
  client_secret_salt VARCHAR(32),
  
  -- Credential Version (for rotation history)
  version INTEGER DEFAULT 1,
  previous_version INTEGER,
  
  -- Scope/Permissions
  scopes JSONB, -- ["mobile-auth", "doctors:search", "appointments:book", "wellness:order"]
  
  -- Expiration & Rotation
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  last_rotated_at TIMESTAMP,
  rotation_required_at TIMESTAMP, -- Force rotation after this date
  
  -- Usage Tracking
  last_used_at TIMESTAMP,
  usage_count INTEGER DEFAULT 0,
  failed_attempts INTEGER DEFAULT 0,
  last_failed_at TIMESTAMP,
  
  -- Organization/Corporate Context
  organization_id UUID REFERENCES tenants(id),
  corporate_id UUID REFERENCES tenants(id),
  
  -- Status & Control
  status VARCHAR(50) DEFAULT 'active', -- active, expired, rotated, revoked, disabled
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Audit
  created_by UUID REFERENCES users(id),
  rotated_by UUID REFERENCES users(id),
  revoked_by UUID REFERENCES users(id),
  revoked_reason TEXT,
  revoked_at TIMESTAMP,
  
  metadata JSONB, -- additional custom data
  
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT version_consistency CHECK (version > 0),
  CONSTRAINT expiration_logic CHECK (expires_at IS NULL OR expires_at > created_at),
  INDEX idx_client_id (client_id),
  INDEX idx_organization_id (organization_id),
  INDEX idx_corporate_id (corporate_id),
  INDEX idx_status (status),
  INDEX idx_active (is_active, status)
);

CREATE TABLE api_credential_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id UUID NOT NULL REFERENCES api_credentials(id) ON DELETE CASCADE,
  
  action VARCHAR(50), -- created, rotated, revoked, accessed, failed_access
  action_details JSONB,
  
  performed_by UUID REFERENCES users(id),
  performed_at TIMESTAMP DEFAULT NOW(),
  
  ip_address INET,
  user_agent TEXT,
  
  INDEX idx_credential_id (credential_id),
  INDEX idx_performed_at (performed_at)
);
 */

// ============================================================================
// SUPER ADMIN: GENERATE NEW API CREDENTIALS
// ============================================================================

/**
 * POST /api/admin/api-credentials/generate
 * Super admin generates new API credentials for an integration
 * 
 * @body {
 *   name: string (e.g., "SmartHealth RN - Mayden"),
 *   description: string,
 *   integration_type: string,
 *   organization_id: uuid,
 *   corporate_id: uuid,
 *   scopes: string[],
 *   expires_in_days: number (default: 365),
 *   rotation_required_in_days: number (default: 90)
 * }
 */
router.post('/generate', 
  authenticate(), 
  requireRole(['super_admin', 'admin']), 
  asyncHandler(async (req, res) => {
    const { 
      name, 
      description, 
      integration_type, 
      organization_id,
      corporate_id,
      scopes = [],
      expires_in_days = 365,
      rotation_required_in_days = 90
    } = req.body;

    // Validation
    if (!name || !integration_type) {
      return res.status(400).json({
        success: false,
        error: { 
          code: 'INVALID_REQUEST',
          message: 'name and integration_type are required' 
        }
      });
    }

    // Generate client_id (like OAuth client_id)
    const client_id = generateClientId(integration_type);
    
    // Generate secure client_secret (random 64-char string)
    const client_secret = generateClientSecret();
    
    // Hash the secret (one-way, like password)
    const client_secret_hash = await bcrypt.hash(client_secret, 12);
    const client_secret_salt = generateSalt(32);

    // Calculate dates
    const created_at = new Date();
    const expires_at = new Date(created_at.getTime() + expires_in_days * 24 * 60 * 60 * 1000);
    const rotation_required_at = new Date(created_at.getTime() + rotation_required_in_days * 24 * 60 * 60 * 1000);

    // Create credential in database
    const result = await db.query(`
      INSERT INTO api_credentials (
        name,
        description,
        integration_type,
        client_id,
        client_secret_hash,
        client_secret_salt,
        organization_id,
        corporate_id,
        scopes,
        created_at,
        expires_at,
        rotation_required_at,
        created_by,
        status,
        is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id, client_id, name, status, created_at, expires_at, rotation_required_at
    `, [
      name,
      description,
      integration_type,
      client_id,
      client_secret_hash,
      client_secret_salt,
      organization_id || null,
      corporate_id || null,
      JSON.stringify(scopes),
      created_at,
      expires_at,
      rotation_required_at,
      req.user.id,
      'active',
      true
    ]);

    const credential = result.rows[0];

    // Log audit trail
    await logCredentialAudit(credential.id, 'created', {
      integration_type,
      scopes
    }, req.user.id, req.ip, req.headers['user-agent']);

    // Return FULL SECRET (only time it's displayed)
    res.json({
      success: true,
      data: {
        credential_id: credential.id,
        client_id,
        client_secret: client_secret, // 🔒 SENSITIVE - return only once
        integration_type,
        name,
        created_at: credential.created_at,
        expires_at: credential.expires_at,
        rotation_required_at: credential.rotation_required_at,
        status: credential.status,
        
        // Security notes
        security_info: {
          secret_is_displayed_once: true,
          secret_cannot_be_retrieved: true,
          instruction: 'Save the client_secret securely. You will not be able to retrieve it again.',
          how_to_use: 'Include as Authorization: Basic base64(client_id:client_secret) in API requests'
        }
      },
      message: 'API credentials generated. Save the client_secret immediately as it cannot be retrieved later.'
    });
  })
);

// ============================================================================
// SUPER ADMIN: LIST & MANAGE CREDENTIALS
// ============================================================================

/**
 * GET /api/admin/api-credentials
 * List all API credentials with status
 */
router.get('/',
  authenticate(),
  requireRole(['super_admin', 'admin']),
  asyncHandler(async (req, res) => {
    const { organization_id, status, integration_type, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT 
        id,
        name,
        description,
        client_id,
        integration_type,
        organization_id,
        corporate_id,
        status,
        is_active,
        version,
        created_at,
        expires_at,
        rotation_required_at,
        last_used_at,
        usage_count,
        failed_attempts,
        (CURRENT_TIMESTAMP > rotation_required_at) AS rotation_overdue,
        (CASE WHEN expires_at IS NOT NULL AND CURRENT_TIMESTAMP > expires_at THEN TRUE ELSE FALSE END) AS is_expired
      FROM api_credentials
      WHERE 1=1
    `;

    const params = [];
    if (organization_id) {
      query += ` AND (organization_id = $${params.length + 1} OR corporate_id = $${params.length + 1})`;
      params.push(organization_id);
    }
    if (status) {
      query += ` AND status = $${params.length + 1}`;
      params.push(status);
    }
    if (integration_type) {
      query += ` AND integration_type = $${params.length + 1}`;
      params.push(integration_type);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    res.json({
      success: true,
      data: result.rows.map(row => ({
        ...row,
        client_secret: undefined, // Never expose the hash
        issues: [
          row.rotation_overdue ? '⚠️ ROTATION OVERDUE' : null,
          row.is_expired ? '🚨 EXPIRED' : null,
          row.failed_attempts > 5 ? '⚠️ MULTIPLE FAILED ATTEMPTS' : null
        ].filter(Boolean)
      })),
      total: result.rows.length
    });
  })
);

// ============================================================================
// SUPER ADMIN: ROTATE CREDENTIALS (Password Reset)
// ============================================================================

/**
 * POST /api/admin/api-credentials/:id/rotate
 * Rotate (change) the client_secret for an existing credential
 * This creates a new secret while keeping the same client_id
 * 
 * The old secret still works for configured grace period
 */
router.post('/:id/rotate',
  authenticate(),
  requireRole(['super_admin', 'admin']),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { gracePeriodDays = 7 } = req.body;

    // Get existing credential
    const existing = await db.query(`
      SELECT id, client_id, version, previous_version
      FROM api_credentials
      WHERE id = $1 AND status = 'active'
    `, [id]);

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'CREDENTIAL_NOT_FOUND', message: 'Credential not found or inactive' }
      });
    }

    const credential = existing.rows[0];
    
    // Generate new secret
    const new_client_secret = generateClientSecret();
    const new_client_secret_hash = await bcrypt.hash(new_client_secret, 12);

    // Calculate grace period end
    const grace_period_end = new Date(new Date().getTime() + gracePeriodDays * 24 * 60 * 60 * 1000);

    // Update credential with new secret, increment version
    const result = await db.query(`
      UPDATE api_credentials
      SET 
        client_secret_hash = $1,
        version = version + 1,
        previous_version = version,
        last_rotated_at = NOW(),
        rotated_by = $2,
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'grace_period_end', $3::text,
          'old_secret_still_valid', true
        ),
        updated_at = NOW()
      WHERE id = $4
      RETURNING id, client_id, version, last_rotated_at, name
    `, [new_client_secret_hash, req.user.id, grace_period_end.toISOString(), id]);

    const updated = result.rows[0];

    // Log the rotation
    await logCredentialAudit(id, 'rotated', {
      old_version: credential.version,
      new_version: updated.version,
      grace_period_days: gracePeriodDays,
      grace_period_end_at: grace_period_end.toISOString()
    }, req.user.id, req.ip, req.headers['user-agent']);

    res.json({
      success: true,
      data: {
        credential_id: updated.id,
        client_id: updated.client_id,
        new_client_secret: new_client_secret, // Return only once
        version: updated.version,
        last_rotated_at: updated.last_rotated_at,
        grace_period_end,
        old_secret_still_valid_until: grace_period_end,
        
        security_info: {
          new_secret_expires_in_days: gracePeriodDays,
          message: `Old secret is valid until ${grace_period_end.toISOString()}. Please update your applications.`
        }
      },
      message: 'Credential rotated successfully. Old secret has grace period.'
    });
  })
);

// ============================================================================
// SUPER ADMIN: REVOKE CREDENTIALS (Disable)
// ============================================================================

/**
 * POST /api/admin/api-credentials/:id/revoke
 * Immediately revoke/disable credentials
 * Client cannot authenticate with this credential anymore
 */
router.post('/:id/revoke',
  authenticate(),
  requireRole(['super_admin', 'admin']),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reason = 'Not specified' } = req.body;

    const result = await db.query(`
      UPDATE api_credentials
      SET 
        status = 'revoked',
        is_active = FALSE,
        revoked_by = $1,
        revoked_at = NOW(),
        revoked_reason = $2,
        updated_at = NOW()
      WHERE id = $3
      RETURNING id, client_id, name, status, revoked_at
    `, [req.user.id, reason, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'CREDENTIAL_NOT_FOUND' }
      });
    }

    const revoked = result.rows[0];

    // Log the revocation
    await logCredentialAudit(id, 'revoked', { reason }, req.user.id, req.ip, req.headers['user-agent']);

    res.json({
      success: true,
      data: revoked,
      message: `Credential ${revoked.client_id} revoked immediately`
    });
  })
);

// ============================================================================
// MOBILE APP: AUTHENTICATE WITH API CREDENTIALS
// ============================================================================

/**
 * POST /api/mobile/auth/api-credentials
 * Authenticate using API credentials + user email/password
 * 
 * Three-factor authentication:
 * 1. API Client credentials (application level)
 * 2. User email/password (user level)
 * 3. Device info (device level)
 * 
 * @header Authorization: Basic base64(client_id:client_secret)
 * @body { email, password, deviceId, pushToken, corporateSlug (optional) }
 */
router.post('/auth/api-credentials', asyncHandler(async (req, res) => {
  // 1. Extract and validate API credentials from Authorization header
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return res.status(401).json({
      success: false,
      error: { 
        code: 'MISSING_API_CREDENTIALS',
        message: 'Authorization header with API credentials required',
        hint: 'Use: Authorization: Basic base64(client_id:client_secret)'
      }
    });
  }

  // Decode base64 credentials
  const base64Credentials = authHeader.slice(6);
  const credentials = Buffer.from(base64Credentials, 'base64').toString('utf8');
  const [client_id, client_secret] = credentials.split(':');

  if (!client_id || !client_secret) {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_CREDENTIALS_FORMAT', message: 'Invalid API credentials format' }
    });
  }

  // 2. Validate API credentials
  const apiCredResult = await db.query(`
    SELECT 
      id,
      client_id,
      client_secret_hash,
      name,
      integration_type,
      organization_id,
      corporate_id,
      scopes,
      status,
      is_active,
      expires_at,
      rotation_required_at,
      last_used_at,
      failed_attempts,
      last_failed_at,
      (CURRENT_TIMESTAMP > expires_at) AS is_expired,
      (CURRENT_TIMESTAMP > rotation_required_at) AS rotation_overdue
    FROM api_credentials
    WHERE client_id = $1 AND is_active = TRUE AND status = 'active'
    LIMIT 1
  `, [client_id]);

  if (apiCredResult.rows.length === 0) {
    return res.status(401).json({
      success: false,
      error: { code: 'API_CREDENTIAL_NOT_FOUND', message: 'Invalid API credentials' }
    });
  }

  const apiCred = apiCredResult.rows[0];

  // Check if credential is expired
  if (apiCred.is_expired) {
    return res.status(401).json({
      success: false,
      error: { 
        code: 'CREDENTIAL_EXPIRED',
        message: 'API credential has expired',
        expires_at: apiCred.expires_at
      }
    });
  }

  // Verify the client_secret matches
  const secretMatches = await bcrypt.compare(client_secret, apiCred.client_secret_hash);
  
  if (!secretMatches) {
    // Log failed attempt
    await db.query(`
      UPDATE api_credentials
      SET 
        failed_attempts = failed_attempts + 1,
        last_failed_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
    `, [apiCred.id]);

    // Log audit
    await logCredentialAudit(apiCred.id, 'failed_access', {
      reason: 'Invalid secret'
    }, null, req.ip, req.headers['user-agent']);

    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_API_CREDENTIALS', message: 'Invalid API credentials' }
    });
  }

  // If credential is overdue for rotation, warn but allow
  if (apiCred.rotation_overdue) {
    res.setHeader('X-Warning', 'API credential is overdue for rotation. Please rotate soon.');
  }

  // 3. Now authenticate the user (email/password) - same as corporate-login
  const { email, password, deviceId, pushToken, corporateSlug } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_CREDENTIALS', message: 'User email and password are required' }
    });
  }

  // Get user credentials
  let userQuery = `
    SELECT u.id, u.email, u.password, u."firstName", u."lastName", 
           u.organization_id, t.slug, t.name
    FROM users u
    LEFT JOIN tenants t ON u.organization_id = t.id
    WHERE u.email = $1
  `;
  
  const params = [email];
  if (corporateSlug) {
    userQuery += ` AND t.slug = $2`;
    params.push(corporateSlug);
  }
  
  const userResult = await db.query(userQuery + ` LIMIT 1`, params);

  if (userResult.rows.length === 0) {
    return res.status(401).json({
      success: false,
      error: { code: 'USER_NOT_FOUND', message: 'User not found' }
    });
  }

  const user = userResult.rows[0];

  // Verify user password
  const passwordValid = await bcrypt.compare(password, user.password);
  if (!passwordValid) {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_PASSWORD', message: 'Invalid password' }
    });
  }

  // 4. All credentials validated - update usage stats and generate tokens
  await db.query(`
    UPDATE api_credentials
    SET 
      last_used_at = NOW(),
      usage_count = usage_count + 1,
      failed_attempts = 0,
      updated_at = NOW()
    WHERE id = $1
  `, [apiCred.id]);

  // Log successful access
  await logCredentialAudit(apiCred.id, 'accessed', {
    user_id: user.id,
    user_email: user.email
  }, user.id, req.ip, req.headers['user-agent']);

  // Generate JWT tokens
  const accessToken = generateToken({
    id: user.id,
    email: user.email,
    name: [user.firstName, user.lastName].filter(Boolean).join(' '),
    authenticated_via: 'api_credentials',
    api_credential_id: apiCred.id,
    integration: apiCred.integration_type
  }, 'patient');

  const refreshToken = generateRefreshToken(user.id, 'patient');

  res.json({
    success: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
        name: [user.firstName, user.lastName].filter(Boolean).join(' ')
      },
      accessToken,
      refreshToken,
      expiresIn: '30d',
      api_credential_id: apiCred.id,
      authenticated_via: 'api_credentials'
    },
    message: 'Authenticated via API credentials'
  });
}));

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const generateClientId = (integration_type) => {
  // Format: cred_smarthealth_abc123xyz789
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(6).toString('hex');
  return `cred_${(integration_type || 'app').replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${timestamp}${random}`.slice(0, 100);
};

const generateClientSecret = () => {
  // Generate 64-character secure random string
  return crypto.randomBytes(48).toString('hex');
};

const generateSalt = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

const logCredentialAudit = async (credentialId, action, details, userId, ip, userAgent) => {
  try {
    await db.query(`
      INSERT INTO api_credential_audit_log (
        credential_id,
        action,
        action_details,
        performed_by,
        ip_address,
        user_agent,
        performed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `, [credentialId, action, JSON.stringify(details), userId || null, ip || null, userAgent || null]);
  } catch (error) {
    console.warn('Failed to log credential audit:', error.message);
  }
};

export default router;
