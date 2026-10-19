import { DataTypes } from 'sequelize';
import { JWT_CONFIG } from '../../config/auth.config.js';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const HealthCamp = sequelize.define('HealthCamp', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  camp_name: { type: DataTypes.STRING(200), allowNull: false },
  camp_type: { 
    type: DataTypes.ENUM('general', 'diabetes', 'cardiac', 'eye', 'dental', 'women_health', 'pediatric', 'vaccination'),
    defaultValue: 'general'
  },
  
  tenant_id: { type: DataTypes.INTEGER, references: { model: 'tenants', key: 'id' } },
  organized_by: { type: DataTypes.STRING(200) },
  
  location: { type: DataTypes.JSONB, allowNull: false },
  address: { type: DataTypes.TEXT },
  
  start_date: { type: DataTypes.DATE, allowNull: false },
  end_date: { type: DataTypes.DATE, allowNull: false },
  start_time: { type: DataTypes.TIME },
  end_time: { type: DataTypes.TIME },
  
  status: { type: DataTypes.ENUM('planned', 'active', 'completed', 'cancelled'), defaultValue: 'planned' },
  
  expected_patients: { type: DataTypes.INTEGER, defaultValue: 0 },
  registered_patients: { type: DataTypes.INTEGER, defaultValue: 0 },
  tested_patients: { type: DataTypes.INTEGER, defaultValue: 0 },
  
  doctors: { type: DataTypes.JSONB, defaultValue: [] },
  nurses: { type: DataTypes.JSONB, defaultValue: [] },
  devices: { type: DataTypes.JSONB, defaultValue: [] },
  
  services_offered: { type: DataTypes.JSONB, defaultValue: [] },
  reports: { type: DataTypes.JSONB, defaultValue: {} },
  notes: { type: DataTypes.TEXT },
  campaign_type: {
    type: DataTypes.ENUM('health_camp', 'cme', 'roundtable', 'rwa_camp', 'corporate_camp', 'other'),
    defaultValue: 'health_camp'
  }
}, {
  tableName: 'health_camps',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['tenant_id'] },
    { fields: ['status'] },
    { fields: ['start_date'] }
  ]
});

export default HealthCamp;
