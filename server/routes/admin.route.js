import express from 'express';
import { body } from 'express-validator';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { authLimiter } from '../middleware/rateLimiter.middleware.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import userModel, { generateAuthTokenForUser } from '../models/user.model.intelligent.js';
import { Corporate } from '../models/crm.model.intelligent.js';
import { Corporate as InsuranceCorporate, InsuranceCompany } from '../models/insurance-company.model.intelligent.js';
import Nurse from '../models/nurse.model.intelligent.js';
import Assistant from '../models/assistant.model.intelligent.js';
import { Op } from 'sequelize';
import welcomeEmailService from '../services/welcome-email.service.js';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import { 
  adminLogin, 
  adminProfile,
  bulkUploadDoctors, 
  bulkUploadLabs, 
  bulkUploadPharmacies, 
  bulkUploadCorporates,
  getDashboardStats,
  listUsers,
  listDoctors,
  getDoctorCities,
  getDoctorStates,
  getDoctorSpecialties,
  listLabs,
  listPharmacies,
  listCorporates,
  createInternalUser
} from '../controller/admin.controller.js';
import {
  createHealthRiskAssessment,
  getMemberHealthRiskHistory,
  runHealthRiskInference
} from '../controller/healthRisk.controller.js';
import {
  getWhatsAppStats,
  getWhatsAppTemplates,
  createWhatsAppTemplate,
  updateWhatsAppTemplate,
  deleteWhatsAppTemplate,
  getWhatsAppCampaigns,
  createWhatsAppCampaign,
  updateWhatsAppCampaignStatus,
  getWhatsAppMessages,
  sendWhatsAppMessage,
  verifyWhatsAppWebhook,
  getWhatsAppWebhook
} from '../controller/whatsapp.controller.js';

const router = express.Router();

/**
 * Generate unique alphanumeric ID
 * @param {string} prefix - 'C' for Corporate, 'T' for Team member
 * @param {number} length - Total length including prefix (default: 6)
 * @returns {string} Unique ID like C12AB3 or T45XY6
 */
function generateUniqueId(prefix, length = 6) {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const randomLength = length - prefix.length;
  let result = prefix;
  
  for (let i = 0; i < randomLength; i++) {
    const randomIndex = crypto.randomInt(0, chars.length);
    result += chars[randomIndex];
  }
  
  return result;
}

/**
 * Check if unique ID exists in database
 * @param {string} uniqueId - The ID to check
 * @param {string} table - 'corporates' or 'users'
 * @returns {Promise<boolean>}
 */
async function isUniqueIdExists(uniqueId, table) {
  try {
    const [result] = await postgresSequelize.query(
      `SELECT unique_id FROM ${table} WHERE unique_id = :uniqueId LIMIT 1`,
      { replacements: { uniqueId }, type: postgresSequelize.QueryTypes.SELECT }
    );
    return result && result.length > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Generate guaranteed unique ID with retries
 * @param {string} prefix - 'C' for Corporate, 'T' for Team member
 * @param {string} table - 'corporates' or 'users'
 * @param {number} maxRetries - Maximum retry attempts (default: 10)
 * @returns {Promise<string>}
 */
async function generateGuaranteedUniqueId(prefix, table, maxRetries = 10) {
  for (let i = 0; i < maxRetries; i++) {
    const uniqueId = generateUniqueId(prefix);
    const exists = await isUniqueIdExists(uniqueId, table);
    if (!exists) {
      return uniqueId;
    }
  }
  // Fallback: use timestamp suffix if all retries failed
  return `${prefix}${Date.now().toString(36).slice(-5).toUpperCase()}`;
}

// --------------------------------------------------------------------------
// Demo data for admin tables (team/users/doctors) - non-persistent
// --------------------------------------------------------------------------

const demoTeamUsers = [
  {
    id: 'team_001',
    firstName: 'Anita',
    lastName: 'Verma',
    email: 'anita.verma@mediczy.com',
    phoneNumber: '+91-9876543210',
    employeeId: 'EMP-1001',
    department: 'Care Coordination',
    designation: 'Senior Care Manager',
    role: 'Team Member',
    permissions: [
      'User Management',
      'Appointment Management',
      'Support Tickets',
      'Audit Logs'
    ],
    address: { street: '12 Care Street', city: 'Mumbai', state: 'MH', pincode: '400001' },
    emergencyContact: { name: 'Rohit Verma', relationship: 'Spouse', phone: '+91-9876500000' },
    joiningDate: '2024-01-10',
    isActive: true,
    canLogin: true
  },
  {
    id: 'team_002',
    firstName: 'Rahul',
    lastName: 'Mehta',
    email: 'rahul.mehta@mediczy.com',
    phoneNumber: '+91-9876543211',
    employeeId: 'EMP-1002',
    department: 'Support',
    designation: 'Support Specialist',
    role: 'Team Member',
    permissions: [
      'User Management',
      'Support Tickets'
    ],
    address: { street: '8 Health Lane', city: 'Pune', state: 'MH', pincode: '411001' },
    emergencyContact: { name: 'Neha Mehta', relationship: 'Sister', phone: '+91-9876511111' },
    joiningDate: '2024-03-05',
    isActive: true,
    canLogin: true
  }
];

const demoMemberUsers = [
  {
    id: 'user_001',
    firstName: 'Priya',
    lastName: 'Sharma',
    email: 'priya.sharma@example.com',
    phoneNumber: '+91-9000000001',
    dateOfBirth: '1990-05-12',
    gender: 'Female',
    address: { street: '21 Wellness Road', city: 'Delhi', state: 'DL', pincode: '110001' },
    emergencyContact: { name: 'Anil Sharma', relationship: 'Father', phone: '+91-9000000002' },
    membershipType: 'Premium',
    isActive: true,
    verified: true,
    createdAt: '2024-02-01T10:00:00Z'
  },
  {
    id: 'user_002',
    firstName: 'Amit',
    lastName: 'Kumar',
    email: 'amit.kumar@example.com',
    phoneNumber: '+91-9000000003',
    dateOfBirth: '1985-09-20',
    gender: 'Male',
    address: { street: '55 Care Avenue', city: 'Bengaluru', state: 'KA', pincode: '560001' },
    emergencyContact: { name: 'Sunita Kumar', relationship: 'Mother', phone: '+91-9000000004' },
    membershipType: 'Free',
    isActive: true,
    verified: false,
    createdAt: '2024-02-15T09:30:00Z'
  }
];

const demoDoctors = [
  {
    id: 'dr_001',
    prefix: 'Dr',
    firstName: 'Sarah',
    lastName: 'Johnson',
    email: 'sarah.johnson@mediczy.com',
    phoneNumber: '+1-234-567-8901',
    specialization: 'Cardiologist',
    experience: 12,
    languages: ['English', 'Hindi'],
    about: 'Experienced cardiologist specializing in interventional procedures.',
    createdAt: '2024-01-15T10:30:00Z'
  },
  {
    id: 'dr_002',
    prefix: 'Dr',
    firstName: 'Michael',
    lastName: 'Chen',
    email: 'michael.chen@mediczy.com',
    phoneNumber: '+1-234-567-8902',
    specialization: 'Pediatrician',
    experience: 8,
    languages: ['English'],
    about: 'Dedicated pediatrician with focus on preventive care.',
    createdAt: '2024-02-10T14:15:00Z'
  }
];

// Demo lists for corporates (admin-only, non-persistent)

const demoAdminCorporates = [
  {
    id: 'corp_001',
    organizationName: 'TechCorp Solutions',
    contactPersonName: 'Rahul Sharma',
    contactEmail: 'rahul.sharma@techcorp.com',
    contactPhone: '+91-9000033331',
    employeeCount: 500,
    contractStatus: 'Active',
    isActive: true,
    createdAt: '2024-02-20T08:00:00Z'
  },
  {
    id: 'corp_002',
    organizationName: 'HealthPlus Insurance',
    contactPersonName: 'Meera Iyer',
    contactEmail: 'meera.iyer@healthplus.com',
    contactPhone: '+91-9000033332',
    employeeCount: 2000,
    contractStatus: 'Prospect',
    isActive: true,
    createdAt: '2024-03-02T09:30:00Z'
  }
];

// Admin login
router.post('/login', authLimiter, [
  body('email').isEmail(),
  body('password').isLength({ min: 4 })
], adminLogin);

// Admin profile validation
router.get('/profile', authUser, requireRole('admin'), adminProfile);

// Protected admin endpoints
router.post('/masters/doctors', authUser, requireRole('admin'), bulkUploadDoctors);
router.post('/masters/labs', authUser, requireRole('admin'), bulkUploadLabs);
router.post('/masters/pharmacies', authUser, requireRole('admin'), bulkUploadPharmacies);
router.post('/masters/corporates', authUser, requireRole('admin'), bulkUploadCorporates);

// Dashboard and listings
router.get('/dashboard/stats', authUser, requireRole('admin'), getDashboardStats);
// Enhanced users management with filtering and pagination
router.get('/users', authUser, requireRole('admin'), async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      search = '', 
      status = 'all',
      sortBy = 'createdAt',
      sortOrder = 'DESC'
    } = req.query;
    
    // Validate pagination parameters
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;
    
    // Build where clause for filtering
    const whereClause = {};
    
    if (search) {
      whereClause[Op.or] = [
        { firstName: { [Op.like]: `%${search}%` } },
        { lastName: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } }
      ];
    }
    
    if (status !== 'all') {
      whereClause.isActive = status === 'active';
    }
    
    // Validate sort parameters
    const allowedSortFields = ['createdAt', 'firstName', 'lastName', 'email', 'lastLogin'];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const sortDirection = ['ASC', 'DESC'].includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';
    
    const { count, rows: users } = await userModel.findAndCountAll({
      where: whereClause,
      order: [[sortField, sortDirection]],
      limit: limitNum,
      offset: offset,
      attributes: {
        exclude: ['password', 'resetPasswordToken', 'verificationToken']
      }
    });
    
    // Add computed fields
    const enrichedUsers = users.map(user => ({
      ...user.toJSON(),
      fullName: `${user.firstName} ${user.lastName}`,
      daysSinceJoining: Math.floor((new Date() - new Date(user.createdAt)) / (1000 * 60 * 60 * 24)),
      status: user.isActive ? 'Active' : 'Inactive'
    }));
    
    res.json({
      success: true,
      data: enrichedUsers,
      pagination: {
        total: count,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(count / limitNum),
        hasNext: (pageNum * limitNum) < count,
        hasPrev: pageNum > 1
      },
      filters: {
        search,
        status,
        sortBy: sortField,
        sortOrder: sortDirection
      }
    });
  } catch (error) {
    console.error('Users list error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error.message
    });
  }
});

// Health risk assessment endpoints
router.get('/health-risk/members/:memberId', authUser, requireRole('admin'), getMemberHealthRiskHistory);
router.post('/health-risk/members/:memberId/assessments', authUser, requireRole('admin'), createHealthRiskAssessment);
router.post('/health-risk/inference', authUser, requireRole('admin'), runHealthRiskInference);

// Note: /doctors routes are handled by adminDoctorsRouter mounted at /api/admin/doctors in app.js
// This includes GET /doctors, /doctors/filters/*, POST /doctors/:id/create-login, PATCH /doctors/:id/status

router.get('/labs', authUser, requireRole('admin'), listLabs);
router.get('/pharmacies', authUser, requireRole('admin'), listPharmacies);

/**
 * Get Corporates - Filters by user associations for team users
 * Admin users see all corporates, team users see only assigned corporates
 */
router.get('/corporates', authUser, requireRole(['admin', 'team']), async (req, res) => {
  try {
    const userId = req.user.id;
    const isTeam = req.user.isTeam;
    const isAdmin = req.user.isAdmin;
    
    let corporates;
    
    if (isTeam && !isAdmin) {
      // Team users: Get assigned corporates from both old and new systems
      // Old system: user_associations table
      // New system: corporate_team_assignments table
      try {
        const assignedResult = await postgresSequelize.query(`
          SELECT DISTINCT c.* FROM corporates c
          LEFT JOIN user_associations ua 
            ON ua."entityId" = c.id 
            AND ua."userId" = :userId 
            AND ua."entityType" = 'corporate'
          LEFT JOIN corporate_team_assignments cta
            ON cta.corporate_id = c.id
            AND cta.team_member_id = :userId
          WHERE (ua.id IS NOT NULL OR cta.id IS NOT NULL)
          ORDER BY c."companyName" ASC
        `, {
          replacements: { userId },
          type: postgresSequelize.QueryTypes.SELECT
        });
        
        const assigned = Array.isArray(assignedResult) ? assignedResult : [assignedResult].filter(Boolean);
        corporates = assigned;
        
        console.log(`[Corporates] Team user ${req.user.email} - Found ${corporates.length} assigned corporates`);
      } catch (teamQueryError) {
        console.error('[Corporates] Team corporates query error:', teamQueryError.message);
        corporates = [];
      }
    } else {
      // Admin users: Get all corporates from database
      try {
        const allResult = await postgresSequelize.query(`
          SELECT * FROM corporates ORDER BY "companyName" ASC
        `, {
          type: postgresSequelize.QueryTypes.SELECT
        });
        
        const all = Array.isArray(allResult) ? allResult : [];
        corporates = all;
        console.log(`[Corporates] Admin user ${req.user.email} - Found ${corporates.length} total corporates`);
      } catch (adminQueryError) {
        console.error('[Corporates] All corporates query error:', adminQueryError.message);
        corporates = [];
      }
    }
    
    // Fetch plans for all corporates
    const corporateIds = corporates.map(c => c.id).filter(Boolean);
    let plansMap = {};
    
    if (corporateIds.length > 0) {
      try {
        const plansResult = await postgresSequelize.query(`
          SELECT 
            cps.id as sponsorship_id,
            cps.corporate_id,
            cps.plan_id,
            cps.clinic_id,
            cps.doctor_id,
            cps.start_date,
            cps.end_date,
            cps.is_active,
            cps.sponsorship_type,
            cps.corporate_share,
            cps.employee_share
          FROM corporate_plan_sponsorships cps
          WHERE cps.corporate_id IN (:corporateIds)
          ORDER BY cps.start_date DESC
        `, {
          replacements: { corporateIds },
          type: postgresSequelize.QueryTypes.SELECT
        });
        
        const plans = Array.isArray(plansResult) ? plansResult[0] : plansResult;
        
        // Fetch network partners for each sponsorship
        const sponsorshipIds = (plans || []).map(p => p.sponsorship_id).filter(Boolean);
        let partnersMap = {};
        
        if (sponsorshipIds.length > 0) {
          try {
            const partnersResult = await postgresSequelize.query(`
              SELECT sponsorship_id, partner_tenant_id, status
              FROM tenant_partners
              WHERE sponsorship_id IN (:sponsorshipIds)
            `, {
              replacements: { sponsorshipIds },
              type: postgresSequelize.QueryTypes.SELECT
            });
            
            const partners = Array.isArray(partnersResult) ? partnersResult[0] : partnersResult;
            
            // Group partners by sponsorship_id
            (partners || []).forEach(p => {
              if (!partnersMap[p.sponsorship_id]) {
                partnersMap[p.sponsorship_id] = { hospitals: [], labs: [] };
              }
              // We'll need to determine if it's a hospital or lab - for now add to hospitals
              // In production, you'd query the partner type or join with tenants table
              partnersMap[p.sponsorship_id].hospitals.push(p.partner_tenant_id);
            });
          } catch (partnersError) {
            console.error('[Corporates] Partners query error:', partnersError.message);
            // Continue without partners data
          }
        }
        
        // Group plans by corporate_id
        (plans || []).forEach(plan => {
          if (!plansMap[plan.corporate_id]) {
            plansMap[plan.corporate_id] = [];
          }
          plansMap[plan.corporate_id].push({
            sponsorshipId: plan.sponsorship_id,
            planId: plan.plan_id,
            clinicId: plan.clinic_id,
            doctorId: plan.doctor_id,
            startDate: plan.start_date,
            endDate: plan.end_date,
            isActive: plan.is_active,
            sponsorshipType: plan.sponsorship_type,
            corporateShare: plan.corporate_share,
            employeeShare: plan.employee_share,
            networkPartners: partnersMap[plan.sponsorship_id] || { hospitals: [], labs: [] }
          });
        });
      } catch (plansError) {
        console.error('[Corporates] Plans query error:', plansError.message);
        // Continue without plans data
      }
    }
    
    // Fetch team assignments for all corporates
    let teamAssignmentsMap = {};
    if (corporateIds.length > 0) {
      try {
        const teamAssignmentsResult = await postgresSequelize.query(`
          SELECT 
            cta.corporate_id,
            cta.team_member_id,
            cta.clinic_id,
            cta.is_primary
          FROM corporate_team_assignments cta
          WHERE cta.corporate_id IN (:corporateIds)
          ORDER BY cta.is_primary DESC, cta.created_at ASC
        `, {
          replacements: { corporateIds },
          type: postgresSequelize.QueryTypes.SELECT
        });
        
        const teamAssignments = Array.isArray(teamAssignmentsResult) ? teamAssignmentsResult[0] : teamAssignmentsResult;
        
        // Group team assignments by corporate_id
        (teamAssignments || []).forEach(ta => {
          if (!teamAssignmentsMap[ta.corporate_id]) {
            teamAssignmentsMap[ta.corporate_id] = [];
          }
          teamAssignmentsMap[ta.corporate_id].push({
            teamMemberId: ta.team_member_id,
            clinicId: ta.clinic_id,
            isPrimary: ta.is_primary
          });
        });
      } catch (teamError) {
        console.error('[Corporates] Team assignments query error:', teamError.message);
        // Continue without team assignments
      }
    }

    // Fetch employee counts for all corporates
    let employeeCountMap = {};
    if (corporateIds.length > 0) {
      try {
        const result = await postgresSequelize.query(`
          SELECT "entityId" as corporate_id, COUNT(DISTINCT "userId") as employee_count
          FROM user_associations
          WHERE "entityType" = 'corporate'
          AND "entityId" IN (:corporateIds)
          AND role = 'employee'
          AND status = 'active'
          GROUP BY "entityId"
        `, {
          replacements: { corporateIds },
          type: postgresSequelize.QueryTypes.SELECT
        });
        
        console.log('[Corporates] Employee counts raw result:', result);
        
        // Handle both array and direct result formats
        let employeeCounts = result;
        if (Array.isArray(result) && result.length > 0) {
          // If result is array with single item that's an array, use that
          if (Array.isArray(result[0])) {
            employeeCounts = result[0];
          }
        }
        
        // Ensure employeeCounts is always an array
        if (!Array.isArray(employeeCounts)) {
          employeeCounts = employeeCounts ? [employeeCounts] : [];
        }
        
        console.log('[Corporates] Processing employee counts:', employeeCounts);
        
        employeeCounts.forEach(ec => {
          employeeCountMap[ec.corporate_id] = parseInt(ec.employee_count, 10) || 0;
        });
      } catch (queryError) {
        console.error('[Corporates] Employee counts query error:', queryError.message);
        // Continue without employee counts
      }
    }
    
    // Map to expected format
    const formattedCorporates = corporates.map(c => {
      let metadata = {};
      try {
        metadata = c.metadata ? (typeof c.metadata === 'string' ? JSON.parse(c.metadata) : c.metadata) : {};
      } catch (e) {
        metadata = {};
      }
      
      return {
        id: Number(c.id) || c.id,
        uniqueId: c.unique_id || null,
        companyName: c.companyName,
        contactPerson: c.contactPerson,
        email: c.email,
        phoneNumber: c.phoneNumber,
        industry: c.industry,
        employeeCount: employeeCountMap[c.id] ?? c.employeeCount ?? 0,
        packageType: c.packageType || 'Standard',
        billingCycle: c.billingCycle || 'Yearly',
        status: c.status || 'Active',
        gstNumber: c.gstNumber,
        panNumber: c.panNumber,
        createdAt: c.createdAt,
        // Onboarding details
        assignedTeamMemberId: c.assignedTo, // Kept for backward compatibility
        teamAssignments: teamAssignmentsMap[c.id] || [], // Array of {teamMemberId, clinicId, isPrimary}
        plans: plansMap[c.id] || [] // Array of plans with clinic, doctor, partners
      };
    });
    
    return res.json({ 
      success: true, 
      data: formattedCorporates, 
      total: formattedCorporates.length,
      isFiltered: isTeam && !isAdmin
    });
  } catch (error) {
    console.error('[Corporates] Error fetching corporates:', error);
    console.error('[Corporates] Error stack:', error.stack);
    // Return empty list instead of demo data to force frontend to use team login data
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch corporates',
      error: error.message,
      data: []
    });
  }
});

