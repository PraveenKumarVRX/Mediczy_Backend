/**
import { JWT_CONFIG } from '../../config/auth.config.js';
 * Family Member Model (PostgreSQL)
 * Stores family members linked to user accounts
 */

import { DataTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const FamilyMember = sequelize.define('FamilyMember', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  // Link to primary user
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    },
    comment: 'Primary user account ID'
  },
  
  // Basic Information
  firstName: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  lastName: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  
  // Relationship to primary user
  relationship: {
    type: DataTypes.ENUM(
      'spouse', 'father', 'mother', 'son', 'daughter', 
      'brother', 'sister', 'grandfather', 'grandmother',
      'grandson', 'granddaughter', 'uncle', 'aunt',
      'nephew', 'niece', 'cousin', 'guardian', 'other'
    ),
    allowNull: false
  },
  
  // Personal Details
  dateOfBirth: {
    type: DataTypes.DATE,
    allowNull: true
  },
  gender: {
    type: DataTypes.ENUM('Male', 'Female', 'Other'),
    allowNull: false
  },
  phoneNumber: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: true,
    validate: {
      isEmail: true
    }
  },
  
  // Medical Information
  bloodType: {
    type: DataTypes.STRING(10),
    allowNull: true
  },
  allergies: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    comment: 'Array of known allergies'
  },
  medications: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    comment: 'Array of current medications'
  },
  chronicConditions: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    comment: 'Array of chronic conditions'
  },
  
  // Health IDs
  abhaHealthId: {
    type: DataTypes.STRING(50),
    allowNull: true,
    unique: true,
    comment: 'Ayushman Bharat Health Account ID'
  },
  
  // Profile Picture
  profileImage: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  
  // Additional Medical History
  medicalHistory: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Comprehensive medical history in JSON format'
  },
  
  // Emergency Contact
  emergencyContact: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Emergency contact details'
  },
  
  // Status
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  
  // Timestamps
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'family_members',
  timestamps: true,
  
  indexes: [
    { fields: ['userId'] },
    { fields: ['relationship'] },
    { fields: ['isActive'] }
  ]
});

export default FamilyMember;
