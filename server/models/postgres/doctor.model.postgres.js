/**
 * PostgreSQL Doctor Model
 * Enhanced with PostgreSQL-specific features
 */

import { DataTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';
import bcrypt from 'bcrypt';
import { hashPasswordIfPlaintext } from '../../utils/passwordHashing.js';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../../config/auth.config.js';
import { generateUniqueIdForModel } from '../../utils/uniqueIdGenerator.js';

const Doctor = sequelize.define('Doctor', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },

  // UUID for public-facing identifier
  uid: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    unique: true,
    allowNull: false,
    comment: 'Public-facing unique identifier (UUID)'
  },

  // Unique alphanumeric ID (e.g., D4K7NP)
  unique_id: {
    type: DataTypes.STRING(6),
    unique: true,
    allowNull: true,
    comment: 'Public-facing unique ID with D prefix'
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
  tenantId: { type: DataTypes.INTEGER, allowNull: true, field: 'tenant_id' },

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

  // Online consultation fee
  onlineConsultationFee: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    comment: 'Fee for online consultations'
  },

  // In-person consultation fee
  inPersonConsultationFee: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    comment: 'Fee for in-person consultations'
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

  // Slot Duration in minutes (15, 30, 45, or 60)
  slotDuration: {
    type: DataTypes.INTEGER,
    defaultValue: 30,
    validate: {
      isIn: [[15, 30, 45, 60]]
    },
    comment: 'Duration of each appointment slot in minutes'
  },

  // Weekly Availability as JSONB (new format for appointment booking)
  weeklyAvailability: {
    type: DataTypes.JSONB,
    // D-3: this used to default to Mon–Fri 09:00–17:00, which presented invented
    // consulting hours for doctors who had never set a schedule. A new doctor now
    // starts with no availability and must configure it before slots are offered.
    defaultValue: {},
    comment: 'Weekly availability schedule with time slots for appointment booking (no fabricated defaults)'
  },

  // Consultation Types and Fees as JSONB
  consultationTypes: {
    type: DataTypes.JSONB,
    // D-3/D-4: this used to default to online ₹500 / walkIn ₹600 / homeVisit ₹1000.
    // That placeholder was materialised into 1117 of 1118 rows, so patients were
    // quoted an invented price for doctors who never set one. A new doctor now
    // starts with no fees; the fee must be configured before it can be charged
    // (createAppointment already refuses to book when no price can be confirmed).
    // Existing rows are untouched — their provenance is exposed as feeSource.
    defaultValue: {},
    comment: 'Consultation types offered and their respective fees (no fabricated defaults)'
  },

  // Practice Locations as JSONB Array
  practiceLocations: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of practice location objects with id, name, address, consultationFee'
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

  // Password Reset Fields
  passwordResetToken: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  passwordResetExpires: {
    type: DataTypes.DATE,
    allowNull: true
  },

  // Documents as JSONB
  documents: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Registration certificate, degrees, etc.'
  },

  // Document Templates as JSONB Array
  documentTemplates: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of document templates (prescriptions, referrals, certificates)'
  },

  // Template Settings as JSONB
  templateSettings: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Template settings including logo, seal, signature, clinic info'
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

  // === ATTACHED ENTITIES (Pharmacies & Labs) ===
  attachedPharmacies: {
    type: DataTypes.JSONB,
    defaultValue: [],
    field: 'attached_pharmacies',
    comment: 'Array of attached pharmacies for prescription sharing'
  },
  attachedLabs: {
    type: DataTypes.JSONB,
    defaultValue: [],
    field: 'attached_labs',
    comment: 'Array of attached diagnostic labs for test sharing'
  },

  // === SERVICE ENROLLMENT ===
  // Second Opinion Service
  offersSecondOpinion: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'offers_second_opinion',
    comment: 'Doctor offers second opinion consultations'
  },
  secondOpinionFee: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    field: 'second_opinion_fee',
    comment: 'Fee for second opinion consultation'
  },

  // Home Visit Service (Homecare)
  offersHomeVisits: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'offers_home_visits',
    comment: 'Doctor offers home visit consultations'
  },
  homeVisitFee: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    field: 'home_visit_fee',
    comment: 'Fee for home visit consultation'
  },
  homeVisitRadiusKm: {
    type: DataTypes.INTEGER,
    defaultValue: 10,
    field: 'home_visit_radius_km',
    comment: 'Maximum distance doctor will travel for home visits (in km)'
  },

  // Emergency Services
  acceptsEmergencyCalls: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'accepts_emergency_calls',
    comment: 'Doctor is available to accept emergency triage video calls'
  },
  emergencyAvailableUntil: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'emergency_available_until',
    comment: 'Timestamp until which doctor is available for emergency calls'
  },
  emergencyFee: { type: DataTypes.DECIMAL(10, 2), allowNull: true, field: 'emergency_fee' },
  emergencyAvailableFrom: { type: DataTypes.TIME, allowNull: true, field: 'emergency_available_from' },
  emergencyAvailableTo: { type: DataTypes.TIME, allowNull: true, field: 'emergency_available_to' },
  affiliatedOrganizations: { type: DataTypes.JSONB, allowNull: true, defaultValue: [], field: 'affiliated_organizations' },

  // Social Media Links
  socialLinks: {
    type: DataTypes.JSONB,
    defaultValue: {},
    field: 'social_links',
    comment: 'Social media links: { facebook, instagram, youtube }'
  },

  // OAuth / Social Login
  googleId: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'google_id',
    comment: 'Google OAuth2 profile ID'
  },
  facebookId: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'facebook_id',
    comment: 'Facebook OAuth profile ID'
  },
  oauthProvider: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'oauth_provider',
    comment: 'Primary OAuth provider used to create account (google, facebook)'
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
      // Generate unique ID if not set
      if (!doctor.unique_id) {
        doctor.unique_id = await generateUniqueIdForModel(Doctor, 'doctor');
      }

      if (doctor.password) {
        doctor.password = await hashPasswordIfPlaintext(doctor.password, 10);
      }
    },

    beforeUpdate: async (doctor) => {
      if (doctor.changed('password') && doctor.password) {
        doctor.password = await hashPasswordIfPlaintext(doctor.password, 10);
      }
    }
  }
});

// Instance Methods
Doctor.prototype.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate authentication token with userId (doctorId) and userType for ring-fencing
Doctor.prototype.generateAuthToken = function () {
  if (!JWT_CONFIG.SECRET) {
    throw new Error('FATAL: JWT_SECRET not configured');
  }

  return jwt.sign(
    {
      id: this.id,
      doctorId: this.id,  // Explicit doctorId for ring-fencing
      email: this.email,
      role: 'doctor',
      userType: 'doctor',  // userType for ring-fencing middleware
      organization_id: this.organization_id
    },
    JWT_CONFIG.SECRET,
    { expiresIn: process.env.JWT_ACCESS_TTL || '15m' }
  );
};

Doctor.prototype.toJSON = function () {
  const values = { ...this.get() };
  delete values.password;
  delete values.googleId;
  delete values.facebookId;
  delete values.oauthProvider;
  delete values.google_id;
  delete values.facebook_id;
  delete values.oauth_provider;
  return values;
};

// Static Methods
Doctor.findBySpecialization = async function (specialization) {
  return await Doctor.findAll({
    where: sequelize.literal(
      `'${specialization}' = ANY(specializations)`
    )
  });
};

Doctor.findBySearch = async function (query) {
  return await Doctor.findAll({
    where: sequelize.literal(
      `search_vector @@ plainto_tsquery('english', '${query}')`
    )
  });
};

export default Doctor;
