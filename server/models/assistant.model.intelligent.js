import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { DataTypes } from 'sequelize';
import bcrypt from 'bcrypt';
import { hashPasswordIfPlaintext } from '../utils/passwordHashing.js';

// Generate 6-character alphanumeric ID starting with 'A'
const generateAssistantId = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'A'; // Always start with A
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Define Assistant model - NOW USING POSTGRESQL
const Assistant = sequelize.define('Assistant', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  assistantId: {
    type: DataTypes.STRING(10),
    unique: true,
    allowNull: false,
    defaultValue: () => generateAssistantId()
  },
  doctorId: {
    type: DataTypes.INTEGER,
    allowNull: true
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
  experience: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0
  },
  role: {
    type: DataTypes.STRING(50),
    defaultValue: 'assistant'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  status: {
    type: DataTypes.STRING(50),
    defaultValue: 'active'
  },
  isVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  permissions: {
    type: DataTypes.JSONB,
    defaultValue: {}
  }
}, {
  tableName: 'doctor_assistants',
  timestamps: true,
  hooks: {
    beforeCreate: async (assistant) => {
      // Generate assistantId if not provided
      if (!assistant.assistantId) {
        assistant.assistantId = generateAssistantId();
      }
      if (assistant.password) {
        assistant.password = await hashPasswordIfPlaintext(assistant.password, 10);
      }
    },
    beforeUpdate: async (assistant) => {
      if (assistant.changed('password') && assistant.password) {
        assistant.password = await hashPasswordIfPlaintext(assistant.password, 10);
      }
    }
  }
});

// Add instance method to compare passwords
Assistant.prototype.comparePassword = async function(candidatePassword) {
  if (!this.password) {
    return false;
  }
  return await bcrypt.compare(candidatePassword, this.password);
};

// Wrapper object for consistency with existing code
const assistantModel = {
  findOne: async (options) => {
    return await Assistant.findOne(options);
  },
  findByPk: async (id, options = {}) => {
    return await Assistant.findByPk(id, options);
  },
  findAll: async (options = {}) => {
    return await Assistant.findAll(options);
  },
  create: async (data) => {
    return await Assistant.create(data);
  },
  update: async (values, options) => {
    return await Assistant.update(values, options);
  }
};

export default assistantModel;
