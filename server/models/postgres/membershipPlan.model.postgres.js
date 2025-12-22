import { DataTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

/**
 * Membership plans + user subscriptions (PostgreSQL)
 * Mirrors the legacy MariaDB schema but uses JSONB columns so we can
 * attach richer metadata (coverage, features, benefits, etc.).
 */

export const MembershipPlan = sequelize.define('MembershipPlan', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(150),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  planType: {
    type: DataTypes.ENUM('standard', 'premium', 'elite', 'enterprise', 'custom'),
    allowNull: false,
    defaultValue: 'standard',
    field: 'plan_type'
  },
  durationDays: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'duration_days',
    validate: {
      min: 1,
      max: 3650
    }
  },
  priceINR: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'price_inr'
  },
  coverage: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
    comment: 'Coverage summary (sum insured, room rent limits, etc.)'
  },
  features: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
    comment: 'Feature flags for the customer experience'
  },
  benefits: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: [],
    comment: 'Benefit catalog used by the corporate UI'
  },
  benefitLimits: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
    field: 'benefit_limits'
  },
  teleConsultLimits: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
    field: 'tele_consult_limits'
  },
  healthCheckPackage: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
    field: 'health_check_package'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active'
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
    comment: 'Any additional custom data needed for downstream rendering'
  }
}, {
  tableName: 'membership_plans',
  timestamps: true
});

export const UserPlan = sequelize.define('UserPlan', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'user_id'
  },
  membershipPlanId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'membership_plan_id'
  },
  startDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    field: 'start_date'
  },
  endDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    field: 'end_date'
  },
  status: {
    type: DataTypes.ENUM('active', 'expired', 'cancelled'),
    defaultValue: 'active'
  },
  usage: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
    comment: 'Runtime counters (tele-consults consumed, reimbursements, etc.)'
  },
  appliedLimits: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
    field: 'applied_limits'
  }
}, {
  tableName: 'user_plans',
  timestamps: true
});

UserPlan.belongsTo(MembershipPlan, {
  foreignKey: 'membership_plan_id',
  as: 'plan'
});

export default MembershipPlan;
