/**
 * Organization-Specific Membership Plans Routes
 * 
 * Allows organization admins (hospital, clinic, lab, pharmacy, homecare) 
 * to customize master membership plans for their organization
 */

import express from 'express';
import { body, param, query } from 'express-validator';
import { authUser } from '../middleware/auth.middleware.js';
import { requireOrgAdmin } from '../middleware/org-admin.middleware.js';
import { authTeam, requirePermission as requireTeamPermission } from '../middleware/team.middleware.js';
import { MembershipPlan, UserPlan } from '../models/postgres/membershipPlan.model.postgres.js';
import UserPostgres from '../models/postgres/user.model.postgres.js';
import Corporate from '../models/postgres/corporate.model.postgres.js';
import { InsuranceBroker } from '../models/insurance-broker.model.intelligent.js';
import AuditLog from '../models/auditLog.model.intelligent.js';
import sharedPool from '../db/pgPool.js';

const router = express.Router();

const TEAM_PLAN_AUDIT_ACTIONS = [
  'TEAM_USER_PLAN_CUSTOMIZED',
  'TEAM_USER_PLAN_CUSTOMIZED_AND_ASSIGNED',
  'TEAM_USER_PLAN_CUSTOMIZATION_FAILED',
  'TEAM_USER_PLAN_ASSIGNMENT_APPROVAL_REQUIRED',
  'TEAM_USER_PLAN_ASSIGNMENT_APPROVED',
  'TEAM_USER_PLAN_ASSIGNMENT_REJECTED'
];

const parseJsonSafe = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return {};
  }
};

const toPositiveInt = (value) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const buildAppliedLimits = (plan) => {
  const coverage = plan?.metadata?.coverageDetails || {};
  return {
    benefitLimits: {
      pharmacyLimitINR: coverage?.pharmacy?.limitINR ?? 0,
      homeCareLimitINR: coverage?.homeCare?.limitINR ?? 0,
      ambulanceLimitINR: coverage?.ambulance?.limitINR ?? 0,
    },
    teleConsultLimits: {
      allSpecialties: coverage?.onlineConsult?.limit ?? 0,
    },
    healthCheckPackage: coverage?.healthCheck?.package ?? null,
    priceINR: Number(
      plan?.discountedPrice != null && plan?.discountedPrice !== '0.00' && plan?.discountedPrice !== 0
        ? plan?.discountedPrice
        : plan?.price
    ) || 0,
  };
};

const getCorporateIdForUser = (user) => {
  const directCorporateId = toPositiveInt(user?.corporateId || user?.corporate_id);
  if (directCorporateId) return directCorporateId;

  const orgType = String(user?.organization_type || '').toLowerCase();
  if (orgType === 'corporate') {
    return toPositiveInt(user?.organization_id || user?.tenant_id);
  }

  return null;
};

const fetchTeamCorporateAssociation = async (teamUserId, corporateId) => {
  const { rows } = await sharedPool.query(
    `SELECT id
       FROM user_associations
      WHERE "userId" = $1
        AND "entityType" = 'corporate'
        AND "entityId" = $2
        AND status = 'active'
      LIMIT 1`,
    [teamUserId, corporateId]
  );
  return rows[0] || null;
};

const ensureTeamPlanApprovalsTable = async () => {
  await sharedPool.query(`
    CREATE TABLE IF NOT EXISTS team_plan_customization_approvals (
      id SERIAL PRIMARY KEY,
      target_user_id INTEGER NOT NULL,
      corporate_id INTEGER NOT NULL,
      master_plan_id INTEGER NOT NULL,
      customized_plan_id INTEGER NOT NULL,
      requested_by_team_user_id INTEGER NOT NULL,
      requested_price NUMERIC(12,2) NOT NULL DEFAULT 0,
      apply_to_user BOOLEAN NOT NULL DEFAULT TRUE,
      request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'pending',
      requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      decided_at TIMESTAMPTZ NULL,
      decided_by_team_user_id INTEGER NULL,
      decision_notes TEXT NULL,
      assigned_user_plan_id INTEGER NULL,
      CONSTRAINT team_plan_customization_approvals_status_check
        CHECK (status IN ('pending', 'approved', 'rejected'))
    );
  `);

  await sharedPool.query('CREATE INDEX IF NOT EXISTS idx_tpca_status_requested_at ON team_plan_customization_approvals(status, requested_at DESC)');
  await sharedPool.query('CREATE INDEX IF NOT EXISTS idx_tpca_target_user ON team_plan_customization_approvals(target_user_id)');
  await sharedPool.query('CREATE INDEX IF NOT EXISTS idx_tpca_corporate ON team_plan_customization_approvals(corporate_id)');
};

const resolvePlanPriceINR = (planLike) => {
  const discounted = Number(planLike?.discountedPrice);
  if (Number.isFinite(discounted) && discounted > 0) return discounted;
  const price = Number(planLike?.price);
  if (Number.isFinite(price) && price > 0) return price;
  return 0;
};

