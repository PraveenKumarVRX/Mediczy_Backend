import express from 'express';
import { body } from 'express-validator';
import userModel from '../models/user.model.intelligent.js';
import jwt from 'jsonwebtoken';
import { authTeam, requireModule, attachAccessLevel } from '../middleware/team.middleware.js';
import { JWT_CONFIG } from '../config/auth.config.js';
import { authLimiter } from '../middleware/rateLimiter.middleware.js';
import { auditLoginAttempt } from '../middleware/audit.middleware.js';

const router = express.Router();

// Team login endpoint
router.post('/login', authLimiter, [
  body('email').isEmail().withMessage('Must be a valid email'),
  body('password').notEmpty().withMessage('Password is required'),
], async (req, res) => {
  console.log('🔵 [Team Login] Request received');
  try {
    const { email, password } = req.body;
    console.log('🔵 [Team Login] Email:', email);

    // Hardcoded credentials removed for security - all team members must be in database

    // Check if user exists in database and has team role
    console.log('🔵 [Team Login] Querying database...');
    const normalizedEmail = String(email).toLowerCase();
    let user;
    try {
      user = await userModel.findOne({
        where: {
          email: normalizedEmail
        }
      });
      console.log('🔵 [Team Login] Query completed');
    } catch (queryError) {
      console.error('❌ Team DB query error:', queryError.message);
      throw queryError;
    }
    console.log('🔵 [Team Login] User found:', !!user);

    if (!user) {
      await auditLoginAttempt(req, null, normalizedEmail, false, 'Team user not found');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // ROLE GUARD: allow explicit team/admin roles or membershipType flag
    let metadata = {};
    try {
      metadata = user.metadata ? JSON.parse(user.metadata) : {};
    } catch (err) {
      metadata = {};
    }

    const hasTeamAccess = Boolean(
      user.isAdmin ||
      user.isTeam ||
      user.role === 'team' ||
      user.membershipType === 'team' ||
      metadata.isTeam === true
    );

    if (!hasTeamAccess) {
      console.log('🔴 [Team Login] Access denied: User lacks team permissions');
      await auditLoginAttempt(req, user.id, normalizedEmail, false, 'Team access denied');
      return res.status(403).json({
        success: false,
        message: 'Access denied. Team member privileges required.',
        hint: 'Please contact an administrator to request team access.'
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      await auditLoginAttempt(req, user.id, normalizedEmail, false, 'Invalid password');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if user has team access (you can add team role logic here)
    const teamUser = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role || 'Team Member',
      designation: user.designation || 'Healthcare Staff',
      department: user.department || 'Healthcare Operations',
      permissions: [
        'User Management',
        'Doctor Management',
        'Appointment Management',
        'Patient Reports',
        'Chat Dashboard Access',
        'Hospital Management',
        'Pharmacy Management',
        'Health Plans Access'
      ]
    };

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        userId: user.id,
        email: user.email,
        role: user.role || 'team',  // Use actual user role (admin, team, etc.)
        userType: 'team',
        isTeam: true,
        isAdmin: user.isAdmin || false
      },
      JWT_CONFIG.SECRET,
      { expiresIn: '8h' }
    );

    // Update last login
    await user.update({ lastLogin: new Date() });

    await auditLoginAttempt(req, user.id, normalizedEmail, true);

    res.status(200).json({
      success: true,
      message: 'Team login successful',
      token,
      teamUser
    });

  } catch (error) {
    console.error('❌ TEAM LOGIN ERROR:', error);
    console.error('❌ Error message:', error.message);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Update team profile endpoint
router.put('/profile', authTeam, async (req, res) => {
  try {
    const { firstName, lastName, department, designation } = req.body;
    const userId = req.teamUser.id;

    const user = await userModel.findOne({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update user fields
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (department) user.department = department;
    if (designation) user.designation = designation;

    await user.save();

    const teamUser = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      department: user.department || 'Healthcare Operations',
      designation: user.designation || 'Healthcare Staff',
      role: user.role || 'Team Member',
      permissions: [
        'User Management', 'Doctor Management', 'Appointment Management',
        'Patient Reports', 'Chat Dashboard Access', 'Hospital Management',
        'Pharmacy Management', 'Health Plans Access'
      ],
      isActive: user.isActive
    };

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      teamUser
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating profile'
    });
  }
});

// Team directory endpoint
router.get('/directory', authTeam, async (req, res) => {
  try {
    // Fetch all active team members
    const users = await userModel.findAll({
      where: { status: 'active' }
    });

    const members = users
      .map(user => {
        let metadata = {};
        try {
          metadata = user.metadata ? JSON.parse(user.metadata) : {};
        } catch (err) {
          metadata = {};
        }

        const role = user.role || metadata.role || 'team';
        const isTeamMember = role === 'team' || user.membershipType === 'team' || metadata.isTeam === true;

        return isTeamMember ? {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phoneNumber || metadata.phoneNumber || metadata.phone || 'N/A',
          department: user.department || metadata.department || 'Healthcare',
          designation: user.designation || metadata.designation || 'Staff',
          role: role === 'team' ? 'Team Member' : (role || 'Staff'),
          isActive: user.isActive,
          avatar: null
        } : null;
      })
      .filter(Boolean);

    res.status(200).json({
      success: true,
      members
    });
  } catch (error) {
    console.error('Team directory error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching team directory'
    });
  }
});

// Team profile endpoint
router.get('/profile', authTeam, attachAccessLevel, async (req, res) => {
  try {
    const teamUser = req.teamUser;

    // In production, fetch full team user details from database
    res.status(200).json({
      success: true,
      teamUser: {
        id: teamUser.id,
        email: teamUser.email,
        role: teamUser.role || 'Team Member',
        isActive: true,
        accessLevel: req.accessLevel || 'view',
        canView: req.canView !== false,
        canEdit: req.canEdit || false,
        canDelete: req.canDelete || false,
        permissions: [
          'User Management',
          'Doctor Management',
          'Appointment Management',
          'Patient Reports',
          'Chat Dashboard Access',
          'Hospital Management',
          'Pharmacy Management',
          'Health Plans Access'
        ],
        modules: [
          'users', 'doctors', 'appointments', 'chat',
          'hospitals', 'pharmacies', 'plans', 'reports'
        ],
        editableModules: req.editableModules || [],
        deletableModules: req.deletableModules || []
      }
    });

  } catch (error) {
    console.error('Team profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching profile'
    });
  }
});

// Get team member's accessible modules with access levels
router.get('/modules', authTeam, attachAccessLevel, async (req, res) => {
  try {
    const editableModules = req.editableModules || [];
    const deletableModules = req.deletableModules || [];
    const isAdmin = req.accessLevel === 'full';

    const modules = [
      {
        id: 'users',
        name: 'User Management',
        icon: 'Users',
        enabled: true,
        canView: true,
        canEdit: isAdmin || editableModules.includes('users'),
        canDelete: isAdmin || deletableModules.includes('users')
      },
      {
        id: 'doctors',
        name: 'Doctor Management',
        icon: 'Stethoscope',
        enabled: true,
        canView: true,
        canEdit: isAdmin || editableModules.includes('doctors'),
        canDelete: isAdmin || deletableModules.includes('doctors')
      },
      {
        id: 'appointments',
        name: 'Appointments',
        icon: 'Calendar',
        enabled: true,
        canView: true,
        canEdit: isAdmin || editableModules.includes('appointments'),
        canDelete: isAdmin || deletableModules.includes('appointments')
      },
      {
        id: 'chat',
        name: 'Chat Dashboard',
        icon: 'MessageSquare',
        enabled: true,
        canView: true,
        canEdit: isAdmin || editableModules.includes('chat'),
        canDelete: isAdmin || deletableModules.includes('chat')
      },
      {
        id: 'hospitals',
        name: 'Hospitals',
        icon: 'Building2',
        enabled: true,
        canView: true,
        canEdit: isAdmin || editableModules.includes('hospitals'),
        canDelete: isAdmin || deletableModules.includes('hospitals')
      },
      {
        id: 'pharmacies',
        name: 'Pharmacies',
        icon: 'Pill',
        enabled: true,
        canView: true,
        canEdit: isAdmin || editableModules.includes('pharmacies'),
        canDelete: isAdmin || deletableModules.includes('pharmacies')
      },
      {
        id: 'plans',
        name: 'Health Plans',
        icon: 'Heart',
        enabled: true,
        canView: true,
        canEdit: isAdmin || editableModules.includes('plans'),
        canDelete: isAdmin || deletableModules.includes('plans')
      },
      {
        id: 'reports',
        name: 'Reports & Analytics',
        icon: 'BarChart3',
        enabled: true,
        canView: true,
        canEdit: isAdmin || editableModules.includes('reports'),
        canDelete: false // Reports typically don't allow delete
      },
      {
        id: 'team_directory',
        name: 'Team Directory',
        icon: 'Users',
        enabled: true,
        canView: true,
        canEdit: isAdmin || editableModules.includes('team_directory'),
        canDelete: isAdmin || deletableModules.includes('team_directory')
      },
      {
        id: 'notifications',
        name: 'Notifications',
        icon: 'Bell',
        enabled: true,
        canView: true,
        canEdit: isAdmin || editableModules.includes('notifications'),
        canDelete: isAdmin || deletableModules.includes('notifications')
      }
    ];

    res.status(200).json({
      success: true,
      modules,
      accessLevel: req.accessLevel,
      globalPermissions: {
        canView: req.canView !== false,
        canEdit: req.canEdit || false,
        canDelete: req.canDelete || false
      }
    });
  } catch (error) {
    console.error('Get modules error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching modules'
    });
  }
});

