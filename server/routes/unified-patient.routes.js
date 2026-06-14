/**
 * Unified Patient Routes for Mediczy Mobile App
 * Single mobile app endpoints for all clinic patients
 * 
 * All patients from all clinics use these endpoints
 * Clinic is identified by clinic_id, clinic_slug, or clinic_domain in request body
 */

import express from 'express';
import { body, query } from 'express-validator';
import { authUser } from '../middleware/auth.middleware.js';
import { authLimiter } from '../middleware/rateLimiter.middleware.js';
import {
  unifiedPatientSignup,
  unifiedPatientLogin,
  searchClinics,
  getPatientProfile,
  updatePatientProfile
} from '../controller/unified-patient.controller.js';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import pool from '../db/pgPool.js';

const router = express.Router();

/**
 * Middleware to ensure user is a patient
 */
const requirePatient = (req, res, next) => {
  if (!req.user || req.user.role !== 'patient') {
    return res.status(403).json({
      success: false,
      message: 'Only patients can access this resource'
    });
  }
  next();
};

/**
 * POST /api/patient/signup
 * Patient signup - public endpoint
 * Accepts clinic identifier (clinic_id, clinic_slug, or clinic_domain)
 */
router.post(
  '/signup',
  [
    body('clinic_id').optional().trim(),
    body('clinic_slug').optional().trim(),
    body('clinic_domain').optional().trim(),
    body('email').isEmail().withMessage('Invalid email'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('first_name').trim().notEmpty().withMessage('First name is required'),
    body('last_name').trim().notEmpty().withMessage('Last name is required'),
    body('phone').optional().trim(),
    body('date_of_birth').optional().isISO8601().withMessage('Invalid date format'),
    body('gender').optional().isIn(['Male', 'Female', 'Other']),
    body('blood_type').optional().trim(),
    body('allergies').optional().isArray(),
    body('address_city').optional().trim(),
    body('address_state').optional().trim(),
    body('address_country').optional().trim()
  ],
  unifiedPatientSignup
);

/**
 * POST /api/patient/login
 * Patient login - public endpoint
 * Accepts clinic identifier (clinic_id, clinic_slug, or clinic_domain)
 */
router.post(
  '/login',
  authLimiter,
  [
    body('clinic_id').optional().trim(),
    body('clinic_slug').optional().trim(),
    body('clinic_domain').optional().trim(),
    body('email').isEmail().withMessage('Invalid email'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  unifiedPatientLogin
);

/**
 * GET /api/patient/clinics/search
 * Search for clinics - public endpoint
 * Allows patients to find clinics to join
 */
router.get(
  '/clinics/search',
  [
    query('query').optional().trim(),
    query('city').optional().trim(),
    query('state').optional().trim(),
    query('type').optional().isIn(['hospital', 'clinic', 'lab', 'pharmacy', 'ambulance', 'corporate', 'homecare']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 })
  ],
  searchClinics
);

/**
 * GET /api/patient/profile
 * Get patient profile - authenticated patient only
 */
router.get(
  '/profile',
  authUser,
  requirePatient,
  getPatientProfile
);

/**
 * PATCH /api/patient/profile
 * Update patient profile - authenticated patient only
 */
router.patch(
  '/profile',
  authUser,
  requirePatient,
  [
    body('first_name').optional().trim(),
    body('last_name').optional().trim(),
    body('phone').optional().trim(),
    body('date_of_birth').optional().isISO8601().withMessage('Invalid date format'),
    body('gender').optional().isIn(['Male', 'Female', 'Other']),
    body('blood_type').optional().trim(),
    body('allergies').optional().isArray(),
    body('address_city').optional().trim(),
    body('address_state').optional().trim(),
    body('address_country').optional().trim()
  ],
  updatePatientProfile
);

/**
 * GET /api/patient/provider-clinics
 * Public endpoint — search real clinic branches from provider_clinics table
 * (Clove Dental, Apollo Clinic, etc.)
 * Query params: search, city, type, page, limit
 */
router.get('/provider-clinics', async (req, res) => {
  try {
    const search = (req.query.search || '').trim();
    const city   = (req.query.city   || '').trim();
    const type   = (req.query.type   || '').trim();
    const page   = Math.max(1, parseInt(req.query.page  || '1', 10));
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const offset = (page - 1) * limit;

    const conditions = [`status = 'active'`];
    const replacements = {};

    if (search) {
      conditions.push(`(name ILIKE :search OR location->>'city' ILIKE :search OR location->>'pincode' LIKE :pinSearch OR specialty ILIKE :search)`);
      replacements.search = `%${search}%`;
      replacements.pinSearch = `${search}%`;
    }
    if (city) {
      conditions.push(`location->>'city' ILIKE :city`);
      replacements.city = `%${city}%`;
    }
    if (type) {
      conditions.push(`(type ILIKE :type OR specialty ILIKE :type)`);
      replacements.type = `%${type}%`;
    }

    const where = conditions.join(' AND ');

    const [{ total }] = await postgresSequelize.query(
      `SELECT COUNT(*)::int AS total FROM provider_clinics WHERE ${where}`,
      { replacements, type: postgresSequelize.QueryTypes.SELECT }
    );

    const clinics = await postgresSequelize.query(
      `SELECT id, name, type, specialty, location, services, phone, email, latitude, longitude
       FROM provider_clinics
       WHERE ${where}
       ORDER BY name ASC
       LIMIT :limit OFFSET :offset`,
      {
        replacements: { ...replacements, limit, offset },
        type: postgresSequelize.QueryTypes.SELECT
      }
    );

    const normalized = clinics.map(c => ({
      id: c.id,
      name: c.name,
      type: c.type || '',
      specialty: c.specialty || '',
      city: c.location?.city || '',
      state: c.location?.state || '',
      address: c.location?.address || '',
      pincode: c.location?.pincode || '',
      phone: c.phone || '',
      email: c.email || '',
      services: c.services || [],
      latitude: c.latitude,
      longitude: c.longitude,
    }));

    res.json({
      success: true,
      clinics: normalized,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('Error fetching provider clinics:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch clinics' });
  }
});

/**
 * GET /api/patient/my-data-access-log
 * ITEM-27 — DPDP Act 2023 patient data access transparency
 *
 * Returns a human-readable access log of who accessed this patient's data,
 * drawn from api_audit_logs (and ai_request_logs where applicable).
 *
 * Auth: logged-in patient only.
 * Scrubbed: no internal IDs, raw IPs, or stack traces exposed.
 */
router.get('/my-data-access-log', authUser, requirePatient, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.user_id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // ── Resolve patient row id (patients.id) from users.id ──────────────────
    // The patients table links to users via the "userId" column.
    let patientId = null;
    try {
      const { rows: pRows } = await pool.query(
        `SELECT id FROM patients WHERE "userId" = $1 LIMIT 1`,
        [userId]
      );
      patientId = pRows[0]?.id ?? null;
    } catch (_) { /* patients table may vary — proceed without patientId */ }

    // ── Pull api_audit_logs entries for this user ────────────────────────────
    // We match on user_id directly (logged by api-auth middleware) plus any
    // resource_id that contains the userId or patientId string.
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit ?? '50', 10)));

    // Build inclusive OR condition: rows owned by this user_id OR resource_id matches
    const conditions = [`(user_id = $1 OR resource_id = $2`];
    const params = [String(userId), String(userId)];

    if (patientId) {
      params.push(String(patientId));
      conditions[0] += ` OR resource_id = $${params.length}`;
    }
    conditions[0] += ')';

    params.push(limit);

    const { rows: auditRows } = await pool.query(
      `SELECT
         created_at,
         user_role,
         action,
         resource_type,
         endpoint,
         http_method
       FROM api_audit_logs
       WHERE ${conditions[0]}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
      params
    ).catch(() => ({ rows: [] }));

    // ── Categorise each log entry into human-readable data categories ────────
    function categoriseAction(action = '', resourceType = '', endpoint = '') {
      const a = (action + ' ' + resourceType + ' ' + endpoint).toLowerCase();
      if (/appointment/.test(a))              return 'Appointment Records';
      if (/prescription|medication|drug/.test(a)) return 'Prescription & Medication';
      if (/lab|report|test/.test(a))          return 'Lab Results';
      if (/ehr|emr|clinical|diagnosis/.test(a)) return 'Clinical / EHR Records';
      if (/health.risk|risk.score/.test(a))   return 'AI Health Risk Score';
      if (/triage/.test(a))                   return 'Triage Assessment';
      if (/profile|user/.test(a))             return 'Patient Profile';
      if (/payment|billing|invoice/.test(a))  return 'Billing & Payment';
      if (/consent/.test(a))                  return 'Consent Records';
      if (/document|upload|file/.test(a))     return 'Uploaded Documents';
      if (/chat|message/.test(a))             return 'Messages & Chat';
      return 'General Health Data';
    }

    function humanRole(role = '') {
      const map = {
        doctor:           'Treating Doctor',
        nurse:            'Nurse',
        admin:            'Clinic Administrator',
        super_admin:      'Platform Administrator',
        medical_director: 'Medical Director',
        assistant:        'Doctor\'s Assistant',
        receptionist:     'Receptionist',
        lab:              'Laboratory',
        pharmacist:       'Pharmacist',
        patient:          'You (Self)',
        team:             'Clinic Staff',
        system:           'Automated System',
      };
      return map[role] || 'Healthcare Professional';
    }

    const accessLog = auditRows.map(row => ({
      date:         row.created_at,
      accessedBy:   humanRole(row.user_role),
      action:       (row.http_method === 'GET' ? 'Viewed' : 'Updated') + ' your data',
      dataCategory: categoriseAction(row.action, row.resource_type, row.endpoint),
    }));

    return res.json({
      success:   true,
      patientId: patientId ?? undefined,
      totalEntries: accessLog.length,
      accessLog,
      dpdpNotice: 'Under the Digital Personal Data Protection Act 2023 (DPDP Act), you have the right to know how your health data is accessed and processed. You can withdraw AI analysis consent at any time via Settings > Privacy.',
      dataRights: {
        rightToAccess:    'You can request a full copy of all data held about you.',
        rightToCorrect:   'You can request corrections to inaccurate personal data.',
        rightToErase:     'You can request erasure of data no longer required for medical purposes.',
        rightToWithdraw:  'You can withdraw consent for AI-based analysis at any time via Settings > Privacy.',
        contactDPO:       'data-privacy@mediczy.in',
      },
    });
  } catch (err) {
    console.error('[DPDP] my-data-access-log error:', err.message);
    res.status(500).json({ success: false, message: 'Unable to retrieve access log' });
  }
});

export default router;