const applyCustomizedPlanToUser = async ({ targetUser, corporate, broker, customizedPlan, teamUserId, startDate, durationMonths, activeUserPlan }) => {
  const normalizedStartDate = new Date(startDate.toISOString().slice(0, 10));
  const endDate = new Date(normalizedStartDate);
  endDate.setDate(endDate.getDate() + (durationMonths * 30));

  const activePlans = await UserPlan.findAll({
    where: { userId: targetUser.id, status: 'active' }
  });

  for (const plan of activePlans) {
    const metadata = parseJsonSafe(plan.metadata);
    await plan.update({
      status: 'inactive',
      metadata: {
        ...metadata,
        replacedByPlanId: customizedPlan.id,
        replacedAt: new Date().toISOString(),
        replacedByTeamUserId: teamUserId
      }
    });
  }

  return UserPlan.create({
    userId: targetUser.id,
    membershipPlanId: customizedPlan.id,
    startDate: normalizedStartDate.toISOString().slice(0, 10),
    endDate: endDate.toISOString().slice(0, 10),
    status: 'active',
    autoRenew: false,
    paidAmount: 0,
    paymentMethod: 'corporate',
    metadata: {
      source: 'team-managed-customization',
      managedByTeamUserId: teamUserId,
      corporateId: corporate.id,
      corporateName: corporate.companyName,
      brokerId: broker?.id || null,
      aggregatorId: corporate.aggregatorId || null,
      aggregatorType: corporate.aggregatorType || null,
      previousActivePlanId: activeUserPlan?.id || null,
      appliedLimits: buildAppliedLimits(customizedPlan),
      usage: { benefitINR: { pharmacyINR: 0, homeCareINR: 0, ambulanceINR: 0 }, teleConsult: {} }
    }
  });
};

const logTeamManagedPlanAudit = async ({ req, action, status = 'SUCCESS', statusCode, targetUser, corporate, masterPlan, customizedPlan, userPlan, applyToUser, metadata = {}, errorMessage = null }) => {
  try {
    await AuditLog.logEvent({
      userId: String(req?.teamUser?.id || req?.user?.id || ''),
      userType: 'team',
      userEmail: req?.teamUser?.email || req?.user?.email || null,
      action,
      resourceType: 'MembershipPlan',
      resourceId: String(customizedPlan?.id || masterPlan?.id || ''),
      req,
      status,
      statusCode: statusCode ?? (status === 'SUCCESS' ? 201 : 500),
      errorMessage,
      isPII: true,
      purpose: 'Team-managed corporate plan customization and assignment governance',
      dataFields: {
        targetUserId: targetUser?.id || null,
        corporateId: corporate?.id || null,
        masterPlanId: masterPlan?.id || null,
        customizedPlanId: customizedPlan?.id || null,
        userPlanId: userPlan?.id || null,
        applyToUser: Boolean(applyToUser),
        ...metadata
      }
    });
  } catch (auditError) {
    console.warn('[Team User Plan] Audit log failed:', auditError?.message || auditError);
  }
};

const resolveManagedUserPlanContext = async ({ teamUser, targetUserId }) => {
  const normalizedTargetUserId = toPositiveInt(targetUserId);
  if (!normalizedTargetUserId) {
    return { error: { status: 400, message: 'Valid userId is required' } };
  }

  const targetUser = await UserPostgres.findByPk(normalizedTargetUserId, {
    attributes: [
      'id',
      'firstName',
      'lastName',
      'email',
      'phoneNumber',
      'corporateId',
      'organization_id',
      'organization_type',
      'tenant_id',
      'metadata'
    ]
  });

  if (!targetUser) {
    return { error: { status: 404, message: 'Target user not found' } };
  }

  const userCorporateId = getCorporateIdForUser(targetUser);
  if (!userCorporateId) {
    return {
      error: {
        status: 400,
        message: 'Target user is not linked to a corporate context required for team-managed plan customization'
      }
    };
  }

  const corporate = await Corporate.findByPk(userCorporateId, {
    attributes: ['id', 'companyName', 'assignedTo', 'onboardedById', 'aggregatorId', 'aggregatorType', 'status']
  });

  if (!corporate) {
    return { error: { status: 404, message: 'Corporate for target user was not found' } };
  }

  const targetUserMetadata = parseJsonSafe(targetUser.metadata);
  const managedByTeamUserId = toPositiveInt(
    targetUserMetadata?.managedByTeamUserId || targetUserMetadata?.teamManagerUserId
  );

  const teamUserId = toPositiveInt(teamUser?.id);
  const isTeamAdmin = Boolean(teamUser?.isAdmin || ['admin', 'super_admin', 'team_admin'].includes(String(teamUser?.role || '').toLowerCase()));

  const directCorporateOwner =
    toPositiveInt(corporate.assignedTo) === teamUserId ||
    toPositiveInt(corporate.onboardedById) === teamUserId;
  const directUserManager = managedByTeamUserId === teamUserId;
  const associationLink = await fetchTeamCorporateAssociation(teamUserId, corporate.id);

  const canManage = isTeamAdmin || directCorporateOwner || directUserManager || Boolean(associationLink);
  if (!canManage) {
    return {
      error: {
        status: 403,
        message: 'Access denied. Team user is not assigned to this user/corporate management chain.'
      }
    };
  }

  let broker = null;
  const aggregatorType = String(corporate.aggregatorType || '').toLowerCase();
  const aggregatorId = toPositiveInt(corporate.aggregatorId);
  if (aggregatorId && ['broker', 'insurance_broker'].includes(aggregatorType)) {
    broker = await InsuranceBroker.findByPk(aggregatorId, {
      attributes: ['id', 'brokerName', 'email', 'phoneNumber', 'status']
    });
  }

  const activeUserPlan = await UserPlan.findOne({
    where: {
      userId: targetUser.id,
      status: 'active'
    },
    include: [{ model: MembershipPlan, as: 'plan' }],
    order: [['createdAt', 'DESC']]
  });

  return {
    context: {
      targetUser,
      corporate,
      broker,
      activeUserPlan,
      ownership: {
        isTeamAdmin,
        directCorporateOwner,
        directUserManager,
        associationLink: Boolean(associationLink)
      }
    }
  };
};

