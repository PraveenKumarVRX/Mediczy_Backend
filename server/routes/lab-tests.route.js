/**
 * Lab Test Booking Routes
 * Handles lab test bookings, confirmations, and tracking
 * Database-integrated version
 */

import express from 'express';
import multer from 'multer';
import { authUser } from '../middleware/auth.middleware.js';
import { authLab } from '../middleware/authLab.middleware.js';
import { LabTest, Report, Appointment } from '../models/index.js';
import { Op } from 'sequelize';
import pool from '../db/pgPool.js';
import { setRlsContext } from '../middleware/rls-context.middleware.js';
import { updateLinkedLabHistory } from '../services/lab-appointment-history.service.js';
import { prepareLabCheckout, completeLabCheckout } from '../services/patient-lab-checkout.service.js';
import { uploadEncryptedReport } from '../services/minio-upload.service.js';
import {
  testTypeToDiagnosticScope,
  validateOrderCoupon,
  recordCouponUsage,
  diagnosticScopeLabel
} from '../services/coupon-validation.service.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.post('/checkout', authUser, async (req, res) => {
  try {
    const order = await prepareLabCheckout(req.user.id, req.body);
    res.status(201).json({ success: true, order });
  } catch (error) {
    console.error('Prepare lab checkout:', error.message);
    res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Could not start lab checkout. Please try again.' });
  }
});

router.post('/checkout/:orderId/complete', authUser, async (req, res) => {
  try {
    const result = await completeLabCheckout(req.user.id, req.params.orderId);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Complete lab checkout:', error.message);
    res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Could not finish booking. Your payment is retained; retry or contact support with your order number.' });
  }
});

/**
 * Health-condition tiles -> the catalogue terms that actually identify their
 * tests.
 *
 * `api_lab_tests.category` holds LAB DISCIPLINES (Biochemistry, Endocrinology,
 * Radiology, …), but the apps browse by CONDITION ("Diabetes", "Thyroid",
 * "Heart"). An exact category match therefore returned 0 rows for every
 * condition tile — the Diabetes tile showed nothing and the app fell back to a
 * keyword search, which is why its cards were headed "Tests matching glucose"
 * (mobile 1.3.0 QA rows 132/164). Nothing in the catalogue carries a condition,
 * so the mapping lives here; an unlisted term still falls through to a plain
 * text match rather than returning an empty list.
 */
const CONDITION_TERMS = {
  diabetes:     ['glucose', 'sugar', 'hba1c', 'glycated', 'insulin', 'diabet', 'c-peptide', 'fructosamine'],
  thyroid:      ['thyroid', 'tsh', 't3', 't4', 'thyroglobulin', 'anti-tpo'],
  heart:        ['cardiac', 'cardiology', 'lipid', 'cholesterol', 'triglyceride', 'troponin', 'ecg', 'echo', 'homocysteine', 'apolipoprotein'],
  cardiac:      ['cardiac', 'cardiology', 'lipid', 'cholesterol', 'triglyceride', 'troponin', 'ecg', 'echo'],
  kidney:       ['kidney', 'renal', 'kft', 'creatinine', 'urea', 'egfr', 'uric acid', 'urine'],
  // 'alt'/'ast' are deliberately absent: as substrings they match "He(alt)h"
  // and "F(ast)ing", which pulled Beta HCG and every health package into the
  // liver list. 'sgpt'/'sgot' name the same two enzymes unambiguously.
  // 'serum albumin', not bare 'albumin', which also matched Urine Microalbumin.
  liver:        ['liver', 'hepatic', 'lft', 'bilirubin', 'sgot', 'sgpt', 'serum albumin', 'globulin', 'alkaline phosphatase'],
  anemia:       ['anemia', 'anaemia', 'haemoglobin', 'hemoglobin', 'iron', 'ferritin', 'b12', 'folate', 'cbc', 'blood count'],
  vitamin:      ['vitamin', 'b12', 'folate', 'calcium', 'magnesium'],
  bone:         ['bone', 'calcium', 'vitamin d', 'phosphorus', 'alkaline phosphatase', 'parathyroid'],
  fever:        ['fever', 'malaria', 'dengue', 'typhoid', 'widal', 'culture', 'crp', 'esr', 'blood count'],
  infection:    ['culture', 'crp', 'esr', 'procalcitonin', 'microbiology', 'sensitivity'],
  allergy:      ['allergy', 'allergen', 'ige', 'immunology', 'eosinophil'],
  cancer:       ['oncology', 'tumour', 'tumor', 'marker', 'psa', 'cea', 'ca-125', 'afp'],
  women:        ['pregnancy', 'beta hcg', 'prolactin', 'oestrogen', 'estrogen', 'progesterone', 'amh', 'pap'],
  pregnancy:    ['pregnancy', 'beta hcg', 'hcg', 'antenatal'],
  'full body':  ['package', 'profile', 'panel', 'health check'],
  'health package': ['package', 'profile', 'panel', 'health check'],
};

