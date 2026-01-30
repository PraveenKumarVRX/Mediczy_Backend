import { DataTypes } from 'sequelize';
import { JWT_CONFIG } from '../../config/auth.config.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import postgresSequelize from '../../db/postgres-sequelize.js';
import { generateUniqueId } from '../../utils/uniqueIdGenerator.js';

/**
 * Lab Model (PostgreSQL)
 * Represents diagnostic labs and pathology centers
 * 
 * Features:
 * - Authentication with email/password
 * - JWT token generation
 * - JSONB for services and test catalog
 * - Accreditation tracking
 * - Unique 6-char ID (e.g., L4K7NP)
 */

const Lab = postgresSequelize.define('Lab', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  // Unique alphanumeric ID (e.g., L4K7NP)
  unique_id: {
    type: DataTypes.STRING(6),
    unique: true,
    allowNull: true,
    comment: 'Public-facing unique ID with L prefix'
  },
  name: {
    type: DataTypes.STRING(255),
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
    allowNull: false,
    comment: 'Hashed password for lab login'
  },
  phoneNumber: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  alternatePhone: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  // JSONB for flexible address
  address: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Structure: {street, city, state, zipCode, country, coordinates}'
  },
  // JSONB for services/tests offered
  services: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of lab services/tests: [{name, price, duration, category}]'
  },
  // Test catalog
  testCatalog: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Complete test catalog with pricing and specifications'
  },
  accreditation: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'NABL, CAP, ISO certifications'
  },
  accreditationNumber: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  accreditationExpiry: {
    type: DataTypes.DATE,
    allowNull: true
  },
  licenseNumber: {
    type: DataTypes.STRING(100),
    allowNull: true,
    unique: true
  },
  // Operating hours
  operatingHours: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Weekly schedule: {monday: {open, close, is24Hour}}'
  },
  // Facilities
  facilities: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    comment: 'Available facilities: home-collection, urgent, online-reports'
  },
  // Rating
  rating: {
    type: DataTypes.DECIMAL(3, 2),
    defaultValue: 0,
    validate: {
      min: 0,
      max: 5
    }
  },
  totalReviews: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  status: {
    type: DataTypes.STRING(50),
    defaultValue: 'pending',
    validate: {
      isIn: [['pending', 'active', 'inactive', 'suspended', 'rejected']]
    }
  },
  isVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  // Metadata
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional data: partnerships, certifications, specialties'
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
  tableName: 'labs',
  timestamps: true,
  indexes: [
    { unique: true, fields: ['email'] },
    { unique: true, fields: ['unique_id'] },
    { fields: ['phoneNumber'] },
    { fields: ['status'] },
    { fields: ['isVerified'] },
    { fields: ['rating'] },
    { using: 'gin', fields: ['services'], name: 'idx_labs_services_gin' },
    { using: 'gin', fields: ['address'], name: 'idx_labs_address_gin' },
    { using: 'gin', fields: ['testCatalog'], name: 'idx_labs_catalog_gin' }
  ],
  hooks: {
    beforeCreate: async (lab) => {
      if (lab.password) {
        lab.password = await bcrypt.hash(lab.password, 10);
      }
      if (lab.email) {
        lab.email = lab.email.toLowerCase();
      }
      // Generate unique ID if not set
      if (!lab.unique_id) {
        lab.unique_id = generateUniqueId('lab');
      }
    },
    beforeUpdate: async (lab) => {
      if (lab.changed('password')) {
        lab.password = await bcrypt.hash(lab.password, 10);
      }
      if (lab.changed('email')) {
        lab.email = lab.email.toLowerCase();
      }
    }
  }
});

// Instance methods
Lab.prototype.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

Lab.prototype.generateAuthToken = function() {
  const payload = {
    id: this.id,
    email: this.email,
    role: 'lab',
    labName: this.name,
    isVerified: this.isVerified
  };
  
  return jwt.sign(payload, JWT_CONFIG.SECRET, {
    expiresIn: '7d'
  });
};

Lab.prototype.isActive = function() {
  return this.status === 'active' && this.isVerified;
};

Lab.prototype.toJSON = function() {
  const values = { ...this.get() };
  delete values.password;
  return values;
};

// Static methods
Lab.findByEmail = async function(email) {
  return await this.findOne({
    where: { email: email.toLowerCase() }
  });
};

Lab.findActive = async function() {
  return await this.findAll({
    where: {
      status: 'active',
      isVerified: true
    },
    order: [['rating', 'DESC'], ['name', 'ASC']]
  });
};

Lab.findByCity = async function(city) {
  return await this.findAll({
    where: {
      'address.city': city,
      status: 'active',
      isVerified: true
    },
    order: [['rating', 'DESC']]
  });
};

export default Lab;
