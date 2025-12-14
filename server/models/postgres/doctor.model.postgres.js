/**
 * PostgreSQL Doctor Model
 * Enhanced with PostgreSQL-specific features
 */

import { DataTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const Doctor = sequelize.define('Doctor', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  // Multi-Tenant Fields
  organization_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Organization ID (hospital/clinic)'
  },
  organization_type: {
    type: DataTypes.ENUM('hospital', 'clinic', 'individual'),
    allowNull: true,
    defaultValue: 'individual'
  },
  
  // Basic Information
  prefix: {
    type: DataTypes.ENUM('Dr', 'Mr', 'Ms', 'Mrs', 'Prof'),
    defaultValue: 'Dr',
    allowNull: false
  },
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
  phoneNumber: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  profileImage: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  
  // Professional Information
  specialization: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  
  // Specializations as Array (PostgreSQL native)
  specializations: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    comment: 'Multiple specializations supported'
  },
  
  qualification: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  
  // Qualifications as Array
  qualifications: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    comment: 'Array of degrees/certifications (MBBS, MD, etc.)'
  },
  
  experience: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Years of experience'
  },
  registrationNumber: {
    type: DataTypes.STRING(100),
    allowNull: true,
    unique: true
  },
  
  // Clinic/Practice Information
  clinicAddress: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  
  // Clinic Address as JSONB
  clinicAddress_json: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Full clinic address in structured format'
  },
  
  consultationFees: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  
  // Fee Structure as JSONB
  feeStructure: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Detailed fee structure { online: 500, inPerson: 800, followUp: 300 }'
  },
  
  // Availability
  availableSlots: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Legacy text field for compatibility'
  },
  
  // Weekly Schedule as JSONB (PostgreSQL structured data)
  weeklySchedule: {
    type: DataTypes.JSONB,
    defaultValue: {
      monday: {
        isOff: false,
        online: { enabled: true, startTime: '09:00', endTime: '13:00' },
        inPerson: { enabled: true, startTime: '14:00', endTime: '18:00' }
      },
      tuesday: {
        isOff: false,
        online: { enabled: true, startTime: '09:00', endTime: '13:00' },
        inPerson: { enabled: true, startTime: '14:00', endTime: '18:00' }
      },
      wednesday: {
        isOff: false,
        online: { enabled: true, startTime: '09:00', endTime: '13:00' },
        inPerson: { enabled: true, startTime: '14:00', endTime: '18:00' }
      },
      thursday: {
        isOff: false,
        online: { enabled: true, startTime: '09:00', endTime: '13:00' },
        inPerson: { enabled: true, startTime: '14:00', endTime: '18:00' }
      },
      friday: {
        isOff: false,
        online: { enabled: true, startTime: '09:00', endTime: '13:00' },
        inPerson: { enabled: true, startTime: '14:00', endTime: '18:00' }
      },
      saturday: {
        isOff: false,
        online: { enabled: true, startTime: '09:00', endTime: '13:00' },
        inPerson: { enabled: false, startTime: '', endTime: '' }
      },
      sunday: {
        isOff: true,
        online: { enabled: false, startTime: '', endTime: '' },
        inPerson: { enabled: false, startTime: '', endTime: '' }
      }
    }
  },
  
  // Reviews and Ratings
  reviews: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  
  // Reviews as JSONB Array
  reviews_json: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of review objects with rating, comment, patient, date'
  },
  
  rating: {
    type: DataTypes.DECIMAL(3, 2),
    defaultValue: 0.0,
    validate: {
      min: 0,
      max: 5
    }
  },
  totalReviews: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  
  // Services Offered as Array
  servicesOffered: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    comment: 'Services like consultation, surgery, diagnostics, etc.'
  },
  
  // Languages Spoken as Array
  languages: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: ['English'],
    comment: 'Languages doctor can communicate in'
  },
  
  // Statistics
  totalAppointments: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  completedAppointments: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  cancelledAppointments: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  
  // Professional Settings as JSONB
  professionalSettings: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Settings like appointment duration, break times, etc.'
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
  documentVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  
  // Documents as JSONB
  documents: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Registration certificate, degrees, etc.'
  },
  
  // Status
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'suspended', 'pending'),
    defaultValue: 'pending'
  },
  isOnline: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  
  // Activity
  lastLoginAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  lastActivityAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  
  // Metadata as JSONB
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional flexible metadata'
  },
  
  // Full-Text Search
  search_vector: {
    type: DataTypes.TSVECTOR,
    allowNull: true
  },
  
  // Timestamps
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'doctors',
  timestamps: true,
  
  indexes: [
    { fields: ['email'], unique: true },
    { fields: ['registrationNumber'], unique: true },
    { fields: ['organization_id'] },
    { fields: ['organization_type'] },
    { fields: ['specialization'] },
    { fields: ['status'] },
    { fields: ['isVerified'] },
    
    // JSONB indexes
    {
      name: 'idx_doctors_weekly_schedule',
      using: 'GIN',
      fields: ['weeklySchedule']
    },
    {
      name: 'idx_doctors_reviews',
      using: 'GIN',
      fields: ['reviews_json']
    },
    {
      name: 'idx_doctors_metadata',
      using: 'GIN',
      fields: ['metadata']
    },
    
    // Array indexes
    {
      name: 'idx_doctors_specializations',
      using: 'GIN',
      fields: ['specializations']
    },
    {
      name: 'idx_doctors_languages',
      using: 'GIN',
      fields: ['languages']
    },
    
    // Full-text search
    {
      name: 'idx_doctors_search',
      using: 'GIN',
      fields: ['search_vector']
    },
    
    // Composite indexes
    {
      name: 'idx_doctors_org_status',
      fields: ['organization_id', 'status']
    }
  ],
  
  hooks: {
    beforeCreate: async (doctor) => {
      if (doctor.password) {
        doctor.password = await bcrypt.hash(doctor.password, 10);
      }
    },
    
    beforeUpdate: async (doctor) => {
      if (doctor.changed('password') && doctor.password) {
        doctor.password = await bcrypt.hash(doctor.password, 10);
      }
    }
  }
});

// Instance Methods
Doctor.prototype.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

Doctor.prototype.generateAuthToken = function() {
  if (!process.env.JWT_SECRET) {
    throw new Error('FATAL: JWT_SECRET not configured');
  }
  
  return jwt.sign(
    { 
      id: this.id, 
      email: this.email, 
      role: 'doctor',
      organization_id: this.organization_id
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// Static Methods
Doctor.findBySpecialization = async function(specialization) {
  return await Doctor.findAll({
    where: sequelize.literal(
      `'${specialization}' = ANY(specializations)`
    )
  });
};

Doctor.findBySearch = async function(query) {
  return await Doctor.findAll({
    where: sequelize.literal(
      `search_vector @@ plainto_tsquery('english', '${query}')`
    )
  });
};

export default Doctor;
