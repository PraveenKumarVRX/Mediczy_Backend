/**
import { JWT_CONFIG } from '../../config/auth.config.js';
 * Team Member Model (PostgreSQL)
 * Represents Mediqzy internal team members
 * 
 * Business Rules:
 * - Team members are part of Mediqzy organization
 * - Have access to platform administration
 * - Different from clinic/hospital staff
 * - entityType in UserAssociation = 'mediqzy_team'
 */

import { DataTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';
import bcrypt from 'bcrypt';
import { hashPasswordIfPlaintext } from '../../utils/passwordHashing.js';
import jwt from 'jsonwebtoken';
import { generateUniqueId } from '../../utils/uniqueIdGenerator.js';

const TeamMember = sequelize.define('TeamMember', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  // Reference to base User
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    unique: true,
    references: {
      model: 'Users',
      key: 'id'
    },
    onDelete: 'SET NULL',
    comment: 'Link to User record (optional)'
  },
  
  // Team Member ID
  unique_id: {
    type: DataTypes.STRING(6),
    unique: true,
    allowNull: true,
    comment: 'Public-facing unique ID with T prefix'
  },
  
  // Employee ID
  employeeId: {
    type: DataTypes.STRING(50),
    unique: true,
    allowNull: false,
    comment: 'Mediqzy employee ID'
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
  
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  
  password: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  
  phoneNumber: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  
  profileImage: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  
  // Role and Department
  role: {
    type: DataTypes.ENUM(
      'admin',
      'super_admin',
      'support',
      'operations',
      'marketing',
      'sales',
      'tech',
      'product',
      'customer_success',
      'finance',
      'hr',
      'legal',
      'medical_advisor'
    ),
    allowNull: false,
    defaultValue: 'support'
  },
  
  department: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  
  designation: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  
  // Employment Details
  joiningDate: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  
  exitDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  
  employmentStatus: {
    type: DataTypes.ENUM('active', 'inactive', 'on_leave', 'terminated'),
    defaultValue: 'active'
  },
  
  employmentType: {
    type: DataTypes.ENUM('full_time', 'part_time', 'contract', 'intern'),
    defaultValue: 'full_time'
  },
  
  // Permissions and Access
  permissions: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Platform-wide permissions'
  },
  
  accessLevel: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    comment: '1=Basic, 2=Moderate, 3=High, 4=Admin, 5=Super Admin'
  },
  
  // Contact and Location
  workLocation: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  
  emergencyContact: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Emergency contact details'
  },
  
  // Manager Reference
  managerId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Reports to team member ID'
  },
  
  // Metadata
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional employee data'
  },
  
  // Notes
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  
  // Status
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  
  // Two-factor auth
  twoFactorEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  
  twoFactorSecret: {
    type: DataTypes.STRING(255),
    allowNull: true
  }
}, {
  tableName: 'team_members',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['employeeId']
    },
    {
      unique: true,
      fields: ['email']
    },
    {
      unique: true,
      fields: ['unique_id']
    },
    {
      unique: false,
      fields: ['role']
    },
    {
      unique: false,
      fields: ['employmentStatus']
    }
  ]
});

// Hooks
TeamMember.beforeCreate(async (teamMember) => {
  if (!teamMember.unique_id) {
    teamMember.unique_id = await generateUniqueId('T');
  }
  
  if (teamMember.password) {
    teamMember.password = await hashPasswordIfPlaintext(teamMember.password, 10);
  }
});

TeamMember.beforeUpdate(async (teamMember) => {
  if (teamMember.changed('password') && teamMember.password) {
    teamMember.password = await hashPasswordIfPlaintext(teamMember.password, 10);
  }
});

// Instance Methods
TeamMember.prototype.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

TeamMember.prototype.generateAuthToken = function() {
  return jwt.sign(
    { 
      id: this.id,
      email: this.email,
      role: this.role,
      type: 'team_member',
      accessLevel: this.accessLevel
    },
    JWT_CONFIG.SECRET,
    { expiresIn: '24h' }
  );
};

TeamMember.prototype.hasPermission = function(permission) {
  return this.permissions && this.permissions[permission] === true;
};

TeamMember.prototype.grantPermission = async function(permission) {
  if (!this.permissions) {
    this.permissions = {};
  }
  this.permissions[permission] = true;
  return await this.save();
};

TeamMember.prototype.revokePermission = async function(permission) {
  if (this.permissions && this.permissions[permission]) {
    this.permissions[permission] = false;
    return await this.save();
  }
  return this;
};

export default TeamMember;