// ============================================================================
// MASTER PLANS (Read-Only for Org Admins)
// ============================================================================

/**
 * GET /api/org-membership-plans/master-plans
 * Get all master plans created by super admin
 * Organization admins can view these to customize
 */
router.get('/master-plans', authUser, requireOrgAdmin, async (req, res) => {
  try {
    const masterPlans = await MembershipPlan.findAll({
      where: {
        isMaster: true,
        isActive: true
      },
      order: [['sortOrder', 'ASC'], ['price', 'ASC']],
      attributes: { exclude: ['customizedBy', 'customizationNotes'] }
    });

    res.json({
      success: true,
      data: {
        masterPlans,
        count: masterPlans.length
      }
    });
  } catch (error) {
    console.error('[Org Plans] Get master plans error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch master plans',
      error: error.message
    });
  }
});

// ============================================================================
// TEAM-MANAGED USER PLAN CUSTOMIZATION (Corporate/Broker/Aggregator Chain)
// ============================================================================

/**
 * GET /api/org-membership-plans/team/users/:userId/plan-context
 * Fetch ownership-validated context for a user under team management chain.
 */
router.get(
  '/team/users/:userId/plan-context',
  authTeam,
  requireTeamPermission(['plans', 'membership', 'corporate management']),
  [param('userId').isInt()],
  async (req, res) => {
    try {
      const resolved = await resolveManagedUserPlanContext({
        teamUser: req.teamUser,
        targetUserId: req.params.userId
      });

      if (resolved.error) {
        return res.status(resolved.error.status).json({ success: false, message: resolved.error.message });
      }

      const masterPlans = await MembershipPlan.findAll({
        where: { isMaster: true, isActive: true },
        order: [['sortOrder', 'ASC'], ['price', 'ASC']]
      });

      return res.json({
        success: true,
        data: {
          ...resolved.context,
          availableMasterPlans: masterPlans
        }
      });
    } catch (error) {
      console.error('[Team User Plan] Context error:', error);
      return res.status(500).json({ success: false, message: 'Failed to fetch user plan context', error: error.message });
    }
  }
);

/**
 * GET /api/org-membership-plans/team/audit-logs
 * Review audit logs for team-managed user plan customization and approvals.
 */
router.get(
  '/team/audit-logs',
  authTeam,
  requireTeamPermission(['audit access', 'corporate management']),
  [
    query('limit').optional().isInt({ min: 1, max: 200 }),
    query('offset').optional().isInt({ min: 0 }),
    query('status').optional().isString(),
    query('action').optional().isString(),
    query('corporateId').optional().isInt({ min: 1 }),
    query('targetUserId').optional().isInt({ min: 1 })
  ],
  async (req, res) => {
    try {
      const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit || '50'), 10), 1), 200);
      const offset = Math.max(Number.parseInt(String(req.query.offset || '0'), 10), 0);

      const params = [TEAM_PLAN_AUDIT_ACTIONS];
      const where = ['action = ANY($1)'];

      if (req.query.status) {
        params.push(String(req.query.status).toUpperCase());
        where.push(`status = $${params.length}`);
      }

      if (req.query.action) {
        params.push(String(req.query.action));
        where.push(`action = $${params.length}`);
      }

      if (toPositiveInt(req.query.corporateId)) {
        params.push(String(toPositiveInt(req.query.corporateId)));
        where.push(`data_fields->>'corporateId' = $${params.length}`);
      }

      if (toPositiveInt(req.query.targetUserId)) {
        params.push(String(toPositiveInt(req.query.targetUserId)));
        where.push(`data_fields->>'targetUserId' = $${params.length}`);
      }

      params.push(limit);
      params.push(offset);

      const queryText = `
        SELECT id, action, user_id, user_email, status, status_code, data_fields, purpose, timestamp, created_at
          FROM audit_logs
         WHERE ${where.join(' AND ')}
         ORDER BY COALESCE(timestamp, created_at) DESC
         LIMIT $${params.length - 1}
        OFFSET $${params.length}
      `;

      const { rows } = await sharedPool.query(queryText, params);

      return res.json({
        success: true,
        data: {
          logs: rows,
          limit,
          offset,
          hasMore: rows.length === limit
        }
      });
    } catch (error) {
      console.error('[Team User Plan] Audit logs error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch team-managed plan audit logs',
        error: error.message
      });
    }
  }
);

