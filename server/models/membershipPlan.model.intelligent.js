import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { DataTypes } from 'sequelize';

// Define MembershipPlan model - NOW USING POSTGRESQL
const MembershipPlanModel = sequelize.define('MembershipPlan', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  code: {
    type: DataTypes.STRING(50),
    unique: true
  },
  description: {
    type: DataTypes.TEXT
  },
  type: {
    type: DataTypes.STRING(50),
    defaultValue: 'individual'
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  discountedPrice: {
    type: DataTypes.DECIMAL(10, 2)
  },
  durationMonths: {
    type: DataTypes.INTEGER,
    defaultValue: 12
  },
  features: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  benefits: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  limitations: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  maxUsers: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  isFeatured: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  sortOrder: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
  }
}, {
  tableName: 'membership_plans',
  timestamps: true
});

// Define UserPlan model
const UserPlanModel = sequelize.define('UserPlan', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  membershipPlanId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  status: {
    type: DataTypes.STRING(50),
    defaultValue: 'active'
  },
  startDate: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  endDate: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  autoRenew: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  paymentId: {
    type: DataTypes.STRING(100)
  },
  paymentMethod: {
    type: DataTypes.STRING(50)
  },
  paidAmount: {
    type: DataTypes.DECIMAL(10, 2)
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
  }
}, {
  tableName: 'user_plans',
  timestamps: true
});

const MembershipPlan = {
  findOne: async (options) => {
    return await MembershipPlanModel.findOne(options);
  },
  findByPk: async (id, options = {}) => {
    return await MembershipPlanModel.findByPk(id, options);
  },
  create: async (planData) => {
    return await MembershipPlanModel.create(planData);
  },
  findAll: async (options = {}) => {
    return await MembershipPlanModel.findAll(options);
  },
  update: async (values, options) => {
    return await MembershipPlanModel.update(values, options);
  },
  destroy: async (options) => {
    return await MembershipPlanModel.destroy(options);
  },
  count: async (options = {}) => {
    return await MembershipPlanModel.count(options);
  }
};

const UserPlan = {
  findOne: async (options) => {
    return await UserPlanModel.findOne(options);
  },
  findByPk: async (id, options = {}) => {
    return await UserPlanModel.findByPk(id, options);
  },
  create: async (userPlanData) => {
    return await UserPlanModel.create(userPlanData);
  },
  findAll: async (options = {}) => {
    return await UserPlanModel.findAll(options);
  },
  update: async (values, options) => {
    return await UserPlanModel.update(values, options);
  },
  destroy: async (options) => {
    return await UserPlanModel.destroy(options);
  },
  count: async (options = {}) => {
    return await UserPlanModel.count(options);
  }
};

export { MembershipPlan, UserPlan };
export default MembershipPlan;