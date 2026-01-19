import { DataTypes } from 'sequelize';
import { JWT_CONFIG } from '../../config/auth.config.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import postgresSequelize from '../../db/postgres-sequelize.js';
import { generateUniqueId } from '../../utils/uniqueIdGenerator.js';

/**
 * DoctorAssistant Model (PostgreSQL)
 * Represents assistants working with doctors (e.g., clinic staff, receptionists)
 * 
 * Features:
 * - Linked to doctor account
 * - Password hashing with bcrypt
 * - JWT token generation
 * - JSONB for permissions
 * - Role-based access control
 */

const DoctorAssistant = postgresSequelize.define('DoctorAssistant', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  unique_id: {
    type: DataTypes.STRING(6),
    unique: true,
    allowNull: true,
    comment: 'Public-facing unique ID with A prefix'
  },
  doctorId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Doctor this assistant works for (optional)'
  },
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
  phoneNumber: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  role: {
    type: DataTypes.STRING(50),
    defaultValue: 'assistant',
    validate: {
      isIn: [['assistant', 'receptionist', 'nurse', 'manager', 'technician']]
    }
  },
  qualification: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Medical qualifications/diplomas'
  },
  experience: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    comment: 'Years of experience'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'Quick status flag from MariaDB'
  },
  // JSONB for granular permissions
  permissions: {
    type: DataTypes.JSONB,
    defaultValue: {
      canViewAppointments: true,
      canManageAppointments: true,
      canViewPatients: true,
      canEditPatients: false,
      canViewPrescriptions: true,
      canCreatePrescriptions: false,
      canViewBilling: true,
      canManageBilling: false,
      canAccessReports: false
    },
    comment: 'Granular permissions for assistant actions'
  },
  status: {
    type: DataTypes.STRING(50),
    defaultValue: 'active',
    validate: {
      isIn: [['active', 'inactive', 'suspended', 'terminated']]
    }
  },
  isVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  // JSONB for additional metadata
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional data: {workHours, departments, certifications, notes}'
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'doctor_assistants',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['email']
    },
    {
      fields: ['doctorId']
    },
    {
      fields: ['phoneNumber']
    },
    {
      fields: ['status']
    },
    {
      fields: ['role']
    },
    {
      using: 'gin',
      fields: ['permissions'],
      name: 'idx_assistants_permissions_gin'
    },
    {
      using: 'gin',
      fields: ['metadata'],
      name: 'idx_assistants_metadata_gin'
    }
  ],
  hooks: {
    beforeCreate: async (assistant) => {
      // Generate unique ID if not set
      if (!assistant.unique_id) {
        assistant.unique_id = generateUniqueId('assistant');
      }
      
      if (assistant.password) {
        assistant.password = await bcrypt.hash(assistant.password, 10);
      }
      if (assistant.email) {
        assistant.email = assistant.email.toLowerCase();
      }
    },
    beforeUpdate: async (assistant) => {
      if (assistant.changed('password')) {
        assistant.password = await bcrypt.hash(assistant.password, 10);
      }
      if (assistant.changed('email')) {
        assistant.email = assistant.email.toLowerCase();
      }
    }
  }
});

// Instance methods
DoctorAssistant.prototype.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

DoctorAssistant.prototype.generateAuthToken = function() {
  const payload = {
    id: this.id,
    email: this.email,
    role: 'assistant',
    doctorId: this.doctorId,
    permissions: this.permissions,
    isVerified: this.isVerified
  };
  
  return jwt.sign(payload, JWT_CONFIG.SECRET || 'mediczy-secret-key', {
    expiresIn: '7d'
  });
};

DoctorAssistant.prototype.getFullName = function() {
  return `${this.firstName} ${this.lastName}`;
};

DoctorAssistant.prototype.checkIsActive = function() {
  return this.status === 'active' && this.isVerified && this.isActive;
};

DoctorAssistant.prototype.hasPermission = function(permission) {
  return this.permissions && this.permissions[permission] === true;
};

DoctorAssistant.prototype.toJSON = function() {
  const values = { ...this.get() };
  delete values.password;
  return values;
};

// Static methods
DoctorAssistant.findByEmail = async function(email) {
  return await this.findOne({
    where: { email: email.toLowerCase() }
  });
};

DoctorAssistant.findByDoctor = async function(doctorId) {
  return await this.findAll({
    where: { 
      doctorId,
      status: 'active'
    },
    order: [['role', 'ASC'], ['firstName', 'ASC']]
  });
};

DoctorAssistant.findActiveAssistants = async function() {
  return await this.findAll({
    where: { 
      status: 'active',
      isVerified: true
    },
    order: [['doctorId', 'ASC'], ['role', 'ASC']]
  });
};

export default DoctorAssistant;
