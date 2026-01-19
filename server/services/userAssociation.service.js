/**
 * User Association Service
 * Business logic for managing user-entity associations
 */

import UserAssociation from '../models/postgres/user-association.model.postgres.js';
import Patient from '../models/postgres/patient.model.postgres.js';
import User from '../models/postgres/user.model.postgres.js';
import Doctor from '../models/postgres/doctor.model.postgres.js';
import Nurse from '../models/postgres/nurse.model.postgres.js';
import DoctorAssistant from '../models/postgres/doctor-assistant.model.postgres.js';
import TeamMember from '../models/postgres/team-member.model.postgres.js';

class UserAssociationService {
  /**
   * Create association for user
   */
  static async createAssociation(data) {
    const {
      userId,
      entityType,
      entityId,
      role,
      isPrimary = false,
      metadata = {},
      permissions = {},
      createdBy = null
    } = data;
    
    // Validate required fields
    if (!userId || !entityType || !entityId || !role) {
      throw new Error('userId, entityType, entityId, and role are required');
    }
    
    // Check if association already exists
    const existing = await UserAssociation.findOne({
      where: {
        userId,
        entityType,
        entityId,
        role
      }
    });
    
    if (existing) {
      if (existing.status === 'active') {
        throw new Error('Association already exists');
      }
      // Reactivate if inactive
      return await existing.activate();
    }
    
    // If this is primary, unset other primary associations
    if (isPrimary) {
      await UserAssociation.update(
        { isPrimary: false },
        {
          where: {
            userId,
            isPrimary: true
          }
        }
      );
    }
    
    // Create association
    const association = await UserAssociation.create({
      userId,
      entityType,
      entityId,
      role,
      isPrimary,
      metadata,
      permissions,
      createdBy,
      status: 'active',
      startDate: new Date()
    });
    
    return association;
  }
  
  /**
   * Associate user with hospital
   */
  static async associateWithHospital(userId, hospitalId, role = 'patient', options = {}) {
    return await this.createAssociation({
      userId,
      entityType: 'hospital',
      entityId: hospitalId,
      role,
      ...options
    });
  }
  
  /**
   * Associate user with clinic
   */
  static async associateWithClinic(userId, clinicId, role = 'patient', options = {}) {
    return await this.createAssociation({
      userId,
      entityType: 'clinic',
      entityId: clinicId,
      role,
      ...options
    });
  }
  
  /**
   * Associate user with corporate
   */
  static async associateWithCorporate(userId, corporateId, role = 'member', options = {}) {
    return await this.createAssociation({
      userId,
      entityType: 'corporate',
      entityId: corporateId,
      role,
      ...options
    });
  }
  
  /**
   * Associate user with membership plan
   */
  static async associateWithMembershipPlan(userId, planId, options = {}) {
    return await this.createAssociation({
      userId,
      entityType: 'membership_plan',
      entityId: planId,
      role: 'member',
      ...options
    });
  }
  
  /**
   * Associate doctor with entity
   */
  static async associateDoctor(doctorId, entityType, entityId, options = {}) {
    const validTypes = ['hospital', 'clinic', 'homecare', 'corporate'];
    if (!validTypes.includes(entityType)) {
      throw new Error(`Doctor can only be associated with ${validTypes.join(', ')}`);
    }
    
    return await this.createAssociation({
      userId: doctorId,
      entityType,
      entityId,
      role: 'doctor',
      ...options
    });
  }
  
  /**
   * Associate nurse with entity
   */
  static async associateNurse(nurseId, entityType, entityId, options = {}) {
    const validTypes = ['hospital', 'clinic', 'homecare', 'corporate'];
    if (!validTypes.includes(entityType)) {
      throw new Error(`Nurse can only be associated with ${validTypes.join(', ')}`);
    }
    
    return await this.createAssociation({
      userId: nurseId,
      entityType,
      entityId,
      role: 'nurse',
      ...options
    });
  }
  
