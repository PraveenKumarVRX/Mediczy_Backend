/**
 * Aggregator/Mayden Account With API Credentials Provisioning
 * 
 * When a super admin creates an aggregator login (Mayden), automatically
 * provision API credentials for the aggregator to authenticate with the system.
 * 
 * Features:
 * - Auto-generate API credentials when aggregator account is created
 * - Store credentials securely
 * - Provide credentials to aggregator for setup
 * - Track credential usage and rotation
 * - Audit all aggregator API access
 */

import express from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { asyncHandler } from '../../middleware/errorHandler.middleware.js';
import { authenticate } from '../v2/auth.utils.js';
import { requireRole } from '../../middleware/auth.middleware.js';
import db from '../../database/index.js';

const router = express.Router();

// ============================================================================
// CONSTANTS
// ============================================================================

const AGGREGATOR_INTEGRATION_TYPE = 'aggregator_mayden';
const CREDENTIAL_ROTATION_DAYS = 90;
const CREDENTIAL_GRACE_PERIOD_DAYS = 7;
const BCRYPT_ROUNDS = 12;

// ============================================================================
// AGGREGATOR ACCOUNT CREATION WITH API CREDENTIALS
// ============================================================================

/**
 * POST /api/admin/aggregators/create
 * Create a new aggregator account with automatic API credentials provisioning
 * 
 * Super admin can create aggregator accounts (e.g., Mayden partner accounts)
 * System automatically provisions API credentials for secure authentication
 * 
 * Request Body:
 * {
 *   "name": "Mayden Integration",
 *   "email": "mayden@partner.com",
 *   "phone": "+1-XXX-XXX-XXXX",
 *   "aggregator_type": "mayden", // or "hospital_chain", "clinic_network", etc.
 *   "integration_type": "smarthealth_rn",
 *   "description": "Mayden EHR system integration",
 *   "contact_person": "John Doe",
 *   "contact_email": "john@mayden.com"
 * }
 */
