/**
 * Coupon Routes
 * Manage corporate HC purchase coupons
 */

import express from 'express';
import { authTeam } from '../middleware/team.middleware.js';
import { Coupon, CouponUsage } from '../models/index.js';
import { seedPromoCoupons } from '../services/promo-coupon-seed.service.js';
import { Op } from 'sequelize';

const router = express.Router();

const requireOpsTeamMember = (req, res, next) => {
  const teamUser = req.teamUser;

  if (!teamUser) {
    return res.status(401).json({
      success: false,
      message: 'Team authentication required'
    });
  }

  if (teamUser.isAdmin || ['admin', 'super_admin'].includes((teamUser.role || '').toLowerCase())) {
    return next();
  }

  const permissions = Array.isArray(teamUser.permissions) ? teamUser.permissions : [];
  const hasCouponPermission = permissions.some((permission) => {
    const normalized = String(permission || '').trim().toLowerCase();
    return normalized === 'coupons.manage' || normalized === 'coupon management';
  });

  if (!hasCouponPermission) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. coupons.manage permission is required.'
    });
  }

  next();
};

const normalizeAssignedUserIds = (value) => {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .map((id) => parseInt(id, 10))
      .filter((id) => Number.isInteger(id) && id > 0);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((id) => parseInt(id.trim(), 10))
      .filter((id) => Number.isInteger(id) && id > 0);
  }

  return [];
};

const COUPON_SCOPES = {
  COINS_PURCHASE: 'COINS_PURCHASE',
  HEALTH_CHECKUP: 'HEALTH_CHECKUP',
  PHARMACY_PURCHASE: 'PHARMACY_PURCHASE',
  CONSULTATION: 'CONSULTATION',
  GYM_MEMBERSHIP: 'GYM_MEMBERSHIP',
  MEMBERSHIP: 'MEMBERSHIP',
  USG_SCAN: 'USG_SCAN',
  CT_SCAN: 'CT_SCAN',
  MRI_SCAN: 'MRI_SCAN'
};

const MEMBERSHIP_SCOPES = [COUPON_SCOPES.GYM_MEMBERSHIP, COUPON_SCOPES.MEMBERSHIP];
const DIAGNOSTIC_SCOPES = [COUPON_SCOPES.USG_SCAN, COUPON_SCOPES.CT_SCAN, COUPON_SCOPES.MRI_SCAN];

const SAMPLE_COUPON_DEFINITIONS = [
  {
    code: 'COINBOOST20',
    type: 'PERCENTAGE',
    value: 20,
    minPurchase: 100,
    description: '20% off on Health Coins purchase',
    scopes: [COUPON_SCOPES.COINS_PURCHASE]
  },
  {
    code: 'CHECKUP15',
    type: 'PERCENTAGE',
    value: 15,
    minPurchase: 499,
    description: '15% off on health checkups',
    scopes: [COUPON_SCOPES.HEALTH_CHECKUP]
  },
  {
    code: 'PHARM10',
    type: 'PERCENTAGE',
    value: 10,
    minPurchase: 299,
    description: '10% off on pharmacy purchases',
    scopes: [COUPON_SCOPES.PHARMACY_PURCHASE]
  },
  {
    code: 'CONSULT25',
    type: 'PERCENTAGE',
    value: 25,
    minPurchase: 199,
    description: '25% off on doctor consultations',
    scopes: [COUPON_SCOPES.CONSULTATION]
  },
  {
    code: 'MEMBER20',
    type: 'PERCENTAGE',
    value: 20,
    minPurchase: 499,
    description: '20% off on membership plan purchase',
    scopes: MEMBERSHIP_SCOPES
  },
  {
    code: 'MED500',
    type: 'PERCENTAGE',
    value: 500,
    minPurchase: 500,
    description: '₹500 off on online medicine orders',
    scopes: [COUPON_SCOPES.PHARMACY_PURCHASE],
    grantType: 'FIXED_INR'
  },
  {
    code: 'USG',
    type: 'PERCENTAGE',
    value: 1000,
    minPurchase: 0,
    description: 'Book USG scan at ₹1000',
    scopes: [COUPON_SCOPES.USG_SCAN],
    grantType: 'FIXED_BOOKING_PRICE'
  },
  {
    code: 'CTSCAN',
    type: 'PERCENTAGE',
    value: 2000,
    minPurchase: 0,
    description: 'Book CT scan at ₹2000',
    scopes: [COUPON_SCOPES.CT_SCAN],
    grantType: 'FIXED_BOOKING_PRICE'
  },
  {
    code: 'MRI',
    type: 'PERCENTAGE',
    value: 3000,
    minPurchase: 0,
    description: 'Book MRI scan at ₹3000',
    scopes: [COUPON_SCOPES.MRI_SCAN],
    grantType: 'FIXED_BOOKING_PRICE'
  }
];

