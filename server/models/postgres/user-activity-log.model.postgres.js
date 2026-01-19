/**
import { JWT_CONFIG } from '../../config/auth.config.js';
 * User Activity Tracking Model (PostgreSQL)
 * Tracks daily user activities to prevent duplicate coin rewards
 */

import { DataTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const UserActivityLog = sequelize.define('UserActivityLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  
  activityDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    comment: 'Date of activity (YYYY-MM-DD)'
  },
  
  // Activity flags (true if completed and rewarded today)
  dailyLoginRewarded: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  
  stepsGoalReached: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Number of 100-step milestones rewarded today'
  },
  
  healthAssessmentCompleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  
  appointmentBooked: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  
  vitalSignsLogged: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  
  healthDiaryEntry: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  
  medicationLogged: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  
  // Step count for the day
  totalSteps: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  
  // Metadata
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
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
  tableName: 'user_activity_logs',
  timestamps: true,
  
  indexes: [
    { fields: ['userId', 'activityDate'], unique: true },
    { fields: ['activityDate'] }
  ]
});

export default UserActivityLog;
