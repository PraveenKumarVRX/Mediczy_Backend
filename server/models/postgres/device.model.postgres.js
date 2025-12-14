/**
 * Device Management Model
 * Smart tablet devices provided to healthcare providers
 * Business Model: Device + Software + AMC (Annual Maintenance Contract)
 */

import { DataTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const Device = sequelize.define('Device', {
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
    comment: 'Unique device identifier (IMEI or serial number)'
  },
  device_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Device model name (e.g., Mediczy Tab Pro 10)'
  },
  
  // SIM & Connectivity
  sim_number: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: 'SIM card number for calling capability'
  },
  phone_number: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: 'Device phone number'
  },
  imei: {
    type: DataTypes.STRING(20),
    allowNull: true,
    unique: true
  },
  
  // Assignment
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'tenants',
      key: 'id'
    },
    comment: 'Assigned to which organization'
  },
  assigned_to_type: {
    type: DataTypes.ENUM('hospital', 'clinic', 'lab', 'pharmacy', 'doctor', 'doctor_assistant', 'ambulance', 'homecare'),
    allowNull: true,
    comment: 'Type of entity using the device'
  },
  assigned_to_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'ID of the assigned entity'
  },
  assigned_date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  
  // Device Specifications
  model: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Device model (Tab10, Tab12, TabPro)'
  },
  os_version: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Android version'
  },
  app_version: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Mediczy app version installed'
  },
  
  // Location & Deployment
  location: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
    comment: 'Physical location of device'
  },
  deployment_site: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Deployment location (e.g., Apollo Hospital Chennai - OPD)'
  },
  
  // Status & Health
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'maintenance', 'faulty', 'returned', 'lost'),
    allowNull: false,
    defaultValue: 'inactive'
  },
  battery_level: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Last reported battery percentage'
  },
  last_online: {
    type: DataTypes.DATE,
    allowNull: true
  },
  
  // Business Model - Subscription & AMC
  subscription_plan: {
    type: DataTypes.ENUM('basic', 'standard', 'premium', 'enterprise'),
    allowNull: false,
    defaultValue: 'basic'
  },
  subscription_start: {
    type: DataTypes.DATE,
    allowNull: true
  },
  subscription_end: {
    type: DataTypes.DATE,
    allowNull: true
  },
  amc_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'Annual Maintenance Contract active'
  },
  amc_start_date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  amc_end_date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  amc_renewal_date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  
  // Pricing
  device_cost: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'One-time device cost'
  },
  monthly_software_fee: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Monthly software subscription'
  },
  amc_annual_fee: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Annual maintenance contract fee'
  },
  
  // Features Enabled
  features: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {
      voice_calling: true,
      video_calling: true,
      patient_management: true,
      appointment_booking: true,
      prescriptions: true,
      billing: true,
      inventory: false,
      reports: true,
      offline_mode: false
    },
    comment: 'Enabled features based on subscription'
  },
  
  // Maintenance & Support
  last_maintenance: {
    type: DataTypes.DATE,
    allowNull: true
  },
  next_maintenance: {
    type: DataTypes.DATE,
    allowNull: true
  },
  warranty_expiry: {
    type: DataTypes.DATE,
    allowNull: true
  },
  
  // Configuration
  settings: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
    comment: 'Device-specific settings'
  },
  
  // Tracking
  total_calls_made: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  total_appointments: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  total_prescriptions: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  
  // Notes
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  
  // Metadata
  metadata: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {}
  }
}, {
  tableName: 'devices',
  timestamps: true,
  indexes: [
    {
      fields: ['device_id'],
      unique: true
    },
    {
      fields: ['imei'],
      unique: true
    },
    {
      fields: ['tenant_id']
    },
    {
      fields: ['assigned_to_type', 'assigned_to_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['subscription_plan']
    },
    {
      fields: ['amc_active']
    },
    {
      using: 'GIN',
      fields: ['features']
    },
    {
      using: 'GIN',
      fields: ['location']
    }
  ]
});

// Instance Methods
Device.prototype.isSubscriptionActive = function() {
  if (!this.subscription_end) return false;
  return new Date() < new Date(this.subscription_end);
};

Device.prototype.isAMCActive = function() {
  if (!this.amc_active || !this.amc_end_date) return false;
  return new Date() < new Date(this.amc_end_date);
};

Device.prototype.daysUntilAMCExpiry = function() {
  if (!this.amc_end_date) return null;
  const diff = new Date(this.amc_end_date) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

Device.prototype.needsMaintenance = function() {
  if (!this.next_maintenance) return false;
  return new Date() >= new Date(this.next_maintenance);
};

Device.prototype.calculateMonthlyRevenue = function() {
  let total = this.monthly_software_fee;
  if (this.amc_active) {
    total += (this.amc_annual_fee / 12);
  }
  return total;
};

export default Device;
