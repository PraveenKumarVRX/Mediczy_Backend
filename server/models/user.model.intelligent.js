import { sequelize } from '../db/mariadb.js';
import { DataTypes } from 'sequelize';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

// Define User model
const User = sequelize.define('User', {
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
  dateOfBirth: {
    type: DataTypes.DATE,
    allowNull: true
  },
  gender: {
    type: DataTypes.STRING,
    allowNull: true
  },
  isAdmin: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  isEmailVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  lastLogin: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'users',
  timestamps: true
});

// Add instance method to compare passwords
User.prototype.comparePassword = async function(candidatePassword) {
  if (!this.password) {
    return false;
  }
  return await bcrypt.compare(candidatePassword, this.password);
};

// Wrapper object for consistency with existing code
const userModel = {
  findOne: async (options) => {
    return await User.findOne(options);
  },

  findByPk: async (id, options = {}) => {
    return await User.findByPk(id, options);
  },

  create: async (userData) => {
    return await User.create(userData);
  },

  findAll: async (options = {}) => {
    return await User.findAll(options);
  },

  count: async (options = {}) => {
    return await User.count(options);
  },

  findAndCountAll: async (options = {}) => {
    return await User.findAndCountAll(options);
  },
  
  update: async (values, options) => {
    return await User.update(values, options);
  }
};

// Helper to generate JWT for intelligent DB users
export const generateAuthTokenForUser = (userInstance) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }

  const payload = {
    id: userInstance.id,
    email: userInstance.email,
    role: userInstance.isAdmin ? 'admin' : 'user'
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: '7d'
  });
};

export default userModel;