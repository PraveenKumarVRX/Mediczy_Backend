/**
 * Patient Engagement Model - Post-Visit Instructions and Education
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { DataTypes } from 'sequelize';

const PatientEngagement = sequelize.define('PatientEngagement', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  patientId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
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
  appointmentId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'appointments',
      key: 'id'
    }
  },
  
  // Post-Visit Instructions
  instructions: {
    type: DataTypes.TEXT,
    comment: 'Detailed post-visit care instructions'
  },
  instructionsSummary: {
    type: DataTypes.STRING(500),
    comment: 'Brief summary for quick view'
  },
  
  // Medication Instructions
  medicationInstructions: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Detailed medication-specific instructions'
  },
  
  // Activity Restrictions
  activityRestrictions: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'What patient should/shouldn\'t do'
  },
  
  // Diet Instructions
  dietInstructions: {
    type: DataTypes.TEXT
  },
  
  // Warning Signs
  warningSigns: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Red flags requiring immediate attention'
  },
  emergencyContactInfo: {
    type: DataTypes.TEXT
  },
  
  // Follow-up Instructions
  followUpInstructions: {
    type: DataTypes.TEXT
  },
  followUpTimeframe: {
    type: DataTypes.STRING(100),
    comment: 'e.g., "in 2 weeks", "as needed"'
  },
  nextAppointmentDate: {
    type: DataTypes.DATE
  },
  
  // Education Materials
  educationPacks: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of {title, type, url, description, category}'
  },
  
  // Educational Content
  educationTopics: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Topics covered: disease info, prevention, management'
  },
  
  // Videos and Resources
  educationalVideos: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Links to educational videos'
  },
  externalResources: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Links to trusted external resources'
  },
  
  // Patient Understanding
  patientUnderstanding: {
    type: DataTypes.ENUM('poor', 'fair', 'good', 'excellent'),
    comment: 'Provider assessment of patient understanding'
  },
  teachBackCompleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Did patient demonstrate understanding?'
  },
  teachBackNotes: {
    type: DataTypes.TEXT
  },
  
  // Language and Accessibility
  language: {
    type: DataTypes.STRING(10),
    defaultValue: 'en'
  },
  translationProvided: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  accessibilityFormat: {
    type: DataTypes.JSONB,
    comment: 'Large print, audio, braille, etc.'
  },
  
  // Delivery Status
  deliveryStatus: {
    type: DataTypes.ENUM('pending', 'sent', 'delivered', 'viewed', 'acknowledged'),
    defaultValue: 'pending'
  },
  sentAt: {
    type: DataTypes.DATE
  },
  deliveredAt: {
    type: DataTypes.DATE
  },
  viewedAt: {
    type: DataTypes.DATE
  },
  acknowledgedAt: {
    type: DataTypes.DATE
  },
  
  // Delivery Methods
  deliveryMethods: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'email, sms, app, portal, print'
  },
  
  // Patient Feedback
  patientAcknowledged: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  patientQuestions: {
    type: DataTypes.TEXT
  },
  patientComments: {
    type: DataTypes.TEXT
  },
  helpfulnessRating: {
    type: DataTypes.INTEGER,
    validate: {
      min: 1,
      max: 5
    }
  },
  
  // Secure Messaging
  allowMessaging: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  messageThreadId: {
    type: DataTypes.INTEGER,
    comment: 'Link to secure message thread'
  },
  
  // Reminders
  reminders: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of scheduled reminders'
  },
  
  // Compliance Tracking
  complianceCheckpoints: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Milestones to track patient compliance'
  },
  
  // Documents
  documentUrls: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Links to generated PDFs and documents'
  },
  
  // Template Used
  templateId: {
    type: DataTypes.INTEGER
  },
  templateName: {
    type: DataTypes.STRING(200)
  },
  
  // Customization
  isCustomized: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Was template customized for this patient?'
  },
  
  // Priority
  priority: {
    type: DataTypes.ENUM('routine', 'important', 'urgent'),
    defaultValue: 'routine'
  },
  
  // Expiration
  expiresAt: {
    type: DataTypes.DATE,
    comment: 'When these instructions become outdated'
  },
  
  // Version Control
  version: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  previousVersionId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'patient_engagements',
      key: 'id'
    }
  }
}, {
  tableName: 'patient_engagements',
  timestamps: true,
  indexes: [
    { fields: ['patientId'] },
    { fields: ['doctorId'] },
    { fields: ['appointmentId'] },
    { fields: ['deliveryStatus'] },
    { fields: ['sentAt'] }
  ]
});

export default PatientEngagement;