/**
 * Get All Active Insurance Corporates (Master List)
 * GET /api/admin/insurance-corporates
 */
router.get('/insurance-corporates', authUser, requireRole('admin'), async (req, res) => {
  try {
    const { status = 'active', page = 1, limit = 50, onboardedBy } = req.query;
    
    const whereClause = {};
    if (status) whereClause.status = status;
    if (onboardedBy) whereClause.onboardedBy = onboardedBy;

    const offset = (page - 1) * limit;
    
    const { count, rows: corporates } = await InsuranceCorporate.findAndCountAll({
      where: whereClause,
      attributes: [
        'id', 'companyName', 'cin', 'gstin', 'pan', 'industry', 
        'employeeCount', 'hrContactName', 'hrContactEmail', 'hrContactPhone',
        'officeAddress', 'city', 'state', 'pincode', 
        'status', 'isVerified', 'onboardedBy', 'onboardedById',
        'createdAt', 'updatedAt'
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    // Group by onboarding source
    const groupedBySource = corporates.reduce((acc, corp) => {
      const source = corp.onboardedBy || 'direct';
      if (!acc[source]) acc[source] = [];
      acc[source].push(corp);
      return acc;
    }, {});

    res.json({
      success: true,
      total: count,
      page: parseInt(page),
      totalPages: Math.ceil(count / limit),
      corporates,
      groupedBySource,
      stats: {
        total: count,
        bySource: Object.keys(groupedBySource).reduce((acc, key) => {
          acc[key] = groupedBySource[key].length;
          return acc;
        }, {})
      }
    });
  } catch (error) {
    console.error('Get insurance corporates error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get corporates',
      error: error.message
    });
  }
});

// Nurses admin listings backed by Sequelize
router.get('/nurses', authUser, requireRole('admin'), async (req, res) => {
  try {
    const nurses = await Nurse.findAll({ order: [['createdAt', 'DESC']] });

    const nursesWithLoginFlag = await Promise.all(
      nurses.map(async (nurse) => {
        const existingUser = await userModel.findOne({ where: { email: nurse.email } });
        return {
          ...nurse.toJSON(),
          hasLogin: !!existingUser,
        };
      })
    );

    return res.json({ success: true, data: nursesWithLoginFlag, total: nurses.length });
  } catch (e) {
    console.error('Failed to fetch nurses:', e);
    return res.status(500).json({ success: false, message: 'Failed to fetch nurses' });
  }
});

router.post('/nurses', authUser, requireRole('admin'), async (req, res) => {
  try {
    const nursePayload = req.body?.nurse || req.body;
    let generatedPassword;
    
    // Generate default password if not provided
    if (!nursePayload.password) {
      generatedPassword = Math.random().toString(36).slice(-8) + 'Nurse123!';
      nursePayload.password = generatedPassword;
    }
    
    const created = await Nurse.create(nursePayload);
    
    // Don't return password in response
    const nurseResponse = { ...created.toJSON() };
    delete nurseResponse.password;
    
    return res.status(201).json({
      success: true,
      message: 'Nurse created',
      nurse: nurseResponse,
      ...(generatedPassword ? { generatedPassword } : {}),
    });
  } catch (e) {
    console.error('Failed to create nurse:', e);
    return res.status(500).json({ success: false, message: 'Failed to create nurse', error: e.message });
  }
});

// Reset nurse password (admin-only)
router.post('/nurses/:id/reset-password', authUser, requireRole('admin'), async (req, res) => {
  try {
    const nurse = await Nurse.findByPk(req.params.id);
    if (!nurse) {
      return res.status(404).json({ success: false, message: 'Nurse not found' });
    }

    const requestedPassword = String(req.body?.password || '').trim();
    const generatedPassword = requestedPassword
      ? undefined
      : Math.random().toString(36).slice(-10) + 'Nurse123!';
    const newPassword = requestedPassword || generatedPassword;

    // Nurse model hooks will hash the password.
    await nurse.update({ password: newPassword });

    // Best-effort: keep any associated userModel (role=nurse) password aligned.
    try {
      const nurseEmail = String(nurse.email || '').trim().toLowerCase();
      if (nurseEmail) {
        const nurseUser = await userModel.findOne({ where: { email: nurseEmail, role: 'nurse' } });
        if (nurseUser) {
          const hashedPassword = await bcrypt.hash(newPassword, 10);
          await nurseUser.update({ password: hashedPassword });
        }
      }
    } catch (e) {
      console.warn('Failed to sync nurse password to nurse user record:', e?.message || e);
    }

    const nurseResponse = { ...nurse.toJSON() };
    delete nurseResponse.password;

    return res.json({
      success: true,
      message: 'Nurse password reset',
      nurse: nurseResponse,
      ...(generatedPassword ? { generatedPassword } : {}),
    });
  } catch (e) {
    console.error('Failed to reset nurse password:', e);
    return res.status(500).json({ success: false, message: 'Failed to reset nurse password', error: e.message });
  }
});

// Update nurse
router.put('/nurses/:id', authUser, requireRole('admin'), async (req, res) => {
  try {
    const nurseData = req.body?.nurse || req.body;
    const nurse = await Nurse.findByPk(req.params.id);

    if (!nurse) {
      return res.status(404).json({ success: false, message: 'Nurse not found' });
    }

    const updateData = {
      firstName: nurseData.firstName || nurse.firstName,
      lastName: nurseData.lastName || nurse.lastName,
      email: nurseData.email || nurse.email,
      phone: nurseData.phone || nurse.phone,
      specialization: nurseData.specialization || nurse.specialization,
      qualification: nurseData.qualification || nurse.qualification,
      experience: nurseData.experience || nurse.experience,
      isActive: nurseData.isActive !== undefined ? nurseData.isActive : nurse.isActive
    };

    if (nurseData.password && nurseData.password.trim() !== '') {
      updateData.password = nurseData.password;
    }

    await nurse.update(updateData);

    const nurseResponse = { ...nurse.toJSON() };
    delete nurseResponse.password;

    return res.json({
      success: true,
      message: 'Nurse updated successfully',
      nurse: nurseResponse
    });
  } catch (e) {
    console.error('Failed to update nurse:', e);
    return res.status(500).json({ success: false, message: 'Failed to update nurse', error: e.message });
  }
});

router.put('/nurses/:id/status', authUser, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const nurse = await Nurse.findByPk(id);
    if (!nurse) {
      return res.status(404).json({ success: false, message: 'Nurse not found' });
    }

    if (typeof isActive === 'boolean') {
      nurse.isActive = isActive;
    }
    await nurse.save();

    return res.json({ success: true, nurse });
  } catch (e) {
    console.error('Failed to update nurse status:', e);
    return res.status(500).json({ success: false, message: 'Failed to update nurse status' });
  }
});

// Delete nurse - soft delete
router.delete('/nurses/:id', authUser, requireRole('admin'), async (req, res) => {
  try {
    const nurse = await Nurse.findByPk(req.params.id);

    if (!nurse) {
      return res.status(404).json({ success: false, message: 'Nurse not found' });
    }

    await nurse.update({ isActive: false });

    return res.json({
      success: true,
      message: 'Nurse deleted successfully'
    });
  } catch (e) {
    console.error('Failed to delete nurse:', e);
    return res.status(500).json({ success: false, message: 'Failed to delete nurse', error: e.message });
  }
});

// Doctor assistants admin listings backed by Sequelize
router.get('/assistants', authUser, requireRole('admin'), async (req, res) => {
  try {
    const assistants = await Assistant.findAll({ order: [['createdAt', 'DESC']] });

    const assistantsWithLoginFlag = await Promise.all(
      assistants.map(async (assistant) => {
        const existingUser = await userModel.findOne({ where: { email: assistant.email } });
        return {
          ...assistant.toJSON(),
          hasLogin: !!existingUser,
        };
      })
    );

    return res.json({ success: true, data: assistantsWithLoginFlag, total: assistants.length });
  } catch (e) {
    console.error('Failed to fetch assistants:', e);
    return res.status(500).json({ success: false, message: 'Failed to fetch assistants' });
  }
});

router.post('/assistants', authUser, requireRole('admin'), async (req, res) => {
  try {
    const assistantPayload = req.body?.assistant || req.body;
    const created = await Assistant.create(assistantPayload);
    return res.status(201).json({
      success: true,
      message: 'Assistant created',
      assistant: created,
    });
  } catch (e) {
    console.error('Failed to create assistant:', e);
    return res.status(500).json({ success: false, message: 'Failed to create assistant' });
  }
});

// Update assistant
router.put('/assistants/:id', authUser, requireRole('admin'), async (req, res) => {
  try {
    const assistantData = req.body?.assistant || req.body;
    const assistant = await Assistant.findByPk(req.params.id);

    if (!assistant) {
      return res.status(404).json({ success: false, message: 'Assistant not found' });
    }

    const updateData = {
      firstName: assistantData.firstName || assistant.firstName,
      lastName: assistantData.lastName || assistant.lastName,
      email: assistantData.email || assistant.email,
      phone: assistantData.phone || assistant.phone,
      specialization: assistantData.specialization || assistant.specialization,
      qualification: assistantData.qualification || assistant.qualification,
      experience: assistantData.experience || assistant.experience,
      isActive: assistantData.isActive !== undefined ? assistantData.isActive : assistant.isActive
    };

    if (assistantData.password && assistantData.password.trim() !== '') {
      updateData.password = assistantData.password;
    }

    await assistant.update(updateData);

    return res.json({
      success: true,
      message: 'Assistant updated successfully',
      assistant: {
        id: assistant.id,
        firstName: assistant.firstName,
        lastName: assistant.lastName,
        email: assistant.email
      }
    });
  } catch (e) {
    console.error('Failed to update assistant:', e);
    return res.status(500).json({ success: false, message: 'Failed to update assistant', error: e.message });
  }
});

router.put('/assistants/:id/status', authUser, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const assistant = await Assistant.findByPk(id);
    if (!assistant) {
      return res.status(404).json({ success: false, message: 'Assistant not found' });
    }

    if (typeof isActive === 'boolean') {
      assistant.isActive = isActive;
    }
    await assistant.save();

    return res.json({ success: true, assistant });
  } catch (e) {
    console.error('Failed to update assistant status:', e);
    return res.status(500).json({ success: false, message: 'Failed to update assistant status' });
  }
});

// Delete assistant - soft delete
router.delete('/assistants/:id', authUser, requireRole('admin'), async (req, res) => {
  try {
    const assistant = await Assistant.findByPk(req.params.id);

    if (!assistant) {
      return res.status(404).json({ success: false, message: 'Assistant not found' });
    }

    await assistant.update({ isActive: false });

    return res.json({
      success: true,
      message: 'Assistant deleted successfully'
    });
  } catch (e) {
    console.error('Failed to delete assistant:', e);
    return res.status(500).json({ success: false, message: 'Failed to delete assistant', error: e.message });
  }
});

