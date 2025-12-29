import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { DataTypes } from 'sequelize';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

// Define User model - NOW USING POSTGRESQL
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
  // PostgreSQL uses 'status' instead of 'isActive'
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'suspended', 'deleted'),
    defaultValue: 'active'
  },
  // PostgreSQL uses 'emailVerified' instead of 'isEmailVerified'
  emailVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  // PostgreSQL uses 'lastLoginAt' instead of 'lastLogin'
  lastLoginAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  // Password reset fields
  passwordResetToken: {
    type: DataTypes.STRING,
    allowNull: true
  },
  passwordResetExpires: {
    type: DataTypes.DATE,
    allowNull: true
  },
  // Corporate employment fields
  employerName: {
    type: DataTypes.STRING(200),
    allowNull: true,
    field: 'employer_name'
  },
  employeeId: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'employee_id'
  },
  corporateId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'corporate_id',
    references: {
      model: 'corporates',
      key: 'id'
    }
  },
  membershipType: {
    type: DataTypes.STRING(50),
    defaultValue: 'individual',
    field: 'membership_type'
  },
  // Primary Doctor (Family Doctor concept)
  primaryDoctorId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'primary_doctor_id',
    references: {
      model: 'doctors',
      key: 'id'
    },
    comment: 'Default family doctor assigned to patient. CMO Dr. Nandita Agarwal (ID: 5) if not specified'
  }
}, {
  tableName: 'users',
  timestamps: true,
  // Virtual getters for backward compatibility
  getterMethods: {
    isActive() {
      return this.status === 'active';
    },
    isEmailVerified() {
      return this.emailVerified;
    },
    lastLogin() {
      return this.lastLoginAt;
    }
  }
});

// Add hooks to hash password before saving
User.beforeCreate(async (user) => {
  if (user.password) {
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(user.password, salt);
  }
});

User.beforeUpdate(async (user) => {
  if (user.changed('password') && user.password) {
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(user.password, salt);
  }
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
// Includes userId and userType for ring-fencing middleware
export const generateAuthTokenForUser = (userInstance) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }

  const payload = {
    id: userInstance.id,
    userId: userInstance.id,  // Explicit userId for ring-fencing
    email: userInstance.email,
    role: userInstance.isAdmin ? 'admin' : 'user',
    userType: userInstance.isAdmin ? 'admin' : 'user',  // userType for ring-fencing
    isAdmin: userInstance.isAdmin || false,
    corporateId: userInstance.corporateId || null
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: '7d'
  });
};

export { User };
export default userModel;