router.post('/aggregators/create', 
  authenticate,
  requireRole(['super_admin']),
  asyncHandler(async (req, res) => {
    const {
      name,
      email,
      phone,
      aggregator_type = 'generic',
      integration_type = AGGREGATOR_INTEGRATION_TYPE,
      description = '',
      contact_person = '',
      contact_email = email,
    } = req.body;

    // ========================================================================
    // VALIDATION
    // ========================================================================

    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: 'Name and email are required',
      });
    }

    try {
      // Start transaction for atomic operations
      const transaction = await sequelize.transaction();

      try {
        // ====================================================================
        // STEP 1: Create Aggregator Account
        // ====================================================================

        const aggregatorId = crypto.randomUUID();
        const aggregatorPassword = crypto.randomBytes(16).toString('hex');
        const passwordHash = await bcrypt.hash(aggregatorPassword, BCRYPT_ROUNDS);

        // Insert aggregator account (adjust based on your actual schema)
        const aggregatorQuery = `
          INSERT INTO aggregators (
            id, name, email, phone, aggregator_type,
            description, contact_person, contact_email,
            password_hash, status, created_at, created_by
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11
          )
          RETURNING id, name, email;
        `;

        const aggregatorResult = await sequelize.query(aggregatorQuery, {
          bind: [
            aggregatorId,
            name,
            email,
            phone,
            aggregator_type,
            description,
            contact_person,
            contact_email,
            passwordHash,
            'active',
            req.user.id,
          ],
          type: sequelize.QueryTypes.INSERT,
          transaction,
        });

        // ====================================================================
        // STEP 2: Generate API Credentials
        // ====================================================================

        const credentialId = crypto.randomUUID();
        const clientId = generateClientId(name, aggregator_type);
        const clientSecret = crypto.randomBytes(32).toString('hex');
        const clientSecretHash = await bcrypt.hash(clientSecret, BCRYPT_ROUNDS);

        const createdAt = new Date();
        const expiresAt = new Date(createdAt);
        expiresAt.setDate(expiresAt.getDate() + 365);

        const rotationRequiredAt = new Date(createdAt);
        rotationRequiredAt.setDate(rotationRequiredAt.getDate() + CREDENTIAL_ROTATION_DAYS);

        // Insert API credentials
        const credentialQuery = `
          INSERT INTO api_credentials (
            id, organization_id, name, client_id, client_secret_hash,
            version, status, integration_type, scopes, created_at,
            created_by, expires_at, rotation_required_at, is_active,
            metadata
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
          )
          RETURNING id, client_id, version, created_at, expires_at, rotation_required_at;
        `;

        const scopes = [
          'aggregator:auth',
          'aggregator:access',
          'hospital:data',
          'clinic:data',
          'patient:read',
          'appointments:read',
        ];

        const credentialMetadata = {
          aggregator_id: aggregatorId,
          aggregator_type: aggregator_type,
          aggregator_name: name,
          created_by_user: req.user.id,
          created_for_purpose: 'aggregator_authentication',
        };

        const credentialResult = await sequelize.query(credentialQuery, {
          bind: [
            credentialId,
            req.user.organization_id, // Use super admin's organization
            `${name} API Credential`,
            clientId,
            clientSecretHash,
            1, // version
            'active',
            integration_type,
            JSON.stringify(scopes),
            createdAt,
            req.user.id,
            expiresAt,
            rotationRequiredAt,
            true,
            JSON.stringify(credentialMetadata),
          ],
          type: sequelize.QueryTypes.INSERT,
          transaction,
        });

        // ====================================================================
        // STEP 3: Log Audit Entry
        // ====================================================================

        await logCredentialAudit(
          credentialId,
          req.user.organization_id,
          'created',
          req.user.id,
          'super_admin',
          req.ip,
          req.get('User-Agent'),
          {
            aggregator_id: aggregatorId,
            aggregator_name: name,
            integration_type: integration_type,
            purpose: 'Aggregator account creation',
          },
          transaction
        );

        // ====================================================================
        // STEP 4: Create Link Between Aggregator and Credentials
        // ====================================================================

        // Insert into aggregator_credentials linking table
        const linkQuery = `
          INSERT INTO aggregator_api_credentials (
            id, aggregator_id, credential_id, is_primary, status,
            created_at, created_by
          ) VALUES (
            $1, $2, $3, $4, $5, NOW(), $6
          )
          RETURNING id;
        `;

        await sequelize.query(linkQuery, {
          bind: [
            crypto.randomUUID(),
            aggregatorId,
            credentialId,
            true, // Mark as primary credential
            'active',
            req.user.id,
          ],
          type: sequelize.QueryTypes.INSERT,
          transaction,
        });

        // ====================================================================
        // STEP 5: Commit Transaction
        // ====================================================================

        await transaction.commit();

        // ====================================================================
        // STEP 6: Return Results
        // ====================================================================

        res.status(201).json({
          success: true,
          message: 'Aggregator account created with API credentials',
          data: {
            aggregator: {
              id: aggregatorId,
              name: name,
              email: email,
              aggregator_type: aggregator_type,
              status: 'active',
              created_at: createdAt.toISOString(),
              temporary_password: aggregatorPassword, // Share once during setup
            },
            api_credentials: {
              id: credentialId,
              client_id: clientId,
              client_secret: clientSecret, // Share once - never shown again
              version: 1,
              status: 'active',
              expires_at: expiresAt.toISOString(),
              rotation_required_at: rotationRequiredAt.toISOString(),
              scopes: scopes,
              integration_type: integration_type,
              created_at: createdAt.toISOString(),
              important_notice: '⚠️ SAVE THESE CREDENTIALS IMMEDIATELY - Cannot be retrieved later',
            },
            setup_instructions: {
              step1: 'Save the client_id and client_secret securely',
              step2: 'Store in 1Password or vault system',
              step3: 'Share with aggregator contact person',
              step4: 'Aggregator uses credentials for API authentication',
              step5: 'Set up rotation schedule (90 days recommended)',
            },
          },
        });

      } catch (error) {
        // Rollback on any error
        await transaction.rollback();
        throw error;
      }

    } catch (error) {
      console.error('Error creating aggregator with credentials:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create aggregator account with credentials',
        error: error.message,
      });
    }
  })
);

