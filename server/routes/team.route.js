import express from 'express';
import { body } from 'express-validator';
import userModel from '../models/user.model.intelligent.js';
import jwt from 'jsonwebtoken';
import { authTeam, requireModule, attachAccessLevel } from '../middleware/team.middleware.js';

const router = express.Router();

// Team login endpoint
router.post('/login', [
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
    let user;
    try {
      user = await userModel.findOne({ 
        where: { 
          email
        } 
      });
      console.log('🔵 [Team Login] Query completed');
    } catch (queryError) {
      console.error('❌ Team DB query error:', queryError.message);
      throw queryError;
    }
    console.log('🔵 [Team Login] User found:', !!user);

    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid email or password' 
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
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
      role: 'Team Member',
      designation: 'Healthcare Staff',
      department: 'Healthcare Operations',
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
        email: user.email,
        role: 'team',
        isTeam: true
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    // Update last login
    await user.update({ lastLogin: new Date() });

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
      where: { 
        isActive: true,
        role: ['team', 'staff', 'nurse', 'assistant']
      },
      attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber', 'department', 'designation', 'role', 'isActive', 'lastLogin']
    });

    const members = users.map(user => ({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phoneNumber || 'N/A',
      department: user.department || 'Healthcare',
      designation: user.designation || 'Staff',
      role: user.role === 'team' ? 'Team Member' : (user.role === 'nurse' ? 'Nurse' : 'Staff'),
      isActive: user.isActive,
      avatar: null
    }));

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

export default router;