  /**
   * Associate doctor assistant with entity and doctor
   */
  static async associateDoctorAssistant(assistantId, entityType, entityId, doctorId, options = {}) {
    const validTypes = ['hospital', 'clinic'];
    if (!validTypes.includes(entityType)) {
      throw new Error('Doctor Assistant can only be associated with hospital or clinic');
    }
    
    if (!doctorId) {
      throw new Error('Doctor Assistant must be linked to a doctor');
    }
    
    // Create entity association
    const association = await this.createAssociation({
      userId: assistantId,
      entityType,
      entityId,
      role: 'doctor_assistant',
      metadata: {
        ...options.metadata,
        linkedDoctorId: doctorId
      },
      ...options
    });
    
    // Update DoctorAssistant record with doctor link
    await DoctorAssistant.update(
      { doctorId },
      { where: { userId: assistantId } }
    );
    
    return association;
  }
  
  /**
   * Associate team member with Mediqzy
   */
  static async associateTeamMember(teamMemberId, options = {}) {
    return await this.createAssociation({
      userId: teamMemberId,
      entityType: 'mediqzy_team',
      entityId: 1, // Mediqzy org ID
      role: 'team_member',
      ...options
    });
  }
  
  /**
   * Convert user to patient after doctor visit
   */
  static async convertToPatient(userId, doctorId, appointmentId) {
    // Check if user exists
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }
    
    // Validate user has association
    await UserAssociation.validateUserAssociation(userId);
    
    // Check if already patient
    let patient = await Patient.findByUserId(userId);
    
    if (!patient) {
      // Create patient record
      patient = await Patient.createFromUser(userId, doctorId, appointmentId);
    } else {
      // Update visit count
      await patient.incrementVisits();
    }
    
    return patient;
  }
  
  /**
   * Get user's associations by entity type
   */
  static async getUserAssociationsByType(userId, entityType) {
    return await UserAssociation.findAll({
      where: {
        userId,
        entityType,
        status: 'active'
      }
    });
  }
  
  /**
   * Get all users associated with an entity
   */
  static async getEntityUsers(entityType, entityId, role = null) {
    const where = {
      entityType,
      entityId,
      status: 'active'
    };
    
    if (role) {
      where.role = role;
    }
    
    return await UserAssociation.findAll({
      where,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber']
        }
      ]
    });
  }
  
  /**
   * Remove/deactivate association
   */
  static async removeAssociation(userId, entityType, entityId, role) {
    const association = await UserAssociation.findOne({
      where: {
        userId,
        entityType,
        entityId,
        role
      }
    });
    
    if (!association) {
      throw new Error('Association not found');
    }
    
    // Check if this is the only association
    const activeCount = await UserAssociation.count({
      where: {
        userId,
        status: 'active'
      }
    });
    
    if (activeCount === 1) {
      throw new Error('Cannot remove last association. User must be associated with at least one entity.');
    }
    
    return await association.deactivate();
  }
  
  /**
   * Set primary association
   */
  static async setPrimaryAssociation(userId, entityType, entityId) {
    // Unset all primaries for this user
    await UserAssociation.update(
      { isPrimary: false },
      {
        where: {
          userId,
          isPrimary: true
        }
      }
    );
    
    // Set new primary
    const association = await UserAssociation.findOne({
      where: {
        userId,
        entityType,
        entityId,
        status: 'active'
      }
    });
    
    if (!association) {
      throw new Error('Association not found');
    }
    
    association.isPrimary = true;
    return await association.save();
  }
  
  /**
   * Transfer user from one entity to another
   */
  static async transferUser(userId, fromEntityType, fromEntityId, toEntityType, toEntityId, role) {
    // Deactivate old association
    const oldAssoc = await UserAssociation.findOne({
      where: {
        userId,
        entityType: fromEntityType,
        entityId: fromEntityId,
        role,
        status: 'active'
      }
    });
    
    if (oldAssoc) {
      await oldAssoc.deactivate();
    }
    
    // Create new association
    return await this.createAssociation({
      userId,
      entityType: toEntityType,
      entityId: toEntityId,
      role,
      metadata: {
        transferredFrom: {
          entityType: fromEntityType,
          entityId: fromEntityId,
          date: new Date()
        }
      }
    });
  }
}

export default UserAssociationService;
