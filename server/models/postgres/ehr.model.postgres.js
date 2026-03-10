/**
import { JWT_CONFIG } from '../../config/auth.config.js';
 * PostgreSQL EHR (Electronic Health Record) Model
 * Primary database model
 *
 * PostgreSQL-Specific Features:
 * - JSONB for flexible metadata storage
 * - Array types for tags and attachments
 * - Full-text search capabilities
 * - Better indexing for performance
 */

import { DataTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

/**
 * EHR (Electronic Health Record) Model
 * Stores all patient health records in a unified format
 */
const EHRRecord = sequelize.define('EHRRecord', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  patientId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    index: true
  },
  recordType: {
    type: DataTypes.ENUM('prescription', 'lab_result', 'diagnosis', 'vitals', 'procedure', 'note', 'vaccination', 'allergy', 'medication'),
    allowNull: false,
    index: true
  },
  recordDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    index: true
  },
  sourceId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'ID of the source record (prescription ID, lab result ID, etc.)',
    index: true
  },
  sourceType: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Type of source (prescription, lab, appointment, etc.)',
    index: true
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  summary: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  details: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Full details of the record in JSONB format for advanced querying'
  },
  doctorId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    index: true
  },
  doctorName: {
    type: DataTypes.STRING(200),
    allowNull: true
  },
  facility: {
    type: DataTypes.STRING(200),
    allowNull: true
  },
  attachments: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: [],
    comment: 'Array of attachment objects with metadata'
  },
  status: {
    type: DataTypes.ENUM('active', 'archived', 'deleted'),
    defaultValue: 'active',
    index: true
  },
  confidential: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    index: true
  },
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
    defaultValue: [],
    comment: 'Array of tags for categorization and search'
  },
  searchVector: {
    type: DataTypes.TSVECTOR,
    allowNull: true,
    comment: 'Full-text search vector for title, summary, and details'
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
  tableName: 'ehr_records',
  timestamps: true,
  underscored: false,
  indexes: [
    {
      fields: ['patientId', 'recordType', 'recordDate'],
      name: 'ehr_patient_type_date_idx'
    },
    {
      fields: ['sourceId', 'sourceType'],
      name: 'ehr_source_idx'
    },
    {
      fields: ['doctorId'],
      name: 'ehr_doctor_idx'
    },
    {
      fields: ['status', 'confidential'],
      name: 'ehr_status_confidential_idx'
    },
    {
      using: 'gin',
      fields: ['details'],
      name: 'ehr_details_gin_idx'
    },
    {
      using: 'gin',
      fields: ['tags'],
      name: 'ehr_tags_gin_idx'
    },
    {
      using: 'gin',
      fields: ['searchVector'],
      name: 'ehr_search_vector_idx'
    }
  ]
});

/**
 * Health Diary Model
 * Patient's personal health journal with linked records
 */
const HealthDiary = sequelize.define('HealthDiary', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    index: true
  },
  entryDate: {
    type: DataTypes.DATE,
    allowNull: false,
    index: true,
    comment: 'Precise timestamp: year-month-day-hour-minute-second'
  },
  entryType: {
    type: DataTypes.ENUM('symptom', 'medication', 'mood', 'activity', 'diet', 'sleep', 'vital', 'note', 'prescription', 'consultation', 'lab_test', 'lab_result', 'appointment', 'device_reading', 'ai_consultation', 'diagnosis', 'procedure', 'imaging', 'vaccination', 'allergy', 'insurance_claim'),
    allowNull: false,
    index: true
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  data: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Flexible data storage for entry-specific information'
  },
  linkedRecordId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'ID of linked EHR record or prescription',
    index: true
  },
  linkedRecordType: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Type of linked record',
    index: true
  },
  mood: {
    type: DataTypes.SMALLINT,
    allowNull: true,
    comment: 'Mood rating 1-5',
    validate: {
      min: 1,
      max: 5
    }
  },
  severity: {
    type: DataTypes.SMALLINT,
    allowNull: true,
    comment: 'Severity rating 1-5 for symptoms',
    validate: {
      min: 1,
      max: 5
    }
  },
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
    defaultValue: [],
    comment: 'Array of tags for categorization'
  },
  isPrivate: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    index: true
  },
  searchVector: {
    type: DataTypes.TSVECTOR,
    allowNull: true,
    comment: 'Full-text search vector for title and description'
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
  tableName: 'health_diary',
  timestamps: true,
  underscored: false,
  indexes: [
    {
      fields: ['userId', 'entryDate'],
      name: 'health_diary_user_date_idx'
    },
    {
      fields: ['userId', 'entryType'],
      name: 'health_diary_user_type_idx'
    },
    {
      fields: ['linkedRecordId', 'linkedRecordType'],
      name: 'health_diary_linked_record_idx'
    },
    {
      fields: ['isPrivate'],
      name: 'health_diary_privacy_idx'
    },
    {
      using: 'gin',
      fields: ['data'],
      name: 'health_diary_data_gin_idx'
    },
    {
      using: 'gin',
      fields: ['tags'],
      name: 'health_diary_tags_gin_idx'
    },
    {
      using: 'gin',
      fields: ['searchVector'],
      name: 'health_diary_search_vector_idx'
    }
  ]
});