/**
 * GET /api/org-membership-plans/team/plan-approvals
 * List high-value customization approvals.
 */
router.get(
  '/team/plan-approvals',
  authTeam,
  requireTeamPermission(['audit access', 'corporate management']),
  [
    query('status').optional().isString(),
    query('corporateId').optional().isInt({ min: 1 }),
    query('targetUserId').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 200 }),
    query('offset').optional().isInt({ min: 0 })
  ],
  async (req, res) => {
    try {
      await ensureTeamPlanApprovalsTable();

      const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit || '50'), 10), 1), 200);
      const offset = Math.max(Number.parseInt(String(req.query.offset || '0'), 10), 0);

      const params = [];
      const where = ['1=1'];

      if (req.query.status) {
        params.push(String(req.query.status).toLowerCase());
        where.push(`LOWER(status) = $${params.length}`);
      }

      if (toPositiveInt(req.query.corporateId)) {
        params.push(toPositiveInt(req.query.corporateId));
        where.push(`corporate_id = $${params.length}`);
      }

      if (toPositiveInt(req.query.targetUserId)) {
        params.push(toPositiveInt(req.query.targetUserId));
        where.push(`target_user_id = $${params.length}`);
      }

      params.push(limit);
      params.push(offset);

      const queryText = `
        SELECT *
          FROM team_plan_customization_approvals
         WHERE ${where.join(' AND ')}
         ORDER BY requested_at DESC
         LIMIT $${params.length - 1}
        OFFSET $${params.length}
      `;

      const { rows } = await sharedPool.query(queryText, params);
      return res.json({
        success: true,
        data: {
          approvals: rows,
          limit,
          offset,
          hasMore: rows.length === limit
        }
      });
    } catch (error) {
      console.error('[Team User Plan] List approvals error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch plan approval queue',
        error: error.message
      });
    }
  }
);

/**
 * POST /api/org-membership-plans/team/plan-approvals/:approvalId/decision
 * Approve or reject high-value plan assignment requests.
 */
