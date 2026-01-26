/**
 * Queue Management Model - Patient Waitlist and Triage
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { DataTypes } from 'sequelize';

const QueueEntry = sequelize.define('QueueEntry', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  // Patient and Appointment
  patientId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  appointmentId: {
    type: DataTypes.INTEGER,
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
  
  // Queue Type
  queueType: {
    type: DataTypes.ENUM('scheduled', 'walk_in', 'urgent', 'emergency', 'follow_up'),
    allowNull: false,
    index: true
  },
  
  // Priority and Triage
  priority: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 3,
    comment: '1=Critical, 2=Urgent, 3=Normal, 4=Low, 5=Scheduled'
  },
  triageLevel: {
    type: DataTypes.ENUM('resuscitation', 'emergent', 'urgent', 'less_urgent', 'non_urgent'),
    comment: 'ESI triage levels'
  },
  triageNotes: {
    type: DataTypes.TEXT
  },
  triageVitals: {
    type: DataTypes.JSONB,
    comment: 'Vitals taken during triage'
  },
  chiefComplaint: {
    type: DataTypes.STRING(500)
  },
  
  // Queue Position
  queuePosition: {
    type: DataTypes.INTEGER,
    index: true
  },
  
  // Timing
  checkInTime: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  scheduledTime: {
    type: DataTypes.DATE
  },
  calledTime: {
    type: DataTypes.DATE
  },
  consultationStartTime: {
    type: DataTypes.DATE
  },
  consultationEndTime: {
    type: DataTypes.DATE
  },
  
  // Wait Time Tracking
  estimatedWaitMinutes: {
    type: DataTypes.INTEGER,
    comment: 'Estimated wait time in minutes'
  },
  actualWaitMinutes: {
    type: DataTypes.INTEGER,
    comment: 'Actual wait time in minutes'
  },
  estimatedConsultationMinutes: {
    type: DataTypes.INTEGER,
    defaultValue: 15
  },
  
  // ETA Calculation
  eta: {
    type: DataTypes.DATE,
    comment: 'Estimated time of consultation start'
  },
  etaUpdatedAt: {
    type: DataTypes.DATE
  },
  
  // Status
  status: {
    type: DataTypes.ENUM(
      'waiting',
      'called',
      'in_consultation',
      'completed',
      'no_show',
      'cancelled',
      'postponed',
      'transferred'
    ),
    defaultValue: 'waiting',
    allowNull: false,
    index: true
  },
  
  // No-show handling
  isNoShow: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  noShowTime: {
    type: DataTypes.DATE
  },
  noShowReason: {
    type: DataTypes.TEXT
  },
  noShowContactAttempts: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  noShowFeeApplied: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  
  // Room Assignment
  roomNumber: {
    type: DataTypes.STRING(50)
  },
  assignedAt: {
    type: DataTypes.DATE
  },
  
  // Staff Assignment
  assignedNurse: {
    type: DataTypes.INTEGER,
    references: {
      model: 'nurses',
      key: 'id'
    }
  },
  assignedMA: {
    type: DataTypes.INTEGER,
    comment: 'Medical Assistant'
  },
  
  // Patient Notifications
  notificationsSent: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of {type, sentAt, method, status}'
  },
  
  // Special Requirements
  requiresInterpreter: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  interpreterLanguage: {
    type: DataTypes.STRING(50)
  },
  wheelchairAccessible: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  specialNeeds: {
    type: DataTypes.TEXT
  },
  
  // Visit Type
  visitType: {
    type: DataTypes.STRING(100),
    comment: 'Initial visit, follow-up, procedure, etc.'
  },
  visitReason: {
    type: DataTypes.TEXT
  },
  
  // Insurance/Payment
  insuranceVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  copayCollected: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  
  // Quality Metrics
  patientSatisfactionScore: {
    type: DataTypes.INTEGER,
    validate: {
      min: 1,
      max: 5
    }
  },
  waitTimeSatisfaction: {
    type: DataTypes.INTEGER,
    validate: {
      min: 1,
      max: 5
    }
  },
  
  // Notes
  internalNotes: {
    type: DataTypes.TEXT,
    comment: 'Staff notes not visible to patient'
  },
  
  // Linked records
  clinicalNoteId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'clinical_notes',
      key: 'id'
    }
  }
}, {
  tableName: 'queue_entries',
  timestamps: true,
  indexes: [
    { fields: ['doctorId', 'status'] },
    { fields: ['queueType', 'status'] },
    { fields: ['priority'] },
    { fields: ['checkInTime'] },
    { fields: ['status', 'priority', 'queuePosition'] }
  ]
});

export default QueueEntry;