// ============================================================================
// LIST AGGREGATOR ACCOUNTS WITH CREDENTIAL STATUS
// ============================================================================

/**
 * GET /api/admin/aggregators
 * List all aggregator accounts with their API credential status
 * 
 * Query Parameters:
 * - status: 'active' | 'inactive' | 'all' (default: 'active')
 * - type: aggregator_type filter
 * - include_credentials: true | false (include credential details)
 */
router.get('/aggregators',
  authenticate,
  requireRole(['super_admin']),
  asyncHandler(async (req, res) => {
    const { status = 'active', include_credentials = true } = req.query;

    try {
      let query = `
        SELECT
          a.id,
          a.name,
          a.email,
          a.phone,
          a.aggregator_type,
          a.status,
          a.contact_person,
          a.contact_email,
          a.created_at,
          COUNT(DISTINCT ac.credential_id) as credential_count,
          MAX(CASE WHEN ac.is_primary THEN ac.credential_id END) as primary_credential_id
        FROM aggregators a
        LEFT JOIN aggregator_api_credentials ac ON a.id = ac.aggregator_id
        WHERE a.organization_id = $1
      `;

      const params = [req.user.organization_id];

      if (status !== 'all') {
        query += ` AND a.status = $${params.length + 1}`;
        params.push(status);
      }

      query += ` GROUP BY a.id ORDER BY a.created_at DESC`;

      const aggregators = await sequelize.query(query, {
        bind: params,
        type: sequelize.QueryTypes.SELECT,
      });

      // If include_credentials, fetch credential details for each aggregator
      let aggregatorsWithCredentials = aggregators;
      if (include_credentials) {
        aggregatorsWithCredentials = await Promise.all(
          aggregators.map(async (agg) => {
            const credQuery = `
              SELECT
                ac.credential_id,
                ac.is_primary,
                ac.status as link_status,
                cred.client_id,
                cred.status,
                cred.version,
                cred.created_at,
                cred.expires_at,
                cred.rotation_required_at,
                cred.last_used_at,
                cred.usage_count,
                cred.failed_attempts
              FROM aggregator_api_credentials ac
              JOIN api_credentials cred ON ac.credential_id = cred.id
              WHERE ac.aggregator_id = $1
              ORDER BY ac.is_primary DESC, cred.created_at DESC
            `;

            const credentials = await sequelize.query(credQuery, {
              bind: [agg.id],
              type: sequelize.QueryTypes.SELECT,
            });

            return {
              ...agg,
              credentials: credentials,
            };
          })
        );
      }

      res.json({
        success: true,
        count: aggregatorsWithCredentials.length,
        aggregators: aggregatorsWithCredentials,
      });

    } catch (error) {
      console.error('Error listing aggregators:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to list aggregators',
        error: error.message,
      });
    }
  })
);

// ============================================================================
// GET AGGREGATOR DETAILS WITH CREDENTIALS
// ============================================================================

/**
 * GET /api/admin/aggregators/:aggregatorId
 * Get specific aggregator account with API credential details
 */
