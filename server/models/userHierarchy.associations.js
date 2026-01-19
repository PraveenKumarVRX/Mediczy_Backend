/**
 * User Hierarchy Model Associations
 * Sets up relationships between all user-related models
 */

import User from './postgres/user.model.postgres.js';
import Patient from './postgres/patient.model.postgres.js';
import Doctor from './postgres/doctor.model.postgres.js';
import Nurse from './postgres/nurse.model.postgres.js';
import DoctorAssistant from './postgres/doctor-assistant.model.postgres.js';
import TeamMember from './postgres/team-member.model.postgres.js';
import UserAssociation from './postgres/user-association.model.postgres.js';
import Clinic from './postgres/clinic.model.postgres.js';
import Hospital from './hospital.model.intelligent.js';  // Using intelligent model
import Corporate from './postgres/corporate.model.postgres.js';
import MembershipPlan from './postgres/membership-plan.model.postgres.js';
import Homecare from './postgres/homecare.model.postgres.js';
import Appointment from './postgres/appointment.model.postgres.js';

export function setupUserHierarchyAssociations() {
  // User <-> Appointment (for patient relationship)
  User.hasMany(Appointment, {
    foreignKey: 'userId',
    as: 'appointments'
  });
  Appointment.belongsTo(User, {
    foreignKey: 'userId',
    as: 'patient'
  });

  // Doctor <-> Appointment
  Doctor.hasMany(Appointment, {
    foreignKey: 'doctorId',
    as: 'doctorAppointments'
  });
  Appointment.belongsTo(Doctor, {
    foreignKey: 'doctorId',
    as: 'doctor'
  });

  // User <-> UserAssociation
  User.hasMany(UserAssociation, {
    foreignKey: 'userId',
    as: 'associations'
  });
  UserAssociation.belongsTo(User, {
    foreignKey: 'userId',
    as: 'user'
  });

  // User <-> Patient (1:1)
  User.hasOne(Patient, {
    foreignKey: 'userId',
    as: 'patientProfile'
  });
  Patient.belongsTo(User, {
    foreignKey: 'userId',
    as: 'user'
  });

  // User <-> TeamMember (1:1)
  User.hasOne(TeamMember, {
    foreignKey: 'userId',
    as: 'teamMemberProfile'
  });
  TeamMember.belongsTo(User, {
    foreignKey: 'userId',
    as: 'user'
  });

  // Doctor <-> User (1:1 optional)
  Doctor.belongsTo(User, {
    foreignKey: 'userId',
    as: 'userProfile'
  });
  User.hasOne(Doctor, {
    foreignKey: 'userId',
    as: 'doctorProfile'
  });

  // Nurse <-> User (1:1 optional)
  Nurse.belongsTo(User, {
    foreignKey: 'userId',
    as: 'userProfile'
  });
  User.hasOne(Nurse, {
    foreignKey: 'userId',
    as: 'nurseProfile'
  });

  // DoctorAssistant <-> User (1:1 optional)
  DoctorAssistant.belongsTo(User, {
    foreignKey: 'userId',
    as: 'userProfile'
  });
  User.hasOne(DoctorAssistant, {
    foreignKey: 'userId',
    as: 'assistantProfile'
  });

  // DoctorAssistant <-> Doctor (N:1)
  DoctorAssistant.belongsTo(Doctor, {
    foreignKey: 'doctorId',
    as: 'linkedDoctor'
  });
  Doctor.hasMany(DoctorAssistant, {
    foreignKey: 'doctorId',
    as: 'assistants'
  });

  // Patient <-> Doctor (first visit)
  Patient.belongsTo(Doctor, {
    foreignKey: 'firstDoctorId',
    as: 'firstDoctor'
  });

  // TeamMember hierarchy (self-reference)
  TeamMember.belongsTo(TeamMember, {
    foreignKey: 'managerId',
    as: 'manager'
  });
  TeamMember.hasMany(TeamMember, {
    foreignKey: 'managerId',
    as: 'subordinates'
  });

  // Polymorphic associations through UserAssociation
  // These are helper methods, not actual Sequelize associations
  // since we're using a polymorphic pattern

  /**
   * Helper method to get entity for association
   */
  UserAssociation.prototype.getEntity = async function() {
    const models = {
      hospital: Hospital,
      clinic: Clinic,
      corporate: Corporate,
      membership_plan: MembershipPlan,
      homecare: Homecare,
      // Add other entity types as needed
    };

    const Model = models[this.entityType];
    if (!Model) {
      return null;
    }

    return await Model.findByPk(this.entityId);
  };

  /**
   * Helper method to get all users for an entity
   */
  const getEntityUsers = async function(entityType, entityId) {
    return await UserAssociation.findAll({
      where: {
        entityType,
        entityId,
        status: 'active'
      },
      include: [
        {
          model: User,
          as: 'user'
        }
      ]
    });
  };

  // Add static methods to entity models
  if (Hospital) {
    Hospital.prototype.getUsers = async function(role = null) {
      return await getEntityUsers('hospital', this.id, role);
    };
    Hospital.prototype.getDoctors = async function() {
      return await getEntityUsers('hospital', this.id, 'doctor');
    };
    Hospital.prototype.getNurses = async function() {
      return await getEntityUsers('hospital', this.id, 'nurse');
    };
    Hospital.prototype.getPatients = async function() {
      return await getEntityUsers('hospital', this.id, 'patient');
    };
  }

  if (Clinic) {
    Clinic.prototype.getUsers = async function(role = null) {
      return await getEntityUsers('clinic', this.id, role);
    };
    Clinic.prototype.getDoctors = async function() {
      return await getEntityUsers('clinic', this.id, 'doctor');
    };
    Clinic.prototype.getNurses = async function() {
      return await getEntityUsers('clinic', this.id, 'nurse');
    };
    Clinic.prototype.getPatients = async function() {
      return await getEntityUsers('clinic', this.id, 'patient');
    };
    Clinic.prototype.getDoctorAssistants = async function() {
      return await getEntityUsers('clinic', this.id, 'doctor_assistant');
    };
  }

  if (Corporate) {
    Corporate.prototype.getMembers = async function() {
      return await getEntityUsers('corporate', this.id, 'member');
    };
    Corporate.prototype.getDoctors = async function() {
      return await getEntityUsers('corporate', this.id, 'doctor');
    };
    Corporate.prototype.getNurses = async function() {
      return await getEntityUsers('corporate', this.id, 'nurse');
    };
  }

  console.log('✅ User Hierarchy associations setup complete');
}

export default setupUserHierarchyAssociations;
