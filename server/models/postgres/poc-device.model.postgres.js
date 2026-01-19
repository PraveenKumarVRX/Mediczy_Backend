import { DataTypes } from 'sequelize';
import { JWT_CONFIG } from '../../config/auth.config.js';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const POCDevice = sequelize.define('POCDevice', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  device_id: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  device_name: { type: DataTypes.STRING(100), allowNull: false },
  
  device_type: { 
    type: DataTypes.ENUM(
      'glucometer', 'bp_monitor', 'pulse_oximeter', 'thermometer', 
      'ecg_device', 'hemoglobin_meter', 'cholesterol_meter', 'urine_analyzer',
      'pregnancy_test', 'covid_test', 'breath_analyzer'
    ), 
    allowNull: false 
  },
  
  brand: { type: DataTypes.STRING(50) },
  model: { type: DataTypes.STRING(100) },
  serial_number: { type: DataTypes.STRING(100), unique: true },
  ble_mac_address: { type: DataTypes.STRING(17), unique: true },
  
  assigned_to_type: { type: DataTypes.ENUM('doctor', 'nurse', 'health_camp'), allowNull: true },
  assigned_to_id: { type: DataTypes.INTEGER, allowNull: true },
  tenant_id: { type: DataTypes.INTEGER, references: { model: 'tenants', key: 'id' } },
  assigned_date: { type: DataTypes.DATE },
  
  status: { type: DataTypes.ENUM('active', 'inactive', 'maintenance', 'calibration_needed', 'lost'), defaultValue: 'inactive' },
  battery_level: { type: DataTypes.INTEGER },
  last_used: { type: DataTypes.DATE },
  last_calibration: { type: DataTypes.DATE },
  next_calibration: { type: DataTypes.DATE },
  firmware_version: { type: DataTypes.STRING(20) },
  
  usage_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  test_results_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  
  health_camp_id: { type: DataTypes.INTEGER, allowNull: true },
  location: { type: DataTypes.JSONB, defaultValue: {} },
  settings: { type: DataTypes.JSONB, defaultValue: {} },
  calibration_data: { type: DataTypes.JSONB, defaultValue: {} }
}, {
  tableName: 'poc_devices',
  timestamps: true,
  indexes: [
    { fields: ['device_id'], unique: true },
    { fields: ['device_type'] },
    { fields: ['status'] },
    { fields: ['assigned_to_type', 'assigned_to_id'] },
    { fields: ['tenant_id'] },
    { fields: ['health_camp_id'] }
  ]
});

export default POCDevice;
