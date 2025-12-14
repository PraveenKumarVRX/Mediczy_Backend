import { DataTypes } from 'sequelize';
import { sequelize } from '../db/mariadb.js';

// MembershipPlan defines the template of a plan (admin managed)
const MembershipPlan = sequelize.define('MembershipPlan', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(150), allowNull: false },
  description: { type: DataTypes.TEXT },
  // Duration in days (alternative to explicit dates for template)
  durationDays: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1, max: 3650 } },
  // Benefit limits (numerical) stored as JSON for extensibility
  benefitLimits: {
    type: DataTypes.TEXT,
    get() { const v = this.getDataValue('benefitLimits'); return v ? JSON.parse(v) : {}; },
    set(val) { this.setDataValue('benefitLimits', JSON.stringify(val || {})); }
  },
  // Specialty wise tele-consult caps e.g. { cardiology:5, dermatology:3, allSpecialties: true }
  teleConsultLimits: {
    type: DataTypes.TEXT,
    get() { const v = this.getDataValue('teleConsultLimits'); return v ? JSON.parse(v) : {}; },
    set(val) { this.setDataValue('teleConsultLimits', JSON.stringify(val || {})); }
  },
  // Health check package reference name / code
  healthCheckPackage: { type: DataTypes.STRING(150) },
  priceINR: { type: DataTypes.DECIMAL(10,2), allowNull: false, defaultValue: 0 },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
}, {
  tableName: 'membership_plans', timestamps: true, indexes: [ { fields:['isActive'] } ]
});

// UserPlan is an instance when a user subscribes a membership
const UserPlan = sequelize.define('UserPlan', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  membershipPlanId: { type: DataTypes.INTEGER, allowNull: false },
  startDate: { type: DataTypes.DATEONLY, allowNull: false },
  endDate: { type: DataTypes.DATEONLY, allowNull: false },
  // Track usage counters & monetary usage
  usage: {
    type: DataTypes.TEXT,
    get() { const v = this.getDataValue('usage'); return v ? JSON.parse(v) : {}; },
    set(val) { this.setDataValue('usage', JSON.stringify(val || {})); }
  },
  // Snapshot of limits at subscription time (for historical accuracy if plan changes later)
  appliedLimits: {
    type: DataTypes.TEXT,
    get() { const v = this.getDataValue('appliedLimits'); return v ? JSON.parse(v) : {}; },
    set(val) { this.setDataValue('appliedLimits', JSON.stringify(val || {})); }
  },
  status: { type: DataTypes.ENUM('active','expired','cancelled'), defaultValue: 'active' }
}, { tableName: 'user_plans', timestamps: true, indexes: [ { fields:['userId'] }, { fields:['membershipPlanId'] }, { fields:['status'] } ] });

export { MembershipPlan, UserPlan };
export default MembershipPlan;