router.post(
  '/team/plan-approvals/:approvalId/decision',
  authTeam,
  requireTeamPermission(['audit access', 'corporate management']),
  [
    param('approvalId').isInt({ min: 1 }),
    body('decision').isIn(['approve', 'reject']),
    body('notes').optional().isString()
  ],
  async (req, res) => {
    try {
      await ensureTeamPlanApprovalsTable();

      const approvalId = toPositiveInt(req.params.approvalId);
      const decision = String(req.body.decision || '').toLowerCase();
      const notes = req.body.notes || null;

      const { rows } = await sharedPool.query(
        'SELECT * FROM team_plan_customization_approvals WHERE id = $1 LIMIT 1',
        [approvalId]
      );
      const approval = rows[0];

      if (!approval) {
        return res.status(404).json({ success: false, message: 'Approval request not found' });
      }

      if (approval.status !== 'pending') {
        return res.status(409).json({ success: false, message: `Approval request already ${approval.status}` });
      }

      if (decision === 'reject') {
        await sharedPool.query(
          `UPDATE team_plan_customization_approvals
              SET status = 'rejected',
                  decided_at = NOW(),
                  decided_by_team_user_id = $2,
                  decision_notes = $3
            WHERE id = $1`,
          [approvalId, req.teamUser.id, notes]
        );

        await logTeamManagedPlanAudit({
          req,
          action: 'TEAM_USER_PLAN_ASSIGNMENT_REJECTED',
          status: 'SUCCESS',
          statusCode: 200,
          applyToUser: true,
          metadata: {
            approvalId,
            targetUserId: approval.target_user_id,
            corporateId: approval.corporate_id,
            decisionNotes: notes
          }
        });

        return res.json({
          success: true,
          message: 'Approval request rejected successfully',
          data: { approvalId, status: 'rejected' }
        });
      }

      const resolved = await resolveManagedUserPlanContext({
        teamUser: req.teamUser,
        targetUserId: approval.target_user_id
      });
      if (resolved.error) {
        return res.status(resolved.error.status).json({ success: false, message: resolved.error.message });
      }

      const { targetUser, corporate, broker, activeUserPlan } = resolved.context;
      const customizedPlan = await MembershipPlan.findByPk(approval.customized_plan_id);

      if (!customizedPlan) {
        return res.status(404).json({ success: false, message: 'Customized plan for approval request no longer exists' });
      }

      const requestPayload = parseJsonSafe(approval.request_payload);
      const startDate = requestPayload?.startDate ? new Date(requestPayload.startDate) : new Date();
      const durationMonths = Number.parseInt(String(requestPayload?.durationMonths || customizedPlan.durationMonths || 1), 10) || 1;

      const userPlan = await applyCustomizedPlanToUser({
        targetUser,
        corporate,
        broker,
        customizedPlan,
        teamUserId: toPositiveInt(req.teamUser.id),
        startDate,
        durationMonths,
        activeUserPlan
      });

      await sharedPool.query(
        `UPDATE team_plan_customization_approvals
            SET status = 'approved',
                decided_at = NOW(),
                decided_by_team_user_id = $2,
                decision_notes = $3,
                assigned_user_plan_id = $4
          WHERE id = $1`,
        [approvalId, req.teamUser.id, notes, userPlan.id]
      );

      await logTeamManagedPlanAudit({
        req,
        action: 'TEAM_USER_PLAN_ASSIGNMENT_APPROVED',
        status: 'SUCCESS',
        statusCode: 200,
        targetUser,
        corporate,
        customizedPlan,
        userPlan,
        applyToUser: true,
        metadata: {
          approvalId,
          requestedPrice: approval.requested_price,
          decisionNotes: notes
        }
      });

      return res.json({
        success: true,
        message: 'Approval request approved and plan assigned successfully',
        data: { approvalId, status: 'approved', userPlan }
      });
    } catch (error) {
      console.error('[Team User Plan] Approval decision error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to process approval decision',
        error: error.message
      });
    }
  }
);

/**
 * POST /api/org-membership-plans/team/users/:userId/customize-plan
 * Team user customizes a corporate-scoped plan and applies it to the target user.
 */
