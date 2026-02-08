/**
 * Aggregator Routes
 * RESTful API endpoints for multi-level organizational hierarchy
 * 
 * Base path: /api/aggregators or /api/corporates
 */

import express from 'express';
import { body, param, query } from 'express-validator';
import AggregatorController from '../controller/aggregator.controller.js';
import { authUser } from '../middleware/auth.middleware.js';

const router = express.Router();

// ============================================
// AGGREGATOR ENDPOINTS
// ============================================

/**
 * @route   GET /api/aggregators/profile
 * @desc    Get aggregator profile with network statistics
 * @access  Private (Aggregator Admin)
 */
router.get(
  '/profile',
  authUser,
  AggregatorController.getProfile
);

/**
 * @route   GET /api/aggregators/corporates
 * @desc    List all corporations under this aggregator
 * @access  Private (Aggregator Admin)
 * @query   limit, offset, status
 */
router.get(
  '/corporates',
  authUser,
  [
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
    query('status').optional().isIn(['all', 'active', 'inactive', 'suspended']),
  ],
  AggregatorController.getCorporates
);

/**
 * @route   GET /api/aggregators/wellness-partners
 * @desc    Get wellness partners in aggregator's network
 * @access  Private (Aggregator Admin)
 * @query   partnerType, status, limit, offset
 */
router.get(
  '/wellness-partners',
  authUser,
  [
    query('partnerType').optional().isIn(['all', 'hospital', 'clinic', 'lab', 'pharmacy', 'ambulance', 'homecare']),
    query('status').optional().isIn(['all', 'active', 'inactive', 'pending', 'suspended']),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
  ],
  AggregatorController.getWellnessPartners
);

/**
 * @route   POST /api/aggregators/wellness-partners
 * @desc    Add wellness partner to aggregator's network
 * @access  Private (Aggregator Admin)
 * @body    wellnessProviderType, wellnessProviderId, commission, contract details
 */
router.post(
  '/wellness-partners',
  authUser,
  [
    body('wellnessProviderType')
      .notEmpty()
      .isIn(['hospital', 'clinic', 'lab', 'pharmacy', 'ambulance', 'homecare'])
      .withMessage('Valid provider type required'),
    body('wellnessProviderId').notEmpty().isInt().withMessage('Provider ID required'),
    body('commissionPercentage').optional().isFloat({ min: 0, max: 100 }).withMessage('Invalid commission'),
    body('contractStartDate').optional().isISO8601().toDate(),
    body('contractEndDate').optional().isISO8601().toDate(),
  ],
  AggregatorController.addWellnessPartner
);

/**
 * @route   GET /api/aggregators/network-statistics
 * @desc    Get network analytics and statistics
 * @access  Private (Aggregator Admin)
 */
router.get(
  '/network-statistics',
  authUser,
  AggregatorController.getNetworkStatistics
);

/**
 * @route   GET /api/aggregators/action-logs
 * @desc    Get audit logs for aggregator actions
 * @access  Private (Aggregator Admin)
 * @query   limit, offset, actionType
 */
router.get(
  '/action-logs',
  authUser,
  [
    query('limit').optional().isInt({ min: 1, max: 200 }),
    query('offset').optional().isInt({ min: 0 }),
    query('actionType').optional().isString(),
  ],
  AggregatorController.getActionLogs
);

// ============================================
// CORPORATE ENDPOINTS (accessible to corporate admins & aggregators)
// ============================================

/**
 * @route   GET /api/corporates/:corporateId/employees
 * @desc    Get employees of a corporate
 * @access  Private (Corporate Admin or Aggregator Admin)
 * @params  corporateId
 * @query   isActive, limit, offset
 */
router.get(
  '/:corporateId/employees',
  authUser,
  [
    param('corporateId').isInt().withMessage('Valid corporate ID required'),
    query('isActive').optional().isIn(['true', 'false']),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
  ],
  AggregatorController.getCorporateEmployees
);

/**
 * @route   GET /api/corporates/:corporateId/wellness-partners
 * @desc    Get wellness partners accessible to corporate
 * @access  Private (Corporate Employee or Admin)
 * @params  corporateId
 */
router.get(
  '/:corporateId/wellness-partners',
  authUser,
  [
    param('corporateId').isInt().withMessage('Valid corporate ID required'),
  ],
  AggregatorController.getCorporateAccessiblePartners
);

// ============================================
// CORPORATE DASHBOARD & SELF-SERVICE
// ============================================

/**
 * @route   GET /api/corporate/my-profile
 * @desc    Get current corporate user profile + corporate info
 * @access  Private (Corporate Employee)
 */
