/**
import { JWT_CONFIG } from '../../config/auth.config.js';
 * User Association Model (PostgreSQL)
 * Manages user associations with organizations (Hospital, Clinic, Corporate, Membership Plan)
 * 
 * Business Rules:
 * - Every user MUST be associated with at least one entity
 * - Users can have multiple associations (e.g., patient in hospital AND corporate member)
 * - Association types: hospital, clinic, corporate, membership_plan, homecare
 * - Status tracking for active/inactive associations
 */

import { DataTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const UserAssociation = sequelize.define('UserAssociation', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  // User Reference
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    },
    onDelete: 'CASCADE',
    comment: 'Reference to User'
  },
  
  // Association Entity
  entityType: {
    type: DataTypes.ENUM(
      'hospital', 
      'clinic', 
      'corporate', 
      'membership_plan', 
      'homecare',
      'pharmacy',
      'lab',
      'mediqzy_team'
    ),
    allowNull: false,
    comment: 'Type of entity user is associated with'
  },
  
  entityId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'ID of the associated entity'
  },
  
  // Association Metadata
  role: {
    type: DataTypes.ENUM(
      'patient',
      'doctor',
      'nurse',
      'doctor_assistant',
      'team_member',
      'admin',
      'staff',
      'member',
      'dependent'
    ),
    allowNull: false,
    comment: 'Role of user within this association'
  },
  
  isPrimary: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Is this the primary/default association for the user'
  },
  
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'suspended', 'pending'),
    defaultValue: 'active',
    comment: 'Status of association'
  },
  
  // Date tracking
  startDate: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    comment: 'When association started'
  },
  
  endDate: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When association ended (null if active)'
  },
  
  // Additional metadata as JSONB
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional flexible data (employee ID, member number, etc.)'
  },
  
  // Permissions specific to this association
  permissions: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Role-based permissions for this association'
  },
  
  // Created by
  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Admin/user who created this association'
  },
  
  // Notes
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Internal notes about this association'
  }
}, {
  tableName: 'user_associations',
  timestamps: true,
  indexes: [
    {
      unique: false,
      fields: ['userId']
    },
    {
      unique: false,
      fields: ['entityType', 'entityId']
    },
    {
      unique: true,
      fields: ['userId', 'entityType', 'entityId', 'role'],
      name: 'unique_user_entity_role'
    },
    {
      unique: false,
      fields: ['status']
    },
    {
      unique: false,
      fields: ['isPrimary']
    }
  ]
});

// Instance methods
UserAssociation.prototype.activate = async function() {
  this.status = 'active';
  this.endDate = null;
  return await this.save();
};

UserAssociation.prototype.deactivate = async function() {
  this.status = 'inactive';
  this.endDate = new Date();
  return await this.save();
};

UserAssociation.prototype.suspend = async function() {
  this.status = 'suspended';
  return await this.save();
};

// Class methods
UserAssociation.getActiveAssociations = async function(userId) {
  return await this.findAll({
    where: {
      userId,
      status: 'active'
    },
    order: [
      ['isPrimary', 'DESC'],
      ['startDate', 'DESC']
    ]
  });
};

UserAssociation.getPrimaryAssociation = async function(userId) {
  return await this.findOne({
    where: {
      userId,
      isPrimary: true,
      status: 'active'
    }
  });
};

UserAssociation.hasAssociation = async function(userId, entityType, entityId) {
  const count = await this.count({
    where: {
      userId,
      entityType,
      entityId,
      status: 'active'
    }
  });
  return count > 0;
};

UserAssociation.validateUserAssociation = async function(userId) {
  const count = await this.count({
    where: {
      userId,
      status: 'active'
    }
  });
  
  if (count === 0) {
    throw new Error('User must be associated with at least one entity (Hospital, Clinic, Corporate, or Membership Plan)');
  }
  
  return true;
};

export default UserAssociation;