router.get('/aggregators/:aggregatorId',
  authenticate,
  requireRole(['super_admin']),
  asyncHandler(async (req, res) => {
    const { aggregatorId } = req.params;

    try {
      // Fetch aggregator
      const aggQuery = `
        SELECT * FROM aggregators 
        WHERE id = $1 AND organization_id = $2
      `;

      const aggregators = await sequelize.query(aggQuery, {
        bind: [aggregatorId, req.user.organization_id],
        type: sequelize.QueryTypes.SELECT,
      });

      if (aggregators.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Aggregator not found',
        });
      }

      const aggregator = aggregators[0];

      // Fetch credentials
      const credQuery = `
        SELECT
          ac.credential_id,
          ac.is_primary,
          ac.status as link_status,
          ac.created_at as linked_at,
          cred.client_id,
          cred.status,
          cred.version,
          cred.created_at,
          cred.expires_at,
          cred.rotation_required_at,
          cred.last_used_at,
          cred.usage_count,
          cred.failed_attempts,
          CASE 
            WHEN cred.rotation_required_at <= NOW() THEN 'OVERDUE'
            WHEN cred.rotation_required_at <= NOW() + INTERVAL '14 days' THEN 'UPCOMING'
            ELSE 'SCHEDULED'
          END as rotation_urgency
        FROM aggregator_api_credentials ac
        JOIN api_credentials cred ON ac.credential_id = cred.id
        WHERE ac.aggregator_id = $1
        ORDER BY ac.is_primary DESC, cred.created_at DESC
      `;

      const credentials = await sequelize.query(credQuery, {
        bind: [aggregatorId],
        type: sequelize.QueryTypes.SELECT,
      });

      res.json({
        success: true,
        aggregator: {
          ...aggregator,
          credentials: credentials,
          credential_count: credentials.length,
          primary_credential: credentials.find(c => c.is_primary),
        },
      });

    } catch (error) {
      console.error('Error fetching aggregator details:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch aggregator details',
        error: error.message,
      });
    }
  })
);

// ============================================================================
// ROTATE AGGREGATOR CREDENTIAL
// ============================================================================

/**
 * POST /api/admin/aggregators/:aggregatorId/rotate-credential
 * Rotate an aggregator's API credential with grace period
 */
router.post('/aggregators/:aggregatorId/rotate-credential',
  authenticate,
  requireRole(['super_admin']),
  asyncHandler(async (req, res) => {
    const { aggregatorId } = req.params;
    const { credential_id, grace_period_days = CREDENTIAL_GRACE_PERIOD_DAYS } = req.body;

    try {
      const transaction = await sequelize.transaction();

      try {
        // Get current credential
        const currentQuery = `
          SELECT * FROM api_credentials WHERE id = $1
        `;

        const currentCredentials = await sequelize.query(currentQuery, {
          bind: [credential_id],
          type: sequelize.QueryTypes.SELECT,
          transaction,
        });

        if (currentCredentials.length === 0) {
          throw new Error('Credential not found');
        }

        const currentCred = currentCredentials[0];

        // Generate new credential
        const newCredentialId = crypto.randomUUID();
        const newClientSecret = crypto.randomBytes(32).toString('hex');
        const newClientSecretHash = await bcrypt.hash(newClientSecret, BCRYPT_ROUNDS);

        const gracePeriodEnd = new Date();
        gracePeriodEnd.setDate(gracePeriodEnd.getDate() + grace_period_days);

        const rotationDueDate = new Date(gracePeriodEnd);
        rotationDueDate.setDate(rotationDueDate.getDate() + CREDENTIAL_ROTATION_DAYS);

        // Create new credential
        const newCredQuery = `
          INSERT INTO api_credentials (
            id, organization_id, name, client_id, client_secret_hash,
            version, status, integration_type, scopes, created_at,
            created_by, expires_at, rotation_required_at, is_active,
            metadata
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10, $11, $12, $13, $14
          )
          RETURNING id, client_id;
        `;

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 365);

        const newVersion = currentCred.version + 1;

        const newCredResult = await sequelize.query(newCredQuery, {
          bind: [
            newCredentialId,
            req.user.organization_id,
            `${currentCred.name} (v${newVersion})`,
            currentCred.client_id, // Same client_id, different version
            newClientSecretHash,
            newVersion,
            'active',
            currentCred.integration_type,
            currentCred.scopes,
            req.user.id,
            expiresAt,
            rotationDueDate,
            true,
            JSON.stringify({
              ...JSON.parse(currentCred.metadata || '{}'),
              rotated_from: credential_id,
              rotation_date: new Date().toISOString(),
            }),
          ],
          type: sequelize.QueryTypes.INSERT,
          transaction,
        });

        // Log audit
        await logCredentialAudit(
          newCredentialId,
          req.user.organization_id,
          'rotated',
          req.user.id,
          'super_admin',
          req.ip,
          req.get('User-Agent'),
          {
            aggregator_id: aggregatorId,
            previous_credential_id: credential_id,
            grace_period_days: grace_period_days,
            grace_period_ends_at: gracePeriodEnd.toISOString(),
          },
          transaction
        );

        await transaction.commit();

        res.json({
          success: true,
          message: 'Credential rotated successfully',
          data: {
            old_credential_id: credential_id,
            new_credential_id: newCredentialId,
            new_client_id: newCredResult[0][0].client_id,
            new_client_secret: newClientSecret,
            new_version: newVersion,
            grace_period_ends_at: gracePeriodEnd.toISOString(),
            next_rotation_due: rotationDueDate.toISOString(),
          },
        });

      } catch (error) {
        await transaction.rollback();
        throw error;
      }

    } catch (error) {
      console.error('Error rotating credential:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to rotate credential',
        error: error.message,
      });
    }
  })
);

