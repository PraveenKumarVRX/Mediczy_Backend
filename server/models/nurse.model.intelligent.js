import { sequelize } from '../db/mariadb.js';
import { DataTypes } from 'sequelize';
import bcrypt from 'bcrypt';

// Define Nurse model
const Nurse = sequelize.define('Nurse', {
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
  department: {
    type: DataTypes.STRING,
    allowNull: true
  },
  licenseNumber: {
    type: DataTypes.STRING,
    allowNull: true
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'nurses',
  timestamps: true
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