/** The terms to search for a condition tile, or null if it is a real category. */
const conditionTerms = (term) => {
  const key = String(term || '').trim().toLowerCase();
  if (!key) return null;
  if (CONDITION_TERMS[key]) return CONDITION_TERMS[key];
  // Tolerate "Diabetes Tests", "Heart Care", "Thyroid Profile" and the like.
  const hit = Object.keys(CONDITION_TERMS).find((k) => key.includes(k));
  return hit ? CONDITION_TERMS[hit] : [key];
};

/**
 * GET /api/lab-tests/catalog
 * Browse the lab test catalog with optional search & filter.
 * Public — no auth required.
 *
 * Query params:
 *   q          (string)  — partial name / code search
 *   category   (string)  — a catalogue category, or a health condition
 *   test_type  (string)  — maps to test code prefix (e.g. blood_test, radiology)
 *   limit      (int)     — default 50, max 200
 *   offset     (int)     — default 0
 */
router.get('/catalog', async (req, res) => {
  try {
    const { q = '', category = '', limit = 50, offset = 0 } = req.query;
    const safeLimit  = Math.min(parseInt(limit)  || 50,  200);
    const safeOffset = Math.max(parseInt(offset) || 0,   0);

    // BUG-04 / W-LAB-2: never surface a test the user can't actually price. Hide
    // catalogue rows without a confirmed, finite, non-negative price so they can't
    // be selected and then fail at checkout with "Pricing unavailable". The booking
    // endpoint remains the authoritative price source (recomputed from this table).
    const conditions = ["status = 'active'", "price IS NOT NULL", "price::numeric >= 0"];
    const values = [];

    if (q.trim()) {
      values.push(`%${q.trim()}%`);
      conditions.push(`(name ILIKE $${values.length} OR test_code ILIKE $${values.length} OR description ILIKE $${values.length})`);
    }

    // A real catalogue category filters exactly; anything else is treated as a
    // health condition and matched against the test's own text, so a condition
    // tile returns its tests instead of an empty list.
    let categoryMode = null;
    if (category.trim()) {
      const wanted = category.trim();
      const known = await pool.query(
        `SELECT 1 FROM api_lab_tests WHERE status = 'active' AND LOWER(category) = LOWER($1) LIMIT 1`,
        [wanted]
      );
      if (known.rowCount) {
        values.push(wanted);
        conditions.push(`LOWER(category) = LOWER($${values.length})`);
        categoryMode = 'category';
      } else {
        const terms = conditionTerms(wanted);
        const likes = terms.map((t) => {
          values.push(`%${t}%`);
          return `(name ILIKE $${values.length} OR test_code ILIKE $${values.length} OR description ILIKE $${values.length} OR category ILIKE $${values.length})`;
        });
        conditions.push(`(${likes.join(' OR ')})`);
        categoryMode = 'condition';
      }
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
      // 'category' = an exact discipline match, 'condition' = resolved from a
      // health-condition tile, so the client can caption the list correctly
      // instead of guessing ("Tests matching glucose").
      ...(categoryMode ? { matchedBy: categoryMode } : {}),
      // Aliased so the list can be shown under the condition the user tapped.
      ...(categoryMode === 'condition' ? { conditionQuery: category.trim() } : {}),
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
    
    const catalog = await pool.query("SELECT test_id, price FROM api_lab_tests WHERE status = 'active' AND (LOWER(name) = LOWER($1) OR LOWER(test_code) = LOWER($1) OR test_id::text = $1) LIMIT 1", [String(testName || '').trim()]);
    if (!catalog.rows.length) return res.status(400).json({ success: false, message: 'Select a test from the active lab catalogue.' });
    if (catalog.rows[0].price == null || !Number.isFinite(Number(catalog.rows[0].price))) return res.status(400).json({ success: false, message: 'This test does not have a confirmed price. Contact the lab.' });
    let resolvedPrice = Number(catalog.rows[0].price);
    const catalogTestId = catalog.rows[0].test_id;

    let discountVal = 0;
    let totalAmountVal = resolvedPrice;

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

    if (totalAmountVal > 0) return res.status(402).json({ success: false, message: 'Please complete payment through lab checkout before booking.' });

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
    
    // hospitalId is optional (nullable) - only trust an explicit, valid value from the client.
    let explicitHospitalId = null;
    if (hospitalId !== undefined && hospitalId !== null && hospitalId !== '' && !isNaN(parseInt(hospitalId))) {
      const parsedHospitalId = parseInt(hospitalId);
      if (parsedHospitalId > 0) explicitHospitalId = parsedHospitalId;
    }

    if (explicitHospitalId) {
      labTestData.hospitalId = explicitHospitalId;
    } else {
      // No lab was explicitly chosen (home collection) - without this, the booking is
      // permanently left with no lab assigned, and nothing downstream (sample
      // collection, processing, report) can ever act on it. Assign the nearest
      // active lab in the patient's city, falling back to any active lab.
      try {
        const [userRow] = await pool.query(`SELECT address_city FROM users WHERE id = $1`, [userId]).then(r => r.rows);
        const city = userRow?.address_city || null;
        const { rows: labRows } = await pool.query(
          `SELECT id FROM labs WHERE status = 'active'
           ORDER BY (address->>'city' ILIKE $1) DESC, id ASC
           LIMIT 1`,
          [city ? `%${city}%` : '%%']
        );
        if (labRows[0]) {
          labTestData.hospitalId = labRows[0].id;
          labTestData.metadata.autoAssignedLab = true;
        } else {
          console.warn('⚠️ No active lab available to auto-assign for home collection booking');
        }
      } catch (assignErr) {
        console.error('⚠️ Auto lab-assignment failed, booking will proceed with no lab:', assignErr.message);
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

    // RLS context must be set on the same pooled connection as BOTH reads.
    // User ownership still applies even when the account has an organization.
    const { labTests, total } = await LabTest.sequelize.transaction(async transaction => {
      await setRlsContext(transaction, {
        userId,
        orgId: req.user.organization_id ?? req.user.organizationId ?? 0,
      });
      const labTests = await LabTest.findAll({
        where,
        order: [['appointmentDate', 'DESC']],
        offset: parseInt(skip),
        limit: parseInt(limit),
        transaction,
      });
      const total = await LabTest.count({ where, transaction });
      return { labTests, total };
    });

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
 * GET /api/lab-tests/:id/invoice — a structured invoice for a lab test order.
 */
router.get('/:id/invoice', authUser, async (req, res) => {
  try {
    const labTest = await LabTest.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!labTest) return res.status(404).json({ success: false, message: 'Lab test not found' });
    const t = typeof labTest.toJSON === 'function' ? labTest.toJSON() : labTest;
    const amount = Number(t.price ?? t.amount ?? t.totalAmount ?? t.totalFee ?? 0) || 0;
    const invoice = {
      invoiceNumber: `LAB-INV-${t.id}`,
      date: t.createdAt || null,
      status: t.paymentStatus || (amount > 0 ? 'pending' : 'not_required'),
      patientName: t.patientName || null,
      lab: { name: t.labName || null, address: t.labAddress || null },
      items: [{ name: t.testName || t.name || 'Lab test', amount }],
      subtotal: amount, tax: 0, total: amount, currency: t.currency || 'INR',
    };
    return res.json({ success: true, invoice });
  } catch (error) {
    console.error('[lab-tests] invoice error:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to generate the invoice' });
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
    const updated = await updateLinkedLabHistory(labTest, {
      status: 'booked',
      confirmationStatus: 'confirmed',
      confirmationDeadline: null,
      reminderSent: false
    }, { Appointment, LabTest, setRlsContext });

    console.log('✅ Lab test confirmed:', { id, userId });

    return res.status(200).json({
      success: true,
      message: 'Lab test confirmed successfully',
      data: updated
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
    const updated = await updateLinkedLabHistory(labTest, {
      status: 'cancelled',
      confirmationStatus: 'rejected',
      cancelledAt: new Date(),
      cancellationReason: reason,
      cancelledBy: 'patient'
    }, { Appointment, LabTest, setRlsContext });

    console.log('✅ Lab test cancelled:', { id, userId, reason });

    return res.status(200).json({
      success: true,
      message: 'Lab test cancelled successfully',
      data: updated
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
    const updated = await updateLinkedLabHistory(labTest, updateData, { Appointment, LabTest, setRlsContext });

    console.log('✅ Lab test updated:', { id, userId, ...updateData });

    return res.status(200).json({
      success: true,
      message: 'Lab test updated successfully',
      data: updated
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

    // Linked bookings retain their history and appointment reference. The
    // cancel route updates both records and releases the reserved slot.
    if (labTest.metadata?.source === 'lab_appointment') {
      return res.status(409).json({ success: false, message: 'Cancel this lab appointment instead of deleting its booking history.' });
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

/**
 * GET /api/lab-tests/assigned
 * Lab-side queue: bookings auto/manually assigned to this lab that are
 * still awaiting processing. Closes the "nothing ever progresses past
 * booked" gap - this table previously had no lab-facing view at all.
 */
router.get('/assigned', authLab, async (req, res) => {
  try {
    const labTests = await LabTest.findAll({
      where: { hospitalId: req.lab.id, status: 'booked' },
      order: [['appointmentDate', 'ASC']],
    });
    return res.json({ success: true, data: labTests });
  } catch (error) {
    console.error('❌ GET /lab-tests/assigned error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load assigned tests', error: error.message });
  }
});

/**
 * POST /api/lab-tests/:id/complete
 * Lab uploads the result report and closes out the booking: creates a
 * `reports` row (reportType='lab', same as a patient's own upload) and
 * links it via resultReportId, matching the field this model already
 * reserved for exactly this purpose but that nothing ever populated.
 * Also projects a summary row into corporate_health_reports when the
 * patient is a linked corporate employee, so HR's "Report Delivery
 * Status" panel (fed only by manual Team uploads until now) picks this
 * up too.
 */
router.post('/:id/complete', authLab, upload.single('file'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Result file is required' });
    }

    const labTest = await LabTest.findOne({ where: { id, hospitalId: req.lab.id, status: 'booked' } });
    if (!labTest) {
      return res.status(404).json({ success: false, message: 'Assigned, booked lab test not found for this lab' });
    }

    let uploadResult;
    try {
      uploadResult = await uploadEncryptedReport({
        buffer: req.file.buffer,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        keyPrefix: `uploads/reports/${labTest.userId}`,
      });
    } catch (storageError) {
      console.error('⚠️ MinIO upload failed for lab test completion:', storageError.message);
      return res.status(502).json({ success: false, message: 'Report storage unavailable, try again' });
    }

    const resultFlag = String(req.body.result || '').toLowerCase();
    const report = await Report.create({
      userId: labTest.userId,
      fileName: `${labTest.testName || labTest.testType} report`,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      filePath: uploadResult.key,
      fileUrl: uploadResult.url,
      reportType: 'lab',
      testName: labTest.testName || labTest.testType,
      labName: req.lab.name || null,
      reportDate: new Date(),
      status: 'active',
      uploadedAt: new Date(),
      analysisStatus: 'pending',
    });

    await labTest.update({
      status: 'completed',
      resultStatus: ['abnormal', 'normal'].includes(resultFlag) ? resultFlag : 'ready',
      resultReportId: report.id,
      resultDate: new Date(),
    });

    try {
      const [[employeeLink]] = await pool.query(
        `SELECT ce.corporate_id FROM corporate_employees ce WHERE ce."userId" = $1 AND ce."isActive" = true LIMIT 1`,
        [labTest.userId]
      ).then((r) => [r.rows]);
      if (employeeLink) {
        await pool.query(
          `INSERT INTO corporate_health_reports (corporate_id, employee_id, report_name, report_type, report_date, sla_status, checkup_type)
           VALUES ($1, $2, $3, 'lab', NOW(), 'on_time', 'lab_test')`,
          [employeeLink.corporate_id, labTest.userId, report.fileName]
        );
      }
    } catch (hrProjectionErr) {
      console.error('⚠️ Could not project lab-test completion into corporate_health_reports (non-fatal):', hrProjectionErr.message);
    }

    return res.json({ success: true, message: 'Lab test completed', data: { labTest, report } });
  } catch (error) {
    console.error('❌ POST /lab-tests/:id/complete error:', error);
    return res.status(500).json({ success: false, message: 'Failed to complete lab test', error: error.message });
  }
});

export default router;
