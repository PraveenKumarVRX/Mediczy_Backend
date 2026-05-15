import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { JWT_CONFIG } from '../config/auth.config.js';
import { DataTypes } from 'sequelize';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

// Define User model - NOW USING POSTGRESQL
const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  uid: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    unique: true,
    allowNull: false,
    comment: 'Public-facing unique identifier (UUID)'
  },
  unique_id: {
    type: DataTypes.STRING(6),
    allowNull: true,
    unique: true,
    comment: 'Human-readable alphanumeric ID (e.g., T12AB3 for team members)'
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
  isTeam: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
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
  },
  // Emergency Triage Credit System - Each user gets 1 free emergency consultation (pay later)
  emergencyTriageCreditsUsed: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'emergency_triage_credits_used',
    comment: 'Number of emergency triage credits used (max 1 free, pay later)'
  },
  emergencyTriageCreditLimit: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    field: 'emergency_triage_credit_limit',
    comment: 'Maximum emergency triage credits allowed (default: 1)'
  },
  emergencyTriagePendingAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'emergency_triage_pending_amount',
    comment: 'Pending amount to be paid for emergency triage consultations'
  },
  // Metadata field for additional user information (JSONB)
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
    comment: 'Additional user metadata including role-specific data, preferences, and flags'
  },
  // Role field for user type
  role: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: 'user',
    comment: 'User role: user, doctor, admin, team, corporate, etc.'
  },
  // Multi-Tenant Fields
  organization_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Organization/Tenant ID for multi-tenant isolation'
  },
  organization_type: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Type of organization user belongs to (clinic, corporate, hospital)'
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Reference to tenant this user belongs to'
  },
  profileImage: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'URL to user profile image (MinIO)'
  },

  // Health & Medical Fields
  bloodType: {
    type: DataTypes.STRING(10),
    allowNull: true
  },
  height: {
    type: DataTypes.DECIMAL(5, 1),
    allowNull: true,
    comment: 'Height in cm'
  },
  weight: {
    type: DataTypes.DECIMAL(5, 1),
    allowNull: true,
    comment: 'Weight in kg'
  },
  allergies: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  medications: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  chronicConditions: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  medicalHistory: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  familyHistory: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Family medical history'
  },
  personalHistory: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Lifestyle history (smoking, alcohol, exercise, diet, etc.)'
  },

  // Google Fit connection
  googleFitConnected: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'googleFitConnected',
    comment: 'Whether user has connected Google Fit'
  },
  googleFitLastSync: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'googleFitLastSync',
    comment: 'Last time Google Fit data was successfully synced'
  },

  // OAuth Social Login fields
  googleId: {
    type: DataTypes.STRING(128),
    allowNull: true,
    unique: true,
    field: 'googleId',
    comment: 'Google OAuth2 provider ID'
  },
  facebookId: {
    type: DataTypes.STRING(128),
    allowNull: true,
    unique: true,
    field: 'facebookId',
    comment: 'Facebook OAuth2 provider ID'
  },
  oauthProvider: {
    type: DataTypes.STRING(32),
    allowNull: true,
    field: 'oauthProvider',
    comment: 'Primary OAuth provider used (google, facebook, etc.)'
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
  if (!JWT_CONFIG.SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }

  // Resolve role: DB role field takes precedence for non-default roles (corporate, team, etc.)
  const dbRole = userInstance.role || userInstance.dataValues?.role;
  const resolvedRole = userInstance.isAdmin ? 'admin'
    : (dbRole && dbRole !== 'user' ? dbRole : 'user');

  const payload = {
    jti: crypto.randomUUID(),
    id: userInstance.id,
    userId: userInstance.id,  // Explicit userId for ring-fencing
    email: userInstance.email,
    role: resolvedRole,
    userType: resolvedRole,  // userType for ring-fencing
    isAdmin: userInstance.isAdmin || false,
    corporateId: userInstance.corporateId || null,
    organization_id: userInstance.organization_id || userInstance.dataValues?.organization_id || null,
    tenant_id: userInstance.tenant_id || userInstance.dataValues?.tenant_id || null
  };

  const token = jwt.sign(payload, JWT_CONFIG.SECRET, {
    expiresIn: '7d'
  });

  return token.replace(/[\r\n]+/g, '');
};

export { User };
export default userModel;
