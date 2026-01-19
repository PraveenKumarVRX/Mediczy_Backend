/**
 * User Hierarchy Validation Middleware
 * Enforces business rules for user associations
 * 
 * Rules:
 * 1. Every user must be associated with at least one entity
 * 2. Patients must have taken service from a doctor
 * 3. Doctors must be associated with hospital/clinic/homecare/corporate
 * 4. Nurses must be associated with clinic/hospital/homecare/corporate
 * 5. Doctor Assistants must be associated with clinic/hospital AND a specific doctor
 * 6. Team Members are part of Mediqzy
 */

import UserAssociation from '../models/postgres/user-association.model.postgres.js';
import Patient from '../models/postgres/patient.model.postgres.js';
import Doctor from '../models/postgres/doctor.model.postgres.js';
import Nurse from '../models/postgres/nurse.model.postgres.js';
import DoctorAssistant from '../models/postgres/doctor-assistant.model.postgres.js';
import TeamMember from '../models/postgres/team-member.model.postgres.js';

/**
 * Validate that user has required associations
 */
export const validateUserAssociations = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.body?.userId;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }
    
    // Check if user has at least one active association
    await UserAssociation.validateUserAssociation(userId);
    
    next();
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || 'User must be associated with at least one entity'
    });
  }
};

/**
 * Ensure doctor has valid associations
 */
export const validateDoctorAssociations = async (req, res, next) => {
  try {
    const doctorId = req.doctor?.id || req.user?.id;
    
    if (!doctorId) {
      return res.status(400).json({
        success: false,
        message: 'Doctor ID is required'
      });
    }
    
    const associations = await UserAssociation.findAll({
      where: {
        userId: doctorId,
        role: 'doctor',
        status: 'active',
        entityType: ['hospital', 'clinic', 'homecare', 'corporate']
      }
    });
    
    if (associations.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Doctor must be associated with at least one hospital, clinic, homecare service, or corporate'
      });
    }
    
    req.doctorAssociations = associations;
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Ensure nurse has valid associations
 */
export const validateNurseAssociations = async (req, res, next) => {
  try {
    const nurseId = req.nurse?.id || req.user?.id;
    
    if (!nurseId) {
      return res.status(400).json({
        success: false,
        message: 'Nurse ID is required'
      });
    }
    
    const associations = await UserAssociation.findAll({
      where: {
        userId: nurseId,
        role: 'nurse',
        status: 'active',
        entityType: ['hospital', 'clinic', 'homecare', 'corporate']
      }
    });
    
    if (associations.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Nurse must be associated with at least one clinic, hospital, homecare service, or corporate'
      });
    }
    
    req.nurseAssociations = associations;
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Ensure doctor assistant has valid associations and linked doctor
 */
export const validateDoctorAssistantAssociations = async (req, res, next) => {
  try {
    const assistantId = req.assistant?.id || req.user?.id;
    
    if (!assistantId) {
      return res.status(400).json({
        success: false,
        message: 'Doctor Assistant ID is required'
      });
    }
    
    // Check entity association
    const associations = await UserAssociation.findAll({
      where: {
        userId: assistantId,
        role: 'doctor_assistant',
        status: 'active',
        entityType: ['hospital', 'clinic']
      }
    });
    
    if (associations.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Doctor Assistant must be associated with a clinic or hospital'
      });
    }
    
    // Check doctor linkage
    const assistant = await DoctorAssistant.findOne({
      where: { userId: assistantId }
    });
    
    if (!assistant || !assistant.doctorId) {
      return res.status(403).json({
        success: false,
        message: 'Doctor Assistant must be linked to a specific doctor'
      });
    }
    
    req.assistantAssociations = associations;
    req.linkedDoctor = assistant.doctorId;
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Validate patient conversion (user → patient)
 */
export const validatePatientConversion = async (userId, doctorId, appointmentId) => {
  try {
    // Check if already a patient
    const existingPatient = await Patient.findByUserId(userId);
    if (existingPatient) {
      return { success: true, patient: existingPatient, isNew: false };
    }
    
    // Verify user has association
    await UserAssociation.validateUserAssociation(userId);
    
    // Create patient record
    const patient = await Patient.createFromUser(userId, doctorId, appointmentId);
    
    return { success: true, patient, isNew: true };
  } catch (error) {
    throw new Error(`Patient conversion failed: ${error.message}`);
  }
};

/**
 * Get user's role hierarchy
 */
export const getUserRoleHierarchy = async (userId) => {
  const hierarchy = {
    isPatient: false,
    isDoctor: false,
    isNurse: false,
    isDoctorAssistant: false,
    isTeamMember: false,
    associations: [],
    roles: []
  };
  
  // Check patient status
  const patient = await Patient.findByUserId(userId);
  if (patient) {
    hierarchy.isPatient = true;
    hierarchy.roles.push('patient');
  }
  
  // Get all associations
  const associations = await UserAssociation.getActiveAssociations(userId);
  hierarchy.associations = associations;
  
  associations.forEach(assoc => {
    switch (assoc.role) {
      case 'doctor':
        hierarchy.isDoctor = true;
        hierarchy.roles.push('doctor');
        break;
      case 'nurse':
        hierarchy.isNurse = true;
        hierarchy.roles.push('nurse');
        break;
      case 'doctor_assistant':
        hierarchy.isDoctorAssistant = true;
        hierarchy.roles.push('doctor_assistant');
        break;
      case 'team_member':
        hierarchy.isTeamMember = true;
        hierarchy.roles.push('team_member');
        break;
    }
  });
  
  return hierarchy;
};

/**
 * Middleware to attach user hierarchy to request
 */
export const attachUserHierarchy = async (req, res, next) => {
  try {
    if (req.user && req.user.id) {
      req.userHierarchy = await getUserRoleHierarchy(req.user.id);
    }
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Check if user can access entity
 */
export const canAccessEntity = async (userId, entityType, entityId) => {
  return await UserAssociation.hasAssociation(userId, entityType, entityId);
};

/**
 * Middleware factory for entity access check
 */
export const requireEntityAccess = (entityType, getEntityId) => {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id;
      const entityId = typeof getEntityId === 'function' 
        ? getEntityId(req) 
        : req.params[getEntityId];
      
      if (!userId || !entityId) {
        return res.status(400).json({
          success: false,
          message: 'User and entity information required'
        });
      }
      
      const hasAccess = await canAccessEntity(userId, entityType, entityId);
      
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: `You do not have access to this ${entityType}`
        });
      }
      
      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }
  };
};

export default {
  validateUserAssociations,
  validateDoctorAssociations,
  validateNurseAssociations,
  validateDoctorAssistantAssociations,
  validatePatientConversion,
  getUserRoleHierarchy,
  attachUserHierarchy,
  canAccessEntity,
  requireEntityAccess
};
