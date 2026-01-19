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
import { MembershipPlan } from '../models/postgres/membershipPlan.model.postgres.js';

const router = express.Router();

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
