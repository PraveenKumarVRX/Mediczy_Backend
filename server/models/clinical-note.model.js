/**
 * Clinical Note Model - SOAP/ICD-10/CPT Documentation
 * Structured clinical documentation with AI-assisted generation
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { DataTypes } from 'sequelize';

const ClinicalNote = sequelize.define('ClinicalNote', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  appointmentId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'appointments',
      key: 'id'
    }
  },
  doctorId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'doctors',
      key: 'id'
    }
  },
  patientId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  
  // SOAP Format
  subjective: {
    type: DataTypes.TEXT,
    comment: 'Patient reported symptoms, history, concerns'
  },
  objective: {
    type: DataTypes.TEXT,
    comment: 'Physical examination findings, vitals, observations'
  },
  assessment: {
    type: DataTypes.TEXT,
    comment: 'Clinical impression, diagnosis'
  },
  plan: {
    type: DataTypes.TEXT,
    comment: 'Treatment plan, medications, follow-up'
  },
  
  // ICD-10 Diagnosis Codes
  icd10Codes: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of {code, description, isPrimary}'
  },
  
  // CPT Procedure Codes
  cptCodes: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of {code, description, units, modifiers}'
  },
  
  // Auto-generated Summary
  encounterSummary: {
    type: DataTypes.TEXT,
    comment: 'AI-generated concise encounter summary'
  },
  
  // Vitals at time of visit
  vitals: {
    type: DataTypes.JSONB,
    comment: 'BP, HR, temp, SpO2, weight, height, BMI'
  },
  
  // Chief Complaint
  chiefComplaint: {
    type: DataTypes.STRING(500)
  },
  
  // History of Present Illness
  hpi: {
    type: DataTypes.TEXT
  },
  
  // Review of Systems
  reviewOfSystems: {
    type: DataTypes.JSONB,
    comment: 'Structured ROS checklist'
  },
  
  // Physical Examination
  physicalExam: {
    type: DataTypes.JSONB,
    comment: 'Structured PE findings by system'
  },
  
  // Differential Diagnosis
  differentialDiagnosis: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  
  // Prescriptions linked
  prescriptionIds: {
    type: DataTypes.ARRAY(DataTypes.INTEGER),
    defaultValue: []
  },
  
  // Lab orders linked
  labOrderIds: {
    type: DataTypes.ARRAY(DataTypes.INTEGER),
    defaultValue: []
  },
  
  // Imaging orders linked
  imagingOrderIds: {
    type: DataTypes.ARRAY(DataTypes.INTEGER),
    defaultValue: []
  },
  
  // Follow-up plan
  followUp: {
    type: DataTypes.JSONB,
    comment: 'Follow-up timing, instructions, red flags'
  },
  
  // Patient education provided
  patientEducation: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Educational materials provided'
  },
  
  // Clinical templates used
  templateId: {
    type: DataTypes.INTEGER
  },
  
  // Voice/AI transcription
  voiceNoteUrl: {
    type: DataTypes.STRING
  },
  isAiGenerated: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  aiConfidenceScore: {
    type: DataTypes.DECIMAL(3, 2)
  },
  
  // Billing relevance
  billableItems: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Items for billing'
  },
  
  // Status
  status: {
    type: DataTypes.ENUM('draft', 'completed', 'signed', 'amended'),
    defaultValue: 'draft'
  },
  
  // E-signature
  signedAt: {
    type: DataTypes.DATE
  },
  signatureHash: {
    type: DataTypes.STRING
  },
  
  // Amendments/Addendums
  amendmentHistory: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  
  // Quality metrics
  completenessScore: {
    type: DataTypes.INTEGER,
    comment: 'Percentage of required fields completed'
  },
  
  // Time tracking
  encounterDuration: {
    type: DataTypes.INTEGER,
    comment: 'Duration in minutes'
  },
  timeToComplete: {
    type: DataTypes.INTEGER,
    comment: 'Time to complete documentation (minutes)'
  }
}, {
  tableName: 'clinical_notes',
  timestamps: true,
  indexes: [
    { fields: ['appointmentId'] },
    { fields: ['doctorId'] },
    { fields: ['patientId'] },
    { fields: ['status'] },
    { fields: ['createdAt'] }
  ]
});

export default ClinicalNote;
