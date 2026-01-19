/**
import { JWT_CONFIG } from '../../config/auth.config.js';
 * Health Reading Model
 * Time-series data from wearable devices
 */

import { DataTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const HealthReading = sequelize.define('HealthReading', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  // References
  wearable_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'wearables',
      key: 'id'
    }
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  
  // Reading Type
  reading_type: {
    type: DataTypes.ENUM(
      'heart_rate',
      'blood_pressure',
      'spo2',
      'steps',
      'sleep',
      'calories',
      'distance',
      'stress',
      'ecg',
      'temperature',
      'blood_glucose',
      'weight',
      'hydration'
    ),
    allowNull: false
  },
  
  // Reading Data
  value: {
    type: DataTypes.JSONB,
    allowNull: false,
    comment: 'Reading value (varies by type)'
  },
  unit: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: 'Unit of measurement (bpm, mmHg, %, steps, etc.)'
  },
  
  // Timestamp
  recorded_at: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'When the reading was taken by device'
  },
  synced_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'When the reading was synced to server'
  },
  
  // Context
  activity: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Activity during reading (resting, walking, running, sleeping)'
  },
  location: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'GPS coordinates if available'
  },
  
  // Analysis
  is_normal: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    comment: 'Whether reading is within normal range'
  },
  alert_triggered: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Whether this reading triggered an alert'
  },
  alert_severity: {
    type: DataTypes.ENUM('info', 'warning', 'critical'),
    allowNull: true
  },
  
  // Notes
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {}
  }
}, {
  tableName: 'health_readings',
  timestamps: true,
  indexes: [
    {
      fields: ['wearable_id']
    },
    {
      fields: ['user_id']
    },
    {
      fields: ['reading_type']
    },
    {
      fields: ['recorded_at']
    },
    {
      fields: ['user_id', 'reading_type', 'recorded_at']
    },
    {
      fields: ['alert_triggered']
    },
    {
      using: 'GIN',
      fields: ['value']
    }
  ]
});

// Class Methods
HealthReading.getLatestReading = async function(userId, readingType) {
  return await this.findOne({
    where: { user_id: userId, reading_type: readingType },
    order: [['recorded_at', 'DESC']]
  });
};

HealthReading.getReadingsInRange = async function(userId, readingType, startDate, endDate) {
  return await this.findAll({
    where: {
      user_id: userId,
      reading_type: readingType,
      recorded_at: {
        [sequelize.Op.between]: [startDate, endDate]
      }
    },
    order: [['recorded_at', 'ASC']]
  });
};

HealthReading.getAbnormalReadings = async function(userId, days = 7) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  
  return await this.findAll({
    where: {
      user_id: userId,
      is_normal: false,
      recorded_at: {
        [sequelize.Op.gte]: since
      }
    },
    order: [['recorded_at', 'DESC']]
  });
};

export default HealthReading;