const normalizeScopes = (value) => {
  const allowed = new Set(Object.values(COUPON_SCOPES));
  const list = Array.isArray(value)
    ? value
    : String(value || '')
        .split(',')
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean);

  const normalized = list.filter((scope) => allowed.has(scope));
  return normalized.length ? normalized : [COUPON_SCOPES.COINS_PURCHASE];
};

const defaultScopesForType = (type, scopes) => {
  if (scopes !== undefined && scopes !== null && scopes !== '') {
    return normalizeScopes(scopes);
  }

  if (['FIXED_HC', 'FREE_HC'].includes(String(type).toUpperCase())) {
    return [COUPON_SCOPES.COINS_PURCHASE];
  }

  return [COUPON_SCOPES.COINS_PURCHASE];
};

const assignSampleCouponsToUser = async (targetUserId, createdBy) => {
  const uid = parseInt(targetUserId, 10);
  const now = new Date();
  const validUntil = new Date(now.getTime() + (90 * 24 * 60 * 60 * 1000));

  const upserted = [];

  for (const definition of SAMPLE_COUPON_DEFINITIONS) {
    const couponCode = `${definition.code}U${uid}`;
    const existing = await Coupon.findOne({ where: { code: couponCode } });

    if (!existing) {
      const created = await Coupon.create({
        code: couponCode,
        type: definition.type,
        value: definition.value,
        minPurchase: definition.minPurchase,
        maxUsage: 100000,
        maxUsagePerUser: 5,
        usageCount: 0,
        validFrom: now,
        validUntil,
        isActive: true,
        corporateName: 'Mediqzy Promo',
        description: definition.description,
        createdBy,
        metadata: {
          scopes: definition.scopes,
          ...(definition.grantType ? { grantType: definition.grantType } : {}),
          ...(definition.grantType === 'FIXED_INR' ? { discountInr: definition.value } : {}),
          ...(definition.grantType === 'FIXED_BOOKING_PRICE' ? { bookingPrice: definition.value } : {}),
          assignedUserIds: [uid],
          sample: true,
          sampleBaseCode: definition.code
        }
      });
      upserted.push(created);
      continue;
    }

    const assignedUserIds = normalizeAssignedUserIds(existing?.metadata?.assignedUserIds);
    const mergedAssigned = assignedUserIds.includes(uid) ? assignedUserIds : [...assignedUserIds, uid];
    const mergedScopes = Array.from(new Set([...normalizeScopes(existing?.metadata?.scopes), ...definition.scopes]));

    await existing.update({
      isActive: true,
      validUntil: existing.validUntil < now ? validUntil : existing.validUntil,
      description: existing.description || definition.description,
      createdBy: existing.createdBy || createdBy,
      metadata: {
        ...(existing.metadata || {}),
        scopes: mergedScopes,
        assignedUserIds: mergedAssigned,
        sample: true,
        sampleBaseCode: definition.code
      }
    });

    upserted.push(existing);
  }

  return upserted;
};

/**
 * @route   GET /api/coupons
 * @desc    Get all coupons (Ops team only)
 * @access  Private/Team Ops
 */
