import { DataTypes } from 'sequelize';
import { JWT_CONFIG } from '../../config/auth.config.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import postgresSequelize from '../../db/postgres-sequelize.js';

/**
 * Ambulance Model (PostgreSQL)
 * Represents ambulance service providers
 * 
 * Features:
 * - Authentication with email/password
 * - JWT token generation
 * - JSONB for equipment and location tracking
 * - Real-time availability
 */

const Ambulance = postgresSequelize.define('Ambulance', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  providerName: {
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
    comment: 'Hashed password for ambulance provider login'
  },
  registrationNumber: {
    type: DataTypes.STRING(100),
    unique: true,
    comment: 'Provider registration number'
  },
  // Vehicle Information
  vehicleNumber: {
    type: DataTypes.STRING(50),
    allowNull: true,
    unique: true
  },
  vehicleType: {
    type: DataTypes.STRING(50),
    defaultValue: 'basic',
    validate: {
      isIn: [['basic', 'advanced', 'air', 'cardiac', 'neonatal', 'mortuary']]
    }
  },
  vehicleModel: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  manufacturingYear: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  // Contact Information
  phone: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  emergencyPhone: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  alternatePhone: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  // Base Location (JSONB)
  baseLocation: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Base address: {street, city, state, zipCode, latitude, longitude}'
  },
  // Current Location for tracking
  currentLocation: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Real-time location: {latitude, longitude, lastUpdated}'
  },
  // Equipment (JSONB array)
  equipment: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Equipment list: [{name, quantity, status}]'
  },
  // Staff details
  driverName: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  driverLicense: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  paramedicName: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  paramedicLicense: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  // Service areas
  serviceAreas: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    comment: 'Cities/areas covered'
  },
  // Pricing
  baseFare: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  perKmCharge: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  // Availability
  isAvailable: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  currentStatus: {
    type: DataTypes.STRING(50),
    defaultValue: 'idle',
    validate: {
      isIn: [['idle', 'on-call', 'en-route', 'at-scene', 'transporting', 'at-hospital', 'maintenance']]
    }
  },
  // Certifications
  certifications: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Certifications: [{name, number, expiry}]'
  },
  // Insurance
  insuranceProvider: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  insuranceNumber: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  insuranceExpiry: {
    type: DataTypes.DATE,
    allowNull: true
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
  totalTrips: {
    type: DataTypes.INTEGER,
    defaultValue: 0
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
    comment: 'Additional data: response time, hospital partnerships'
  },

  // === FIELDS ADDED VIA SQL MIGRATIONS ===
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
  tableName: 'ambulances',
  timestamps: true,
  indexes: [
    { unique: true, fields: ['email'] },
    { unique: true, fields: ['vehicleNumber'] },
    { fields: ['phone'] },
    { fields: ['status'] },
    { fields: ['isVerified'] },
    { fields: ['isAvailable'] },
    { fields: ['currentStatus'] },
    { fields: ['vehicleType'] },
    { using: 'gin', fields: ['baseLocation'], name: 'idx_ambulances_base_location_gin' },
    { using: 'gin', fields: ['currentLocation'], name: 'idx_ambulances_current_location_gin' },
    { using: 'gin', fields: ['equipment'], name: 'idx_ambulances_equipment_gin' }
  ],
  hooks: {
    beforeCreate: async (ambulance) => {
      if (ambulance.password) {
        ambulance.password = await bcrypt.hash(ambulance.password, 10);
      }
      if (ambulance.email) {
        ambulance.email = ambulance.email.toLowerCase();
      }
    },
    beforeUpdate: async (ambulance) => {
      if (ambulance.changed('password')) {
        ambulance.password = await bcrypt.hash(ambulance.password, 10);
      }
      if (ambulance.changed('email')) {
        ambulance.email = ambulance.email.toLowerCase();
      }
    }
  }
});

// Instance methods
Ambulance.prototype.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

Ambulance.prototype.generateAuthToken = function() {
  const payload = {
    id: this.id,
    email: this.email,
    role: 'ambulance',
    providerName: this.providerName,
    vehicleNumber: this.vehicleNumber,
    isVerified: this.isVerified
  };
  
  return jwt.sign(payload, JWT_CONFIG.SECRET, {
    expiresIn: '7d'
  });
};

Ambulance.prototype.isActive = function() {
  return this.status === 'active' && this.isVerified && this.isAvailable;
};

Ambulance.prototype.updateLocation = async function(latitude, longitude) {
  this.currentLocation = {
    latitude,
    longitude,
    lastUpdated: new Date()
  };
  return await this.save();
};

Ambulance.prototype.toJSON = function() {
  const values = { ...this.get() };
  delete values.password;
  return values;
};

// Static methods
Ambulance.findByEmail = async function(email) {
  return await this.findOne({
    where: { email: email.toLowerCase() }
  });
};

Ambulance.findAvailable = async function(vehicleType = null) {
  const where = {
    status: 'active',
    isVerified: true,
    isAvailable: true,
    currentStatus: 'idle'
  };
  
  if (vehicleType) {
    where.vehicleType = vehicleType;
  }
  
  return await this.findAll({
    where,
    order: [['rating', 'DESC']]
  });
};

Ambulance.findNearby = async function(latitude, longitude, radiusKm = 10) {
  // This would use PostGIS for actual distance calculation
  // For now, return all available ambulances
  return await this.findAvailable();
};

export default Ambulance;
