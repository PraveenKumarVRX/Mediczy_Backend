/**
 * Care Plan Model - Patient Care Plans with Tasks and Follow-ups
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { DataTypes } from 'sequelize';

const CarePlan = sequelize.define('CarePlan', {
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
  
  // Plan Details
  title: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT
  },
  
  // Clinical Context
  diagnosis: {
    type: DataTypes.STRING(500)
  },
  icd10Codes: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  
  // Goals
  goals: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of {goal, target, deadline, status}'
  },
  
  // Tasks and Checklists
  tasks: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of {task, assignedTo, dueDate, status, priority, checklist}'
  },
  
  // Medications
  medications: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Active medications in the plan'
  },
  
  // Follow-up Schedule
  followUpSchedule: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of {type, frequency, nextDate, completed}'
  },
  
  // Reminders
  reminders: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of {type, dateTime, message, status, sentAt}'
  },
  
  // Monitoring Parameters
  monitoringParameters: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Vitals/labs to track: {parameter, frequency, targetRange, alerts}'
  },
  
  // Lifestyle Modifications
  lifestyleRecommendations: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Diet, exercise, sleep, stress management'
  },
  
  // Patient Education
  educationMaterials: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Links to educational content'
  },
  
  // Referrals
  referrals: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Specialist referrals needed'
  },
  
  // Status
  status: {
    type: DataTypes.ENUM('active', 'completed', 'cancelled', 'on_hold'),
    defaultValue: 'active',
    index: true
  },
  
  // Dates
  startDate: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  endDate: {
    type: DataTypes.DATEONLY
  },
  nextReviewDate: {
    type: DataTypes.DATEONLY
  },
  
  // Progress Tracking
  completionPercentage: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    validate: {
      min: 0,
      max: 100
    }
  },
  progressNotes: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Timeline of progress updates'
  },
  
  // Barriers and Challenges
  barriers: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Documented barriers to care plan adherence'
  },
  
  // Care Team
  careTeam: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of {role, userId, name, specialty}'
  },
  
  // Alerts and Flags
  alerts: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Active alerts related to this care plan'
  },
  
  // Integration with appointments
  relatedAppointments: {
    type: DataTypes.ARRAY(DataTypes.INTEGER),
    defaultValue: []
  },
  
  // Patient engagement
  patientAcknowledged: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  acknowledgedAt: {
    type: DataTypes.DATE
  },
  patientComments: {
    type: DataTypes.TEXT
  }
}, {
  tableName: 'care_plans',
  timestamps: true,
  indexes: [
    { fields: ['patientId', 'status'] },
    { fields: ['doctorId'] },
    { fields: ['status'] },
    { fields: ['nextReviewDate'] }
  ]
});

export default CarePlan;
