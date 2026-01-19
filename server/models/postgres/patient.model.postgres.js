/**
import { JWT_CONFIG } from '../../config/auth.config.js';
 * Patient Model (PostgreSQL)
 * A Patient is a User who has taken service from a Doctor
 * 
 * Business Rules:
 * - Patient is created when User books first appointment/consultation
 * - Maintains link to base User record
 * - Tracks medical history, visits, and healthcare journey
 * - Must be associated with at least one entity (Hospital/Clinic/Corporate/Membership)
 */

import { DataTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';
import { generateUniqueId } from '../../utils/uniqueIdGenerator.js';

const Patient = sequelize.define('Patient', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  // Reference to base User
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    references: {
      model: 'Users',
      key: 'id'
    },
    onDelete: 'CASCADE',
    comment: 'Link to base User record'
  },
  
  // Patient-specific ID
  unique_id: {
    type: DataTypes.STRING(6),
    unique: true,
    allowNull: true,
    comment: 'Public-facing unique ID with P prefix'
  },
  
  // MRN (Medical Record Number) - unique per hospital/clinic
  mrn: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Medical Record Number - unique per facility'
  },
  
  // Patient Activation
  firstVisitDate: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Date when user first became a patient (first doctor visit)'
  },
  
  firstDoctorId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Doctor who converted this user to patient'
  },
  
  firstAppointmentId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'First appointment that created patient record'
  },
  
  // Medical Information
  bloodGroup: {
    type: DataTypes.ENUM('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'),
    allowNull: true
  },
  
  height: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    comment: 'Height in cm'
  },
  
  weight: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    comment: 'Weight in kg'
  },
  
  // Emergency Contact
  emergencyContact: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Emergency contact information {name, phone, relation}'
  },
  
  // Allergies and Medical History
  allergies: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    comment: 'Known allergies'
  },
  
  chronicConditions: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    comment: 'Chronic medical conditions'
  },
  
  currentMedications: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Current medications being taken'
  },
  
  // Insurance Information
  primaryInsuranceId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Primary insurance policy ID'
  },
  
  secondaryInsuranceId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Secondary insurance policy ID'
  },
  
  // Patient Status
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'deceased', 'transferred'),
    defaultValue: 'active'
  },
  
  // Healthcare Statistics
  totalVisits: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Total number of doctor visits'
  },
  
  lastVisitDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  
  // Additional Metadata
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional flexible patient data'
  },
  
  // Consent and Privacy
  consentGiven: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Medical data sharing consent'
  },
  
  consentDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  
  // Notes
  medicalNotes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'General medical notes about patient'
  }
}, {
  tableName: 'patients',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['userId']
    },
    {
      unique: true,
      fields: ['unique_id']
    },
    {
      unique: false,
      fields: ['status']
    },
    {
      unique: false,
      fields: ['firstVisitDate']
    },
    {
      unique: false,
      fields: ['mrn']
    }
  ]
});

// Hooks
Patient.beforeCreate(async (patient) => {
  if (!patient.unique_id) {
    patient.unique_id = await generateUniqueId('P');
  }
  if (!patient.firstVisitDate) {
    patient.firstVisitDate = new Date();
  }
});

// Instance Methods
Patient.prototype.incrementVisits = async function() {
  this.totalVisits += 1;
  this.lastVisitDate = new Date();
  return await this.save();
};

Patient.prototype.updateEmergencyContact = async function(contactInfo) {
  this.emergencyContact = contactInfo;
  return await this.save();
};

Patient.prototype.addAllergy = async function(allergy) {
  if (!this.allergies.includes(allergy)) {
    this.allergies.push(allergy);
    return await this.save();
  }
  return this;
};

Patient.prototype.addChronicCondition = async function(condition) {
  if (!this.chronicConditions.includes(condition)) {
    this.chronicConditions.push(condition);
    return await this.save();
  }
  return this;
};

// Static Methods
Patient.createFromUser = async function(userId, doctorId, appointmentId, additionalData = {}) {
  return await this.create({
    userId,
    firstDoctorId: doctorId,
    firstAppointmentId: appointmentId,
    firstVisitDate: new Date(),
    ...additionalData
  });
};

Patient.findByUserId = async function(userId) {
  return await this.findOne({ where: { userId } });
};

Patient.isPatient = async function(userId) {
  const count = await this.count({ where: { userId } });
  return count > 0;
};

export default Patient;