// Helper to create EHR record from prescription
EHRRecord.createFromPrescription = async (prescription) => {
  return await EHRRecord.create({
    patientId: prescription.patientId,
    recordType: 'prescription',
    recordDate: new Date(),
    sourceId: prescription.id,
    sourceType: 'prescription',
    title: `Prescription - ${prescription.diagnosis || 'Consultation'}`,
    summary: prescription.diagnosis,
    details: {
      prescriptionNumber: prescription.prescriptionId,
      medications: prescription.medications,
      instructions: prescription.instructions,
      labTests: prescription.labTests,
      vitals: prescription.vitals,
      chiefComplaints: prescription.chiefComplaints,
      followUpDate: prescription.followUpDate,
      validityDays: prescription.validityDays
    },
    doctorId: prescription.doctorId,
    doctorName: prescription.doctorName,
    facility: prescription.clinicName,
    status: 'active',
    tags: ['prescription', 'consultation']
  });
};

// Helper to create health diary entry from prescription
HealthDiary.createFromPrescription = async (prescription, ehrRecordId) => {
  const entries = [];

  // Create prescription entry
  entries.push(await HealthDiary.create({
    userId: prescription.patientId,
    entryDate: new Date(),
    entryType: 'prescription',
    title: `New Prescription from Dr. ${prescription.doctorName}`,
    description: prescription.diagnosis,
    data: {
      prescriptionNumber: prescription.prescriptionId,
      medications: prescription.medications,
      doctorName: prescription.doctorName,
      clinicName: prescription.clinicName
    },
    linkedRecordId: ehrRecordId,
    linkedRecordType: 'ehr_record',
    tags: ['prescription', 'doctor-visit']
  }));

  // Create medication entries for each medication
  if (prescription.medications && prescription.medications.length > 0) {
    for (const med of prescription.medications) {
      entries.push(await HealthDiary.create({
        userId: prescription.patientId,
        entryDate: new Date(),
        entryType: 'medication',
        title: `Started: ${med.name}`,
        description: `${med.dosage} - ${med.frequency} for ${med.duration}`,
        data: {
          medicationName: med.name,
          dosage: med.dosage,
          frequency: med.frequency,
          duration: med.duration,
          prescriptionId: prescription.id
        },
        linkedRecordId: prescription.id,
        linkedRecordType: 'prescription',
        tags: ['medication', 'treatment']
      }));
    }
  }

  // Create vitals entry if vitals recorded
  if (prescription.vitals && Object.keys(prescription.vitals).length > 0) {
    entries.push(await HealthDiary.create({
      userId: prescription.patientId,
      entryDate: new Date(),
      entryType: 'vital',
      title: 'Vitals Recorded',
      description: `BP: ${prescription.vitals.bloodPressure || '-'}, Pulse: ${prescription.vitals.pulse || '-'}`,
      data: prescription.vitals,
      linkedRecordId: prescription.id,
      linkedRecordType: 'prescription',
      tags: ['vitals', 'checkup']
    }));
  }

  return entries;
};

export { EHRRecord, HealthDiary };
export default EHRRecord;