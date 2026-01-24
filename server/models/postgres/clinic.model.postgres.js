/**
import { JWT_CONFIG } from '../../config/auth.config.js';
 * PostgreSQL Clinic Model
 * Primary database model
 *
 * PostgreSQL-Specific Features:
 * - JSONB for flexible metadata storage
 * - Array types for specializations and services
 * - Better indexing for performance
 */

import { DataTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const Clinic = sequelize.define('Clinic', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },

  // Basic Information
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  registrationNumber: {
    type: DataTypes.STRING(100),
    unique: true,
    allowNull: false
  },
  clinicType: {
    type: DataTypes.ENUM('general', 'specialty', 'polyclinic', 'daycare'),
    defaultValue: 'general'
  },

  // Contact Information
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  alternatePhone: {
    type: DataTypes.STRING(20)
  },

  // Address
  address: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  city: {
    type: DataTypes.STRING(100),
    allowNull: false,
    index: true
  },
  state: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  pincode: {
    type: DataTypes.STRING(10),
    allowNull: false
  },
  country: {
    type: DataTypes.STRING(100),
    defaultValue: 'India'
  },

  // Location
  latitude: {
    type: DataTypes.DECIMAL(10, 8)
  },
  longitude: {
    type: DataTypes.DECIMAL(11, 8)
  },

  // Facilities
  numberOfRooms: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  hasPharmacy: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  hasLab: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },

  // Specializations - Using PostgreSQL arrays
  specializations: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
    defaultValue: []
  },

  // Services - Using PostgreSQL arrays
  services: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
    defaultValue: []
  },

  // Owner/Doctor Information
  ownerName: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  ownerPhone: {
    type: DataTypes.STRING(20)
  },
  ownerEmail: {
    type: DataTypes.STRING(255)
  },

  // Operating Hours - Using JSONB for flexible structure
  operatingHours: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {}
  },

  // Consultation Fee Range
  minConsultationFee: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  maxConsultationFee: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },

  // Status
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    index: true
  },
  isVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },

  // Rating
  rating: {
    type: DataTypes.DECIMAL(3, 2),
    defaultValue: 0.00,
    validate: {
      min: 0,
      max: 5
    }
  },
  totalReviews: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },

  // Images - Using JSONB for flexible image metadata
  logo: {
    type: DataTypes.STRING(500)
  },
  images: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: []
  },

  // Additional metadata
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {}
  },

  description: {
    type: DataTypes.TEXT
  },

  // Search vector for full-text search
  searchVector: {
    type: DataTypes.TSVECTOR,
    allowNull: true
  },

  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'clinics',
  timestamps: true,
  underscored: false,
  indexes: [
    {
      fields: ['email'],
      unique: true
    },
    {
      fields: ['registrationNumber'],
      unique: true
    },
    {
      fields: ['city', 'isActive'],
      name: 'clinics_city_active_idx'
    },
    {
      fields: ['isActive', 'isVerified'],
      name: 'clinics_status_idx'
    },
    {
      fields: ['rating'],
      name: 'clinics_rating_idx'
    },
    {
      using: 'gin',
      fields: ['specializations'],
      name: 'clinics_specializations_gin_idx'
    },
    {
      using: 'gin',
      fields: ['services'],
      name: 'clinics_services_gin_idx'
    },
    {
      using: 'gin',
      fields: ['operatingHours'],
      name: 'clinics_operating_hours_gin_idx'
    },
    {
      using: 'gin',
      fields: ['metadata'],
      name: 'clinics_metadata_gin_idx'
    },
    {
      using: 'gin',
      fields: ['searchVector'],
      name: 'clinics_search_vector_idx'
    }
  ]
});

export default Clinic;