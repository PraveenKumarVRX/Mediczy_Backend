import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { DataTypes } from 'sequelize';
import bcrypt from 'bcrypt';

// Define Assistant model - NOW USING POSTGRESQL
const Assistant = sequelize.define('Assistant', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
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
  timestamps: true
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