// Verify team member has access to specific module
router.post('/verify-access', authTeam, attachAccessLevel, async (req, res) => {
  try {
    const { module, action } = req.body; // action can be 'view', 'edit', 'delete'

    const allowedModules = [
      'users', 'doctors', 'appointments', 'chat',
      'hospitals', 'pharmacies', 'plans', 'reports',
      'team_directory', 'profile', 'notifications'
    ];

    const hasViewAccess = allowedModules.includes(module);
    const hasEditAccess = req.canEdit || (req.editableModules || []).includes(module);
    const hasDeleteAccess = req.canDelete || (req.deletableModules || []).includes(module);

    let hasAccess = false;
    if (action === 'view') {
      hasAccess = hasViewAccess;
    } else if (action === 'edit') {
      hasAccess = hasEditAccess;
    } else if (action === 'delete') {
      hasAccess = hasDeleteAccess;
    } else {
      hasAccess = hasViewAccess; // Default to view access
    }

    res.status(200).json({
      success: true,
      hasAccess,
      module,
      action: action || 'view',
      permissions: {
        canView: hasViewAccess,
        canEdit: hasEditAccess,
        canDelete: hasDeleteAccess
      }
    });
  } catch (error) {
    console.error('Verify access error:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying access'
    });
  }
});