router.post('/corporates', authUser, requireRole(['admin', 'team']), async (req, res) => {
  try {
    const corporateData = req.body?.corporate || req.body;
    const { 
      companyName, contactPerson, email, phoneNumber, industry, employeeCount, 
      packageType, gstNumber, panNumber, status,
      // Onboarding fields
      assignedTeamMemberId,
      teamAssignments, // Array of: { teamMemberId, clinicId, isPrimary }
      plans // Array of: { planId, clinicId, doctorId, startDate, endDate, networkPartners }
    } = corporateData;
    
    if (!companyName || !email) {
      return res.status(400).json({
        success: false,
        message: 'Company name and email are required'
      });
    }
    
    // Check if corporate with this email already exists
    const [existing] = await postgresSequelize.query(`
      SELECT id FROM corporates WHERE email = :email
    `, {
      replacements: { email: email.toLowerCase() },
      type: postgresSequelize.QueryTypes.SELECT
    });
    
    if (existing && existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Corporate with this email already exists'
      });
    }
    
    // Build metadata
    const metadata = {
      onboardedAt: new Date().toISOString(),
      onboardedBy: req.user.email
    };
    
    // Parse assignedTeamMemberId
    const parsedAssignedTeamMemberId = assignedTeamMemberId === null ? null : (parseInt(assignedTeamMemberId) || null);
    
    // Generate unique corporate ID
    const corporateUniqueId = await generateGuaranteedUniqueId('C', 'corporates');
    
    // Insert new corporate
    const [result] = await postgresSequelize.query(`
      INSERT INTO corporates (
        "companyName", "contactPerson", email, "phoneNumber", industry, 
        "employeeCount", "packageType", "gstNumber", "panNumber", status, 
        "assignedTo", metadata, unique_id, "createdAt", "updatedAt"
      )
      VALUES (
        :companyName, :contactPerson, :email, :phoneNumber, :industry, 
        :employeeCount, :packageType, :gstNumber, :panNumber, :status, 
        :assignedTo, :metadata, :uniqueId, NOW(), NOW()
      )
      RETURNING id, uid, unique_id, "companyName", email, status
    `, {
      replacements: {
        companyName,
        contactPerson: contactPerson || companyName,
        email: email.toLowerCase(),
        phoneNumber: phoneNumber || '',
        industry: industry || 'Other',
        employeeCount: parseInt(employeeCount) || 0,
        packageType: packageType || 'Standard',
        gstNumber: gstNumber || null,
        panNumber: panNumber || null,
        status: status || 'Active',
        assignedTo: parsedAssignedTeamMemberId || (req.user.isTeam ? req.user.id : null),
        metadata: JSON.stringify(metadata),
        uniqueId: corporateUniqueId
      },
      type: postgresSequelize.QueryTypes.INSERT
    });
    
    const newCorporate = result && result[0] ? result[0] : { id: Date.now() };
    
    // Create user association for assigned team member
    if (parsedAssignedTeamMemberId && newCorporate.id) {
      await postgresSequelize.query(`
        INSERT INTO user_associations ("userId", "entityType", "entityId", role, "isPrimary", status, "startDate", "createdAt", "updatedAt")
        VALUES (:userId, 'corporate', :corporateId, 'manager', true, 'active', NOW(), NOW(), NOW())
        ON CONFLICT DO NOTHING
      `, {
        replacements: { userId: parsedAssignedTeamMemberId, corporateId: newCorporate.id }
      });
    } else if (req.user.isTeam && !req.user.isAdmin && newCorporate.id) {
      // Fallback: assign to current user if team member
      await postgresSequelize.query(`
        INSERT INTO user_associations ("userId", "entityType", "entityId", role, "isPrimary", status, "startDate", "createdAt", "updatedAt")
        VALUES (:userId, 'corporate', :corporateId, 'manager', true, 'active', NOW(), NOW(), NOW())
        ON CONFLICT DO NOTHING
      `, {
        replacements: { userId: req.user.id, corporateId: newCorporate.id }
      });
    }
    
    // Create team assignments
    const createdTeamAssignments = [];
    if (teamAssignments && Array.isArray(teamAssignments) && teamAssignments.length > 0 && newCorporate.id) {
      for (const assignment of teamAssignments) {
        const { teamMemberId, clinicId, isPrimary } = assignment;
        const parsedTeamMemberId = teamMemberId ? parseInt(teamMemberId) : null;
        const parsedClinicId = clinicId ? parseInt(clinicId) : null;
        
        if (!parsedTeamMemberId) continue; // Skip if no team member ID
        
        await postgresSequelize.query(`
          INSERT INTO corporate_team_assignments 
          (corporate_id, team_member_id, clinic_id, is_primary, created_at, updated_at)
          VALUES (:corporateId, :teamMemberId, :clinicId, :isPrimary, NOW(), NOW())
          ON CONFLICT (corporate_id, team_member_id) 
          DO UPDATE SET clinic_id = :clinicId, is_primary = :isPrimary, updated_at = NOW()
        `, {
          replacements: {
            corporateId: newCorporate.id,
            teamMemberId: parsedTeamMemberId,
            clinicId: parsedClinicId,
            isPrimary: isPrimary || false
          }
        });
        
        // Also create user association for each team member
        await postgresSequelize.query(`
          INSERT INTO user_associations ("userId", "entityType", "entityId", role, "isPrimary", status, "startDate", "createdAt", "updatedAt")
          VALUES (:userId, 'corporate', :corporateId, 'manager', :isPrimary, 'active', NOW(), NOW(), NOW())
          ON CONFLICT DO NOTHING
        `, {
          replacements: { 
            userId: parsedTeamMemberId, 
            corporateId: newCorporate.id,
            isPrimary: isPrimary || false
          }
        });
        
        createdTeamAssignments.push({
          teamMemberId: parsedTeamMemberId,
          clinicId: parsedClinicId,
          isPrimary: isPrimary || false
        });
      }
    }
    
    // Create multiple membership plans
    const createdPlans = [];
    if (plans && Array.isArray(plans) && plans.length > 0 && newCorporate.id) {
      for (const plan of plans) {
        const {
          planId,
          clinicId,
          doctorId,
          startDate,
          endDate,
          networkPartners
        } = plan;
        
        // Parse and validate IDs
        const parsedPlanId = planId ? parseInt(planId) : null;
        const parsedClinicId = clinicId ? parseInt(clinicId) : null;
        const parsedDoctorId = doctorId ? parseInt(doctorId) : null;
        
        if (!parsedPlanId) continue; // Skip if no plan ID
        
        // Insert into corporate_plan_sponsorships (using snake_case for actual DB)
        const [sponsorshipResult] = await postgresSequelize.query(`
          INSERT INTO corporate_plan_sponsorships 
          (corporate_id, plan_id, clinic_id, doctor_id, sponsorship_type, corporate_share, employee_share, 
           start_date, end_date, is_active, created_at, updated_at)
          VALUES (:corporateId, :planId, :clinicId, :doctorId, 'full', 100, 0,
                  :startDate, :endDate, true, NOW(), NOW())
          RETURNING id
        `, {
          replacements: {
            corporateId: newCorporate.id,
            planId: parsedPlanId,
            clinicId: parsedClinicId,
            doctorId: parsedDoctorId,
            startDate: startDate || new Date().toISOString(),
            endDate: endDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
          },
          type: postgresSequelize.QueryTypes.INSERT
        });
        
        const sponsorshipId = sponsorshipResult && sponsorshipResult[0] ? sponsorshipResult[0].id : null;
        
        // Link network partners to this specific sponsorship
        if (sponsorshipId && networkPartners) {
          const { hospitals = [], labs = [] } = networkPartners;
          
          // Link hospitals
          for (const hospitalId of hospitals) {
            await postgresSequelize.query(`
              INSERT INTO tenant_partners (corporate_tenant_id, partner_tenant_id, sponsorship_id, status, "createdAt", "updatedAt")
              VALUES (:corporateId, :partnerId, :sponsorshipId, 'active', NOW(), NOW())
              ON CONFLICT DO NOTHING
            `, {
              replacements: { 
                corporateId: newCorporate.id, 
                partnerId: parseInt(hospitalId),
                sponsorshipId
              }
            });
          }
          
          // Link labs
          for (const labId of labs) {
            await postgresSequelize.query(`
              INSERT INTO tenant_partners (corporate_tenant_id, partner_tenant_id, sponsorship_id, status, "createdAt", "updatedAt")
              VALUES (:corporateId, :partnerId, :sponsorshipId, 'active', NOW(), NOW())
              ON CONFLICT DO NOTHING
            `, {
              replacements: { 
                corporateId: newCorporate.id, 
                partnerId: parseInt(labId),
                sponsorshipId
              }
            });
          }
        }
        
        createdPlans.push({
          sponsorshipId,
          planId: parsedPlanId,
          clinicId: parsedClinicId,
          doctorId: parsedDoctorId,
          startDate,
          endDate,
          networkPartners
        });
      }
    }
    
    console.log(`[Corporates] Created corporate ${companyName} by ${req.user.email}`);
    console.log(`[Corporates] - Team Member: ${assignedTeamMemberId || req.user.id}`);
    console.log(`[Corporates] - Team Assignments: ${createdTeamAssignments.length} assignment(s) created`);
    console.log(`[Corporates] - Plans: ${createdPlans.length} plan(s) created`);
    
    return res.status(201).json({
      success: true,
      message: 'Corporate created successfully with onboarding details',
      corporate: {
        id: newCorporate.id,
        uid: newCorporate.uid,
        uniqueId: newCorporate.unique_id,
        companyName: newCorporate.companyName || companyName,
        email: newCorporate.email || email,
        status: newCorporate.status || 'Active',
        assignedTeamMemberId: assignedTeamMemberId || (req.user.isTeam ? req.user.id : null),
        teamAssignments: createdTeamAssignments,
        plans: createdPlans,
        isActive: true,
        createdAt: new Date().toISOString()
      },
    });
  } catch (error) {
    console.error('Failed to create corporate:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create corporate',
      error: error.message
    });
  }
});

/**
 * Update Corporate
 * PUT /api/admin/corporates/:id
 */
router.put('/corporates/:id', authUser, requireRole(['admin', 'team']), async (req, res) => {
  try {
    const corporateId = req.params.id;
    const corporateData = req.body?.corporate || req.body;
    const { 
      companyName, contactPerson, email, phoneNumber, industry, employeeCount, 
      packageType, gstNumber, panNumber, status,
      // Onboarding fields
      assignedTeamMemberId,
      teamAssignments, // Array of: { teamMemberId, clinicId, isPrimary }
      plans // Array of: { sponsorshipId (optional), planId, clinicId, doctorId, startDate, endDate, networkPartners }
    } = corporateData;
    
    // Verify corporate exists
    const [existing] = await postgresSequelize.query(`
      SELECT id, metadata, "assignedTo" FROM corporates WHERE id = :corporateId
    `, {
      replacements: { corporateId },
      type: postgresSequelize.QueryTypes.SELECT
    });
    
    const existingCorporate = Array.isArray(existing) ? existing[0] : existing;
    
    if (!existingCorporate) {
      return res.status(404).json({
        success: false,
        message: 'Corporate not found'
      });
    }
    
    // Build update query dynamically based on provided fields
    const updates = [];
    const replacements = { corporateId };
    
    if (companyName !== undefined) {
      updates.push('"companyName" = :companyName');
      replacements.companyName = companyName;
    }
    if (contactPerson !== undefined) {
      updates.push('"contactPerson" = :contactPerson');
      replacements.contactPerson = contactPerson;
    }
    if (email !== undefined) {
      updates.push('email = :email');
      replacements.email = email.toLowerCase();
    }
    if (phoneNumber !== undefined) {
      updates.push('"phoneNumber" = :phoneNumber');
      replacements.phoneNumber = phoneNumber;
    }
    if (industry !== undefined) {
      updates.push('industry = :industry');
      replacements.industry = industry;
    }
    if (employeeCount !== undefined) {
      updates.push('"employeeCount" = :employeeCount');
      replacements.employeeCount = parseInt(employeeCount) || 0;
    }
    if (packageType !== undefined) {
      updates.push('"packageType" = :packageType');
      replacements.packageType = packageType;
    }
    if (gstNumber !== undefined) {
      updates.push('"gstNumber" = :gstNumber');
      replacements.gstNumber = gstNumber || null;
    }
    if (panNumber !== undefined) {
      updates.push('"panNumber" = :panNumber');
      replacements.panNumber = panNumber || null;
    }
    if (status !== undefined) {
      updates.push('status = :status');
      replacements.status = status;
    }
    if (assignedTeamMemberId !== undefined) {
      updates.push('"assignedTo" = :assignedTo');
      replacements.assignedTo = assignedTeamMemberId === null ? null : (parseInt(assignedTeamMemberId) || null);
    }
    
    // Always add updatedAt if there are any updates
    if (updates.length > 0) {
      updates.push('"updatedAt" = NOW()');
      
      // Execute update
      await postgresSequelize.query(`
        UPDATE corporates 
        SET ${updates.join(', ')}
        WHERE id = :corporateId
      `, {
        replacements,
        type: postgresSequelize.QueryTypes.UPDATE
      });
    }
    
    // Update user association if team member changed
    if (assignedTeamMemberId !== undefined && assignedTeamMemberId !== existingCorporate.assignedTo) {
      // Deactivate old association
      await postgresSequelize.query(`
        UPDATE user_associations 
        SET status = 'inactive', "updatedAt" = NOW()
        WHERE "entityType" = 'corporate' AND "entityId" = :corporateId
      `, {
        replacements: { corporateId }
      });
      
      // Create new association (only if assignedTeamMemberId is not null)
      const parsedTeamMemberId = assignedTeamMemberId === null ? null : (parseInt(assignedTeamMemberId) || null);
      if (parsedTeamMemberId) {
        await postgresSequelize.query(`
          INSERT INTO user_associations ("userId", "entityType", "entityId", role, "isPrimary", status, "startDate", "createdAt", "updatedAt")
          VALUES (:userId, 'corporate', :corporateId, 'manager', true, 'active', NOW(), NOW(), NOW())
          ON CONFLICT DO NOTHING
        `, {
          replacements: { userId: parsedTeamMemberId, corporateId }
        });
      }
    }
    
    // Handle plans array (add/update/remove)
    if (plans && Array.isArray(plans)) {
      // Get existing plans for this corporate
      const [existingPlans] = await postgresSequelize.query(`
        SELECT id as sponsorship_id, plan_id, clinic_id, doctor_id, start_date, end_date
        FROM corporate_plan_sponsorships
        WHERE corporate_id = :corporateId
      `, {
        replacements: { corporateId },
        type: postgresSequelize.QueryTypes.SELECT
      });
      
      const existingPlanMap = {};
      (existingPlans || []).forEach(p => {
        existingPlanMap[p.sponsorship_id] = p;
      });
      
      const updatedSponsorshipIds = [];
      
      // Process each plan in the request
      for (const plan of plans) {
        const {
          sponsorshipId,
          planId,
          clinicId,
          doctorId,
          startDate,
          endDate,
          networkPartners
        } = plan;
        
        const parsedPlanId = planId ? parseInt(planId) : null;
        const parsedClinicId = clinicId ? parseInt(clinicId) : null;
        const parsedDoctorId = doctorId ? parseInt(doctorId) : null;
        
        if (!parsedPlanId) continue; // Skip if no plan ID
        
        if (sponsorshipId && existingPlanMap[sponsorshipId]) {
          // Update existing plan
          await postgresSequelize.query(`
            UPDATE corporate_plan_sponsorships
            SET plan_id = :planId,
                clinic_id = :clinicId,
                doctor_id = :doctorId,
                start_date = :startDate,
                end_date = :endDate,
                updated_at = NOW()
            WHERE id = :sponsorshipId AND corporate_id = :corporateId
          `, {
            replacements: {
              sponsorshipId,
              corporateId,
              planId: parsedPlanId,
              clinicId: parsedClinicId,
              doctorId: parsedDoctorId,
              startDate: startDate || new Date().toISOString(),
              endDate: endDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
            }
          });
          
          updatedSponsorshipIds.push(sponsorshipId);
          
          // Update network partners for this sponsorship
          await postgresSequelize.query(`
            DELETE FROM tenant_partners WHERE sponsorship_id = :sponsorshipId
          `, { replacements: { sponsorshipId } });
          
        } else {
          // Insert new plan
          const [sponsorshipResult] = await postgresSequelize.query(`
            INSERT INTO corporate_plan_sponsorships 
            (corporate_id, plan_id, clinic_id, doctor_id, sponsorship_type, corporate_share, employee_share,
             start_date, end_date, is_active, created_at, updated_at)
            VALUES (:corporateId, :planId, :clinicId, :doctorId, 'full', 100, 0,
                    :startDate, :endDate, true, NOW(), NOW())
            RETURNING id
          `, {
            replacements: {
              corporateId,
              planId: parsedPlanId,
              clinicId: parsedClinicId,
              doctorId: parsedDoctorId,
              startDate: startDate || new Date().toISOString(),
              endDate: endDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
            },
            type: postgresSequelize.QueryTypes.INSERT
          });
          
          const newSponsorshipId = sponsorshipResult && sponsorshipResult[0] ? sponsorshipResult[0].id : null;
          if (newSponsorshipId) {
            updatedSponsorshipIds.push(newSponsorshipId);
          }
        }
        
        // Link network partners to sponsorship
        const currentSponsorshipId = sponsorshipId || updatedSponsorshipIds[updatedSponsorshipIds.length - 1];
        if (currentSponsorshipId && networkPartners) {
          const { hospitals = [], labs = [] } = networkPartners;
          
          // Add hospitals
          for (const hospitalId of hospitals) {
            await postgresSequelize.query(`
              INSERT INTO tenant_partners (corporate_tenant_id, partner_tenant_id, sponsorship_id, status, "createdAt", "updatedAt")
              VALUES (:corporateId, :partnerId, :sponsorshipId, 'active', NOW(), NOW())
              ON CONFLICT DO NOTHING
            `, {
              replacements: { 
                corporateId, 
                partnerId: parseInt(hospitalId),
                sponsorshipId: currentSponsorshipId
              }
            });
          }
          
          // Add labs
          for (const labId of labs) {
            await postgresSequelize.query(`
              INSERT INTO tenant_partners (corporate_tenant_id, partner_tenant_id, sponsorship_id, status, "createdAt", "updatedAt")
              VALUES (:corporateId, :partnerId, :sponsorshipId, 'active', NOW(), NOW())
              ON CONFLICT DO NOTHING
            `, {
              replacements: { 
                corporateId, 
                partnerId: parseInt(labId),
                sponsorshipId: currentSponsorshipId
              }
            });
          }
        }
      }
      
      // Remove plans that were not in the updated list
      const existingIds = Object.keys(existingPlanMap).map(id => parseInt(id));
      const toRemove = existingIds.filter(id => !updatedSponsorshipIds.includes(id));
      
      for (const removeId of toRemove) {
        await postgresSequelize.query(`
          DELETE FROM corporate_plan_sponsorships WHERE id = :sponsorshipId AND corporate_id = :corporateId
        `, {
          replacements: { sponsorshipId: removeId, corporateId }
        });
      }
    }
    
    // Handle team assignments array (add/update/remove)
    if (teamAssignments && Array.isArray(teamAssignments)) {
      // Get existing team assignments for this corporate
      const [existingAssignments] = await postgresSequelize.query(`
        SELECT team_member_id, clinic_id, is_primary
        FROM corporate_team_assignments
        WHERE corporate_id = :corporateId
      `, {
        replacements: { corporateId },
        type: postgresSequelize.QueryTypes.SELECT
      });
      
      const existingTeamMemberIds = (existingAssignments || []).map(a => a.team_member_id);
      const updatedTeamMemberIds = [];
      
      // Process each team assignment in the request
      for (const assignment of teamAssignments) {
        const { teamMemberId, clinicId, isPrimary } = assignment;
        const parsedTeamMemberId = teamMemberId ? parseInt(teamMemberId) : null;
        const parsedClinicId = clinicId ? parseInt(clinicId) : null;
        
        if (!parsedTeamMemberId) continue; // Skip if no team member ID
        
        updatedTeamMemberIds.push(parsedTeamMemberId);
        
        // Upsert team assignment
        await postgresSequelize.query(`
          INSERT INTO corporate_team_assignments 
          (corporate_id, team_member_id, clinic_id, is_primary, created_at, updated_at)
          VALUES (:corporateId, :teamMemberId, :clinicId, :isPrimary, NOW(), NOW())
          ON CONFLICT (corporate_id, team_member_id) 
          DO UPDATE SET clinic_id = :clinicId, is_primary = :isPrimary, updated_at = NOW()
        `, {
          replacements: {
            corporateId,
            teamMemberId: parsedTeamMemberId,
            clinicId: parsedClinicId,
            isPrimary: isPrimary || false
          }
        });
        
        // Also update user association
        await postgresSequelize.query(`
          INSERT INTO user_associations ("userId", "entityType", "entityId", role, "isPrimary", status, "startDate", "createdAt", "updatedAt")
          VALUES (:userId, 'corporate', :corporateId, 'manager', :isPrimary, 'active', NOW(), NOW(), NOW())
          ON CONFLICT DO NOTHING
        `, {
          replacements: { 
            userId: parsedTeamMemberId, 
            corporateId,
            isPrimary: isPrimary || false
          }
        });
      }
      
      // Remove team assignments that were not in the updated list
      const toRemoveTeamMembers = existingTeamMemberIds.filter(id => !updatedTeamMemberIds.includes(id));
      
      for (const removeTeamMemberId of toRemoveTeamMembers) {
        await postgresSequelize.query(`
          DELETE FROM corporate_team_assignments 
          WHERE corporate_id = :corporateId AND team_member_id = :teamMemberId
        `, {
          replacements: { corporateId, teamMemberId: removeTeamMemberId }
        });
      }
    }
    
    // Fetch updated record with plans
    const [updated] = await postgresSequelize.query(`
      SELECT * FROM corporates WHERE id = :corporateId
    `, {
      replacements: { corporateId },
      type: postgresSequelize.QueryTypes.SELECT
    });
    
    const updatedCorporate = Array.isArray(updated) ? updated[0] : updated;
    
    // Fetch updated team assignments
    const [updatedTeamAssignments] = await postgresSequelize.query(`
      SELECT 
        team_member_id,
        clinic_id,
        is_primary
      FROM corporate_team_assignments
      WHERE corporate_id = :corporateId
      ORDER BY is_primary DESC, created_at ASC
    `, {
      replacements: { corporateId },
      type: postgresSequelize.QueryTypes.SELECT
    });
    
    // Fetch updated plans
    const [updatedPlans] = await postgresSequelize.query(`
      SELECT 
        id as sponsorship_id,
        plan_id,
        clinic_id,
        doctor_id,
        start_date,
        end_date,
        is_active
      FROM corporate_plan_sponsorships
      WHERE corporate_id = :corporateId
    `, {
      replacements: { corporateId },
      type: postgresSequelize.QueryTypes.SELECT
    });
    
    console.log(`[Corporates] Updated corporate ID ${corporateId} by ${req.user.email}`);
    console.log(`[Corporates] - Team Assignments: ${(updatedTeamAssignments || []).length} assignment(s) active`);
    console.log(`[Corporates] - Plans: ${(updatedPlans || []).length} plan(s) active`);
    
    return res.json({
      success: true,
      message: 'Corporate updated successfully',
      corporate: {
        id: updatedCorporate.id?.toString(),
        companyName: updatedCorporate.companyName,
        contactPerson: updatedCorporate.contactPerson,
        email: updatedCorporate.email,
        phoneNumber: updatedCorporate.phoneNumber,
        industry: updatedCorporate.industry,
        employeeCount: updatedCorporate.employeeCount || 0,
        packageType: updatedCorporate.packageType || 'Standard',
        status: updatedCorporate.status || 'Active',
        gstNumber: updatedCorporate.gstNumber,
        panNumber: updatedCorporate.panNumber,
        assignedTeamMemberId: updatedCorporate.assignedTo,
        teamAssignments: (updatedTeamAssignments || []).map(ta => ({
          teamMemberId: ta.team_member_id,
          clinicId: ta.clinic_id,
          isPrimary: ta.is_primary
        })),
        plans: (updatedPlans || []).map(p => ({
          sponsorshipId: p.sponsorship_id,
          planId: p.plan_id,
          clinicId: p.clinic_id,
          doctorId: p.doctor_id,
          startDate: p.start_date,
          endDate: p.end_date,
          isActive: p.is_active
        })),
        updatedAt: updatedCorporate.updatedAt
      }
    });
  } catch (error) {
    console.error('Failed to update corporate:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update corporate',
      error: error.message
    });
  }
});

