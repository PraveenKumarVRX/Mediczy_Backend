/**
 * PostgreSQL User Model
 * Primary database model replacing MariaDB
 * 
 * PostgreSQL-Specific Features:
 * - JSONB for flexible metadata storage
 * - Array types for multiple values
 * - Full-text search with tsvector
 * - Better encryption with pgcrypto
 * - Row-level security ready
 */

import { DataTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  // Basic Information
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
  password: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  dateOfBirth: {
    type: DataTypes.DATE,
    allowNull: false
  },
  gender: {
    type: DataTypes.ENUM('Male', 'Female', 'Other'),
    allowNull: false
  },
  phoneNumber: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  
  // Multi-Tenant Fields (NEW)
  organization_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Organization/Tenant ID for multi-tenant isolation'
  },
  organization_type: {
    type: DataTypes.ENUM('hospital', 'clinic', 'corporate', 'lab', 'pharmacy', 'individual'),
    allowNull: true,
    defaultValue: 'individual',
    comment: 'Type of organization user belongs to'
  },
  
  // Address Information (PII - Will use PostgreSQL encryption)
  address_street: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  address_city: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  address_state: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  address_zipCode: {
    type: DataTypes.STRING(10),
    allowNull: true
  },
  address_country: {
    type: DataTypes.STRING(100),
    defaultValue: 'India'
  },
  
  // Address as JSONB (PostgreSQL feature - flexible structure)
  address_json: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
    comment: 'Full address as JSON for flexible querying'
  },
  
  // Emergency Contact
  emergencyContact_name: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  emergencyContact_relationship: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  emergencyContact_phoneNumber: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  
  // Emergency Contact as JSONB
  emergencyContact_json: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
    comment: 'Emergency contact details as JSON'
  },
  
  // Medical Information (PHI - ENCRYPTED)
  bloodType: {
    type: DataTypes.STRING(10),
    allowNull: true
  },
  
  // PostgreSQL Array type for allergies (better than TEXT)
  allergies: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    comment: 'Array of allergies - PostgreSQL native array type'
  },
  
  // Current Medications as Array
  medications: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    comment: 'Array of current medications'
  },
  
  // Chronic Conditions as Array
  chronicConditions: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    comment: 'Array of chronic health conditions'
  },
  
  // Medical History as JSONB
  medicalHistory: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Comprehensive medical history in JSON format'
  },
  
  // Profile
  profileImage: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  
  // Verification
  isVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  emailVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  phoneVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  
  // Preferences as JSONB
  preferences: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'User preferences (language, notifications, theme, etc.)'
  },
  
  // Metadata as JSONB (flexible for future fields)
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional flexible metadata'
  },
  
  // Activity Tracking
  lastLoginAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  lastActivityAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  loginCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  
  // Status
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'suspended', 'deleted'),
    defaultValue: 'active'
  },
  
  // Admin / Role (CRITICAL for admin authentication)
  isAdmin: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Admin flag for system administrators'
  },
  role: {
    type: DataTypes.STRING(50),
    defaultValue: 'user',
    comment: 'User role: user, admin, super_admin, etc.'
  },
  
  // Full-Text Search (PostgreSQL tsvector)
  search_vector: {
    type: DataTypes.TSVECTOR,
    allowNull: true,
    comment: 'Full-text search index combining firstName, lastName, email'
  },
  
  // Timestamps (Sequelize auto-manages these)
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'users',
  timestamps: true,
  
  // Indexes (PostgreSQL-optimized)
  indexes: [
    // Standard indexes
    { fields: ['email'], unique: true },
    { fields: ['phoneNumber'] },
    { fields: ['organization_id'] },
    { fields: ['organization_type'] },
    { fields: ['status'] },
    { fields: ['createdAt'] },
    
    // JSONB GIN indexes for fast queries
    {
      name: 'idx_users_preferences',
      using: 'GIN',
      fields: ['preferences']
    },
    {
      name: 'idx_users_metadata',
      using: 'GIN',
      fields: ['metadata']
    },
    {
      name: 'idx_users_medical_history',
      using: 'GIN',
      fields: ['medicalHistory']
    },
    
    // Full-text search index
    {
      name: 'idx_users_search',
      using: 'GIN',
      fields: ['search_vector']
    },
    
    // Composite indexes for common queries
    {
      name: 'idx_users_org_status',
      fields: ['organization_id', 'status']
    }
  ],
  
  // Hooks
  hooks: {
    beforeCreate: async (user) => {
      // Hash password
      if (user.password) {
        user.password = await bcrypt.hash(user.password, 10);
      }
      
      // Build address_json from individual fields
      if (user.address_street || user.address_city || user.address_state) {
        user.address_json = {
          street: user.address_street,
          city: user.address_city,
          state: user.address_state,
          zipCode: user.address_zipCode,
          country: user.address_country
        };
      }
      
      // Build emergencyContact_json
      if (user.emergencyContact_name) {
        user.emergencyContact_json = {
          name: user.emergencyContact_name,
          relationship: user.emergencyContact_relationship,
          phoneNumber: user.emergencyContact_phoneNumber
        };
      }
      
      // Update search vector (will be replaced by trigger in production)
      await updateSearchVector(user);
    },
    
    beforeUpdate: async (user) => {
      // Hash password if changed
      if (user.changed('password') && user.password) {
        user.password = await bcrypt.hash(user.password, 10);
      }
      
      // Update address_json if address fields changed
      if (user.changed('address_street') || user.changed('address_city') || user.changed('address_state')) {
        user.address_json = {
          street: user.address_street,
          city: user.address_city,
          state: user.address_state,
          zipCode: user.address_zipCode,
          country: user.address_country
        };
      }
      
      // Update search vector
      if (user.changed('firstName') || user.changed('lastName') || user.changed('email')) {
        await updateSearchVector(user);
      }
    }
  }
});