// Admin endpoint to update team member privileges
router.put('/privileges/:teamUserId', authTeam, async (req, res) => {
  try {
    const { teamUserId } = req.params;
    const { editableModules, deletableModules } = req.body;
    const adminUser = req.teamUser;

    // Only admins can modify privileges
    if (adminUser.role !== 'admin' && adminUser.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required to modify privileges'
      });
    }

    // In production, update database with new privileges
    // For now, return success with the updated privileges
    res.status(200).json({
      success: true,
      message: 'Privileges updated successfully',
      teamUserId,
      privileges: {
        editableModules: editableModules || [],
        deletableModules: deletableModules || []
      }
    });
  } catch (error) {
    console.error('Update privileges error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating privileges'
    });
  }
});

// ============== TEAM USERS MANAGEMENT ==============

// Create new team user/member
router.post('/users', authTeam, [
  body('firstName').notEmpty().withMessage('First name is required'),
  body('lastName').notEmpty().withMessage('Last name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('phone').optional().isMobilePhone().withMessage('Valid phone number'),
  body('role').optional().isIn(['team_member', 'team_lead', 'admin']).withMessage('Invalid role'),
  body('department').optional().notEmpty().withMessage('Department cannot be empty'),
  body('designation').optional().notEmpty().withMessage('Designation cannot be empty'),
], async (req, res) => {
  try {
    const { firstName, lastName, email, phone, role = 'team_member', department, designation } = req.body;
    const adminUser = req.teamUser;

    // Only admins can create users
    if (!adminUser.isAdmin && adminUser.role !== 'admin' && adminUser.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required to create users'
      });
    }

    // Check if email already exists
    const existingUser = await userModel.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered'
      });
    }

    // Create new user with team membership
    const newUser = await userModel.create({
      firstName,
      lastName,
      email,
      phoneNumber: phone,
      role: role,
      department: department || 'Healthcare Operations',
      designation: designation || 'Team Member',
      isActive: true,
      status: 'active',
      membershipType: 'team',
      metadata: JSON.stringify({
        isTeam: true,
        department: department || 'Healthcare Operations',
        designation: designation || 'Team Member',
        createdBy: adminUser.id,
        createdAt: new Date().toISOString()
      })
    });

    res.status(201).json({
      success: true,
      message: 'Team member created successfully',
      user: {
        id: newUser.id,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        email: newUser.email,
        phone: newUser.phoneNumber,
        role: newUser.role,
        department: newUser.department,
        designation: newUser.designation,
        isActive: newUser.isActive,
        createdAt: newUser.createdAt
      }
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating user',
      error: error.message
    });
  }
});

