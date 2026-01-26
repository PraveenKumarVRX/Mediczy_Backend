/**
 * Coupon Routes
 * Manage corporate HC purchase coupons
 */

import express from 'express';
import { adminAuthMiddleware } from '../middleware/admin.middleware.js';
import { Coupon, CouponUsage } from '../models/index.js';
import { Op } from 'sequelize';

const router = express.Router();

/**
 * @route   GET /api/coupons
 * @desc    Get all coupons (Admin only)
 * @access  Private/Admin
 */
router.get('/', adminAuthMiddleware, async (req, res) => {
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
 * @desc    Get coupon statistics (Admin only)
 * @access  Private/Admin
 */
router.get('/stats', adminAuthMiddleware, async (req, res) => {
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
 * @route   POST /api/coupons
 * @desc    Create new coupon (Admin only)
 * @access  Private/Admin
 */
router.post('/', adminAuthMiddleware, async (req, res) => {
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
      termsAndConditions
    } = req.body;
    
    // Validate required fields
    if (!code || !type || !value || !validUntil) {
      return res.status(400).json({
        success: false,
        message: 'Code, type, value, and validUntil are required'
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
    
    const coupon = await Coupon.create({
      code: code.toUpperCase(),
      type,
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
      createdBy: req.admin.id,
      isActive: true,
      usageCount: 0
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
 * @desc    Update coupon (Admin only)
 * @access  Private/Admin
 */
router.put('/:id', adminAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
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
    
    await coupon.update(updates);
    
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
 * @desc    Delete coupon (Admin only)
 * @access  Private/Admin
 */
router.delete('/:id', adminAuthMiddleware, async (req, res) => {
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
 * @desc    Get coupon usage history (Admin only)
 * @access  Private/Admin
 */
router.get('/:id/usage', adminAuthMiddleware, async (req, res) => {
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
