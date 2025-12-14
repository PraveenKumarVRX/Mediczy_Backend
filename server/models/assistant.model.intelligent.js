import { sequelize } from '../db/mariadb.js';
import { DataTypes } from 'sequelize';
import bcrypt from 'bcrypt';

// Define Assistant model
const Assistant = sequelize.define('Assistant', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  firstName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  lastName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  password: {
    type: DataTypes.STRING,
    allowNull: true
  },
  phoneNumber: {
    type: DataTypes.STRING,
    allowNull: true
  },
  qualification: {
    type: DataTypes.STRING,
    allowNull: true
  },
  experience: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
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
