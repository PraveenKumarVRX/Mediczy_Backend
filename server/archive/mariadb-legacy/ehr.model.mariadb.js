import { DataTypes } from 'sequelize';
import { sequelize } from '../db/mariadb.js';

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
    allowNull: false
  },
  recordType: {
    type: DataTypes.ENUM('prescription', 'lab_result', 'diagnosis', 'vitals', 'procedure', 'note', 'vaccination', 'allergy', 'medication'),
    allowNull: false
  },
  recordDate: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  sourceId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'ID of the source record (prescription ID, lab result ID, etc.)'
  },
  sourceType: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Type of source (prescription, lab, appointment, etc.)'
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
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Full details of the record in JSON format'
  },
  doctorId: {
    type: DataTypes.INTEGER,
    allowNull: true
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
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: []
  },
  status: {
    type: DataTypes.ENUM('active', 'archived', 'deleted'),
    defaultValue: 'active'
  },
  confidential: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
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
  underscored: false
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
    allowNull: false
  },
  entryDate: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  entryType: {
    type: DataTypes.ENUM('symptom', 'medication', 'mood', 'activity', 'diet', 'sleep', 'vital', 'note', 'prescription'),
    allowNull: false
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
    type: DataTypes.JSON,
    allowNull: true
  },
  linkedRecordId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'ID of linked EHR record or prescription'
  },
  linkedRecordType: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Type of linked record'
  },
  mood: {
    type: DataTypes.TINYINT,
    allowNull: true,
    comment: 'Mood rating 1-5'
  },
  severity: {
    type: DataTypes.TINYINT,
    allowNull: true,
    comment: 'Severity rating 1-5 for symptoms'
  },
  tags: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: []
  },
  isPrivate: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
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
  underscored: false
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
      prescriptionNumber: prescription.prescriptionNumber,
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
    status: 'active'
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
      prescriptionNumber: prescription.prescriptionNumber,
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
