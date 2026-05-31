import { DataTypes } from 'sequelize';
import { JWT_CONFIG } from '../../config/auth.config.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import postgresSequelize from '../../db/postgres-sequelize.js';

/**
 * HomecareProvider Model (PostgreSQL)
 * Represents homecare service providers (nurses, physiotherapists, caregivers)
 * 
 * Features:
 * - Authentication with email/password
 * - JWT token generation
 * - JSONB for services and availability
 * - Service area tracking
 */

const HomecareProvider = postgresSequelize.define('HomecareProvider', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
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
    comment: 'Hashed password for homecare provider login'
  },
  registrationNumber: {
    type: DataTypes.STRING(100),
    unique: true,
    comment: 'Professional registration number'
  },
  providerType: {
    type: DataTypes.STRING(50),
    defaultValue: 'agency',
    validate: {
      isIn: [['individual', 'agency', 'organization']]
    }
  },
  // Contact Information
  phone: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  alternatePhone: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  // Address (JSONB)
  address: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Office address: {street, city, state, zipCode, country, coordinates}'
  },
  // Service Areas
  serviceAreas: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Areas covered: [{city, localities: [], radius}]'
  },
  // Services Offered (JSONB array)
  services: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Services: [{type, name, price, duration, description}]'
  },
  // Service categories
  providesNursing: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  providesPhysiotherapy: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  providesElderCare: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  providesBabyCare: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  providesPostSurgicalCare: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  providesMedicalEquipment: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  // Staff details
  staffCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  qualifiedNurses: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  qualifiedPhysiotherapists: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  qualifiedCaregivers: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  // Certifications
  certifications: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Certifications: [{name, authority, number, expiry}]'
  },
  // Operating details
  operatingHours: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Weekly schedule'
  },
  is24x7: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  emergencyServices: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  // Pricing
  minimumBookingHours: {
    type: DataTypes.INTEGER,
    defaultValue: 4
  },
  hourlyRate: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  dailyRate: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  monthlyRate: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  // Equipment available
  equipmentAvailable: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Equipment: [{name, quantity, rentPerDay}]'
  },
  // Insurance
  insuranceAccepted: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    comment: 'Insurance providers accepted'
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
  totalBookings: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  totalReviews: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  // Availability
  isAvailable: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
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
    comment: 'Additional data: languages, specializations, awards'
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
  tableName: 'homecare_providers',
  timestamps: true,
  indexes: [
    { unique: true, fields: ['email'] },
    { fields: ['phone'] },
    { fields: ['status'] },
    { fields: ['isVerified'] },
    { fields: ['isAvailable'] },
    { fields: ['providerType'] },
    { fields: ['is24x7'] },
    { fields: ['rating'] },
    { using: 'gin', fields: ['address'], name: 'idx_homecare_address_gin' },
    { using: 'gin', fields: ['services'], name: 'idx_homecare_services_gin' },
    { using: 'gin', fields: ['serviceAreas'], name: 'idx_homecare_areas_gin' }
  ],
  hooks: {
    beforeCreate: async (provider) => {
      if (provider.password) {
        provider.password = await bcrypt.hash(provider.password, 10);
      }
      if (provider.email) {
        provider.email = provider.email.toLowerCase();
      }
    },
    beforeUpdate: async (provider) => {
      if (provider.changed('password')) {
        provider.password = await bcrypt.hash(provider.password, 10);
      }
      if (provider.changed('email')) {
        provider.email = provider.email.toLowerCase();
      }
    }
  }
});

// Instance methods
HomecareProvider.prototype.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

HomecareProvider.prototype.generateAuthToken = function() {
  const payload = {
    id: this.id,
    email: this.email,
    role: 'homecare',
    providerName: this.name,
    providerType: this.providerType,
    isVerified: this.isVerified
  };
  
  return jwt.sign(payload, JWT_CONFIG.SECRET, {
    expiresIn: process.env.JWT_ACCESS_TTL || '15m'
  });
};

HomecareProvider.prototype.isActive = function() {
  return this.status === 'active' && this.isVerified && this.isAvailable;
};

HomecareProvider.prototype.toJSON = function() {
  const values = { ...this.get() };
  delete values.password;
  return values;
};

// Static methods
HomecareProvider.findByEmail = async function(email) {
  return await this.findOne({
    where: { email: email.toLowerCase() }
  });
};

HomecareProvider.findAvailable = async function(serviceType = null) {
  const where = {
    status: 'active',
    isVerified: true,
    isAvailable: true
  };
  
  if (serviceType) {
    // Map service types to boolean fields
    const serviceMap = {
      nursing: 'providesNursing',
      physiotherapy: 'providesPhysiotherapy',
      eldercare: 'providesElderCare',
      babycare: 'providesBabyCare',
      postsurgical: 'providesPostSurgicalCare'
    };
    
    if (serviceMap[serviceType]) {
      where[serviceMap[serviceType]] = true;
    }
  }
  
  return await this.findAll({
    where,
    order: [['rating', 'DESC'], ['name', 'ASC']]
  });
};

HomecareProvider.find24x7 = async function() {
  return await this.findAll({
    where: {
      status: 'active',
      isVerified: true,
      is24x7: true
    },
    order: [['rating', 'DESC']]
  });
};

export default HomecareProvider;