router.post(
  '/team/users/:userId/customize-plan',
  authTeam,
  requireTeamPermission(['plans', 'membership', 'corporate management']),
  [
    param('userId').isInt(),
    body('masterPlanId').isInt(),
    body('applyToUser').optional().isBoolean(),
    body('customizationNotes').optional().isString(),
    body('name').optional().isString(),
    body('description').optional().isString(),
    body('price').optional().isFloat({ min: 0 }),
    body('discountedPrice').optional().isFloat({ min: 0 }),
    body('durationMonths').optional().isInt({ min: 1 }),
    body('features').optional().isObject(),
    body('benefits').optional().isArray(),
    body('limitations').optional().isObject(),
    body('maxUsers').optional().isInt({ min: 1 }),
    body('startDate').optional().isISO8601(),
    body('approvalBypassReason').optional().isString()
  ],
  async (req, res) => {
    try {
      const resolved = await resolveManagedUserPlanContext({
        teamUser: req.teamUser,
        targetUserId: req.params.userId
      });
      if (resolved.error) {
        return res.status(resolved.error.status).json({ success: false, message: resolved.error.message });
      }

      const { targetUser, corporate, broker, activeUserPlan } = resolved.context;
      const masterPlanId = toPositiveInt(req.body.masterPlanId);
      const masterPlan = await MembershipPlan.findOne({
        where: { id: masterPlanId, isMaster: true, isActive: true }
      });

      if (!masterPlan) {
        return res.status(404).json({ success: false, message: 'Master plan not found or inactive' });
      }

      const teamUserId = toPositiveInt(req.teamUser.id);
      const applyToUser = req.body.applyToUser !== false;
      const startDate = req.body.startDate ? new Date(req.body.startDate) : new Date();
      const durationMonths = req.body.durationMonths || masterPlan.durationMonths || 1;

      const customizationPayload = {
        name: req.body.name || `${masterPlan.name} (${corporate.companyName})`,
        description: req.body.description || masterPlan.description,
        price: req.body.price !== undefined ? req.body.price : masterPlan.price,
        discountedPrice: req.body.discountedPrice !== undefined ? req.body.discountedPrice : masterPlan.discountedPrice,
        durationMonths,
        features: {
          ...(masterPlan.features || {}),
          ...(req.body.features || {})
        },
        benefits: req.body.benefits || masterPlan.benefits,
        limitations: req.body.limitations || masterPlan.limitations,
        maxUsers: req.body.maxUsers || masterPlan.maxUsers,
        isActive: true,
        isFeatured: req.body.isFeatured || false,
        sortOrder: req.body.sortOrder || masterPlan.sortOrder,
        customizationNotes: req.body.customizationNotes || null,
        metadata: {
          ...(masterPlan.metadata || {}),
          customization: {
            customizedAt: new Date().toISOString(),
            customizedByTeamUserId: teamUserId,
            targetUserId: targetUser.id,
            corporateId: corporate.id,
            corporateName: corporate.companyName,
            brokerId: broker?.id || null,
            aggregatorId: corporate.aggregatorId || null,
            aggregatorType: corporate.aggregatorType || null
          }
        }
      };

      let customizedPlan = await MembershipPlan.findOne({
        where: {
          masterPlanId: masterPlan.id,
          organizationId: corporate.id,
          organizationType: 'corporate',
          isMaster: false
        }
      });

      if (customizedPlan) {
        await customizedPlan.update(customizationPayload);
      } else {
        customizedPlan = await MembershipPlan.create({
          ...customizationPayload,
          code: `${masterPlan.code || `MP${masterPlan.id}`}_CORP${corporate.id}`,
          type: masterPlan.type,
          isMaster: false,
          masterPlanId: masterPlan.id,
          organizationId: corporate.id,
          organizationType: 'corporate',
          customizedBy: teamUserId,
          planType: masterPlan.planType || 'primary',
          tier: masterPlan.tier || 1,
          tierName: masterPlan.tierName || null
        });
      }

      const approvalThresholdINR = Number.parseInt(String(process.env.TEAM_PLAN_APPROVAL_THRESHOLD_INR || '50000'), 10) || 50000;
      const requestedPrice = resolvePlanPriceINR({
        discountedPrice: customizationPayload.discountedPrice,
        price: customizationPayload.price
      });
      const approvalBypassEnabled = String(process.env.TEAM_PLAN_APPROVAL_BYPASS_ENABLED || 'false').toLowerCase() === 'true';
      const approvalBypassReason = req.body.approvalBypassReason ? String(req.body.approvalBypassReason).trim() : null;
      const requiresApproval = applyToUser && requestedPrice >= approvalThresholdINR && !(approvalBypassEnabled && approvalBypassReason);

      if (requiresApproval) {
        await ensureTeamPlanApprovalsTable();
        const insertResult = await sharedPool.query(
          `INSERT INTO team_plan_customization_approvals (
             target_user_id,
             corporate_id,
             master_plan_id,
             customized_plan_id,
             requested_by_team_user_id,
             requested_price,
             apply_to_user,
             request_payload
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           RETURNING *`,
          [
            targetUser.id,
            corporate.id,
            masterPlan.id,
            customizedPlan.id,
            teamUserId,
            requestedPrice,
            true,
            JSON.stringify({
              startDate: startDate.toISOString(),
              durationMonths,
              requestedPrice,
              thresholdINR: approvalThresholdINR,
              customizationNotes: req.body.customizationNotes || null
            })
          ]
        );

        const approvalRequest = insertResult.rows[0];

        await logTeamManagedPlanAudit({
          req,
          action: 'TEAM_USER_PLAN_ASSIGNMENT_APPROVAL_REQUIRED',
          status: 'SUCCESS',
          statusCode: 202,
          targetUser,
          corporate,
          masterPlan,
          customizedPlan,
          applyToUser,
          metadata: {
            requestedPrice,
            approvalThresholdINR,
            approvalRequestId: approvalRequest?.id
          }
        });

        return res.status(202).json({
          success: true,
          pendingApproval: true,
          message: 'High-value plan assignment requires approval before applying to user',
          data: {
            targetUser: {
              id: targetUser.id,
              firstName: targetUser.firstName,
              lastName: targetUser.lastName,
              email: targetUser.email,
              phoneNumber: targetUser.phoneNumber
            },
            corporate,
            broker,
            masterPlan,
            customizedPlan,
            requestedPrice,
            approvalThresholdINR,
            approvalRequest
          }
        });
      }

      let newUserPlan = null;
      if (applyToUser) {
        newUserPlan = await applyCustomizedPlanToUser({
          targetUser,
          corporate,
          broker,
          customizedPlan,
          teamUserId,
          startDate,
          durationMonths,
          activeUserPlan
        });
      }

      await logTeamManagedPlanAudit({
        req,
        action: applyToUser ? 'TEAM_USER_PLAN_CUSTOMIZED_AND_ASSIGNED' : 'TEAM_USER_PLAN_CUSTOMIZED',
        targetUser,
        corporate,
        masterPlan,
        customizedPlan,
        userPlan: newUserPlan,
        applyToUser,
        metadata: {
          brokerId: broker?.id || null,
          aggregatorId: corporate?.aggregatorId || null,
          aggregatorType: corporate?.aggregatorType || null
        }
      });

      return res.status(201).json({
        success: true,
        message: applyToUser
          ? 'Team-managed plan customization created and applied to user successfully'
          : 'Team-managed plan customization created successfully',
        data: {
          targetUser: {
            id: targetUser.id,
            firstName: targetUser.firstName,
            lastName: targetUser.lastName,
            email: targetUser.email,
            phoneNumber: targetUser.phoneNumber
          },
          corporate,
          broker,
          masterPlan,
          customizedPlan,
          userPlan: newUserPlan
        }
      });
    } catch (error) {
      await logTeamManagedPlanAudit({
        req,
        action: 'TEAM_USER_PLAN_CUSTOMIZATION_FAILED',
        status: 'FAILURE',
        applyToUser: req.body?.applyToUser !== false,
        errorMessage: error?.message || 'Unexpected customization failure'
      });
      console.error('[Team User Plan] Customize error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to customize/apply user plan under team management flow',
        error: error.message
      });
    }
  }
);

