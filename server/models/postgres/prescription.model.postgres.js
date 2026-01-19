/**
import { JWT_CONFIG } from '../../config/auth.config.js';
 * PostgreSQL Prescription Model
 * With JSONB for medications and full-text search
 */

import { DataTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const Prescription = sequelize.define('Prescription', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  // Unique Prescription ID
  prescriptionId: {
    type: DataTypes.STRING(50),
    unique: true,
    allowNull: true
  },
  
  // Multi-Tenant
  organization_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  organization_type: {
    type: DataTypes.ENUM('hospital', 'clinic', 'individual'),
    allowNull: true
  },
  
  // Links
  appointmentId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'appointments',
      key: 'id'
    }
  },
  
  // Patient Information
  patientId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  patientName: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  patientAge: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  patientGender: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  patientPhone: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  
  // Patient Details as JSONB
  patientDetails: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional patient information'
  },
  
  // Doctor Information
  doctorId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'doctors',
      key: 'id'
    }
  },
  doctorName: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  doctorQualifications: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  doctorRegNo: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  
  // Doctor Specialty
  specialty: {
    type: DataTypes.STRING(200),
    allowNull: true,
    comment: 'Doctor specialty/specialization'
  },
  
  // Clinic Information
  clinicName: {
    type: DataTypes.STRING(200),
    defaultValue: 'Mediczy Healthcare'
  },
  clinicAddress: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  clinicPhone: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  clinicEmail: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  
  // Clinic Details as JSONB
  clinicDetails: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Complete clinic information'
  },
  
  // Vitals (PostgreSQL JSONB)
  vitals: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'bloodPressure, pulse, temperature, weight, height, spo2, bmi'
  },
  
  // Chief Complaints as Array
  chiefComplaints: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    comment: 'Main symptoms/complaints'
  },
  
  // Diagnosis
  diagnosis: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  
  // Diagnosis as Array (ICD codes)
  diagnosisCodes: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    comment: 'ICD-10 diagnosis codes'
  },
  
  // Diagnosis Details as JSONB
  diagnosisDetails: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Detailed diagnosis with codes, descriptions, severity'
  },
  
  // Medications (Legacy TEXT)
  medicines: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  
  // Medications as JSONB Array (PostgreSQL native)
  medications: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of medication objects with name, dosage, frequency, duration, instructions'
  },
  
  // Advice
  advice: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  
  // Advice as Array
  adviceList: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    comment: 'Structured advice points'
  },
  
  // Tests Recommended
  tests: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  
  // Tests as JSONB Array
  labTests: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Lab tests with names, urgency, instructions'
  },
  
  // Follow-up
  followUpDate: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  followUpInstructions: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  
  // Follow-up as JSONB
  followUp: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Follow-up details { date, duration, type, instructions }'
  },
  
  // Referrals
  referrals: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Referrals to specialists { specialty, reason, urgency }'
  },
  
  // Allergies as Array
  allergies: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    comment: 'Known allergies'
  },
  
  // Chronic Conditions as Array
  chronicConditions: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    comment: 'Existing chronic conditions'
  },
  
  // Notes
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  
  // Additional Notes as JSONB
  additionalNotes: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Structured notes { private, pharmacy, patient }'
  },
  
  // Digital Signature
  digitalSignature: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Doctor digital signature image URL'
  },
  
  // Status
  status: {
    type: DataTypes.ENUM('draft', 'issued', 'dispensed', 'cancelled'),
    defaultValue: 'issued'
  },
  
  // Validity
  validUntil: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Prescription expiry date'
  },
  
  // Dispensing
  dispensedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  dispensedBy: {
    type: DataTypes.STRING(200),
    allowNull: true,
    comment: 'Pharmacy/pharmacist name'
  },
  
  // Dispensing Details as JSONB
  dispensingDetails: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Pharmacy information, items dispensed, amounts'
  },
  
  // Metadata
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional flexible metadata'
  },
  
  // Full-Text Search
  search_vector: {
    type: DataTypes.TSVECTOR,
    allowNull: true,
    comment: 'Full-text search on diagnosis, medications, advice'
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
  tableName: 'prescriptions',
  timestamps: true,
  
  indexes: [
    { fields: ['prescriptionId'], unique: true },
    { fields: ['patientId'] },
    { fields: ['doctorId'] },
    { fields: ['appointmentId'] },
    { fields: ['organization_id'] },
    { fields: ['status'] },
    { fields: ['createdAt'] },
    
    // JSONB indexes
    {
      name: 'idx_prescriptions_medications',
      using: 'GIN',
      fields: ['medications']
    },
    {
      name: 'idx_prescriptions_vitals',
      using: 'GIN',
      fields: ['vitals']
    },
    {
      name: 'idx_prescriptions_lab_tests',
      using: 'GIN',
      fields: ['labTests']
    },
    {
      name: 'idx_prescriptions_metadata',
      using: 'GIN',
      fields: ['metadata']
    },
    
    // Array indexes
    {
      name: 'idx_prescriptions_diagnosis_codes',
      using: 'GIN',
      fields: ['diagnosisCodes']
    },
    {
      name: 'idx_prescriptions_allergies',
      using: 'GIN',
      fields: ['allergies']
    },
    
    // Full-text search
    {
      name: 'idx_prescriptions_search',
      using: 'GIN',
      fields: ['search_vector']
    },
    
    // Composite indexes
    {
      name: 'idx_prescriptions_patient_date',
      fields: ['patientId', 'createdAt']
    },
    {
      name: 'idx_prescriptions_doctor_date',
      fields: ['doctorId', 'createdAt']
    }
  ],
  
  hooks: {
    beforeCreate: async (prescription) => {
      // Generate prescription ID if not provided
      if (!prescription.prescriptionId) {
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 7).toUpperCase();
        prescription.prescriptionId = `RX-${timestamp}-${random}`;
      }
      
      // Set validity (90 days from creation)
      if (!prescription.validUntil) {
        const validUntil = new Date();
        validUntil.setDate(validUntil.getDate() + 90);
        prescription.validUntil = validUntil;
      }
    }
  }
});

// Static Methods
Prescription.findBySearch = async function(query) {
  return await Prescription.findAll({
    where: sequelize.literal(
      `search_vector @@ plainto_tsquery('english', '${query}')`
    )
  });
};

Prescription.findByPatient = async function(patientId, options = {}) {
  return await Prescription.findAll({
    where: { patientId },
    order: [['createdAt', 'DESC']],
    ...options
  });
};

Prescription.findByMedication = async function(medicationName) {
  return await Prescription.findAll({
    where: sequelize.literal(
      `medications @> '[{"name": "${medicationName}"}]'`
    )
  });
};

export default Prescription;