// List all team users
router.get('/users', authTeam, async (req, res) => {
  try {
    const { department, role, status } = req.query;
    const where = { membershipType: 'team', status: status || 'active' };

    if (department) where.department = department;
    if (role) where.role = role;

    const users = await userModel.findAll({
      where,
      attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber', 'role', 'department', 'designation', 'status', 'lastLogin', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit: 100
    });

    const teamUsers = users.map(user => ({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phoneNumber,
      role: user.role,
      department: user.department,
      designation: user.designation,
      isActive: user.status === 'active',
      lastLogin: user.lastLogin,
      createdAt: user.createdAt
    }));

    res.status(200).json({
      success: true,
      users: teamUsers,
      count: teamUsers.length
    });
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching users'
    });
  }
});

// ============== TEAM DOCTORS MANAGEMENT ==============

// Create/Add new doctor to team
router.post('/doctors', authTeam, [
  body('firstName').notEmpty().withMessage('First name is required'),
  body('lastName').notEmpty().withMessage('Last name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('license').notEmpty().withMessage('License number is required'),
  body('specialization').notEmpty().withMessage('Specialization is required'),
  body('phone').optional().isMobilePhone().withMessage('Valid phone number'),
], async (req, res) => {
  try {
    const { firstName, lastName, email, license, specialization, phone, qualification, experience } = req.body;
    const adminUser = req.teamUser;

    // Only admins/team leads can add doctors
    if (!adminUser.isAdmin && !['admin', 'super_admin', 'team_lead'].includes(adminUser.role)) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied. Team lead or admin access required.'
      });
    }

    // Check if doctor email already exists
    const existingDoctor = await userModel.findOne({ where: { email } });
    if (existingDoctor) {
      return res.status(400).json({
        success: false,
        message: 'Doctor email already registered'
      });
    }

    // Create doctor user account
    const newDoctor = await userModel.create({
      firstName,
      lastName,
      email,
      phoneNumber: phone,
      role: 'doctor',
      designation: 'Doctor',
      department: 'Medical',
      isActive: true,
      status: 'active',
      metadata: JSON.stringify({
        licenseNumber: license,
        specialization,
        qualification: qualification || '',
        experience: experience || '0',
        isTeamDoctor: true,
        verificationStatus: 'pending',
        createdBy: adminUser.id,
        createdAt: new Date().toISOString()
      })
    });

    res.status(201).json({
      success: true,
      message: 'Doctor added to team successfully',
      doctor: {
        id: newDoctor.id,
        firstName: newDoctor.firstName,
        lastName: newDoctor.lastName,
        email: newDoctor.email,
        phone: newDoctor.phoneNumber,
        specialization,
        license,
        qualification: qualification || '',
        experience: experience || '0',
        isActive: newDoctor.isActive,
        createdAt: newDoctor.createdAt
      }
    });
  } catch (error) {
    console.error('Create doctor error:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding doctor',
      error: error.message
    });
  }
});