// ============================================================================
// ORGANIZATION CUSTOMIZED PLANS
// ============================================================================

/**
 * GET /api/org-membership-plans/my-plans
 * Get customized plans for current organization
 */
router.get('/my-plans', authUser, requireOrgAdmin, async (req, res) => {
  try {
    const { organization_id, organization_type } = req.user;

    if (!organization_id) {
      return res.status(400).json({
        success: false,
        message: 'No organization associated with this account'
      });
    }

    const customPlans = await MembershipPlan.findAll({
      where: {
        organizationId: organization_id,
        organizationType: organization_type
      },
      include: [
        {
          model: MembershipPlan,
          as: 'masterPlan',
          attributes: ['id', 'name', 'code', 'description', 'price', 'features']
        }
      ],
      order: [['sortOrder', 'ASC'], ['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      data: {
        plans: customPlans,
        organizationId: organization_id,
        organizationType: organization_type,
        count: customPlans.length
      }
    });
  } catch (error) {
    console.error('[Org Plans] Get my plans error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch organization plans',
      error: error.message
    });
  }
});

/**
 * POST /api/org-membership-plans/customize/:masterPlanId
 * Customize a master plan for current organization
 */
router.post('/customize/:masterPlanId', 
  authUser, 
  requireOrgAdmin,
  [
    param('masterPlanId').isInt(),
    body('name').optional().trim().notEmpty(),
    body('price').optional().isFloat({ min: 0 }),
    body('features').optional().isObject(),
    body('benefits').optional().isArray(),
    body('customizationNotes').optional().trim()
  ],
  async (req, res) => {
    try {
      const { masterPlanId } = req.params;
      const { organization_id, organization_type, id: userId } = req.user;

      if (!organization_id) {
        return res.status(400).json({
          success: false,
          message: 'No organization associated with this account'
        });
      }

      // Verify master plan exists
      const masterPlan = await MembershipPlan.findOne({
        where: {
          id: masterPlanId,
          isMaster: true
        }
      });

      if (!masterPlan) {
        return res.status(404).json({
          success: false,
          message: 'Master plan not found'
        });
      }

      // Check if organization already has a customization of this master plan
      const existingCustomization = await MembershipPlan.findOne({
        where: {
          masterPlanId,
          organizationId: organization_id
        }
      });

      if (existingCustomization) {
        return res.status(409).json({
          success: false,
          message: 'Organization already has a customization of this master plan',
          data: { existingPlanId: existingCustomization.id }
        });
      }

      // Create customized plan
      const customizedPlan = await MembershipPlan.create({
        // Base from master plan
        name: req.body.name || `${masterPlan.name} (${organization_type})`,
        code: `${masterPlan.code}_ORG${organization_id}`,
        description: req.body.description || masterPlan.description,
        type: masterPlan.type,
        price: req.body.price !== undefined ? req.body.price : masterPlan.price,
        discountedPrice: req.body.discountedPrice !== undefined 
          ? req.body.discountedPrice 
          : masterPlan.discountedPrice,
        durationMonths: req.body.durationMonths || masterPlan.durationMonths,
        
        // Merge features (org can add/override)
        features: {
          ...masterPlan.features,
          ...req.body.features
        },
        benefits: req.body.benefits || masterPlan.benefits,
        limitations: req.body.limitations || masterPlan.limitations,
        maxUsers: req.body.maxUsers || masterPlan.maxUsers,
        
        // Customization metadata
        isMaster: false,
        masterPlanId: masterPlan.id,
        organizationId: organization_id,
        organizationType: organization_type,
        customizedBy: userId,
        customizationNotes: req.body.customizationNotes || null,
        
        // Status
        isActive: req.body.isActive !== undefined ? req.body.isActive : true,
        isFeatured: req.body.isFeatured || false,
        sortOrder: req.body.sortOrder || masterPlan.sortOrder,
        
        metadata: {
          customizedFrom: masterPlan.id,
          customizedAt: new Date().toISOString(),
          customizedByUser: userId,
          organizationName: req.user.organization_name || 'Unknown'
        }
      });

      res.status(201).json({
        success: true,
        message: 'Plan customized successfully for your organization',
        data: {
          plan: customizedPlan,
          masterPlan: {
            id: masterPlan.id,
            name: masterPlan.name,
            code: masterPlan.code
          }
        }
      });

    } catch (error) {
      console.error('[Org Plans] Customize plan error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to customize plan',
        error: error.message
      });
    }
  }
);

