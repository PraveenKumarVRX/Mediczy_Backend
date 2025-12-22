import { DataTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const CorporatePlanSponsorship = sequelize.define('CorporatePlanSponsorship', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  corporateId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Reference to corporate entity'
  },
  planId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'subscription_plans',
      key: 'id'
    },
    onUpdate: 'CASCADE',
    onDelete: 'RESTRICT'
  },
  employeeId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    },
    onUpdate: 'CASCADE',
    onDelete: 'CASCADE',
    comment: 'Specific employee (null = available for any employee)'
  },
  sponsorshipType: {
    type: DataTypes.ENUM('FULL', 'PARTIAL', 'UPGRADE_ONLY'),
    allowNull: false,
    defaultValue: 'FULL',
    comment: 'FULL=corporate pays all, PARTIAL=split, UPGRADE_ONLY=only for upgrades'
  },
  corporateShare: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    defaultValue: 100.00,
    comment: 'Percentage corporate pays (0-100)'
  },
  employeeShare: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    defaultValue: 0.00,
    comment: 'Percentage employee pays (0-100)'
  },
  maxEmployees: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Max employees who can use this sponsorship'
  },
  usedCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Number of employees using this sponsorship'
  },
  startDate: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  endDate: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Sponsorship expiry (null = no expiry)'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  approvalRequired: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'If true, corporate admin must approve'
  },
  autoAssign: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'Auto-assign to all employees'
  },
  department: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Limit to specific department'
  },
  conditions: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Eligibility conditions (tenure, designation, etc.)'
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true
  }
}, {
  tableName: 'corporate_plan_sponsorships',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['corporate_id'] },
    { fields: ['plan_id'] },
    { fields: ['employee_id'] },
    { fields: ['is_active'] },
    { 
      fields: ['corporate_id', 'is_active'],
      name: 'idx_corporate_active_sponsorships'
    }
  ]
});

export default CorporatePlanSponsorship;
