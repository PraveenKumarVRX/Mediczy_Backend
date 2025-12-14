import { DataTypes } from 'sequelize';
import { sequelize } from '../db/mariadb.js';

const Prescription = sequelize.define('Prescription', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  // Unique prescription identifier
  prescriptionId: {
    type: DataTypes.STRING(50),
    unique: true,
    allowNull: true  // Allow null initially, hook will generate before save
  },
  
  // Link to appointment
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
    allowNull: true,  // Allow null for manual prescriptions without user link
    references: {
      model: 'users',
      key: 'id'
    },
    field: 'patientId'
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
  
  // Vitals (optional)
  vitals: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {},
    comment: 'bloodPressure, pulse, temperature, weight, height, spo2'
  },
  
  // Medical Information
  chiefComplaints: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  diagnosis: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  
  // Medications - JSON array
  medications: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: [],
    comment: 'Array of {name, composition, dosage, frequency, duration, quantity, instructions}'
  },
  
  // Lab Tests - JSON array
  labTests: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'Array of {testName, urgency, notes}'
  },
  
  // Instructions - JSON array
  instructions: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'Array of instruction strings'
  },
  
  // Follow-up
  followUpDate: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  followUpNotes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  
  // Validity
  validityDays: {
    type: DataTypes.INTEGER,
    defaultValue: 30
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  
  // Status
  status: {
    type: DataTypes.ENUM('draft', 'issued', 'dispensed', 'cancelled', 'expired'),
    defaultValue: 'issued'
  },
  
  // PDF storage
  pdfUrl: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  
  // Digital signature (optional)
  digitalSignature: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  signedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  
  // Pharmacy info (when dispensed)
  dispensedBy: {
    type: DataTypes.STRING(200),
    allowNull: true
  },
  dispensedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  dispensingNotes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  
  // Metadata
  notes: {
    type: DataTypes.TEXT,
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
  tableName: 'prescriptions',
  timestamps: true,
  underscored: false,
  indexes: [
    { fields: ['prescriptionId'], unique: true },
    { fields: ['appointmentId'] },
    { fields: ['patientId'] },
    { fields: ['doctorId'] },
    { fields: ['status'] },
    { fields: ['createdAt'] }
  ]
});

// Helper function to generate prescription ID
Prescription.generatePrescriptionId = () => {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `RX${year}${month}${day}${random}`;
};

// Hooks
Prescription.beforeCreate(async (prescription) => {
  if (!prescription.prescriptionId) {
    prescription.prescriptionId = Prescription.generatePrescriptionId();
  }
  
  // Set expiry date
  if (prescription.validityDays) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + prescription.validityDays);
    prescription.expiresAt = expiresAt;
  }
});

export default Prescription;
