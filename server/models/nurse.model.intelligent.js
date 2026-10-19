import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { DataTypes } from 'sequelize';
import bcrypt from 'bcrypt';
import { hashPasswordIfPlaintext } from '../utils/passwordHashing.js';

const SALT_ROUNDS = 10;

// Define Nurse model - NOW USING POSTGRESQL
const Nurse = sequelize.define('Nurse', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
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
    unique: true
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  phoneNumber: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  qualification: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  specialization: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  experience: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  licenseNumber: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  tenantId: { type: DataTypes.INTEGER, allowNull: true, field: 'tenant_id' },
  metadata: { type: DataTypes.JSONB, allowNull: true },
  // PostgreSQL uses 'status' instead of 'isActive'
  status: {
    type: DataTypes.STRING(50),
    defaultValue: 'pending'
  },
  isVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  passwordResetToken: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  passwordResetExpires: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'nurses',
  timestamps: true,
  // Virtual getter for backward compatibility
  getterMethods: {
    isActive() {
      return this.status === 'active';
    },
    // Map department to specialization for backward compatibility
    department() {
      return this.specialization;
    }
  },
  hooks: {
    beforeCreate: async (nurse) => {
      if (nurse.password) {
        nurse.password = await hashPasswordIfPlaintext(nurse.password, SALT_ROUNDS);
      }
    },
    beforeUpdate: async (nurse) => {
      if (nurse.changed('password') && nurse.password) {
        nurse.password = await hashPasswordIfPlaintext(nurse.password, SALT_ROUNDS);
      }
    }
  }
});

// Add instance method to compare passwords
Nurse.prototype.comparePassword = async function(candidatePassword) {
  if (!this.password) {
    return false;
  }
  return await bcrypt.compare(candidatePassword, this.password);
};

// Wrapper object for consistency with existing code
const nurseModel = {
  findOne: async (options) => {
    return await Nurse.findOne(options);
  },

  findByPk: async (id, options = {}) => {
    return await Nurse.findByPk(id, options);
  },

  create: async (nurseData) => {
    return await Nurse.create(nurseData);
  },
  
  findAll: async (options = {}) => {
    return await Nurse.findAll(options);
  },
  
  update: async (values, options) => {
    return await Nurse.update(values, options);
  }
};

export default nurseModel;