// List team doctors
router.get('/doctors', authTeam, async (req, res) => {
  try {
    const { specialization, status } = req.query;
    const where = { role: 'doctor', status: status || 'active' };

    let doctors = await userModel.findAll({
      where,
      attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber', 'status', 'createdAt', 'metadata'],
      order: [['createdAt', 'DESC']],
      limit: 200
    });

    // Filter and parse metadata
    doctors = doctors.filter(doc => {
      try {
        const metadata = typeof doc.metadata === 'string' ? JSON.parse(doc.metadata) : (doc.metadata || {});
        return metadata.isTeamDoctor === true || metadata.specialization;
      } catch (e) {
        return false;
      }
    }).map(doc => {
      const metadata = typeof doc.metadata === 'string' ? JSON.parse(doc.metadata) : (doc.metadata || {});

      if (specialization && metadata.specialization !== specialization) {
        return null;
      }

      return {
        id: doc.id,
        firstName: doc.firstName,
        lastName: doc.lastName,
        email: doc.email,
        phone: doc.phoneNumber,
        specialization: metadata.specialization || 'General',
        license: metadata.licenseNumber || '',
        qualification: metadata.qualification || '',
        experience: metadata.experience || '0',
        verificationStatus: metadata.verificationStatus || 'pending',
        isActive: doc.status === 'active',
        createdAt: doc.createdAt
      };
    }).filter(Boolean);

    res.status(200).json({
      success: true,
      doctors,
      count: doctors.length
    });
  } catch (error) {
    console.error('List doctors error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching doctors'
    });
  }
});

// ============== TEAM PHARMACIES MANAGEMENT ==============

// Add pharmacy to team
router.post('/pharmacies', authTeam, [
  body('name').notEmpty().withMessage('Pharmacy name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('phone').notEmpty().withMessage('Phone number is required'),
  body('address').notEmpty().withMessage('Address is required'),
  body('city').notEmpty().withMessage('City is required'),
  body('state').notEmpty().withMessage('State is required'),
  body('licenseNumber').notEmpty().withMessage('License number is required'),
], async (req, res) => {
  try {
    const { name, email, phone, address, city, state, zipCode, licenseNumber, registrationNumber } = req.body;
    const adminUser = req.teamUser;

    // Only admins/team leads can add pharmacies
    if (!adminUser.isAdmin && !['admin', 'super_admin', 'team_lead'].includes(adminUser.role)) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied. Team lead or admin access required.'
      });
    }

    // Check if pharmacy email already exists
    const existingPharmacy = await userModel.findOne({ where: { email } });
    if (existingPharmacy) {
      return res.status(400).json({
        success: false,
        message: 'Pharmacy email already registered'
      });
    }

    // Create pharmacy user account
    const newPharmacy = await userModel.create({
      firstName: name,
      lastName: '',
      email,
      phoneNumber: phone,
      role: 'pharmacy',
      designation: 'Pharmacy',
      department: 'Pharmacy Operations',
      isActive: true,
      status: 'active',
      metadata: JSON.stringify({
        type: 'pharmacy',
        address,
        city,
        state,
        zipCode: zipCode || '',
        licenseNumber,
        registrationNumber: registrationNumber || '',
        isTeamPharmacy: true,
        verificationStatus: 'pending',
        createdBy: adminUser.id,
        createdAt: new Date().toISOString()
      })
    });

    res.status(201).json({
      success: true,
      message: 'Pharmacy added to team successfully',
      pharmacy: {
        id: newPharmacy.id,
        name,
        email,
        phone,
        address,
        city,
        state,
        zipCode: zipCode || '',
        licenseNumber,
        registrationNumber: registrationNumber || '',
        isActive: newPharmacy.isActive,
        createdAt: newPharmacy.createdAt
      }
    });
  } catch (error) {
    console.error('Create pharmacy error:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding pharmacy',
      error: error.message
    });
  }
});

