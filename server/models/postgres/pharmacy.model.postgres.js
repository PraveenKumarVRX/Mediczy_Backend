import { DataTypes } from 'sequelize';
import { JWT_CONFIG } from '../../config/auth.config.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import postgresSequelize from '../../db/postgres-sequelize.js';

/**
 * Pharmacy Model (PostgreSQL)
 * Represents pharmacies and medicine stores
 * 
 * Features:
 * - Authentication with email/password
 * - JWT token generation
 * - JSONB for inventory and services
 * - License tracking
 */

const Pharmacy = postgresSequelize.define('Pharmacy', {
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
    comment: 'Hashed password for pharmacy login'
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
  // JSONB for services
  services: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Services: home-delivery, 24x7, cold-storage, emergency'
  },
  licenseNumber: {
    type: DataTypes.STRING(100),
    allowNull: true,
    unique: true,
    comment: 'Drug license number'
  },
  licenseExpiry: {
    type: DataTypes.DATE,
    allowNull: true
  },
  gstNumber: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  // Operating hours
  operatingHours: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Weekly schedule: {monday: {open, close, is24Hour}}'
  },
  is24x7: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  // Inventory categories
  hasGenericMedicines: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  hasSurgicalItems: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  hasBabyProducts: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  hasAyurvedic: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  // Delivery options
  homeDelivery: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  deliveryRadius: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Delivery radius in kilometers'
  },
  minimumOrderAmount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
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
  passwordResetToken: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  passwordResetExpires: {
    type: DataTypes.DATE,
    allowNull: true
  },
  // Metadata
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional data: partnerships, insurance, payment methods'
  },

  // === FIELDS ADDED VIA SQL MIGRATIONS ===
  uniqueId: { type: DataTypes.STRING(20), allowNull: true, field: 'unique_id' },
  aggregatorId: { type: DataTypes.INTEGER, allowNull: true, field: 'aggregator_id' },
  aggregatorType: { type: DataTypes.STRING, allowNull: true, field: 'aggregator_type' },

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
  tableName: 'pharmacies',
  timestamps: true,
  indexes: [
    { unique: true, fields: ['email'] },
    { unique: true, fields: ['licenseNumber'] },
    { fields: ['phoneNumber'] },
    { fields: ['status'] },
    { fields: ['isVerified'] },
    { fields: ['is24x7'] },
    { fields: ['homeDelivery'] },
    { fields: ['rating'] },
    { using: 'gin', fields: ['services'], name: 'idx_pharmacies_services_gin' },
    { using: 'gin', fields: ['address'], name: 'idx_pharmacies_address_gin' }
  ],
  hooks: {
    beforeCreate: async (pharmacy) => {
      if (pharmacy.password) {
        pharmacy.password = await bcrypt.hash(pharmacy.password, 10);
      }
      if (pharmacy.email) {
        pharmacy.email = pharmacy.email.toLowerCase();
      }
    },
    beforeUpdate: async (pharmacy) => {
      if (pharmacy.changed('password')) {
        pharmacy.password = await bcrypt.hash(pharmacy.password, 10);
      }
      if (pharmacy.changed('email')) {
        pharmacy.email = pharmacy.email.toLowerCase();
      }
    }
  }
});

// Instance methods
Pharmacy.prototype.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

Pharmacy.prototype.generateAuthToken = function() {
  const payload = {
    id: this.id,
    email: this.email,
    role: 'pharmacy',
    pharmacyName: this.name,
    isVerified: this.isVerified
  };
  
  return jwt.sign(payload, JWT_CONFIG.SECRET, {
    expiresIn: process.env.JWT_ACCESS_TTL || '15m'
  });
};

Pharmacy.prototype.isActive = function() {
  return this.status === 'active' && this.isVerified;
};

Pharmacy.prototype.toJSON = function() {
  const values = { ...this.get() };
  delete values.password;
  return values;
};

// Static methods
Pharmacy.findByEmail = async function(email) {
  return await this.findOne({
    where: { email: email.toLowerCase() }
  });
};

Pharmacy.findActive = async function() {
  return await this.findAll({
    where: {
      status: 'active',
      isVerified: true
    },
    order: [['rating', 'DESC'], ['name', 'ASC']]
  });
};

Pharmacy.find24x7 = async function() {
  return await this.findAll({
    where: {
      status: 'active',
      isVerified: true,
      is24x7: true
    },
    order: [['rating', 'DESC']]
  });
};

Pharmacy.findWithDelivery = async function() {
  return await this.findAll({
    where: {
      status: 'active',
      isVerified: true,
      homeDelivery: true
    },
    order: [['rating', 'DESC']]
  });
};

export default Pharmacy;