/**
 * Delete/Deactivate Corporate
 * DELETE /api/admin/corporates/:id
 */
router.delete('/corporates/:id', authUser, requireRole(['admin', 'team']), async (req, res) => {
  try {
    const corporateId = req.params.id;
    
    // Verify corporate exists
    const [existing] = await postgresSequelize.query(`
      SELECT id, "companyName", status FROM corporates WHERE id = :corporateId
    `, {
      replacements: { corporateId },
      type: postgresSequelize.QueryTypes.SELECT
    });
    
    const corporate = Array.isArray(existing) ? existing[0] : existing;
    
    if (!corporate) {
      return res.status(404).json({
        success: false,
        message: 'Corporate not found'
      });
    }
    
    // Soft delete: Update status to Inactive
    await postgresSequelize.query(`
      UPDATE corporates 
      SET status = 'Inactive', "updatedAt" = NOW()
      WHERE id = :corporateId
    `, {
      replacements: { corporateId },
      type: postgresSequelize.QueryTypes.UPDATE
    });
    
    console.log(`[Corporates] Deactivated corporate ${corporate.companyName} (ID ${corporateId}) by ${req.user.email}`);
    
    return res.json({
      success: true,
      message: 'Corporate deactivated successfully'
    });
  } catch (error) {
    console.error('Failed to delete corporate:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete corporate',
      error: error.message
    });
  }
});

/**
 * Create Corporate HR/Admin User
 * POST /api/admin/corporate-users
 * Creates a user account with corporate_admin role and links to corporate
 */
router.post('/corporate-users', authUser, requireRole(['admin', 'team']), async (req, res) => {
  try {
    const { corporateId, firstName, lastName, email, phoneNumber, password } = req.body;
    
    if (!corporateId || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'corporateId, email, and password are required'
      });
    }
    
    const normalizedEmail = email.toLowerCase().trim();
    
    // Check if user already exists
    const [existingUser] = await postgresSequelize.query(`
      SELECT id FROM users WHERE email = :email
    `, {
      replacements: { email: normalizedEmail },
      type: postgresSequelize.QueryTypes.SELECT
    });
    
    if (existingUser && existingUser.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists'
      });
    }
    
    // Verify corporate exists
    const [corporate] = await postgresSequelize.query(`
      SELECT id, "companyName" FROM corporates WHERE id = :corporateId
    `, {
      replacements: { corporateId },
      type: postgresSequelize.QueryTypes.SELECT
    });
    
    if (!corporate || corporate.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Corporate not found'
      });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const [userResult] = await postgresSequelize.query(`
      INSERT INTO users (
        email, password, "firstName", "lastName", role, 
        "isCorporate", "isAdmin", "isTeam", 
        "dateOfBirth", "phoneNumber", gender,
        "createdAt", "updatedAt"
      )
      VALUES (
        :email, :password, :firstName, :lastName, 'corporate_admin', 
        true, false, false,
        '1990-01-01', :phoneNumber, 'Male',
        NOW(), NOW()
      )
      RETURNING id, email, "firstName", "lastName", role
    `, {
      replacements: {
        email: normalizedEmail,
        password: hashedPassword,
        firstName: firstName || 'HR',
        lastName: lastName || 'Admin',
        phoneNumber: phoneNumber || ''
      },
      type: postgresSequelize.QueryTypes.INSERT
    });
    
    const newUser = userResult && userResult[0] ? userResult[0] : null;
    
    if (!newUser) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create user'
      });
    }
    
    // Create user association to corporate
    await postgresSequelize.query(`
      INSERT INTO user_associations ("userId", "entityType", "entityId", role, "isPrimary", status, "startDate", "createdAt", "updatedAt")
      VALUES (:userId, 'corporate', :corporateId, 'admin', true, 'active', NOW(), NOW(), NOW())
      ON CONFLICT DO NOTHING
    `, {
      replacements: { userId: newUser.id, corporateId }
    });
    
    // Set password on corporate record too
    await postgresSequelize.query(`
      UPDATE corporates SET password = :password WHERE id = :corporateId
    `, {
      replacements: { password: hashedPassword, corporateId }
    });
    
    console.log(`[Corporate Users] Created HR admin ${normalizedEmail} for corporate ${corporate[0]?.companyName || corporateId}`);
    
    return res.status(201).json({
      success: true,
      message: 'Corporate HR admin created successfully',
      user: {
        id: newUser.id,
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        role: 'corporate_admin',
        corporateId
      }
    });
  } catch (error) {
    console.error('Failed to create corporate user:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create corporate HR admin',
      error: error.message
    });
  }
});

/**
 * Add Corporate Employees
 * POST /api/admin/corporate-employees
 * Creates user accounts for corporate employees with patient role
 */
router.post('/corporate-employees', authUser, requireRole(['admin', 'team', 'corporate_admin']), async (req, res) => {
  try {
    const { corporateId, employees } = req.body;
    
    if (!corporateId || !employees || !Array.isArray(employees) || employees.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'corporateId and employees array are required'
      });
    }
    
    // Verify corporate exists
    const [corporate] = await postgresSequelize.query(`
      SELECT id, "companyName" FROM corporates WHERE id = :corporateId
    `, {
      replacements: { corporateId },
      type: postgresSequelize.QueryTypes.SELECT
    });
    
    if (!corporate) {
      return res.status(404).json({
        success: false,
        message: 'Corporate not found'
      });
    }
    
    const results = { created: [], failed: [] };
    
    for (const emp of employees) {
      try {
        const { firstName, lastName, email, phoneNumber, employeeId, department } = emp;
        
        if (!email || !firstName) {
          results.failed.push({ email, reason: 'firstName and email are required' });
          continue;
        }
        
        const normalizedEmail = email.toLowerCase().trim();
        
        // Check if user exists
        const [existingUser] = await postgresSequelize.query(`
          SELECT id FROM users WHERE email = :email
        `, {
          replacements: { email: normalizedEmail },
          type: postgresSequelize.QueryTypes.SELECT
        });
        
        let userId;
        
        if (existingUser) {
          // User exists, just create association
          userId = existingUser.id;
        } else {
          // Create new user with default password (phone or employee id)
          const defaultPassword = phoneNumber || employeeId || 'Welcome@123';
          const hashedPassword = await bcrypt.hash(defaultPassword, 10);
          
          const [userResult] = await postgresSequelize.query(`
            INSERT INTO users (
              email, password, "firstName", "lastName", role, 
              "isCorporate", "isAdmin", "isTeam", 
              "dateOfBirth", "phoneNumber", gender,
              "createdAt", "updatedAt"
            )
            VALUES (
              :email, :password, :firstName, :lastName, 'patient', 
              true, false, false,
              '1990-01-01', :phoneNumber, 'Male',
              NOW(), NOW()
            )
            RETURNING id
          `, {
            replacements: {
              email: normalizedEmail,
              password: hashedPassword,
              firstName,
              lastName: lastName || '',
              phoneNumber: phoneNumber || ''
            },
            type: postgresSequelize.QueryTypes.INSERT
          });
          
          userId = userResult && userResult[0] ? userResult[0].id : null;
        }
        
        if (!userId) {
          results.failed.push({ email, reason: 'Failed to create/find user' });
          continue;
        }
        
        // Create user association to corporate as employee
        await postgresSequelize.query(`
          INSERT INTO user_associations ("userId", "entityType", "entityId", role, "isPrimary", status, metadata, "startDate", "createdAt", "updatedAt")
          VALUES (:userId, 'corporate', :corporateId, 'employee', false, 'active', :metadata, NOW(), NOW(), NOW())
          ON CONFLICT ("userId", "entityType", "entityId", role) DO UPDATE SET
            metadata = EXCLUDED.metadata,
            "updatedAt" = NOW()
        `, {
          replacements: { 
            userId, 
            corporateId,
            metadata: JSON.stringify({ employeeId, department })
          }
        });
        
        results.created.push({ email: normalizedEmail, userId });
      } catch (empError) {
        results.failed.push({ email: emp.email, reason: empError.message });
      }
    }
    
    console.log(`[Corporate Employees] Added ${results.created.length} employees to corporate ${corporateId}`);
    
    return res.status(201).json({
      success: true,
      message: `Added ${results.created.length} employees, ${results.failed.length} failed`,
      results
    });
  } catch (error) {
    console.error('Failed to add corporate employees:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add corporate employees',
      error: error.message
    });
  }
});

/**
 * Get Corporate Employees
 * GET /api/admin/corporate-employees/:corporateId
 */