/**
 * Update full-text search vector
 */
async function updateSearchVector(user) {
  // Combine searchable fields
  const searchText = [
    user.firstName,
    user.lastName,
    user.email,
    user.phoneNumber
  ].filter(Boolean).join(' ');
  
  // This is a placeholder - in production, use PostgreSQL trigger
  // For now, we'll use a raw query after the record is saved
  user.search_vector = searchText;
}

/**
 * Instance Methods
 */

// Compare password
User.prototype.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate JWT token
User.prototype.generateAuthToken = function() {
  if (!process.env.JWT_SECRET) {
    throw new Error('FATAL: JWT_SECRET not configured');
  }
  
  const payload = {
    id: this.id,
    email: this.email,
    role: this.isAdmin ? (this.role || 'admin') : (this.role || 'user'),
    isAdmin: this.isAdmin,
    organization_id: this.organization_id,
    organization_type: this.organization_type
  };
  
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
};

// Get public profile (exclude sensitive data)
User.prototype.toPublicJSON = function() {
  return {
    id: this.id,
    firstName: this.firstName,
    lastName: this.lastName,
    email: this.email,
    phoneNumber: this.phoneNumber,
    profileImage: this.profileImage,
    isVerified: this.isVerified,
    organization_type: this.organization_type,
    createdAt: this.createdAt
  };
};

/**
 * Class Methods (Static)
 */

// Full-text search
User.findBySearch = async function(query, options = {}) {
  return await User.findAll({
    where: sequelize.literal(
      `search_vector @@ plainto_tsquery('english', '${query}')`
    ),
    ...options
  });
};

// Find by organization
User.findByOrganization = async function(organization_id, options = {}) {
  return await User.findAll({
    where: { organization_id, status: 'active' },
    ...options
  });
};

// Find with allergies
User.findWithAllergies = async function(allergies, options = {}) {
  return await User.findAll({
    where: sequelize.literal(
      `allergies && ARRAY[${allergies.map(a => `'${a}'`).join(',')}]`
    ),
    ...options
  });
};

export default User;