router.get('/', authTeam, requireOpsTeamMember, async (req, res) => {
  try {
    const { search, status, corporateId } = req.query;
    
    const where = {};
    
    if (search) {
      where[Op.or] = [
        { code: { [Op.iLike]: `%${search}%` } },
        { corporateName: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } }
      ];
    }
    
    if (status === 'active') {
      where.isActive = true;
      where.validUntil = { [Op.gte]: new Date() };
    } else if (status === 'expired') {
      where.validUntil = { [Op.lt]: new Date() };
    } else if (status === 'inactive') {
      where.isActive = false;
    }
    
    if (corporateId) {
      where.corporateId = corporateId;
    }
    
    const coupons = await Coupon.findAll({
      where,
      order: [['createdAt', 'DESC']],
      include: []
    });
    
    res.json({
      success: true,
      coupons
    });
  } catch (error) {
    console.error('Error fetching coupons:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch coupons',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/coupons/stats
 * @desc    Get coupon statistics (Ops team only)
 * @access  Private/Team Ops
 */
router.get('/stats', authTeam, requireOpsTeamMember, async (req, res) => {
  try {
    const totalCoupons = await Coupon.count();
    const activeCoupons = await Coupon.count({
      where: {
        isActive: true,
        validUntil: { [Op.gte]: new Date() }
      }
    });
    const expiredCoupons = await Coupon.count({
      where: {
        validUntil: { [Op.lt]: new Date() }
      }
    });
    const totalUsage = await CouponUsage.count();
    
    res.json({
      success: true,
      stats: {
        total: totalCoupons,
        active: activeCoupons,
        expired: expiredCoupons,
        totalUsage
      }
    });
  } catch (error) {
    console.error('Error fetching coupon stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/coupons/promo/seed
 * @desc    Upsert standard promo coupons (USG, CTSCAN, MRI, MED500, CORP6FREE)
 * @access  Private/Team Ops
 */
router.post('/promo/seed', authTeam, requireOpsTeamMember, async (req, res) => {
  try {
    const execute = req.body?.execute === true;
    const result = await seedPromoCoupons({
      execute,
      createdBy: req.teamUser?.id || null
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error seeding promo coupons:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to seed promo coupons',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/coupons/sample/assign
 * @desc    Assign sample coupon set to a user (Ops team only)
 * @access  Private/Team Ops
 */
router.post('/sample/assign', authTeam, requireOpsTeamMember, async (req, res) => {
  try {
    const { userId } = req.body;
    const targetUserId = parseInt(userId, 10);

    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid userId is required'
      });
    }

    const coupons = await assignSampleCouponsToUser(targetUserId, req.teamUser.id);

    return res.json({
      success: true,
      message: `Sample coupons assigned to user ${targetUserId}`,
      coupons: coupons.map((coupon) => ({
        id: coupon.id,
        code: coupon.code,
        description: coupon.description,
        scopes: normalizeScopes(coupon?.metadata?.scopes)
      }))
    });
  } catch (error) {
    console.error('Error assigning sample coupons:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to assign sample coupons',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/coupons
 * @desc    Create new coupon (Ops team only)
 * @access  Private/Team Ops
 */
router.post('/', authTeam, requireOpsTeamMember, async (req, res) => {
  try {
    const {
      code,
      type,
      value,
      minPurchase,
      maxUsage,
      maxUsagePerUser,
      validFrom,
      validUntil,
      corporateId,
      corporateName,
      description,
      termsAndConditions,
      assignedUserIds,
      scopes,
      grantType,
      planId,
      metadata
    } = req.body;
    
    // Validate required fields
    if (!code || !type || !value || !validUntil) {
      return res.status(400).json({
        success: false,
        message: 'Code, type, value, and validUntil are required'
      });
    }

    if (!['PERCENTAGE', 'FIXED_HC', 'FREE_HC'].includes(String(type).toUpperCase())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid coupon type'
      });
    }

    const normalizedType = String(type).toUpperCase();
    const normalizedGrantType = String(grantType || metadata?.grantType || '').toUpperCase();
    const normalizedScopes = defaultScopesForType(normalizedType, scopes ?? metadata?.scopes);
    const normalizedPlanId = planId ?? metadata?.planId;
    const parsedPlanId = normalizedPlanId ? parseInt(normalizedPlanId, 10) : null;

    if (normalizedGrantType === 'FREE_MEMBERSHIP') {
      const freeMonths = parseInt(value, 10);
      if (!Number.isInteger(freeMonths) || freeMonths < 1) {
        return res.status(400).json({
          success: false,
          message: 'Free membership coupons require a positive whole number of months in value'
        });
      }

      if (normalizedType !== 'PERCENTAGE') {
        return res.status(400).json({
          success: false,
          message: 'Free membership coupons must use PERCENTAGE storage type'
        });
      }
    }

    if (normalizedGrantType === 'FIXED_INR') {
      const discountInr = parseFloat(value);
      if (!Number.isFinite(discountInr) || discountInr <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Fixed INR coupons require a positive discount amount in value'
        });
      }

      if (normalizedType !== 'PERCENTAGE') {
        return res.status(400).json({
          success: false,
          message: 'Fixed INR coupons must use PERCENTAGE storage type'
        });
      }

      if (!normalizedScopes.includes(COUPON_SCOPES.PHARMACY_PURCHASE)) {
        return res.status(400).json({
          success: false,
          message: 'Fixed INR coupons must include the PHARMACY_PURCHASE scope'
        });
      }
    }

    if (normalizedGrantType === 'FIXED_BOOKING_PRICE') {
      const bookingPrice = parseFloat(value);
      if (!Number.isFinite(bookingPrice) || bookingPrice <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Fixed booking price coupons require a positive INR amount in value'
        });
      }

      if (normalizedType !== 'PERCENTAGE') {
        return res.status(400).json({
          success: false,
          message: 'Fixed booking price coupons must use PERCENTAGE storage type'
        });
      }

      if (!normalizedScopes.some((scope) => DIAGNOSTIC_SCOPES.includes(scope))) {
        return res.status(400).json({
          success: false,
          message: 'Fixed booking price coupons must include USG_SCAN, CT_SCAN, or MRI_SCAN scope'
        });
      }
    }

    if (normalizedScopes.some((scope) => MEMBERSHIP_SCOPES.includes(scope)) && normalizedType !== 'PERCENTAGE') {
      return res.status(400).json({
        success: false,
        message: 'Membership coupons must use the Discount % type'
      });
    }
    
    // Check if code already exists
    const existing = await Coupon.findOne({ where: { code: code.toUpperCase() } });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Coupon code already exists'
      });
    }
    
    const normalizedAssignedUserIds = normalizeAssignedUserIds(assignedUserIds);

    const coupon = await Coupon.create({
      code: code.toUpperCase(),
      type: normalizedType,
      value: parseFloat(value),
      minPurchase: minPurchase ? parseFloat(minPurchase) : 0,
      maxUsage: maxUsage || 1,
      maxUsagePerUser: maxUsagePerUser || 1,
      validFrom: validFrom || new Date(),
      validUntil: new Date(validUntil),
      corporateId: corporateId || null,
      corporateName: corporateName || null,
      description: description || null,
      termsAndConditions: termsAndConditions || null,
      createdBy: req.teamUser.id,
      isActive: true,
      usageCount: 0,
      metadata: {
        ...(metadata || {}),
        scopes: normalizedScopes,
        ...(normalizedGrantType ? { grantType: normalizedGrantType } : {}),
        ...(normalizedGrantType === 'FREE_MEMBERSHIP' ? { freeMonths: parseInt(value, 10) } : {}),
        ...(normalizedGrantType === 'FIXED_INR' ? { discountInr: parseFloat(value) } : {}),
        ...(normalizedGrantType === 'FIXED_BOOKING_PRICE' ? { bookingPrice: parseFloat(value) } : {}),
        ...(parsedPlanId ? { planId: parsedPlanId } : {}),
        ...(normalizedAssignedUserIds.length ? { assignedUserIds: normalizedAssignedUserIds } : {})
      }
    });
    
    res.status(201).json({
      success: true,
      message: 'Coupon created successfully',
      coupon
    });
  } catch (error) {
    console.error('Error creating coupon:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create coupon',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/coupons/:id
 * @desc    Update coupon (Ops team only)
 * @access  Private/Team Ops
 */
router.put('/:id', authTeam, requireOpsTeamMember, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };
    const normalizedAssignedUserIds = normalizeAssignedUserIds(updates.assignedUserIds);
    const requestedScopes = updates.scopes ?? updates.metadata?.scopes;
    const requestedGrantType = updates.grantType ?? updates.metadata?.grantType;
    const requestedPlanId = updates.planId ?? updates.metadata?.planId;
    delete updates.assignedUserIds;
    delete updates.scopes;
    delete updates.grantType;
    delete updates.planId;
    
    const coupon = await Coupon.findByPk(id);
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }
    
    // Don't allow code changes if already used
    if (updates.code && coupon.usageCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot change code of already used coupon'
      });
    }
    
    const nextMetadata = {
      ...(coupon.metadata || {}),
      ...(updates.metadata || {})
    };

    if (req.body.assignedUserIds !== undefined) {
      if (normalizedAssignedUserIds.length) {
        nextMetadata.assignedUserIds = normalizedAssignedUserIds;
      } else {
        delete nextMetadata.assignedUserIds;
      }
    }

    if (requestedScopes !== undefined) {
      const nextType = String(updates.type || coupon.type).toUpperCase();
      nextMetadata.scopes = defaultScopesForType(nextType, requestedScopes);

      if (nextMetadata.scopes.some((scope) => MEMBERSHIP_SCOPES.includes(scope)) && nextType !== 'PERCENTAGE') {
        return res.status(400).json({
          success: false,
          message: 'Membership coupons must use the Discount % type'
        });
      }
    }

    if (requestedGrantType !== undefined) {
      const grantType = String(requestedGrantType || '').toUpperCase();
      if (grantType) {
        nextMetadata.grantType = grantType;
      } else {
        delete nextMetadata.grantType;
        delete nextMetadata.freeMonths;
      }
    }

    if (nextMetadata.grantType === 'FREE_MEMBERSHIP') {
      const freeMonths = parseInt(updates.value ?? coupon.value, 10);
      if (!Number.isInteger(freeMonths) || freeMonths < 1) {
        return res.status(400).json({
          success: false,
          message: 'Free membership coupons require a positive whole number of months in value'
        });
      }
      nextMetadata.freeMonths = freeMonths;
    }

    if (nextMetadata.grantType === 'FIXED_INR') {
      const discountInr = parseFloat(updates.value ?? coupon.value);
      if (!Number.isFinite(discountInr) || discountInr <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Fixed INR coupons require a positive discount amount in value'
        });
      }
      nextMetadata.discountInr = discountInr;
    }

    if (nextMetadata.grantType === 'FIXED_BOOKING_PRICE') {
      const bookingPrice = parseFloat(updates.value ?? coupon.value);
      if (!Number.isFinite(bookingPrice) || bookingPrice <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Fixed booking price coupons require a positive INR amount in value'
        });
      }
      nextMetadata.bookingPrice = bookingPrice;
    }

    if (requestedPlanId !== undefined) {
      const parsedPlanId = requestedPlanId ? parseInt(requestedPlanId, 10) : null;
      if (parsedPlanId) {
        nextMetadata.planId = parsedPlanId;
      } else {
        delete nextMetadata.planId;
      }
    }

    await coupon.update({
      ...updates,
      metadata: nextMetadata
    });
    
    res.json({
      success: true,
      message: 'Coupon updated successfully',
      coupon
    });
  } catch (error) {
    console.error('Error updating coupon:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update coupon',
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/coupons/:id
 * @desc    Delete coupon (Ops team only)
 * @access  Private/Team Ops
 */
router.delete('/:id', authTeam, requireOpsTeamMember, async (req, res) => {
  try {
    const { id } = req.params;
    
    const coupon = await Coupon.findByPk(id);
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }
    
    // Don't allow deletion if already used
    if (coupon.usageCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete coupon that has been used. Deactivate it instead.'
      });
    }
    
    await coupon.destroy();
    
    res.json({
      success: true,
      message: 'Coupon deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting coupon:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete coupon',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/coupons/:id/usage
 * @desc    Get coupon usage history (Ops team only)
 * @access  Private/Team Ops
 */
router.get('/:id/usage', authTeam, requireOpsTeamMember, async (req, res) => {
  try {
    const { id } = req.params;
    
    const usage = await CouponUsage.findAll({
      where: { couponId: id },
      order: [['usedAt', 'DESC']]
    });
    
    res.json({
      success: true,
      usage
    });
  } catch (error) {
    console.error('Error fetching coupon usage:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch usage history',
      error: error.message
    });
  }
});

export default router;