router.get('/corporate-employees/:corporateId', authUser, requireRole(['admin', 'team', 'corporate_admin']), async (req, res) => {
  try {
    const { corporateId } = req.params;
    const numericCorporateId = parseInt(corporateId, 10);
    const userId = req.user.id;
    const isAdmin = req.user.isAdmin;

    // Validate corporate ID format
    if (isNaN(numericCorporateId)) {
      console.error(`Invalid corporate ID format: ${corporateId}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid corporate ID format. Expected numeric ID.'
      });
    }

    // Authorization: team members can only access their assigned corporates
    if (!isAdmin) {
      const [hasAccess] = await postgresSequelize.query(`
        SELECT 1 FROM user_associations
        WHERE "userId" = :userId
          AND "entityId" = :corporateId
          AND "entityType" = 'corporate'
          AND status = 'active'
        LIMIT 1
      `, {
        replacements: { userId, corporateId: numericCorporateId },
        type: postgresSequelize.QueryTypes.SELECT
      });

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You do not have permission to access this corporate.'
        });
      }
    }
    
    const employees = await postgresSequelize.query(`
      SELECT u.id, u.email, u."firstName", u."lastName", u."phoneNumber",
             ua.metadata, ua.status, ua."startDate"
      FROM users u
      JOIN user_associations ua ON u.id = ua."userId"
      WHERE ua."entityType" = 'corporate' 
        AND ua."entityId" = :corporateId
        AND ua.role = 'employee'
      ORDER BY u."firstName"
    `, {
      replacements: { corporateId: numericCorporateId },
      type: postgresSequelize.QueryTypes.SELECT
    });
    
    return res.json({
      success: true,
      employees: employees.map(e => ({
        ...e,
        metadata: typeof e.metadata === 'string' ? JSON.parse(e.metadata) : e.metadata
      }))
    });
  } catch (error) {
    console.error('Failed to get corporate employees:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get corporate employees',
      error: error.message
    });
  }
});

/**
 * Update Corporate Employee
 * PUT /api/admin/corporate-employees/:userId
 * Updates user fields and/or association status (active/inactive)
 */
router.put('/corporate-employees/:userId', authUser, requireRole(['admin', 'team', 'corporate_admin']), async (req, res) => {
  try {
    const { userId } = req.params;
    const { corporateId, status, firstName, lastName, email, phoneNumber, department, designation } = req.body;

    if (!corporateId) {
      return res.status(400).json({ success: false, message: 'corporateId is required' });
    }
    const numericUserId = parseInt(userId, 10);
    const numericCorporateId = parseInt(corporateId, 10);

    if (isNaN(numericUserId) || isNaN(numericCorporateId)) {
      return res.status(400).json({ success: false, message: 'Invalid userId or corporateId' });
    }

    // Team access check
    if (!req.user.isAdmin) {
      const [hasAccess] = await postgresSequelize.query(`
        SELECT 1 FROM user_associations
        WHERE "userId" = :requesterId AND "entityId" = :corpId
          AND "entityType" = 'corporate' AND status = 'active'
        LIMIT 1
      `, {
        replacements: { requesterId: req.user.id, corpId: numericCorporateId },
        type: postgresSequelize.QueryTypes.SELECT
      });
      if (!hasAccess) return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    // Update users table (personal info fields)
    const userUpdates = ['"updatedAt" = NOW()'];
    const userReplacements = { userId: numericUserId };
    if (firstName) { userUpdates.push('"firstName" = :firstName'); userReplacements.firstName = firstName; }
    if (lastName !== undefined) { userUpdates.push('"lastName" = :lastName'); userReplacements.lastName = lastName; }
    if (email) { userUpdates.push('"email" = :email'); userReplacements.email = email.toLowerCase().trim(); }
    if (phoneNumber) { userUpdates.push('"phoneNumber" = :phoneNumber'); userReplacements.phoneNumber = phoneNumber; }
    await postgresSequelize.query(
      `UPDATE users SET ${userUpdates.join(', ')} WHERE id = :userId`,
      { replacements: userReplacements, type: postgresSequelize.QueryTypes.UPDATE }
    );

    // Update user_associations table (status + metadata)
    const assocUpdates = ['"updatedAt" = NOW()'];
    const assocReplacements = { userId: numericUserId, corpId: numericCorporateId };
    if (status) { assocUpdates.push('status = :status'); assocReplacements.status = status; }
    if (department !== undefined || designation !== undefined) {
      const metaParts = [];
      if (department !== undefined) { metaParts.push("'department', :department"); assocReplacements.department = department; }
      if (designation !== undefined) { metaParts.push("'designation', :designation"); assocReplacements.designation = designation; }
      assocUpdates.push(`metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(${metaParts.join(', ')})`);
    }
    await postgresSequelize.query(
      `UPDATE user_associations SET ${assocUpdates.join(', ')}
       WHERE "userId" = :userId AND "entityId" = :corpId
         AND "entityType" = 'corporate' AND role = 'employee'`,
      { replacements: assocReplacements, type: postgresSequelize.QueryTypes.UPDATE }
    );

    return res.json({ success: true, message: 'Employee updated successfully' });
  } catch (error) {
    console.error('Failed to update corporate employee:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Get Corporate Health Packages
 * GET /api/admin/corporate-health-packages/:corporateId
 */
router.get('/corporate-health-packages/:corporateId', authUser, requireRole(['admin', 'team', 'corporate_admin']), async (req, res) => {
  try {
    const { corporateId } = req.params;
    const numericCorporateId = parseInt(corporateId, 10);
    const userId = req.user.id;
    const isAdmin = req.user.isAdmin;

    // Validate corporate ID format
    if (isNaN(numericCorporateId)) {
      console.error(`Invalid corporate ID format: ${corporateId}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid corporate ID format. Expected numeric ID.'
      });
    }

    // Authorization: team members can only access their assigned corporates
    if (!isAdmin) {
      const [hasAccess] = await postgresSequelize.query(`
        SELECT 1 FROM user_associations
        WHERE "userId" = :userId
          AND "entityId" = :corporateId
          AND "entityType" = 'corporate'
          AND status = 'active'
        LIMIT 1
      `, {
        replacements: { userId, corporateId: numericCorporateId },
        type: postgresSequelize.QueryTypes.SELECT
      });

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You do not have permission to access this corporate.'
        });
      }
    }

    const packages = await postgresSequelize.query(`
      SELECT "packageId", "packageName", "packageDetails",
             MIN("validFrom") AS "validFrom",
             MAX("validTo") AS "validTo"
      FROM user_health_packages
      WHERE "corporateId" = :corporateId
      GROUP BY "packageId", "packageName", "packageDetails"
      ORDER BY "packageName" ASC
    `, {
      replacements: { corporateId: numericCorporateId },
      type: postgresSequelize.QueryTypes.SELECT
    });

    return res.json({
      success: true,
      packages: packages.map(pkg => ({
        ...pkg,
        packageDetails: typeof pkg.packageDetails === 'string'
          ? JSON.parse(pkg.packageDetails)
          : pkg.packageDetails
      }))
    });
  } catch (error) {
    console.error('Failed to get corporate health packages:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get corporate health packages',
      error: error.message
    });
  }
});

/**
 * Get Corporate Subscription Plans
 * GET /api/admin/corporate-plans/:corporateId
 */
