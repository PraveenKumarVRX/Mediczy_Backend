/**
 * Lab Test Booking Routes
 * Handles lab test bookings, confirmations, and tracking
 * Database-integrated version
 */

import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import { LabTest } from '../models/index.js';
import { Op } from 'sequelize';
import pool from '../db/pgPool.js';
import {
  testTypeToDiagnosticScope,
  validateOrderCoupon,
  recordCouponUsage,
  diagnosticScopeLabel
} from '../services/coupon-validation.service.js';

const router = express.Router();

/**
 * GET /api/lab-tests/catalog
 * Browse the lab test catalog with optional search & filter.
 * Public — no auth required.
 *
 * Query params:
 *   q          (string)  — partial name / code search
 *   category   (string)  — exact category filter
 *   test_type  (string)  — maps to test code prefix (e.g. blood_test, radiology)
 *   limit      (int)     — default 50, max 200
 *   offset     (int)     — default 0
 */
router.get('/catalog', async (req, res) => {
  try {
    const { q = '', category = '', limit = 50, offset = 0 } = req.query;
    const safeLimit  = Math.min(parseInt(limit)  || 50,  200);
    const safeOffset = Math.max(parseInt(offset) || 0,   0);

    const conditions = ["status = 'active'"];
    const values = [];

    if (q.trim()) {
      values.push(`%${q.trim()}%`);
      conditions.push(`(name ILIKE $${values.length} OR test_code ILIKE $${values.length} OR description ILIKE $${values.length})`);
    }

    if (category.trim()) {
      values.push(category.trim());
      conditions.push(`LOWER(category) = LOWER($${values.length})`);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    values.push(safeLimit, safeOffset);
    const dataQ = `
      SELECT test_id, name, description, category, test_code,
             sample_type, turnaround_time_hours, price,
             home_collection_charge, currency
      FROM api_lab_tests
      ${where}
      ORDER BY category, name
      LIMIT $${values.length - 1} OFFSET $${values.length}`;

    // Count (reuse same conditions without limit/offset)
    const countValues = values.slice(0, values.length - 2);
    const countQ = `SELECT COUNT(*) FROM api_lab_tests ${where}`;

    const [{ rows }, { rows: countRows }] = await Promise.all([
      pool.query(dataQ, values),
      pool.query(countQ, countValues),
    ]);

    // Build category list for filter UI
    const catRows = await pool.query(
      `SELECT DISTINCT category FROM api_lab_tests WHERE status = 'active' ORDER BY category`
    );

    return res.json({
      success: true,
      data: rows,
      pagination: {
        total: parseInt(countRows[0].count),
        limit: safeLimit,
        offset: safeOffset,
      },
      categories: catRows.rows.map(r => r.category),
    });
  } catch (err) {
    console.error('❌ Lab catalog error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch lab catalog' });
  }
});

/**
 * POST /api/lab-tests/validate-coupon
 * Validate a diagnostic scan coupon before booking
 */
