/**
 * Wearable Device Model
 * Health monitoring devices (smartwatch, smart band, smart ring)
 * Provided as part of subscription to users
 */

import { DataTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const Wearable = sequelize.define('Wearable', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  // Device Identity
  device_id: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    comment: 'Unique wearable identifier (MAC address or serial)'
  },
  device_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Device model name (e.g., Mediczy Band Pro)'
  },
  
  // Device Type
  type: {
    type: DataTypes.ENUM('smartwatch', 'smartband', 'smartring'),
    allowNull: false,
    comment: 'Type of wearable device'
  },
  brand: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Brand (Mediczy, Fitbit, Apple, Samsung, etc.)'
  },
  model: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Specific model (e.g., Watch Pro 2, Band 7, Ring Gen3)'
  },
  
  // Hardware Specs
  mac_address: {
    type: DataTypes.STRING(17),
    allowNull: true,
    unique: true,
    comment: 'Bluetooth MAC address'
  },
  serial_number: {
    type: DataTypes.STRING(50),
    allowNull: true,
    unique: true
  },
  firmware_version: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  battery_capacity: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Battery capacity in mAh'
  },
  
  // User Assignment
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    },
    comment: 'Assigned to which user'
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'tenants',
      key: 'id'
    },
    comment: 'Corporate/Organization providing the device'
  },
  assigned_date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  
  // Subscription Info
  subscription_type: {
    type: DataTypes.ENUM('free', 'basic', 'premium', 'corporate'),
    allowNull: false,
    defaultValue: 'free',
    comment: 'Subscription tier'
  },
  subscription_start: {
    type: DataTypes.DATE,
    allowNull: true
  },
  subscription_end: {
    type: DataTypes.DATE,
    allowNull: true
  },
  is_active_subscription: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  
  // Device Status
  status: {
    type: DataTypes.ENUM('available', 'assigned', 'active', 'inactive', 'lost', 'damaged', 'returned'),
    allowNull: false,
    defaultValue: 'available'
  },
  battery_level: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Current battery percentage (0-100)'
  },
  last_sync: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Last time device synced data'
  },
  is_charging: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  
  // Health Monitoring Features
  features: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {
      heart_rate: true,
      blood_pressure: false,
      spo2: true,
      steps: true,
      sleep_tracking: true,
      calories: true,
      distance: true,
      stress_monitoring: false,
      ecg: false,
      temperature: false,
      blood_glucose: false,
      fall_detection: false,
      emergency_sos: false
    },
    comment: 'Available health monitoring features'
  },
  
  // Current Health Metrics (Latest Reading)
  current_metrics: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
    comment: 'Latest health readings from device'
  },
  
  // Settings & Configuration
  settings: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {
      notification_enabled: true,
      auto_sync: true,
      sync_interval: 15, // minutes
      heart_rate_monitoring: 'continuous',
      sleep_detection: 'auto',
      step_goal: 10000,
      calorie_goal: 2000,
      water_reminder: true,
      sedentary_reminder: true
    },
    comment: 'User preferences and device settings'
  },
  
  // Connectivity
  connectivity: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {
      bluetooth: true,
      wifi: false,
      cellular: false,
      gps: false
    }
  },
  paired_device: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Paired smartphone or device'
  },
  
  // Usage Statistics
  total_syncs: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  total_days_worn: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  avg_daily_wear_hours: {
    type: DataTypes.DECIMAL(4, 2),
    allowNull: true
  },
  
  // Warranty & Support
  purchase_date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  warranty_expiry: {
    type: DataTypes.DATE,
    allowNull: true
  },
  last_service_date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  
  // Alerts & Notifications
  alerts: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {
      low_battery: true,
      sync_failed: true,
      abnormal_heart_rate: true,
      inactivity: true
    }
  },
  
  // Notes & Metadata
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
  tableName: 'wearables',
  timestamps: true,
  indexes: [
    {
      fields: ['device_id'],
      unique: true
    },
    {
      fields: ['mac_address'],
      unique: true
    },
    {
      fields: ['serial_number'],
      unique: true
    },
    {
      fields: ['user_id']
    },
    {
      fields: ['tenant_id']
    },
    {
      fields: ['type']
    },
    {
      fields: ['status']
    },
    {
      fields: ['subscription_type']
    },
    {
      using: 'GIN',
      fields: ['features']
    },
    {
      using: 'GIN',
      fields: ['current_metrics']
    }
  ]
});

// Instance Methods
Wearable.prototype.isSubscriptionActive = function() {
  if (!this.subscription_end) return false;
  return new Date() < new Date(this.subscription_end);
};

Wearable.prototype.needsCharging = function() {
  return this.battery_level !== null && this.battery_level < 20;
};

Wearable.prototype.isOnline = function() {
  if (!this.last_sync) return false;
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  return new Date(this.last_sync) > thirtyMinutesAgo;
};

Wearable.prototype.getDaysUntilWarrantyExpiry = function() {
  if (!this.warranty_expiry) return null;
  const diff = new Date(this.warranty_expiry) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

Wearable.prototype.recordSync = async function() {
  this.total_syncs += 1;
  this.last_sync = new Date();
  await this.save();
};

export default Wearable;