router.get('/corporate-plans/:corporateId', authUser, requireRole(['admin', 'team', 'corporate_admin']), async (req, res) => {
  try {
    const { corporateId } = req.params;
    const numericCorporateId = parseInt(corporateId, 10);
    const userId = req.user.id;
    const isAdmin = req.user.isAdmin;

    // Validate corporate ID format
    if (isNaN(numericCorporateId)) {
      console.error(`Invalid corporate ID format: ${corporateId}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid corporate ID format. Expected numeric ID.'
      });
    }

    // Authorization: team members can only access their assigned corporates
    if (!isAdmin) {
      const [hasAccess] = await postgresSequelize.query(`
        SELECT 1 FROM user_associations
        WHERE "userId" = :userId
          AND "entityId" = :corporateId
          AND "entityType" = 'corporate'
          AND status = 'active'
        LIMIT 1
      `, {
        replacements: { userId, corporateId: numericCorporateId },
        type: postgresSequelize.QueryTypes.SELECT
      });

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You do not have permission to access this corporate.'
        });
      }
    }

    const plans = await postgresSequelize.query(`
      SELECT p.id, p.name, p.slug, p.price, p.annual_price, p.currency, p.billing_cycle, p.is_active,
             p.description, p.features, p.metadata,
             COALESCE(cnt.enrolled, 0) AS enrolled
      FROM subscription_plans p
      LEFT JOIN (
        SELECT us.plan_id, COUNT(*) AS enrolled
        FROM user_subscriptions us
        JOIN user_associations ua ON ua."userId" = us.user_id
        WHERE ua."entityType" = 'corporate'
          AND ua."entityId" = :corporateId
          AND ua.role = 'employee'
          AND us.status = 'ACTIVE'
        GROUP BY us.plan_id
      ) cnt ON cnt.plan_id = p.id
      WHERE p.type = 'CORPORATE'
        AND p.is_active = true
        AND (
          (p.metadata->>'corporateId')::int = :corporateId
          OR p.slug ILIKE 'corporate-%'
        )
      ORDER BY p.id DESC
    `, {
      replacements: { corporateId },
      type: postgresSequelize.QueryTypes.SELECT
    });

    return res.json({
      success: true,
      plans
    });
  } catch (error) {
    console.error('Failed to get corporate plans:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get corporate plans',
      error: error.message
    });
  }
});

/**
 * Create Corporate Subscription Plan
 * POST /api/admin/corporate-plans
 */
router.post('/corporate-plans', authUser, requireRole(['admin', 'team']), async (req, res) => {
  try {
    const {
      // rich fields from team/admin UI
      planName, planType, description,
      corporateId, validFrom, validTo,
      totalEmployees, premiumPerEmployee, totalPremium,
      status = 'Active', currency = 'INR', billingCycle,
      features, benefits, coverage,
      // legacy simple-form fallback
      name, slug, price, annualPrice,
    } = req.body || {};

    const resolvedName = planName || name;
    const resolvedPrice = premiumPerEmployee != null ? Number(premiumPerEmployee) : (price != null ? Number(price) : null);

    if (!resolvedName || resolvedPrice == null) {
      return res.status(400).json({
        success: false,
        message: 'planName (or name) and premiumPerEmployee (or price) are required'
      });
    }

    // billing_cycle enum: MONTHLY | ANNUAL | LIFETIME
    const cycleMap = { ANNUAL: 'ANNUAL', MONTHLY: 'MONTHLY', LIFETIME: 'LIFETIME' };
    const resolvedCycle = cycleMap[billingCycle] || 'ANNUAL';

    // Build a compact unique slug that always fits within varchar(50)
    // Format: corp-{corpId}-{last9-of-timestamp} OR corp-{last13-of-timestamp}
    // e.g. "corp-5-999999999" = 17 chars — well under 50
    const tsFragment = String(Date.now()).slice(-9);
    const planSlug = corporateId
      ? `corp-${corporateId}-${tsFragment}`
      : `corp-${tsFragment}`;

    const resolvedAnnualPrice = annualPrice != null
      ? Number(annualPrice)
      : (resolvedCycle === 'ANNUAL' ? resolvedPrice * 12 : resolvedPrice);

    // Compose metadata — all rich corporate fields
    const metadata = {
      planType: planType || 'Standard',
      corporateId: corporateId || null,
      validFrom: validFrom || null,
      validTo: validTo || null,
      totalEmployees: totalEmployees ? Number(totalEmployees) : null,
      totalPremium: totalPremium ? Number(totalPremium) : (totalEmployees && premiumPerEmployee ? Number(totalEmployees) * Number(premiumPerEmployee) : null),
      status,
      benefits: benefits || [],
      coverage: coverage || {},
    };

    const [inserted] = await postgresSequelize.query(`
      INSERT INTO subscription_plans (
        name, slug, type, price, annual_price, currency, billing_cycle,
        description, features, metadata,
        is_active, is_popular, requires_referral, allows_upgrade,
        created_at, updated_at
      )
      VALUES (
        :name, :slug, 'CORPORATE', :price, :annualPrice, :currency, :billingCycle,
        :description, :features, :metadata,
        :isActive, false, false, true,
        NOW(), NOW()
      )
      RETURNING id, name, slug, price, annual_price, currency, billing_cycle, is_active, metadata, features, description
    `, {
      replacements: {
        name: resolvedName,
        slug: planSlug,
        price: resolvedPrice,
        annualPrice: resolvedAnnualPrice,
        currency,
        billingCycle: resolvedCycle,
        description: description || null,
        features: features ? JSON.stringify(features) : null,
        metadata: JSON.stringify(metadata),
        isActive: status === 'Active',
      },
      type: postgresSequelize.QueryTypes.INSERT
    });

    return res.status(201).json({
      success: true,
      plan: inserted
    });
  } catch (error) {
    console.error('Failed to create corporate plan:', error);
    // Handle unique constraint violations gracefully
    if (error.original?.constraint === 'subscription_plans_name_key') {
      return res.status(409).json({
        success: false,
        message: `A plan named "${req.body?.planName || req.body?.name}" already exists. Please use a different plan name.`
      });
    }
    if (error.original?.constraint === 'subscription_plans_slug_key') {
      return res.status(409).json({
        success: false,
        message: 'Plan slug conflict. Please try again.'
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Failed to create corporate plan',
      error: error.message
    });
  }
});

/**
 * Update Corporate Plan
 * PUT /api/admin/corporate-plans/:planId
 */
router.put('/corporate-plans/:planId', authUser, requireRole(['admin', 'team']), async (req, res) => {
  try {
    const { planId } = req.params;
    const id = parseInt(planId, 10);
    if (!id || isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid plan ID' });
    }

    const {
      planName, planType, description, validFrom, validTo,
      totalEmployees, premiumPerEmployee, status, currency,
      features, benefits, coverage, healthPackageIds
    } = req.body;

    const resolvedName = planName || req.body.name;
    if (!resolvedName) {
      return res.status(400).json({ success: false, message: 'Plan name is required' });
    }

    // Fetch existing plan
    const [existing] = await postgresSequelize.query(
      `SELECT id, metadata FROM subscription_plans WHERE id = :id AND type = 'CORPORATE'`,
      { replacements: { id }, type: postgresSequelize.QueryTypes.SELECT }
    );
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Corporate plan not found' });
    }

    const existingMeta = typeof existing.metadata === 'string'
      ? JSON.parse(existing.metadata) : (existing.metadata || {});

    const metadata = {
      ...existingMeta,
      planType: planType || existingMeta.planType,
      status: status || existingMeta.status,
      validFrom: validFrom || existingMeta.validFrom,
      validTo: validTo || existingMeta.validTo,
      totalEmployees: totalEmployees !== undefined ? parseInt(totalEmployees) : existingMeta.totalEmployees,
      premiumPerEmployee: premiumPerEmployee !== undefined ? parseFloat(premiumPerEmployee) : existingMeta.premiumPerEmployee,
      totalPremium: (totalEmployees && premiumPerEmployee)
        ? parseInt(totalEmployees) * parseFloat(premiumPerEmployee)
        : existingMeta.totalPremium,
      benefits: benefits || existingMeta.benefits,
      coverage: coverage || existingMeta.coverage,
      healthPackageIds: healthPackageIds !== undefined ? healthPackageIds : existingMeta.healthPackageIds,
    };

    const resolvedPrice = premiumPerEmployee !== undefined ? parseFloat(premiumPerEmployee) : null;

    await postgresSequelize.query(`
      UPDATE subscription_plans SET
        name = :name,
        description = :description,
        currency = :currency,
        features = :features,
        metadata = :metadata,
        is_active = :isActive,
        updated_at = NOW()
        ${resolvedPrice !== null ? ', price = :price' : ''}
      WHERE id = :id
    `, {
      replacements: {
        id,
        name: resolvedName,
        description: description || '',
        currency: currency || 'INR',
        features: JSON.stringify(features || {}),
        metadata: JSON.stringify(metadata),
        isActive: (status || existingMeta.status) === 'Active',
        ...(resolvedPrice !== null ? { price: resolvedPrice } : {}),
      },
      type: postgresSequelize.QueryTypes.UPDATE
    });

    return res.json({ success: true, message: 'Plan updated successfully' });
  } catch (error) {
    console.error('Failed to update corporate plan:', error);
    return res.status(500).json({ success: false, message: 'Failed to update plan', error: error.message });
  }
});

/**
 * Delete Corporate Plan
 * DELETE /api/admin/corporate-plans/:planId
 */
router.delete('/corporate-plans/:planId', authUser, requireRole(['admin', 'team']), async (req, res) => {
  try {
    const { planId } = req.params;
    const id = parseInt(planId, 10);
    if (!id || isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid plan ID' });
    }

    // Verify the plan exists and is a CORPORATE plan
    const [plan] = await postgresSequelize.query(
      `SELECT id, name, type FROM subscription_plans WHERE id = :id AND type = 'CORPORATE'`,
      { replacements: { id }, type: postgresSequelize.QueryTypes.SELECT }
    );

    if (!plan) {
      return res.status(404).json({ success: false, message: 'Corporate plan not found' });
    }

    await postgresSequelize.query(
      `DELETE FROM subscription_plans WHERE id = :id`,
      { replacements: { id }, type: postgresSequelize.QueryTypes.DELETE }
    );

    return res.json({ success: true, message: `Plan "${plan.name}" deleted successfully` });
  } catch (error) {
    console.error('Failed to delete corporate plan:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete corporate plan', error: error.message });
  }
});

/**
 * Get Corporate Network Partners
 * GET /api/admin/corporate-network/:corporateId
 */
router.get('/corporate-network/:corporateId', authUser, requireRole(['admin', 'team', 'corporate_admin']), async (req, res) => {
  try {
    const labs = await postgresSequelize.query(`
      SELECT id, name, address, "testCatalog", status, metadata
      FROM labs
      ORDER BY name ASC
    `, {
      type: postgresSequelize.QueryTypes.SELECT
    });

    const hospitals = await postgresSequelize.query(`
      SELECT id, hospital_name, city, specializations, total_beds, status, metadata
      FROM hospitals
      ORDER BY hospital_name ASC
    `, {
      type: postgresSequelize.QueryTypes.SELECT
    });

    const clinics = await postgresSequelize.query(`
      SELECT id, name, type, location, capacity, status
      FROM outreach_clinics
      ORDER BY name ASC
    `, {
      type: postgresSequelize.QueryTypes.SELECT
    });

    const normalizedLabs = labs.map((lab) => {
      const address = typeof lab.address === 'string' ? JSON.parse(lab.address) : lab.address;
      const testCatalog = typeof lab.testCatalog === 'string' ? JSON.parse(lab.testCatalog) : lab.testCatalog;
      const metadata = typeof lab.metadata === 'string' ? JSON.parse(lab.metadata) : lab.metadata;
      const testsAvailable = testCatalog
        ? Object.values(testCatalog).reduce((count, group) => count + (Array.isArray(group) ? group.length : 0), 0)
        : 0;

      return {
        id: lab.id,
        name: lab.name,
        city: address?.city || 'N/A',
        testsAvailable,
        discount: metadata?.discount || metadata?.corporateDiscount || null,
        status: lab.status || 'active'
      };
    });

    const normalizedHospitals = hospitals.map((hospital) => {
      const specializations = typeof hospital.specializations === 'string'
        ? JSON.parse(hospital.specializations)
        : hospital.specializations || [];
      const metadata = typeof hospital.metadata === 'string' ? JSON.parse(hospital.metadata) : hospital.metadata;

      return {
        id: hospital.id,
        name: hospital.hospital_name,
        city: hospital.city || metadata?.city || 'N/A',
        specialities: Array.isArray(specializations) ? specializations.join(', ') : specializations,
        beds: hospital.total_beds || metadata?.beds || 0,
        status: hospital.status || 'active'
      };
    });

    const normalizedClinics = clinics.map((clinic) => {
      const location = typeof clinic.location === 'string' ? JSON.parse(clinic.location) : clinic.location;
      return {
        id: clinic.id,
        name: clinic.name,
        city: location?.city || location?.town || 'N/A',
        type: clinic.type || 'Clinic',
        doctors: clinic.capacity || 0,
        status: clinic.status || 'active'
      };
    });

    return res.json({
      success: true,
      labs: normalizedLabs,
      hospitals: normalizedHospitals,
      clinics: normalizedClinics
    });
  } catch (error) {
    console.error('Failed to get corporate network partners:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get corporate network partners',
      error: error.message
    });
  }
});

/**
 * Assign Network Partners to Corporate Employees
 * POST /api/admin/corporate-network-assignments
 */
router.post('/corporate-network-assignments', authUser, requireRole(['admin', 'team']), async (req, res) => {
  try {
    const { corporateId, partnerId, partnerType, employeeIds } = req.body;

    if (!corporateId || !partnerId || !partnerType) {
      return res.status(400).json({ success: false, message: 'corporateId, partnerId and partnerType are required' });
    }

    const validTypes = ['lab', 'hospital', 'clinic'];
    if (!validTypes.includes(partnerType)) {
      return res.status(400).json({ success: false, message: 'partnerType must be lab, hospital or clinic' });
    }

    // Resolve employee count for the response
    let assignedCount = 0;
    if (employeeIds === 'all' || !employeeIds) {
      const [countRow] = await postgresSequelize.query(
        `SELECT COUNT(DISTINCT "userId") AS cnt FROM user_associations WHERE "entityType" = 'corporate' AND "entityId" = :corporateId AND role = 'employee' AND status = 'active'`,
        { replacements: { corporateId }, type: postgresSequelize.QueryTypes.SELECT }
      );
      assignedCount = parseInt(countRow?.cnt || 0, 10);
    } else if (Array.isArray(employeeIds)) {
      assignedCount = employeeIds.length;
    }

    // Upsert the assignment record — graceful if table doesn't exist
    try {
      // Ensure table exists
      await postgresSequelize.query(`
        CREATE TABLE IF NOT EXISTS corporate_network_assignments (
          id SERIAL PRIMARY KEY,
          corporate_id INTEGER NOT NULL,
          partner_id INTEGER NOT NULL,
          partner_type VARCHAR(20) NOT NULL,
          employee_ids JSONB DEFAULT '"all"',
          assigned_by INTEGER,
          assigned_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE (corporate_id, partner_id, partner_type)
        )
      `);
      await postgresSequelize.query(`
        INSERT INTO corporate_network_assignments (corporate_id, partner_id, partner_type, employee_ids, assigned_by, assigned_at)
        VALUES (:corporateId, :partnerId, :partnerType, :employeeIds, :assignedBy, NOW())
        ON CONFLICT (corporate_id, partner_id, partner_type) DO UPDATE
          SET employee_ids = EXCLUDED.employee_ids,
              assigned_by = EXCLUDED.assigned_by,
              assigned_at = NOW()
      `, {
        replacements: {
          corporateId,
          partnerId,
          partnerType,
          employeeIds: JSON.stringify(employeeIds || 'all'),
          assignedBy: req.user?.id || null,
        },
        type: postgresSequelize.QueryTypes.INSERT
      });
    } catch (dbErr) {
      console.warn('corporate_network_assignments persistence failed (non-fatal):', dbErr.message);
    }

    return res.json({
      success: true,
      message: `${partnerType} assigned to ${assignedCount} employee${assignedCount !== 1 ? 's' : ''} successfully`,
      assignedCount,
      corporateId,
      partnerId,
      partnerType,
    });
  } catch (error) {
    console.error('Failed to assign network partner:', error);
    return res.status(500).json({ success: false, message: 'Failed to assign network partner', error: error.message });
  }
});

/**
 * Assign Health Package to Corporate Employees
 * POST /api/admin/corporate-package-assignments
 * Creates health package assignments for corporate employees
 */
router.post('/corporate-package-assignments', authUser, requireRole(['admin', 'team']), async (req, res) => {
  try {
    const { corporateId, packageId, packageName, packageDetails, employeeIds, validityDays = 365 } = req.body;
    
    if (!corporateId || !packageId) {
      return res.status(400).json({
        success: false,
        message: 'corporateId and packageId are required'
      });
    }
    
    // Verify corporate exists
    const [corporate] = await postgresSequelize.query(`
      SELECT id, "companyName" FROM corporates WHERE id = :corporateId
    `, {
      replacements: { corporateId },
      type: postgresSequelize.QueryTypes.SELECT
    });
    
    if (!corporate) {
      return res.status(404).json({
        success: false,
        message: 'Corporate not found'
      });
    }
    
    // Get employees to assign package to
    let employeesToAssign = [];
    
    if (employeeIds === 'all' || !employeeIds) {
      // Get all employees of this corporate
      employeesToAssign = await postgresSequelize.query(`
        SELECT u.id, u.email, u."firstName", u."lastName"
        FROM users u
        JOIN user_associations ua ON u.id = ua."userId"
        WHERE ua."entityType" = 'corporate' 
          AND ua."entityId" = :corporateId
          AND ua.role = 'employee'
          AND ua.status = 'active'
      `, {
        replacements: { corporateId },
        type: postgresSequelize.QueryTypes.SELECT
      });
    } else if (Array.isArray(employeeIds)) {
      // Get specific employees
      employeesToAssign = await postgresSequelize.query(`
        SELECT u.id, u.email, u."firstName", u."lastName"
        FROM users u
        WHERE u.id IN (:employeeIds)
      `, {
        replacements: { employeeIds },
        type: postgresSequelize.QueryTypes.SELECT
      });
    }
    
    const results = { assigned: [], failed: [] };
    const validFrom = new Date();
    const validTo = new Date();
    validTo.setDate(validTo.getDate() + validityDays);
    
    for (const emp of employeesToAssign) {
      try {
        // Create health package assignment
        await postgresSequelize.query(`
          INSERT INTO user_health_packages (
            "userId", "corporateId", "packageId", "packageName", 
            "packageDetails", "validFrom", "validTo", status,
            "createdAt", "updatedAt"
          )
          VALUES (
            :userId, :corporateId, :packageId, :packageName,
            :packageDetails, :validFrom, :validTo, 'active',
            NOW(), NOW()
          )
          ON CONFLICT ("userId", "packageId") DO UPDATE SET
            "packageName"    = CASE WHEN EXCLUDED."packageDetails" != '{}'::jsonb THEN EXCLUDED."packageName"    ELSE user_health_packages."packageName"    END,
            "packageDetails" = CASE WHEN EXCLUDED."packageDetails" != '{}'::jsonb THEN EXCLUDED."packageDetails" ELSE user_health_packages."packageDetails" END,
            "validTo" = EXCLUDED."validTo",
            status = 'active',
            "updatedAt" = NOW()
        `, {
          replacements: {
            userId: emp.id,
            corporateId,
            packageId,
            packageName: packageName || `Health Package ${packageId}`,
            packageDetails: JSON.stringify(packageDetails || {}),
            validFrom: validFrom.toISOString(),
            validTo: validTo.toISOString()
          },
          type: postgresSequelize.QueryTypes.INSERT
        });
        
        results.assigned.push({
          userId: emp.id,
          email: emp.email,
          name: `${emp.firstName || ''} ${emp.lastName || ''}`.trim()
        });
      } catch (empError) {
        results.failed.push({
          userId: emp.id,
          email: emp.email,
          reason: empError.message
        });
      }
    }
    
    console.log(`[Package Assignment] Corporate ${corporate.companyName}: Assigned ${results.assigned.length} employees, Failed ${results.failed.length}`);
    
    return res.json({
      success: true,
      message: `Health package assigned to ${results.assigned.length} employees`,
      data: {
        corporate: corporate.companyName,
        packageId,
        packageName: packageName || `Health Package ${packageId}`,
        validFrom,
        validTo,
        summary: {
          total: employeesToAssign.length,
          assigned: results.assigned.length,
          failed: results.failed.length
        },
        assigned: results.assigned,
        failed: results.failed.length > 0 ? results.failed : undefined
      }
    });
  } catch (error) {
    console.error('Failed to assign corporate health package:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to assign health package',
      error: error.message
    });
  }
});

/**
 * Get Health Packages for Corporate
 * GET /api/admin/corporate-health-packages/:corporateId
 */
router.get('/corporate-health-packages/:corporateId', authUser, requireRole(['admin', 'team']), async (req, res) => {
  try {
    const { corporateId } = req.params;
    
    // Get all unique packages assigned to this corporate's employees
    const packages = await postgresSequelize.query(`
      SELECT DISTINCT ON (uhp."packageId")
        uhp."packageId", uhp."packageName", uhp."packageDetails",
        uhp."validFrom", uhp."validTo", uhp.status,
        COUNT(uhp."userId") OVER (PARTITION BY uhp."packageId") as "employeeCount"
      FROM user_health_packages uhp
      WHERE uhp."corporateId" = :corporateId
      ORDER BY uhp."packageId",
               (CASE WHEN uhp."packageDetails" != '{}'::jsonb THEN 0 ELSE 1 END) ASC,
               uhp."createdAt" DESC
    `, {
      replacements: { corporateId },
      type: postgresSequelize.QueryTypes.SELECT
    });
    
    return res.json({
      success: true,
      packages: packages.map(p => ({
        ...p,
        packageDetails: typeof p.packageDetails === 'string' ? JSON.parse(p.packageDetails) : p.packageDetails
      }))
    });
  } catch (error) {
    console.error('Failed to get corporate health packages:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get health packages',
      error: error.message
    });
  }
});

// Admin creates internal users
router.post('/users', authUser, requireRole('admin'), createInternalUser);
// --------------------------------------------------------------------------
// Nurse and Assistant user provisioning helpers (intelligent DB userModel)
// --------------------------------------------------------------------------

router.post('/nurse-users', authUser, requireRole('admin'), async (req, res) => {
  try {
    const { nurseId, email, firstName, lastName, phoneNumber, password } = req.body || {};
    const requestedEmail = String(email || '').trim().toLowerCase();

    if (!nurseId || !requestedEmail || !password) {
      return res.status(400).json({
        success: false,
        message: 'nurseId, email and password are required',
      });
    }

    const existing = await userModel.findOne({ where: { email: requestedEmail } });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'A user with this email already exists',
      });
    }

    const nurse = await Nurse.findByPk(nurseId);
    if (!nurse) {
      return res.status(404).json({ success: false, message: 'Nurse record not found' });
    }

    const nurseEmail = String(nurse.email || '').trim().toLowerCase();
    if (requestedEmail !== nurseEmail) {
      return res.status(400).json({
        success: false,
        message: 'Email must match the nurse record email to provision nurse portal login',
      });
    }

    // Ensure this nurse does not already have an associated login by email
    const existingNurseUser = await userModel.findOne({ where: { email: nurse.email } });
    if (existingNurseUser) {
      return res.status(409).json({
        success: false,
        message: 'Login already exists for this nurse',
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Keep the nurse portal login (which authenticates against the nurses table)
    // in sync with the provisioned credentials.
    try {
      await nurse.update({ password: hashedPassword });
    } catch (e) {
      console.warn('Failed to sync nurse password to nurse record:', e?.message || e);
    }

    const nurseUser = await userModel.create({
      firstName: firstName || nurse.firstName,
      lastName: lastName || nurse.lastName,
      email: requestedEmail,
      phoneNumber: phoneNumber || nurse.phoneNumber,
      password: hashedPassword,
      role: 'nurse',
      isAdmin: false,
      isActive: true
    });

    const token = generateAuthTokenForUser(nurseUser);

    return res.status(201).json({
      success: true,
      message: 'Nurse user created',
      token,
      user: {
        id: nurseUser.id,
        email: nurseUser.email,
        firstName: nurseUser.firstName,
        lastName: nurseUser.lastName,
        phoneNumber: nurseUser.phoneNumber,
        role: nurseUser.role,
        isActive: nurseUser.isActive,
        createdAt: nurseUser.createdAt,
        updatedAt: nurseUser.updatedAt
      },
    });
  } catch (error) {
    console.error('Create nurse user error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create nurse user',
    });
  }
});

router.post('/assistant-users', authUser, requireRole('admin'), async (req, res) => {
  try {
    const { assistantId, email, firstName, lastName, phoneNumber, password } = req.body || {};

    if (!assistantId || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'assistantId, email and password are required',
      });
    }

    const existing = await userModel.findOne({ where: { email } });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'A user with this email already exists',
      });
    }

    const assistant = await Assistant.findByPk(assistantId);
    if (!assistant) {
      return res.status(404).json({ success: false, message: 'Assistant record not found' });
    }

    // Ensure this assistant does not already have an associated login by email
    const existingAssistantUser = await userModel.findOne({ where: { email: assistant.email } });
    if (existingAssistantUser) {
      return res.status(409).json({
        success: false,
        message: 'Login already exists for this assistant',
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const assistantUser = await userModel.create({
      firstName: firstName || assistant.firstName,
      lastName: lastName || assistant.lastName,
      email,
      phoneNumber: phoneNumber || assistant.phoneNumber,
      password: hashedPassword,
      role: 'assistant',
      isAdmin: false,
      isActive: true
    });

    const token = generateAuthTokenForUser(assistantUser);

    return res.status(201).json({
      success: true,
      message: 'Assistant user created',
      token,
      user: {
        id: assistantUser.id,
        email: assistantUser.email,
        firstName: assistantUser.firstName,
        lastName: assistantUser.lastName,
        phoneNumber: assistantUser.phoneNumber,
        role: assistantUser.role,
        isActive: assistantUser.isActive,
        createdAt: assistantUser.createdAt,
        updatedAt: assistantUser.updatedAt
      },
    });
  } catch (error) {
    console.error('Create assistant user error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create assistant user',
    });
  }
});

// --------------------------------------------------------------------------
// Filter endpoints for dropdowns and lists
// --------------------------------------------------------------------------

// Get filter options for doctors - cities
router.get('/doctors/filters/cities', async (req, res) => {
  try {
    // Specialties don't require auth - they're just static data
    const doctors = await DoctorPostgres.findAll({
      attributes: [[sequelize.fn('DISTINCT', sequelize.col('city')), 'city']],
      where: { city: { [Op.ne]: null } },
      order: [['city', 'ASC']]
    });
    const cities = doctors.map(d => d.city).filter(Boolean);
    res.json({
      success: true,
      data: cities
    });
  } catch (error) {
    console.error('Error fetching cities:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch cities'
    });
  }
});

// Get filter options for doctors - states
router.get('/doctors/filters/states', async (req, res) => {
  try {
    // Specialties don't require auth - they're just static data
    const doctors = await DoctorPostgres.findAll({
      attributes: [[sequelize.fn('DISTINCT', sequelize.col('state')), 'state']],
      where: { state: { [Op.ne]: null } },
      order: [['state', 'ASC']]
    });
    const states = doctors.map(d => d.state).filter(Boolean);
    res.json({
      success: true,
      data: states
    });
  } catch (error) {
    console.error('Error fetching states:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch states'
    });
  }
});

// Get filter options for doctors - specialties
router.get('/doctors/filters/specialties', async (req, res) => {
  try {
    // Specialties don't require auth - they're just static data for dropdowns
    const specialties = [
      'General Practitioner',
      'Cardiologist',
      'Dermatologist',
      'Pediatrician',
      'Orthopedist',
      'Neurologist',
      'Psychiatrist',
      'Psychologist',
      'Gynecologist',
      'ENT Specialist',
      'Ophthalmologist',
      'Rheumatologist',
      'Pulmonologist',
      'Physiotherapist',
      'Occupational Therapist',
      'Nutritionist',
      'Dietician',
      'Nephrologist',
      'Urologist',
      'Diabetologist',
      'Intensivist',
      'Cardio Thoracic Surgeon',
      'Vascular Surgeon',
      'Neuro Surgeon',
      'Cardio Vascular Surgeon',
      'Gastroenterologist',
      'Gastro Surgeon',
      'General Surgeon',
      'Proctologist',
      'Podiatrician',
      'Dentist',
      'Endocrinologist',
      'Oncologist',
      'Other'
    ];
    res.json({
      success: true,
      data: specialties
    });
  } catch (error) {
    console.error('Error fetching specialties:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch specialties'
    });
  }
});

// --------------------------------------------------------------------------
// Minimal stubs for admin-managed team endpoints used by frontend
// --------------------------------------------------------------------------

// List team users from database
router.get('/team', authUser, requireRole('admin'), async (req, res) => {
  try {
    // Support ?includeInactive=true to show deleted users
    const includeInactive = req.query.includeInactive === 'true';
    
    // Fetch team users from database
    const whereClause = { role: 'team' };
    if (!includeInactive) {
      whereClause.status = 'active'; // Filter for active status
    }
    
    const teamUsers = await userModel.findAll({ 
      where: whereClause,
      order: [['createdAt', 'DESC']]
    });

    const formattedUsers = teamUsers.map(user => {
      let metadata = {};
      try {
        metadata = user.metadata ? JSON.parse(user.metadata) : {};
      } catch (e) {
        metadata = {};
      }

      return {
        id: user.id,
        uniqueId: user.unique_id || null,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber || '',
        employeeId: metadata.employeeId || '',
        department: metadata.department || '',
        designation: metadata.designation || '',
        role: metadata.roleTitle || 'Team Member', // Return role title from metadata for display
        permissions: metadata.permissions || [],
        address: metadata.address || { street: '', city: '', state: '', pincode: '' },
        emergencyContact: metadata.emergencyContact || { name: '', relationship: '', phone: '' },
        joiningDate: metadata.joiningDate || new Date().toISOString().split('T')[0],
        lastLogin: user.lastLogin,
        isActive: user.isActive !== undefined ? user.isActive : true,
        canLogin: metadata.canLogin !== undefined ? metadata.canLogin : true,
        createdAt: user.createdAt
      };
    });

    // Return actual team users (could be empty if all are inactive and filter is applied)
    // Only return demo data if no users exist at all (check without filter)
    let responseData = formattedUsers;
    if (formattedUsers.length === 0 && !includeInactive) {
      // Check if there are ANY team users (active or inactive)
      const totalCount = await userModel.count({ where: { role: 'team' } });
      // Only use demo data if truly no users exist
      responseData = totalCount === 0 ? demoTeamUsers : [];
    }

    return res.json({
      success: true,
      teamUsers: responseData,
      data: responseData,
      total: responseData.length
    });
  } catch (error) {
    console.error('Error fetching team users:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch team users',
      teamUsers: demoTeamUsers,
      data: demoTeamUsers,
      total: demoTeamUsers.length
    });
  }
});

// Create team user
router.post('/team', authUser, requireRole('admin'), async (req, res) => {
  try {
    const userData = req.body?.user || req.body;
    
    // Validate required fields
    if (!userData.firstName || !userData.lastName || !userData.email) {
      return res.status(400).json({
        success: false,
        message: 'First name, last name, and email are required'
      });
    }

    // Check if user already exists
    const existingUser = await userModel.findOne({ where: { email: userData.email } });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Generate secure temporary password
    const temporaryPassword = welcomeEmailService.generateSecurePassword();

    // Generate unique team member ID
    const teamUniqueId = await generateGuaranteedUniqueId('T', 'users');

    // Create team user in database with metadata
    const teamMetadata = {
      employeeId: userData.employeeId,
      department: userData.department,
      designation: userData.designation,
      roleTitle: userData.role || 'Team Member', // Store display role in metadata
      permissions: userData.permissions || [],
      address: userData.address || {},
      emergencyContact: userData.emergencyContact || {},
      joiningDate: userData.joiningDate || new Date().toISOString().split('T')[0],
      canLogin: userData.canLogin !== undefined ? userData.canLogin : true,
      isTeam: true,
      requirePasswordChange: true  // Force password change on first login
    };

    const newUser = await userModel.create({
      firstName: userData.firstName,
      lastName: userData.lastName,
      email: userData.email,
      password: temporaryPassword, // Will be hashed by model
      phoneNumber: userData.phoneNumber || '',
      dateOfBirth: userData.dateOfBirth || '1990-01-01',  // Default date if not provided
      gender: userData.gender || 'Other',
      role: 'team',
      membershipType: 'team',
      unique_id: teamUniqueId,
      metadata: teamMetadata,  // Pass as object, not JSON string
      status: userData.isActive === false ? 'inactive' : 'active'
    });

    // Send welcome email with credentials (async, non-blocking)
    welcomeEmailService.sendTeamWelcomeEmail({
      email: newUser.email,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      role: userData.designation || 'Team Member',
      department: userData.department || 'General'
    }, temporaryPassword).catch(err => {
      console.error('Failed to send welcome email to team user:', err);
    });

    return res.status(201).json({
      success: true,
      message: 'Team user created successfully. Welcome email sent with login credentials.',
      user: {
        id: newUser.id,
        uniqueId: newUser.unique_id,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        email: newUser.email,
        employeeId: newUser.employeeId,
        department: newUser.department,
        designation: newUser.designation,
        role: newUser.role,
        membershipType: newUser.membershipType,
        phoneNumber: newUser.phoneNumber,
        isActive: newUser.isActive,
        canLogin: newUser.canLogin,
        joiningDate: newUser.joiningDate,
        createdAt: newUser.createdAt
      },
      notification: 'Welcome email sent to ' + newUser.email
    });
  } catch (error) {
    console.error('Error creating team user:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to create team user'
    });
  }
});

// Bulk create team users
router.post('/team/bulk', authUser, requireRole('admin'), async (req, res) => {
  try {
    const users = req.body?.users || [];
    
    if (!Array.isArray(users) || users.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Users array is required'
      });
    }

    const created = [];
    const errors = [];

    for (const userData of users) {
      try {
        // Check if user exists
        const exists = await userModel.findOne({ where: { email: userData.email } });
        if (exists) {
          errors.push({ email: userData.email, error: 'User already exists' });
          continue;
        }

        const teamMetadata = {
          employeeId: userData.employeeId,
          department: userData.department,
          designation: userData.designation,
          permissions: userData.permissions || [],
          address: userData.address || {},
          emergencyContact: userData.emergencyContact || {},
          joiningDate: userData.joiningDate || new Date().toISOString().split('T')[0],
          canLogin: userData.canLogin !== undefined ? userData.canLogin : true,
          isTeam: true
        };

        const newUser = await userModel.create({
          firstName: userData.firstName,
          lastName: userData.lastName,
          email: userData.email,
          password: userData.password || 'TempPassword123!',
          phoneNumber: userData.phoneNumber || '',
          role: 'team',
          membershipType: 'team',
          metadata: JSON.stringify(teamMetadata),
          status: userData.isActive === false ? 'inactive' : 'active'
        });

        created.push(newUser.id);
      } catch (err) {
        errors.push({ email: userData.email, error: err.message });
      }
    }

    return res.status(201).json({
      success: true,
      message: `Created ${created.length} team users`,
      count: created.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error bulk creating team users:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to bulk create team users'
    });
  }
});

router.put('/team/:id', authUser, requireRole('admin'), async (req, res) => {
  try {
    const userData = req.body?.user || req.body;
    const teamUser = await userModel.findOne({ where: { id: req.params.id, role: 'team' } });

    if (!teamUser) {
      return res.status(404).json({
        success: false,
        message: 'Team user not found'
      });
    }

    console.log(`📝 Updating team member ID ${req.params.id}:`);
    console.log(`   Current status: ${teamUser.status}`);
    console.log(`   isActive from request: ${userData.isActive}`);

    // Parse existing metadata
    let existingMetadata = {};
    try {
      existingMetadata = teamUser.metadata ? JSON.parse(teamUser.metadata) : {};
    } catch (e) {
      existingMetadata = {};
    }

    // Update metadata (store role title in metadata, not in role field)
    const updatedMetadata = {
      ...existingMetadata,
      employeeId: userData.employeeId || existingMetadata.employeeId,
      department: userData.department || existingMetadata.department,
      designation: userData.designation || existingMetadata.designation,
      roleTitle: userData.role || existingMetadata.roleTitle || 'Team Member', // Store display role in metadata
      permissions: userData.permissions || existingMetadata.permissions,
      address: userData.address || existingMetadata.address,
      emergencyContact: userData.emergencyContact || existingMetadata.emergencyContact,
      joiningDate: userData.joiningDate || existingMetadata.joiningDate,
      canLogin: userData.canLogin !== undefined ? userData.canLogin : existingMetadata.canLogin,
      isTeam: true
    };

    // Update user fields
    const updateData = {
      firstName: userData.firstName || teamUser.firstName,
      lastName: userData.lastName || teamUser.lastName,
      email: userData.email || teamUser.email,
      phoneNumber: userData.phoneNumber || teamUser.phoneNumber,
      role: 'team', // Always keep role as 'team' for team members
      membershipType: 'team',
      metadata: JSON.stringify(updatedMetadata)
    };

    // Only update status if explicitly provided
    if (userData.isActive !== undefined) {
      updateData.status = userData.isActive === false ? 'inactive' : 'active';
    }

    // Only update password if provided
    if (userData.password && userData.password.trim() !== '') {
      updateData.password = userData.password;
    }

    await teamUser.update(updateData);

    console.log(`✅ Team member updated - New status: ${teamUser.status}`);

    return res.status(200).json({
      success: true,
      message: 'Team user updated successfully',
      user: {
        id: teamUser.id,
        firstName: teamUser.firstName,
        lastName: teamUser.lastName,
        email: teamUser.email,
        employeeId: teamUser.employeeId,
        department: teamUser.department,
        designation: teamUser.designation
      }
    });
  } catch (error) {
    console.error('Error updating team user:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to update team user'
    });
  }
});

// Delete team user (soft delete)
router.delete('/team/:id', authUser, requireRole('admin'), async (req, res) => {
  try {
    const teamUser = await userModel.findOne({ where: { id: req.params.id, role: 'team' } });

    if (!teamUser) {
      return res.status(404).json({
        success: false,
        message: 'Team user not found'
      });
    }

    // Soft delete - set status to 'inactive'
    await teamUser.update({ status: 'inactive' });

    return res.status(200).json({
      success: true,
      message: 'Team user deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting team user:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete team user'
    });
  }
});

// Restore team user (undo soft delete)
router.patch('/team/:id/restore', authUser, requireRole('admin'), async (req, res) => {
  try {
    const teamUser = await userModel.findOne({ where: { id: req.params.id, role: 'team' } });

    if (!teamUser) {
      return res.status(404).json({
        success: false,
        message: 'Team user not found'
      });
    }

    // Restore - set status to 'active'  
    await teamUser.update({ status: 'active' });
    await teamUser.reload();

    return res.status(200).json({
      success: true,
      message: 'Team user restored successfully',
      user: {
        id: teamUser.id,
        email: teamUser.email,
        status: teamUser.status,
        isActive: teamUser.isActive
      }
    });
  } catch (error) {
    console.error('Error restoring team user:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to restore team user'
    });
  }
});

// --------------------------------------------------------------------------
// Minimal stubs for updating/deleting admin users and doctors
// --------------------------------------------------------------------------

// Update user (member)
router.put('/users/:id', authUser, requireRole('admin'), async (req, res) => {
  try {
    const userData = req.body?.user || req.body;
    const user = await userModel.findByPk(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const updateData = {
      firstName: userData.firstName || user.firstName,
      lastName: userData.lastName || user.lastName,
      email: userData.email || user.email,
      phone: userData.phone || user.phone,
      dateOfBirth: userData.dateOfBirth || user.dateOfBirth,
      gender: userData.gender || user.gender,
      isActive: userData.isActive !== undefined ? userData.isActive : user.isActive,
      isVerified: userData.isVerified !== undefined ? userData.isVerified : user.isVerified
    };

    // Only update password if provided
    if (userData.password && userData.password.trim() !== '') {
      updateData.password = userData.password;
    }

    await user.update(updateData);

    return res.status(200).json({
      success: true,
      message: 'User updated successfully',
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone
      }
    });
  } catch (error) {
    console.error('Error updating user:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to update user'
    });
  }
});

// Delete user (member) - soft delete
router.delete('/users/:id', authUser, requireRole('admin'), async (req, res) => {
  try {
    const user = await userModel.findByPk(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Soft delete
    await user.update({ isActive: false });

    return res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete user'
    });
  }
});

// Create doctor
router.post('/doctors', authUser, requireRole('admin'), async (req, res) => {
  try {
    const doctorData = req.body?.doctor || req.body;
    
    // Validate required fields
    if (!doctorData.firstName || !doctorData.lastName || !doctorData.email) {
      return res.status(400).json({
        success: false,
        message: 'First name, last name, and email are required'
      });
    }

    // Check if user/doctor already exists
    const existingUser = await userModel.findOne({ where: { email: doctorData.email } });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Generate secure temporary password
    const temporaryPassword = welcomeEmailService.generateSecurePassword();

    // Store doctor-specific data in metadata
    const doctorMetadata = {
      specialization: doctorData.specialization,
      qualification: doctorData.qualification,
      experience: doctorData.experience,
      consultationFee: doctorData.consultationFee,
      languages: doctorData.languages || [],
      availability: doctorData.availability || {},
      isDoctor: true,
      requirePasswordChange: true  // Force password change on first login
    };

    const newDoctor = await userModel.create({
      firstName: doctorData.firstName,
      lastName: doctorData.lastName,
      email: doctorData.email,
      password: temporaryPassword,  // Will be hashed by model beforeCreate hook
      phone: doctorData.phone || '',
      phoneNumber: doctorData.phone || '',
      dateOfBirth: doctorData.dateOfBirth || '1990-01-01',  // Default date if not provided
      gender: doctorData.gender || 'Other',
      role: 'doctor',
      metadata: doctorMetadata,  // Pass as object, not JSON string
      isActive: doctorData.isActive !== undefined ? doctorData.isActive : true
    });

    // Send welcome email with credentials (async, non-blocking)
    welcomeEmailService.sendDoctorWelcomeEmail({
      email: newDoctor.email,
      firstName: newDoctor.firstName,
      lastName: newDoctor.lastName,
      specialization: doctorData.specialization
    }, temporaryPassword).catch(err => {
      console.error('Failed to send welcome email to doctor:', err);
      // Log error but don't block the response
    });

    return res.status(201).json({
      success: true,
      message: 'Doctor created successfully. Welcome email sent with login credentials.',
      doctor: {
        id: newDoctor.id,
        firstName: newDoctor.firstName,
        lastName: newDoctor.lastName,
        email: newDoctor.email,
        phone: newDoctor.phone,
        specialization: doctorData.specialization
      },
      notification: 'Welcome email sent to ' + newDoctor.email
    });
  } catch (error) {
    console.error('Error creating doctor:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to create doctor'
    });
  }
});

// Update doctor
router.put('/doctors/:id', authUser, requireRole('admin'), async (req, res) => {
  try {
    const doctorData = req.body?.doctor || req.body;
    const doctor = await userModel.findOne({ where: { id: req.params.id, role: 'doctor' } });

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    // Parse existing metadata
    let existingMetadata = {};
    try {
      existingMetadata = doctor.metadata ? JSON.parse(doctor.metadata) : {};
    } catch (e) {
      existingMetadata = {};
    }

    // Update metadata
    const updatedMetadata = {
      ...existingMetadata,
      specialization: doctorData.specialization || existingMetadata.specialization,
      qualification: doctorData.qualification || existingMetadata.qualification,
      experience: doctorData.experience || existingMetadata.experience,
      consultationFee: doctorData.consultationFee || existingMetadata.consultationFee,
      languages: doctorData.languages || existingMetadata.languages,
      availability: doctorData.availability || existingMetadata.availability,
      isDoctor: true
    };

    const updateData = {
      firstName: doctorData.firstName || doctor.firstName,
      lastName: doctorData.lastName || doctor.lastName,
      email: doctorData.email || doctor.email,
      phone: doctorData.phone || doctor.phone,
      metadata: JSON.stringify(updatedMetadata),
      isActive: doctorData.isActive !== undefined ? doctorData.isActive : doctor.isActive
    };

    if (doctorData.password && doctorData.password.trim() !== '') {
      updateData.password = doctorData.password;
    }

    await doctor.update(updateData);

    return res.status(200).json({
      success: true,
      message: 'Doctor updated successfully',
      doctor: {
        id: doctor.id,
        firstName: doctor.firstName,
        lastName: doctor.lastName,
        email: doctor.email
      }
    });
  } catch (error) {
    console.error('Error updating doctor:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to update doctor'
    });
  }
});

// Delete doctor - soft delete
router.delete('/doctors/:id', authUser, requireRole('admin'), async (req, res) => {
  try {
    const doctor = await userModel.findOne({ where: { id: req.params.id, role: 'doctor' } });

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    await doctor.update({ isActive: false });

    return res.status(200).json({
      success: true,
      message: 'Doctor deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting doctor:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete doctor'
    });
  }
});

// --------------------------------------------------------------------------
// Example corporate-only API routes (requireRole('corporate'))
// These are separate from admin routes and are meant for corporate users
// logging in with role: 'corporate'. They return stub data that the
// corporate dashboard can consume.
// --------------------------------------------------------------------------

router.get('/corporate/summary', authUser, requireRole('corporate'), async (req, res) => {
  try {
    const corporateId = req.user?.corporateId;

    if (!corporateId) {
      return res.status(400).json({
        success: false,
        message: 'Corporate ID missing on user profile'
      });
    }

    const corporate = await Corporate.findByPk(corporateId);

    if (!corporate) {
      return res.status(404).json({
        success: false,
        message: 'Corporate record not found'
      });
    }

    // Derive some basic KPIs from the corporate record itself for now.
    const employeeCount = corporate.employeeCount || 0;

    // Placeholder metrics that could later be replaced with real aggregates
    const KPIs = {
      activeEmployees: employeeCount,
      totalConsultationsThisMonth: 0,
      averageSatisfactionScore: 0,
      emergencyCasesHandled: 0
    };

    return res.json({
      success: true,
      corporateId,
      corporate: {
        id: corporate.id,
        companyName: corporate.companyName,
        contactPerson: corporate.contactPerson,
        email: corporate.email,
        phoneNumber: corporate.phoneNumber,
        employeeCount: corporate.employeeCount,
        industry: corporate.industry,
        status: corporate.status,
        packageType: corporate.packageType,
        billingCycle: corporate.billingCycle,
        isActive: corporate.isActive
      },
      KPIs,
      recentActivities: []
    });
  } catch (error) {
    console.error('Corporate summary error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load corporate summary'
    });
  }
});

// WhatsApp integration endpoints
router.get('/whatsapp/stats', authUser, requireRole('admin'), getWhatsAppStats);
router.get('/whatsapp/templates', authUser, requireRole('admin'), getWhatsAppTemplates);
router.post('/whatsapp/templates', authUser, requireRole('admin'), createWhatsAppTemplate);
router.put('/whatsapp/templates/:id', authUser, requireRole('admin'), updateWhatsAppTemplate);
router.delete('/whatsapp/templates/:id', authUser, requireRole('admin'), deleteWhatsAppTemplate);
router.get('/whatsapp/campaigns', authUser, requireRole('admin'), getWhatsAppCampaigns);
router.post('/whatsapp/campaigns', authUser, requireRole('admin'), createWhatsAppCampaign);
router.put('/whatsapp/campaigns/:id/status', authUser, requireRole('admin'), updateWhatsAppCampaignStatus);
router.get('/whatsapp/messages', authUser, requireRole('admin'), getWhatsAppMessages);
router.post('/whatsapp/send', authUser, requireRole('admin'), sendWhatsAppMessage);
router.post('/whatsapp/webhook', verifyWhatsAppWebhook);
router.get('/whatsapp/webhook', getWhatsAppWebhook);


// Analytics endpoints
router.get('/analytics/payments', authUser, requireRole('admin'), (req, res) => {
  res.json({
    success: true,
    data: {
      totalRevenue: 1250000,
      pendingPayments: 85000,
      collectedThisMonth: 450000,
      paymentsByMethod: {
        card: 650000,
        upi: 400000,
        cash: 150000,
        insurance: 50000
      },
      recentPayments: []
    }
  });
});

router.get('/analytics/accounts-receivable', authUser, requireRole('admin'), (req, res) => {
  res.json({
    success: true,
    data: {
      totalReceivable: 85000,
      overdue: 25000,
      current: 60000,
      aging: {
        '0-30': 40000,
        '31-60': 20000,
        '61-90': 15000,
        '90+': 10000
      }
    }
  });
});


// ============================================================================
// MEMBERSHIP VALIDATION MANAGEMENT
// ============================================================================

/**
 * POST /api/admin/membership/sync-all
 * Manually trigger membership status sync for all users
 */
router.post('/membership/sync-all', authUser, requireRole('admin'), async (req, res) => {
  try {
    const { syncAllUsersStatus } = await import('../middleware/membership.middleware.js');
    
    console.log('🔄 Admin triggered full membership sync...');
    const results = await syncAllUsersStatus();
    
    return res.json({
      success: true,
      message: 'Membership status sync completed',
      data: results
    });
  } catch (error) {
    console.error('Membership sync error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to sync membership status',
      error: error.message
    });
  }
});

/**
 * POST /api/admin/membership/sync-user/:userId
 * Manually trigger membership status sync for specific user
 */
router.post('/membership/sync-user/:userId', authUser, requireRole('admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { syncUserStatusWithMembership } = await import('../middleware/membership.middleware.js');
    
    const result = await syncUserStatusWithMembership(parseInt(userId));
    
    if (result.success) {
      return res.json({
        success: true,
        message: `User ${userId} membership status synced`,
        data: {
          userId: userId,
          status: result.status,
          hasActivePlan: result.hasActivePlan
        }
      });
    } else {
      return res.status(500).json({
        success: false,
        message: 'Failed to sync user membership',
        error: result.error
      });
    }
  } catch (error) {
    console.error('User membership sync error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to sync user membership',
      error: error.message
    });
  }
});

/**
 * GET /api/admin/membership/expiring
 * Get list of users with expiring memberships
 */
router.get('/membership/expiring', authUser, requireRole('admin'), async (req, res) => {
  try {
    const { UserPlan } = await import('../models/membershipPlan.model.intelligent.js');
    const { Op } = await import('sequelize');
    
    const days = parseInt(req.query.days) || 7;
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + days);
    
    const expiringPlans = await UserPlan.findAll({
      where: {
        status: 'active',
        endDate: {
          [Op.gte]: today.toISOString().split('T')[0],
          [Op.lte]: futureDate.toISOString().split('T')[0]
        }
      },
      order: [['endDate', 'ASC']]
    });

    // Get user details for each plan
    const userModel = await import('../models/user.model.intelligent.js');
    const usersWithExpiringPlans = await Promise.all(
      expiringPlans.map(async (plan) => {
        const user = await userModel.default.findByPk(plan.userId, {
          attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber', 'status']
        });
        
        const daysRemaining = Math.ceil(
          (new Date(plan.endDate) - today) / (1000 * 60 * 60 * 24)
        );
        
        return {
          userId: plan.userId,
          user: user ? {
            name: `${user.firstName} ${user.lastName}`,
            email: user.email,
            phone: user.phoneNumber,
            status: user.status
          } : null,
          membershipPlanId: plan.membershipPlanId,
          startDate: plan.startDate,
          endDate: plan.endDate,
          daysRemaining: daysRemaining,
          autoRenew: plan.autoRenew,
          planStatus: plan.status
        };
      })
    );

    return res.json({
      success: true,
      data: {
        total: usersWithExpiringPlans.length,
        daysFilter: days,
        expiringMemberships: usersWithExpiringPlans
      }
    });
  } catch (error) {
    console.error('Get expiring memberships error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch expiring memberships',
      error: error.message
    });
  }
});

/**
 * GET /api/admin/membership/inactive-users
 * Get list of users with inactive status due to no membership
 */
router.get('/membership/inactive-users', authUser, requireRole('admin'), async (req, res) => {
  try {
    const userModel = await import('../models/user.model.intelligent.js');
    const { UserPlan } = await import('../models/membershipPlan.model.intelligent.js');
    
    // Get all inactive users
    const inactiveUsers = await userModel.default.findAll({
      where: {
        status: 'inactive',
        isAdmin: false
      },
      attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber', 'createdAt', 'status']
    });

    // Check if they have any membership history
    const usersWithMembershipInfo = await Promise.all(
      inactiveUsers.map(async (user) => {
        const latestPlan = await UserPlan.findOne({
          where: { userId: user.id },
          order: [['endDate', 'DESC']]
        });
        
        return {
          userId: user.id,
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          phone: user.phoneNumber,
          status: user.status,
          joinedDate: user.createdAt,
          lastMembership: latestPlan ? {
            planId: latestPlan.membershipPlanId,
            endDate: latestPlan.endDate,
            status: latestPlan.status,
            daysExpired: Math.floor(
              (new Date() - new Date(latestPlan.endDate)) / (1000 * 60 * 60 * 24)
            )
          } : null,
          hasNeverHadMembership: !latestPlan
        };
      })
    );

    return res.json({
      success: true,
      data: {
        total: usersWithMembershipInfo.length,
        users: usersWithMembershipInfo
      }
    });
  } catch (error) {
    console.error('Get inactive users error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch inactive users',
      error: error.message
    });
  }
});

// --------------------------------------------------------------------------
// Insurance companies / Insurers (Admin managed)
// --------------------------------------------------------------------------

router.get('/insurers', authUser, requireRole('admin'), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const insurers = await InsuranceCompany.findAll({
      order: [['createdAt', 'DESC']],
      limit
    });

    return res.json({ success: true, insurers });
  } catch (error) {
    console.error('Failed to fetch insurers:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load insurers',
      error: error.message
    });
  }
});

// System settings endpoints
router.get('/settings/system', authUser, requireRole('admin'), async (req, res) => {
  try {
    res.json({
      success: true,
      settings: {
        siteName: process.env.SITE_NAME || 'Mediqzy',
        siteUrl: process.env.SITE_URL || 'https://mediqzy.com',
        emailFrom: process.env.SENDGRID_FROM_EMAIL || 'noreply@mediqzy.com',
        timezone: process.env.TZ || 'Asia/Kolkata',
        maintenanceMode: process.env.MAINTENANCE_MODE === 'true',
        features: {
          whatsapp: !!process.env.TWILIO_WHATSAPP_NUMBER,
          sms: !!process.env.TWILIO_ACCOUNT_SID,
          email: !!process.env.SENDGRID_API_KEY,
          videoCall: !!process.env.AGORA_APP_ID,
          aiChat: !!process.env.SIB_API_URL
        }
      }
    });
  } catch (error) {
    console.error('Error fetching system settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch system settings',
      error: error.message
    });
  }
});

router.post('/settings/system', authUser, requireRole('admin'), async (req, res) => {
  try {
    const settings = req.body;
    console.log('Updating system settings:', settings);
    res.json({
      success: true,
      message: 'System settings updated successfully',
      settings
    });
  } catch (error) {
    console.error('Error updating system settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update system settings',
      error: error.message
    });
  }
});

router.post('/settings/general', authUser, requireRole('admin'), async (req, res) => {
  try {
    const settings = req.body;
    console.log('Updating general settings:', settings);
    res.json({
      success: true,
      message: 'General settings updated successfully',
      settings
    });
  } catch (error) {
    console.error('Error updating general settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update general settings',
      error: error.message
    });
  }
});

router.post('/settings/api', authUser, requireRole('admin'), async (req, res) => {
  try {
    const settings = req.body;
    console.log('Updating API settings:', settings);
    res.json({
      success: true,
      message: 'API settings updated successfully',
      settings
    });
  } catch (error) {
    console.error('Error updating API settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update API settings',
      error: error.message
    });
  }
});

router.post('/settings/security', authUser, requireRole('admin'), async (req, res) => {
  try {
    const settings = req.body;
    console.log('Updating security settings:', settings);
    res.json({
      success: true,
      message: 'Security settings updated successfully',
      settings
    });
  } catch (error) {
    console.error('Error updating security settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update security settings',
      error: error.message
    });
  }
});

router.post('/settings/notifications', authUser, requireRole('admin'), async (req, res) => {
  try {
    const settings = req.body;
    console.log('Updating notification settings:', settings);
    res.json({
      success: true,
      message: 'Notification settings updated successfully',
      settings
    });
  } catch (error) {
    console.error('Error updating notification settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update notification settings',
      error: error.message
    });
  }
});

router.post('/settings/api/regenerate', authUser, requireRole('admin'), async (req, res) => {
  try {
    const newApiKey = `medi_live_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
    console.log('Generated new API key');
    res.json({
      success: true,
      message: 'API key regenerated successfully',
      apiKey: newApiKey
    });
  } catch (error) {
    console.error('Error regenerating API key:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to regenerate API key',
      error: error.message
    });
  }
});

router.post('/insurers', authUser, requireRole('admin'), async (req, res) => {
  try {
    const payload = req.body?.insurer || req.body || {};
    const {
      insurerName,
      registrationNumber,
      email,
      phoneNumber,
      contactPerson,
      city,
      state,
      insuranceTypes = [],
      claimSettlementRatio,
      networkHospitals,
      status = 'Active',
      joinedDate,
      website,
      companyCode
    } = payload;

    if (!insurerName || !email) {
      return res.status(400).json({
        success: false,
        message: 'Insurer name and email are required'
      });
    }

    // Prevent duplicates
    const existing = await InsuranceCompany.findOne({
      where: { email: email.toLowerCase() }
    });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'An insurer with this email already exists'
      });
    }

    const normalizedPolicies = Array.isArray(insuranceTypes)
      ? insuranceTypes.map((t) => String(t).toLowerCase().replace(/\s+/g, '_')).filter(Boolean)
      : String(insuranceTypes || '')
          .split(',')
          .map((t) => t.trim().toLowerCase().replace(/\s+/g, '_'))
          .filter(Boolean);

    const passwordToUse = payload.password || 'Insurer123';

    const insurer = await InsuranceCompany.create({
      companyName: insurerName,
      companyCode: companyCode || registrationNumber || insurerName?.slice(0, 12)?.toUpperCase(),
      email: email.toLowerCase(),
      password: passwordToUse,
      phone: phoneNumber,
      website: website || '',
      address: { city: city || '', state: state || '' },
      irdaiRegistrationNumber: registrationNumber,
      contactPerson: { name: contactPerson || '', phone: phoneNumber || '', city: city || '', state: state || '' },
      supportedPolicyTypes: normalizedPolicies.length ? normalizedPolicies : undefined,
      networkHospitals: typeof networkHospitals === 'number' ? { count: networkHospitals } : networkHospitals || [],
      isActive: status !== 'Inactive',
      isVerified: status === 'Active',
      description: payload.description || '',
      metadata: {
        claimSettlementRatio: claimSettlementRatio || null,
        joinedDate: joinedDate || null
      }
    });

    return res.status(201).json({ success: true, insurer });
  } catch (error) {
    console.error('Failed to create insurer:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create insurer',
      error: error.message
    });
  }
});

export default router;
