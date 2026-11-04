/**
 * User Association Routes
 * API endpoints for managing user-entity associations
 */

import express from 'express';
import UserAssociationService from '../services/userAssociation.service.js';
import { 
  validateUserAssociations,
  validateDoctorAssociations,
  validateNurseAssociations,
  validateDoctorAssistantAssociations,
  attachUserHierarchy,
  requireEntityAccess
} from '../middleware/userHierarchy.middleware.js';
import { authUser, requireRole } from '../middleware/auth.middleware.js';

const router = express.Router();

/**
 * @route   POST /api/user-associations
 * @desc    Create new user association
 * @access  Admin
 */
router.post('/', authUser, requireRole('admin'), async (req, res) => {
  try {
    const association = await UserAssociationService.createAssociation(req.body);
    
    res.status(201).json({
      success: true,
      message: 'Association created successfully',
      data: association
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * @route   POST /api/user-associations/hospital
 * @desc    Associate user with hospital
 * @access  Admin/Hospital Admin
 */
router.post('/hospital', authUser, async (req, res) => {
  try {
    const { userId, hospitalId, role, ...options } = req.body;
    
    const association = await UserAssociationService.associateWithHospital(
      userId,
      hospitalId,
      role,
      { ...options, createdBy: req.user.id }
    );
    
    res.status(201).json({
      success: true,
      message: 'User associated with hospital successfully',
      data: association
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * @route   POST /api/user-associations/clinic
 * @desc    Associate user with clinic
 * @access  Admin/Clinic Admin
 */
router.post('/clinic', authUser, async (req, res) => {
  try {
    const { userId, clinicId, role, ...options } = req.body;
    
    const association = await UserAssociationService.associateWithClinic(
      userId,
      clinicId,
      role,
      { ...options, createdBy: req.user.id }
    );
    
    res.status(201).json({
      success: true,
      message: 'User associated with clinic successfully',
      data: association
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * @route   POST /api/user-associations/corporate
 * @desc    Associate user with corporate
 * @access  Admin/Corporate Admin
 */
router.post('/corporate', authUser, requireRole('admin'), async (req, res) => {
  try {
    const { userId, corporateId, role, ...options } = req.body;
    
    const association = await UserAssociationService.associateWithCorporate(
      userId,
      corporateId,
      role || 'member',
      { ...options, createdBy: req.user.id }
    );
    
    res.status(201).json({
      success: true,
      message: 'User associated with corporate successfully',
      data: association
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * @route   POST /api/user-associations/membership-plan
 * @desc    Associate user with membership plan
 * @access  Admin/User
 */
router.post('/membership-plan', authUser, async (req, res) => {
  try {
    const { userId, planId, ...options } = req.body;
    
    // Users can only associate themselves, admins can associate anyone
    if (req.user.role !== 'admin' && userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You can only associate yourself with a membership plan'
      });
    }
    
    const association = await UserAssociationService.associateWithMembershipPlan(
      userId,
      planId,
      { ...options, createdBy: req.user.id }
    );
    
    res.status(201).json({
      success: true,
      message: 'User associated with membership plan successfully',
      data: association
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * @route   POST /api/user-associations/doctor
 * @desc    Associate doctor with entity
 * @access  Admin
 */
router.post('/doctor', authUser, requireRole('admin'), async (req, res) => {
  try {
    const { doctorId, entityType, entityId, ...options } = req.body;
    
    const association = await UserAssociationService.associateDoctor(
      doctorId,
      entityType,
      entityId,
      { ...options, createdBy: req.user.id }
    );
    
    res.status(201).json({
      success: true,
      message: `Doctor associated with ${entityType} successfully`,
      data: association
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * @route   POST /api/user-associations/nurse
 * @desc    Associate nurse with entity
 * @access  Admin
 */
router.post('/nurse', authUser, requireRole('admin'), async (req, res) => {
  try {
    const { nurseId, entityType, entityId, ...options } = req.body;
    
    const association = await UserAssociationService.associateNurse(
      nurseId,
      entityType,
      entityId,
      { ...options, createdBy: req.user.id }
    );
    
    res.status(201).json({
      success: true,
      message: `Nurse associated with ${entityType} successfully`,
      data: association
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * @route   POST /api/user-associations/doctor-assistant
 * @desc    Associate doctor assistant with entity and doctor
 * @access  Admin
 */
router.post('/doctor-assistant', authUser, requireRole('admin'), async (req, res) => {
  try {
    const { assistantId, entityType, entityId, doctorId, ...options } = req.body;
    
    const association = await UserAssociationService.associateDoctorAssistant(
      assistantId,
      entityType,
      entityId,
      doctorId,
      { ...options, createdBy: req.user.id }
    );
    
    res.status(201).json({
      success: true,
      message: 'Doctor assistant associated successfully',
      data: association
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * @route   GET /api/user-associations/user/:userId
 * @desc    Get all associations for a user
 * @access  Admin/Self
 */
router.get('/user/:userId', authUser, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Users can only view their own associations, admins can view anyone's
    if (req.user.role !== 'admin' && parseInt(userId) !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You can only view your own associations'
      });
    }
    
    const associations = await UserAssociation.getActiveAssociations(parseInt(userId));
    
    res.json({
      success: true,
      count: associations.length,
      data: associations
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * @route   GET /api/user-associations/entity/:entityType/:entityId
 * @desc    Get all users associated with an entity
 * @access  Admin/Entity Admin
 */
router.get('/entity/:entityType/:entityId', authUser, async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const { role } = req.query;
    
    const users = await UserAssociationService.getEntityUsers(
      entityType,
      parseInt(entityId),
      role
    );
    
    res.json({
      success: true,
      count: users.length,
      data: users
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * @route   PUT /api/user-associations/:id/primary
 * @desc    Set association as primary
 * @access  Admin/Self
 */
router.put('/:id/primary', authUser, async (req, res) => {
  try {
    const association = await UserAssociation.findByPk(req.params.id);
    
    if (!association) {
      return res.status(404).json({
        success: false,
        message: 'Association not found'
      });
    }
    
    // Check permissions
    if (req.user.role !== 'admin' && association.userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });
    }
    
    await UserAssociationService.setPrimaryAssociation(
      association.userId,
      association.entityType,
      association.entityId
    );
    
    res.json({
      success: true,
      message: 'Primary association updated'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * @route   DELETE /api/user-associations/:id
 * @desc    Remove/deactivate association
 * @access  Admin
 */
router.delete('/:id', authUser, requireRole('admin'), async (req, res) => {
  try {
    const association = await UserAssociation.findByPk(req.params.id);
    
    if (!association) {
      return res.status(404).json({
        success: false,
        message: 'Association not found'
      });
    }
    
    await UserAssociationService.removeAssociation(
      association.userId,
      association.entityType,
      association.entityId,
      association.role
    );
    
    res.json({
      success: true,
      message: 'Association deactivated successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * @route   GET /api/user-associations/hierarchy/:userId
 * @desc    Get user's role hierarchy
 * @access  Admin/Self
 */
router.get('/hierarchy/:userId', authUser, attachUserHierarchy, async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (req.user.role !== 'admin' && parseInt(userId) !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });
    }
    
    const hierarchy = await getUserRoleHierarchy(parseInt(userId));
    
    res.json({
      success: true,
      data: hierarchy
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export default router;