router.post('/validate-coupon', authUser, async (req, res) => {
  try {
    const { couponCode, testType, orderAmount } = req.body;

    if (!couponCode || !testType) {
      return res.status(400).json({
        success: false,
        message: 'couponCode and testType are required'
      });
    }

    const scope = testTypeToDiagnosticScope(testType);
    if (!scope) {
      return res.status(400).json({
        success: false,
        message: 'Coupon validation is supported for USG, CT scan, and MRI bookings only'
      });
    }

    const validation = await validateOrderCoupon({
      code: couponCode,
      userId: req.user.id,
      scope,
      orderAmount: Number(orderAmount || 0),
      testType
    });

    return res.json({
      success: true,
      message: `Coupon is valid for ${diagnosticScopeLabel(scope)}`,
      coupon: {
        code: validation.coupon.code,
        scope,
        grantType: validation.grantType,
        bookingPrice: Number(validation.coupon.value),
        discount: validation.discount,
        finalPrice: validation.finalPrice || Number(validation.coupon.value)
      }
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/lab-tests
 * Book a new lab test
 */
router.post('/', authUser, async (req, res) => {
  try {
    console.log('📝 Incoming lab test booking request:', { body: req.body, userId: req.user?.id });
    
    const {
      testType,
      testName,
      hospitalId,
      appointmentDate,
      appointmentTime,
      urgency = 'routine',
      notes = '',
      requiresFasting = false,
      fastingHours = null,
      price = null,
      currency = 'INR',
      discount = 0,
      total_amount = null,
      coupon_code = null
    } = req.body;

    const userId = req.user.id;
    const organizationId = req.user.organization_id;

    // Validate required fields
    if (!testType || !appointmentDate) {
      return res.status(400).json({
        success: false,
        message: 'testType and appointmentDate are required'
      });
    }

    // Validate test type
    const validTestTypes = [
      'blood_test', 'pathology', 'radiology', 'scan',
      'ultrasound', 'xray', 'ct_scan', 'mri', 'ecg',
      'echo', 'eeg', 'endoscopy', 'colonoscopy', 'other'
    ];

    if (!validTestTypes.includes(testType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid test type. Allowed: ${validTestTypes.join(', ')}`
      });
    }

    // Validate urgency
    const validUrgency = ['routine', 'urgent', 'stat'];
    if (!validUrgency.includes(urgency)) {
      return res.status(400).json({
        success: false,
        message: `Invalid urgency. Allowed: ${validUrgency.join(', ')}`
      });
    }

    // Create lab test booking in database
    console.log('🔄 Creating lab test with data:', { userId, testType, testName, appointmentDate, hospitalId, organizationId });
    
    // Auto-lookup price from catalog if not provided and testName is given
    let resolvedPrice = price !== null && price !== undefined ? parseFloat(price) : null;
    let catalogTestId = null;
    if (resolvedPrice === null && testName) {
      const catalogRow = await pool.query(
        `SELECT test_id, price FROM api_lab_tests
         WHERE status = 'active' AND (name ILIKE $1 OR test_code ILIKE $1)
         ORDER BY CASE WHEN LOWER(name) = LOWER($2) THEN 0 ELSE 1 END LIMIT 1`,
        [`%${testName.trim()}%`, testName.trim()]
      );
      if (catalogRow.rows.length) {
        resolvedPrice = parseFloat(catalogRow.rows[0].price);
        catalogTestId = catalogRow.rows[0].test_id;
        console.log(`💊 Auto-priced "${testName}" from catalog: ₹${resolvedPrice} (${catalogTestId})`);
      }
    }

    let couponValidation = null;
    let discountVal = parseFloat(discount) || 0;
    let totalAmountVal = total_amount !== null && total_amount !== undefined
      ? parseFloat(total_amount)
      : (resolvedPrice !== null ? resolvedPrice - discountVal : null);

    if (coupon_code) {
      const diagnosticScope = testTypeToDiagnosticScope(testType);
      if (!diagnosticScope) {
        return res.status(400).json({
          success: false,
          message: 'Diagnostic coupons are only valid for USG, CT scan, or MRI bookings'
        });
      }

      couponValidation = await validateOrderCoupon({
        code: coupon_code,
        userId,
        scope: diagnosticScope,
        orderAmount: resolvedPrice || 0,
        testType
      });

      discountVal = couponValidation.discount;
      totalAmountVal = couponValidation.finalPrice;
      if (resolvedPrice === null && couponValidation.coupon?.value) {
        resolvedPrice = Number(couponValidation.coupon.value) + discountVal;
      }
    }

    // Prepare lab test data
    const labTestData = {
      userId,
      organization_id: organizationId,
      testType,
      testName: testName || null,
      appointmentDate: new Date(appointmentDate),
      appointmentTime: appointmentTime || null,
      urgency,
      notes: notes || null,
      requiresFasting: requiresFasting || false,
      fastingHours: fastingHours || null,
      price: resolvedPrice,
      currency: currency || 'INR',
      discount: discountVal,
      total_amount: totalAmountVal,
      status: 'pending_confirmation',
      confirmationStatus: 'pending',
      resultStatus: 'pending',
      metadata: {
        createdFrom: 'patient_portal',
        browser: req.get('user-agent'),
        ...(catalogTestId ? { catalogTestId, priceSource: 'catalog' } : {}),
        ...(couponValidation?.coupon ? {
          couponCode: couponValidation.coupon.code,
          couponScope: couponValidation.scope,
          couponGrantType: couponValidation.grantType,
          originalPrice: couponValidation.baseAmount,
          couponDiscount: couponValidation.discount
        } : {})
      }
    };
    
    // hospitalId is optional (nullable), only set if explicitly provided and valid
    if (hospitalId !== undefined && hospitalId !== null && hospitalId !== '' && !isNaN(parseInt(hospitalId))) {
      // Only include hospitalId if it's provided and valid
      const parsedHospitalId = parseInt(hospitalId);
      if (parsedHospitalId > 0) {
        labTestData.hospitalId = parsedHospitalId;
      }
    }
    
    console.log('🔍 Lab test data before create:', labTestData);
    
    const labTest = await LabTest.create(labTestData);

    if (couponValidation?.coupon) {
      await recordCouponUsage({
        coupon: couponValidation.coupon,
        userId,
        discountAmount: couponValidation.discount,
        amountPaid: totalAmountVal || 0,
        hcPurchased: 0,
        hcBonus: 0,
        paymentId: `LABTEST_${labTest.id}`
      });
    }

    console.log('✅ Lab test booked successfully:', {
      id: labTest.id,
      userId,
      testType,
      appointmentDate
    });

    return res.status(201).json({
      success: true,
      message: 'Lab test booked successfully',
      data: labTest
    });
  } catch (error) {
    console.error('❌ Lab test booking error:', {
      message: error.message,
      stack: error.stack,
      body: req.body,
      userId: req.user?.id
    });
    if (error.message?.includes('coupon') || error.message?.includes('Coupon') || error.message?.includes('valid for')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Failed to book lab test',
      error: error.message
    });
  }
});

/**
 * GET /api/lab-tests
 * Get all lab tests for the authenticated user
 * Query params: status, testType, skip, limit
 */
router.get('/', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, testType, skip = 0, limit = 20 } = req.query;

    // Build where clause
    const where = { userId };

    // Add optional filters
    if (status && ['pending_confirmation', 'booked', 'completed', 'cancelled', 'no_show', 'rescheduled'].includes(status)) {
      where.status = status;
    }

    if (testType && ['blood_test', 'pathology', 'radiology', 'scan', 'ultrasound', 'xray', 'ct_scan', 'mri', 'ecg', 'echo', 'eeg', 'endoscopy', 'colonoscopy', 'other'].includes(testType)) {
      where.testType = testType;
    }

    // Get lab tests from database
    const labTests = await LabTest.findAll({
      where,
      order: [['appointmentDate', 'DESC']],
      offset: parseInt(skip),
      limit: parseInt(limit)
    });

    // Get total count
    const total = await LabTest.count({ where });

    return res.status(200).json({
      success: true,
      message: 'Lab tests retrieved successfully',
      data: labTests,
      pagination: {
        total,
        skip: parseInt(skip),
        limit: parseInt(limit),
        hasMore: parseInt(skip) + parseInt(limit) < total
      }
    });
  } catch (error) {
    console.error('❌ Get lab tests error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve lab tests',
      error: error.message
    });
  }
});

/**
 * GET /api/lab-tests/:id
 * Get a specific lab test by ID
 */
router.get('/:id', authUser, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const labTest = await LabTest.findOne({
      where: {
        id,
        userId
      }
    });

    if (!labTest) {
      return res.status(404).json({
        success: false,
        message: 'Lab test not found'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Lab test retrieved successfully',
      data: labTest
    });
  } catch (error) {
    console.error('❌ Get lab test error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve lab test',
      error: error.message
    });
  }
});

/**
 * POST /api/lab-tests/:id/confirm
 * Confirm a lab test booking
 */
router.post('/:id/confirm', authUser, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const labTest = await LabTest.findOne({
      where: {
        id,
        userId,
        status: 'pending_confirmation'
      }
    });

    if (!labTest) {
      return res.status(404).json({
        success: false,
        message: 'Lab test not found or not pending confirmation'
      });
    }

    // Update status to confirmed
    await labTest.update({
      status: 'booked',
      confirmationStatus: 'confirmed',
      confirmationDeadline: null,
      reminderSent: false
    });

    console.log('✅ Lab test confirmed:', { id, userId });

    return res.status(200).json({
      success: true,
      message: 'Lab test confirmed successfully',
      data: labTest
    });
  } catch (error) {
    console.error('❌ Confirm lab test error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to confirm lab test',
      error: error.message
    });
  }
});

/**
 * POST /api/lab-tests/:id/cancel
 * Cancel a lab test booking
 */
router.post('/:id/cancel', authUser, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { reason = 'Patient requested cancellation' } = req.body;

    const labTest = await LabTest.findOne({
      where: {
        id,
        userId,
        status: { [Op.in]: ['pending_confirmation', 'booked'] }
      }
    });

    if (!labTest) {
      return res.status(404).json({
        success: false,
        message: 'Lab test not found or cannot be cancelled'
      });
    }

    // Update status to cancelled
    await labTest.update({
      status: 'cancelled',
      confirmationStatus: 'rejected',
      cancelledAt: new Date(),
      cancellationReason: reason,
      cancelledBy: 'patient'
    });

    console.log('✅ Lab test cancelled:', { id, userId, reason });

    return res.status(200).json({
      success: true,
      message: 'Lab test cancelled successfully',
      data: labTest
    });
  } catch (error) {
    console.error('❌ Cancel lab test error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to cancel lab test',
      error: error.message
    });
  }
});

/**
 * PUT /api/lab-tests/:id
 * Update lab test details
 */
router.put('/:id', authUser, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { appointmentDate, appointmentTime, notes, requiresFasting, fastingHours } = req.body;

    const labTest = await LabTest.findOne({
      where: {
        id,
        userId,
        status: { [Op.in]: ['pending_confirmation', 'booked'] }
      }
    });

    if (!labTest) {
      return res.status(404).json({
        success: false,
        message: 'Lab test not found or cannot be updated'
      });
    }

    // Prepare update data
    const updateData = {};
    if (appointmentDate) updateData.appointmentDate = new Date(appointmentDate);
    if (appointmentTime) updateData.appointmentTime = appointmentTime;
    if (notes !== undefined) updateData.notes = notes || null;
    if (requiresFasting !== undefined) updateData.requiresFasting = requiresFasting;
    if (fastingHours !== undefined) updateData.fastingHours = fastingHours;

    // Update the record
    await labTest.update(updateData);

    console.log('✅ Lab test updated:', { id, userId, ...updateData });

    return res.status(200).json({
      success: true,
      message: 'Lab test updated successfully',
      data: labTest
    });
  } catch (error) {
    console.error('❌ Update lab test error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update lab test',
      error: error.message
    });
  }
});

/**
 * DELETE /api/lab-tests/:id
 * Delete a lab test record
 */
router.delete('/:id', authUser, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const labTest = await LabTest.findOne({
      where: {
        id,
        userId
      }
    });

    if (!labTest) {
      return res.status(404).json({
        success: false,
        message: 'Lab test not found'
      });
    }

    await labTest.destroy();

    console.log('✅ Lab test deleted:', { id, userId });

    return res.status(200).json({
      success: true,
      message: 'Lab test deleted successfully'
    });
  } catch (error) {
    console.error('❌ Delete lab test error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete lab test',
      error: error.message
    });
  }
});

export default router;