router.get(
  '/my-profile',
  authUser,
  (req, res) => {
    try {
      if (req.user.role !== 'corporate') {
        return res.status(403).json({
          success: false,
          message: 'Not a corporate user',
        });
      }

      res.json({
        success: true,
        user: {
          id: req.user.id,
          name: `${req.user.firstName} ${req.user.lastName}`,
          email: req.user.email,
          organization_type: req.user.organization_type,
        },
        corporate_id: req.user.corporate_id,
        tenant_id: req.user.tenant_id,
        role: req.user.role,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching profile',
        error: error.message,
      });
    }
  }
);

/**
 * @route   GET /api/corporate/dashboard
 * @desc    Corporate dashboard with wellness partners, usage, etc
 * @access  Private (Corporate Employee)
 */
router.get(
  '/dashboard',
  authUser,
  (req, res) => {
    try {
      if (req.user.role !== 'corporate') {
        return res.status(403).json({
          success: false,
          message: 'Not a corporate user',
        });
      }

      res.json({
        success: true,
        dashboard: {
          corporate_id: req.user.corporate_id,
          corporate_name: req.user.employer_name,
          user_name: `${req.user.firstName} ${req.user.lastName}`,
          available_services: [
            { service: 'doctors', endpoint: '/api/doctors/partnered' },
            { service: 'appointments', endpoint: '/api/appointments' },
            { service: 'prescriptions', endpoint: '/api/prescriptions' },
            { service: 'labs', endpoint: '/api/labs/available' },
            { service: 'pharmacies', endpoint: '/api/pharmacies' },
            { service: 'video_consultations', endpoint: '/api/video/livekit/token' },
          ],
          features: {
            can_book_appointments: true,
            can_access_video_calls: true,
            can_view_health_records: true,
            can_access_wellness_partners: true,
          },
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching dashboard',
        error: error.message,
      });
    }
  }
);

// ============================================
// ADMIN ENDPOINTS (Broker/Aggregator Management)
// ============================================

/**
 * @route   POST /api/admin/aggregators
 * @desc    Create a new aggregator/broker (admin only)
 * @access  Private (Super Admin)
 * @body    broker_name, email, commission_percentage, status, etc.
 */
// Note: Routes are registered under /api/admin prefix in app.js
// Creating route for `` path since parent router is at /api/admin/aggregators
router.post(
  '',
  authUser,
  [
    body('broker_name').trim().notEmpty().withMessage('Broker name is required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('phone_number').optional().trim(),
    body('contact_person').optional().trim(),
    body('irdai_license_number').optional().trim(),
    body('business_type').optional().isIn(['insurance_broker', 'insurance_agent', 'tpa', 'other']),
    body('commission_percentage').optional().isFloat({ min: 0, max: 100 }),
    body('status').optional().isIn(['active', 'inactive', 'pending', 'suspended']),
    body('is_verified').optional().isBoolean(),
  ],
  AggregatorController.createAggregator
);

/**
 * @route   GET /api/admin/aggregators
 * @desc    List all aggregators with pagination (admin only)
 * @access  Private (Super Admin)
 * @query   limit, offset, status, verified
 */
router.get(
  '',
  authUser,
  [
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
    query('status').optional().isIn(['all', 'active', 'inactive', 'pending', 'suspended']),
    query('verified').optional().isIn(['true', 'false']),
  ],
  AggregatorController.getAggregators
);

/**
 * @route   GET /api/admin/aggregators/:id
 * @desc    Get a specific aggregator (admin only)
 * @access  Private (Super Admin)
 * @params  id - Aggregator ID
 */
router.get(
  '/:id',
  authUser,
  [
    param('id').isInt().withMessage('Valid aggregator ID required'),
  ],
  AggregatorController.getAggregator
);

/**
 * @route   PUT /api/admin/aggregators/:id
 * @desc    Update an aggregator (admin only)
 * @access  Private (Super Admin)
 * @params  id - Aggregator ID
 * @body    broker_name, email, commission_percentage, status, etc.
 */
router.put(
  '/:id',
  authUser,
  [
    param('id').isInt().withMessage('Valid aggregator ID required'),
    body('broker_name').optional().trim(),
    body('email').optional().isEmail().normalizeEmail(),
    body('phone_number').optional().trim(),
    body('contact_person').optional().trim(),
    body('irdai_license_number').optional().trim(),
    body('business_type').optional().isIn(['insurance_broker', 'insurance_agent', 'tpa', 'other']),
    body('commission_percentage').optional().isFloat({ min: 0, max: 100 }),
    body('status').optional().isIn(['active', 'inactive', 'pending', 'suspended']),
    body('is_verified').optional().isBoolean(),
  ],
  AggregatorController.updateAggregator
);

/**
 * @route   DELETE /api/admin/aggregators/:id
 * @desc    Delete an aggregator (admin only)
 * @access  Private (Super Admin)
 * @params  id - Aggregator ID
 */
router.delete(
  '/:id',
  authUser,
  [
    param('id').isInt().withMessage('Valid aggregator ID required'),
  ],
  AggregatorController.deleteAggregator
);

export default router;
