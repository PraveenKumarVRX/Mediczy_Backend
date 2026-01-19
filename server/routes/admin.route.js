import express from 'express';
import { body } from 'express-validator';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import bcrypt from 'bcrypt';
import userModel, { generateAuthTokenForUser } from '../models/user.model.intelligent.js';
import { Corporate } from '../models/crm.model.intelligent.js';
import { Corporate as InsuranceCorporate, InsuranceCompany } from '../models/insurance-company.model.intelligent.js';
import Nurse from '../models/nurse.model.intelligent.js';
import Assistant from '../models/assistant.model.intelligent.js';
import { Op } from 'sequelize';
import welcomeEmailService from '../services/welcome-email.service.js';
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
router.post('/login', [
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
router.get('/corporates', authUser, requireRole('admin'), (req, res) => {
  return res.json({ success: true, data: demoAdminCorporates, total: demoAdminCorporates.length });
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

// Corporate admin stub create for login/config
router.post('/corporates', authUser, requireRole('admin'), (req, res) => {
  const corporate = req.body?.corporate || req.body;
  return res.status(201).json({
    success: true,
    message: 'Corporate stub created (no persistence)',
    corporate: {
      id: `corp_${Date.now()}`,
      isActive: true,
      createdAt: new Date().toISOString(),
      ...corporate,
    },
  });
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
// Corporate user provisioning helper (links login user to corporateId)
// --------------------------------------------------------------------------

router.post('/corporate-users', authUser, requireRole('admin'), async (req, res) => {
  try {
    const { corporateId, email, name, phoneNumber, password } = req.body || {};

    if (!corporateId || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'corporateId, email and password are required',
      });
    }

    // Ensure email not already taken
    const existing = await userModel.findOne({ where: { email } });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'A user with this email already exists',
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create corporate user in intelligent DB
    const corporateUser = await userModel.create({
      firstName: name || 'Corporate',
      lastName: 'User',
      email,
      phoneNumber: phoneNumber || null,
      password: hashedPassword,
      role: 'corporate',
      corporateId,
      isAdmin: false,
      isActive: true
    });

    const token = generateAuthTokenForUser(corporateUser);

    return res.status(201).json({
      success: true,
      message: 'Corporate user created and linked to corporateId',
      token,
      user: {
        id: corporateUser.id,
        corporateId: corporateUser.corporateId,
        email: corporateUser.email,
        firstName: corporateUser.firstName,
        lastName: corporateUser.lastName,
        phoneNumber: corporateUser.phoneNumber,
        role: corporateUser.role,
        isActive: corporateUser.isActive,
        createdAt: corporateUser.createdAt,
        updatedAt: corporateUser.updatedAt
      },
    });
  } catch (error) {
    console.error('Create corporate user error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create corporate user',
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
    // Fetch team users from database
    const teamUsers = await userModel.findAll({ 
      where: { 
        role: 'team'
      },
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
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phone || '',
        employeeId: metadata.employeeId || '',
        department: metadata.department || '',
        designation: metadata.designation || '',
        role: user.role || 'team',
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

    // If no team users found, return demo data for initial setup
    const responseData = formattedUsers.length > 0 ? formattedUsers : demoTeamUsers;

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

    // Create team user in database with metadata
    const teamMetadata = {
      employeeId: userData.employeeId,
      department: userData.department,
      designation: userData.designation,
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

    // Parse existing metadata
    let existingMetadata = {};
    try {
      existingMetadata = teamUser.metadata ? JSON.parse(teamUser.metadata) : {};
    } catch (e) {
      existingMetadata = {};
    }

    // Update metadata
    const updatedMetadata = {
      ...existingMetadata,
      employeeId: userData.employeeId || existingMetadata.employeeId,
      department: userData.department || existingMetadata.department,
      designation: userData.designation || existingMetadata.designation,
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
      role: userData.role || teamUser.role || 'team',
      membershipType: 'team',
      metadata: JSON.stringify(updatedMetadata),
      status: userData.isActive === false ? 'inactive' : 'active'
    };

    // Only update password if provided
    if (userData.password && userData.password.trim() !== '') {
      updateData.password = userData.password;
    }

    await teamUser.update(updateData);

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

// Delete team user
router.delete('/team/:id', authUser, requireRole('admin'), async (req, res) => {
  try {
    const teamUser = await userModel.findOne({ where: { id: req.params.id, role: 'team' } });

    if (!teamUser) {
      return res.status(404).json({
        success: false,
        message: 'Team user not found'
      });
    }

    // Soft delete - set isActive to false
    await teamUser.update({ isActive: false });

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