/**
 * PUT /api/org-membership-plans/my-plans/:planId
 * Update organization's customized plan
 */
router.put('/my-plans/:planId',
  authUser,
  requireOrgAdmin,
  [
    param('planId').isInt(),
    body('name').optional().trim().notEmpty(),
    body('price').optional().isFloat({ min: 0 }),
    body('features').optional().isObject(),
    body('benefits').optional().isArray()
  ],
  async (req, res) => {
    try {
      const { planId } = req.params;
      const { organization_id } = req.user;

      // Find plan and verify ownership
      const plan = await MembershipPlan.findOne({
        where: {
          id: planId,
          organizationId: organization_id,
          isMaster: false
        }
      });

      if (!plan) {
        return res.status(404).json({
          success: false,
          message: 'Plan not found or does not belong to your organization'
        });
      }

      // Update allowed fields
      const updateData = {};
      const allowedFields = [
        'name', 'description', 'price', 'discountedPrice', 'durationMonths',
        'features', 'benefits', 'limitations', 'maxUsers',
        'isActive', 'isFeatured', 'sortOrder', 'customizationNotes'
      ];

      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      });

      await plan.update(updateData);

      res.json({
        success: true,
        message: 'Plan updated successfully',
        data: { plan }
      });

    } catch (error) {
      console.error('[Org Plans] Update plan error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update plan',
        error: error.message
      });
    }
  }
);

/**
 * DELETE /api/org-membership-plans/my-plans/:planId
 * Delete organization's customized plan
 */
router.delete('/my-plans/:planId',
  authUser,
  requireOrgAdmin,
  [param('planId').isInt()],
  async (req, res) => {
    try {
      const { planId } = req.params;
      const { organization_id } = req.user;

      const plan = await MembershipPlan.findOne({
        where: {
          id: planId,
          organizationId: organization_id,
          isMaster: false
        }
      });

      if (!plan) {
        return res.status(404).json({
          success: false,
          message: 'Plan not found or does not belong to your organization'
        });
      }

      // Soft delete by marking inactive
      await plan.update({ isActive: false });

      res.json({
        success: true,
        message: 'Plan deactivated successfully'
      });

    } catch (error) {
      console.error('[Org Plans] Delete plan error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete plan',
        error: error.message
      });
    }
  }
);

/**
 * POST /api/org-membership-plans/reset/:planId
 * Reset customized plan to master plan defaults
 */
router.post('/reset/:planId',
  authUser,
  requireOrgAdmin,
  [param('planId').isInt()],
  async (req, res) => {
    try {
      const { planId } = req.params;
      const { organization_id } = req.user;

      const plan = await MembershipPlan.findOne({
        where: {
          id: planId,
          organizationId: organization_id,
          isMaster: false
        },
        include: [{
          model: MembershipPlan,
          as: 'masterPlan'
        }]
      });

      if (!plan) {
        return res.status(404).json({
          success: false,
          message: 'Plan not found or does not belong to your organization'
        });
      }

      if (!plan.masterPlan) {
        return res.status(400).json({
          success: false,
          message: 'No master plan associated with this customized plan'
        });
      }

      const master = plan.masterPlan;

      // Reset to master plan values
      await plan.update({
        price: master.price,
        discountedPrice: master.discountedPrice,
        durationMonths: master.durationMonths,
        features: master.features,
        benefits: master.benefits,
        limitations: master.limitations,
        maxUsers: master.maxUsers,
        customizationNotes: 'Reset to master plan defaults'
      });

      res.json({
        success: true,
        message: 'Plan reset to master plan defaults',
        data: { plan }
      });

    } catch (error) {
      console.error('[Org Plans] Reset plan error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to reset plan',
        error: error.message
      });
    }
  }
);

/**
 * GET /api/org-membership-plans/statistics
 * Get plan usage statistics for organization
 */
router.get('/statistics',
  authUser,
  requireOrgAdmin,
  async (req, res) => {
    try {
      const { organization_id } = req.user;

      const stats = {
        totalCustomizedPlans: await MembershipPlan.count({
          where: { organizationId: organization_id, isMaster: false }
        }),
        activePlans: await MembershipPlan.count({
          where: { organizationId: organization_id, isMaster: false, isActive: true }
        }),
        inactivePlans: await MembershipPlan.count({
          where: { organizationId: organization_id, isMaster: false, isActive: false }
        })
        // Add subscription counts if needed
      };

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      console.error('[Org Plans] Statistics error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch statistics',
        error: error.message
      });
    }
  }
);

export default router;