// ============================================================================
// REVOKE AGGREGATOR CREDENTIAL (EMERGENCY)
// ============================================================================

/**
 * POST /api/admin/aggregators/:aggregatorId/revoke-credential
 * Immediately revoke an aggregator's API credential (emergency)
 */
router.post('/aggregators/:aggregatorId/revoke-credential',
  authenticate,
  requireRole(['super_admin']),
  asyncHandler(async (req, res) => {
    const { aggregatorId } = req.params;
    const { credential_id, reason = 'No reason provided' } = req.body;

    try {
      const transaction = await sequelize.transaction();

      try {
        // Revoke the credential
        const revokeQuery = `
          UPDATE api_credentials
          SET status = 'revoked', is_active = false, revoked_at = NOW(), revoked_by = $1, revocation_reason = $2
          WHERE id = $3
          RETURNING id, client_id, status;
        `;

        const result = await sequelize.query(revokeQuery, {
          bind: [req.user.id, reason, credential_id],
          type: sequelize.QueryTypes.UPDATE,
          transaction,
        });

        // Log audit
        await logCredentialAudit(
          credential_id,
          req.user.organization_id,
          'revoked',
          req.user.id,
          'super_admin',
          req.ip,
          req.get('User-Agent'),
          {
            aggregator_id: aggregatorId,
            revocation_reason: reason,
          },
          transaction
        );

        await transaction.commit();

        res.json({
          success: true,
          message: 'Credential revoked successfully',
          data: {
            credential_id: credential_id,
            status: 'revoked',
            revoke_time: new Date().toISOString(),
          },
        });

      } catch (error) {
        await transaction.rollback();
        throw error;
      }

    } catch (error) {
      console.error('Error revoking credential:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to revoke credential',
        error: error.message,
      });
    }
  })
);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate OAuth-like client_id for aggregator
 * Format: agg_<aggregator_type>_<random_string>
 */
function generateClientId(aggregatorName, aggregatorType) {
  const typePrefix = aggregatorType.substr(0, 3).toLowerCase(); // e.g., 'may' for mayden
  const randomPart = crypto.randomBytes(12).toString('hex');
  return `agg_${typePrefix}_${randomPart}`;
}

/**
 * Log credential action to audit table
 */
async function logCredentialAudit(
  credentialId,
  organizationId,
  action,
  performedBy,
  performerRole,
  ipAddress,
  userAgent,
  actionDetails,
  transaction
) {
  const auditQuery = `
    INSERT INTO api_credential_audit_log (
      id, credential_id, organization_id, action,
      action_status, performed_by, performer_role, ip_address,
      user_agent, action_details, timestamp, created_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()
    )
  `;

  await sequelize.query(auditQuery, {
    bind: [
      crypto.randomUUID(),
      credentialId,
      organizationId,
      action,
      'success',
      performedBy,
      performerRole,
      ipAddress,
      userAgent,
      JSON.stringify(actionDetails),
    ],
    transaction,
  });
}

// ============================================================================
// EXPORT
// ============================================================================

export default router;