// List team pharmacies
router.get('/pharmacies', authTeam, async (req, res) => {
  try {
    const { city, state, status } = req.query;
    const where = { role: 'pharmacy', status: status || 'active' };

    let pharmacies = await userModel.findAll({
      where,
      attributes: ['id', 'firstName', 'email', 'phoneNumber', 'status', 'createdAt', 'metadata'],
      order: [['createdAt', 'DESC']],
      limit: 200
    });

    // Filter and parse metadata
    pharmacies = pharmacies.filter(pharm => {
      try {
        const metadata = typeof pharm.metadata === 'string' ? JSON.parse(pharm.metadata) : (pharm.metadata || {});
        return metadata.isTeamPharmacy === true || metadata.type === 'pharmacy';
      } catch (e) {
        return false;
      }
    }).map(pharm => {
      const metadata = typeof pharm.metadata === 'string' ? JSON.parse(pharm.metadata) : (pharm.metadata || {});

      if (city && metadata.city !== city) return null;
      if (state && metadata.state !== state) return null;

      return {
        id: pharm.id,
        name: pharm.firstName,
        email: pharm.email,
        phone: pharm.phoneNumber,
        address: metadata.address || '',
        city: metadata.city || '',
        state: metadata.state || '',
        zipCode: metadata.zipCode || '',
        licenseNumber: metadata.licenseNumber || '',
        registrationNumber: metadata.registrationNumber || '',
        verificationStatus: metadata.verificationStatus || 'pending',
        isActive: pharm.status === 'active',
        createdAt: pharm.createdAt
      };
    }).filter(Boolean);

    res.status(200).json({
      success: true,
      pharmacies,
      count: pharmacies.length
    });
  } catch (error) {
    console.error('List pharmacies error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching pharmacies'
    });
  }
});

// ============== TEAM APPOINTMENTS MANAGEMENT ==============

// Create team appointment
router.post('/appointments', authTeam, [
  body('doctorId').notEmpty().withMessage('Doctor ID is required'),
  body('patientEmail').isEmail().withMessage('Valid patient email is required'),
  body('appointmentDate').notEmpty().withMessage('Appointment date is required'),
  body('appointmentTime').notEmpty().withMessage('Appointment time is required'),
], async (req, res) => {
  try {
    const { doctorId, patientEmail, appointmentDate, appointmentTime, notes, type = 'consultation' } = req.body;
    const teamUser = req.teamUser;

    // Verify doctor exists
    const doctor = await userModel.findOne({ where: { id: doctorId, role: 'doctor' } });
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    // Create appointment (returns generated ID)
    const appointmentId = Math.floor(Math.random() * 1000000) + 1;
    const appointmentDateTime = new Date(`${appointmentDate}T${appointmentTime}`);

    res.status(201).json({
      success: true,
      message: 'Appointment created successfully',
      appointment: {
        id: appointmentId,
        doctorId,
        doctorName: `${doctor.firstName} ${doctor.lastName}`,
        patientEmail,
        appointmentDate,
        appointmentTime,
        appointmentDateTime: appointmentDateTime.toISOString(),
        type,
        notes: notes || '',
        status: 'confirmed',
        createdBy: teamUser.id,
        createdAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Create appointment error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating appointment',
      error: error.message
    });
  }
});

// List team appointments
router.get('/appointments', authTeam, async (req, res) => {
  try {
    const { doctorId, status, fromDate, toDate } = req.query;

    // Mock appointments data - in production this would query a database table
    let appointments = [
      {
        id: 1,
        doctorId: 1,
        doctorName: 'Dr. Smith',
        patientEmail: 'patient1@example.com',
        appointmentDate: new Date().toISOString().split('T')[0],
        appointmentTime: '10:00 AM',
        type: 'consultation',
        status: 'confirmed',
        createdAt: new Date().toISOString()
      }
    ];

    if (doctorId) {
      appointments = appointments.filter(apt => apt.doctorId === parseInt(doctorId));
    }
    if (status) {
      appointments = appointments.filter(apt => apt.status === status);
    }

    res.status(200).json({
      success: true,
      appointments,
      count: appointments.length
    });
  } catch (error) {
    console.error('List appointments error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching appointments'
    });
  }
});

// ============== LOGOUT ENDPOINT ==============

// Team logout endpoint
router.post('/logout', authTeam, async (req, res) => {
  try {
    // In a production system, you might want to:
    // - Blacklist the token
    // - Update user's last activity timestamp
    // - Log the logout event

    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Error during logout'
    });
  }
});

export default router;
